"""Auto-Maaser hook: when a salary/income lands, accrue 10% (configurable) Maaser obligation."""
import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy import select, delete

from db import User, MaaserLedger, Transaction

logger = logging.getLogger("maaser")

INCOME_CATEGORIES = {"salary", "income"}


def _is_income_tx(tx: dict) -> bool:
    if tx.get("approval_status") and tx.get("approval_status") != "approved":
        return False
    if tx.get("exclude_from_maaser"):
        return False
    if tx.get("is_transfer") or tx.get("tx_type") == "transfer":
        return False
    if tx.get("transfer_pair_id"):
        return False
    if tx.get("is_income"):
        return True
    if (tx.get("category") or "").lower() in INCOME_CATEGORIES:
        return True
    if (tx.get("amount") or 0) > 0:
        return True
    return False


async def maybe_accrue(session, user_id: str, tx: dict) -> dict | None:
    if not _is_income_tx(tx):
        if tx.get("transaction_id"):
            await session.execute(
                delete(MaaserLedger).where(
                    MaaserLedger.user_id == user_id,
                    MaaserLedger.transaction_id == tx["transaction_id"],
                )
            )
            await session.commit()
        return None

    result = await session.execute(select(User).where(User.user_id == user_id))
    u = result.scalar_one_or_none()
    prefs = u.preferences or {} if u else {}
    settings = prefs.get("maaser") or {}
    if not settings.get("enabled"):
        return None

    percent = float(settings.get("percent", 10))
    amount = round(abs(float(tx.get("amount", 0))) * percent / 100, 2)
    if amount <= 0:
        return None

    if tx.get("transaction_id"):
        existing = await session.execute(
            select(MaaserLedger).where(
                MaaserLedger.user_id == user_id,
                MaaserLedger.transaction_id == tx["transaction_id"],
            )
        )
        entry = existing.scalar_one_or_none()
        if entry:
            entry.income_amount = abs(float(tx.get("amount", 0)))
            entry.maaser_due = amount
            entry.note = f"Auto-Maaser {percent:.1f}% of {tx.get('description', 'income')}"
            await session.commit()
            await session.refresh(entry)
            return {
                "entry_id": f"tz_{entry.id}",
                "user_id": user_id,
                "amount": amount,
                "recipient": entry.paid_to or "Maaser (pending allocation)",
                "status": "given" if (entry.maaser_paid or 0) > 0 else "pending",
            }

    now = datetime.now(timezone.utc)
    entry = MaaserLedger(
        user_id=user_id,
        transaction_id=tx.get("transaction_id"),
        income_amount=abs(float(tx.get("amount", 0))),
        maaser_due=amount,
        paid_to="Maaser (pending allocation)",
        note=f"Auto-Maaser {percent:.1f}% of {tx.get('description', 'income')}",
        date=now,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return {
        "entry_id": f"tz_{entry.id}",
        "user_id": user_id,
        "amount": amount,
        "recipient": "Maaser (pending allocation)",
        "status": "pending",
    }


async def backfill_for_user(session, user_id: str) -> dict:
    result = await session.execute(select(User).where(User.user_id == user_id))
    u = result.scalar_one_or_none()
    prefs = u.preferences or {} if u else {}
    settings = prefs.get("maaser") or {}
    if not settings.get("enabled"):
        return {"created": 0, "skipped": 0, "total_amount": 0, "enabled": False}

    percent = float(settings.get("percent", 10))
    tx_result = await session.execute(
        select(Transaction).where(Transaction.user_id == user_id)
    )
    txs = tx_result.scalars().all()
    created = 0
    skipped = 0
    total_amount = 0.0
    for t in txs:
        tx_dict = {
            "transaction_id": t.transaction_id,
            "amount": t.amount,
            "category": t.category,
            "description": t.description,
            "is_income": t.amount > 0,
            "exclude_from_maaser": t.exclude_from_maaser,
            "is_transfer": t.tx_type == "transfer",
            "transfer_pair_id": getattr(t, "transfer_pair_id", None),
            "approval_status": getattr(t, "approval_status", "approved"),
        }
        existing = await session.execute(
            select(MaaserLedger).where(
                MaaserLedger.user_id == user_id,
                MaaserLedger.transaction_id == t.transaction_id,
            )
        )
        entry = existing.scalar_one_or_none()
        if not _is_income_tx(tx_dict):
            if entry:
                await session.delete(entry)
                await session.flush()
            continue
        amt = round(abs(float(t.amount)) * percent / 100, 2)
        if entry:
            entry.income_amount = abs(float(t.amount))
            entry.maaser_due = amt
            entry.note = f"Auto-Maaser {percent:.1f}% of {t.description} (backfill)"
            skipped += 1
            await session.flush()
            continue
        if amt <= 0:
            continue
        entry = MaaserLedger(
            user_id=user_id,
            transaction_id=t.transaction_id,
            income_amount=abs(float(t.amount)),
            maaser_due=amt,
            paid_to="Maaser (pending allocation)",
            note=f"Auto-Maaser {percent:.1f}% of {t.description} (backfill)",
            date=t.date or datetime.now(timezone.utc),
        )
        session.add(entry)
        created += 1
        total_amount += amt
    await session.commit()
    return {"created": created, "skipped": skipped, "total_amount": round(total_amount, 2), "enabled": True}
