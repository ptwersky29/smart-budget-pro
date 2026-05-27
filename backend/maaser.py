"""Auto-Maaser hook: when a salary/income lands, accrue 10% (configurable) Maaser obligation."""
import uuid
import logging
from datetime import datetime, timezone

logger = logging.getLogger("maaser")

INCOME_CATEGORIES = {"salary", "income"}


def _is_income_tx(tx: dict) -> bool:
    """A transaction counts as income if flagged is_income OR amount>0 OR category is salary/income."""
    if tx.get("is_income"):
        return True
    if (tx.get("category") or "").lower() in INCOME_CATEGORIES:
        return True
    if (tx.get("amount") or 0) > 0:
        return True
    return False


async def maybe_accrue(db, user_id: str, tx: dict) -> dict | None:
    """If the user has auto-maaser ON and tx is income/salary, create a pending Tzedakah entry.
    Returns the created tzedakah doc (without _id) or None if skipped.
    """
    if not _is_income_tx(tx):
        return None

    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "maaser": 1})
    settings = (u or {}).get("maaser") or {}
    if not settings.get("enabled"):
        return None

    # Don't double-accrue for the same transaction
    if tx.get("transaction_id"):
        existing = await db.tzedakah.find_one(
            {"user_id": user_id, "source_tx_id": tx["transaction_id"]}, {"_id": 1})
        if existing:
            return None

    percent = float(settings.get("percent", 10))
    amount = round(abs(float(tx.get("amount", 0))) * percent / 100, 2)
    if amount <= 0:
        return None

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "entry_id": f"tz_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "amount": amount,
        "recipient": "Maaser (pending allocation)",
        "note": f"Auto-Maaser {percent:.1f}% of {tx.get('description', 'income')}",
        "date": tx.get("date") or now,
        "status": "pending",
        "source_tx_id": tx.get("transaction_id"),
        "created_at": now,
    }
    await db.tzedakah.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def backfill_for_user(db, user_id: str) -> dict:
    """Scan all existing income transactions for this user and create
    pending Maaser entries for any that don't already have one.
    Returns {created, skipped, total_amount}.
    """
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "maaser": 1})
    settings = (u or {}).get("maaser") or {}
    if not settings.get("enabled"):
        return {"created": 0, "skipped": 0, "total_amount": 0, "enabled": False}

    percent = float(settings.get("percent", 10))
    txs = await db.transactions.find({"user_id": user_id}, {"_id": 0}).to_list(5000)
    created = 0
    skipped = 0
    total_amount = 0.0
    for tx in txs:
        if not _is_income_tx(tx):
            continue
        existing = await db.tzedakah.find_one(
            {"user_id": user_id, "source_tx_id": tx.get("transaction_id")}, {"_id": 1})
        if existing:
            skipped += 1
            continue
        amount = round(abs(float(tx.get("amount", 0))) * percent / 100, 2)
        if amount <= 0:
            continue
        now = datetime.now(timezone.utc).isoformat()
        await db.tzedakah.insert_one({
            "entry_id": f"tz_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "amount": amount,
            "recipient": "Maaser (pending allocation)",
            "note": f"Auto-Maaser {percent:.1f}% of {tx.get('description', 'income')} (backfill)",
            "date": tx.get("date") or now,
            "status": "pending",
            "source_tx_id": tx.get("transaction_id"),
            "created_at": now,
        })
        created += 1
        total_amount += amount
    return {"created": created, "skipped": skipped, "total_amount": round(total_amount, 2), "enabled": True}
