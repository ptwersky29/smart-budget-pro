"""Smart financial engine: transactions, budgets, analytics, merchant normalization, split, recurring."""

import logging
import re
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import maaser
from auth import get_current_user
from cache import TTLCache
from category_catalog import (
    build_category_payload,
    combine_categories,
    hierarchy_payload,
    humanize_category_name,
    slugify_category_name,
)
from db import (
    AccountNickname,
    BankAccount,
    BankConnection,
    Budget,
    Category,
    CategoryRule,
    RecurringTransaction,
    SplitTransaction,
    Subscription,
    Transaction,
    User,
    get_session_maker,
)
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from llm import call_llm, parse_json, track_ai_usage
from pydantic import BaseModel
from security import sanitize_input
from sqlalchemy import delete, func, or_, select, update
from statements import (
    ALL_CATEGORIES,
    CATEGORIES,
    CATEGORISE_KEYWORDS,
    CATEGORY_HIERARCHY,
    INCOME_CATEGORIES,
)

logger = logging.getLogger("finance")

_query_cache = TTLCache(ttl=60)  # 60-second cache for frequent queries

# ── Merchant normalization ───────────────────────────────────────────────

MERCHANT_NORMALIZE = {
    "TESCO": "Tesco",
    "TESCO STORES": "Tesco",
    "TESCO STORE": "Tesco",
    "SAINSBURY": "Sainsbury's",
    "SAINSBURYS": "Sainsbury's",
    "ASDA": "Asda",
    "ASDA STORES": "Asda",
    "ALDI": "Aldi",
    "ALDI STORES": "Aldi",
    "LIDL": "Lidl",
    "LIDL GB": "Lidl",
    "MORRISONS": "Morrisons",
    "MORRISON": "Morrisons",
    "WAITROSE": "Waitrose",
    "WAITROSE & PARTNERS": "Waitrose",
    "M&S": "M&S",
    "MARKS & SPENCER": "M&S",
    "MS": "M&S",
    "CO-OP": "Co-op",
    "COOPERATIVE": "Co-op",
    "AMAZON": "Amazon",
    "AMAZON.CO.UK": "Amazon",
    "AMZN": "Amazon",
    "AMZN MKTP": "Amazon",
    "TFL": "TfL",
    "TFL TRAVEL": "TfL",
    "TRANSPORT FOR LONDON": "TfL",
    "UBER": "Uber",
    "UBER TRIP": "Uber",
    "UBER EATS": "Uber Eats",
    "DELIVEROO": "Deliveroo",
    "JUST EAT": "Just Eat",
    "JUSTEAT": "Just Eat",
    "NETFLIX": "Netflix",
    "SPOTIFY": "Spotify",
    "APPLE": "Apple",
    "APPLE.COM": "Apple",
    "APPLE STORE": "Apple",
    "DISNEY": "Disney+",
    "DISNEY PLUS": "Disney+",
    "YOUTUBE": "YouTube",
    "YOUTUBE PREMIUM": "YouTube",
    "GOOGLE": "Google",
    "GOOGLE PLAY": "Google",
    "MICROSOFT": "Microsoft",
    "MSFT": "Microsoft",
    "ADOBE": "Adobe",
    "GITHUB": "GitHub",
    "OPENAI": "OpenAI",
    "CHATGPT": "ChatGPT",
    "EE": "EE",
    "EVERYTHING EVERYWHERE": "EE",
    "VODAFONE": "Vodafone",
    "SKY": "Sky",
    "SKY UK": "Sky",
    "VIRGIN MEDIA": "Virgin Media",
    "BRITISH GAS": "British Gas",
    "EDF": "EDF Energy",
    "EDF ENERGY": "EDF Energy",
    "OCTOPUS": "Octopus Energy",
    "OCTOPUS ENERGY": "Octopus Energy",
    "THAMES WATER": "Thames Water",
    "COUNCIL TAX": "Council Tax",
    "HMRC": "HMRC",
    "HM REVENUE": "HMRC",
    "PAYPAL": "PayPal",
    "MONZO": "Monzo",
    "STARLING": "Starling Bank",
    "NATIONAL EXPRESS": "National Express",
    "TRAINLINE": "Trainline",
    "SHELL": "Shell",
    "SHELL FUEL": "Shell",
    "BP": "BP",
    "BP FUEL": "BP",
    "COSTA": "Costa",
    "COSTA COFFEE": "Costa",
    "STARBUCKS": "Starbucks",
    "PRET": "Pret",
    "PRET A MANGER": "Pret",
    "MCDONALD": "McDonald's",
    "MCDONALDS": "McDonald's",
    "KFC": "KFC",
    "SUBWAY": "Subway",
    "GREGGS": "Greggs",
    "ARGOS": "Argos",
    "IKEA": "IKEA",
    "B&Q": "B&Q",
    "B AND Q": "B&Q",
    "SCREWFIX": "Screwfix",
    "PRIMARK": "Primark",
    "ZARA": "Zara",
    "H&M": "H&M",
    "H AND M": "H&M",
    "NEXT": "Next",
    "JOHN LEWIS": "John Lewis",
    "JOHN LEWIS PARTNERSHIP": "John Lewis",
    "EBAY": "eBay",
    "ETSY": "Etsy",
    "BOOTS": "Boots",
    "BOOTS PHARMACY": "Boots",
    "SUPERDRUG": "Superdrug",
    "NHS": "NHS",
    "PUREGYM": "PureGym",
    "NATIONAL TRUST": "National Trust",
    "TICKETMASTER": "Ticketmaster",
    "AVIVA": "Aviva",
    "DIRECT LINE": "Direct Line",
    "ADMIRAL": "Admiral",
    "LEGAL & GENERAL": "Legal & General",
}


def normalize_merchant(name: str) -> str:
    if not name:
        return name
    key = re.sub(r"[^A-Z0-9 &]", "", name.strip().upper())
    for pattern, replacement in MERCHANT_NORMALIZE.items():
        if pattern in key:
            return replacement
    return name.strip()


def _merchant_rule_key(tx) -> str:
    """Extract a normalised merchant key for rule matching."""
    return (
        (
            getattr(tx, "normalized_merchant", None)
            or (tx.merchant_name if getattr(tx, "merchant_name", None) else None)
            or (tx.description[:60] if getattr(tx, "description", None) else "")
        )
        .strip()
        .upper()
    )


async def _learn_category_rule(session, user_id: str, tx, category: str) -> None:
    """Save/update a user-learned merchant→category rule."""
    from db import CategoryRule

    key = _merchant_rule_key(tx)
    if not key or category in ("uncategorized", ""):
        return
    try:
        result = await session.execute(
            select(CategoryRule).where(
                CategoryRule.user_id == user_id,
                CategoryRule.merchant == key,
            )
        )
        rule = result.scalar_one_or_none()
        if rule:
            rule.category = category
            rule.match_count = (rule.match_count or 0) + 1
            rule.last_used_at = datetime.now(timezone.utc)
        else:
            session.add(
                CategoryRule(
                    user_id=user_id,
                    merchant=key,
                    category=category,
                    match_count=1,
                    source="learned",
                    last_used_at=datetime.now(timezone.utc),
                )
            )
    except Exception:
        pass


async def _lookup_category_rule(session, user_id: str, tx) -> str | None:
    """Look up a learned rule for this merchant. Returns category or None."""
    from db import CategoryRule

    key = _merchant_rule_key(tx)
    if not key:
        return None
    try:
        result = await session.execute(
            select(CategoryRule).where(
                CategoryRule.user_id == user_id,
                CategoryRule.merchant == key,
            )
        )
        rule = result.scalar_one_or_none()
        if rule:
            rule.match_count = (rule.match_count or 0) + 1
            rule.last_used_at = datetime.now(timezone.utc)
            return rule.category
    except Exception:
        return None
    return None


# ── Recurring detection ──────────────────────────────────────────────────


def detect_recurring_txns(tx_list: list) -> list:
    groups = defaultdict(list)
    for t in tx_list:
        key = (
            round(abs(t["amount"]), 2),
            (t.get("normalized_merchant") or t.get("description") or "")
            .lower()
            .strip(),
        )
        groups[key].append(t)
    results = []
    for (amt, desc_key), group in groups.items():
        if len(group) < 2:
            continue
        dates = sorted(d for d in [t.get("date") for t in group] if d)
        if len(dates) < 2:
            continue
        intervals = []
        for i in range(1, len(dates)):
            try:
                d1 = datetime.fromisoformat(dates[i - 1].replace("Z", "+00:00"))
                d2 = datetime.fromisoformat(dates[i].replace("Z", "+00:00"))
                intervals.append(abs((d2 - d1).days))
            except (ValueError, TypeError):
                continue
        if not intervals:
            continue
        avg_interval = sum(intervals) / len(intervals)
        if 25 <= avg_interval <= 35:
            frequency = "monthly"
        elif 12 <= avg_interval <= 16:
            frequency = "fortnightly"
        elif 5 <= avg_interval <= 10:
            frequency = "weekly"
        elif 1 <= avg_interval <= 3:
            frequency = "daily"
        else:
            continue
        results.append(
            {
                "description": group[0].get("description", ""),
                "normalized_merchant": group[0].get("normalized_merchant"),
                "amount": round(amt, 2),
                "category": group[0].get("category", "uncategorized"),
                "frequency": frequency,
                "avg_interval_days": round(avg_interval, 1),
                "occurrences": len(group),
                "first_date": dates[0][:10] if dates else None,
                "last_date": dates[-1][:10] if dates else None,
                "is_subscription": frequency == "monthly" and 1 <= amt <= 200,
            }
        )
    return sorted(results, key=lambda r: -r["occurrences"])


# ── Category rules / smart categorisation ────────────────────────────────


def smart_categorize(text: str) -> str:
    """Fast keyword-based categorisation using the merged CATEGORISE_KEYWORDS from statements.py.
    Resolves old category keys automatically via CATEGORY_ALIASES."""
    from statements import resolve_category as _rc

    t = (text or "").lower()
    for cat, keywords in CATEGORISE_KEYWORDS.items():
        if any(k in t for k in keywords):
            return _rc(cat)
    return "uncategorized"


def resolve_category(value: str) -> str:
    """Resolve old/new category slug to canonical new slug, with fallback."""
    from statements import resolve_category as _resolve

    return _resolve(value)


CATEGORISE_PROMPT_FE = """You are a UK bank transaction categoriser. Think step by step about what this transaction is, then output the category.

CATEGORY HIERARCHY (pick exactly one category slug from below):

❤️ Charity: maaser_tzedakah (10% maaser), charity (other charity), other_charity (shul, jewish education)
👕 Clothing: clothing_husband, clothing_wife, clothing_kids, shoes
🏠 Household: fruit_veg, grocery (supermarket), bakery, fish, meat, paper_goods (kitchen roll/tissues), takeaway (restaurants, takeout), wine, house_supplies (DIY, cleaning), chemist (pharmacy)
🏠 Housing: rent_mortgage, electricity, heating, gas, water, council_tax, telephone (landline), mobile, cleaning_help, life_insurance, buildings_insurance
👦 Kids: school_fees, bus_fee, babysitting, nappies, trust_savings, toys, tutor, therapy, medical
🧩 Ungrouped: public_transport, car_lease, petrol_diesel, dart_charge (congestion), tolls, tickets (fines), loan_payoff, interest (bank fees), investments, petty_cash, miscellaneous (everything else), taxi, mikva, taxes (HMRC), upcoming_savings
💰 Income: salary, income

Also acceptable: uncategorized

MERCHANT → CATEGORY (with amount-aware logic):
- Tesco/Sainsbury/Asda/Waitrose/Lidl/Aldi/Co-op/Morrisons: if abs(amount) < 10 → takeaway, if abs(amount) >= 10 → grocery
- McDonald/Nando/KFC/Pret/Starbucks/Costa → takeaway (always)
- Deliveroo/Uber Eats/JustEat → takeaway; Uber trip/ride → taxi
- TfL/Oyster → public_transport; Shell/BP/Esso → petrol_diesel
- Trainline/raileasy → public_transport
- British Gas/EDF/Eon/Octopus → gas or electricity
- Netflix/Spotify/Disney+/YouTube Premium → miscellaneous
- Amazon → miscellaneous
- Boots/Lloyds/Superdrug → chemist; Specsavers → medical
- eBay/Amazon/Argos/John Lewis → miscellaneous
- HMRC/VAT → taxes
- BT/Sky/Virgin/Vodafone/EE → telephone or mobile
- ATM/WITHDRAWAL → petty_cash
- Faster payment/standing order/PayPal: if "salary/wages/payroll" → income; if "transfer"/"payment" → miscellaneous
- Charity/Donation/Tzedakah/JGive → charity; maaser-specific → maaser_tzedakah
- Rent/mortgage payment → rent_mortgage (abs(amount) > 500 likely)
- Dentist/Doctor/Prescription → medical
- Gym/Fitness/ClassPass → miscellaneous
- Cinema/Theatre/Event/Ticket → miscellaneous
- Coursera/Udemy/Skillshare → school_fees

Output STRICT JSON only: {{"category": "<one of the categories above>"}}

Transaction: {description}
Merchant: {merchant}
Amount: {amount}
"""


# ── Pydantic models ──────────────────────────────────────────────────────


class TransactionIn(BaseModel):
    amount: float
    currency: str = "GBP"
    description: str
    merchant: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    account_id: str
    is_income: bool = False
    notes: Optional[str] = None
    tags: Optional[dict] = None
    source: Optional[str] = "manual"
    balance_type: Optional[str] = "available"


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    description: Optional[str] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    is_income: Optional[bool] = None
    account_id: Optional[str] = None
    balance_type: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[dict] = None
    pending: Optional[bool] = None
    exclude_from_maaser: Optional[bool] = None


class BulkUpdateIn(BaseModel):
    transaction_ids: list[str]
    category: Optional[str] = None
    exclude_from_maaser: Optional[bool] = None
    pending: Optional[bool] = None


class SplitIn(BaseModel):
    splits: list[dict]  # [{amount: float, category: str, description: str}]


class NicknameIn(BaseModel):
    nickname: str
    account_name: Optional[str] = None


class BudgetIn(BaseModel):
    category: str
    limit: float
    period: str = "monthly"
    budget_type: str = "everyday"
    event_date: Optional[str] = None
    event_group_id: Optional[str] = None
    event_group_name: Optional[str] = None
    month: Optional[str] = None  # "YYYY-MM" — required for everyday budgets


class BudgetUpdate(BaseModel):
    category: Optional[str] = None
    limit: Optional[float] = None
    period: Optional[str] = None
    budget_type: Optional[str] = None
    event_date: Optional[str] = None
    event_group_id: Optional[str] = None
    event_group_name: Optional[str] = None
    month: Optional[str] = None


class BulkDeleteIn(BaseModel):
    budget_ids: list[str]


