"""Smart financial engine: transactions, budgets, investments, Jewish tools, UK benefits, reports."""
import uuid
import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, update, delete, func

from db import (
    User, Transaction, Budget, MaaserLedger, get_session_maker,
)
from auth import get_current_user
import maaser

logger = logging.getLogger("finance")


class TransactionIn(BaseModel):
    amount: float
    currency: str = "GBP"
    description: str
    merchant: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    account_id: Optional[str] = None
    is_income: bool = False


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    description: Optional[str] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    is_income: Optional[bool] = None


CATEGORY_RULES = {
    "groceries": ["tesco", "sainsbury", "asda", "aldi", "lidl", "morrison", "waitrose", "kosher", "m&s food", "marks & spencer food", "co-op"],
    "transport": ["tfl", "uber", "bolt", "trainline", "shell", "bp", "petrol", "national express", "southern railway", "thameslink", "oyster"],
    "dining": ["restaurant", "pizza", "deliveroo", "ubereats", "just eat", "mcdonald", "kfc", "subway", "greggs", "costa", "starbucks", "pret"],
    "subscriptions": ["netflix", "spotify", "amazon prime", "apple", "disney", "youtube", "chatgpt", "openai", "github", "adobe", "microsoft 365"],
    "utilities": ["british gas", "edf", "octopus", "thames water", "council tax", "ee", "vodafone", "sky", "virgin media", "severn trent", "yorkshire water"],
    "tzedakah": ["chesed", "tzedakah", "shul", "yeshiva", "kollel", "donation", "charity", "maaser"],
    "rent": ["rent", "mortgage", "letting", "landlord", "tenancy"],
    "salary": ["salary", "wages", "payroll", "hmrc"],
    "income": ["refund", "interest", "dividend", "tax refund", "cashback"],
    "shopping": ["amazon", "argos", "ikea", "b&q", "screwfix", "primark", "zara", "h&m", "next", "john lewis", "eBay", "etsy"],
    "health": ["nhs", "boots", "superdrug", "pharmacy", "doctor", "dentist", "optician", "hospital", "gym", "puregym"],
    "entertainment": ["cinema", "odeon", "vue", "showcase", "national trust", "english heritage", "spotify", "eventim", "ticketmaster"],
    "insurance": ["aviva", "direct line", "admiral", "churchill", "axa", "legal & general", "life insurance", "car insurance", "home insurance"],
    "education": ["coursera", "udemy", "open university", "school", "nursery", "childcare", "tutor"],
    "transfer": ["bank transfer", "transfer", "faster payment", "bacs", "chaps", "paypal", "monzo me", "starling"],
    "cash": ["cash", "atm", "withdrawal"],
    "tax": ["self assessment", "tax", "hmrc", "stamp duty"],
    "fees": ["fee", "charge", "penalty", "interest charge", "o/d fee", "overdraft"],
}


def smart_categorize(text: str) -> str:
    t = (text or "").lower()
    for cat, keywords in CATEGORY_RULES.items():
        if any(k in t for k in keywords):
            return cat
    return "uncategorized"


class BudgetIn(BaseModel):
    category: str
    limit: float
    period: str = "monthly"


class BudgetUpdate(BaseModel):
    category: Optional[str] = None
    limit: Optional[float] = None
    period: Optional[str] = None


class InvestmentForecastIn(BaseModel):
    symbol: str
    monthly_contribution: float
    start_date: Optional[str] = None
    years: int = 10
    annual_return_pct: Optional[float] = None
    initial_value: float = 0.0


RETURN_MAP = {
    "VUSA": 0.10, "VWRL": 0.08, "VUKE": 0.06, "VFEM": 0.07, "VHVG": 0.08,
    "ISF": 0.06, "IUSA": 0.10, "IWDA": 0.08, "EQQQ": 0.13, "VWRP": 0.08,
    "VUAG": 0.10, "S&P500": 0.10, "FTSE": 0.06, "FTSE100": 0.06,
    "BRK.B": 0.105, "BERKSHIRE": 0.105, "BTC": 0.30, "ETH": 0.25, "GOLD": 0.05,
}


