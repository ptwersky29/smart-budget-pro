"""Phase 6 — Jewish Finance Engine: Maaser, Tzedakah, Yom Tov, Pesach, Succos, Chasuna, Hebrew calendar."""
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete

from db import User, Transaction, MaaserLedger, HolidayBudget, ChasunaPlan
from auth import get_current_user
import maaser as maaser_mod

logger = logging.getLogger("jewish")

# ── Constants ──────────────────────────────────────────────────────────────

HOLIDAY_DEFAULTS = {
    "Pesach": {
        "categories": ["matzah", "wine", "kosher-food", "disposables", "travel", "gifts", "other"],
        "month": "Nisan", "uplift_pct": 80,
    },
    "Succos": {
        "categories": ["esrog", "lulav", "hadasim", "aravos", "succah", "schach", "decorations", "hosting", "other"],
        "month": "Tishrei", "uplift_pct": 50,
    },
    "Rosh Hashanah": {
        "categories": ["shul-seats", "honey", "apple", "fish", "new-clothes", "gifts", "other"],
        "month": "Tishrei", "uplift_pct": 35,
    },
    "Yom Kippur": {
        "categories": ["shul-seats", "pre-fast-meal", "donations", "other"],
        "month": "Tishrei", "uplift_pct": 15,
    },
    "Chanukah": {
        "categories": ["gifts", "oil", "donuts", "menorah", "other"],
        "month": "Kislev", "uplift_pct": 20,
    },
    "Purim": {
        "categories": ["mishloach-manos", "matanos-levyonim", "costume", "seuda", "other"],
        "month": "Adar", "uplift_pct": 25,
    },
    "Shavuos": {
        "categories": ["dairy-food", "flowers", "decorations", "other"],
        "month": "Sivan", "uplift_pct": 20,
    },
}

CHASUNA_CATEGORIES = {
    "venue", "catering", "photography", "videography", "music", "flowers",
    "decorations", "attire", "rings", "invitations", "transport", "makeup",
    "hair", "sheitels", "shalom-zachor", "vort", "aufruf", "kabbolas-panim",
    "badeken", "chuppah", "seuda", "sheva-brachos", "honeymoon", "gifts",
    "miscellaneous",
}

INCOME_CATEGORIES = {"salary", "income"}

# ── Pydantic models ────────────────────────────────────────────────────────

class MaaserSettingsIn(BaseModel):
    enabled: bool
    percent: float = 10.0
    reset_day: Optional[int] = None
    included_categories: Optional[list[str]] = None
    excluded_categories: Optional[list[str]] = None

class TzedakahEntryIn(BaseModel):
    amount: float
    recipient: str
    note: Optional[str] = None
    date: Optional[str] = None
    transaction_id: Optional[str] = None

class HolidayBudgetIn(BaseModel):
    holiday_name: str
    hebrew_year: Optional[str] = None
    category: str
    budgeted_amount: float = 0
    notes: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class HolidayBudgetUpdateIn(BaseModel):
    budgeted_amount: Optional[float] = None
    actual_amount: Optional[float] = None
    notes: Optional[str] = None

class ChasunaPlanIn(BaseModel):
    category: str
    description: Optional[str] = None
    estimated_cost: float = 0
    notes: Optional[str] = None
    due_date: Optional[str] = None
    vendor: Optional[str] = None

class ChasunaPlanUpdateIn(BaseModel):
    estimated_cost: Optional[float] = None
    actual_cost: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    vendor: Optional[str] = None
    deposit_paid: Optional[float] = None
    due_date: Optional[str] = None

# ── Serializers ────────────────────────────────────────────────────────────

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
        "status": "given" if (t.maaser_paid or 0) > 0 else "pending",
    }

def _hb_to_dict(h: HolidayBudget) -> dict:
    return {
        "id": h.id, "user_id": h.user_id, "holiday_name": h.holiday_name,
        "hebrew_year": h.hebrew_year, "category": h.category,
        "budgeted_amount": h.budgeted_amount, "actual_amount": h.actual_amount,
        "notes": h.notes,
        "start_date": h.start_date.isoformat() if h.start_date else None,
        "end_date": h.end_date.isoformat() if h.end_date else None,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    }