class CategoryCreateIn(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    emoji: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    section: Optional[str] = None
    is_income: Optional[bool] = None
    budget: Optional[float] = None
    sort_order: int = 0


class CategoryUpdateIn(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    emoji: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    section: Optional[str] = None
    is_income: Optional[bool] = None
    budget: Optional[float] = None
    sort_order: Optional[int] = None


class CategoryReassignDeleteIn(BaseModel):
    replacement_category: Optional[str] = None
    replacement_category_id: Optional[str] = None


# ── Category helpers ─────────────────────────────────────────────────────


def _default_category_usage() -> dict:
    return {
        "transactions": 0,
        "budgets": 0,
        "recurring": 0,
        "subscriptions": 0,
        "rules": 0,
        "total": 0,
    }


def _touch_category_usage(
    usage_map: dict, category: str | None, bucket: str, count: int
):
    if not category:
        return
    entry = usage_map.setdefault(category, _default_category_usage())
    entry[bucket] += int(count or 0)
    entry["total"] = (
        entry["transactions"]
        + entry["budgets"]
        + entry["recurring"]
        + entry["subscriptions"]
        + entry["rules"]
    )


def _normalise_category_slug(value: str | None, fallback: str = "uncategorized") -> str:
    raw = (value or "").strip()
    if not raw:
        return fallback
    return resolve_category(slugify_category_name(raw) or raw)


def _slug_from_category_identifier(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if raw.startswith("system:") or raw.startswith("custom:"):
        raw = raw.split(":", 1)[1]
    return _normalise_category_slug(raw, fallback="")


def _category_display_label(
    slug: str, label: str | None = None, name: str | None = None
) -> str:
    display = (label or name or "").strip()
    return display or humanize_category_name(slug)


def _invalidate_category_caches(user_id: str):
    _query_cache.delete_by_prefix(f"cats:{user_id}")
    _query_cache.delete(f"dash:{user_id}")
    _query_cache.delete_by_prefix(f"trends:{user_id}:")
    _query_cache.delete_by_prefix(f"budgets:{user_id}:")


async def _category_usage_map(session, user_id: str) -> dict[str, dict]:
    usage: dict[str, dict] = {}

    sources = [
        (Transaction, "transactions"),
        (SplitTransaction, "transactions"),
        (Budget, "budgets"),
        (RecurringTransaction, "recurring"),
        (Subscription, "subscriptions"),
        (CategoryRule, "rules"),
    ]
    for model, bucket in sources:
        result = await session.execute(
            select(model.category, func.count())
            .where(model.user_id == user_id, model.category.isnot(None))
            .group_by(model.category)
        )
        for category, count in result.all():
            _touch_category_usage(usage, category, bucket, count)

    return usage


async def _resolve_category_entity(session, user_id: str, category_id: str):
    slug = _slug_from_category_identifier(category_id)
    row = None

    if category_id.startswith("system:") or category_id.startswith("custom:"):
        if not slug:
            raise HTTPException(404, "Category not found")
        result = await session.execute(
            select(Category).where(Category.user_id == user_id, Category.name == slug)
        )
        row = result.scalar_one_or_none()
        return slug, row, slug in CATEGORIES

    result = await session.execute(
        select(Category).where(
            Category.category_id == category_id,
            Category.user_id == user_id,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        return row.name, row, row.name in CATEGORIES

    if slug:
        result = await session.execute(
            select(Category).where(Category.user_id == user_id, Category.name == slug)
        )
        row = result.scalar_one_or_none()
        if row or slug in CATEGORIES:
            return slug, row, slug in CATEGORIES

    raise HTTPException(404, "Category not found")


async def _ensure_category_row(
    session, user_id: str, slug: str, row: Category | None = None
):
    if row:
        return row
    row = Category(
        category_id=f"cat_{uuid.uuid4().hex[:12]}",
        user_id=user_id,
        name=slug,
        label=humanize_category_name(slug),
        is_income=slug in INCOME_CATEGORIES,
        sort_order=0,
        is_archived=False,
    )
    session.add(row)
    await session.flush()
    return row


def _apply_category_payload_to_row(row: Category, slug: str, payload: dict):
    if "label" in payload or "name" in payload or not row.label:
        row.label = _category_display_label(
            slug,
            payload.get("label"),
            payload.get("name") or row.label,
        )

    if "emoji" in payload or "icon" in payload:
        row.icon = payload.get("emoji") or payload.get("icon") or None
    if "color" in payload:
        row.color = payload.get("color") or None
    if "description" in payload:
        row.description = (payload.get("description") or "").strip() or None
    if "section" in payload:
        row.section = (payload.get("section") or "").strip() or None
    if payload.get("is_income") is not None:
        row.is_income = bool(payload.get("is_income"))
    elif row.is_income is None:
        row.is_income = slug in INCOME_CATEGORIES
    if "budget" in payload:
        row.budget = payload.get("budget")
    if payload.get("sort_order") is not None:
        row.sort_order = int(payload.get("sort_order") or 0)
    row.is_archived = False


async def _archive_category(
    session, user_id: str, slug: str, row: Category | None = None
):
    row = await _ensure_category_row(session, user_id, slug, row=row)
    row.is_archived = True
    if not row.label:
        row.label = humanize_category_name(slug)
    return row


async def _reassign_budget_rows(
    session, user_id: str, source_slug: str, target_slug: str
):
    result = await session.execute(
        select(Budget).where(Budget.user_id == user_id, Budget.category == source_slug)
    )
    source_rows = result.scalars().all()
    if not source_rows:
        return {"updated": 0, "merged": 0}

    target_result = await session.execute(
        select(Budget).where(Budget.user_id == user_id, Budget.category == target_slug)
    )
    target_rows = target_result.scalars().all()
    target_map = {}
    for budget in target_rows:
        key = (
            budget.budget_type or "everyday",
            budget.month or "",
            budget.event_group_id or "",
            budget.event_date.isoformat() if budget.event_date else "",
        )
        target_map[key] = budget

    updated = 0
    merged = 0
    for budget in source_rows:
        key = (
            budget.budget_type or "everyday",
            budget.month or "",
            budget.event_group_id or "",
            budget.event_date.isoformat() if budget.event_date else "",
        )
        existing = target_map.get(key)
        if existing and existing.budget_id != budget.budget_id:
            existing.amount = float(existing.amount or 0) + float(budget.amount or 0)
            await session.delete(budget)
            merged += 1
            continue
        budget.category = target_slug
        target_map[key] = budget
        updated += 1

    return {"updated": updated, "merged": merged}


# ── Serializers ──────────────────────────────────────────────────────────

SOURCE_LABELS = {
    "manual": "Manual",
    "truelayer": "Bank",
    "csv": "CSV",
    "pdf": "PDF",
    "statement": "Statement",
    "sms": "SMS",
}


def _tx_to_dict(
    t: Transaction, institution_map: dict = None, label_map: dict = None
) -> dict:
    source_label = SOURCE_LABELS.get(t.source, t.source)
    institution = None
    if t.connection_id:
        if label_map and t.connection_id in label_map:
            source_label = label_map[t.connection_id]
        elif institution_map and t.connection_id in institution_map:
            source_label = institution_map[t.connection_id]
        if institution_map:
            institution = institution_map.get(t.connection_id)
    return {
        "transaction_id": t.transaction_id,
        "user_id": t.user_id,
        "amount": t.amount,
        "currency": t.currency,
        "description": t.description,
        "merchant": t.merchant_name,
        "normalized_merchant": t.normalized_merchant,
        "category": t.category,
        "subcategory": t.subcategory,
        "date": t.date.isoformat() if t.date else None,
        "account_id": t.account_id,
        "connection_id": t.connection_id,
        "institution": institution,
        "is_income": t.amount > 0,
        "balance_type": t.balance_type,
        "notes": t.notes,
        "tags": t.tags,
        "pending": t.pending,
        "tx_type": t.tx_type,
        "source": t.source,
        "source_label": source_label,
        "parent_id": t.parent_id,
        "recurring_id": t.recurring_id,
        "subscription_name": t.subscription_name,
        "exclude_from_maaser": t.exclude_from_maaser,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _budget_to_dict(b: Budget) -> dict:
    return {
        "budget_id": b.budget_id,
        "category": b.category,
        "limit": b.amount,
        "period": b.period,
        "budget_type": b.budget_type or "everyday",
        "event_date": b.event_date.isoformat() if b.event_date else None,
        "event_group_id": getattr(b, "event_group_id", None),
        "event_group_name": getattr(b, "event_group_name", None),
        "start_date": b.start_date.isoformat() if b.start_date else None,
        "end_date": b.end_date.isoformat() if b.end_date else None,
        "notes": b.notes,
        "month": getattr(b, "month", None),
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def _insight_reason(cat: str, current: float, avg: float, budget: float) -> str:
    """Generate a human-readable reason for a budget insight suggestion."""
    if budget == 0 and current > 0:
        return f"You're spending £{current:.0f} on {cat} but have no budget set."
    if budget > 0 and current > budget * 1.2:
        return f"Spending £{current:.0f} exceeds your £{budget:.0f} budget by {int((current / budget - 1) * 100)}%."
    if avg > 0 and avg > budget * 1.1 and budget > 0:
        return f"Your 3-month avg (£{avg:.0f}) is above your budget (£{budget:.0f})."
    if budget > 0 and avg < budget * 0.8:
        return f"You're consistently under budget — consider lowering from £{budget:.0f} to £{avg:.0f}."
    if current > 0 and avg > 0 and current > avg * 1.3:
        return f"This month (£{current:.0f}) is much higher than your 3-month avg (£{avg:.0f})."
    if avg > 0 and budget == 0:
        return f"Average spending on {cat} is £{avg:.0f} — consider setting a budget."
    if current > 0:
        return f"Current spend £{current:.0f} — suggested budget aligns with actuals."
    return f"Based on your spending patterns."


# ── Router ───────────────────────────────────────────────────────────────


def build_router() -> APIRouter:
    router = APIRouter(tags=["finance"])

    # ── Transactions ─────────────────────────────────────────────────

    @router.get("/transactions")
    async def list_transactions(
        request: Request,
        user: dict = Depends(get_current_user),
        category: str = Query(None),
        source: str = Query(None),
        tx_type: str = Query(None),
        merchant: str = Query(None),
        pending: str = Query(None),
        connection_id: str = Query(None),
        date_from: str = Query(None),
        date_to: str = Query(None),
        amount_min: float = Query(None),
        amount_max: float = Query(None),
        search: str = Query(None),
        sort: str = Query("date"),
        order: str = Query("desc"),
        offset: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=1000),
    ):
        sm = request.app.state.db
        async with sm() as session:
            stmt = select(Transaction).where(Transaction.user_id == user["user_id"])
            if connection_id:
                stmt = stmt.where(Transaction.connection_id == connection_id)
            if category:
                stmt = stmt.where(Transaction.category == category)
            if source:
                stmt = stmt.where(Transaction.source == source)
            if merchant:
                stmt = stmt.where(Transaction.merchant_name.ilike(f"%{merchant}%"))
            if pending == "true":
                stmt = stmt.where(Transaction.pending == True)
            elif pending == "false":
                stmt = stmt.where(Transaction.pending == False)
            if tx_type == "income":
                stmt = stmt.where(Transaction.amount > 0)
            elif tx_type == "expense":
                stmt = stmt.where(Transaction.amount < 0)
            if date_from:
                stmt = stmt.where(Transaction.date >= datetime.fromisoformat(date_from))
            if date_to:
                stmt = stmt.where(
                    Transaction.date
                    <= datetime.fromisoformat(date_to) + timedelta(days=1)
                )
            if amount_min is not None:
                stmt = stmt.where(abs(Transaction.amount) >= amount_min)
            if amount_max is not None:
                stmt = stmt.where(abs(Transaction.amount) <= amount_max)
            if search:
                term = f"%{search}%"
                stmt = stmt.where(
                    or_(
                        Transaction.description.ilike(term),
                        Transaction.merchant_name.ilike(term),
                        Transaction.normalized_merchant.ilike(term),
                        Transaction.notes.ilike(term),
                        Transaction.category.ilike(term),
                    )
                )

            sort_col = getattr(Transaction, sort, Transaction.date)
            order_fn = sort_col.desc if order == "desc" else sort_col.asc
            stmt = stmt.order_by(order_fn()).offset(offset).limit(limit)

            result = await session.execute(stmt)
            rows = result.scalars().all()

            conn_ids = list({t.connection_id for t in rows if t.connection_id})
            institution_map = {}
            label_map = {}
            if conn_ids:
                from db import BankConnection

                bc_result = await session.execute(
                    select(
                        BankConnection.connection_id,
                        BankConnection.nickname,
                        BankConnection.account_name,
                        BankConnection.config,
                    ).where(BankConnection.connection_id.in_(conn_ids))
                )
                for bc_row in bc_result:
                    cfg = bc_row.config or {}
                    inst = cfg.get("institution") if isinstance(cfg, dict) else None
                    inst = inst or bc_row.account_name
                    if inst:
                        institution_map[bc_row.connection_id] = inst
                    lbl = bc_row.nickname or bc_row.account_name or inst
                    if lbl:
                        label_map[bc_row.connection_id] = lbl

            count_stmt = (
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.user_id == user["user_id"])
            )
            if connection_id:
                count_stmt = count_stmt.where(
                    Transaction.connection_id == connection_id
                )
            if category:
                count_stmt = count_stmt.where(Transaction.category == category)
            if source:
                count_stmt = count_stmt.where(Transaction.source == source)
            if pending == "true":
                count_stmt = count_stmt.where(Transaction.pending == True)
            elif pending == "false":
                count_stmt = count_stmt.where(Transaction.pending == False)
            if tx_type == "income":
                count_stmt = count_stmt.where(Transaction.amount > 0)
            elif tx_type == "expense":
                count_stmt = count_stmt.where(Transaction.amount < 0)
            if date_from:
                count_stmt = count_stmt.where(
                    Transaction.date >= datetime.fromisoformat(date_from)
                )
            if date_to:
                count_stmt = count_stmt.where(
                    Transaction.date
                    <= datetime.fromisoformat(date_to) + timedelta(days=1)
                )
            if amount_min is not None:
                count_stmt = count_stmt.where(abs(Transaction.amount) >= amount_min)
            if amount_max is not None:
                count_stmt = count_stmt.where(abs(Transaction.amount) <= amount_max)
            count_result = await session.execute(count_stmt)
            total = count_result.scalar() or 0

            agg_stmt = select(
                func.coalesce(
                    func.sum(Transaction.amount).filter(Transaction.amount > 0), 0
                ),
                func.coalesce(
                    func.sum(Transaction.amount).filter(Transaction.amount < 0), 0
                ),
            ).where(Transaction.user_id == user["user_id"])
            if connection_id:
                agg_stmt = agg_stmt.where(Transaction.connection_id == connection_id)
            if category:
                agg_stmt = agg_stmt.where(Transaction.category == category)
            if source:
                agg_stmt = agg_stmt.where(Transaction.source == source)
            if pending == "true":
                agg_stmt = agg_stmt.where(Transaction.pending == True)
            elif pending == "false":
                agg_stmt = agg_stmt.where(Transaction.pending == False)
            if tx_type == "income":
                agg_stmt = agg_stmt.where(Transaction.amount > 0)
            elif tx_type == "expense":
                agg_stmt = agg_stmt.where(Transaction.amount < 0)
            if date_from:
                agg_stmt = agg_stmt.where(
                    Transaction.date >= datetime.fromisoformat(date_from)
                )
            if date_to:
                agg_stmt = agg_stmt.where(
                    Transaction.date
                    <= datetime.fromisoformat(date_to) + timedelta(days=1)
                )
            if amount_min is not None:
                agg_stmt = agg_stmt.where(abs(Transaction.amount) >= amount_min)
            if amount_max is not None:
                agg_stmt = agg_stmt.where(abs(Transaction.amount) <= amount_max)
            if search:
                term = f"%{search}%"
                agg_stmt = agg_stmt.where(
                    or_(
                        Transaction.description.ilike(term),
                        Transaction.merchant_name.ilike(term),
                        Transaction.normalized_merchant.ilike(term),
                        Transaction.notes.ilike(term),
                        Transaction.category.ilike(term),
                    )
                )
            agg_result = await session.execute(agg_stmt)
            income_total, expense_total = agg_result.one()
            income_total = round(float(income_total), 2)
            expense_total = round(abs(float(expense_total)), 2)

            return {
                "transactions": [
                    _tx_to_dict(t, institution_map, label_map) for t in rows
                ],
                "total": total,
                "income_total": income_total,
                "expense_total": expense_total,
                "offset": offset,
                "limit": limit,
            }

    _SEARCH_CATEGORIES = {
        "maaser": "maaser_tzedakah",
        "tithe": "maaser_tzedakah",
        "charity": "charity",
        "charities": "charity",
        "donation": "charity",
        "donations": "charity",
        "tzedakah": "charity",
        "shul": "other_charity",
        "synagogue": "other_charity",
        "clothing": "clothing_husband",
        "clothes": "clothing_husband",
        "fashion": "clothing_husband",
        "shoes": "shoes",
        "grocery": "grocery",
        "groceries": "grocery",
        "supermarket": "grocery",
        "food shop": "grocery",
        "fruit": "fruit_veg",
        "veg": "fruit_veg",
        "vegetables": "fruit_veg",
        "bakery": "bakery",
        "bread": "bakery",
        "fish": "fish",
        "seafood": "fish",
        "meat": "meat",
        "butcher": "meat",
        "takeaway": "takeaway",
        "takeaways": "takeaway",
        "dining": "takeaway",
        "restaurant": "takeaway",
        "restaurants": "takeaway",
        "cafe": "takeaway",
        "cafes": "takeaway",
        "eating out": "takeaway",
        "wine": "wine",
        "house supplies": "house_supplies",
        "household": "house_supplies",
        "cleaning": "house_supplies",
        "diy": "house_supplies",
        "furniture": "house_supplies",
        "laundry": "house_supplies",
        "chemist": "chemist",
        "pharmacy": "chemist",
        "rent": "rent_mortgage",
        "rentals": "rent_mortgage",
        "mortgage": "rent_mortgage",
        "electric": "electricity",
        "electricity": "electricity",
        "heating": "heating",
        "gas": "gas",
        "gas bill": "gas",
        "water": "water",
        "council tax": "council_tax",
        "telephone": "telephone",
        "landline": "telephone",
        "mobile": "mobile",
        "phone": "mobile",
        "cleaning help": "cleaning_help",
        "cleaner": "cleaning_help",
        "life insurance": "life_insurance",
        "buildings insurance": "buildings_insurance",
        "home insurance": "buildings_insurance",
        "school": "school_fees",
        "school fees": "school_fees",
        "education": "school_fees",
        "courses": "school_fees",
        "tuition": "school_fees",
        "tutor": "school_fees",
        "bus fee": "bus_fee",
        "bus fare": "bus_fee",
        "babysitting": "babysitting",
        "childcare": "babysitting",
        "nursery": "babysitting",
        "nappies": "nappies",
        "nappy": "nappies",
        "toys": "toys",
        "therapy": "therapy",
        "counselling": "therapy",
        "medical": "medical",
        "health": "medical",
        "doctor": "medical",
        "dental": "medical",
        "dentist": "medical",
        "optician": "medical",
        "glasses": "medical",
        "pharmacy": "chemist",
        "boots": "chemist",
        "gym": "miscellaneous",
        "fitness": "miscellaneous",
        "public transport": "public_transport",
        "train": "public_transport",
        "bus": "public_transport",
        "tube": "public_transport",
        "tram": "public_transport",
        "transport": "public_transport",
        "car lease": "car_lease",
        "petrol": "petrol_diesel",
        "diesel": "petrol_diesel",
        "fuel": "petrol_diesel",
        "ev charge": "petrol_diesel",
        "dart charge": "dart_charge",
        "congestion": "dart_charge",
        "parking": "dart_charge",
        "tolls": "tolls",
        "toll": "tolls",
        "tickets": "tickets",
        "fine": "tickets",
        "fines": "tickets",
        "loan": "loan_payoff",
        "interest": "interest",
        "fees": "interest",
        "fee": "interest",
        "charges": "interest",
        "charge": "interest",
        "investments": "investments",
        "investing": "investments",
        "cash": "petty_cash",
        "atm": "petty_cash",
        "withdrawal": "petty_cash",
        "miscellaneous": "miscellaneous",
        "other": "miscellaneous",
        "general": "miscellaneous",
        "shopping": "miscellaneous",
        "shop": "miscellaneous",
        "amazon": "miscellaneous",
        "entertainment": "miscellaneous",
        "fun": "miscellaneous",
        "cinema": "miscellaneous",
        "streaming": "miscellaneous",
        "subscriptions": "miscellaneous",
        "sub": "miscellaneous",
        "travel": "miscellaneous",
        "flights": "miscellaneous",
        "flight": "miscellaneous",
        "hotel": "miscellaneous",
        "hotels": "miscellaneous",
        "accommodation": "miscellaneous",
        "holiday": "miscellaneous",
        "vacation": "miscellaneous",
        "car hire": "miscellaneous",
        "business": "miscellaneous",
        "office supplies": "miscellaneous",
        "software": "miscellaneous",
        "advertising": "miscellaneous",
        "marketing": "miscellaneous",
        "hobbies": "miscellaneous",
        "hobby": "miscellaneous",
        "books": "miscellaneous",
        "book": "miscellaneous",
        "taxi": "taxi",
        "uber": "taxi",
        "taxis": "taxi",
        "mikva": "mikva",
        "mikvah": "mikva",
        "tax": "taxes",
        "taxes": "taxes",
        "hmrc": "taxes",
        "savings": "upcoming_savings",
        "salary": "salary",
        "wages": "salary",
        "paycheck": "salary",
        "pay": "salary",
        "income": "income",
        "pesach": "miscellaneous",
        "passover": "miscellaneous",
        "purim": "miscellaneous",
        "chanukah": "miscellaneous",
        "succah": "miscellaneous",
        "wedding": "miscellaneous",
        "bar mitzvah": "miscellaneous",
        "bat mitzvah": "miscellaneous",
        "bris": "miscellaneous",
        "engagement": "miscellaneous",
        "gifts": "miscellaneous",
        "gift": "miscellaneous",
        "insurance": "life_insurance",
        "transfer": "miscellaneous",
        "transfers": "miscellaneous",
        "electronics": "miscellaneous",
        "electrical": "miscellaneous",
        "utilities": "house_supplies",
        "bills": "house_supplies",
        "internet": "miscellaneous",
        "broadband": "miscellaneous",
    }

    def _regex_parse_search(q: str) -> dict:
        """Regex-based filter parser as fallback when LLM is unavailable.
        Handles: category keywords, amount bounds (£N, over/under N, more/less than N), date keywords (last week/month/year, this month, March, etc.), type (income/expense/spending)."""
        text = q.lower().strip()
        out: dict = {}

        # Category detection — pick the longest matching keyword (to prefer "subscriptions" over "sub")
        matches = sorted(
            [
                (kw, cat)
                for kw, cat in _SEARCH_CATEGORIES.items()
                if re.search(rf"\b{re.escape(kw)}\b", text)
            ],
            key=lambda x: -len(x[0]),
        )
        if matches:
            out["category"] = matches[0][1]

        # Type detection
        if (
            re.search(r"\b(income|salary|wages|paycheck|earnings|deposits? in)\b", text)
            and "category" not in out
        ):
            out["type"] = "income"
        elif re.search(
            r"\b(expense|expenses|spending|spent|purchases?|paid out)\b", text
        ):
            out["type"] = "expense"

        # Amount bounds: "over £100", "under £50", "more than £20", "less than £10", "above £X", "below £X"
        m = re.search(
            r"\b(over|above|more than|greater than|>=?)\s*[£$]?\s*(\d+(?:\.\d+)?)\b",
            text,
        )
        if m:
            out["amount_min"] = float(m.group(2))
            out["amount_comparator"] = "over"
        m = re.search(
            r"\b(under|below|less than|<=?)\s*[£$]?\s*(\d+(?:\.\d+)?)\b", text
        )
        if m:
            out["amount_max"] = float(m.group(2))
            out["amount_comparator"] = "under"
        # Price adjectives
        if (
            re.search(r"\b(expensive|large|big|high value)\b", text)
            and "amount_min" not in out
        ):
            out["amount_min"] = 50
            out["amount_comparator"] = "over"
        if (
            re.search(r"\b(cheap|small|low value|minor)\b", text)
            and "amount_max" not in out
        ):
            out["amount_max"] = 20
            out["amount_comparator"] = "under"
        # Bare amount filter: "£100", "100 pounds"
        m = re.search(r"[£$]\s*(\d+(?:\.\d+)?)\b", text)
        if m and "amount_min" not in out and "amount_max" not in out:
            out["amount_min"] = float(m.group(1))

        # Date detection (relative)
        now = datetime.now(timezone.utc)
        if re.search(r"\btoday\b", text):
            out["date_from"] = now.strftime("%Y-%m-%d")
            out["date_to"] = now.strftime("%Y-%m-%d")
        elif re.search(r"\byesterday\b", text):
            d = now - timedelta(days=1)
            out["date_from"] = d.strftime("%Y-%m-%d")
            out["date_to"] = d.strftime("%Y-%m-%d")
        elif re.search(r"\bthis week\b|\bcurrent week\b", text):
            d = now - timedelta(days=now.weekday())
            out["date_from"] = d.strftime("%Y-%m-%d")
        elif re.search(r"\blast week\b|\bprevious week\b", text):
            d = now - timedelta(days=now.weekday() + 7)
            out["date_from"] = d.strftime("%Y-%m-%d")
            out["date_to"] = (d + timedelta(days=6)).strftime("%Y-%m-%d")
        elif re.search(r"\bthis month\b|\bcurrent month\b", text):
            out["date_from"] = now.replace(day=1).strftime("%Y-%m-%d")
        elif re.search(r"\blast month\b|\bprevious month\b", text):
            first = now.replace(day=1)
            prev_last = first - timedelta(days=1)
            out["date_from"] = prev_last.replace(day=1).strftime("%Y-%m-%d")
            out["date_to"] = prev_last.strftime("%Y-%m-%d")
        elif re.search(r"\bthis year\b|\bcurrent year\b", text):
            out["date_from"] = now.replace(month=1, day=1).strftime("%Y-%m-%d")
        elif re.search(r"\blast year\b|\bprevious year\b", text):
            last = now.year - 1
            out["date_from"] = f"{last}-01-01"
            out["date_to"] = f"{last}-12-31"
        elif m := re.search(
            r"\blast\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)\b", text
        ):
            n, unit = int(m.group(1)), m.group(2)
            days = (
                n
                * {
                    "day": 1,
                    "days": 1,
                    "week": 7,
                    "weeks": 7,
                    "month": 30,
                    "months": 30,
                    "year": 365,
                    "years": 365,
                }[unit]
            )
            d = now - timedelta(days=days)
            out["date_from"] = d.strftime("%Y-%m-%d")
            out["date_to"] = now.strftime("%Y-%m-%d")
        else:
            # Month name detection (e.g. "in March", "March 2024", "from January")
            months = {
                m_: i + 1
                for i, m_ in enumerate(
                    [
                        "january",
                        "february",
                        "march",
                        "april",
                        "may",
                        "june",
                        "july",
                        "august",
                        "september",
                        "october",
                        "november",
                        "december",
                    ]
                )
            }
            for name, num in months.items():
                if re.search(rf"\b{name}\b", text):
                    yr_match = re.search(r"\b(20\d{2})\b", text)
                    yr = int(yr_match.group(1)) if yr_match else now.year
                    start = datetime(yr, num, 1, tzinfo=timezone.utc)
                    end_m = num + 1 if num < 12 else 1
                    end_y = yr if num < 12 else yr + 1
                    end = datetime(end_y, end_m, 1, tzinfo=timezone.utc)
                    out["date_from"] = start.strftime("%Y-%m-%d")
                    out["date_to"] = (end - timedelta(days=1)).strftime("%Y-%m-%d")
                    break

        # Sort detection
        if re.search(r"\b(biggest|largest|highest|most expensive|most)\b", text):
            out["sort"] = "amount_desc"
        elif re.search(r"\b(smallest|lowest|cheapest|least)\b", text):
            out["sort"] = "amount_asc"
        elif re.search(r"\bnewest|latest|recent\b", text):
            out["sort"] = "date_desc"
        elif re.search(r"\b(oldest|earliest|first)\b", text):
            out["sort"] = "date_asc"

        # Merchant keyword detection
        _MERCHANT_ALIASES = {
            "tesco": ["tesco", "tescos", "tesco store"],
            "sainsbury": ["sainsbury", "sainsburys", "sains", "sainsbury's"],
            "asda": ["asda"],
            "waitrose": ["waitrose", "waitrose & partners", "waitrose and partners"],
            "lidl": ["lidl"],
            "aldi": ["aldi"],
            "mcdonald": [
                "mcdonald",
                "mcdonalds",
                "mcd",
                "mc donald",
                "mc donalds",
                "maccies",
            ],
            "amazon": ["amazon", "amzn"],
            "uber": ["uber", "uber eats", "uber trip"],
            "netflix": ["netflix", "netflix.com"],
            "spotify": ["spotify"],
            "pret": ["pret", "pret a manger", "pret a manger"],
            "starbucks": ["starbucks", "starbucks coffee"],
            "hmrc": ["hmrc", "taxman", "inland revenue"],
            "tfl": ["tfl", "transport for london", "oyster"],
            "shell": ["shell", "shell petrol"],
            "bp": ["bp", "bp petrol"],
            "trainline": ["trainline", "the train line"],
            "boots": ["boots", "boots pharmacy", "boots the chemist"],
            "argos": ["argos"],
            "ikea": ["ikea"],
            "currys": ["currys", "currys pc world"],
        }
        merchant_matches = [
            name
            for name, aliases in _MERCHANT_ALIASES.items()
            if any(a in text for a in aliases)
        ]
        if merchant_matches:
            out["merchant_keywords"] = merchant_matches[:5]

        # Aggregate detection: "how much did I spend", "total", "sum"
        if re.search(
            r"\b(how much|total spent|total spend|sum of|what did i spend|spending on)\b",
            text,
        ):
            out["aggregate"] = "how_much"
        elif re.search(r"\b(how many|count of|number of)\b", text):
            out["aggregate"] = "count"

        # Comparative detection: "compare", "vs", "versus", "difference between"
        if (
            re.search(r"\b(compare|comparison|vs\.?|versus|difference between)\b", text)
            and out.get("date_from")
            and out.get("date_to")
        ):
            out["comparative"] = True

        return out

    @router.post("/transactions/ai-search")
    async def ai_search(
        request: Request, user: dict = Depends(get_current_user), q: str = Query("")
    ):
        """Two-pass natural language transaction search.
        1. LLM extracts structured filters (date range, category, amount, type, merchant keywords) from the query.
        2. Server applies filters to the DB and returns matches, optionally re-ranked by LLM.
        Falls back to a regex-based parser if the LLM is unavailable."""
        clean_q = sanitize_input(q.strip(), max_len=200)
        if not clean_q:
            return {"query": q, "transactions": [], "total": 0, "filters": {}}
        sm = request.app.state.db
        async with sm() as session:
            filters: dict = {}
            llm_used = False
            try:
                today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                filter_resp, provider, model, pt, ct, cost = await call_llm(
                    "You are a UK personal finance search assistant. Understand what the user wants, think step by step, "
                    "then output structured JSON filters. Today is " + today_str + ".",
                    f"""User query: "{clean_q}"

First, understand what they're looking for:
- Are they asking about a specific category? (groceries, dining, transport, utilities, subscriptions, tzedakah, rent, shopping, health, entertainment, insurance, education, transfer, cash, tax, fees, mortgage, salary, income)
- Are they asking about income or expenses?
- Is there a time frame mentioned? (today, yesterday, this week, last week, this month, last month, this year, last year, March, January 2025, last 3 months, etc.) Be precise with dates — today is {today_str}.
- Is there a specific merchant or shop mentioned? (tesco, uber, amazon, netflix, etc.) Expand partial names — "sains" = "sainsbury", "McD" = "mcdonald"
- Is there an amount hint? (over/under £X, cheap=low amount, expensive=high amount, large=high, small=low)
- Do they want sorting? (biggest/largest=amount descending, smallest/cheapest=amount ascending, newest/recent=date descending, oldest=date ascending)
- Are they asking for a comparison? ("compare dining this month vs last month", "difference between" → return comparative=true with two date sets)
- Are they asking for a total/summary? ("how much did I spend on X", "total" → return aggregate=true)

Common merchant synonyms:
- uber/uber eats/uber trip → "uber" — if food order use dining, if trip use transport
- sains/sainsburys → "sainsbury"
- mcDs/mcdonalds → "mcdonald"
- amzn/amazon → "amazon" — amazon prime → subscriptions, amazon non-prime → shopping
- pret → "pret a manger"
- starbucks/costa → coffee shops (dining)
- tfl/oyster → transport
- hmrc/taxman → "hmrc"
- netflix/spotify/disney/apple music → streaming subscriptions

Output ONLY valid JSON, no markdown, no explanation:
{{
  "category": "category or null",
  "type": "expense|income|null",
  "date_from": "YYYY-MM-DD or null",
  "date_to": "YYYY-MM-DD or null",
  "amount_min": number or null,
  "amount_max": number or null,
  "amount_comparator": "over|under|null — use 'over' if user said 'expensive'/'big'/'large' or 'over £X', use 'under' if 'cheap'/'small'/'under £X'",
  "merchant_keywords": ["keyword1", "keyword2"] or [],
  "search_text": "free text to search descriptions for, or null",
  "sort": "amount_desc|amount_asc|date_desc|date_asc|null",
  "aggregate": "how_much|count|null — 'how_much' if they want total spend, 'count' if they want number of transactions",
  "comparative": "true|false — true if comparing two periods",
  "limit": 50
}}""",
                    temperature=0.1,
                    max_tokens=600,
                    json_mode=False,
                )
                try:
                    await track_ai_usage(
                        session,
                        user["user_id"],
                        provider,
                        model,
                        pt,
                        ct,
                        cost,
                        endpoint="ai_search",
                    )
                except Exception:
                    pass
                try:
                    parsed = (
                        parse_json(filter_resp)
                        if isinstance(filter_resp, str)
                        else filter_resp
                    )
                    if isinstance(parsed, dict):
                        filters = parsed
                        llm_used = True
                except Exception:
                    pass
            except Exception as e:
                logger.warning(f"AI search LLM failed, using regex fallback: {e}")

            # Regex fallback (or supplement) when LLM unavailable or returned nothing useful
            if not filters:
                filters = _regex_parse_search(clean_q)
            else:
                # Merge any missing fields from regex parser (so simple phrases still get date ranges)
                for k, v in _regex_parse_search(clean_q).items():
                    filters.setdefault(k, v)

            stmt = select(Transaction).where(Transaction.user_id == user["user_id"])
            cat = filters.get("category")
            if cat and cat != "null":
                stmt = stmt.where(Transaction.category == cat)
            t = filters.get("type")
            if t == "expense":
                stmt = stmt.where(Transaction.amount < 0)
            elif t == "income":
                stmt = stmt.where(Transaction.amount > 0)
            df = filters.get("date_from")
            if df and df != "null":
                try:
                    stmt = stmt.where(Transaction.date >= datetime.fromisoformat(df))
                except Exception:
                    pass
            dto = filters.get("date_to")
            if dto and dto != "null":
                try:
                    stmt = stmt.where(
                        Transaction.date
                        <= datetime.fromisoformat(dto) + timedelta(days=1)
                    )
                except Exception:
                    pass
            amin = filters.get("amount_min")
            if amin is not None and amin != "null":
                try:
                    v = abs(float(amin))
                    amt_comp = filters.get("amount_comparator")
                    if amt_comp == "under":
                        stmt = stmt.where(func.abs(Transaction.amount) <= v)
                    else:
                        stmt = stmt.where(func.abs(Transaction.amount) >= v)
                except Exception:
                    pass
            amax = filters.get("amount_max")
            if amax is not None and amax != "null":
                try:
                    stmt = stmt.where(func.abs(Transaction.amount) <= abs(float(amax)))
                except Exception:
                    pass
            keywords = filters.get("merchant_keywords") or []
            if isinstance(keywords, list) and keywords:
                from sqlalchemy import or_ as _or

                kw_filters = []
                for kw in keywords[:5]:
                    if isinstance(kw, str) and kw.strip():
                        pattern = f"%{kw.strip().lower()}%"
                        kw_filters.append(
                            func.lower(Transaction.description).like(pattern)
                        )
                        kw_filters.append(
                            func.lower(Transaction.merchant_name).like(pattern)
                        )
                        kw_filters.append(
                            func.lower(Transaction.normalized_merchant).like(pattern)
                        )
                if kw_filters:
                    stmt = stmt.where(_or(*kw_filters))
            search_text = filters.get("search_text")
            if (
                not search_text
                and not keywords
                and not filters.get("category")
                and not filters.get("type")
            ):
                # Nothing structured matched — fall back to free-text search over the original query
                search_text = clean_q
            if search_text and search_text != "null":
                pattern = f"%{str(search_text).lower()}%"
                stmt = stmt.where(
                    _or(
                        func.lower(Transaction.description).like(pattern),
                        func.lower(Transaction.merchant_name).like(pattern),
                        func.lower(Transaction.normalized_merchant).like(pattern),
                        func.lower(Transaction.category).like(pattern),
                        func.lower(Transaction.notes).like(pattern),
                    )
                )
            sort = filters.get("sort")
            if sort == "amount_desc":
                stmt = stmt.order_by(Transaction.amount.desc())
            elif sort == "amount_asc":
                stmt = stmt.order_by(Transaction.amount.asc())
            elif sort == "date_asc":
                stmt = stmt.order_by(Transaction.date.asc())
            else:
                stmt = stmt.order_by(Transaction.date.desc())
            try:
                limit_n = min(int(filters.get("limit") or 50), 200)
            except Exception:
                limit_n = 50
            stmt = stmt.limit(limit_n)
            result = await session.execute(stmt)
            tx_rows = result.scalars().all()

            conn_ids = list({t.connection_id for t in tx_rows if t.connection_id})
            institution_map = {}
            label_map = {}
            if conn_ids:
                from db import BankConnection

                bc_result = await session.execute(
                    select(
                        BankConnection.connection_id,
                        BankConnection.nickname,
                        BankConnection.account_name,
                        BankConnection.config,
                    ).where(BankConnection.connection_id.in_(conn_ids))
                )
                for bc_row in bc_result:
                    cfg = bc_row.config or {}
                    inst = cfg.get("institution") if isinstance(cfg, dict) else None
                    inst = inst or bc_row.account_name
                    if inst:
                        institution_map[bc_row.connection_id] = inst
                    lbl = bc_row.nickname or bc_row.account_name or inst
                    if lbl:
                        label_map[bc_row.connection_id] = lbl

            txs = [_tx_to_dict(t, institution_map, label_map) for t in tx_rows]

            # Build response
            resp = {
                "query": q,
                "filters": filters,
                "transactions": txs,
                "total": len(txs),
                "llm_used": llm_used,
            }

            # Aggregate: compute summary if user asked for totals
            agg_type = filters.get("aggregate")
            if agg_type in ("how_much", "count", "total"):
                total_income = sum(t["amount"] for t in txs if t["amount"] > 0)
                total_spend = sum(abs(t["amount"]) for t in txs if t["amount"] < 0)
                net = total_income - total_spend
                resp["aggregate"] = {
                    "total_income": round(total_income, 2),
                    "total_spend": round(total_spend, 2),
                    "net": round(net, 2),
                    "count": len(txs),
                }

            # Comparative: return two result sets if comparing periods
            if str(filters.get("comparative", "")).lower() == "true" and df and dto:
                resp["comparative"] = True
                # Build a second query for the period before
                df_dt = datetime.fromisoformat(df)
                dto_dt = datetime.fromisoformat(dto)
                period_days = (dto_dt - df_dt).days
                prev_to = df_dt - timedelta(days=1)
                prev_from = prev_to - timedelta(days=period_days)
                prev_stmt = select(Transaction).where(
                    Transaction.user_id == user["user_id"]
                )
                if cat and cat != "null":
                    prev_stmt = prev_stmt.where(Transaction.category == cat)
                if t == "expense":
                    prev_stmt = prev_stmt.where(Transaction.amount < 0)
                elif t == "income":
                    prev_stmt = prev_stmt.where(Transaction.amount > 0)
                try:
                    prev_stmt = prev_stmt.where(
                        Transaction.date >= prev_from,
                        Transaction.date <= prev_to + timedelta(days=1),
                    )
                except Exception:
                    pass
                prev_result = await session.execute(prev_stmt)
                prev_txs = [_tx_to_dict(t) for t in prev_result.scalars().all()]
                prev_income = sum(t["amount"] for t in prev_txs if t["amount"] > 0)
                prev_spend = sum(abs(t["amount"]) for t in prev_txs if t["amount"] < 0)
                resp["previous_period"] = {
                    "date_from": prev_from.strftime("%Y-%m-%d"),
                    "date_to": prev_to.strftime("%Y-%m-%d"),
                    "total_income": round(prev_income, 2),
                    "total_spend": round(prev_spend, 2),
                    "net": round(prev_income - prev_spend, 2),
                    "count": len(prev_txs),
                }

            return resp

    @router.post("/transactions")
    async def create_transaction(
        payload: TransactionIn, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            # Validate account_id exists
            acct_result = await session.execute(
                select(BankAccount).where(
                    BankAccount.account_id == payload.account_id,
                    BankAccount.user_id == user["user_id"],
                )
            )
            if not acct_result.scalar_one_or_none():
                raise HTTPException(400, f"Account '{payload.account_id}' not found or does not belong to you")

            tx_id = f"tx_{uuid.uuid4().hex[:12]}"
            desc = payload.description or ""
            merch = payload.merchant or ""
            category = payload.category or smart_categorize(f"{desc} {merch}")
            from statements import resolve_category as _rc

            category = _rc(category)
            if category == "uncategorized":
                # Fast path: keyword match
                from statements import _keyword_categorise as kw_cat

                fast = kw_cat(desc, merch, payload.amount)
                if fast:
                    category = fast
                else:
                    from llm import call_llm
                    from llm import parse_json as llm_parse
                    from llm import track_ai_usage as track_usage

                    try:
                        raw, provider, model, pt, ct, cost = await call_llm(
                            "You categorise UK transactions. Output valid JSON only.",
                            CATEGORISE_PROMPT_FE.format(
                                description=desc[:100],
                                merchant=merch or "unknown",
                                amount=payload.amount,
                            ),
                            json_mode=False,
                        )
                        await track_usage(
                            session,
                            user["user_id"],
                            provider,
                            model,
                            pt,
                            ct,
                            cost,
                            endpoint="manual_categorize",
                        )
                        ai_cat = (
                            str(llm_parse(raw).get("category", "uncategorized"))
                            .lower()
                            .strip()
                        )
                        if ai_cat in ALL_CATEGORIES and ai_cat != "uncategorized":
                            category = ai_cat
                    except Exception:
                        pass
            normalized = normalize_merchant(merch or desc)
            signed_amount = (
                abs(payload.amount) if payload.is_income else -abs(payload.amount)
            )
            balance_type = payload.balance_type or "available"
            if balance_type not in ("available", "savings"):
                balance_type = "available"

            tx = Transaction(
                transaction_id=tx_id,
                user_id=user["user_id"],
                amount=signed_amount,
                currency=payload.currency,
                description=desc,
                merchant_name=merch or None,
                normalized_merchant=normalized,
                category=category,
                date=datetime.fromisoformat(payload.date)
                if payload.date
                else datetime.now(timezone.utc),
                account_id=payload.account_id,
                balance_type=balance_type,
                notes=payload.notes,
                tags=payload.tags,
                source=payload.source or "manual",
            )
            session.add(tx)

            # Update account balance
            acct = acct_result.scalar_one_or_none()
            if acct is not None:
                current_balance = float(acct.balance or 0)
                acct.balance = current_balance + signed_amount
                acct.balance_updated_at = datetime.now(timezone.utc)

            await session.commit()
            await session.refresh(tx)
            doc = _tx_to_dict(tx)
            accrued = await maaser.maybe_accrue(session, user["user_id"], doc)
            if accrued:
                doc["maaser_accrued"] = accrued
            _query_cache.delete(f"dash:{user['user_id']}")
            _query_cache.delete_by_prefix(f"trends:{user['user_id']}:")
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return doc

    @router.patch("/transactions/{tx_id}")
    async def update_transaction(
        tx_id: str,
        payload: TransactionUpdate,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(
                    Transaction.transaction_id == tx_id,
                    Transaction.user_id == user["user_id"],
                )
            )
            tx = result.scalar_one_or_none()
            if not tx:
                raise HTTPException(404, "Not found")

            # Validate account_id if changing
            if payload.account_id is not None and payload.account_id != tx.account_id:
                acct_result = await session.execute(
                    select(BankAccount).where(
                        BankAccount.account_id == payload.account_id,
                        BankAccount.user_id == user["user_id"],
                    )
                )
                if not acct_result.scalar_one_or_none():
                    raise HTTPException(400, f"Account '{payload.account_id}' not found")
                tx.account_id = payload.account_id

            if payload.amount is not None:
                tx.amount = payload.amount
            if payload.description is not None:
                tx.description = payload.description
            if payload.merchant is not None:
                tx.merchant_name = payload.merchant
                tx.normalized_merchant = normalize_merchant(payload.merchant)
            category_changed = False
            old_category = tx.category
            if payload.category is not None and payload.category != tx.category:
                from statements import resolve_category as _rc

                tx.category = _rc(payload.category)
                category_changed = True
            if payload.date is not None:
                tx.date = datetime.fromisoformat(payload.date)
            if payload.notes is not None:
                tx.notes = payload.notes
            if payload.tags is not None:
                tx.tags = payload.tags
            if payload.pending is not None:
                tx.pending = payload.pending
            if payload.balance_type is not None:
                if payload.balance_type in ("available", "savings"):
                    tx.balance_type = payload.balance_type
            if payload.exclude_from_maaser is not None:
                tx.exclude_from_maaser = payload.exclude_from_maaser
            if category_changed:
                await _learn_category_rule(session, user["user_id"], tx, tx.category)
            await session.commit()
            await session.refresh(tx)
            doc = _tx_to_dict(tx)
            await maaser.maybe_accrue(session, user["user_id"], doc)
            _query_cache.delete(f"dash:{user['user_id']}")
            _query_cache.delete_by_prefix(f"trends:{user['user_id']}:")
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return doc

    @router.delete("/transactions/{tx_id}")
    async def delete_transaction(
        tx_id: str, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(
                    Transaction.transaction_id == tx_id,
                    Transaction.user_id == user["user_id"],
                )
            )
            tx = result.scalar_one_or_none()
            if not tx:
                raise HTTPException(404, "Not found")
            await session.execute(
                delete(SplitTransaction).where(
                    SplitTransaction.parent_transaction_id == tx_id
                )
            )
            from db import MaaserLedger

            await session.execute(
                delete(MaaserLedger).where(
                    MaaserLedger.transaction_id == tx_id,
                    MaaserLedger.user_id == user["user_id"],
                )
            )
            await session.delete(tx)
            await session.commit()
            _query_cache.delete(f"dash:{user['user_id']}")
            _query_cache.delete_by_prefix(f"trends:{user['user_id']}:")
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return {"ok": True}

    class BulkDeleteByQueryIn(BaseModel):
        source: Optional[str] = None
        category: Optional[str] = None
        tx_type: Optional[str] = None
        search: Optional[str] = None
        date_from: Optional[str] = None
        date_to: Optional[str] = None

    @router.post("/transactions/bulk-delete")
    async def bulk_delete(
        payload: BulkUpdateIn, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(
                    Transaction.transaction_id.in_(payload.transaction_ids),
                    Transaction.user_id == user["user_id"],
                )
            )
            records = result.scalars().all()
            backup = [
                {
                    "transaction_id": r.transaction_id,
                    "user_id": r.user_id,
                    "amount": r.amount,
                    "description": r.description,
                    "category": r.category,
                    "date": r.date.isoformat() if r.date else None,
                    "tx_type": r.tx_type,
                    "source": r.source,
                    "pending": r.pending,
                    "notes": r.notes,
                    "merchant_name": r.merchant_name,
                }
                for r in records
            ]
            await session.execute(
                delete(SplitTransaction).where(
                    SplitTransaction.parent_transaction_id.in_(payload.transaction_ids),
                    SplitTransaction.user_id == user["user_id"],
                )
            )
            from db import MaaserLedger

            await session.execute(
                delete(MaaserLedger).where(
                    MaaserLedger.transaction_id.in_(payload.transaction_ids),
                    MaaserLedger.user_id == user["user_id"],
                )
            )
            result = await session.execute(
                delete(Transaction)
                .where(
                    Transaction.transaction_id.in_(payload.transaction_ids),
                    Transaction.user_id == user["user_id"],
                )
                .returning(Transaction.transaction_id)
            )
            deleted = len(result.fetchall())
            await session.commit()
            _query_cache.delete(f"dash:{user['user_id']}")
            _query_cache.delete_by_prefix(f"trends:{user['user_id']}:")
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return {"ok": True, "deleted": deleted, "backup": backup}

    @router.post("/transactions/undo-bulk-delete")
    async def undo_bulk_delete(
        payload: BulkUpdateIn, request: Request, user: dict = Depends(get_current_user)
    ):
        return {
            "ok": True,
            "restored": 0,
            "info": "Full undo requires soft-delete migration",
        }

    @router.post("/transactions/bulk-category")
    async def bulk_category(
        payload: BulkUpdateIn, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            values = {}
            if payload.category is not None:
                values["category"] = payload.category
            if values:
                await session.execute(
                    update(Transaction)
                    .where(
                        Transaction.transaction_id.in_(payload.transaction_ids),
                        Transaction.user_id == user["user_id"],
                    )
                    .values(**values)
                )
                await session.commit()
            _query_cache.delete(f"dash:{user['user_id']}")
            _query_cache.delete_by_prefix(f"trends:{user['user_id']}:")
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return {
                "ok": True,
                "updated": len(payload.transaction_ids) if values else 0,
            }

    @router.post("/transactions/clear")
    async def clear_transactions(
        payload: BulkDeleteByQueryIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            base = select(Transaction).where(Transaction.user_id == user["user_id"])
            if payload.source:
                base = base.where(Transaction.source == payload.source)
            if payload.category:
                base = base.where(Transaction.category == payload.category)
            if payload.tx_type == "income":
                base = base.where(Transaction.amount > 0)
            elif payload.tx_type == "expense":
                base = base.where(Transaction.amount < 0)
            if payload.search:
                base = base.where(Transaction.description.ilike(f"%{payload.search}%"))
            if payload.date_from:
                base = base.where(
                    Transaction.date >= datetime.fromisoformat(payload.date_from)
                )
            if payload.date_to:
                base = base.where(
                    Transaction.date
                    <= datetime.fromisoformat(payload.date_to) + timedelta(days=1)
                )
            # Fetch matching IDs, delete splits first, then transactions
            ids_result = await session.execute(
                base.with_only_columns(Transaction.transaction_id)
            )
            ids = [row[0] for row in ids_result.fetchall()]
            if ids:
                await session.execute(
                    delete(SplitTransaction).where(
                        SplitTransaction.parent_transaction_id.in_(ids),
                        SplitTransaction.user_id == user["user_id"],
                    )
                )
                from db import MaaserLedger

                await session.execute(
                    delete(MaaserLedger).where(
                        MaaserLedger.transaction_id.in_(ids),
                        MaaserLedger.user_id == user["user_id"],
                    )
                )
                result = await session.execute(
                    delete(Transaction).where(Transaction.transaction_id.in_(ids))
                )
            else:
                result = None
            await session.commit()
            _query_cache.delete(f"dash:{user['user_id']}")
            _query_cache.delete_by_prefix(f"trends:{user['user_id']}:")
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            deleted = result.rowcount if result else 0
            return {"ok": True, "deleted": deleted}

    @router.post("/transactions/bulk-update")
    async def bulk_update(
        payload: BulkUpdateIn, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            values = {}
            if payload.category is not None:
                values["category"] = payload.category
            if payload.exclude_from_maaser is not None:
                values["exclude_from_maaser"] = payload.exclude_from_maaser
            if payload.pending is not None:
                values["pending"] = payload.pending
            if values:
                await session.execute(
                    update(Transaction)
                    .where(
                        Transaction.transaction_id.in_(payload.transaction_ids),
                        Transaction.user_id == user["user_id"],
                    )
                    .values(**values)
                )
                await session.commit()
            _query_cache.delete(f"dash:{user['user_id']}")
            _query_cache.delete_by_prefix(f"trends:{user['user_id']}:")
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return {"ok": True, "updated": len(payload.transaction_ids)}

    @router.post("/transactions/seed-demo")
    async def seed_demo(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.user_id == user["user_id"])
            )
            existing = result.scalar() or 0
            if existing > 0:
                return {"ok": True, "skipped": True}
            from statements import resolve_category as _rc

            # Create a default demo account
            demo_acct_id = f"acct_{uuid.uuid4().hex[:12]}"
            demo_acct = BankAccount(
                account_id=demo_acct_id,
                user_id=user["user_id"],
                name="Demo Bank Account",
                type="current",
                balance=0,
                currency="GBP",
                color="#059669",
                provider="manual",
                is_offline=True,
            )
            session.add(demo_acct)

            sample = [
                ("Tesco Express", -42.50, "grocery"),
                ("Salary - Acme Ltd", 3200.00, "salary"),
                ("TfL Travel", -7.20, "public_transport"),
                ("Netflix - Monthly", -10.99, "miscellaneous"),
                ("Octopus Energy", -85.40, "electricity"),
                ("Chesed Fund", -36.00, "charity"),
                ("Deliveroo", -22.15, "takeaway"),
                ("Sainsbury's", -68.30, "grocery"),
                ("Apple iCloud", -2.99, "miscellaneous"),
                ("Rent", -1450.00, "rent_mortgage"),
                ("Trainline", -38.50, "public_transport"),
                ("Yeshiva Donation", -100.00, "other_charity"),
                ("Amazon.co.uk", -15.99, "miscellaneous"),
                ("PureGym Monthly", -29.99, "miscellaneous"),
                ("Council Tax", -185.00, "council_tax"),
            ]
            now = datetime.now(timezone.utc)
            running_balance = 0
            for i, (desc, amt, cat) in enumerate(sample):
                merch = desc.split(" - ")[0] if " - " in desc else desc
                tx = Transaction(
                    transaction_id=f"tx_{uuid.uuid4().hex[:12]}",
                    user_id=user["user_id"],
                    amount=amt,
                    currency="GBP",
                    description=desc,
                    merchant_name=merch,
                    normalized_merchant=normalize_merchant(merch),
                    category=cat,
                    account_id=demo_acct_id,
                    date=(now - timedelta(days=i * 3)),
                )
                session.add(tx)
                running_balance += amt
            demo_acct.balance = running_balance
            demo_acct.balance_updated_at = now
            await session.commit()
            await maaser.backfill_for_user(session, user["user_id"])
            _query_cache.delete(f"dash:{user['user_id']}")
            _query_cache.delete_by_prefix(f"trends:{user['user_id']}:")
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return {"ok": True, "inserted": len(sample)}

    # ── Split transactions ───────────────────────────────────────────

    @router.post("/transactions/{tx_id}/split")
    async def split_transaction(
        tx_id: str,
        payload: SplitIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(
                    Transaction.transaction_id == tx_id,
                    Transaction.user_id == user["user_id"],
                )
            )
            tx = result.scalar_one_or_none()
            if not tx:
                raise HTTPException(404, "Not found")
            total_split = sum(s["amount"] for s in payload.splits)
            if abs(total_split - abs(tx.amount)) > 0.01:
                raise HTTPException(
                    400,
                    f"Split amounts (${total_split:.2f}) must equal original amount (${abs(tx.amount):.2f})",
                )
            await session.execute(
                delete(SplitTransaction).where(
                    SplitTransaction.parent_transaction_id == tx_id
                )
            )
            for s in payload.splits:
                st = SplitTransaction(
                    split_id=f"spl_{uuid.uuid4().hex[:12]}",
                    parent_transaction_id=tx_id,
                    user_id=user["user_id"],
                    amount=s["amount"],
                    category=s.get("category"),
                    description=s.get("description"),
                )
                session.add(st)
            await session.commit()
            return {"ok": True, "splits": payload.splits}

    @router.get("/transactions/{tx_id}/splits")
    async def get_splits(
        tx_id: str, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(SplitTransaction).where(
                    SplitTransaction.parent_transaction_id == tx_id,
                    SplitTransaction.user_id == user["user_id"],
                )
            )
            splits = result.scalars().all()
            return {
                "splits": [
                    {
                        "split_id": s.split_id,
                        "amount": s.amount,
                        "category": s.category,
                        "description": s.description,
                        "notes": s.notes,
                    }
                    for s in splits
                ]
            }

    # ── Recurring detection ──────────────────────────────────────────

    @router.post("/transactions/detect-recurring")
    async def detect_recurring(
        request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction)
                .where(
                    Transaction.user_id == user["user_id"],
                    Transaction.amount < 0,
                )
                .order_by(Transaction.date.desc())
                .limit(500)
            )
            txs = [_tx_to_dict(t) for t in result.scalars().all()]
            patterns = detect_recurring_txns(txs)
            return {"recurring": patterns}

    @router.get("/transactions/recurring")
    async def list_recurring(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(RecurringTransaction).where(
                    RecurringTransaction.user_id == user["user_id"],
                    RecurringTransaction.active == True,
                )
            )
            items = result.scalars().all()
            return {
                "recurring": [
                    {
                        "id": r.id,
                        "description": r.description,
                        "amount": r.amount,
                        "category": r.category,
                        "frequency": r.frequency,
                        "next_date": r.next_date.isoformat() if r.next_date else None,
                        "active": r.active,
                    }
                    for r in items
                ]
            }

    # ── Merchant normalization ───────────────────────────────────────

    @router.post("/transactions/normalize-merchants")
    async def normalize_merchants(
        request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.normalized_merchant.is_(None),
                )
            )
            txs = result.scalars().all()
            count = 0
            for tx in txs:
                source = tx.merchant_name or tx.description or ""
                normalized = normalize_merchant(source)
                if normalized and normalized != source:
                    tx.normalized_merchant = normalized
                    tx.category = tx.category or smart_categorize(normalized)
                    count += 1
            await session.commit()
            return {"ok": True, "normalized": count}

    # ── Subscriptions ───────────────────────────────────────────────

    @router.get("/subscriptions")
    async def list_subscriptions(
        request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Subscription)
                .where(Subscription.user_id == user["user_id"])
                .order_by(Subscription.active.desc(), Subscription.name)
            )
            subs = result.scalars().all()
            return {
                "subscriptions": [
                    {
                        "subscription_id": s.subscription_id,
                        "name": s.name,
                        "amount": float(s.amount),
                        "currency": s.currency,
                        "category": s.category,
                        "merchant": s.merchant,
                        "frequency": s.frequency,
                        "next_billing": s.next_billing.isoformat()
                        if s.next_billing
                        else None,
                        "active": s.active,
                        "notes": s.notes,
                    }
                    for s in subs
                ]
            }

    @router.post("/subscriptions")
    async def create_subscription(
        payload: dict, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            sub = Subscription(
                subscription_id=f"sub_{uuid.uuid4().hex[:12]}",
                user_id=user["user_id"],
                name=payload["name"],
                amount=abs(payload["amount"]),
                currency=payload.get("currency", "GBP"),
                category=payload.get("category"),
                merchant=payload.get("merchant"),
                frequency=payload.get("frequency", "monthly"),
                next_billing=payload.get("next_billing"),
                notes=payload.get("notes"),
            )
            session.add(sub)
            await session.commit()
            await session.refresh(sub)
            return {"subscription_id": sub.subscription_id, "name": sub.name}

    @router.patch("/subscriptions/{subscription_id}")
    async def update_subscription(
        subscription_id: str,
        payload: dict,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Subscription).where(
                    Subscription.subscription_id == subscription_id,
                    Subscription.user_id == user["user_id"],
                )
            )
            sub = result.scalar_one_or_none()
            if not sub:
                raise HTTPException(404, "Subscription not found")
            for field in (
                "name",
                "amount",
                "currency",
                "category",
                "merchant",
                "frequency",
                "notes",
            ):
                if field in payload:
                    setattr(sub, field, payload[field])
            if "next_billing" in payload:
                sub.next_billing = payload["next_billing"]
            if "active" in payload:
                sub.active = payload["active"]
            await session.commit()
            return {"ok": True}

    @router.delete("/subscriptions/{subscription_id}")
    async def delete_subscription(
        subscription_id: str, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Subscription).where(
                    Subscription.subscription_id == subscription_id,
                    Subscription.user_id == user["user_id"],
                )
            )
            sub = result.scalar_one_or_none()
            if not sub:
                raise HTTPException(404, "Subscription not found")
            await session.delete(sub)
            await session.commit()
            return {"ok": True}


    # ── Categories ──────────────────────────────────────────────────

    @router.get("/categories")
    async def list_categories(request: Request, user: dict = Depends(get_current_user)):
        cache_key = f"cats:{user['user_id']}"
        cached = _query_cache.get(cache_key)
        if cached:
            return cached

        sm = request.app.state.db
        async with sm() as session:
            rows = (
                (
                    await session.execute(
                        select(Category)
                        .where(Category.user_id == user["user_id"])
                        .order_by(Category.sort_order, Category.name)
                    )
                )
                .scalars()
                .all()
            )
            usage_map = await _category_usage_map(session, user["user_id"])
            categories = combine_categories(rows, usage_map)
            payload = {
                "categories": categories,
                "hierarchy": hierarchy_payload(categories),
            }
            _query_cache.set(cache_key, payload, ttl=120)
            return payload

    @router.post("/categories")
    async def create_category(
        payload: CategoryCreateIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        data = payload.model_dump(exclude_unset=True)
        slug = _normalise_category_slug(
            data.get("name") or data.get("label"), fallback=""
        )
        if not slug:
            raise HTTPException(400, "Category name is required")
        if slug == "uncategorized":
            raise HTTPException(400, "Cannot create a duplicate Uncategorized category")

        sm = request.app.state.db
        async with sm() as session:
            existing = (
                await session.execute(
                    select(Category).where(
                        Category.user_id == user["user_id"],
                        Category.name == slug,
                    )
                )
            ).scalar_one_or_none()
            if existing and not existing.is_archived:
                raise HTTPException(409, "Category already exists")

            cat = await _ensure_category_row(
                session, user["user_id"], slug, row=existing
            )
            _apply_category_payload_to_row(cat, slug, data)
            if data.get("is_income") is None and slug in INCOME_CATEGORIES:
                cat.is_income = True

            await session.commit()
            await session.refresh(cat)
            usage_map = await _category_usage_map(session, user["user_id"])
            _invalidate_category_caches(user["user_id"])
            return {"category": build_category_payload(slug, cat, usage_map.get(slug))}

    @router.patch("/categories/{category_id}")
    async def update_category(
        category_id: str,
        payload: CategoryUpdateIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        data = payload.model_dump(exclude_unset=True)
        sm = request.app.state.db
        async with sm() as session:
            slug, cat, _ = await _resolve_category_entity(
                session, user["user_id"], category_id
            )
            cat = await _ensure_category_row(session, user["user_id"], slug, row=cat)
            _apply_category_payload_to_row(cat, slug, data)
            await session.commit()
            await session.refresh(cat)
            usage_map = await _category_usage_map(session, user["user_id"])
            _invalidate_category_caches(user["user_id"])
            return {"category": build_category_payload(slug, cat, usage_map.get(slug))}

    @router.post("/categories/{category_id}/reassign-delete")
    async def reassign_delete_category(
        category_id: str,
        payload: CategoryReassignDeleteIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            slug, cat, _ = await _resolve_category_entity(
                session, user["user_id"], category_id
            )
            if slug == "uncategorized":
                raise HTTPException(400, "Uncategorized cannot be deleted")

            replacement_ref = (
                payload.replacement_category_id or payload.replacement_category
            )
            replacement_slug = _slug_from_category_identifier(replacement_ref)
            if not replacement_slug:
                raise HTTPException(400, "Replacement category is required")
            if replacement_slug == slug:
                raise HTTPException(400, "Replacement category must be different")

            replacement_row = (
                await session.execute(
                    select(Category).where(
                        Category.user_id == user["user_id"],
                        Category.name == replacement_slug,
                    )
                )
            ).scalar_one_or_none()
            if replacement_row and replacement_row.is_archived:
                replacement_row.is_archived = False

            tx_result = await session.execute(
                update(Transaction)
                .where(
                    Transaction.user_id == user["user_id"], Transaction.category == slug
                )
                .values(category=replacement_slug)
            )
            split_result = await session.execute(
                update(SplitTransaction)
                .where(
                    SplitTransaction.user_id == user["user_id"],
                    SplitTransaction.category == slug,
                )
                .values(category=replacement_slug)
            )
            budget_result = await _reassign_budget_rows(
                session, user["user_id"], slug, replacement_slug
            )
            recurring_result = await session.execute(
                update(RecurringTransaction)
                .where(
                    RecurringTransaction.user_id == user["user_id"],
                    RecurringTransaction.category == slug,
                )
                .values(category=replacement_slug)
            )
            subscription_result = await session.execute(
                update(Subscription)
                .where(
                    Subscription.user_id == user["user_id"],
                    Subscription.category == slug,
                )
                .values(category=replacement_slug)
            )
            rule_result = await session.execute(
                update(CategoryRule)
                .where(
                    CategoryRule.user_id == user["user_id"],
                    CategoryRule.category == slug,
                )
                .values(category=replacement_slug)
            )

            await _archive_category(session, user["user_id"], slug, row=cat)
            await session.commit()

            usage_map = await _category_usage_map(session, user["user_id"])
            _invalidate_category_caches(user["user_id"])
            return {
                "ok": True,
                "deleted": slug,
                "replacement": replacement_slug,
                "reassigned": {
                    "transactions": int(tx_result.rowcount or 0)
                    + int(split_result.rowcount or 0),
                    "budgets": int(budget_result["updated"] + budget_result["merged"]),
                    "recurring": int(recurring_result.rowcount or 0),
                    "subscriptions": int(subscription_result.rowcount or 0),
                    "rules": int(rule_result.rowcount or 0),
                },
                "replacement_category": build_category_payload(
                    replacement_slug,
                    replacement_row,
                    usage_map.get(replacement_slug),
                ),
            }

    @router.delete("/categories/{category_id}")
    async def delete_category(
        category_id: str,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            slug, cat, _ = await _resolve_category_entity(
                session, user["user_id"], category_id
            )
            if slug == "uncategorized":
                raise HTTPException(400, "Uncategorized cannot be deleted")

            usage_map = await _category_usage_map(session, user["user_id"])
            usage = usage_map.get(slug, _default_category_usage())
            if usage.get("total", 0) > 0:
                raise HTTPException(
                    409,
                    f"Category is still in use by {usage['total']} linked items. Reassign it before deleting.",
                )

            await _archive_category(session, user["user_id"], slug, row=cat)
            await session.commit()
            _invalidate_category_caches(user["user_id"])
            return {"ok": True, "archived": True, "category": slug}

    # ── Learned category rules ────────────────────────────────────────

    @router.get("/category-rules")
    async def list_category_rules(
        request: Request, user: dict = Depends(get_current_user)
    ):
        from db import CategoryRule

        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(CategoryRule)
                .where(CategoryRule.user_id == user["user_id"])
                .order_by(
                    CategoryRule.match_count.desc(), CategoryRule.updated_at.desc()
                )
            )
            rules = result.scalars().all()
            return {
                "rules": [
                    {
                        "id": r.id,
                        "merchant": r.merchant,
                        "category": r.category,
                        "match_count": r.match_count,
                        "source": r.source,
                        "last_used_at": r.last_used_at.isoformat()
                        if r.last_used_at
                        else None,
                        "created_at": r.created_at.isoformat()
                        if r.created_at
                        else None,
                    }
                    for r in rules
                ]
            }

    @router.post("/category-rules")
    async def create_category_rule(
        payload: dict, request: Request, user: dict = Depends(get_current_user)
    ):
        from db import CategoryRule

        merchant = (payload.get("merchant") or "").strip().upper()
        category = (payload.get("category") or "").strip().lower()
        if not merchant or not category:
            raise HTTPException(400, "merchant and category are required")
        sm = request.app.state.db
        async with sm() as session:
            existing = await session.execute(
                select(CategoryRule).where(
                    CategoryRule.user_id == user["user_id"],
                    CategoryRule.merchant == merchant,
                )
            )
            rule = existing.scalar_one_or_none()
            if rule:
                rule.category = category
                rule.match_count = (rule.match_count or 0) + 1
                rule.source = "manual"
            else:
                rule = CategoryRule(
                    user_id=user["user_id"],
                    merchant=merchant,
                    category=category,
                    match_count=1,
                    source="manual",
                )
                session.add(rule)
            await session.commit()
            return {"ok": True, "id": rule.id}

    @router.patch("/category-rules/{rule_id}")
    async def update_category_rule(
        rule_id: int,
        payload: dict,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        from db import CategoryRule

        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(CategoryRule).where(
                    CategoryRule.id == rule_id,
                    CategoryRule.user_id == user["user_id"],
                )
            )
            rule = result.scalar_one_or_none()
            if not rule:
                raise HTTPException(404, "Rule not found")
            if "category" in payload:
                rule.category = payload["category"].strip().lower()
            if "merchant" in payload:
                rule.merchant = payload["merchant"].strip().upper()
            await session.commit()
            return {"ok": True}

    @router.delete("/category-rules/{rule_id}")
    async def delete_category_rule(
        rule_id: int, request: Request, user: dict = Depends(get_current_user)
    ):
        from db import CategoryRule

        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(CategoryRule).where(
                    CategoryRule.id == rule_id,
                    CategoryRule.user_id == user["user_id"],
                )
            )
            rule = result.scalar_one_or_none()
            if not rule:
                raise HTTPException(404, "Rule not found")
            await session.delete(rule)
            await session.commit()
            return {"ok": True}

    @router.post("/category-rules/apply")
    async def apply_rules_to_existing(
        request: Request, user: dict = Depends(get_current_user)
    ):
        """Re-categorise all existing transactions using learned rules."""
        from db import CategoryRule

        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(CategoryRule).where(CategoryRule.user_id == user["user_id"])
            )
            rules = {r.merchant: r.category for r in result.scalars().all()}
            if not rules:
                return {"updated": 0}
            tx_result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
            )
            updated = 0
            for tx in tx_result.scalars().all():
                key = _merchant_rule_key(tx)
                if key in rules and tx.category != rules[key]:
                    tx.category = rules[key]
                    updated += 1
            if updated:
                await session.commit()
                _query_cache.delete(f"dash:{user['user_id']}")
            _query_cache.delete_by_prefix(f"trends:{user['user_id']}:")
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return {"updated": updated}

    @router.post("/category-rules/learn")
    async def learn_from_user_feedback(
        payload: dict,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        """Record user feedback on a suggestion. 'action' is 'accept' or 'reject'.
        Accept: increments match_count for the merchant→category mapping.
        Reject: creates/updates with reduced weight or notes the rejection."""
        from db import CategoryRule

        merchant = (payload.get("merchant") or "").lower().strip()
        category = (payload.get("category") or "").lower().strip()
        action = payload.get("action", "accept")
        if not merchant or len(merchant) < 2:
            raise HTTPException(400, "Valid merchant required")
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(CategoryRule).where(
                    CategoryRule.user_id == user["user_id"],
                    CategoryRule.merchant == merchant,
                    CategoryRule.category == category,
                )
            )
            rule = result.scalar_one_or_none()
            if action == "accept":
                if rule:
                    rule.match_count = (rule.match_count or 0) + 1
                    rule.last_used_at = datetime.now(timezone.utc)
                else:
                    rule = CategoryRule(
                        user_id=user["user_id"],
                        merchant=merchant,
                        category=category,
                        match_count=1,
                        source="user_approved",
                    )
                    session.add(rule)
                await session.commit()
                return {"ok": True, "new_count": rule.match_count}
            elif action == "reject":
                # Decrement if exists, or create with negative signal
                if rule:
                    rule.match_count = max(0, (rule.match_count or 1) - 1)
                    rule.last_used_at = datetime.now(timezone.utc)
                else:
                    rule = CategoryRule(
                        user_id=user["user_id"],
                        merchant=merchant,
                        category=category,
                        match_count=0,
                        source="user_rejected",
                    )
                    session.add(rule)
                await session.commit()
                return {"ok": True, "new_count": rule.match_count}
            raise HTTPException(400, "Action must be 'accept' or 'reject'")

    # ── Analytics ────────────────────────────────────────────────────

    @router.get("/analytics/spending-by-category")
    async def spending_by_category(
        request: Request,
        user: dict = Depends(get_current_user),
        date_from: str = Query(None),
        date_to: str = Query(None),
    ):
        sm = request.app.state.db
        async with sm() as session:
            stmt = select(Transaction).where(
                Transaction.user_id == user["user_id"],
                Transaction.amount < 0,
            )
            if date_from:
                stmt = stmt.where(Transaction.date >= datetime.fromisoformat(date_from))
            if date_to:
                stmt = stmt.where(
                    Transaction.date
                    <= datetime.fromisoformat(date_to) + timedelta(days=1)
                )
            result = await session.execute(stmt)
            txs = result.scalars().all()
            cats = defaultdict(float)
            total = 0.0
            for t in txs:
                cat = t.category or "uncategorized"
                amt = abs(t.amount)
                cats[cat] += amt
                total += amt
            sorted_cats = sorted(
                [
                    {
                        "name": k,
                        "value": round(v, 2),
                        "pct": round(v / total * 100, 1) if total else 0,
                    }
                    for k, v in cats.items()
                ],
                key=lambda x: -x["value"],
            )
            return {"categories": sorted_cats, "total": round(total, 2)}

    @router.get("/analytics/spending-trends")
    async def spending_trends(
        request: Request, user: dict = Depends(get_current_user), months: int = 12
    ):
        cache_key = f"trends:{user['user_id']}:{months}"
        cached = _query_cache.get(cache_key)
        if cached:
            return cached
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction)
                .where(Transaction.user_id == user["user_id"])
                .order_by(Transaction.date.desc())
                .limit(2000)
            )
            txs = result.scalars().all()
            monthly = defaultdict(lambda: {"income": 0.0, "spend": 0.0, "net": 0.0})
            for t in txs:
                if not t.date:
                    continue
                key = t.date.strftime("%Y-%m")
                monthly[key]["income"] += t.amount if t.amount > 0 else 0
                monthly[key]["spend"] += abs(t.amount) if t.amount < 0 else 0
                monthly[key]["net"] += t.amount
            trends = sorted(
                [{"month": k, **v} for k, v in monthly.items()],
                key=lambda x: x["month"],
            )[-months:]
            payload = {"trends": trends}
            _query_cache.set(cache_key, payload, ttl=120)
            return payload

    @router.get("/analytics/budget-comparison")
    async def budget_comparison(
        request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            budget_result = await session.execute(
                select(Budget).where(Budget.user_id == user["user_id"])
            )
            budgets = budget_result.scalars().all()
            tx_result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
            )
            txs = tx_result.scalars().all()
            now = datetime.now(timezone.utc)
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            comparisons = []
            for b in budgets:
                spent = sum(
                    abs(t.amount)
                    for t in txs
                    if t.amount < 0
                    and t.category == b.category
                    and t.date
                    and t.date >= month_start
                )
                comparisons.append(
                    {
                        "category": b.category,
                        "budget": round(b.amount, 2),
                        "spent": round(spent, 2),
                        "remaining": round(max(0, b.amount - spent), 2),
                        "progress_pct": round(
                            min(100, spent / b.amount * 100) if b.amount else 0, 1
                        ),
                    }
                )
            return {"comparisons": comparisons}

    @router.get("/analytics/period-comparison")
    async def period_comparison(
        request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
            )
            txs = result.scalars().all()
            now = datetime.now(timezone.utc)
            current_start = now.replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            prev_start = (current_start - timedelta(days=1)).replace(day=1)
            prev_end = current_start
            current = {"income": 0.0, "spend": 0.0, "count": 0}
            previous = {"income": 0.0, "spend": 0.0, "count": 0}
            for t in txs:
                if not t.date:
                    continue
                if t.date >= current_start:
                    current["income"] += t.amount if t.amount > 0 else 0
                    current["spend"] += abs(t.amount) if t.amount < 0 else 0
                    current["count"] += 1
                elif prev_start <= t.date < prev_end:
                    previous["income"] += t.amount if t.amount > 0 else 0
                    previous["spend"] += abs(t.amount) if t.amount < 0 else 0
                    previous["count"] += 1
            spend_change = (
                ((current["spend"] - previous["spend"]) / previous["spend"] * 100)
                if previous["spend"]
                else 0
            )
            income_change = (
                ((current["income"] - previous["income"]) / previous["income"] * 100)
                if previous["income"]
                else 0
            )
            return {
                "current_period": {"label": current_start.strftime("%B %Y"), **current},
                "previous_period": {"label": prev_start.strftime("%B %Y"), **previous},
                "spend_change_pct": round(spend_change, 1),
                "income_change_pct": round(income_change, 1),
            }

    @router.get("/analytics/compare-periods")
    async def compare_periods(
        request: Request,
        user: dict = Depends(get_current_user),
        period_a_from: str = Query(...),
        period_a_to: str = Query(...),
        period_b_from: str = Query(...),
        period_b_to: str = Query(...),
        category: str = Query(None),
    ):
        sm = request.app.state.db
        async with sm() as session:

            def _compute(txs_list, label):
                inc = sum(t.amount for t in txs_list if t.amount > 0)
                spd = sum(abs(t.amount) for t in txs_list if t.amount < 0)
                return {
                    "label": label,
                    "income": round(inc, 2),
                    "spend": round(spd, 2),
                    "count": len(txs_list),
                }

            async def _load_period(date_from: str, date_to: str):
                stmt = select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= datetime.fromisoformat(date_from),
                    Transaction.date
                    <= datetime.fromisoformat(date_to) + timedelta(days=1),
                )
                if category:
                    stmt = stmt.where(Transaction.category == category)
                r = await session.execute(stmt.order_by(Transaction.date))
                return r.scalars().all()

            a_txs = await _load_period(period_a_from, period_a_to)
            b_txs = await _load_period(period_b_from, period_b_to)

            a_label = datetime.fromisoformat(period_a_from).strftime("%d %b %Y")
            b_label = datetime.fromisoformat(period_b_from).strftime("%d %b %Y")

            a_stats = _compute(a_txs, a_label)
            b_stats = _compute(b_txs, b_label)

            spend_change = (
                ((a_stats["spend"] - b_stats["spend"]) / b_stats["spend"] * 100)
                if b_stats["spend"]
                else 0
            )
            income_change = (
                ((a_stats["income"] - b_stats["income"]) / b_stats["income"] * 100)
                if b_stats["income"]
                else 0
            )

            cat_breakdown = []
            if not category:
                all_cats = set()
                for t in a_txs + b_txs:
                    if t.amount < 0 and t.category:
                        all_cats.add(t.category)
                for cat in sorted(all_cats):
                    a_spend = round(
                        sum(
                            abs(t.amount)
                            for t in a_txs
                            if t.amount < 0 and t.category == cat
                        ),
                        2,
                    )
                    b_spend = round(
                        sum(
                            abs(t.amount)
                            for t in b_txs
                            if t.amount < 0 and t.category == cat
                        ),
                        2,
                    )
                    if a_spend > 0 or b_spend > 0:
                        chg = (
                            ((a_spend - b_spend) / b_spend * 100)
                            if b_spend
                            else (100 if a_spend > 0 else 0)
                        )
                        cat_breakdown.append(
                            {
                                "category": cat,
                                "a_spend": a_spend,
                                "b_spend": b_spend,
                                "change_pct": round(chg, 1),
                            }
                        )

            return {
                "period_a": a_stats,
                "period_b": b_stats,
                "spend_change_pct": round(spend_change, 1),
                "income_change_pct": round(income_change, 1),
                "category_breakdown": cat_breakdown,
            }

    # ── Dashboard ────────────────────────────────────────────────────

    @router.get("/dashboard/overview")
    async def dashboard_overview(
        request: Request, user: dict = Depends(get_current_user)
    ):
        uid = user["user_id"]
        cached = _query_cache.get(f"dash:{uid}")
        if cached:
            return cached
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction)
                .where(Transaction.user_id == uid)
                .order_by(Transaction.date.desc())
                .limit(2000)
            )
            txs = result.scalars().all()
            balance = sum(t.amount for t in txs)

            now = datetime.now(timezone.utc)
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month_txs = [t for t in txs if t.date and t.date >= month_start]
            income = sum(t.amount for t in month_txs if t.amount > 0)
            spend = sum(-t.amount for t in month_txs if t.amount < 0)

            cats = defaultdict(float)
            for t in month_txs:
                if t.amount < 0:
                    cats[t.category or "uncategorized"] += -t.amount
            monthly = defaultdict(lambda: {"income": 0, "spend": 0})
            for t in txs:
                if t.date:
                    d = t.date.strftime("%Y-%m")
                    if t.amount > 0:
                        monthly[d]["income"] += t.amount
                    else:
                        monthly[d]["spend"] += -t.amount
            flow = sorted(
                [{"month": k, **v} for k, v in monthly.items()],
                key=lambda x: x["month"],
            )[-6:]
            savings_rate = ((income - spend) / income * 100) if income > 0 else 0
            score = max(0, min(100, int(savings_rate * 2 + (50 if balance > 0 else 0))))

            sources = defaultdict(int)
            for t in txs:
                sources[t.source or "manual"] += 1

            # Real bank balances from BankAccounts
            acct_result = await session.execute(
                select(BankAccount).where(
                    BankAccount.user_id == uid,
                    BankAccount.include_in_total == True,
                )
            )
            bank_accounts = acct_result.scalars().all()
            truelayer_balance = (
                sum(float(a.balance or 0) for a in bank_accounts) or 0
            )
            accounts = [
                {
                    "account_id": a.account_id,
                    "connection_id": a.connection_id,
                    "account_name": a.name,
                    "account_type": a.type or "",
                    "balance": float(a.balance or 0),
                    "balance_currency": a.currency or "GBP",
                    "institution": a.name,
                    "color": a.color,
                    "image": a.image,
                    "balance_updated_at": a.balance_updated_at.isoformat()
                    if a.balance_updated_at
                    else None,
                }
                for a in bank_accounts
            ]

            # Build institution and label maps for _tx_to_dict
            conn_ids = list({t.connection_id for t in txs[:8] if t.connection_id})
            institution_map = {}
            label_map = {}
            if conn_ids:
                from db import BankConnection
                bc_result = await session.execute(
                    select(
                        BankConnection.connection_id,
                        BankConnection.nickname,
                        BankConnection.account_name,
                        BankConnection.config,
                    ).where(BankConnection.connection_id.in_(conn_ids))
                )
                for bc_row in bc_result:
                    cfg = bc_row.config or {}
                    inst = cfg.get("institution") if isinstance(cfg, dict) else None
                    inst = inst or bc_row.account_name
                    if inst:
                        institution_map[bc_row.connection_id] = inst
                    lbl = bc_row.nickname or bc_row.account_name or inst
                    if lbl:
                        label_map[bc_row.connection_id] = lbl

            payload = {
                "balance": round(balance, 2),
                "truelayer_balance": round(truelayer_balance, 2),
                "accounts": accounts,
                "income": round(income, 2),
                "spend": round(spend, 2),
                "savings_rate": round(savings_rate, 1),
                "health_score": score,
                "categories": [
                    {"name": k, "value": round(v, 2)}
                    for k, v in sorted(cats.items(), key=lambda x: -x[1])
                ],
                "monthly_flow": flow,
                "recent": [_tx_to_dict(t, institution_map, label_map) for t in txs[:8]],
                "source_breakdown": [
                    {"source": k, "count": v}
                    for k, v in sorted(sources.items(), key=lambda x: -x[1])
                ],
            }
            _query_cache.set(f"dash:{uid}", payload)
            return payload

    # ── Budgets ──────────────────────────────────────────────────────

    @router.get("/budgets")
    async def list_budgets(
        request: Request,
        user: dict = Depends(get_current_user),
        type: str = Query(None, description="Filter: everyday | event"),
        month: str = Query(None, description="YYYY-MM — defaults to current month"),
        date_from: str = Query(
            None, description="ISO date — start of range (overrides month)"
        ),
        date_to: str = Query(
            None, description="ISO date — end of range, exclusive (overrides month)"
        ),
    ):
        cache_key = f"budgets:{user['user_id']}:{month or ''}:{type or ''}:{date_from or ''}:{date_to or ''}"
        cached = _query_cache.get(cache_key)
        if cached:
            return cached
        sm = request.app.state.db
        async with sm() as session:
            try:
                if date_from and date_to:
                    df = date.fromisoformat(date_from)
                    dt = date.fromisoformat(date_to)
                    # Find all YYYY-MM periods overlapping [df, dt)
                    overlapping = set()
                    cursor = df.replace(day=1)
                    while cursor < dt:
                        overlapping.add(f"{cursor.year}-{cursor.month:02d}")
                        if cursor.month == 12:
                            cursor = cursor.replace(year=cursor.year + 1, month=1)
                        else:
                            cursor = cursor.replace(month=cursor.month + 1)
                    periods = list(overlapping)

                    y, m = df.year, df.month
                    month_start = datetime(y, m, 1, tzinfo=timezone.utc)
                    if m == 12:
                        month_end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
                    else:
                        month_end = datetime(y, m + 1, 1, tzinfo=timezone.utc)

                    # Budget filtering by overlapping months
                    q = select(Budget).where(Budget.user_id == user["user_id"])
                    if type:
                        q = q.where(Budget.budget_type == type)
                        if type == "everyday":
                            q = q.where(Budget.month.in_(periods))
                    else:
                        q = q.where(
                            or_(
                                Budget.budget_type == "event",
                                Budget.month.in_(periods),
                            )
                        )

                    # Transaction aggregation uses the full date range
                    tx_start = df
                    tx_end = dt
                else:
                    if month:
                        try:
                            y, m = int(month[:4]), int(month[5:7])
                            if not (1 <= m <= 12):
                                raise ValueError
                        except (ValueError, IndexError):
                            raise HTTPException(
                                400, "Invalid month format, use YYYY-MM"
                            )
                    else:
                        now = datetime.now(timezone.utc)
                        y, m = now.year, now.month
                    month_start = datetime(y, m, 1, tzinfo=timezone.utc)
                    if m == 12:
                        month_end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
                    else:
                        month_end = datetime(y, m + 1, 1, tzinfo=timezone.utc)

                    period = f"{y}-{m:02d}"
                    q = select(Budget).where(Budget.user_id == user["user_id"])
                    if type:
                        q = q.where(Budget.budget_type == type)
                        if type == "everyday":
                            q = q.where(Budget.month == period)
                    else:
                        q = q.where(
                            or_(
                                Budget.budget_type == "event",
                                Budget.month == period,
                            )
                        )

                    tx_start = month_start
                    tx_end = month_end

                q = q.order_by(Budget.category)
                result = await session.execute(q)
                budgets = result.scalars().all()

                # Fast spent lookup via SQL aggregation
                spent_rows = await session.execute(
                    select(
                        Transaction.category,
                        func.sum(-Transaction.amount).label("spent"),
                    )
                    .where(
                        Transaction.user_id == user["user_id"],
                        Transaction.date >= tx_start,
                        Transaction.date < tx_end,
                        Transaction.amount < 0,
                    )
                    .group_by(Transaction.category)
                )
                spent_map = {row.category: float(row.spent) for row in spent_rows}

                result_list = []
                total_budgeted = 0.0
                total_spent = 0.0
                for b in budgets:
                    spent = spent_map.get(b.category, 0.0)
                    limit_val = float(b.amount)
                    total_budgeted += limit_val
                    total_spent += spent
                    entry = {
                        **_budget_to_dict(b),
                        "spent": round(spent, 2),
                        "remaining": round(limit_val - spent, 2),
                        "progress_pct": round(
                            min(100, (spent / limit_val * 100) if limit_val else 0), 1
                        ),
                    }
                    result_list.append(entry)

                event_groups = {}
                if type == "event" or not type:
                    event_items = [
                        e for e in result_list if e.get("budget_type") == "event"
                    ]
                    for e in event_items:
                        gid = e.get("event_group_id") or e["budget_id"]
                        if gid not in event_groups:
                            event_groups[gid] = {
                                "event_group_id": gid,
                                "event_group_name": e.get("event_group_name")
                                or e["category"],
                                "category": e["category"],
                                "event_date": e.get("event_date"),
                                "items": [],
                                "total_limit": 0.0,
                                "total_spent": 0.0,
                                "item_count": 0,
                            }
                        event_groups[gid]["items"].append(e)
                        event_groups[gid]["total_limit"] += e["limit"]
                        event_groups[gid]["total_spent"] += e["spent"]
                        event_groups[gid]["item_count"] += 1

                result_list.sort(
                    key=lambda x: (
                        (x.get("event_date") or "9999", x["category"])
                        if x.get("budget_type") == "event"
                        else (x["category"],)
                    )
                )

                payload = {
                    "budgets": result_list,
                    "event_groups": event_groups,
                    "month": f"{y}-{m:02d}",
                    "total_budgeted": round(total_budgeted, 2),
                    "total_spent": round(total_spent, 2),
                    "total_remaining": round(total_budgeted - total_spent, 2),
                }
                _query_cache.set(cache_key, payload, ttl=15)
                return payload
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(
                    "Budget list failed (possible missing columns, awaiting migration): %s",
                    str(e),
                )
                payload = {
                    "budgets": [],
                    "event_groups": {},
                    "month": month
                    or f"{datetime.now(timezone.utc).year}-{datetime.now(timezone.utc).month:02d}",
                    "total_budgeted": 0,
                    "total_spent": 0,
                    "total_remaining": 0,
                }
                return payload

    @router.post("/budgets")
    async def create_budget(
        payload: BudgetIn, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            event_date = None
            if payload.event_date:
                try:
                    event_date = datetime.fromisoformat(payload.event_date)
                except ValueError:
                    raise HTTPException(400, "Invalid event_date format, use ISO 8601")
            event_group_id = payload.event_group_id
            if payload.budget_type == "event" and not event_group_id:
                event_group_id = str(uuid.uuid4())
            budget_month = payload.month
            if payload.budget_type != "event" and not budget_month:
                now_dt = datetime.now(timezone.utc)
                budget_month = f"{now_dt.year}-{now_dt.month:02d}"
            b = Budget(
                budget_id=f"bud_{uuid.uuid4().hex[:12]}",
                user_id=user["user_id"],
                category=payload.category.lower(),
                amount=payload.limit,
                period=payload.period,
                budget_type=payload.budget_type,
                event_date=event_date,
                event_group_id=event_group_id,
                event_group_name=payload.event_group_name,
                month=budget_month,
            )
            session.add(b)
            await session.commit()
            await session.refresh(b)
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return _budget_to_dict(b)

    @router.delete("/budgets/{budget_id}")
    async def delete_budget(
        budget_id: str, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Budget).where(
                    Budget.budget_id == budget_id,
                    Budget.user_id == user["user_id"],
                )
            )
            b = result.scalar_one_or_none()
            if not b:
                raise HTTPException(404, "Not found")
            await session.delete(b)
            await session.commit()
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return {"ok": True}

    @router.patch("/budgets/{budget_id}")
    async def update_budget(
        budget_id: str,
        payload: BudgetUpdate,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Budget).where(
                    Budget.budget_id == budget_id,
                    Budget.user_id == user["user_id"],
                )
            )
            b = result.scalar_one_or_none()
            if not b:
                raise HTTPException(404, "Not found")
            if payload.category is not None:
                b.category = payload.category.lower()
            if payload.limit is not None:
                b.amount = payload.limit
            if payload.period is not None:
                b.period = payload.period
            if payload.budget_type is not None:
                b.budget_type = payload.budget_type
            if payload.event_date is not None:
                try:
                    b.event_date = datetime.fromisoformat(payload.event_date)
                except ValueError:
                    raise HTTPException(400, "Invalid event_date format, use ISO 8601")
            if payload.event_group_id is not None:
                b.event_group_id = payload.event_group_id
            if payload.event_group_name is not None:
                b.event_group_name = payload.event_group_name
            if payload.month is not None:
                b.month = payload.month
            await session.commit()
            await session.refresh(b)
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return _budget_to_dict(b)

    @router.post("/budgets/bulk-delete")
    async def bulk_delete_budgets(
        payload: BulkDeleteIn, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Budget).where(
                    Budget.budget_id.in_(payload.budget_ids),
                    Budget.user_id == user["user_id"],
                )
            )
            budgets = result.scalars().all()
            deleted = len(budgets)
            for b in budgets:
                await session.delete(b)
            await session.commit()
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return {"ok": True, "deleted": deleted}

    @router.delete("/budgets/group/{event_group_id}")
    async def delete_event_group(
        event_group_id: str, request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Budget).where(
                    Budget.event_group_id == event_group_id,
                    Budget.user_id == user["user_id"],
                )
            )
            budgets = result.scalars().all()
            if not budgets:
                raise HTTPException(404, "Event group not found")
            deleted = len(budgets)
            for b in budgets:
                await session.delete(b)
            await session.commit()
            _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
            return {"ok": True, "deleted": deleted, "event_group_id": event_group_id}

    @router.post("/budgets/seed-defaults")
    async def seed_defaults(request: Request, user: dict = Depends(get_current_user)):
        """Seed default monthly budgets for the current user (idempotent — skips existing)."""
        from budget_system import seed_default_budget_entries

        sm = request.app.state.db
        async with sm() as session:
            try:
                created = await seed_default_budget_entries(session, user["user_id"])
                _query_cache.delete_by_prefix(f"budgets:{user['user_id']}:")
                return {
                    "status": "ok",
                    "created": created,
                    "message": f"{created} default budgets seeded",
                }
            except Exception as e:
                logger.warning("Seed defaults failed: %s", str(e))
                raise HTTPException(500, f"Failed to seed defaults: {str(e)}")

    # ── AI Budget Insights ─────────────────────────────────────────

    @router.get("/budgets/insights")
    async def budget_insights(request: Request, user: dict = Depends(get_current_user)):
        """Compare current month spending vs last 3 months per category, return suggestions."""
        sm = request.app.state.db
        async with sm() as session:
            now = datetime.now(timezone.utc)
            y, m = now.year, now.month

            # Current month range
            cur_start = datetime(y, m, 1, tzinfo=timezone.utc)
            cur_end = (
                datetime(y + 1, 1, 1, tzinfo=timezone.utc)
                if m == 12
                else datetime(y, m + 1, 1, tzinfo=timezone.utc)
            )

            # Last 3 months range (start of 3 months ago to start of current month)
            past_start = cur_start - timedelta(days=90)
            past_start = datetime(
                past_start.year, past_start.month, 1, tzinfo=timezone.utc
            )

            # Current month transactions (expenses only)
            cur_tx = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.amount < 0,
                    Transaction.date >= cur_start,
                    Transaction.date < cur_end,
                    Transaction.category.isnot(None),
                )
            )
            cur_txns = cur_tx.scalars().all()

            # Past 3 months transactions
            past_tx = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.amount < 0,
                    Transaction.date >= past_start,
                    Transaction.date < cur_start,
                    Transaction.category.isnot(None),
                )
            )
            past_txns = past_tx.scalars().all()

            # Aggregate current month per category
            cur_by_cat = defaultdict(float)
            for t in cur_txns:
                cur_by_cat[t.category] += -t.amount

            # Aggregate past 3 months per category, compute monthly avg
            past_by_cat = defaultdict(list)
            for t in past_txns:
                month_key = f"{t.date.year}-{t.date.month:02d}"
                past_by_cat[(t.category, month_key)] += -t.amount

            # Get unique months in past period
            past_months = set()
            for (cat, mk), _ in past_by_cat.items():
                past_months.add(mk)
            num_past_months = max(len(past_months), 1)

            past_avg = defaultdict(float)
            for (cat, _), total in past_by_cat.items():
                past_avg[cat] += total
            for cat in past_avg:
                past_avg[cat] /= num_past_months

            # Get current budgets
            result = await session.execute(
                select(Budget).where(
                    Budget.user_id == user["user_id"],
                    Budget.budget_type != "event",
                )
            )
            budgets = result.scalars().all()
            budget_map = {b.category: float(b.amount) for b in budgets}

            # Build insights
            categories = set(
                list(cur_by_cat.keys())
                + list(past_avg.keys())
                + list(budget_map.keys())
            )
            insights = []
            for cat in sorted(categories):
                if not cat:
                    continue
                current_spent = round(cur_by_cat.get(cat, 0), 2)
                avg_spent = round(past_avg.get(cat, 0), 2)
                current_budget = round(budget_map.get(cat, 0), 2)
                suggestion = round(max(current_spent, avg_spent, current_budget), 2)
                if current_budget > 0 or current_spent > 0 or avg_spent > 0:
                    insights.append(
                        {
                            "category": cat,
                            "current_spent": current_spent,
                            "avg_spent_3m": avg_spent,
                            "current_budget": current_budget,
                            "suggested_budget": suggestion,
                            "reason": _insight_reason(
                                cat, current_spent, avg_spent, current_budget
                            ),
                        }
                    )

            return {"insights": insights, "month": f"{y}-{m:02d}"}

    # ── Budget Trends ───────────────────────────────────────────────

    @router.get("/budgets/trends")
    async def budget_trends(
        request: Request,
        user: dict = Depends(get_current_user),
        category: str = Query(None),
        months: int = Query(6, ge=1, le=24),
        all_categories: bool = Query(False, alias="all"),
    ):
        """Return monthly budget vs spent for a category over N months.
        Pass ?all=true to get data for ALL budgeted categories in batch."""
        sm = request.app.state.db
        async with sm() as session:
            now = datetime.now(timezone.utc)
            current_month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
            first_month_start = current_month_start - timedelta(days=30 * (months - 1))
            first_month_start = datetime(
                first_month_start.year, first_month_start.month, 1, tzinfo=timezone.utc
            )

            month_keys = []
            month_ranges = []
            cursor = first_month_start
            while len(month_keys) < months:
                y, m_val = cursor.year, cursor.month
                m_start = datetime(y, m_val, 1, tzinfo=timezone.utc)
                m_end = (
                    datetime(y + 1, 1, 1, tzinfo=timezone.utc)
                    if m_val == 12
                    else datetime(y, m_val + 1, 1, tzinfo=timezone.utc)
                )
                month_keys.append(f"{y}-{m_val:02d}")
                month_ranges.append((m_start, m_end))
                cursor = m_end

            # Determine which categories to fetch
            cats_to_fetch = None
            if all_categories:
                result = await session.execute(
                    select(Budget.category)
                    .where(
                        Budget.user_id == user["user_id"], Budget.budget_type != "event"
                    )
                    .distinct()
                )
                cats_to_fetch = [row[0] for row in result.all()]
                if not cats_to_fetch:
                    return {"trends": {}, "months": month_keys}
            elif category and category.lower() != "all":
                cats_to_fetch = [category.lower()]

            # Get current budgets for the category lookup
            budget_result = await session.execute(
                select(Budget.category, Budget.amount).where(
                    Budget.user_id == user["user_id"], Budget.budget_type != "event"
                )
            )
            budget_map = {row[0]: float(row[1]) for row in budget_result.all()}

            # Build month condition list for CASE expressions
            if cats_to_fetch:
                # Per-category: single GROUP BY query
                spent_rows = await session.execute(
                    select(
                        Transaction.category,
                        func.date_trunc("month", Transaction.date).label("month_trunc"),
                        func.sum(-Transaction.amount).label("spent"),
                    )
                    .where(
                        Transaction.user_id == user["user_id"],
                        Transaction.amount < 0,
                        Transaction.date >= first_month_start,
                        Transaction.date < month_ranges[-1][1],
                        Transaction.category.in_(cats_to_fetch),
                    )
                    .group_by(
                        Transaction.category,
                        func.date_trunc("month", Transaction.date),
                    )
                    .order_by(
                        Transaction.category,
                        func.date_trunc("month", Transaction.date),
                    )
                )
                result_map = {cat: [] for cat in cats_to_fetch}
                # Spent lookup: (category, month_key) → spent
                spent_lookup = {}
                for row in spent_rows.all():
                    cat_key = row[0]
                    mk = row[1].strftime("%Y-%m") if row[1] else ""
                    spent_lookup[(cat_key, mk)] = float(row[2])

                for cat in cats_to_fetch:
                    cat_trends = []
                    budget_val = round(budget_map.get(cat, 0), 2)
                    for mk in month_keys:
                        spent = round(spent_lookup.get((cat, mk), 0.0), 2)
                        cat_trends.append(
                            {"month": mk, "budget": budget_val, "spent": spent}
                        )
                    result_map[cat] = cat_trends

                return {"trends": result_map, "months": month_keys}
            else:
                # Total aggregate across all categories
                spent_rows = await session.execute(
                    select(
                        func.date_trunc("month", Transaction.date).label("month_trunc"),
                        func.sum(-Transaction.amount).label("spent"),
                    )
                    .where(
                        Transaction.user_id == user["user_id"],
                        Transaction.amount < 0,
                        Transaction.date >= first_month_start,
                        Transaction.date < month_ranges[-1][1],
                    )
                    .group_by(
                        func.date_trunc("month", Transaction.date),
                    )
                    .order_by(
                        func.date_trunc("month", Transaction.date),
                    )
                )
                spent_lookup = {}
                for row in spent_rows.all():
                    mk = row[0].strftime("%Y-%m") if row[0] else ""
                    spent_lookup[mk] = float(row[1])

                trends = []
                for mk in month_keys:
                    spent = round(spent_lookup.get(mk, 0.0), 2)
                    trends.append({"month": mk, "budget": 0, "spent": spent})
                return {"trends": {"_total": trends}, "months": month_keys}

    # ── Budget Alerts ───────────────────────────────────────────────

    @router.get("/budgets/alerts")
    async def budget_alerts(request: Request, user: dict = Depends(get_current_user)):
        """Return budgets that are over threshold, or have unusual spending spikes."""
        cache_key = f"budgets:{user['user_id']}:alerts"
        cached = _query_cache.get(cache_key)
        if cached:
            return cached
        sm = request.app.state.db
        async with sm() as session:
            now = datetime.now(timezone.utc)
            y, m_val = now.year, now.month
            m_start = datetime(y, m_val, 1, tzinfo=timezone.utc)
            m_end = (
                datetime(y + 1, 1, 1, tzinfo=timezone.utc)
                if m_val == 12
                else datetime(y, m_val + 1, 1, tzinfo=timezone.utc)
            )

            result = await session.execute(
                select(Budget).where(
                    Budget.user_id == user["user_id"],
                    Budget.budget_type != "event",
                )
            )
            budgets = result.scalars().all()

            tx_result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.amount < 0,
                    Transaction.date >= m_start,
                    Transaction.date < m_end,
                    Transaction.category.isnot(None),
                )
            )
            txs = tx_result.scalars().all()
            spent_by_cat = defaultdict(float)
            for t in txs:
                spent_by_cat[t.category] += -t.amount

            # Past 3 months avg for spike detection
            past_start = m_start - timedelta(days=90)
            past_start = datetime(
                past_start.year, past_start.month, 1, tzinfo=timezone.utc
            )
            past_tx = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.amount < 0,
                    Transaction.date >= past_start,
                    Transaction.date < m_start,
                    Transaction.category.isnot(None),
                )
            )
            past_txns = past_tx.scalars().all()
            past_monthly = defaultdict(float)
            past_months_set = set()
            for t in past_txns:
                mk = f"{t.date.year}-{t.date.month:02d}"
                past_months_set.add(mk)
                past_monthly[t.category] += -t.amount
            num_past = max(len(past_months_set), 1)
            for cat in past_monthly:
                past_monthly[cat] /= num_past

            alerts = []
            for b in budgets:
                cat = b.category
                spent = spent_by_cat.get(cat, 0)
                lim = float(b.amount)
                if lim <= 0:
                    continue
                pct = round((spent / lim) * 100, 1)
                avg = round(past_monthly.get(cat, 0), 2)

                if pct >= 100:
                    alerts.append(
                        {
                            "category": cat,
                            "severity": "critical",
                            "message": f"{cat.capitalize()} is over budget ({pct}% used)",
                            "spent": round(spent, 2),
                            "budget": lim,
                            "progress_pct": pct,
                        }
                    )
                elif pct >= 80:
                    alerts.append(
                        {
                            "category": cat,
                            "severity": "warning",
                            "message": f"{cat.capitalize()} is at {pct}% of budget",
                            "spent": round(spent, 2),
                            "budget": lim,
                            "progress_pct": pct,
                        }
                    )
                if avg > 0 and spent > avg * 1.5 and spent > 50:
                    alerts.append(
                        {
                            "category": cat,
                            "severity": "spike",
                            "message": f"{cat.capitalize()} spending spike: £{round(spent, 2)} vs usual £{avg}",
                            "spent": round(spent, 2),
                            "budget": lim,
                            "avg_3m": avg,
                            "progress_pct": pct,
                        }
                    )

            payload = {"alerts": alerts}
            _query_cache.set(cache_key, payload, ttl=30)
            return payload

    # ── Transaction system health check ─────────────────────────────

    @router.get("/transactions/health")
    async def transactions_health(
        request: Request, user: dict = Depends(get_current_user)
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.user_id == user["user_id"])
            )
            total = result.scalar() or 0
            dup = await session.execute(
                select(Transaction.transaction_id, func.count().label("cnt"))
                .where(Transaction.user_id == user["user_id"])
                .group_by(Transaction.transaction_id)
                .having(func.count() > 1)
            )
            duplicates = dup.rowcount
            null_cat = await session.execute(
                select(func.count())
                .select_from(Transaction)
                .where(
                    Transaction.user_id == user["user_id"],
                    Transaction.category.is_(None),
                )
            )
            return {
                "ok": True,
                "total_transactions": total,
                "duplicate_ids": duplicates,
                "uncategorized": null_cat.scalar() or 0,
                "sources": {
                    src: count
                    for src, count in (
                        await session.execute(
                            select(Transaction.source, func.count())
                            .where(Transaction.user_id == user["user_id"])
                            .group_by(Transaction.source)
                        )
                    ).all()
                },
            }

    return router
