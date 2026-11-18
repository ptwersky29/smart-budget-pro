"""Durable, non-blocking classification queue for Penni transactions.

Requests only enqueue work. The server-side worker processes jobs independently of
any open page, and late results never overwrite edited or approved transactions.
"""
import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError

from auth import get_current_user
from db import ClassificationJob, Transaction
from finance_engine import _suggest_categories_for_tx

logger = logging.getLogger("classification")
ACTIVE = ("queued", "running")
MAX_BATCH = 200
WORKER_CONCURRENCY = 3


class ClassifyBatchIn(BaseModel):
    transaction_ids: list[str] = Field(min_length=1, max_length=MAX_BATCH)


class ClassifyUncategorizedIn(BaseModel):
    date_from: str | None = None
    date_to: str | None = None
    account_id: str | None = None
    search: str | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _snapshot(tx: Transaction) -> dict:
    """Capture the mutable fields which decide whether a classification stays valid."""
    return {
        "description": tx.description or "",
        "merchant": tx.merchant_name or "",
        "amount": round(float(tx.amount or 0), 2),
        "category": tx.category or "",
        "approval": tx.category_approval_status or "",
        "status": tx.approval_status or "",
        "tx_type": tx.tx_type or "",
        "transfer_pair_id": tx.transfer_pair_id or "",
        "updated_at": tx.updated_at.isoformat() if tx.updated_at else "",
    }


def _eligible(tx: Transaction) -> bool:
    return not (tx.tx_type == "transfer" or tx.transfer_pair_id or tx.parent_id)


