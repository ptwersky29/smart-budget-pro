"""Smart financial engine: transactions, budgets, analytics, merchant normalization, split, recurring."""
import uuid
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update, delete, func, or_

from db import (
    User, Transaction, Budget, SplitTransaction, AccountNickname,
    RecurringTransaction, Category, Subscription, get_session_maker,
)
from auth import get_current_user
from llm import call_llm, track_ai_usage, parse_json
from security import sanitize_input
from cache import TTLCache
from statements import CATEGORIES, ALL_CATEGORIES
import maaser

logger = logging.getLogger("finance")

_query_cache = TTLCache(ttl=60)  # 60-second cache for frequent queries

# ── Merchant normalization ───────────────────────────────────────────────

MERCHANT_NORMALIZE = {
    "TESCO": "Tesco", "TESCO STORES": "Tesco", "TESCO STORE": "Tesco",
    "SAINSBURY": "Sainsbury's", "SAINSBURYS": "Sainsbury's",
    "ASDA": "Asda", "ASDA STORES": "Asda",
    "ALDI": "Aldi", "ALDI STORES": "Aldi",
    "LIDL": "Lidl", "LIDL GB": "Lidl",
    "MORRISONS": "Morrisons", "MORRISON": "Morrisons",
    "WAITROSE": "Waitrose", "WAITROSE & PARTNERS": "Waitrose",
    "M&S": "M&S", "MARKS & SPENCER": "M&S", "MS": "M&S",
    "CO-OP": "Co-op", "COOPERATIVE": "Co-op",
    "AMAZON": "Amazon", "AMAZON.CO.UK": "Amazon", "AMZN": "Amazon",
    "AMZN MKTP": "Amazon",
    "TFL": "TfL", "TFL TRAVEL": "TfL", "TRANSPORT FOR LONDON": "TfL",
    "UBER": "Uber", "UBER TRIP": "Uber", "UBER EATS": "Uber Eats",
    "DELIVEROO": "Deliveroo",
    "JUST EAT": "Just Eat", "JUSTEAT": "Just Eat",
    "NETFLIX": "Netflix",
    "SPOTIFY": "Spotify",
    "APPLE": "Apple", "APPLE.COM": "Apple", "APPLE STORE": "Apple",
    "DISNEY": "Disney+", "DISNEY PLUS": "Disney+",
    "YOUTUBE": "YouTube", "YOUTUBE PREMIUM": "YouTube",
    "GOOGLE": "Google", "GOOGLE PLAY": "Google",
    "MICROSOFT": "Microsoft", "MSFT": "Microsoft",
    "ADOBE": "Adobe",
    "GITHUB": "GitHub",
    "OPENAI": "OpenAI", "CHATGPT": "ChatGPT",
    "EE": "EE", "EVERYTHING EVERYWHERE": "EE",
    "VODAFONE": "Vodafone",
    "SKY": "Sky", "SKY UK": "Sky",
    "VIRGIN MEDIA": "Virgin Media", "VIRGIN MEDIA": "Virgin Media",
    "BRITISH GAS": "British Gas", "BRITISH GAS": "British Gas",
    "EDF": "EDF Energy", "EDF ENERGY": "EDF Energy",
    "OCTOPUS": "Octopus Energy", "OCTOPUS ENERGY": "Octopus Energy",
    "THAMES WATER": "Thames Water",
    "COUNCIL TAX": "Council Tax",
    "HMRC": "HMRC", "HM REVENUE": "HMRC",
    "PAYPAL": "PayPal",
    "MONZO": "Monzo",
    "STARLING": "Starling Bank",
    "NATIONAL EXPRESS": "National Express",
    "TRAINLINE": "Trainline",
    "SHELL": "Shell", "SHELL FUEL": "Shell",
    "BP": "BP", "BP FUEL": "BP",
    "COSTA": "Costa", "COSTA COFFEE": "Costa",
    "STARBUCKS": "Starbucks",
    "PRET": "Pret", "PRET A MANGER": "Pret",
    "MCDONALD": "McDonald's", "MCDONALDS": "McDonald's",
    "KFC": "KFC",
    "SUBWAY": "Subway",
    "GREGGS": "Greggs",
    "ARGOS": "Argos",
    "IKEA": "IKEA",
    "B&Q": "B&Q", "B AND Q": "B&Q",
    "SCREWFIX": "Screwfix",
    "PRIMARK": "Primark",
    "ZARA": "Zara",
    "H&M": "H&M", "H AND M": "H&M",
    "NEXT": "Next",
    "JOHN LEWIS": "John Lewis", "JOHN LEWIS PARTNERSHIP": "John Lewis",
    "EBAY": "eBay",
    "ETSY": "Etsy",
    "BOOTS": "Boots", "BOOTS PHARMACY": "Boots",
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
        getattr(tx, "normalized_merchant", None)
        or (tx.merchant_name if getattr(tx, "merchant_name", None) else None)
        or (tx.description[:60] if getattr(tx, "description", None) else "")
    ).strip().upper()


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
            session.add(CategoryRule(
                user_id=user_id, merchant=key, category=category,
                match_count=1, source="learned",
                last_used_at=datetime.now(timezone.utc),
            ))
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
        key = (round(abs(t["amount"]), 2), (t.get("normalized_merchant") or t.get("description") or "").lower().strip())
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
        results.append({
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
        })
    return sorted(results, key=lambda r: -r["occurrences"])


# ── Category rules / smart categorisation ────────────────────────────────

