"""Smart financial engine: transactions, budgets, investments, Jewish tools, UK benefits, reports."""
import uuid
import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field

from auth import get_current_user
import maaser

logger = logging.getLogger("finance")

# ===== Transactions =====
class TransactionIn(BaseModel):
    amount: float
    currency: str = "GBP"
    description: str
    merchant: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None  # ISO
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
    "groceries": ["tesco", "sainsbury", "asda", "aldi", "lidl", "morrison", "waitrose", "kosher"],
    "transport": ["tfl", "uber", "bolt", "trainline", "shell", "bp", "petrol"],
    "dining": ["restaurant", "pizza", "deliveroo", "ubereats", "just eat", "mcdonald", "kfc"],
    "subscriptions": ["netflix", "spotify", "amazon prime", "apple", "disney", "youtube"],
    "utilities": ["british gas", "edf", "octopus", "thames water", "council tax", "ee", "vodafone"],
    "tzedakah": ["chesed", "tzedakah", "shul", "yeshiva", "kollel", "donation"],
    "rent": ["rent", "mortgage", "letting"],
    "salary": ["salary", "wages", "payroll"],
    "income": ["refund", "interest", "dividend"],
}


def smart_categorize(text: str) -> str:
    t = (text or "").lower()
    for cat, keywords in CATEGORY_RULES.items():
        if any(k in t for k in keywords):
            return cat
    return "uncategorized"


# ===== Budgets =====
class BudgetIn(BaseModel):
    category: str
    limit: float
    period: str = "monthly"  # monthly | weekly | yearly


class BudgetUpdate(BaseModel):
    category: Optional[str] = None
    limit: Optional[float] = None
    period: Optional[str] = None


# ===== Investments =====
class InvestmentForecastIn(BaseModel):
    symbol: str
    monthly_contribution: float
    start_date: Optional[str] = None
    years: int = 10
    annual_return_pct: Optional[float] = None
    initial_value: float = 0.0


# Approximate historical avg annual returns
RETURN_MAP = {
    "VUSA": 0.10, "VWRL": 0.08, "VUKE": 0.06, "VFEM": 0.07, "VHVG": 0.08,
    "ISF": 0.06, "IUSA": 0.10, "IWDA": 0.08, "EQQQ": 0.13, "VWRP": 0.08,
    "VUAG": 0.10, "S&P500": 0.10, "FTSE": 0.06, "FTSE100": 0.06,
    "BRK.B": 0.105, "BERKSHIRE": 0.105, "BTC": 0.30, "ETH": 0.25, "GOLD": 0.05,
}


# ===== Jewish =====
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


# Jewish month spending uplift suggestions (relative %)
HOLIDAY_BUDGET_HINTS = [
    {"holiday": "Pesach", "month": "Nisan", "uplift_pct": 80, "tip": "Stock up on kosher-for-Passover staples 6 weeks early to avoid premium prices."},
    {"holiday": "Rosh Hashana / Yom Kippur", "month": "Tishrei", "uplift_pct": 35, "tip": "Account for shul seats, honey, and seasonal produce."},
    {"holiday": "Sukkos", "month": "Tishrei", "uplift_pct": 50, "tip": "Sukkah materials and the four species can total £200-£400."},
    {"holiday": "Chanukah", "month": "Kislev", "uplift_pct": 20, "tip": "Gifts, oil, and donuts. Set a per-child cap upfront."},
    {"holiday": "Purim", "month": "Adar", "uplift_pct": 25, "tip": "Mishloach manos and matanos l'evyonim."},
    {"holiday": "Shavuos", "month": "Sivan", "uplift_pct": 20, "tip": "Dairy menu and flowers."},
]


# ===== UK Benefits =====
class UCEstimateIn(BaseModel):
    monthly_earnings: float = 0.0
    children: int = 0
    housing_cost: float = 0.0
    couple: bool = False
    has_disability: bool = False


class HMRCEstimateIn(BaseModel):
    annual_income: float
    tax_year: str = "2025-2026"