class MaaserIn(BaseModel):
    income: float
    percent: float = 10.0


class MaaserSettingsIn(BaseModel):
    enabled: bool
    percent: float = 10.0


class TzedakahEntryIn(BaseModel):
    amount: float
    recipient: str
    note: Optional[str] = None
    date: Optional[str] = None


HOLIDAY_BUDGET_HINTS = [
    {"holiday": "Pesach", "month": "Nisan", "uplift_pct": 80, "tip": "Stock up on kosher-for-Passover staples 6 weeks early to avoid premium prices."},
    {"holiday": "Rosh Hashana / Yom Kippur", "month": "Tishrei", "uplift_pct": 35, "tip": "Account for shul seats, honey, and seasonal produce."},
    {"holiday": "Sukkos", "month": "Tishrei", "uplift_pct": 50, "tip": "Sukkah materials and the four species can total £200-£400."},
    {"holiday": "Chanukah", "month": "Kislev", "uplift_pct": 20, "tip": "Gifts, oil, and donuts. Set a per-child cap upfront."},
    {"holiday": "Purim", "month": "Adar", "uplift_pct": 25, "tip": "Mishloach manos and matanos l'evyonim."},
    {"holiday": "Shavuos", "month": "Sivan", "uplift_pct": 20, "tip": "Dairy menu and flowers."},
]


class UCEstimateIn(BaseModel):
    monthly_earnings: float = 0.0
    children: int = 0
    housing_cost: float = 0.0
    couple: bool = False
    has_disability: bool = False


class HMRCEstimateIn(BaseModel):
    annual_income: float
    tax_year: str = "2025-2026"