def _serialize(job: ClassificationJob) -> dict:
    return {
        "job_id": job.job_id,
        "transaction_id": job.transaction_id,
        "status": job.status,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


async def _enqueue(session, user_id: str, ids: list[str]) -> dict:
    unique_ids = list(dict.fromkeys(ids))
    transactions = (
        await session.execute(
            select(Transaction).where(
                Transaction.user_id == user_id,
                Transaction.transaction_id.in_(unique_ids),
            )
        )
    ).scalars().all()
    by_id = {tx.transaction_id: tx for tx in transactions}

    keys = [f"{user_id}:{tx_id}" for tx_id in unique_ids]
    existing = (
        await session.execute(
            select(ClassificationJob).where(
                ClassificationJob.user_id == user_id,
                ClassificationJob.active_key.in_(keys),
            )
        )
    ).scalars().all()
    active = {job.transaction_id: job for job in existing}
    queued = []
    already = []
    skipped = 0

    for tx_id in unique_ids:
        tx = by_id.get(tx_id)
        if tx is None or not _eligible(tx):
            skipped += 1
            continue
        if tx_id in active:
            already.append(active[tx_id])
            continue
        job = ClassificationJob(
            job_id=f"cl_{uuid.uuid4().hex}",
            user_id=user_id,
            transaction_id=tx_id,
            active_key=f"{user_id}:{tx_id}",
            status="queued",
            input_snapshot=_snapshot(tx),
        )
        try:
            # Savepoints make parallel clicks idempotent even with concurrent requests.
            async with session.begin_nested():
                session.add(job)
                await session.flush()
            queued.append(job)
            active[tx_id] = job
        except IntegrityError:
            # A concurrent request has already queued this transaction.
            existing_job = (
                await session.execute(
                    select(ClassificationJob).where(
                        ClassificationJob.active_key == f"{user_id}:{tx_id}"
                    )
                )
            ).scalar_one_or_none()
            if existing_job:
                already.append(existing_job)
            else:
                skipped += 1

    await session.commit()
    return {
        "queued": len(queued),
        "already_queued": len(already),
        "skipped": skipped,
        "jobs": [_serialize(job) for job in queued + already],
    }


def build_router() -> APIRouter:
    router = APIRouter(prefix="/classification", tags=["classification"])

    @router.post("/jobs")
    async def enqueue_jobs(
        payload: ClassifyBatchIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            return await _enqueue(session, user["user_id"], payload.transaction_ids)

    @router.post("/uncategorized")
    async def enqueue_uncategorized(
        payload: ClassifyUncategorizedIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        query = select(Transaction.transaction_id).where(
            Transaction.user_id == user["user_id"],
            or_(
                Transaction.category.is_(None),
                Transaction.category == "",
                Transaction.category == "uncategorized",
            ),
            or_(Transaction.tx_type.is_(None), Transaction.tx_type != "transfer"),
            Transaction.transfer_pair_id.is_(None),
            Transaction.parent_id.is_(None),
            # Skip already-queued transactions so a second click can enqueue
            # the next page of up to 200, even when the first batch is running.
            ~Transaction.transaction_id.in_(
                select(ClassificationJob.transaction_id).where(
                    ClassificationJob.user_id == user["user_id"],
                    ClassificationJob.status.in_(ACTIVE),
                )
            ),
        )
        try:
            if payload.date_from:
                start = date.fromisoformat(payload.date_from)
                query = query.where(Transaction.date >= datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc))
            if payload.date_to:
                end = date.fromisoformat(payload.date_to) + timedelta(days=1)
                query = query.where(Transaction.date < datetime.combine(end, datetime.min.time(), tzinfo=timezone.utc))
        except ValueError:
            raise HTTPException(422, "Invalid date filter")
        if payload.account_id:
            query = query.where(Transaction.account_id == payload.account_id)
        if payload.search and payload.search.strip():
            search = payload.search.strip()[:100]
            query = query.where(or_(
                Transaction.description.ilike(f"%{search}%"),
                Transaction.merchant_name.ilike(f"%{search}%"),
            ))
        query = query.order_by(Transaction.date.desc()).limit(MAX_BATCH)
        sm = request.app.state.db
        async with sm() as session:
            ids = (await session.execute(query)).scalars().all()
            if not ids:
                return {"queued": 0, "already_queued": 0, "skipped": 0, "jobs": []}
            return await _enqueue(session, user["user_id"], ids)

    @router.get("/jobs")
    async def list_jobs(request: Request, user: dict = Depends(get_current_user)):
        cutoff = _utcnow() - timedelta(minutes=20)
        sm = request.app.state.db
        async with sm() as session:
            rows = (
                await session.execute(
                    select(ClassificationJob)
                    .where(
                        ClassificationJob.user_id == user["user_id"],
                        or_(ClassificationJob.status.in_(ACTIVE), ClassificationJob.created_at >= cutoff),
                    )
                    .order_by(ClassificationJob.created_at.desc())
                    .limit(250)
                )
            ).scalars().all()
            return {"jobs": [_serialize(job) for job in rows]}

    return router


async def _recover_stale_jobs(session_maker) -> None:
    # A restart or worker crash must not strand jobs forever.
    cutoff = _utcnow() - timedelta(minutes=2)
    async with session_maker() as session:
        await session.execute(
            update(ClassificationJob)
            .where(ClassificationJob.status == "running", ClassificationJob.started_at < cutoff)
            .values(status="queued", started_at=None)
        )
        await session.commit()


async def _claim_one(session_maker) -> int | None:
    for _ in range(4):
        async with session_maker() as session:
            job_id = (
                await session.execute(
                    select(ClassificationJob.id)
                    .where(ClassificationJob.status == "queued")
                    .order_by(ClassificationJob.created_at.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if job_id is None:
                return None
            claimed = await session.execute(
                update(ClassificationJob)
                .where(ClassificationJob.id == job_id, ClassificationJob.status == "queued")
                .values(status="running", started_at=_utcnow())
            )
            await session.commit()
            if claimed.rowcount == 1:
                return job_id
    return None


async def _finish_job(session, job: ClassificationJob, status: str, result=None, error=None) -> None:
    job.status = status
    job.result = result
    job.error = error[:255] if error else None
    job.active_key = None
    job.completed_at = _utcnow()
    await session.commit()


async def _process_one(session_maker) -> bool:
    job_id = await _claim_one(session_maker)
    if job_id is None:
        return False
    async with session_maker() as session:
        job = await session.get(ClassificationJob, job_id)
        if not job or job.status != "running":
            return True
        try:
            tx = (
                await session.execute(
                    select(Transaction).where(
                        Transaction.transaction_id == job.transaction_id,
                        Transaction.user_id == job.user_id,
                    )
                )
            ).scalar_one_or_none()
            if not tx or not _eligible(tx) or _snapshot(tx) != job.input_snapshot:
                await _finish_job(session, job, "skipped", error="Transaction changed or is no longer available")
                return True

            suggestions = await _suggest_categories_for_tx(
                session, job.user_id, tx.description or "", tx.merchant_name,
                float(tx.amount or 0),
                normalized_merchant=tx.normalized_merchant,
                exclude_transaction_id=tx.transaction_id,
            )

            # Lock the row before applying results. Manual edits happening during
            # the network call win, even if they race with this worker's commit.
            session.expire(tx)
            tx = (
                await session.execute(
                    select(Transaction)
                    .where(Transaction.transaction_id == job.transaction_id,
                           Transaction.user_id == job.user_id)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if not tx or not _eligible(tx) or _snapshot(tx) != job.input_snapshot:
                await _finish_job(session, job, "skipped", error="Transaction changed during classification")
                return True

            # Verified history can apply immediately. AI is a second-stage
            # fallback and may auto-fill only when it reports high confidence;
            # it still requires explicit category approval from the user.
            top = next((
                item for item in suggestions
                if item.get("category") not in ("uncategorized", "miscellaneous")
                and (
                    (item.get("source") in ("history_exact", "history_merchant")
                     and float(item.get("confidence") or 0) >= 0.87)
                    or (item.get("source") == "ai"
                        and float(item.get("confidence") or 0) >= 0.90)
                )
            ), None)
            auto_applied = False
            # Never replace a non-empty user/previously approved category.
            if top and (not tx.category or tx.category == "uncategorized"):
                tx.category = top["category"]
                tx.category_approval_status = "unapproved"
                auto_applied = True
            tx.ai_suggested_categories = {"suggestions": suggestions}
            tx.ai_selected_category = top["category"] if top else None
            tx.ai_confidence = float(top["confidence"]) if top else 0
            tx.ai_reason = top.get("reason") if top else "Review category manually."
            await _finish_job(
                session, job, "completed",
                result={"category": top["category"] if top else None,
                        "source": top.get("source") if top else None,
                        "suggestions": suggestions, "applied": auto_applied,
                        "needs_review": not auto_applied or (top is not None and top.get("source") == "ai")},
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Classification job %s failed", job.job_id)
            await session.rollback()
            job = await session.get(ClassificationJob, job_id)
            if job:
                await _finish_job(session, job, "failed", error="Classification unavailable; retry later")
    return True


async def classification_worker(session_maker) -> None:
    """Small parallel worker; durable queue survives browser navigation and restarts."""
    logger.info("Transaction classification worker started")
    iteration = 0
    while True:
        try:
            if iteration % 60 == 0:
                await _recover_stale_jobs(session_maker)
            results = await asyncio.gather(
                *(_process_one(session_maker) for _ in range(WORKER_CONCURRENCY)),
                return_exceptions=True,
            )
            for result in results:
                if isinstance(result, Exception):
                    logger.error("Classification worker tick failed: %s", result)
            iteration += 1
            await asyncio.sleep(1.0 if any(result is True for result in results) else 3.0)
        except asyncio.CancelledError:
            logger.info("Classification worker stopped")
            raise
        except Exception as exc:
            logger.exception("Classification worker failure: %s", exc)
            await asyncio.sleep(5.0)
