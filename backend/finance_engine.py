"""Smart financial engine: transactions, budgets, analytics, merchant normalization, split, recurring."""
import uuid
import math
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update, delete, func, or_, and_

from db import (
    User, Transaction, Budget, SplitTransaction, AccountNickname,
    RecurringTransaction, get_session_maker,
)
from auth import get_current_user
import maaser

logger = logging.getLogger("finance")

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


def smart_categorize(text: str) -> str:
    t = (text or "").lower()
    for cat, keywords in CATEGORY_RULES.items():
        if any(k in t for k in keywords):
            return cat
    return "uncategorized"


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
            count_result = await session.execute(count_stmt)
            total = count_result.scalar() or 0

            return {
                "transactions": [_tx_to_dict(t) for t in rows],
                "total": total,
                "offset": offset,
                "limit": limit,
            }

    @router.post("/transactions")
    async def create_transaction(payload: TransactionIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            tx_id = f"tx_{uuid.uuid4().hex[:12]}"
            desc = payload.description or ""
            merch = payload.merchant or ""
            category = payload.category or smart_categorize(f"{desc} {merch}")
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
            if payload.category is not None:
                tx.category = payload.category
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
            await session.commit()
            await session.refresh(tx)
            doc = _tx_to_dict(tx)
            await maaser.maybe_accrue(session, user["user_id"], doc)
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
            await session.delete(tx)
            await session.commit()
            return {"ok": True}

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

    # ── Dashboard ────────────────────────────────────────────────────

    @router.get("/dashboard/overview")
    async def dashboard_overview(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
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

            return {
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

    return router
