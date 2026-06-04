"""Budget System: master dashboard, day-to-day, AI classification & forecast."""
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from calendar import monthrange

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_

from db import (
    BudgetOccasion, BudgetOccasionCategory, AISuggestion,
    Transaction, get_session_maker,
)
from auth import get_current_user
from llm import call_llm, track_ai_usage, parse_json
from security import sanitize_input

logger = logging.getLogger("budget_system")

FREE_TIER_DAILY_LIMIT = 5

DEFAULT_DAY_TO_DAY_CATEGORIES = [
    "groceries", "household", "fuel", "school", "utilities", "transport",
    "dining", "health", "entertainment", "clothing", "personal", "other",
]


def _current_month_range() -> tuple:
    """Return (start_of_month, end_of_month) for the current month."""
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    _, last_day = monthrange(now.year, now.month)
    end = start.replace(day=last_day, hour=23, minute=59, second=59, microsecond=999999)
    return start, end


def _month_start_end(month_str: str) -> tuple:
    """Parse 'YYYY-MM' into (start_dt, end_dt)."""
    try:
        year, month = map(int, month_str.split("-"))
        start = datetime(year, month, 1, tzinfo=timezone.utc)
        _, last_day = monthrange(year, month)
        end = start.replace(day=last_day, hour=23, minute=59, second=59)
        return start, end
    except Exception:
        return _current_month_range()


async def _enforce_free_limit(session, user: dict):
    """Check daily AI insight limit for free-tier users."""
    if user.get("tier") in ("premium", "enterprise") or user.get("role") == "admin":
        return
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    count_result = await session.execute(
        select(func.count()).select_from(AISuggestion).where(
            AISuggestion.user_id == user["user_id"],
            AISuggestion.created_at >= today_start,
        )
    )
    count = count_result.scalar() or 0
    if count >= FREE_TIER_DAILY_LIMIT:
        raise HTTPException(429, f"Free tier limit ({FREE_TIER_DAILY_LIMIT} AI suggestions/day). Upgrade for unlimited.")


async def _track_usage(session, user_id: str, provider: str, model: str, pt: int, ct: int, cost: float):
    """Track AI usage."""
    from db import AiUsage
    try:
        u = AiUsage(user_id=user_id, provider=provider, prompt_tokens=pt, completion_tokens=ct, cost=cost, endpoint="budget_system")
        session.add(u)
        await session.commit()
    except Exception:
        pass


# ── Pydantic models ──────────────────────────────────────────────────────

class DayToDayBudgetIn(BaseModel):
    category: str
    budgeted_amount: float
    notes: Optional[str] = None


class ClassifyIn(BaseModel):
    description: str
    amount: float


class ApproveIn(BaseModel):
    suggestion_id: Optional[int] = None
    description: str
    amount: float
    budget_type: str
    occasion: str
    category: str
    date: Optional[str] = None


# ── Router factory ───────────────────────────────────────────────────────