def _cp_to_dict(c: ChasunaPlan) -> dict:
    return {
        "id": c.id, "user_id": c.user_id, "category": c.category,
        "description": c.description, "estimated_cost": c.estimated_cost,
        "actual_cost": c.actual_cost, "status": c.status, "notes": c.notes,
        "vendor": c.vendor, "deposit_paid": c.deposit_paid,
        "due_date": c.due_date.isoformat() if c.due_date else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def build_router() -> APIRouter:
    router = APIRouter(prefix="/jewish", tags=["jewish"])

    # ── Helpers ────────────────────────────────────────────────────────

    def _parse_date(s: str | None):
        if not s:
            return None
        try:
            return datetime.fromisoformat(s)
        except (ValueError, TypeError):
            try:
                return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                return None

    async def _get_pref(session, user_id: str, key: str, default=None):
        result = await session.execute(select(User).where(User.user_id == user_id))
        u = result.scalar_one_or_none()
        if not u:
            return default
        prefs = u.preferences or {}
        return prefs.get(key, default)

    async def _set_pref(session, user_id: str, key: str, value):
        result = await session.execute(select(User).where(User.user_id == user_id))
        u = result.scalar_one_or_none()
        if not u:
            return
        prefs = dict(u.preferences or {})
        prefs[key] = value
        u.preferences = prefs

    # ════════════════════════════════════════════════════════════════════
    # MAASER
    # ════════════════════════════════════════════════════════════════════

    @router.post("/maaser/calc")
    async def maaser_calc(income: float = Query(...), percent: float = Query(10.0)):
        if income < 0:
            raise HTTPException(400, "income must be a positive number")
        if percent < 0 or percent > 100:
            raise HTTPException(400, "percent must be between 0 and 100")
        amount = round(income * (percent / 100), 2)
        return {"income": income, "percent": percent, "maaser_amount": amount}

    @router.get("/maaser/settings")
    async def get_settings(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            s = await _get_pref(session, user["user_id"], "maaser", {})
            return {
                "enabled": bool(s.get("enabled")),
                "percent": float(s.get("percent", 10)),
                "reset_day": s.get("reset_day", 1),
                "included_categories": s.get("included_categories", list(INCOME_CATEGORIES)),
                "excluded_categories": s.get("excluded_categories", []),
            }

    @router.put("/maaser/settings")
    async def set_settings(payload: MaaserSettingsIn, request: Request, user: dict = Depends(get_current_user)):
        if payload.percent < 0 or payload.percent > 100:
            raise HTTPException(400, "Percent must be between 0 and 100")
        sm = request.app.state.db
        async with sm() as session:
            s = await _get_pref(session, user["user_id"], "maaser", {})
            s["enabled"] = payload.enabled
            s["percent"] = payload.percent
            if payload.reset_day is not None:
                s["reset_day"] = payload.reset_day
            if payload.included_categories is not None:
                s["included_categories"] = payload.included_categories
            if payload.excluded_categories is not None:
                s["excluded_categories"] = payload.excluded_categories
            await _set_pref(session, user["user_id"], "maaser", s)
            backfill = {"created": 0, "skipped": 0, "total_amount": 0}
            if payload.enabled:
                backfill = await maaser_mod.backfill_for_user(session, user["user_id"])
            await session.commit()
            return {"ok": True, "backfill": backfill}

    @router.post("/maaser/backfill")
    async def backfill(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            return await maaser_mod.backfill_for_user(session, user["user_id"])

    @router.get("/maaser/summary")
    async def summary(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            s = await _get_pref(session, user["user_id"], "maaser", {})
            percent = float(s.get("percent", 10))
            tx_result = await session.execute(
                select(Transaction).where(Transaction.user_id == user["user_id"])
            )
            txs = tx_result.scalars().all()
            total_income = 0.0
            for t in txs:
                if (
                    t.exclude_from_maaser
                    or t.tx_type == "transfer"
                    or getattr(t, "transfer_pair_id", None)
                    or getattr(t, "approval_status", "approved") != "approved"
                ):
                    continue
                amt = float(t.amount or 0)
                cat = (t.category or "").lower()
                if amt > 0 or cat in INCOME_CATEGORIES:
                    total_income += abs(amt)
            obligation = round(total_income * percent / 100, 2)
            # Get ALL ledger entries
            ledger_result = await session.execute(
                select(MaaserLedger).where(
                    MaaserLedger.user_id == user["user_id"],
                )
            )
            ledger = ledger_result.scalars().all()
            
            # Build a set of transaction_ids that have ledger entries
            ledger_tx_ids = {e.transaction_id for e in ledger if e.transaction_id}
            
            # Count tx_given ONLY for tzedakah transactions without ledger entries
            # (to avoid double-counting with manual_given)
            tx_given = 0.0
            for t in txs:
                if (
                    t.exclude_from_maaser
                    or t.tx_type == "transfer"
                    or getattr(t, "transfer_pair_id", None)
                    or getattr(t, "approval_status", "approved") != "approved"
                ):
                    continue
                amt = float(t.amount or 0)
                cat = (t.category or "").lower()
                if amt < 0 and cat in maaser_mod.CHARITY_CATEGORIES and t.transaction_id not in ledger_tx_ids:
                    tx_given += -amt
            
            # Count all maaser_paid, subtracting Give entries to avoid double-counting
            total_give = sum((e.maaser_paid or 0) for e in ledger if not (e.income_amount or 0) and not (e.maaser_due or 0) and e.maaser_paid and e.maaser_paid > 0)
            total_all = sum((e.maaser_paid or 0) for e in ledger if e.maaser_paid and e.maaser_paid > 0)
            manual_given = total_all - total_give
            
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
                "percent": percent, "total_income": round(total_income, 2),
                "obligation": obligation, "given_total": round(given_total, 2),
                "tx_given": round(tx_given, 2), "ledger_given": round(manual_given, 2),
                "accrued_pending": round(accrued_pending, 2), "balance_owed": balance_owed, "credit": credit,
                "enabled": bool(s.get("enabled")),
            }

    @router.get("/maaser/ledger")
    async def ledger(request: Request, user: dict = Depends(get_current_user),
                     status: str = Query(None), limit: int = Query(200, ge=1, le=1000),
                     offset: int = Query(0, ge=0), include_tx: bool = Query(False),
                     date_from: str = Query(None), date_to: str = Query(None)):
        sm = request.app.state.db
        async with sm() as session:
            ledger_ids = set()
            q = select(MaaserLedger).where(MaaserLedger.user_id == user["user_id"])
            if date_from:
                q = q.where(MaaserLedger.date >= date_from)
            if date_to:
                q = q.where(MaaserLedger.date <= date_to + "T23:59:59")
            all_rows = (await session.execute(q.order_by(MaaserLedger.date.desc()))).scalars().all()
            for r in all_rows:
                ledger_ids.add(r.id)
            rows = all_rows[:limit]
            total = sum(r.maaser_paid or r.income_amount or 0 for r in rows)
            total_pending = sum(r.maaser_due or 0 for r in rows if r.maaser_paid == 0)
            entries = []
            for r in rows:
                d = _tz_to_dict(r)
                if include_tx and r.transaction_id:
                    tx_result = await session.execute(
                        select(Transaction).where(Transaction.transaction_id == r.transaction_id)
                    )
                    tx = tx_result.scalar_one_or_none()
                    if tx:
                        d["income_description"] = tx.description
                        d["income_date"] = tx.date.isoformat() if tx.date else None
                        d["income_category"] = tx.category
                    else:
                        d["income_description"] = None
                        d["income_date"] = None
                        d["income_category"] = None
                elif include_tx:
                    d["income_description"] = None
                    d["income_date"] = None
                    d["income_category"] = None
                entries.append(d)

            ledger_tx_ids = {r.transaction_id for r in all_rows if r.transaction_id}
            tx_q = select(Transaction).where(
                Transaction.user_id == user["user_id"],
                Transaction.category.in_(list(maaser_mod.CHARITY_CATEGORIES)),
                Transaction.exclude_from_maaser == False,
                Transaction.tx_type != "transfer",
                Transaction.approval_status == "approved",
                Transaction.transfer_pair_id.is_(None),
            )
            if date_from:
                tx_q = tx_q.where(Transaction.date >= date_from)
            if date_to:
                tx_q = tx_q.where(Transaction.date <= date_to + "T23:59:59")
            tzedakot = (await session.execute(tx_q.order_by(Transaction.date.desc()))).scalars().all()
            for t in tzedakot:
                if t.transaction_id in ledger_tx_ids:
                    continue
                amount = abs(float(t.amount or 0))
                total += amount
                entries.append({
                    "entry_id": f"tx_{t.transaction_id}",
                    "user_id": user["user_id"],
                    "transaction_id": t.transaction_id,
                    "amount": amount,
                    "income_amount": None,
                    "maaser_due": 0,
                    "maaser_paid": amount,
                    "paid_to": t.merchant_name or t.description or "Tzedakah",
                    "note": t.notes or t.description or "",
                    "date": t.date.isoformat() if t.date else None,
                    "created_at": t.date.isoformat() if t.date else None,
                    "status": "given",
                    "income_description": t.description,
                    "income_date": t.date.isoformat() if t.date else None,
                    "income_category": t.category,
                })

            entries.sort(key=lambda e: e.get("date") or "", reverse=True)

            if status == "pending":
                entries = [e for e in entries if e.get("status") == "pending"]
            elif status == "given":
                entries = [e for e in entries if e.get("status") == "given"]

            return {
                "entries": entries[:limit] if limit else entries,
                "total_given": round(total, 2),
                "total_pending": round(total_pending, 2),
            }

    @router.post("/maaser/ledger")
    async def add_ledger_entry(payload: TzedakahEntryIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        import uuid as _uuid
        async with sm() as session:
            tx_id = payload.transaction_id or f"tz_{_uuid.uuid4().hex[:12]}"
            entry_date = _parse_date(payload.date) or datetime.now(timezone.utc)
            desc = f"Tzedakah — {payload.recipient}" + (f" ({payload.note})" if payload.note else "")
            tx = Transaction(
                transaction_id=tx_id,
                user_id=user["user_id"],
                amount=-abs(float(payload.amount)),
                currency="GBP",
                description=desc,
                merchant_name=payload.recipient,
                normalized_merchant=(payload.recipient or "").strip().upper() or None,
                category="tzedakah",
                date=entry_date,
                source="tzedakah",
                notes=payload.note,
            )
            session.add(tx)
            await session.flush()
            entry = MaaserLedger(
                user_id=user["user_id"], maaser_paid=payload.amount, paid_to=payload.recipient,
                note=payload.note, transaction_id=tx_id,
                date=entry_date,
            )
            session.add(entry)
            await session.commit()
            await session.refresh(entry)
            out = _tz_to_dict(entry)
            out["transaction_id"] = tx_id
            return out

    @router.put("/maaser/ledger/{entry_id}")
    async def update_ledger_entry(entry_id: str, payload: TzedakahEntryIn, request: Request,
                                   user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            eid = int(entry_id.replace("tz_", "")) if entry_id.startswith("tz_") else int(entry_id)
            result = await session.execute(
                select(MaaserLedger).where(MaaserLedger.id == eid, MaaserLedger.user_id == user["user_id"])
            )
            entry = result.scalar_one_or_none()
            if not entry:
                raise HTTPException(404, "Entry not found")
            entry.maaser_paid = payload.amount
            entry.paid_to = payload.recipient
            if payload.note is not None:
                entry.note = payload.note
            if payload.transaction_id is not None:
                entry.transaction_id = payload.transaction_id
            await session.commit()
            await session.refresh(entry)
            return _tz_to_dict(entry)

    @router.delete("/maaser/ledger/{entry_id}")
    async def delete_ledger_entry(entry_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            eid = int(entry_id.replace("tz_", "")) if entry_id.startswith("tz_") else int(entry_id)
            result = await session.execute(
                select(MaaserLedger).where(MaaserLedger.id == eid, MaaserLedger.user_id == user["user_id"])
            )
            entry = result.scalar_one_or_none()
            if not entry:
                raise HTTPException(404, "Entry not found")
            if entry.transaction_id:
                tx_result = await session.execute(
                    select(Transaction).where(
                        Transaction.transaction_id == entry.transaction_id,
                        Transaction.user_id == user["user_id"],
                    )
                )
                tx = tx_result.scalar_one_or_none()
                if tx:
                    await session.delete(tx)
            await session.delete(entry)
            await session.commit()
            return {"ok": True}

    @router.post("/maaser/pay/{entry_id}")
    async def pay_pending(entry_id: str, request: Request, user: dict = Depends(get_current_user),
                          recipient: str = Query("Tzedakah")):
        sm = request.app.state.db
        async with sm() as session:
            eid = int(entry_id.replace("tz_", "")) if entry_id.startswith("tz_") else int(entry_id)
            result = await session.execute(
                select(MaaserLedger).where(
                    MaaserLedger.id == eid, MaaserLedger.user_id == user["user_id"],
                    MaaserLedger.maaser_paid < MaaserLedger.maaser_due,
                )
            )
            entry = result.scalar_one_or_none()
            if not entry:
                raise HTTPException(404, "Pending entry not found or already fully paid")
            # Create a Give entry for the remaining unpaid amount so it appears in manual_given
            remaining = entry.maaser_due - (entry.maaser_paid or 0)
            if remaining > 0:
                give_entry = MaaserLedger(
                    user_id=user["user_id"],
                    maaser_paid=remaining,
                    paid_to=recipient,
                    note=f"Maaser payment for income entry #{eid}",
                )
                session.add(give_entry)
            entry.maaser_paid = entry.maaser_due
            entry.paid_to = recipient
            await session.commit()
            return {"ok": True}

    @router.post("/maaser/reset")
    async def reset_accrued(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            await session.execute(
                delete(MaaserLedger).where(
                    MaaserLedger.user_id == user["user_id"], MaaserLedger.transaction_id.isnot(None),
                )
            )
            await session.commit()
            return {"ok": True}

    # ════════════════════════════════════════════════════════════════════
    # TZEDAKAH / CHARITY (any, not just maaser)
    # ════════════════════════════════════════════════════════════════════

    @router.get("/tzedakah")
    async def list_tzedakah(request: Request, user: dict = Depends(get_current_user),
                            recipient: str = Query(None), limit: int = Query(200, ge=1, le=1000),
                            offset: int = Query(0, ge=0)):
        sm = request.app.state.db
        async with sm() as session:
            q = select(MaaserLedger).where(MaaserLedger.user_id == user["user_id"])
            if recipient:
                q = q.where(MaaserLedger.paid_to.ilike(f"%{recipient}%"))
            result = await session.execute(q.order_by(MaaserLedger.date.desc()).offset(offset).limit(limit))
            rows = result.scalars().all()
            total = sum(r.maaser_paid or r.income_amount or 0 for r in rows)
            by_recipient = {}
            for r in rows:
                p = r.paid_to or "Unknown"
                by_recipient.setdefault(p, 0)
                by_recipient[p] += (r.maaser_paid or r.income_amount or 0)
            return {
                "entries": [_tz_to_dict(r) for r in rows],
                "total_given": round(total, 2),
                "by_recipient": {k: round(v, 2) for k, v in sorted(by_recipient.items(), key=lambda x: -x[1])},
            }

    @router.post("/tzedakah")
    async def add_tzedakah(payload: TzedakahEntryIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        import uuid as _uuid
        async with sm() as session:
            tx_id = payload.transaction_id or f"tz_{_uuid.uuid4().hex[:12]}"
            entry_date = _parse_date(payload.date) or datetime.now(timezone.utc)
            amount = abs(float(payload.amount))
            if amount <= 0:
                raise HTTPException(400, "Amount must be positive")

            # Record the giving as a charity transaction (canonical category)
            desc = f"Tzedakah — {payload.recipient}" + (f" ({payload.note})" if payload.note else "")
            cat = "maaser_tzedakah"
            tx = Transaction(
                transaction_id=tx_id,
                user_id=user["user_id"],
                amount=-amount,
                currency="GBP",
                description=desc,
                merchant_name=payload.recipient,
                normalized_merchant=(payload.recipient or "").strip().upper() or None,
                category=cat,
                date=entry_date,
                source="tzedakah",
                notes=payload.note,
            )
            session.add(tx)
            await session.flush()

            # Apply giving against pending entries via shared helper
            result = await maaser_mod._apply_giving_to_pending(
                session, user["user_id"], amount,
                recipient=payload.recipient, note=payload.note, tx_id=tx_id,
            )
            out = _tz_to_dict(
                await session.get(MaaserLedger, int(result["entry_id"].replace("tz_", "")))
            ) if result else {"entry_id": ""}
            out["transaction_id"] = tx_id
            return out

    # ════════════════════════════════════════════════════════════════════
    # YOM TOV / HOLIDAY BUDGETING
    # ════════════════════════════════════════════════════════════════════

    @router.get("/holidays/defaults")
    async def holiday_defaults():
        return {"holidays": [
            {"holiday": k, "categories": v["categories"], "month": v["month"], "uplift_pct": v["uplift_pct"]}
            for k, v in HOLIDAY_DEFAULTS.items()
        ]}

    @router.get("/holiday-budgets")
    async def list_holiday_budgets(request: Request, user: dict = Depends(get_current_user),
                                   holiday: str = Query(None), year: str = Query(None)):
        sm = request.app.state.db
        async with sm() as session:
            q = select(HolidayBudget).where(HolidayBudget.user_id == user["user_id"])
            if holiday:
                q = q.where(HolidayBudget.holiday_name.ilike(holiday))
            if year:
                q = q.where(HolidayBudget.hebrew_year == year)
            result = await session.execute(q.order_by(HolidayBudget.holiday_name, HolidayBudget.category))
            rows = result.scalars().all()
            by_holiday = {}
            for r in rows:
                key = f"{r.holiday_name}-{r.hebrew_year or 'default'}"
                by_holiday.setdefault(key, {"holiday_name": r.holiday_name, "hebrew_year": r.hebrew_year,
                                            "categories": [], "total_budgeted": 0, "total_actual": 0})
                by_holiday[key]["categories"].append(_hb_to_dict(r))
                by_holiday[key]["total_budgeted"] += r.budgeted_amount
                by_holiday[key]["total_actual"] += r.actual_amount
            return {"budgets": list(by_holiday.values()), "raw": [_hb_to_dict(r) for r in rows]}

    @router.get("/holiday-budget")
    async def list_holiday_budget_singular(request: Request, user: dict = Depends(get_current_user),
                                           holiday: str = Query(None), year: str = Query(None)):
        return await list_holiday_budgets(request, user, holiday, year)

    @router.post("/holiday-budgets")
    async def add_holiday_budget(payload: HolidayBudgetIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            hb = HolidayBudget(
                user_id=user["user_id"], holiday_name=payload.holiday_name,
                hebrew_year=payload.hebrew_year, category=payload.category,
                budgeted_amount=payload.budgeted_amount, notes=payload.notes,
                start_date=_parse_date(payload.start_date),
                end_date=_parse_date(payload.end_date),
            )
            session.add(hb)
            await session.commit()
            await session.refresh(hb)
            return _hb_to_dict(hb)

    @router.put("/holiday-budgets/{budget_id}")
    async def update_holiday_budget(budget_id: int, payload: HolidayBudgetUpdateIn,
                                     request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(HolidayBudget).where(HolidayBudget.id == budget_id, HolidayBudget.user_id == user["user_id"])
            )
            hb = result.scalar_one_or_none()
            if not hb:
                raise HTTPException(404, "Budget not found")
            if payload.budgeted_amount is not None:
                hb.budgeted_amount = payload.budgeted_amount
            if payload.actual_amount is not None:
                hb.actual_amount = payload.actual_amount
            if payload.notes is not None:
                hb.notes = payload.notes
            await session.commit()
            await session.refresh(hb)
            return _hb_to_dict(hb)

    @router.delete("/holiday-budgets/{budget_id}")
    async def delete_holiday_budget(budget_id: int, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(HolidayBudget).where(HolidayBudget.id == budget_id, HolidayBudget.user_id == user["user_id"])
            )
            hb = result.scalar_one_or_none()
            if not hb:
                raise HTTPException(404, "Budget not found")
            await session.delete(hb)
            await session.commit()
            return {"ok": True}

    @router.post("/holiday-budgets/init/{holiday_name}")
    async def init_holiday_budget(holiday_name: str, request: Request, user: dict = Depends(get_current_user),
                                  hebrew_year: str = Query(None)):
        sm = request.app.state.db
        async with sm() as session:
            name = holiday_name.strip().title()
            defaults = HOLIDAY_DEFAULTS.get(name)
            if not defaults:
                raise HTTPException(400, f"Unknown holiday '{name}'. See /jewish/holidays/defaults")
            existing = await session.execute(
                select(func.count()).select_from(HolidayBudget).where(
                    HolidayBudget.user_id == user["user_id"], HolidayBudget.holiday_name == name,
                )
            )
            if existing.scalar() > 0:
                raise HTTPException(400, f"Budget already exists for {name}. Add individual categories instead.")
            created = []
            for cat in defaults["categories"]:
                hb = HolidayBudget(
                    user_id=user["user_id"], holiday_name=name, hebrew_year=hebrew_year,
                    category=cat, budgeted_amount=0,
                )
                session.add(hb)
                created.append(cat)
            await session.commit()
            return {"ok": True, "holiday_name": name, "categories_created": created, "count": len(created)}

    @router.get("/holiday-budgets/summary/{holiday_name}")
    async def holiday_summary(holiday_name: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(HolidayBudget).where(
                    HolidayBudget.user_id == user["user_id"],
                    HolidayBudget.holiday_name.ilike(holiday_name),
                )
            )
            rows = result.scalars().all()
            if not rows:
                return {"holiday_name": holiday_name, "total_budgeted": 0, "total_actual": 0, "remaining": 0, "categories": []}
            total_budgeted = sum(r.budgeted_amount for r in rows)
            total_actual = sum(r.actual_amount for r in rows)
            return {
                "holiday_name": holiday_name,
                "total_budgeted": round(total_budgeted, 2),
                "total_actual": round(total_actual, 2),
                "remaining": round(max(0, total_budgeted - total_actual), 2),
                "categories": [_hb_to_dict(r) for r in rows],
            }

    # ════════════════════════════════════════════════════════════════════
    # CHASUNA PLANNING
    # ════════════════════════════════════════════════════════════════════

    @router.get("/chasuna/categories")
    async def chasuna_categories():
        return {"categories": sorted(CHASUNA_CATEGORIES)}

    @router.get("/chasuna")
    async def list_chasuna(request: Request, user: dict = Depends(get_current_user),
                           status: str = Query(None)):
        sm = request.app.state.db
        async with sm() as session:
            q = select(ChasunaPlan).where(ChasunaPlan.user_id == user["user_id"])
            if status:
                q = q.where(ChasunaPlan.status == status)
            result = await session.execute(q.order_by(ChasunaPlan.category))
            rows = result.scalars().all()
            total_estimated = sum(r.estimated_cost for r in rows)
            total_actual = sum(r.actual_cost for r in rows)
            total_deposit = sum(r.deposit_paid for r in rows)
            return {
                "items": [_cp_to_dict(r) for r in rows],
                "total_estimated": round(total_estimated, 2),
                "total_actual": round(total_actual, 2),
                "total_deposit_paid": round(total_deposit, 2),
                "remaining": round(max(0, total_estimated - total_actual - total_deposit), 2),
                "progress_pct": round(min(100, (total_actual + total_deposit) / total_estimated * 100), 1) if total_estimated > 0 else 0,
            }

    @router.post("/chasuna")
    async def add_chasuna_item(payload: ChasunaPlanIn, request: Request, user: dict = Depends(get_current_user)):
        if payload.category not in CHASUNA_CATEGORIES:
            CHASUNA_CATEGORIES.add(payload.category)
        sm = request.app.state.db
        async with sm() as session:
            cp = ChasunaPlan(
                user_id=user["user_id"], category=payload.category,
                description=payload.description, estimated_cost=payload.estimated_cost,
                notes=payload.notes, vendor=payload.vendor,
                due_date=_parse_date(payload.due_date),
            )
            session.add(cp)
            await session.commit()
            await session.refresh(cp)
            return _cp_to_dict(cp)

    @router.put("/chasuna/{item_id}")
    async def update_chasuna_item(item_id: int, payload: ChasunaPlanUpdateIn,
                                   request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(ChasunaPlan).where(ChasunaPlan.id == item_id, ChasunaPlan.user_id == user["user_id"])
            )
            cp = result.scalar_one_or_none()
            if not cp:
                raise HTTPException(404, "Item not found")
            if payload.estimated_cost is not None:
                cp.estimated_cost = payload.estimated_cost
            if payload.actual_cost is not None:
                cp.actual_cost = payload.actual_cost
            if payload.status is not None:
                cp.status = payload.status
            if payload.notes is not None:
                cp.notes = payload.notes
            if payload.vendor is not None:
                cp.vendor = payload.vendor
            if payload.deposit_paid is not None:
                cp.deposit_paid = payload.deposit_paid
            if payload.due_date is not None:
                cp.due_date = _parse_date(payload.due_date)
            await session.commit()
            await session.refresh(cp)
            return _cp_to_dict(cp)

    @router.delete("/chasuna/{item_id}")
    async def delete_chasuna_item(item_id: int, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(ChasunaPlan).where(ChasunaPlan.id == item_id, ChasunaPlan.user_id == user["user_id"])
            )
            cp = result.scalar_one_or_none()
            if not cp:
                raise HTTPException(404, "Item not found")
            await session.delete(cp)
            await session.commit()
            return {"ok": True}

    @router.get("/chasuna/summary")
    async def chasuna_summary(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(ChasunaPlan).where(ChasunaPlan.user_id == user["user_id"])
            )
            rows = result.scalars().all()
            by_status = {"planned": 0.0, "booked": 0.0, "paid": 0.0}
            by_category = {}
            for r in rows:
                bs_key = r.status if r.status in by_status else "planned"
                by_status[bs_key] = by_status[bs_key] + float(r.estimated_cost or 0)
                cat = r.category or "other"
                d = by_category.setdefault(cat, {"estimated": 0, "actual": 0, "deposit": 0, "status": bs_key})
                d["estimated"] += float(r.estimated_cost or 0)
                d["actual"] += float(r.actual_cost or 0)
                d["deposit"] += float(r.deposit_paid or 0)
                d["status"] = bs_key
            return {
                "total_estimated": round(sum(float(r.estimated_cost or 0) for r in rows), 2),
                "total_actual": round(sum(float(r.actual_cost or 0) for r in rows), 2),
                "total_deposit_paid": round(sum(float(r.deposit_paid or 0) for r in rows), 2),
                "by_status": {k: round(v, 2) for k, v in by_status.items()},
                "by_category": {k: {sk: round(float(sv), 2) if sk != "status" else sv for sk, sv in v.items()} for k, v in by_category.items()},
                "item_count": len(rows),
            }

    # ════════════════════════════════════════════════════════════════════
    # ANNUAL MAASER SUMMARY
    # ════════════════════════════════════════════════════════════════════

    @router.get("/maaser/annual-summary")
    async def annual_maaser_summary(request: Request, user: dict = Depends(get_current_user),
                                    year: int = Query(None)):
        sm = request.app.state.db
        async with sm() as session:
            target_year = year or datetime.now(timezone.utc).year
            start = datetime(target_year, 1, 1, tzinfo=timezone.utc)
            end = datetime(target_year + 1, 1, 1, tzinfo=timezone.utc)

            s = await _get_pref(session, user["user_id"], "maaser", {})
            percent = float(s.get("percent", 10))

            tx_result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= start, Transaction.date < end,
                )
            )
            txs = tx_result.scalars().all()
            total_income = 0.0
            tx_given = 0.0
            income_by_month = {}
            for t in txs:
                if (
                    t.exclude_from_maaser
                    or t.tx_type == "transfer"
                    or getattr(t, "transfer_pair_id", None)
                    or getattr(t, "approval_status", "approved") != "approved"
                ):
                    continue
                amt = float(t.amount or 0)
                cat = (t.category or "").lower()
                if amt > 0 or cat in INCOME_CATEGORIES:
                    total_income += abs(amt)
                    month_key = t.date.strftime("%Y-%m") if t.date else "unknown"
                    income_by_month[month_key] = income_by_month.get(month_key, 0) + abs(amt)
                if amt < 0 and cat in maaser_mod.CHARITY_CATEGORIES:
                    tx_given += -amt

            obligation = round(total_income * percent / 100, 2)

            ledger_result = await session.execute(
                select(MaaserLedger).where(
                    MaaserLedger.user_id == user["user_id"],
                    MaaserLedger.date >= start, MaaserLedger.date < end,
                )
            )
            ledger_entries = ledger_result.scalars().all()
            total_give = sum((e.maaser_paid or 0) for e in ledger_entries if not (e.income_amount or 0) and not (e.maaser_due or 0) and e.maaser_paid and e.maaser_paid > 0)
            total_all = sum((e.maaser_paid or 0) for e in ledger_entries if e.maaser_paid and e.maaser_paid > 0)
            manual_given = total_all - total_give
            pending_entries = [e for e in ledger_entries if e.maaser_paid == 0]
            accrued_pending = sum(r.maaser_due or 0 for r in pending_entries)

            given_total = manual_given + tx_given
            balance_owed = round(max(0, obligation - given_total), 2)

            return {
                "year": target_year, "percent": percent,
                "total_income": round(total_income, 2),
                "obligation": obligation,
                "given_total": round(given_total, 2),
                "tx_given": round(tx_given, 2),
                "ledger_given": round(manual_given, 2),
                "accrued_pending": round(accrued_pending, 2),
                "balance_owed": balance_owed,
                "income_by_month": income_by_month,
                "month_count": len(income_by_month),
                "transaction_count": len(txs),
            }

    # ════════════════════════════════════════════════════════════════════
    # HOLIDAY UPLIFT PROJECTION
    # ════════════════════════════════════════════════════════════════════

    @router.get("/holiday-uplift")
    async def holiday_uplift(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"], Transaction.amount < 0,
                ).order_by(Transaction.date.desc()).limit(200)
            )
            txs = result.scalars().all()
            monthly_spend = {}
            for t in txs:
                if t.date:
                    m = t.date.strftime("%Y-%m")
                    monthly_spend[m] = monthly_spend.get(m, 0) + abs(float(t.amount))
            avg_monthly = round(sum(monthly_spend.values()) / max(len(monthly_spend), 1), 2)

            projections = []
            for name, info in HOLIDAY_DEFAULTS.items():
                uplifted = round(avg_monthly * (info["uplift_pct"] / 100), 2)
                total_projected = round(avg_monthly + uplifted, 2)
                projections.append({
                    "holiday": name, "month": info["month"],
                    "uplift_pct": info["uplift_pct"],
                    "base_monthly_spend": avg_monthly,
                    "uplift_amount": uplifted,
                    "projected_total": total_projected,
                    "categories": info["categories"],
                })

            return {
                "average_monthly_spend": avg_monthly,
                "months_analysed": len(monthly_spend),
                "projections": projections,
            }

    # ════════════════════════════════════════════════════════════════════
    # HEALTH CHECK
    # ════════════════════════════════════════════════════════════════════

    @router.get("/health")
    async def jewish_health(request: Request, user: dict = Depends(get_current_user)):
        checks = {"maaser": False, "holiday_budgets": False, "chasuna": False, "tables": False}
        try:
            sm = request.app.state.db
            async with sm() as session:
                tbl = await session.execute(select(func.count()).select_from(MaaserLedger).where(MaaserLedger.user_id == user["user_id"]))
                lc = tbl.scalar() or 0
                hb = await session.execute(select(func.count()).select_from(HolidayBudget).where(HolidayBudget.user_id == user["user_id"]))
                hc = hb.scalar() or 0
                cp = await session.execute(select(func.count()).select_from(ChasunaPlan).where(ChasunaPlan.user_id == user["user_id"]))
                cc = cp.scalar() or 0
                checks = {"maaser": True, "holiday_budgets": True, "chasuna": True, "tables": True}
                return {"status": "ok", "maaser_entries": lc, "holiday_budgets": hc, "chasuna_items": cc, "checks": checks}
        except Exception as e:
            return {"status": "error", "detail": str(e)[:200], "checks": checks}

    return router
