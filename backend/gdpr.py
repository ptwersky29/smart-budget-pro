"""GDPR compliance: data export, deletion, consent management."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy import select, delete as sa_delete, func

from db import (
    get_session_maker, User, Transaction, MaaserLedger, HolidayBudget,
    ChasunaPlan, InvestmentHolding, ConsentRecord,
)
from auth import get_current_user
from audit import log_action

logger = logging.getLogger("gdpr")


class ConsentIn(BaseModel):
    consent_type: str
    granted: bool = True


def _serialize(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "__dict__"):
        d = {k: v for k, v in obj.__dict__.items() if not k.startswith("_") and not callable(v)}
        return {k: _serialize(v) for k, v in d.items()}
    if isinstance(obj, list):
        return [_serialize(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    return obj


def build_router() -> APIRouter:
    router = APIRouter(prefix="/gdpr", tags=["gdpr"])

    @router.get("/data")
    async def export_data(request: Request, user: dict = Depends(get_current_user)):
        sm = get_session_maker()
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            txs = (await session.execute(select(Transaction).where(Transaction.user_id == user["user_id"]))).scalars().all()
            maaser = (await session.execute(select(MaaserLedger).where(MaaserLedger.user_id == user["user_id"]))).scalars().all()
            hb = (await session.execute(select(HolidayBudget).where(HolidayBudget.user_id == user["user_id"]))).scalars().all()
            cp = (await session.execute(select(ChasunaPlan).where(ChasunaPlan.user_id == user["user_id"]))).scalars().all()
            inv = (await session.execute(select(InvestmentHolding).where(InvestmentHolding.user_id == user["user_id"]))).scalars().all()
            consent = (await session.execute(select(ConsentRecord).where(ConsentRecord.user_id == user["user_id"]).order_by(ConsentRecord.created_at.desc()))).scalars().all()
        data = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "profile": {"email": u.email, "name": u.name, "role": u.role, "created_at": u.created_at.isoformat() if u.created_at else None},
            "transactions": [_serialize(t) for t in txs],
            "maaser_ledger": [_serialize(t) for t in maaser],
            "holiday_budgets": [_serialize(t) for t in hb],
            "chasuna_plans": [_serialize(t) for t in cp],
            "investments": [_serialize(t) for t in inv],
            "consent_records": [_serialize(t) for t in consent],
            "total_items": len(txs) + len(maaser) + len(hb) + len(cp) + len(inv),
        }
        await log_action(user["user_id"], "data_export", "user", user["user_id"], request=request)
        u.data_exported_at = datetime.now(timezone.utc)
        async with sm() as session:
            session.add(u)
            await session.commit()
        return data

    @router.delete("/data")
    async def delete_data(request: Request, user: dict = Depends(get_current_user)):
        sm = get_session_maker()
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            for tbl in [Transaction, MaaserLedger, HolidayBudget, ChasunaPlan, InvestmentHolding]:
                await session.execute(sa_delete(tbl).where(tbl.user_id == user["user_id"]))
            u.email = f"deleted-{user['user_id'][:8]}@anonymized.com"
            u.name = "Deleted User"
            u.picture = None
            u.preferences = {}
            u.data_deleted_at = datetime.now(timezone.utc)
            await session.commit()
        await log_action(user["user_id"], "data_deletion", "user", user["user_id"], request=request)
        return {"status": "deleted", "message": "All personal data has been deleted and account anonymized."}

    @router.post("/consent")
    async def record_consent(payload: ConsentIn, request: Request, user: dict = Depends(get_current_user)):
        if payload.consent_type not in ("terms", "privacy", "marketing", "cookies"):
            raise HTTPException(400, "Invalid consent type. Use: terms, privacy, marketing, cookies")
        sm = get_session_maker()
        async with sm() as session:
            cr = ConsentRecord(user_id=user["user_id"], consent_type=payload.consent_type, granted=payload.granted,
                               ip_address=request.client.host if request.client else None)
            session.add(cr)
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if u and payload.consent_type == "terms":
                u.consent_terms = payload.granted
            elif u and payload.consent_type == "privacy":
                u.consent_privacy = payload.granted
            elif u and payload.consent_type == "marketing":
                u.consent_marketing = payload.granted
            await session.commit()
        await log_action(user["user_id"], f"consent_{payload.consent_type}", "user", user["user_id"],
                         detail={"consent_type": payload.consent_type, "granted": payload.granted}, request=request)
        return {"status": "ok", "consent_type": payload.consent_type, "granted": payload.granted}

    @router.get("/consent")
    async def get_consent(user: dict = Depends(get_current_user)):
        sm = get_session_maker()
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            records = (await session.execute(
                select(ConsentRecord).where(ConsentRecord.user_id == user["user_id"]).order_by(ConsentRecord.created_at.desc()).limit(20)
            )).scalars().all()
            history = {}
            for r in records:
                history.setdefault(r.consent_type, []).append({"granted": r.granted, "at": r.created_at.isoformat() if r.created_at else None})
            return {
                "current": {
                    "terms": u.consent_terms or False,
                    "privacy": u.consent_privacy or False,
                    "marketing": u.consent_marketing or False,
                },
                "history": history,
            }

    @router.get("/health")
    async def gdpr_health():
        return {"status": "ok"}

    return router