CATEGORY_RULES = {
    "groceries": ["tesco", "sainsbury", "asda", "aldi", "lidl", "morrison", "waitrose", "kosher", "m&s food", "marks & spencer food", "co-op", "iceland", "farmfoods", "m&s simply food"],
    "transport": ["tfl", "uber", "bolt", "trainline", "shell", "bp", "petrol", "national express", "southern railway", "thameslink", "oyster", "fuel", "charging", "ev", "railway", "rail", "bus", "tube", "underground", "parking", "traffic"],
    "dining": ["restaurant", "pizza", "deliveroo", "ubereats", "just eat", "mcdonald", "kfc", "subway", "greggs", "costa", "starbucks", "pret", "cafe", "coffee", "takeaway", "nando", "wagamama", "itsu", "wasabi"],
    "subscriptions": ["netflix", "spotify", "amazon prime", "apple", "disney", "youtube", "chatgpt", "openai", "github", "adobe", "microsoft 365", "icloud", "dropbox", "notion", "slack", "zoom", "patreon", "onlyfans"],
    "utilities": ["british gas", "edf", "octopus", "thames water", "council tax", "ee", "vodafone", "sky", "virgin media", "severn trent", "yorkshire water", "anglia water", "southern water", "npower", "e.on", "scottish power", "utility warehouse", "broadband", "mobile", "phone bill", "water", "electric", "gas bill"],
    "tzedakah": ["chesed", "tzedakah", "shul", "yeshiva", "kollel", "donation", "charity", "maaser", "tithe", "gift", "terumah"],
    "rent": ["rent", "mortgage", "letting", "landlord", "tenancy", "lease", "property management", "ground rent", "service charge"],
    "salary": ["salary", "wages", "payroll", "hmrc", "employment", "pay", "earnings"],
    "income": ["refund", "interest", "dividend", "tax refund", "cashback", "rebate", "bonus", "commission", "freelance", "self employed", "benefits", "universal credit", "child benefit", "pension", "state pension", "investment income"],
    "shopping": ["amazon", "argos", "ikea", "b&q", "screwfix", "primark", "zara", "h&m", "next", "john lewis", "eBay", "etsy", "clothing", "fashion", "footwear", "sports direct", "decathlon", "tk maxx", "homebase", "wilko", "dunelm", "habitat", "wayfair"],
    "health": ["nhs", "boots", "superdrug", "pharmacy", "doctor", "dentist", "optician", "hospital", "gym", "puregym", "the gym", "fitness", "physio", "therapy", "psychologist", "counselling", "prescription", "medical", "dental", "dental check"],
    "entertainment": ["cinema", "odeon", "vue", "showcase", "national trust", "english heritage", "spotify", "eventim", "ticketmaster", "concert", "theatre", "museum", "gallery", "zoo", "attraction", "theme park", "bowling", "escape room"],
    "insurance": ["aviva", "direct line", "admiral", "churchill", "axa", "legal & general", "life insurance", "car insurance", "home insurance", "pet insurance", "travel insurance", "breakdown cover", "aa", "rac"],
    "education": ["coursera", "udemy", "open university", "school", "nursery", "childcare", "tutor", "university", "college", "tuition", "student", "course", "training", "exam", "qualification"],
    "transfer": ["bank transfer", "transfer", "faster payment", "bacs", "chaps", "paypal", "monzo me", "starling", "internal transfer", "payment from", "money to", "sent by", "received from"],
    "cash": ["cash", "atm", "withdrawal", "cashpoint"],
    "tax": ["self assessment", "tax", "hmrc", "stamp duty", "capital gains", "income tax", "council tax", "vat", "corporation tax"],
    "fees": ["fee", "charge", "penalty", "interest charge", "o/d fee", "overdraft", "late payment", "service charge", "bank charge", "foreign transaction", "conversion fee"],
    "investments": ["vanguard", "fidelity", "hargreaves", "lansdown", "freetrade", "trading212", "invest", "stocks", "shares", "isa", "pension", "s&p", "fund", "etf", "dividend"],
    "home": ["homebase", "dunelm", "wilko", "b&q", "screwfix", "furniture", "homeware", "kitchen", "bathroom", "decor", "paint", "curtains", "blinds", "carpet", "flooring"],
}


ALL_CATEGORIES = set(CATEGORY_RULES.keys()) | {"salary", "income", "uncategorized"}


def smart_categorize(text: str) -> str:
    t = (text or "").lower()
    for cat, keywords in CATEGORY_RULES.items():
        if any(k in t for k in keywords):
            return cat
    return "uncategorized"