def _tx_to_dict(t: Transaction) -> dict:
    return {
        "transaction_id": t.transaction_id,
        "user_id": t.user_id,
        "amount": t.amount,
        "currency": t.currency,
        "description": t.description,
        "merchant": t.merchant_name,
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
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "exclude_from_maaser": t.exclude_from_maaser,
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


def _tz_to_dict(t: MaaserLedger) -> dict:
    return {
        "entry_id": f"tz_{t.id}",
        "user_id": t.user_id,
        "transaction_id": t.transaction_id,
        "amount": t.maaser_paid or t.income_amount,
        "income_amount": t.income_amount,
        "maaser_due": t.maaser_due,
        "maaser_paid": t.maaser_paid,
        "paid_to": t.paid_to,
        "note": t.note,
        "date": t.date.isoformat() if t.date else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "status": "given" if t.maaser_paid > 0 else "pending",
    }


def build_router() -> APIRouter:
    router = APIRouter(tags=["finance"])

    @router.get("/transactions")
    async def list_transactions(request: Request, user: dict = Depends(get_current_user), limit: int = 100):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
                .order_by(Transaction.date.desc()).limit(limit)
            )
            rows = result.scalars().all()
            return {"transactions": [_tx_to_dict(t) for t in rows]}

    @router.post("/transactions")
    async def create_transaction(payload: TransactionIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            tx_id = f"tx_{uuid.uuid4().hex[:12]}"
            category = payload.category or smart_categorize(f"{payload.description} {payload.merchant or ''}")
            tx = Transaction(
                transaction_id=tx_id,
                user_id=user["user_id"],
                amount=payload.amount,
                currency=payload.currency,
                description=payload.description,
                merchant_name=payload.merchant,
                category=category,
                date=datetime.fromisoformat(payload.date) if payload.date else datetime.now(timezone.utc),
                account_id=payload.account_id,
                source="manual",
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
            updates = {}
            if payload.amount is not None:
                tx.amount = payload.amount
                updates["amount"] = payload.amount
            if payload.description is not None:
                tx.description = payload.description
                updates["description"] = payload.description
            if payload.merchant is not None:
                tx.merchant_name = payload.merchant
                updates["merchant_name"] = payload.merchant
            if payload.category is not None:
                tx.category = payload.category
                updates["category"] = payload.category
            if payload.date is not None:
                tx.date = datetime.fromisoformat(payload.date)
                updates["date"] = payload.date
            if payload.is_income is not None:
                pass  # is_income is derived from amount sign
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
            await session.delete(tx)
            await session.commit()
            return {"ok": True}

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
                ("Netflix", -10.99, "subscriptions"),
                ("Octopus Energy", -85.40, "utilities"),
                ("Chesed Fund", -36.00, "tzedakah"),
                ("Deliveroo", -22.15, "dining"),
                ("Sainsbury's", -68.30, "groceries"),
                ("Apple iCloud", -2.99, "subscriptions"),
                ("Rent", -1450.00, "rent"),
                ("Trainline", -38.50, "transport"),
                ("Yeshiva Donation", -100.00, "tzedakah"),
            ]
            now = datetime.now(timezone.utc)
            docs = []
            for i, (desc, amt, cat) in enumerate(sample):
                tx = Transaction(
                    transaction_id=f"tx_{uuid.uuid4().hex[:12]}",
                    user_id=user["user_id"],
                    amount=amt,
                    currency="GBP",
                    description=desc,
                    merchant_name=desc,
                    category=cat,
                    date=(now - timedelta(days=i * 2)),
                )
                session.add(tx)
                docs.append(tx)
            await session.commit()
            await maaser.backfill_for_user(session, user["user_id"])
            return {"ok": True, "inserted": len(docs)}

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
            cats = {}
            for t in txs:
                if t.amount < 0:
                    cats[t.category] = cats.get(t.category, 0) + (-t.amount)
            monthly = {}
            for t in txs:
                if t.date:
                    d = t.date.strftime("%Y-%m")
                    monthly.setdefault(d, {"income": 0, "spend": 0})
                    if t.amount > 0:
                        monthly[d]["income"] += t.amount
                    else:
                        monthly[d]["spend"] += -t.amount
            flow = sorted([{"month": k, **v} for k, v in monthly.items()], key=lambda x: x["month"])[-6:]
            savings_rate = ((income - spend) / income * 100) if income > 0 else 0
            score = max(0, min(100, int(savings_rate * 2 + (50 if balance > 0 else 0))))
            return {
                "balance": round(balance, 2),
                "income": round(income, 2),
                "spend": round(spend, 2),
                "savings_rate": round(savings_rate, 1),
                "health_score": score,
                "categories": [{"name": k, "value": round(v, 2)} for k, v in sorted(cats.items(), key=lambda x: -x[1])],
                "monthly_flow": flow,
                "recent": [_tx_to_dict(t) for t in txs[:8]],
            }

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

    @router.post("/investments/forecast")
    async def forecast(payload: InvestmentForecastIn):
        annual = payload.annual_return_pct
        if annual is None:
            annual = RETURN_MAP.get(payload.symbol.upper(), 0.08) * 100
        r = annual / 100 / 12
        n = payload.years * 12
        future = payload.initial_value * ((1 + r) ** n)
        if r > 0:
            future += payload.monthly_contribution * (((1 + r) ** n - 1) / r)
        else:
            future += payload.monthly_contribution * n
        total_contributed = payload.initial_value + payload.monthly_contribution * n
        points = []
        for year in range(payload.years + 1):
            yn = year * 12
            v = payload.initial_value * ((1 + r) ** yn)
            if r > 0:
                v += payload.monthly_contribution * (((1 + r) ** yn - 1) / r)
            else:
                v += payload.monthly_contribution * yn
            points.append({"year": year, "value": round(v, 2),
                           "contributed": round(payload.initial_value + payload.monthly_contribution * yn, 2)})
        return {
            "symbol": payload.symbol.upper(),
            "annual_return_pct": round(annual, 2),
            "future_value": round(future, 2),
            "total_contributed": round(total_contributed, 2),
            "gain": round(future - total_contributed, 2),
            "points": points,
        }

    @router.post("/jewish/maaser")
    async def maaser_calc(payload: MaaserIn):
        amount = round(payload.income * (payload.percent / 100), 2)
        return {"income": payload.income, "percent": payload.percent, "maaser_amount": amount}

    @router.get("/jewish/maaser/settings")
    async def get_maaser_settings(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(User).where(User.user_id == user["user_id"])
            )
            u = result.scalar_one_or_none()
            prefs = u.preferences or {} if u else {}
            s = prefs.get("maaser") or {}
            return {"enabled": bool(s.get("enabled")), "percent": float(s.get("percent", 10))}

    @router.put("/jewish/maaser/settings")
    async def set_maaser_settings(payload: MaaserSettingsIn, request: Request, user: dict = Depends(get_current_user)):
        if payload.percent < 0 or payload.percent > 100:
            raise HTTPException(400, "Percent must be between 0 and 100")
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(User).where(User.user_id == user["user_id"])
            )
            u = result.scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            prefs = u.preferences or {}
            prefs["maaser"] = {"enabled": payload.enabled, "percent": payload.percent}
            u.preferences = prefs
            await session.commit()
            backfill = {"created": 0, "skipped": 0, "total_amount": 0}
            if payload.enabled:
                backfill = await maaser.backfill_for_user(session, user["user_id"])
            return {"ok": True, "backfill": backfill}

    @router.post("/jewish/maaser/backfill")
    async def maaser_backfill(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await maaser.backfill_for_user(session, user["user_id"])
            return result

    @router.get("/jewish/maaser/summary")
    async def maaser_summary(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(User).where(User.user_id == user["user_id"])
            )
            u = result.scalar_one_or_none()
            prefs = u.preferences or {} if u else {}
            s = prefs.get("maaser") or {}
            percent = float(s.get("percent", 10))

            tx_result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
            )
            txs = tx_result.scalars().all()
            total_income = 0.0
            tx_given = 0.0
            for t in txs:
                amt = float(t.amount or 0)
                cat = (t.category or "").lower()
                if amt > 0 or cat in maaser.INCOME_CATEGORIES:
                    total_income += abs(amt)
                if amt < 0 and cat == "tzedakah":
                    tx_given += -amt
            obligation = round(total_income * percent / 100, 2)

            ledger_result = await session.execute(
                select(MaaserLedger).where(
                    MaaserLedger.user_id == user["user_id"],
                    MaaserLedger.transaction_id.is_(None),
                )
            )
            ledger = ledger_result.scalars().all()
            manual_given = sum((e.maaser_paid or e.income_amount or 0) for e in ledger)

            pending_result = await session.execute(
                select(MaaserLedger).where(
                    MaaserLedger.user_id == user["user_id"],
                    MaaserLedger.maaser_paid == 0,
                )
            )
            accrued_pending = sum(r.maaser_due or 0 for r in pending_result.scalars().all())

            given_total = manual_given + tx_given
            balance_owed = round(max(0, obligation - given_total), 2)
            credit = round(max(0, given_total - obligation), 2)
            return {
                "percent": percent,
                "total_income": round(total_income, 2),
                "obligation": obligation,
                "given_total": round(given_total, 2),
                "tx_given": round(tx_given, 2),
                "ledger_given": round(manual_given, 2),
                "accrued_pending": round(accrued_pending, 2),
                "balance_owed": balance_owed,
                "credit": credit,
            }

    @router.post("/jewish/maaser/reset")
    async def maaser_reset(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            await session.execute(
                delete(MaaserLedger).where(
                    MaaserLedger.user_id == user["user_id"],
                    MaaserLedger.transaction_id.isnot(None),
                )
            )
            await session.commit()
            return {"ok": True}

    @router.post("/jewish/maaser/pay/{entry_id}")
    async def pay_pending(entry_id: str, request: Request, user: dict = Depends(get_current_user),
                          recipient: str = "Tzedakah"):
        sm = request.app.state.db
        async with sm() as session:
            entry_id_int = int(entry_id.replace("tz_", "")) if entry_id.startswith("tz_") else int(entry_id)
            result = await session.execute(
                select(MaaserLedger).where(
                    MaaserLedger.id == entry_id_int,
                    MaaserLedger.user_id == user["user_id"],
                    MaaserLedger.maaser_paid == 0,
                )
            )
            entry = result.scalar_one_or_none()
            if not entry:
                raise HTTPException(404, "Pending entry not found")
            entry.maaser_paid = entry.maaser_due
            entry.paid_to = recipient
            await session.commit()
            return {"ok": True}

    @router.get("/jewish/tzedakah")
    async def list_tzedakah(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(MaaserLedger).where(MaaserLedger.user_id == user["user_id"])
                .order_by(MaaserLedger.date.desc()).limit(200)
            )
            rows = result.scalars().all()
            total = sum(r.maaser_paid or r.income_amount or 0 for r in rows)
            return {"entries": [_tz_to_dict(r) for r in rows], "total_given": round(total, 2)}

    @router.post("/jewish/tzedakah")
    async def add_tzedakah(payload: TzedakahEntryIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            entry = MaaserLedger(
                user_id=user["user_id"],
                maaser_paid=payload.amount,
                paid_to=payload.recipient,
                note=payload.note,
                date=datetime.fromisoformat(payload.date) if payload.date else datetime.now(timezone.utc),
            )
            session.add(entry)
            await session.commit()
            await session.refresh(entry)
            return _tz_to_dict(entry)

    @router.get("/jewish/holiday-budget")
    async def holiday_budget():
        return {"holidays": HOLIDAY_BUDGET_HINTS}

    @router.post("/uk/universal-credit")
    async def uc(payload: UCEstimateIn):
        standard = 400.14 if not payload.couple else 628.10
        child = 333.33 * payload.children
        housing = payload.housing_cost
        disability = 156.11 if payload.has_disability else 0
        gross = standard + child + housing + disability
        work_allowance = 411 if (payload.children > 0 or payload.has_disability) else 0
        taper = max(0, (payload.monthly_earnings - work_allowance)) * 0.55
        estimate = max(0, gross - taper)
        return {
            "estimated_monthly_uc": round(estimate, 2),
            "breakdown": {
                "standard_allowance": round(standard, 2),
                "child_element": round(child, 2),
                "housing_element": round(housing, 2),
                "disability_element": round(disability, 2),
                "earnings_taper_deduction": round(taper, 2),
            },
        }

    @router.post("/uk/hmrc-estimate")
    async def hmrc(payload: HMRCEstimateIn):
        i = payload.annual_income
        personal_allowance = 12570 if i < 100000 else max(0, 12570 - (i - 100000) / 2)
        taxable = max(0, i - personal_allowance)
        basic_band = min(taxable, 37700)
        higher_band = max(0, min(taxable - 37700, 125140 - 37700))
        addl_band = max(0, taxable - (125140 - personal_allowance))
        income_tax = basic_band * 0.20 + higher_band * 0.40 + addl_band * 0.45
        ni_lower = 12570
        ni_upper = 50270
        ni = max(0, min(i, ni_upper) - ni_lower) * 0.08 + max(0, i - ni_upper) * 0.02
        take_home = i - income_tax - ni
        return {
            "annual_income": round(i, 2),
            "personal_allowance": round(personal_allowance, 2),
            "income_tax": round(income_tax, 2),
            "national_insurance": round(ni, 2),
            "take_home": round(take_home, 2),
            "monthly_take_home": round(take_home / 12, 2),
            "effective_rate_pct": round((income_tax + ni) / i * 100, 1) if i > 0 else 0,
        }

    return router