def build_router() -> APIRouter:
    router = APIRouter(tags=["finance"])

    # ---- Transactions ----
    @router.get("/transactions")
    async def list_transactions(request: Request, user: dict = Depends(get_current_user), limit: int = 100):
        db = request.app.state.db
        rows = await db.transactions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", -1).limit(limit).to_list(limit)
        return {"transactions": rows}

    @router.post("/transactions")
    async def create_transaction(payload: TransactionIn, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        tx_id = f"tx_{uuid.uuid4().hex[:12]}"
        category = payload.category or smart_categorize(f"{payload.description} {payload.merchant or ''}")
        doc = {
            "transaction_id": tx_id,
            "user_id": user["user_id"],
            "amount": payload.amount,
            "currency": payload.currency,
            "description": payload.description,
            "merchant": payload.merchant,
            "category": category,
            "date": payload.date or datetime.now(timezone.utc).isoformat(),
            "account_id": payload.account_id,
            "is_income": payload.is_income,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.transactions.insert_one(doc)
        doc.pop("_id", None)
        accrued = await maaser.maybe_accrue(db, user["user_id"], doc)
        if accrued:
            doc["maaser_accrued"] = accrued
        return doc

    @router.patch("/transactions/{tx_id}")
    async def update_transaction(tx_id: str, payload: TransactionUpdate, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        update = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not update:
            raise HTTPException(400, "Empty update")
        result = await db.transactions.update_one(
            {"transaction_id": tx_id, "user_id": user["user_id"]}, {"$set": update})
        if result.matched_count == 0:
            raise HTTPException(404, "Not found")
        doc = await db.transactions.find_one({"transaction_id": tx_id}, {"_id": 0})
        # If edit turned this into an income tx, accrue maaser (idempotent via source_tx_id)
        await maaser.maybe_accrue(db, user["user_id"], doc)
        return doc

    @router.delete("/transactions/{tx_id}")
    async def delete_transaction(tx_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        result = await db.transactions.delete_one({"transaction_id": tx_id, "user_id": user["user_id"]})
        if result.deleted_count == 0:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @router.post("/transactions/seed-demo")
    async def seed_demo(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        existing = await db.transactions.count_documents({"user_id": user["user_id"]})
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
            docs.append({
                "transaction_id": f"tx_{uuid.uuid4().hex[:12]}",
                "user_id": user["user_id"],
                "amount": amt,
                "currency": "GBP",
                "description": desc,
                "merchant": desc,
                "category": cat,
                "date": (now - timedelta(days=i * 2)).isoformat(),
                "is_income": amt > 0,
                "created_at": now.isoformat(),
            })
        await db.transactions.insert_many(docs)
        # If auto-maaser is on, accrue for the seeded income transactions
        await maaser.backfill_for_user(db, user["user_id"])
        return {"ok": True, "inserted": len(docs)}

    @router.get("/dashboard/overview")
    async def dashboard_overview(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        txs = await db.transactions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
        income = sum(t["amount"] for t in txs if t["amount"] > 0)
        spend = sum(-t["amount"] for t in txs if t["amount"] < 0)
        balance = income - spend
        # Category breakdown
        cats = {}
        for t in txs:
            if t["amount"] < 0:
                cats[t["category"]] = cats.get(t["category"], 0) + (-t["amount"])
        # Monthly cash flow (last 6 months)
        monthly = {}
        for t in txs:
            d = t["date"][:7]
            monthly.setdefault(d, {"income": 0, "spend": 0})
            if t["amount"] > 0:
                monthly[d]["income"] += t["amount"]
            else:
                monthly[d]["spend"] += -t["amount"]
        flow = sorted([{"month": k, **v} for k, v in monthly.items()], key=lambda x: x["month"])[-6:]
        # health score
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
            "recent": txs[:8],
        }

    # ---- Budgets ----
    @router.get("/budgets")
    async def list_budgets(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        budgets = await db.budgets.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
        # progress
        txs = await db.transactions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
        for b in budgets:
            spent = sum(-t["amount"] for t in txs if t["amount"] < 0 and t["category"] == b["category"])
            b["spent"] = round(spent, 2)
            b["remaining"] = round(b["limit"] - spent, 2)
            b["progress_pct"] = round(min(100, (spent / b["limit"] * 100) if b["limit"] else 0), 1)
        return {"budgets": budgets}

    @router.post("/budgets")
    async def create_budget(payload: BudgetIn, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        doc = {
            "budget_id": f"bud_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "category": payload.category.lower(),
            "limit": payload.limit,
            "period": payload.period,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.budgets.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.delete("/budgets/{budget_id}")
    async def delete_budget(budget_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        result = await db.budgets.delete_one({"budget_id": budget_id, "user_id": user["user_id"]})
        if result.deleted_count == 0:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @router.patch("/budgets/{budget_id}")
    async def update_budget(budget_id: str, payload: BudgetUpdate, request: Request,
                            user: dict = Depends(get_current_user)):
        db = request.app.state.db
        update = {k: v for k, v in payload.model_dump().items() if v is not None}
        if "category" in update:
            update["category"] = update["category"].lower()
        if not update:
            raise HTTPException(400, "Empty update")
        result = await db.budgets.update_one(
            {"budget_id": budget_id, "user_id": user["user_id"]}, {"$set": update})
        if result.matched_count == 0:
            raise HTTPException(404, "Not found")
        doc = await db.budgets.find_one({"budget_id": budget_id}, {"_id": 0})
        return doc

    # ---- Investments ----
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
        # Generate yearly points
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

    # ---- Jewish ----
    @router.post("/jewish/maaser")
    async def maaser_calc(payload: MaaserIn):
        amount = round(payload.income * (payload.percent / 100), 2)
        return {"income": payload.income, "percent": payload.percent, "maaser_amount": amount}

    @router.get("/jewish/maaser/settings")
    async def get_maaser_settings(request: Request, user: dict = Depends(get_current_user)):
        u = await request.app.state.db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "maaser": 1})
        s = (u or {}).get("maaser") or {}
        return {"enabled": bool(s.get("enabled")), "percent": float(s.get("percent", 10))}

    @router.put("/jewish/maaser/settings")
    async def set_maaser_settings(payload: MaaserSettingsIn, request: Request, user: dict = Depends(get_current_user)):
        if payload.percent < 0 or payload.percent > 100:
            raise HTTPException(400, "Percent must be between 0 and 100")
        db = request.app.state.db
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"maaser.enabled": payload.enabled, "maaser.percent": payload.percent}},
        )
        # When enabling (or changing percent while enabled), backfill any income
        # transactions that haven't been accrued yet.
        backfill = {"created": 0, "skipped": 0, "total_amount": 0}
        if payload.enabled:
            backfill = await maaser.backfill_for_user(db, user["user_id"])
        return {"ok": True, "backfill": backfill}

    @router.post("/jewish/maaser/backfill")
    async def maaser_backfill(request: Request, user: dict = Depends(get_current_user)):
        """Manually trigger a scan of existing income transactions and accrue maaser for any that were missed."""
        result = await maaser.backfill_for_user(request.app.state.db, user["user_id"])
        return result

    @router.get("/jewish/maaser/summary")
    async def maaser_summary(request: Request, user: dict = Depends(get_current_user)):
        """Live Maaser calculation:
        - obligation = configured_percent% of every income transaction
        - given = tzedakah-category spending + manually-logged ledger gifts (POST /jewish/tzedakah)
        - balance_owed = max(0, obligation - given)
        Auto-accrued pending entries (status=pending with source_tx_id) are shown
        as an audit trail only, they don't double-count against the obligation.
        """
        db = request.app.state.db
        u = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "maaser": 1})
        settings = (u or {}).get("maaser") or {}
        percent = float(settings.get("percent", 10))

        # Real-time obligation: % of every income transaction
        txs = await db.transactions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(5000)
        total_income = 0.0
        tx_given = 0.0
        for t in txs:
            amt = float(t.get("amount", 0) or 0)
            cat = (t.get("category") or "").lower()
            if t.get("is_income") or amt > 0 or cat in maaser.INCOME_CATEGORIES:
                total_income += abs(amt)
            if amt < 0 and cat == "tzedakah":
                tx_given += -amt
        obligation = round(total_income * percent / 100, 2)

        # Manual ledger entries: only those NOT auto-generated (no source_tx_id)
        ledger = await db.tzedakah.find(
            {"user_id": user["user_id"], "source_tx_id": {"$in": [None, ""]}},
            {"_id": 0},
        ).to_list(2000)
        # Also include legacy entries that have no source_tx_id field at all
        legacy = await db.tzedakah.find(
            {"user_id": user["user_id"], "source_tx_id": {"$exists": False}},
            {"_id": 0},
        ).to_list(2000)
        manual_given = sum(e["amount"] for e in ledger + legacy)

        # Pending auto-accrued entries (audit trail only)
        accrued_pending = sum(
            r["amount"] for r in await db.tzedakah.find(
                {"user_id": user["user_id"], "status": "pending"}, {"_id": 0}
            ).to_list(2000)
        )

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
        """Wipe the auto-Maaser audit trail (pending entries + entries marked
        given via the pay-pending action). Keeps manual tzedakah ledger entries.
        """
        db = request.app.state.db
        result = await db.tzedakah.delete_many({
            "user_id": user["user_id"],
            "source_tx_id": {"$exists": True, "$nin": [None, ""]},
        })
        return {"ok": True, "deleted": result.deleted_count}

    @router.post("/jewish/maaser/pay/{entry_id}")
    async def pay_pending(entry_id: str, request: Request, user: dict = Depends(get_current_user),
                          recipient: str = "Tzedakah"):
        """Mark a pending Maaser entry as given (paid)."""
        db = request.app.state.db
        r = await db.tzedakah.update_one(
            {"entry_id": entry_id, "user_id": user["user_id"], "status": "pending"},
            {"$set": {"status": "given", "recipient": recipient,
                      "paid_at": datetime.now(timezone.utc).isoformat()}},
        )
        if r.matched_count == 0:
            raise HTTPException(404, "Pending entry not found")
        return {"ok": True}

    @router.get("/jewish/tzedakah")
    async def list_tzedakah(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        rows = await db.tzedakah.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", -1).to_list(200)
        total = sum(r["amount"] for r in rows)
        return {"entries": rows, "total_given": round(total, 2)}

    @router.post("/jewish/tzedakah")
    async def add_tzedakah(payload: TzedakahEntryIn, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        doc = {
            "entry_id": f"tz_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "amount": payload.amount,
            "recipient": payload.recipient,
            "note": payload.note,
            "date": payload.date or datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.tzedakah.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/jewish/holiday-budget")
    async def holiday_budget():
        return {"holidays": HOLIDAY_BUDGET_HINTS}

    # ---- UK Benefits ----
    @router.post("/uk/universal-credit")
    async def uc(payload: UCEstimateIn):
        # 2025/26 simplified amounts (monthly)
        standard = 400.14 if not payload.couple else 628.10
        child = 333.33 * payload.children
        housing = payload.housing_cost  # naive – LHA caps not modelled here
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
        # 2025/26 bands (England)
        personal_allowance = 12570 if i < 100000 else max(0, 12570 - (i - 100000) / 2)
        taxable = max(0, i - personal_allowance)
        basic_band = min(taxable, 37700)
        higher_band = max(0, min(taxable - 37700, 125140 - 37700))
        addl_band = max(0, taxable - (125140 - personal_allowance))
        income_tax = basic_band * 0.20 + higher_band * 0.40 + addl_band * 0.45
        # NI Class 1 employee (simplified)
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