CATEGORISE_PROMPT_FE = """You are a UK bank transaction categoriser. Think step by step about what this transaction is, then output the category.

CATEGORIES (pick exactly one):
income, salary, groceries, dining, transport, utilities, subscriptions, tzedakah, rent, shopping, health, entertainment, insurance, education, transfer, cash, tax, fees, mortgage, uncategorized

RULES:
- amount > 0 = money IN (income/salary). amount < 0 = money OUT (expense category).
- AMOUNT CONTEXT: small amounts at supermarkets (< £10) are often meal deals/lunch → dining. Large amounts at supermarkets (> £30) are weekly shops → groceries.
- If merchant is vague but description suggests a pattern, use the category that best fits the merchant + amount combination.
- If truly uncertain, use "uncategorized" rather than guessing wildly.

MERCHANT → CATEGORY (with amount-aware logic):
- Tesco/Sainsbury/Asda/Waitrose/Lidl/Aldi/Co-op/Morrisons: if abs(amount) < 10 → dining (meal deal/snack), if abs(amount) >= 10 → groceries (weekly shop)
- McDonald/Nando/KFC/Pret/Starbucks/Costa → dining (always)
- Deliveroo/Uber Eats/JustEat: if merchant says "uber" but description says "Uber Eats" → dining; if "Uber trip" → transport
- Uber/Bolt: check description — "uber eats" → dining, "trip/ride" → transport
- TfL/Oyster/Shell/BP/Esso/SSE/texaco/Applegreen → transport
- Trainline/raileasy → transport
- British Gas/EDF/Eon/Octopus/BT/Sky/Virgin/Vodafone/EE → utilities
- Netflix/Spotify/Disney+/Apple Music/Apple.com/Google/YouTube Premium → subscriptions
- Amazon: if "prime" in description → subscriptions, otherwise → shopping
- Boots/Lloyds/Superdrug/Specsavers → health
- eBay/Argos/John Lewis/Next/H&M/Primark/M&S/clothing/fashion → shopping
- HMRC/tax/VAT/VAT payment → tax
- ATM/WITHDRAWAL → cash
- Faster payment/standing order/PayPal/Monzo-to-Monzo — check description; if "salary/wages/payroll" → salary; if "transfer"/"payment to"/"savings" → transfer
- Charity/Donation/Tzedakah/JGive/Keren → tzedakah
- Rent/mortgage payment → rent or mortgage (abs(amount) > 500 likely)
- Dentist/Doctor/Prescription → health
- Gym/Fitness/ClassPass → health
- Cinema/Theatre/Event/Ticket → entertainment
- Coursera/Udemy/Skillshare → education

Output STRICT JSON only: {{"category": "<one of the above>"}}

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
    account_id: Optional[str] = None
    is_income: bool = False
    notes: Optional[str] = None
    tags: Optional[dict] = None
    source: Optional[str] = "manual"


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    description: Optional[str] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    is_income: Optional[bool] = None
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


class BudgetUpdate(BaseModel):
    category: Optional[str] = None
    limit: Optional[float] = None
    period: Optional[str] = None





# ── Serializers ──────────────────────────────────────────────────────────

SOURCE_LABELS = {
    "manual": "Manual",
    "truelayer": "Bank",
    "csv": "CSV",
    "pdf": "PDF",
    "statement": "Statement",
    "sms": "SMS",
}


def _tx_to_dict(t: Transaction) -> dict:
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
        "is_income": t.amount > 0,
        "notes": t.notes,
        "tags": t.tags,
        "pending": t.pending,
        "tx_type": t.tx_type,
        "source": t.source,
        "source_label": SOURCE_LABELS.get(t.source, t.source),
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
        "start_date": b.start_date.isoformat() if b.start_date else None,
        "end_date": b.end_date.isoformat() if b.end_date else None,
        "notes": b.notes,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


# ── Router ───────────────────────────────────────────────────────────────

def build_router() -> APIRouter:
    router = APIRouter(tags=["finance"])

    # ── Transactions ─────────────────────────────────────────────────

    @router.get("/transactions")
    async def list_transactions(
        request: Request, user: dict = Depends(get_current_user),
        category: str = Query(None), source: str = Query(None),
        tx_type: str = Query(None), merchant: str = Query(None),
        pending: str = Query(None),
        date_from: str = Query(None), date_to: str = Query(None),
        amount_min: float = Query(None), amount_max: float = Query(None),
        search: str = Query(None),
        sort: str = Query("date"), order: str = Query("desc"),
        offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=1000),
    ):
        sm = request.app.state.db
        async with sm() as session:
            stmt = select(Transaction).where(Transaction.user_id == user["user_id"])
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
                stmt = stmt.where(Transaction.date <= datetime.fromisoformat(date_to) + timedelta(days=1))
            if amount_min is not None:
                stmt = stmt.where(abs(Transaction.amount) >= amount_min)
            if amount_max is not None:
                stmt = stmt.where(abs(Transaction.amount) <= amount_max)
            if search:
                term = f"%{search}%"
                stmt = stmt.where(or_(
                    Transaction.description.ilike(term),
                    Transaction.merchant_name.ilike(term),
                    Transaction.normalized_merchant.ilike(term),
                    Transaction.notes.ilike(term),
                    Transaction.category.ilike(term),
                ))

            sort_col = getattr(Transaction, sort, Transaction.date)
            order_fn = sort_col.desc if order == "desc" else sort_col.asc
            stmt = stmt.order_by(order_fn()).offset(offset).limit(limit)

            result = await session.execute(stmt)
            rows = result.scalars().all()

            count_stmt = select(func.count()).select_from(Transaction).where(Transaction.user_id == user["user_id"])
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
                count_stmt = count_stmt.where(Transaction.date >= datetime.fromisoformat(date_from))
            if date_to:
                count_stmt = count_stmt.where(Transaction.date <= datetime.fromisoformat(date_to) + timedelta(days=1))
            if amount_min is not None:
                count_stmt = count_stmt.where(abs(Transaction.amount) >= amount_min)
            if amount_max is not None:
                count_stmt = count_stmt.where(abs(Transaction.amount) <= amount_max)
            count_result = await session.execute(count_stmt)
            total = count_result.scalar() or 0

            agg_stmt = select(
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0),
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount < 0), 0),
            ).where(Transaction.user_id == user["user_id"])
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
                agg_stmt = agg_stmt.where(Transaction.date >= datetime.fromisoformat(date_from))
            if date_to:
                agg_stmt = agg_stmt.where(Transaction.date <= datetime.fromisoformat(date_to) + timedelta(days=1))
            if amount_min is not None:
                agg_stmt = agg_stmt.where(abs(Transaction.amount) >= amount_min)
            if amount_max is not None:
                agg_stmt = agg_stmt.where(abs(Transaction.amount) <= amount_max)
            if search:
                term = f"%{search}%"
                agg_stmt = agg_stmt.where(or_(
                    Transaction.description.ilike(term),
                    Transaction.merchant_name.ilike(term),
                    Transaction.normalized_merchant.ilike(term),
                    Transaction.notes.ilike(term),
                    Transaction.category.ilike(term),
                ))
            agg_result = await session.execute(agg_stmt)
            income_total, expense_total = agg_result.one()
            income_total = round(float(income_total), 2)
            expense_total = round(abs(float(expense_total)), 2)

            return {
                "transactions": [_tx_to_dict(t) for t in rows],
                "total": total,
                "income_total": income_total,
                "expense_total": expense_total,
                "offset": offset,
                "limit": limit,
            }

    import re
    _SEARCH_CATEGORIES = {
        "groceries": "groceries", "grocery": "groceries", "supermarket": "groceries", "food shop": "groceries",
        "dining": "dining", "restaurant": "dining", "restaurants": "dining", "cafe": "dining", "cafes": "dining",
        "takeaway": "dining", "takeaways": "dining", "eating out": "dining", "food": "dining",
        "transport": "transport", "uber": "transport", "taxi": "transport", "taxis": "transport",
        "fuel": "transport", "petrol": "transport", "parking": "transport", "tube": "transport",
        "train": "transport", "bus": "transport",
        "utilities": "utilities", "bills": "utilities", "electric": "utilities", "gas bill": "utilities",
        "water": "utilities", "broadband": "utilities", "phone": "utilities", "internet": "utilities",
        "subscriptions": "subscriptions", "sub": "subscriptions", "subs": "subscriptions",
        "streaming": "subscriptions", "membership": "subscriptions", "memberships": "subscriptions",
        "tzedakah": "tzedakah", "charity": "tzedakah", "charities": "tzedakah", "donation": "tzedakah",
        "donations": "tzedakah", "maaser": "tzedakah",
        "rent": "rent", "rentals": "rent",
        "shopping": "shopping", "shop": "shopping", "shops": "shopping", "amazon": "shopping", "purchases": "shopping",
        "health": "health", "pharmacy": "health", "medical": "health", "dental": "health", "doctor": "health",
        "entertainment": "entertainment", "fun": "entertainment", "cinema": "entertainment",
        "insurance": "insurance",
        "education": "education", "tuition": "education", "courses": "education",
        "transfer": "transfer", "transfers": "transfer",
        "cash": "cash", "atm": "cash", "withdrawal": "cash", "withdrawals": "cash",
        "tax": "tax", "taxes": "tax", "hmrc": "tax",
        "fees": "fees", "fee": "fees", "charges": "fees", "charge": "fees",
        "mortgage": "mortgage",
        "salary": "salary", "wages": "salary", "paycheck": "salary", "pay": "salary",
        "income": "income",
    }

    def _regex_parse_search(q: str) -> dict:
        """Regex-based filter parser as fallback when LLM is unavailable.
        Handles: category keywords, amount bounds (£N, over/under N, more/less than N), date keywords (last week/month/year, this month, March, etc.), type (income/expense/spending)."""
        text = q.lower().strip()
        out: dict = {}

        # Category detection — pick the longest matching keyword (to prefer "subscriptions" over "sub")
        matches = sorted(
            [(kw, cat) for kw, cat in _SEARCH_CATEGORIES.items() if re.search(rf"\b{re.escape(kw)}\b", text)],
            key=lambda x: -len(x[0]),
        )
        if matches:
            out["category"] = matches[0][1]

        # Type detection
        if re.search(r"\b(income|salary|wages|paycheck|earnings|deposits? in)\b", text) and "category" not in out:
            out["type"] = "income"
        elif re.search(r"\b(expense|expenses|spending|spent|purchases?|paid out)\b", text):
            out["type"] = "expense"

        # Amount bounds: "over £100", "under £50", "more than £20", "less than £10", "above £X", "below £X"
        m = re.search(r"\b(over|above|more than|greater than|>=?)\s*[£$]?\s*(\d+(?:\.\d+)?)\b", text)
        if m: out["amount_min"] = float(m.group(2))
        m = re.search(r"\b(under|below|less than|<=?)\s*[£$]?\s*(\d+(?:\.\d+)?)\b", text)
        if m: out["amount_max"] = float(m.group(2))
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
        elif m := re.search(r"\blast\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)\b", text):
            n, unit = int(m.group(1)), m.group(2)
            days = n * {"day": 1, "days": 1, "week": 7, "weeks": 7,
                        "month": 30, "months": 30, "year": 365, "years": 365}[unit]
            d = now - timedelta(days=days)
            out["date_from"] = d.strftime("%Y-%m-%d")
            out["date_to"] = now.strftime("%Y-%m-%d")
        else:
            # Month name detection (e.g. "in March", "March 2024", "from January")
            months = {m_: i+1 for i, m_ in enumerate(
                ["january", "february", "march", "april", "may", "june",
                 "july", "august", "september", "october", "november", "december"])}
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

        # Anything else becomes a free-text search keyword
        return out

    @router.post("/transactions/ai-search")
    async def ai_search(request: Request, user: dict = Depends(get_current_user), q: str = Query("")):
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
                today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
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
                    temperature=0.1, max_tokens=600, json_mode=False,
                )
                try:
                    await track_ai_usage(session, user["user_id"], provider, model, pt, ct, cost, endpoint="ai_search")
                except Exception:
                    pass
                try:
                    parsed = parse_json(filter_resp) if isinstance(filter_resp, str) else filter_resp
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
                try: stmt = stmt.where(Transaction.date >= datetime.fromisoformat(df))
                except Exception: pass
            dto = filters.get("date_to")
            if dto and dto != "null":
                try: stmt = stmt.where(Transaction.date <= datetime.fromisoformat(dto) + timedelta(days=1))
                except Exception: pass
            amin = filters.get("amount_min")
            if amin is not None and amin != "null":
                try:
                    v = abs(float(amin))
                    amt_comp = filters.get("amount_comparator")
                    if amt_comp == "under":
                        stmt = stmt.where(func.abs(Transaction.amount) <= v)
                    else:
                        stmt = stmt.where(func.abs(Transaction.amount) >= v)
                except Exception: pass
            amax = filters.get("amount_max")
            if amax is not None and amax != "null":
                try:
                    stmt = stmt.where(func.abs(Transaction.amount) <= abs(float(amax)))
                except Exception: pass
            keywords = filters.get("merchant_keywords") or []
            if isinstance(keywords, list) and keywords:
                from sqlalchemy import or_ as _or
                kw_filters = []
                for kw in keywords[:5]:
                    if isinstance(kw, str) and kw.strip():
                        pattern = f"%{kw.strip().lower()}%"
                        kw_filters.append(func.lower(Transaction.description).like(pattern))
                        kw_filters.append(func.lower(Transaction.merchant_name).like(pattern))
                        kw_filters.append(func.lower(Transaction.normalized_merchant).like(pattern))
                if kw_filters:
                    stmt = stmt.where(_or(*kw_filters))
            search_text = filters.get("search_text")
            if not search_text and not keywords and not filters.get("category") and not filters.get("type"):
                # Nothing structured matched — fall back to free-text search over the original query
                search_text = clean_q
            if search_text and search_text != "null":
                pattern = f"%{str(search_text).lower()}%"
                stmt = stmt.where(_or(
                    func.lower(Transaction.description).like(pattern),
                    func.lower(Transaction.merchant_name).like(pattern),
                    func.lower(Transaction.normalized_merchant).like(pattern),
                    func.lower(Transaction.category).like(pattern),
                    func.lower(Transaction.notes).like(pattern),
                ))
            sort = filters.get("sort")
            if sort == "amount_desc":
                stmt = stmt.order_by(Transaction.amount.asc())
            elif sort == "amount_asc":
                stmt = stmt.order_by(Transaction.amount.desc())
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
            txs = [_tx_to_dict(t) for t in result.scalars().all()]

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
                prev_stmt = select(Transaction).where(Transaction.user_id == user["user_id"])
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
                except Exception: pass
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
    async def create_transaction(payload: TransactionIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            tx_id = f"tx_{uuid.uuid4().hex[:12]}"
            desc = payload.description or ""
            merch = payload.merchant or ""
            category = payload.category or smart_categorize(f"{desc} {merch}")
            if category == "uncategorized":
                # Fast path: keyword match
                from statements import _keyword_categorise as kw_cat
                fast = kw_cat(desc, merch, payload.amount)
                if fast:
                    category = fast
                else:
                    from llm import call_llm, parse_json as llm_parse, track_ai_usage as track_usage
                    try:
                        raw, provider, model, pt, ct, cost = await call_llm(
                            "You categorise UK transactions. Output valid JSON only.",
                            CATEGORISE_PROMPT_FE.format(description=desc[:100], merchant=merch or "unknown", amount=payload.amount),
                            json_mode=False,
                        )
                        await track_usage(session, user["user_id"], provider, model, pt, ct, cost, endpoint="manual_categorize")
                        ai_cat = str(llm_parse(raw).get("category", "uncategorized")).lower().strip()
                        if ai_cat in ALL_CATEGORIES and ai_cat != "uncategorized":
                            category = ai_cat
                    except Exception:
                        pass
            normalized = normalize_merchant(merch or desc)
            signed_amount = abs(payload.amount) if payload.is_income else -abs(payload.amount)
            tx = Transaction(
                transaction_id=tx_id,
                user_id=user["user_id"],
                amount=signed_amount,
                currency=payload.currency,
                description=desc,
                merchant_name=merch or None,
                normalized_merchant=normalized,
                category=category,
                date=datetime.fromisoformat(payload.date) if payload.date else datetime.now(timezone.utc),
                account_id=payload.account_id,
                notes=payload.notes,
                tags=payload.tags,
                source=payload.source or "manual",
            )
            session.add(tx)
            await session.commit()
            await session.refresh(tx)
            doc = _tx_to_dict(tx)
            accrued = await maaser.maybe_accrue(session, user["user_id"], doc)
            if accrued:
                doc["maaser_accrued"] = accrued
            _query_cache.delete(f"dash:{user['user_id']}")
            return doc

    @router.patch("/transactions/{tx_id}")
    async def update_transaction(tx_id: str, payload: TransactionUpdate, request: Request, user: dict = Depends(get_current_user)):
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
                tx.category = payload.category
                category_changed = True
            if payload.date is not None:
                tx.date = datetime.fromisoformat(payload.date)
            if payload.notes is not None:
                tx.notes = payload.notes
            if payload.tags is not None:
                tx.tags = payload.tags
            if payload.pending is not None:
                tx.pending = payload.pending
            if payload.exclude_from_maaser is not None:
                tx.exclude_from_maaser = payload.exclude_from_maaser
            if category_changed:
                await _learn_category_rule(session, user["user_id"], tx, tx.category)
            await session.commit()
            await session.refresh(tx)
            doc = _tx_to_dict(tx)
            await maaser.maybe_accrue(session, user["user_id"], doc)
            _query_cache.delete(f"dash:{user['user_id']}")
            return doc

    @router.delete("/transactions/{tx_id}")
    async def delete_transaction(tx_id: str, request: Request, user: dict = Depends(get_current_user)):
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
                delete(SplitTransaction).where(SplitTransaction.parent_transaction_id == tx_id)
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
            return {"ok": True}

    class BulkDeleteByQueryIn(BaseModel):
        source: Optional[str] = None
        category: Optional[str] = None
        tx_type: Optional[str] = None
        search: Optional[str] = None
        date_from: Optional[str] = None
        date_to: Optional[str] = None

    @router.post("/transactions/bulk-delete")
    async def bulk_delete(payload: BulkUpdateIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
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
                delete(Transaction).where(
                    Transaction.transaction_id.in_(payload.transaction_ids),
                    Transaction.user_id == user["user_id"],
                ).returning(Transaction.transaction_id)
            )
            deleted = len(result.fetchall())
            await session.commit()
            _query_cache.delete(f"dash:{user['user_id']}")
            return {"ok": True, "deleted": deleted}

    @router.post("/transactions/clear")
    async def clear_transactions(payload: BulkDeleteByQueryIn, request: Request, user: dict = Depends(get_current_user)):
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
                base = base.where(Transaction.date >= datetime.fromisoformat(payload.date_from))
            if payload.date_to:
                base = base.where(Transaction.date <= datetime.fromisoformat(payload.date_to) + timedelta(days=1))
            # Fetch matching IDs, delete splits first, then transactions
            ids_result = await session.execute(base.with_only_columns(Transaction.transaction_id))
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
            deleted = result.rowcount if result else 0
            return {"ok": True, "deleted": deleted}

    @router.post("/transactions/bulk-update")
    async def bulk_update(payload: BulkUpdateIn, request: Request, user: dict = Depends(get_current_user)):
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
                    update(Transaction).where(
                        Transaction.transaction_id.in_(payload.transaction_ids),
                        Transaction.user_id == user["user_id"],
                    ).values(**values)
                )
                await session.commit()
            _query_cache.delete(f"dash:{user['user_id']}")
            return {"ok": True, "updated": len(payload.transaction_ids)}

    @router.post("/transactions/seed-demo")
    async def seed_demo(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(func.count()).select_from(Transaction).where(Transaction.user_id == user["user_id"])
            )
            existing = result.scalar() or 0
            if existing > 0:
                return {"ok": True, "skipped": True}
            sample = [
                ("Tesco Express", -42.50, "groceries"),
                ("Salary - Acme Ltd", 3200.00, "salary"),
                ("TfL Travel", -7.20, "transport"),
                ("Netflix - Monthly", -10.99, "subscriptions"),
                ("Octopus Energy", -85.40, "utilities"),
                ("Chesed Fund", -36.00, "tzedakah"),
                ("Deliveroo", -22.15, "dining"),
                ("Sainsbury's", -68.30, "groceries"),
                ("Apple iCloud", -2.99, "subscriptions"),
                ("Rent", -1450.00, "rent"),
                ("Trainline", -38.50, "transport"),
                ("Yeshiva Donation", -100.00, "tzedakah"),
                ("Amazon.co.uk", -15.99, "shopping"),
                ("PureGym Monthly", -29.99, "subscriptions"),
                ("Council Tax", -185.00, "utilities"),
            ]
            now = datetime.now(timezone.utc)
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
                    date=(now - timedelta(days=i * 3)),
                )
                session.add(tx)
            await session.commit()
            await maaser.backfill_for_user(session, user["user_id"])
            _query_cache.delete(f"dash:{user['user_id']}")
            return {"ok": True, "inserted": len(sample)}

    # ── Split transactions ───────────────────────────────────────────

    @router.post("/transactions/{tx_id}/split")
    async def split_transaction(tx_id: str, payload: SplitIn, request: Request, user: dict = Depends(get_current_user)):
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
                raise HTTPException(400, f"Split amounts (${total_split:.2f}) must equal original amount (${abs(tx.amount):.2f})")
            await session.execute(
                delete(SplitTransaction).where(SplitTransaction.parent_transaction_id == tx_id)
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
    async def get_splits(tx_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(SplitTransaction).where(
                    SplitTransaction.parent_transaction_id == tx_id,
                    SplitTransaction.user_id == user["user_id"],
                )
            )
            splits = result.scalars().all()
            return {"splits": [
                {
                    "split_id": s.split_id,
                    "amount": s.amount,
                    "category": s.category,
                    "description": s.description,
                    "notes": s.notes,
                } for s in splits
            ]}

    # ── Recurring detection ──────────────────────────────────────────

    @router.post("/transactions/detect-recurring")
    async def detect_recurring(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.amount < 0,
                ).order_by(Transaction.date.desc()).limit(500)
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
            return {"recurring": [
                {
                    "id": r.id,
                    "description": r.description,
                    "amount": r.amount,
                    "category": r.category,
                    "frequency": r.frequency,
                    "next_date": r.next_date.isoformat() if r.next_date else None,
                    "active": r.active,
                } for r in items
            ]}

    # ── Merchant normalization ───────────────────────────────────────

    @router.post("/transactions/normalize-merchants")
    async def normalize_merchants(request: Request, user: dict = Depends(get_current_user)):
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
    async def list_subscriptions(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Subscription).where(Subscription.user_id == user["user_id"]).order_by(Subscription.active.desc(), Subscription.name)
            )
            subs = result.scalars().all()
            return {"subscriptions": [
                {"subscription_id": s.subscription_id, "name": s.name,
                 "amount": float(s.amount), "currency": s.currency,
                 "category": s.category, "merchant": s.merchant,
                 "frequency": s.frequency,
                 "next_billing": s.next_billing.isoformat() if s.next_billing else None,
                 "active": s.active, "notes": s.notes}
                for s in subs
            ]}

    @router.post("/subscriptions")
    async def create_subscription(payload: dict, request: Request, user: dict = Depends(get_current_user)):
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
    async def update_subscription(subscription_id: str, payload: dict, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Subscription).where(Subscription.subscription_id == subscription_id, Subscription.user_id == user["user_id"])
            )
            sub = result.scalar_one_or_none()
            if not sub:
                raise HTTPException(404, "Subscription not found")
            for field in ("name", "amount", "currency", "category", "merchant", "frequency", "notes"):
                if field in payload:
                    setattr(sub, field, payload[field])
            if "next_billing" in payload:
                sub.next_billing = payload["next_billing"]
            if "active" in payload:
                sub.active = payload["active"]
            await session.commit()
            return {"ok": True}

    @router.delete("/subscriptions/{subscription_id}")
    async def delete_subscription(subscription_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Subscription).where(Subscription.subscription_id == subscription_id, Subscription.user_id == user["user_id"])
            )
            sub = result.scalar_one_or_none()
            if not sub:
                raise HTTPException(404, "Subscription not found")
            await session.delete(sub)
            await session.commit()
            return {"ok": True}

    # ── Account nicknames ────────────────────────────────────────────

    @router.get("/accounts")
    async def list_accounts(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction.account_id, func.count().label("tx_count"))
                .where(Transaction.user_id == user["user_id"], Transaction.account_id.isnot(None))
                .group_by(Transaction.account_id)
                .order_by(func.count().desc())
            )
            account_rows = result.all()
            nick_result = await session.execute(
                select(AccountNickname).where(AccountNickname.user_id == user["user_id"])
            )
            nicknames = {n.account_id: n.nickname for n in nick_result.scalars().all()}
            accounts = []
            for row in account_rows:
                aid = row.account_id
                accounts.append({
                    "account_id": aid,
                    "nickname": nicknames.get(aid),
                    "transaction_count": row.tx_count,
                })
            return {"accounts": accounts}

    @router.put("/accounts/{account_id}/nickname")
    async def set_nickname(account_id: str, payload: NicknameIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(AccountNickname).where(
                    AccountNickname.user_id == user["user_id"],
                    AccountNickname.account_id == account_id,
                )
            )
            nick = result.scalar_one_or_none()
            if nick:
                nick.nickname = payload.nickname
                if payload.account_name:
                    nick.account_name = payload.account_name
            else:
                nick = AccountNickname(
                    user_id=user["user_id"],
                    account_id=account_id,
                    nickname=payload.nickname,
                    account_name=payload.account_name,
                )
                session.add(nick)
            await session.commit()
            return {"ok": True, "account_id": account_id, "nickname": payload.nickname}

    # ── Categories ──────────────────────────────────────────────────

    @router.get("/categories")
    async def list_categories(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Category).where(Category.user_id == user["user_id"]).order_by(Category.sort_order, Category.name)
            )
            cats = result.scalars().all()
            user_names = {c.name for c in cats}
            defaults = [
                {"category_id": None, "name": n, "icon": None, "color": None,
                 "is_income": n in {"salary", "income"}, "budget": None,
                 "sort_order": i, "is_default": True}
                for i, n in enumerate(CATEGORIES) if n != "uncategorized" and n not in user_names
            ]
            user_cats = [
                {"category_id": c.category_id, "name": c.name, "icon": c.icon,
                 "color": c.color, "is_income": c.is_income,
                 "budget": float(c.budget) if c.budget else None,
                 "sort_order": c.sort_order, "is_default": False}
                for c in cats
            ]
            return {"categories": defaults + user_cats}

    @router.post("/categories")
    async def create_category(payload: dict, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            existing = await session.execute(
                select(Category).where(Category.user_id == user["user_id"], Category.name == payload["name"])
            )
            if existing.scalar_one_or_none():
                raise HTTPException(409, "Category already exists")
            cat = Category(
                category_id=f"cat_{uuid.uuid4().hex[:12]}",
                user_id=user["user_id"],
                name=payload["name"],
                icon=payload.get("icon"),
                color=payload.get("color"),
                is_income=payload.get("is_income", False),
                budget=payload.get("budget"),
                sort_order=payload.get("sort_order", 0),
            )
            session.add(cat)
            await session.commit()
            await session.refresh(cat)
            return {"category_id": cat.category_id, "name": cat.name}

    @router.patch("/categories/{category_id}")
    async def update_category(category_id: str, payload: dict, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Category).where(Category.category_id == category_id, Category.user_id == user["user_id"])
            )
            cat = result.scalar_one_or_none()
            if not cat:
                raise HTTPException(404, "Category not found")
            for field in ("name", "icon", "color", "is_income", "sort_order"):
                if field in payload:
                    setattr(cat, field, payload[field])
            if "budget" in payload:
                cat.budget = payload["budget"]
            await session.commit()
            return {"ok": True}

    @router.delete("/categories/{category_id}")
    async def delete_category(category_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Category).where(Category.category_id == category_id, Category.user_id == user["user_id"])
            )
            cat = result.scalar_one_or_none()
            if not cat:
                raise HTTPException(404, "Category not found")
            await session.delete(cat)
            await session.commit()
            return {"ok": True}

    # ── Learned category rules ────────────────────────────────────────

    @router.get("/category-rules")
    async def list_category_rules(request: Request, user: dict = Depends(get_current_user)):
        from db import CategoryRule
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(CategoryRule)
                .where(CategoryRule.user_id == user["user_id"])
                .order_by(CategoryRule.match_count.desc(), CategoryRule.updated_at.desc())
            )
            rules = result.scalars().all()
            return {"rules": [
                {"id": r.id, "merchant": r.merchant, "category": r.category,
                 "match_count": r.match_count, "source": r.source,
                 "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
                 "created_at": r.created_at.isoformat() if r.created_at else None}
                for r in rules
            ]}

    @router.post("/category-rules")
    async def create_category_rule(payload: dict, request: Request, user: dict = Depends(get_current_user)):
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
                    user_id=user["user_id"], merchant=merchant, category=category,
                    match_count=1, source="manual",
                )
                session.add(rule)
            await session.commit()
            return {"ok": True, "id": rule.id}

    @router.patch("/category-rules/{rule_id}")
    async def update_category_rule(rule_id: int, payload: dict, request: Request, user: dict = Depends(get_current_user)):
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
    async def delete_category_rule(rule_id: int, request: Request, user: dict = Depends(get_current_user)):
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
    async def apply_rules_to_existing(request: Request, user: dict = Depends(get_current_user)):
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
            return {"updated": updated}

    # ── Analytics ────────────────────────────────────────────────────

    @router.get("/analytics/spending-by-category")
    async def spending_by_category(
        request: Request, user: dict = Depends(get_current_user),
        date_from: str = Query(None), date_to: str = Query(None),
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
                stmt = stmt.where(Transaction.date <= datetime.fromisoformat(date_to) + timedelta(days=1))
            result = await session.execute(stmt)
            txs = result.scalars().all()
            cats = defaultdict(float)
            total = 0.0
            for t in txs:
                cat = t.category or "uncategorized"
                amt = abs(t.amount)
                cats[cat] += amt
                total += amt
            sorted_cats = sorted([{"name": k, "value": round(v, 2), "pct": round(v / total * 100, 1) if total else 0} for k, v in cats.items()], key=lambda x: -x["value"])
            return {"categories": sorted_cats, "total": round(total, 2)}

    @router.get("/analytics/spending-trends")
    async def spending_trends(request: Request, user: dict = Depends(get_current_user), months: int = 12):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
                .order_by(Transaction.date.desc()).limit(2000)
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
            trends = sorted([{"month": k, **v} for k, v in monthly.items()], key=lambda x: x["month"])[-months:]
            return {"trends": trends}

    @router.get("/analytics/budget-comparison")
    async def budget_comparison(request: Request, user: dict = Depends(get_current_user)):
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
                spent = sum(abs(t.amount) for t in txs if t.amount < 0 and t.category == b.category and t.date and t.date >= month_start)
                comparisons.append({
                    "category": b.category,
                    "budget": round(b.amount, 2),
                    "spent": round(spent, 2),
                    "remaining": round(max(0, b.amount - spent), 2),
                    "progress_pct": round(min(100, spent / b.amount * 100) if b.amount else 0, 1),
                })
            return {"comparisons": comparisons}

    @router.get("/analytics/period-comparison")
    async def period_comparison(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
            )
            txs = result.scalars().all()
            now = datetime.now(timezone.utc)
            current_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
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
            spend_change = ((current["spend"] - previous["spend"]) / previous["spend"] * 100) if previous["spend"] else 0
            income_change = ((current["income"] - previous["income"]) / previous["income"] * 100) if previous["income"] else 0
            return {
                "current_period": {"label": current_start.strftime("%B %Y"), **current},
                "previous_period": {"label": prev_start.strftime("%B %Y"), **previous},
                "spend_change_pct": round(spend_change, 1),
                "income_change_pct": round(income_change, 1),
            }

    @router.get("/analytics/compare-periods")
    async def compare_periods(
        request: Request, user: dict = Depends(get_current_user),
        period_a_from: str = Query(...), period_a_to: str = Query(...),
        period_b_from: str = Query(...), period_b_to: str = Query(...),
        category: str = Query(None),
    ):
        sm = request.app.state.db
        async with sm() as session:

            def _compute(txs_list, label):
                inc = sum(t.amount for t in txs_list if t.amount > 0)
                spd = sum(abs(t.amount) for t in txs_list if t.amount < 0)
                return {"label": label, "income": round(inc, 2), "spend": round(spd, 2), "count": len(txs_list)}

            async def _load_period(date_from: str, date_to: str):
                stmt = select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= datetime.fromisoformat(date_from),
                    Transaction.date <= datetime.fromisoformat(date_to) + timedelta(days=1),
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

            spend_change = ((a_stats["spend"] - b_stats["spend"]) / b_stats["spend"] * 100) if b_stats["spend"] else 0
            income_change = ((a_stats["income"] - b_stats["income"]) / b_stats["income"] * 100) if b_stats["income"] else 0

            cat_breakdown = []
            if not category:
                all_cats = set()
                for t in a_txs + b_txs:
                    if t.amount < 0 and t.category:
                        all_cats.add(t.category)
                for cat in sorted(all_cats):
                    a_spend = round(sum(abs(t.amount) for t in a_txs if t.amount < 0 and t.category == cat), 2)
                    b_spend = round(sum(abs(t.amount) for t in b_txs if t.amount < 0 and t.category == cat), 2)
                    if a_spend > 0 or b_spend > 0:
                        chg = ((a_spend - b_spend) / b_spend * 100) if b_spend else (100 if a_spend > 0 else 0)
                        cat_breakdown.append({
                            "category": cat,
                            "a_spend": a_spend,
                            "b_spend": b_spend,
                            "change_pct": round(chg, 1),
                        })

            return {
                "period_a": a_stats,
                "period_b": b_stats,
                "spend_change_pct": round(spend_change, 1),
                "income_change_pct": round(income_change, 1),
                "category_breakdown": cat_breakdown,
            }

    # ── Dashboard ────────────────────────────────────────────────────

    @router.get("/dashboard/overview")
    async def dashboard_overview(request: Request, user: dict = Depends(get_current_user)):
        uid = user["user_id"]
        cached = _query_cache.get(f"dash:{uid}")
        if cached:
            return cached
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(Transaction.user_id == uid)
                .order_by(Transaction.date.desc()).limit(1000)
            )
            txs = result.scalars().all()
            income = sum(t.amount for t in txs if t.amount > 0)
            spend = sum(-t.amount for t in txs if t.amount < 0)
            balance = income - spend
            cats = defaultdict(float)
            for t in txs:
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
            flow = sorted([{"month": k, **v} for k, v in monthly.items()], key=lambda x: x["month"])[-6:]
            savings_rate = ((income - spend) / income * 100) if income > 0 else 0
            score = max(0, min(100, int(savings_rate * 2 + (50 if balance > 0 else 0))))

            sources = defaultdict(int)
            for t in txs:
                sources[t.source or "manual"] += 1

            payload = {
                "balance": round(balance, 2),
                "income": round(income, 2),
                "spend": round(spend, 2),
                "savings_rate": round(savings_rate, 1),
                "health_score": score,
                "categories": [{"name": k, "value": round(v, 2)} for k, v in sorted(cats.items(), key=lambda x: -x[1])],
                "monthly_flow": flow,
                "recent": [_tx_to_dict(t) for t in txs[:8]],
                "source_breakdown": [{"source": k, "count": v} for k, v in sorted(sources.items(), key=lambda x: -x[1])],
            }
            _query_cache.set(f"dash:{uid}", payload)
            return payload

    # ── Budgets ──────────────────────────────────────────────────────

    @router.get("/budgets")
    async def list_budgets(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Budget).where(Budget.user_id == user["user_id"])
            )
            budgets = result.scalars().all()
            tx_result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
            )
            txs = tx_result.scalars().all()
            result_list = []
            for b in budgets:
                spent = sum(-t.amount for t in txs if t.amount < 0 and t.category == b.category)
                result_list.append({
                    **_budget_to_dict(b),
                    "spent": round(spent, 2),
                    "remaining": round(b.amount - spent, 2),
                    "progress_pct": round(min(100, (spent / b.amount * 100) if b.amount else 0), 1),
                })
            return {"budgets": result_list}

    @router.post("/budgets")
    async def create_budget(payload: BudgetIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            b = Budget(
                budget_id=f"bud_{uuid.uuid4().hex[:12]}",
                user_id=user["user_id"],
                category=payload.category.lower(),
                amount=payload.limit,
                period=payload.period,
            )
            session.add(b)
            await session.commit()
            await session.refresh(b)
            return _budget_to_dict(b)

    @router.delete("/budgets/{budget_id}")
    async def delete_budget(budget_id: str, request: Request, user: dict = Depends(get_current_user)):
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
            return {"ok": True}

    @router.patch("/budgets/{budget_id}")
    async def update_budget(budget_id: str, payload: BudgetUpdate, request: Request,
                            user: dict = Depends(get_current_user)):
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
            await session.commit()
            await session.refresh(b)
            return _budget_to_dict(b)

    # ── Transaction system health check ─────────────────────────────

    @router.get("/transactions/health")
    async def transactions_health(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(func.count()).select_from(Transaction).where(Transaction.user_id == user["user_id"])
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
                select(func.count()).select_from(Transaction).where(
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
                    src: count for src, count in
                    (await session.execute(
                        select(Transaction.source, func.count())
                        .where(Transaction.user_id == user["user_id"])
                        .group_by(Transaction.source)
                    )).all()
                },
            }

    return router
