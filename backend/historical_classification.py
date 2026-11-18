"""Conservative, account-scoped matching against previously approved transactions.

Only a strong, consistent historical match may bypass AI. A generic payee,
unapproved AI suggestion, conflicting categories or an amount-direction change
must not silently teach Penni an incorrect category.
"""
import re
from collections import Counter

from sqlalchemy import func, or_, select

from db import Transaction

GENERIC_DESCRIPTIONS = {
    "payment", "card payment", "card transaction", "pos", "purchase",
    "bank transfer", "transfer", "faster payment", "standing order",
    "direct debit", "online payment", "online transfer", "unknown",
    "credit", "debit", "bill payment", "cash", "atm withdrawal",
}
# One shop can sell different kinds of products. Match the transaction's
# full description first; do not blindly inherit a merchant-wide category.
MULTI_CATEGORY_MERCHANTS = {
    "amazon", "amazon uk", "amzn", "amazon marketplace", "paypal", "ebay",
    "tesco", "asda", "sainsburys", "sainsbury s", "aldi", "lidl", "waitrose",
    "john lewis", "argos", "uber", "uber eats", "walmart", "etsy",
}


def normalise_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", str(value or "").lower())).strip()


def _safe_description(value: str | None) -> str:
    text = normalise_text(value)
    return text if len(text) >= 6 and text not in GENERIC_DESCRIPTIONS else ""


def _diverse_merchant(key: str) -> bool:
    return any(key == name or key.startswith(name + " ") for name in MULTI_CATEGORY_MERCHANTS)


def _merchant_key(merchant: str | None, normalized: str | None) -> str:
    # Use the app's normalized merchant whenever it is specific enough, but
    # never collapse "Uber Eats" into "Uber" or other multi-purpose sellers.
    canonical = normalise_text(normalized)
    raw = normalise_text(merchant)
    key = canonical if len(canonical) >= 4 and not _diverse_merchant(canonical) else raw or canonical
    if not key or key in GENERIC_DESCRIPTIONS or len(key) < 4:
        return ""
    return key


def _vote(matches: list, source: str) -> dict | None:
    if not matches:
        return None
    counts = Counter(item.category for item in matches)
    (category, count), = counts.most_common(1)
    total = len(matches)
    # An exact description is compelling if *all* approved examples agree.
    # A single merchant-wide match is too weak; require a repeated pattern.
    if source == "history_exact":
        reliable = count == total or (total >= 5 and count / total >= 0.90)
        confidence = 0.97 if total >= 2 else 0.93
    else:
        reliable = (total >= 3 and count == total) or (total >= 5 and count / total >= 0.90)
        confidence = 0.91 if total >= 5 else 0.88
    if not reliable:
        return None
    return {
        "category": category,
        "confidence": confidence,
        "source": source,
        "reason": (
            f"Matched {count} approved previous transaction"
            f"{'s' if count != 1 else ''} with the same "
            f"{'description' if source == 'history_exact' else 'merchant'}."
        ),
        "matched_count": count,
    }


def evaluate_history(
    description: str,
    merchant: str | None,
    normalized_merchant: str | None,
    amount: float,
    transactions: list[Transaction],
    valid_categories: set[str],
) -> tuple[dict | None, str]:
    """Return a safe historical suggestion and a summary for AI if unclear."""
    desc_key = _safe_description(description)
    merchant_key = _merchant_key(merchant, normalized_merchant)
    target_sign = amount > 0
    exact, same_merchant = [], []
    for tx in transactions:
        if (
            not tx.category or tx.category not in valid_categories
            or tx.category == "uncategorized"
            or tx.category_approval_status != "approved"
            or tx.approval_status == "failed"
            or tx.tx_type == "transfer" or tx.transfer_pair_id or tx.parent_id
            or (float(tx.amount or 0) > 0) != target_sign
        ):
            continue
        if desc_key and _safe_description(tx.description) == desc_key:
            exact.append(tx)
        elif merchant_key and _merchant_key(tx.merchant_name, tx.normalized_merchant) == merchant_key:
            same_merchant.append(tx)

    # A conflict among exact matches must go to AI; don't fall through to a
    # less specific merchant rule and erase evidence of different spending types.
    if exact:
        result = _vote(exact, "history_exact")
        if result:
            return result, result["reason"]
    elif merchant_key and not _diverse_merchant(merchant_key):
        result = _vote(same_merchant, "history_merchant")
        if result:
            return result, result["reason"]

    relevant = exact if exact else same_merchant
    if relevant:
        votes = Counter(row.category for row in relevant).most_common(4)
        return None, (
            "Approved past matching transactions were inconclusive: "
            + "; ".join(f"{category} ({count})" for category, count in votes)
            + ". Do not assume the most common category is always correct."
        )
    return None, "No approved historical transaction matched reliably."


async def find_historical_category(
    session,
    user_id: str,
    description: str,
    merchant: str | None,
    normalized_merchant: str | None,
    amount: float,
    active: set[str],
    exclude_transaction_id: str | None = None,
) -> tuple[dict | None, str]:
    """Fetch only eligible, similar prior records for this user's history."""
    desc = str(description or "").strip()
    merchant_value = str(merchant or "").strip()
    normalized_value = str(normalized_merchant or "").strip()
    filters = []
    if _safe_description(desc):
        filters.append(func.lower(Transaction.description) == desc.lower())
    if _merchant_key(merchant_value, normalized_value):
        # Exact SQL equality, not ILIKE '%...%' across unrelated merchants.
        if merchant_value:
            filters.append(func.lower(Transaction.merchant_name) == merchant_value.lower())
        if normalized_value:
            filters.append(func.lower(Transaction.normalized_merchant) == normalized_value.lower())
    if not filters:
        return None, "No sufficiently specific historical merchant or description."

    stmt = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.category_approval_status == "approved",
        Transaction.category.is_not(None),
        Transaction.category != "uncategorized",
        or_(Transaction.tx_type.is_(None), Transaction.tx_type != "transfer"),
        Transaction.transfer_pair_id.is_(None),
        Transaction.parent_id.is_(None),
        or_(*filters),
    )
    if exclude_transaction_id:
        stmt = stmt.where(Transaction.transaction_id != exclude_transaction_id)
    stmt = stmt.order_by(Transaction.date.desc()).limit(500)
    previous = (await session.execute(stmt)).scalars().all()
    return evaluate_history(desc, merchant, normalized_merchant, amount, previous, active)