def build_router() -> APIRouter:
    router = APIRouter(prefix="/budget-system", tags=["budget-system"])

    # ── OVERVIEW ──────────────────────────────────────────────────────────

    @router.get("/overview")
    async def budget_overview(
        request: Request,
        month: str = Query(None, description="YYYY-MM, defaults to current"),
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            start_dt, end_dt = _month_start_end(month) if month else _current_month_range()

            # 1. Day-to-day occasions + categories
            result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "day_to_day",
                    BudgetOccasion.status == "approved",
                ).order_by(BudgetOccasion.sort_order)
            )
            day_occasions = result.scalars().all()

            day_to_day_cats = []
            total_budgeted = 0
            total_actual = 0
            total_forecast = 0

            for occ in day_occasions:
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == occ.id,
                    )
                )
                cats = cat_result.scalars().all()
                for cat in cats:
                    total_budgeted += cat.budgeted_amount
                    total_actual += cat.actual_amount
                    total_forecast += cat.forecast_amount
                    day_to_day_cats.append({
                        "id": cat.id,
                        "occasion": occ.name,
                        "name": cat.name,
                        "budgeted": round(cat.budgeted_amount, 2),
                        "actual": round(cat.actual_amount, 2),
                        "forecast": round(cat.forecast_amount, 2),
                        "difference": round(cat.budgeted_amount - cat.forecast_amount, 2),
                    })

            # 2. Actual transaction totals for this month
            tx_result = await session.execute(
                select(
                    func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0),
                    func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount < 0), 0),
                ).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= start_dt,
                    Transaction.date <= end_dt,
                )
            )
            income_total, expense_total = tx_result.one()
            expense_total = abs(expense_total)

            # 3. Other budget types aggregated
            other_result = await session.execute(
                select(
                    func.coalesce(func.sum(BudgetOccasion.estimated_amount), 0),
                ).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type.in_(["yom_tov", "holiday", "simcha", "other"]),
                    BudgetOccasion.status == "approved",
                )
            )
            other_budgeted = other_result.scalar() or 0

            # 4. Income for projected balance
            all_income_result = await session.execute(
                select(func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0))
                .where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= start_dt,
                    Transaction.date <= end_dt,
                )
            )
            month_income = all_income_result.scalar() or 0

            total_budget = total_budgeted + other_budgeted
            remaining_budget = total_budget - expense_total
            projected_balance = month_income - total_forecast

            return {
                "month": start_dt.strftime("%Y-%m"),
                "summary": {
                    "total_budgeted": round(total_budget, 2),
                    "total_actual_spend": round(expense_total, 2),
                    "total_forecast": round(total_forecast + other_budgeted, 2),
                    "remaining_budget": round(remaining_budget, 2),
                    "projected_month_end": round(projected_balance, 2),
                },
                "day_to_day": {
                    "categories": day_to_day_cats,
                    "totals": {
                        "budgeted": round(total_budgeted, 2),
                        "actual": round(total_actual, 2),
                        "forecast": round(total_forecast, 2),
                    },
                },
                "ai_forecast": None,
            }

    # ── DAY-TO-DAY ───────────────────────────────────────────────────────

    @router.get("/day-to-day")
    async def list_day_to_day(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "day_to_day",
                    BudgetOccasion.status == "approved",
                ).order_by(BudgetOccasion.sort_order)
            )
            occasions = result.scalars().all()
            out = []
            for occ in occasions:
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == occ.id
                    ).order_by(BudgetOccasionCategory.name)
                )
                cats = cat_result.scalars().all()
                out.append({
                    "id": occ.id,
                    "name": occ.name,
                    "categories": [{
                        "id": c.id,
                        "name": c.name,
                        "budgeted": round(c.budgeted_amount, 2),
                        "actual": round(c.actual_amount, 2),
                        "forecast": round(c.forecast_amount, 2),
                        "difference": round(c.budgeted_amount - c.forecast_amount, 2),
                        "notes": c.notes,
                    } for c in cats],
                })
            return {"occasions": out}

    @router.post("/day-to-day")
    async def create_day_to_day(
        payload: DayToDayBudgetIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            cat_name = payload.category.lower().strip()
            # Find or create the "Monthly Living" occasion
            result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "day_to_day",
                    BudgetOccasion.name == "Monthly Living",
                )
            )
            occasion = result.scalar_one_or_none()
            if not occasion:
                occasion = BudgetOccasion(
                    user_id=user["user_id"],
                    budget_type="day_to_day",
                    name="Monthly Living",
                    status="approved",
                )
                session.add(occasion)
                await session.flush()

            # Upsert category
            cat_result = await session.execute(
                select(BudgetOccasionCategory).where(
                    BudgetOccasionCategory.occasion_id == occasion.id,
                    BudgetOccasionCategory.name == cat_name,
                )
            )
            existing = cat_result.scalar_one_or_none()
            if existing:
                existing.budgeted_amount = payload.budgeted_amount
                existing.notes = payload.notes
            else:
                existing = BudgetOccasionCategory(
                    occasion_id=occasion.id,
                    name=cat_name,
                    budgeted_amount=payload.budgeted_amount,
                    notes=payload.notes,
                )
                session.add(existing)

            await session.commit()
            await session.refresh(existing)
            return {
                "id": existing.id,
                "name": existing.name,
                "budgeted": round(existing.budgeted_amount, 2),
                "actual": round(existing.actual_amount, 2),
                "forecast": round(existing.forecast_amount, 2),
            }

    @router.delete("/day-to-day/{cat_id}")
    async def delete_day_to_day(cat_id: int, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BudgetOccasionCategory).where(
                    BudgetOccasionCategory.id == cat_id,
                )
            )
            cat = result.scalar_one_or_none()
            if not cat:
                raise HTTPException(404, "Category not found")
            # Verify ownership via the occasion
            occ_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.id == cat.occasion_id,
                    BudgetOccasion.user_id == user["user_id"],
                )
            )
            occ = occ_result.scalar_one_or_none()
            if not occ:
                raise HTTPException(404, "Category not found")
            await session.delete(cat)
            await session.commit()
            return {"ok": True}

    # ── AI PREDICTION ─────────────────────────────────────────────────────

    @router.get("/day-to-day/prediction")
    async def day_to_day_prediction(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            await _enforce_free_limit(session, user)

            # Get recent 3 months of transactions
            end_dt = datetime.now(timezone.utc)
            start_dt = end_dt - timedelta(days=90)

            tx_result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= start_dt,
                    Transaction.date <= end_dt,
                    Transaction.amount < 0,
                ).order_by(Transaction.date.desc()).limit(200)
            )
            txs = tx_result.scalars().all()

            if not txs:
                return {"predictions": [], "message": "Not enough transaction data to predict."}

            # Build a summary for AI
            from collections import Counter
            cat_totals = Counter()
            for t in txs:
                cat_totals[t.category or "uncategorized"] += abs(t.amount)

            top_cats = cat_totals.most_common(10)
            tx_summary = "\n".join(f"- {cat}: £{amt:.0f} over 3mo" for cat, amt in top_cats)

            system_prompt = "You are a financial forecasting assistant. Output valid JSON only."
            user_prompt = (
                f"Based on the user's spending over the last 3 months, predict next month's spending per category.\n\n"
                f"Transactions summary:\n{tx_summary}\n\n"
                f"Output JSON format:\n"
                f'{{"predictions": [{{"category": "groceries", "predicted_monthly": 450.0, "confidence": 0.85, "rationale": "..."}}]}}'
            )

            try:
                raw, provider, model, pt, ct, cost = await call_llm(
                    system_prompt, user_prompt,
                    json_mode=True, temperature=0.1, max_tokens=1024,
                )
                await _track_usage(session, user["user_id"], provider, model, pt, ct, cost)
                data = parse_json(raw)
                predictions = data.get("predictions", [])
            except Exception as e:
                logger.warning("AI prediction failed: %s", e)
                predictions = []

            return {"predictions": predictions}

    # ── CLASSIFY ──────────────────────────────────────────────────────────

    @router.post("/classify")
    async def classify_transaction(
        payload: ClassifyIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            await _enforce_free_limit(session, user)

            clean_desc = sanitize_input(payload.description.strip(), max_len=200)

            system_prompt = (
                "You classify UK personal finance transactions. "
                "Output valid JSON only. No markdown, no explanations."
            )
            user_prompt = (
                f"Classify this transaction:\nDescription: {clean_desc}\nAmount: £{payload.amount}\n\n"
                f"Respond with JSON:\n"
                f'{{"budget_type": "day_to_day|yom_tov|holiday|simcha|other", '
                f'"occasion": "e.g. Monthly Living | Pesach 2026 | Summer Trip | Chaim Wedding", '
                f'"category": "e.g. groceries, dining, flights, hall, etc.", '
                f'"merchant": "e.g. Tesco", '
                f'"recurring": true|false, '
                f'"confidence": 0.95}}'
            )

            try:
                raw, provider, model, pt, ct, cost = await call_llm(
                    system_prompt, user_prompt,
                    json_mode=True, temperature=0.1, max_tokens=512,
                )
                await _track_usage(session, user["user_id"], provider, model, pt, ct, cost)
                result = parse_json(raw)
                confidence = result.get("confidence", 0)
            except Exception as e:
                logger.warning("AI classification failed: %s", e)
                result = {
                    "budget_type": "day_to_day",
                    "occasion": "Monthly Living",
                    "category": "uncategorized",
                    "merchant": None,
                    "recurring": False,
                }
                confidence = 0

            # Save as pending AI suggestion
            suggestion = AISuggestion(
                user_id=user["user_id"],
                suggestion_type="classification",
                data={
                    "description": clean_desc,
                    "amount": payload.amount,
                    "budget_type": result.get("budget_type", "day_to_day"),
                    "occasion": result.get("occasion", "Monthly Living"),
                    "category": result.get("category", "uncategorized"),
                    "merchant": result.get("merchant"),
                    "recurring": result.get("recurring", False),
                    "confidence": confidence,
                },
                status="pending",
            )
            session.add(suggestion)
            await session.commit()
            await session.refresh(suggestion)

            return {
                "suggestion_id": suggestion.id,
                "budget_type": result.get("budget_type", "day_to_day"),
                "occasion": result.get("occasion", "Monthly Living"),
                "category": result.get("category", "uncategorized"),
                "merchant": result.get("merchant"),
                "recurring": result.get("recurring", False),
                "confidence": round(confidence, 2),
            }

    # ── APPROVE ───────────────────────────────────────────────────────────

    @router.post("/approve")
    async def approve_suggestion(
        payload: ApproveIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            # Create the transaction via existing endpoint logic
            from finance_engine import _tx_to_dict
            tx = Transaction(
                transaction_id=f"tx_{uuid.uuid4().hex[:12]}",
                user_id=user["user_id"],
                amount=-abs(payload.amount) if payload.amount > 0 else payload.amount,
                description=payload.description.strip(),
                category=payload.category.lower().strip(),
                merchant_name=payload.occasion,
                date=datetime.fromisoformat(payload.date) if payload.date else datetime.now(timezone.utc),
                source="manual",
                tx_type="expense",
            )
            session.add(tx)
            await session.commit()
            await session.refresh(tx)

            # Mark suggestion as approved if provided
            if payload.suggestion_id:
                s_result = await session.execute(
                    select(AISuggestion).where(
                        AISuggestion.id == payload.suggestion_id,
                        AISuggestion.user_id == user["user_id"],
                    )
                )
                sug = s_result.scalar_one_or_none()
                if sug:
                    sug.status = "approved"
                    sug.applied_at = datetime.now(timezone.utc)
                    await session.commit()

            return _tx_to_dict(tx)

    # ── UPCOMING EXPENSES ─────────────────────────────────────────────────

    @router.get("/upcoming")
    async def upcoming_expenses(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            # Find recurring transactions and upcoming occasions
            start_dt = datetime.now(timezone.utc)
            end_dt = start_dt + timedelta(days=90)

            # Get upcoming budget occasions
            occ_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.status == "approved",
                    BudgetOccasion.event_date >= start_dt,
                    BudgetOccasion.event_date <= end_dt,
                ).order_by(BudgetOccasion.event_date)
            )
            upcoming = []
            for occ in occ_result.scalars().all():
                upcoming.append({
                    "type": occ.budget_type,
                    "name": occ.name,
                    "date": occ.event_date.isoformat() if occ.event_date else None,
                    "estimated_amount": round(occ.estimated_amount, 2),
                })

            # Also check recurring transactions
            from db import RecurringTransaction
            rec_result = await session.execute(
                select(RecurringTransaction).where(
                    RecurringTransaction.user_id == user["user_id"],
                    RecurringTransaction.active == True,
                )
            )
            for rec in rec_result.scalars().all():
                upcoming.append({
                    "type": "recurring",
                    "name": rec.description,
                    "date": rec.next_date.isoformat() if rec.next_date else None,
                    "estimated_amount": round(abs(rec.amount), 2),
                    "frequency": rec.frequency,
                })

            upcoming.sort(key=lambda x: x.get("date") or "")
            return {"upcoming": upcoming}

    # ── HEALTH SCORE ──────────────────────────────────────────────────────

    @router.get("/health-score")
    async def budget_health_score(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            start_dt, end_dt = _current_month_range()

            # Calculate score based on:
            # 1. Staying within budget (40 points)
            # 2. Savings rate (30 points)
            # 3. Cash flow stability (30 points)

            # 1. Budget adherence
            occ_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.status == "approved",
                )
            )
            occasions = occ_result.scalars().all()
            total_budgeted = 0
            total_actual = 0
            for occ in occasions:
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == occ.id,
                    )
                )
                for cat in cat_result.scalars().all():
                    total_budgeted += cat.budgeted_amount
                    total_actual += cat.actual_amount

            if total_budgeted > 0:
                adherence_pct = min(100, (total_actual / total_budgeted) * 100)
                adherence_score = max(0, 40 - (adherence_pct - 80) * 0.5) if adherence_pct > 80 else 40
            else:
                adherence_score = 0

            # 2. Savings rate
            tx_result = await session.execute(
                select(
                    func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0),
                    func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount < 0), 0),
                ).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= start_dt,
                    Transaction.date <= end_dt,
                )
            )
            income, expenses = tx_result.one()
            expenses = abs(expenses)
            if income > 0:
                savings_rate = (income - expenses) / income * 100
                savings_score = min(30, max(0, savings_rate * 2))
            else:
                savings_score = 0

            # 3. Cash flow stability (have they been negative?)
            if income > 0 and expenses > 0:
                stability_score = 20 if (income > expenses) else 10
                # Check if they have upcoming budget (adds 10)
                budget_count = sum(1 for _ in occasions)
                stability_score += 10 if budget_count > 0 else 0
            else:
                stability_score = 0

            total_score = min(100, round(adherence_score + savings_score + stability_score))
            return {
                "score": total_score,
                "breakdown": {
                    "budget_adherence": round(adherence_score, 1),
                    "savings_rate": round(savings_score, 1),
                    "cash_flow_stability": round(stability_score, 1),
                },
                "max_score": 100,
            }

    return router
