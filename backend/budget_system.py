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
    Transaction, HolidayBudget, RecurringTransaction, CategoryRule,
    get_session_maker,
)
from auth import get_current_user
from llm import call_llm, track_ai_usage, parse_json
from security import sanitize_input
from statements import CATEGORY_HIERARCHY, SECTION_FOR_CATEGORY

# Build a flat list of all valid category names for the LLM prompt
_ALL_CATEGORY_SECTIONS_STR = "\n".join(
    f"{section}: {', '.join(name for name, _ in items)}"
    for section, items in CATEGORY_HIERARCHY.items()
)

logger = logging.getLogger("budget_system")

FREE_TIER_DAILY_LIMIT = 5

DEFAULT_DAY_TO_DAY_CATEGORIES = [
    "fruit_veg", "grocery", "bakery", "fish", "meat", "paper_goods",
    "takeaway", "wine", "house_supplies", "chemist",
    "rent_mortgage", "electricity", "heating", "gas", "water", "council_tax",
    "telephone", "mobile", "cleaning_help",
    "public_transport", "car_lease", "petrol_diesel", "dart_charge", "tolls", "tickets",
    "taxi", "loan_payoff", "interest", "investments",
    "school_fees", "bus_fee", "babysitting", "nappies", "toys", "tutor", "therapy", "medical",
    "maaser_tzedakah", "charity", "other_charity",
    "clothing_husband", "clothing_wife", "clothing_kids", "shoes",
    "life_insurance", "buildings_insurance",
    "petty_cash", "miscellaneous", "mikva", "taxes", "upcoming_savings",
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




# ── Default budget seeding ───────────────────────────────────────────────

# Smart default budgets for new users (UK-based amounts, monthly)
DEFAULT_MONTHLY_BUDGETS = {
    "grocery": 250,
    "fruit_veg": 80,
    "bakery": 30,
    "fish": 30,
    "meat": 80,
    "paper_goods": 20,
    "takeaway": 80,
    "wine": 20,
    "house_supplies": 50,
    "chemist": 30,
    "rent_mortgage": 1450,
    "electricity": 60,
    "heating": 40,
    "gas": 40,
    "water": 30,
    "council_tax": 150,
    "telephone": 15,
    "mobile": 30,
    "cleaning_help": 80,
    "public_transport": 60,
    "car_lease": 300,
    "petrol_diesel": 80,
    "dart_charge": 50,
    "school_fees": 400,
    "bus_fee": 50,
    "babysitting": 100,
    "nappies": 40,
    "toys": 30,
    "tutor": 100,
    "therapy": 80,
    "medical": 50,
    "maaser_tzedakah": 500,
    "charity": 50,
    "other_charity": 30,
    "clothing_husband": 50,
    "clothing_wife": 50,
    "clothing_kids": 40,
    "shoes": 30,
    "life_insurance": 50,
    "buildings_insurance": 30,
    "trust_savings": 100,
    "tolls": 20,
    "tickets": 20,
    "petty_cash": 50,
    "taxi": 30,
    "miscellaneous": 100,
    "mikva": 20,
    "taxes": 200,
    "upcoming_savings": 200,
    "investments": 200,
    "loan_payoff": 200,
    "interest": 20,
}


async def seed_default_budget_entries(session, user_id: str):
    """Seed DEFAULT_MONTHLY_BUDGETS into the Budget table (idempotent)."""
    from db import Budget
    result = await session.execute(
        select(Budget).where(Budget.user_id == user_id)
    )
    existing = {b.category for b in result.scalars().all()}
    created = 0
    for category, amount in DEFAULT_MONTHLY_BUDGETS.items():
        if category in existing:
            continue
        b = Budget(
            budget_id=str(uuid.uuid4()),
            user_id=user_id,
            category=category,
            amount=amount,
            period="monthly",
            budget_type="everyday",
        )
        session.add(b)
        created += 1
    if created:
        try:
            await session.commit()
        except Exception:
            await session.rollback()
            return 0
    return created


async def seed_default_budgets_for_user(session, user_id: str):
    """
    Seed default monthly budget with smart category limits for a new user.
    Called on user registration to provide immediate budget structure.
    """
    try:
        # Create "Monthly Living" budget occasion
        occasion = BudgetOccasion(
            user_id=user_id,
            budget_type="day_to_day",
            name="Monthly Living",
            status="approved",
            estimated_amount=sum(DEFAULT_MONTHLY_BUDGETS.values()),
            sort_order=0,
        )
        session.add(occasion)
        await session.flush()  # Get the occasion ID
        
        # Add default category budgets
        for category, amount in DEFAULT_MONTHLY_BUDGETS.items():
            cat = BudgetOccasionCategory(
                occasion_id=occasion.id,
                name=category,
                budgeted_amount=amount,
                actual_amount=0,
                forecast_amount=0,
            )
            session.add(cat)
        
        await session.commit()
        logger.info("Seeded default budgets for user %s", user_id[:16])
        return True
    except Exception as e:
        logger.warning("Failed to seed default budgets for user %s: %s", user_id[:16], str(e))
        await session.rollback()
        return False


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
    suggestion_index: Optional[int] = None  # which suggestion from the array was chosen (0-3)
    description: str
    amount: float
    budget_type: str
    occasion: str
    category: str
    merchant: Optional[str] = None
    date: Optional[str] = None
    save_as_recurring: Optional[bool] = False


class YomTovAutoCreateIn(BaseModel):
    holiday_names: list[str]


class YomTovEstimateIn(BaseModel):
    holiday_name: str


class HolidayEstimateIn(BaseModel):
    name: str
    destination: Optional[str] = None
    start_date: str
    end_date: str


class SimchaCategoryIn(BaseModel):
    name: str
    budgeted_amount: float = 0


class SimchaIn(BaseModel):
    name: str
    event_date: Optional[str] = None
    estimated_amount: Optional[float] = 0
    categories: list[SimchaCategoryIn] = []


class OtherCategoryIn(BaseModel):
    name: str
    budgeted_amount: float = 0


class OtherIn(BaseModel):
    name: str
    event_date: Optional[str] = None
    estimated_amount: Optional[float] = 0
    notes: Optional[str] = None
    categories: list[OtherCategoryIn] = []


class MonthlyReviewIn(BaseModel):
    year: int
    month: int


class DayToDayInitIn(BaseModel):
    amounts: Optional[dict[str, float]] = None


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

            # 3. Yom Tov — from holiday_budgets where start/end overlaps the month
            yom_tov_result = await session.execute(
                select(HolidayBudget).where(
                    HolidayBudget.user_id == user["user_id"],
                    HolidayBudget.start_date <= end_dt,
                    HolidayBudget.end_date >= start_dt,
                ).order_by(HolidayBudget.holiday_name)
            )
            holiday_budgets = yom_tov_result.scalars().all()
            yom_tov_by_holiday = {}
            yom_tov_total_budgeted = 0
            yom_tov_total_actual = 0
            for hb in holiday_budgets:
                if hb.holiday_name not in yom_tov_by_holiday:
                    yom_tov_by_holiday[hb.holiday_name] = {
                        "name": hb.holiday_name,
                        "categories": [],
                        "total_budgeted": 0,
                        "total_actual": 0,
                    }
                yom_tov_by_holiday[hb.holiday_name]["categories"].append({
                    "name": hb.category,
                    "budgeted": round(hb.budgeted_amount, 2),
                    "actual": round(hb.actual_amount, 2),
                })
                yom_tov_by_holiday[hb.holiday_name]["total_budgeted"] += hb.budgeted_amount
                yom_tov_by_holiday[hb.holiday_name]["total_actual"] += hb.actual_amount
                yom_tov_total_budgeted += hb.budgeted_amount
                yom_tov_total_actual += hb.actual_amount

            # 4. Holiday occasions (budget_type=holiday) in this month
            holiday_occ_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "holiday",
                    BudgetOccasion.status == "approved",
                    BudgetOccasion.event_date >= start_dt,
                    BudgetOccasion.event_date <= end_dt,
                ).order_by(BudgetOccasion.event_date)
            )
            holiday_occasions = holiday_occ_result.scalars().all()
            holiday_occ_list = []
            holiday_total_budgeted = 0
            holiday_total_actual = 0
            for ho in holiday_occasions:
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == ho.id,
                    )
                )
                cats = cat_result.scalars().all()
                holiday_occ_list.append({
                    "id": ho.id,
                    "name": ho.name,
                    "date": ho.event_date.isoformat() if ho.event_date else None,
                    "estimated_amount": round(ho.estimated_amount, 2),
                    "categories": [{
                        "name": c.name,
                        "budgeted": round(c.budgeted_amount, 2),
                        "actual": round(c.actual_amount, 2),
                    } for c in cats],
                })
                holiday_total_budgeted += ho.estimated_amount
                holiday_total_actual += sum(c.actual_amount for c in cats)

            # 5. Simcha occasions
            simcha_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "simcha",
                    BudgetOccasion.status == "approved",
                    BudgetOccasion.event_date >= start_dt,
                    BudgetOccasion.event_date <= end_dt,
                ).order_by(BudgetOccasion.event_date)
            )
            simcha_occasions = simcha_result.scalars().all()
            simcha_occ_list = []
            simcha_total_budgeted = 0
            simcha_total_actual = 0
            for so in simcha_occasions:
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == so.id,
                    )
                )
                cats = cat_result.scalars().all()
                simcha_occ_list.append({
                    "id": so.id,
                    "name": so.name,
                    "date": so.event_date.isoformat() if so.event_date else None,
                    "estimated_amount": round(so.estimated_amount, 2),
                    "categories": [{
                        "name": c.name,
                        "budgeted": round(c.budgeted_amount, 2),
                        "actual": round(c.actual_amount, 2),
                    } for c in cats],
                })
                simcha_total_budgeted += so.estimated_amount
                simcha_total_actual += sum(c.actual_amount for c in cats)

            # 6. Other occasions
            other_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "other",
                    BudgetOccasion.status == "approved",
                    BudgetOccasion.event_date >= start_dt,
                    BudgetOccasion.event_date <= end_dt,
                ).order_by(BudgetOccasion.event_date)
            )
            other_occasions = other_result.scalars().all()
            other_occ_list = []
            other_total_budgeted = 0
            other_total_actual = 0
            for oo in other_occasions:
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == oo.id,
                    )
                )
                cats = cat_result.scalars().all()
                other_occ_list.append({
                    "id": oo.id,
                    "name": oo.name,
                    "date": oo.event_date.isoformat() if oo.event_date else None,
                    "estimated_amount": round(oo.estimated_amount, 2),
                    "notes": oo.notes,
                    "categories": [{
                        "name": c.name,
                        "budgeted": round(c.budgeted_amount, 2),
                        "actual": round(c.actual_amount, 2),
                    } for c in cats],
                })
                other_total_budgeted += oo.estimated_amount
                other_total_actual += sum(c.actual_amount for c in cats)

            # 7. Income for projected balance
            all_income_result = await session.execute(
                select(func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0))
                .where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= start_dt,
                    Transaction.date <= end_dt,
                )
            )
            month_income = all_income_result.scalar() or 0

            all_budgeted = total_budgeted + yom_tov_total_budgeted + holiday_total_budgeted + simcha_total_budgeted + other_total_budgeted
            all_forecast = total_forecast + yom_tov_total_budgeted + holiday_total_budgeted + simcha_total_budgeted + other_total_budgeted
            remaining_budget = all_budgeted - expense_total
            projected_balance = month_income - (expense_total + yom_tov_total_actual + holiday_total_actual + simcha_total_actual + other_total_actual)

            return {
                "month": start_dt.strftime("%Y-%m"),
                "summary": {
                    "total_budgeted": round(all_budgeted, 2),
                    "total_actual_spend": round(expense_total, 2),
                    "total_forecast": round(all_forecast, 2),
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
                "yom_tov": {
                    "occasions": list(yom_tov_by_holiday.values()),
                    "total_budgeted": round(yom_tov_total_budgeted, 2),
                    "total_actual": round(yom_tov_total_actual, 2),
                },
                "holidays": {
                    "occasions": holiday_occ_list,
                    "total_budgeted": round(holiday_total_budgeted, 2),
                    "total_actual": round(holiday_total_actual, 2),
                },
                "simcha": {
                    "occasions": simcha_occ_list,
                    "total_budgeted": round(simcha_total_budgeted, 2),
                    "total_actual": round(simcha_total_actual, 2),
                },
                "other": {
                    "occasions": other_occ_list,
                    "total_budgeted": round(other_total_budgeted, 2),
                    "total_actual": round(other_total_actual, 2),
                },
                "ai_forecast": None,
            }

    # ── THIS MONTH (unified summary for the new budget page) ────────────

    @router.get("/this-month")
    async def this_month(
        request: Request,
        month: str = Query(None, description="YYYY-MM, defaults to current"),
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            start_dt, end_dt = _month_start_end(month) if month else _current_month_range()
            days_in_month = (end_dt - start_dt).days + 1
            day_of_month = (datetime.now(timezone.utc).day)
            fraction_elapsed = min(day_of_month / days_in_month, 1.0)

            # 1. Transaction totals
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

            # 2. Day-to-day budget categories
            d2d_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "day_to_day",
                    BudgetOccasion.status == "approved",
                ).order_by(BudgetOccasion.sort_order)
            )
            day_categories = []
            total_budgeted = 0
            total_actual = 0
            for occ in d2d_result.scalars().all():
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(BudgetOccasionCategory.occasion_id == occ.id)
                )
                for cat in cat_result.scalars().all():
                    total_budgeted += cat.budgeted_amount
                    total_actual += cat.actual_amount
                    day_categories.append({
                        "id": cat.id,
                        "name": cat.name,
                        "budgeted": round(cat.budgeted_amount, 2),
                        "actual": round(cat.actual_amount, 2),
                        "forecast": round(cat.forecast_amount, 2),
                        "remaining": round(cat.budgeted_amount - cat.actual_amount, 2),
                        "overspent": cat.actual_amount > cat.budgeted_amount,
                    })

            # 3. Active planned events this month
            event_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type.in_(["yom_tov", "holiday", "simcha", "other"]),
                    BudgetOccasion.status == "approved",
                    BudgetOccasion.event_date >= start_dt,
                    BudgetOccasion.event_date <= end_dt,
                ).order_by(BudgetOccasion.event_date)
            )
            events = []
            total_event_budgeted = 0
            total_event_actual = 0
            for ev in event_result.scalars().all():
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(BudgetOccasionCategory.occasion_id == ev.id)
                )
                cats = cat_result.scalars().all()
                events.append({
                    "id": ev.id,
                    "name": ev.name,
                    "type": ev.budget_type,
                    "date": ev.event_date.isoformat() if ev.event_date else None,
                    "estimated_amount": round(ev.estimated_amount, 2),
                    "notes": ev.notes,
                    "categories": [{
                        "name": c.name,
                        "budgeted": round(c.budgeted_amount, 2),
                        "actual": round(c.actual_amount, 2),
                    } for c in cats],
                })
                total_event_budgeted += ev.estimated_amount
                total_event_actual += sum(c.actual_amount for c in cats)

            # 4. Upcoming events in next 60 days
            upcoming_end = end_dt + timedelta(days=60)
            upcoming_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.status == "approved",
                    BudgetOccasion.event_date > end_dt,
                    BudgetOccasion.event_date <= upcoming_end,
                ).order_by(BudgetOccasion.event_date)
            )
            upcoming_events = []
            for ev in upcoming_result.scalars().all():
                upcoming_events.append({
                    "id": ev.id,
                    "name": ev.name,
                    "type": ev.budget_type,
                    "date": ev.event_date.isoformat() if ev.event_date else None,
                    "estimated_amount": round(ev.estimated_amount, 2),
                    "days_away": (ev.event_date - end_dt).days if ev.event_date else None,
                })

            # 5. Alerts
            alerts = []
            for cat in day_categories:
                if cat["overspent"]:
                    alerts.append({
                        "type": "overspend",
                        "severity": "warning",
                        "message": f"{cat['name']} overspent by £{abs(cat['remaining']):.0f}",
                        "category": cat["name"],
                    })
                elif cat["actual"] > cat["budgeted"] * 0.85:
                    alerts.append({
                        "type": "near_limit",
                        "severity": "info",
                        "message": f"{cat['name']} at {cat['actual']}/{cat['budgeted']}",
                        "category": cat["name"],
                    })

            # 6. Income-based projection
            predicted_eom_expense = expense_total / fraction_elapsed if fraction_elapsed > 0 else expense_total
            projected_balance = income_total - predicted_eom_expense

            return {
                "month": start_dt.strftime("%Y-%m"),
                "summary": {
                    "budgeted": round(total_budgeted + total_event_budgeted, 2),
                    "spent": round(expense_total + total_event_actual, 2),
                    "remaining": round((total_budgeted + total_event_budgeted) - (expense_total + total_event_actual), 2),
                    "income": round(income_total, 2),
                    "predicted_eom": round(projected_balance, 2),
                    "budget_adherence": round(max(0, 1 - (expense_total / total_budgeted)) * 100, 1) if total_budgeted > 0 else 100,
                },
                "everyday_spending": {
                    "categories": day_categories,
                    "totals": {
                        "budgeted": round(total_budgeted, 2),
                        "actual": round(total_actual, 2),
                        "remaining": round(total_budgeted - total_actual, 2),
                    },
                },
                "events": {
                    "this_month": events,
                    "upcoming": upcoming_events,
                    "totals": {
                        "budgeted": round(total_event_budgeted, 2),
                        "actual": round(total_event_actual, 2),
                    },
                },
                "alerts": alerts,
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
    # Returns 4 ranked suggestions. Historical rules take priority before LLM.

    async def _lookup_historical_suggestions(session, user_id: str, description: str) -> list[dict]:
        """Check CategoryRule for known merchant→category mappings.
        Returns up to 3 suggestions sorted by match_count desc."""
        text = (description or "").lower().strip()
        words = text.split()
        merchant = None
        # Heuristic: first proper-looking word is likely the merchant
        if words:
            potential = words[0].rstrip(".,!?")
            if len(potential) > 1:
                merchant = potential
        if not merchant:
            return []

        rules_result = await session.execute(
            select(CategoryRule).where(
                CategoryRule.user_id == user_id,
                CategoryRule.merchant.ilike(f"%{merchant}%"),
            ).order_by(CategoryRule.match_count.desc())
        )
        rules = rules_result.scalars().all()
        if not rules:
            return []

        suggestions = []
        seen_cats = set()
        for rule in rules:
            if rule.category in seen_cats:
                continue
            seen_cats.add(rule.category)
            confidence = min(0.95, 0.5 + rule.match_count * 0.05)
            suggestions.append({
                "budget_type": "day_to_day",
                "occasion": "Monthly Living",
                "category": rule.category,
                "merchant": merchant,
                "recurring": False,
                "confidence": round(confidence, 2),
                "source": "historical",
            })
            if len(suggestions) >= 3:
                break
        return suggestions

    async def _classify_with_llm(session, user_id: str, description: str, amount: float) -> dict:
        """Call LLM to get 4 ranked category suggestions."""
        system_prompt = (
            "You classify UK personal finance transactions. "
            "Output valid JSON only. No markdown, no explanations."
        )
        user_prompt = (
            f"Classify this transaction and return the top 4 category suggestions ranked by confidence:\n"
            f"Description: {description}\nAmount: £{amount}\n\n"
            f"Available categories (section: category_names):\n{_ALL_CATEGORY_SECTIONS_STR}\n\n"
            f"Respond with JSON array of 4 objects, each:\n"
            f'{{"budget_type": "day_to_day|yom_tov|holiday|simcha|other", '
            f'"occasion": "e.g. Monthly Living | Pesach 2026 | Summer Trip | Chaim Wedding", '
            f'"category": "one category name from the list above", '
            f'"merchant": "e.g. Tesco", '
            f'"recurring": true|false, '
            f'"confidence": 0.0-1.0}}\n'
            f'Return as JSON: {{"suggestions": [...]}}'
        )
        raw, provider, model, pt, ct, cost = await call_llm(
            system_prompt, user_prompt,
            json_mode=True, temperature=0.1, max_tokens=1024,
        )
        await _track_usage(session, user_id, provider, model, pt, ct, cost)
        return parse_json(raw)

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

            # Step 1: Historical lookup — check CategoryRules first
            historical = await _lookup_historical_suggestions(session, user["user_id"], clean_desc)

            # Step 2: LLM classification — get 4 AI suggestions
            llm_suggestions = []
            try:
                llm_result = await _classify_with_llm(session, user["user_id"], clean_desc, payload.amount)
                raw_suggestions = llm_result.get("suggestions", []) if isinstance(llm_result, dict) else (llm_result if isinstance(llm_result, list) else [])
                for s in raw_suggestions[:4]:
                    s["source"] = "ai"
                    llm_suggestions.append(s)
            except Exception as e:
                logger.warning("AI classification failed: %s", e)
                llm_suggestions = [{
                    "budget_type": "day_to_day",
                    "occasion": "Monthly Living",
                    "category": "uncategorized",
                    "merchant": None,
                    "recurring": False,
                    "confidence": 0,
                    "source": "ai",
                }]

            # Step 3: Merge — historical first (sorted by confidence), then AI, deduped by category
            seen_cats = set()
            merged = []
            for s in historical + llm_suggestions:
                cat = s.get("category", "uncategorized")
                if cat not in seen_cats:
                    seen_cats.add(cat)
                    merged.append(s)
                if len(merged) >= 4:
                    break

            # Step 4: Save as pending AI suggestion
            suggestion = AISuggestion(
                user_id=user["user_id"],
                suggestion_type="classification",
                data={
                    "description": clean_desc,
                    "amount": payload.amount,
                    "suggestions": merged,
                },
                status="pending",
            )
            session.add(suggestion)
            await session.commit()
            await session.refresh(suggestion)

            return {
                "suggestion_id": suggestion.id,
                "suggestions": merged,
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
            merchant_name = payload.merchant or payload.occasion or ""
            tx = Transaction(
                transaction_id=f"tx_{uuid.uuid4().hex[:12]}",
                user_id=user["user_id"],
                amount=-abs(payload.amount) if payload.amount > 0 else payload.amount,
                description=payload.description.strip(),
                category=payload.category.lower().strip(),
                merchant_name=merchant_name,
                normalized_merchant=merchant_name.lower().strip(),
                date=datetime.fromisoformat(payload.date) if payload.date else datetime.now(timezone.utc),
                source="manual",
                tx_type="expense",
            )
            session.add(tx)
            await session.commit()
            await session.refresh(tx)

            # Mark suggestion as approved if provided
            chosen_suggestion = None
            if payload.suggestion_id:
                s_result = await session.execute(
                    select(AISuggestion).where(
                        AISuggestion.id == payload.suggestion_id,
                        AISuggestion.user_id == user["user_id"],
                    )
                )
                sug = s_result.scalar_one_or_none()
                if sug:
                    if payload.suggestion_index is not None and isinstance(sug.data, dict):
                        suggestions_list = sug.data.get("suggestions", [])
                        if 0 <= payload.suggestion_index < len(suggestions_list):
                            chosen_suggestion = suggestions_list[payload.suggestion_index]
                    sug.status = "approved"
                    sug.applied_at = datetime.now(timezone.utc)
                    await session.commit()

            # Learn: update or create CategoryRule for this merchant→category mapping
            if merchant_name and len(merchant_name) > 1:
                normalized_merchant = merchant_name.lower().strip()
                try:
                    rule_result = await session.execute(
                        select(CategoryRule).where(
                            CategoryRule.user_id == user["user_id"],
                            CategoryRule.merchant == normalized_merchant,
                        )
                    )
                    rule = rule_result.scalar_one_or_none()
                    if rule:
                        rule.match_count = (rule.match_count or 0) + 1
                        rule.last_used_at = datetime.now(timezone.utc)
                    else:
                        rule = CategoryRule(
                            user_id=user["user_id"],
                            merchant=normalized_merchant,
                            category=payload.category.lower().strip(),
                            match_count=1,
                            source="user_approved",
                        )
                        session.add(rule)
                    await session.commit()
                except Exception as e:
                    logger.warning("Failed to update CategoryRule: %s", e)

            # Create RecurringTransaction if requested
            if payload.save_as_recurring:
                try:
                    rec_tx = RecurringTransaction(
                        user_id=user["user_id"],
                        description=payload.description.strip(),
                        amount=-abs(payload.amount) if payload.amount > 0 else payload.amount,
                        category=payload.category.lower().strip(),
                        frequency="monthly",
                        next_date=datetime.fromisoformat(payload.date) if payload.date else datetime.now(timezone.utc),
                        active=True,
                    )
                    session.add(rec_tx)
                    await session.commit()
                except Exception:
                    pass

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

    # ── YOM TOV AUTO-CREATE ─────────────────────────────────────────────

    @router.post("/yom-tov/auto-create")
    async def yom_tov_auto_create(
        payload: YomTovAutoCreateIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            created = []
            for holiday_name in payload.holiday_names:
                # Check if occasion already exists
                result = await session.execute(
                    select(BudgetOccasion).where(
                        BudgetOccasion.user_id == user["user_id"],
                        BudgetOccasion.budget_type == "yom_tov",
                        BudgetOccasion.name == holiday_name,
                    )
                )
                occ = result.scalar_one_or_none()
                if occ:
                    created.append({"name": holiday_name, "id": occ.id, "status": "existing"})
                    continue

                # Get existing holiday_budget data for this holiday
                hb_result = await session.execute(
                    select(HolidayBudget).where(
                        HolidayBudget.user_id == user["user_id"],
                        HolidayBudget.holiday_name == holiday_name,
                    )
                )
                hb_rows = hb_result.scalars().all()

                start_date = None
                end_date = None
                estimated_amount = 0
                if hb_rows:
                    start_date = hb_rows[0].start_date
                    end_date = hb_rows[0].end_date
                    for hb in hb_rows:
                        estimated_amount += hb.budgeted_amount

                new_occ = BudgetOccasion(
                    user_id=user["user_id"],
                    budget_type="yom_tov",
                    name=holiday_name,
                    event_date=start_date or datetime.now(timezone.utc),
                    estimated_amount=estimated_amount,
                    status="approved",
                )
                session.add(new_occ)
                await session.flush()

                # Copy holiday_budget categories into BudgetOccasionCategory
                for hb in hb_rows:
                    cat = BudgetOccasionCategory(
                        occasion_id=new_occ.id,
                        name=hb.category,
                        budgeted_amount=hb.budgeted_amount,
                        actual_amount=hb.actual_amount,
                    )
                    session.add(cat)

                created.append({"name": holiday_name, "id": new_occ.id, "status": "created"})

            await session.commit()
            return {"created": created, "count": len(created)}

    # ── YOM TOV AI ESTIMATE ─────────────────────────────────────────────

    @router.post("/yom-tov/estimate")
    async def yom_tov_estimate(
        payload: YomTovEstimateIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            await _enforce_free_limit(session, user)

            # Get holiday date range from holiday_budgets
            hb_result = await session.execute(
                select(HolidayBudget).where(
                    HolidayBudget.user_id == user["user_id"],
                    HolidayBudget.holiday_name == payload.holiday_name,
                )
            )
            hb_rows = hb_result.scalars().all()
            if not hb_rows:
                raise HTTPException(404, f"No budget data for {payload.holiday_name}")

            start_dt = hb_rows[0].start_date
            end_dt = hb_rows[0].end_date

            # Get transactions from previous year around same dates
            if start_dt and end_dt:
                prev_start = start_dt - timedelta(days=365)
                prev_end = end_dt - timedelta(days=365)
                tx_result = await session.execute(
                    select(Transaction).where(
                        Transaction.user_id == user["user_id"],
                        Transaction.date >= prev_start,
                        Transaction.date <= prev_end,
                        Transaction.amount < 0,
                    ).order_by(Transaction.amount)
                )
                historical_txs = tx_result.scalars().all()
            else:
                historical_txs = []

            if not historical_txs:
                # No historical data — use existing holiday_budgets as-is
                return {
                    "holiday": payload.holiday_name,
                    "estimates": [{"category": hb.category, "estimated": round(hb.budgeted_amount, 2)} for hb in hb_rows],
                    "source": "budget_data",
                }

            from collections import Counter
            cat_totals = Counter()
            for t in historical_txs:
                cat_totals[t.category or "uncategorized"] += abs(t.amount)
            tx_summary = "\n".join(f"- {cat}: £{amt:.0f}" for cat, amt in cat_totals.most_common(10))

            system_prompt = "You estimate holiday spending per category. Output valid JSON only."
            user_prompt = (
                f"Estimate spending for {payload.holiday_name} based on last year's transactions "
                f"in the same date range ({prev_start.date()} to {prev_end.date()}).\n\n"
                f"Last year's spending:\n{tx_summary}\n\n"
                f"Output JSON format:\n"
                f'{{"estimates": [{{"category": "food", "estimated_amount": 300.0, "rationale": "..."}}]}}'
            )

            try:
                raw, provider, model, pt, ct, cost = await call_llm(
                    system_prompt, user_prompt,
                    json_mode=True, temperature=0.1, max_tokens=1024,
                )
                await _track_usage(session, user["user_id"], provider, model, pt, ct, cost)
                data = parse_json(raw)
                estimates = data.get("estimates", [])
            except Exception as e:
                logger.warning("AI Yom Tov estimate failed: %s", e)
                estimates = [{"category": hb.category, "estimated": round(hb.budgeted_amount, 2)} for hb in hb_rows]

            # Update BudgetOccasionCategory forecast amounts
            occ_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "yom_tov",
                    BudgetOccasion.name == payload.holiday_name,
                )
            )
            occ = occ_result.scalar_one_or_none()
            if occ:
                for est in estimates:
                    cat_result = await session.execute(
                        select(BudgetOccasionCategory).where(
                            BudgetOccasionCategory.occasion_id == occ.id,
                            BudgetOccasionCategory.name == est["category"],
                        )
                    )
                    cat = cat_result.scalar_one_or_none()
                    if cat:
                        cat.forecast_amount = est.get("estimated", est.get("estimated_amount", 0))
                await session.commit()

            return {
                "holiday": payload.holiday_name,
                "estimates": estimates,
                "source": "ai",
            }

    # ── HOLIDAY AI ESTIMATE ─────────────────────────────────────────────

    @router.post("/holiday/estimate")
    async def holiday_estimate(
        payload: HolidayEstimateIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            await _enforce_free_limit(session, user)

            # Get previous holiday spending for user
            tx_result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.amount < 0,
                    Transaction.category.in_(["flights", "accommodation", "food", "travel", "attractions", "shopping"]),
                ).order_by(Transaction.date.desc()).limit(100)
            )
            past_txs = tx_result.scalars().all()

            from collections import Counter
            cat_totals = Counter()
            for t in past_txs:
                cat_totals[t.category or "travel"] += abs(t.amount)
            tx_summary = "\n".join(f"- {cat}: £{amt:.0f} total" for cat, amt in cat_totals.most_common(10))

            system_prompt = "You estimate holiday/vacation costs per category. Output valid JSON only."
            user_prompt = (
                f"Estimate total cost for this holiday:\n"
                f"Name: {payload.name}\n"
                f"Destination: {payload.destination or 'Unknown'}\n"
                f"Date range: {payload.start_date} to {payload.end_date}\n\n"
                f"User's past travel-related spending:\n{tx_summary if past_txs else 'No historical travel data'}\n\n"
                f"Output JSON format:\n"
                f'{{"total_estimated": 2500.0, '
                f'"categories": ['
                f'{{"name": "flights", "estimated": 500.0, "rationale": "..."}},'
                f'{{"name": "accommodation", "estimated": 800.0, ...}},'
                f'{{"name": "food", "estimated": 400.0, ...}},'
                f'{{"name": "travel", "estimated": 200.0, ...}},'
                f'{{"name": "attractions", "estimated": 300.0, ...}},'
                f'{{"name": "shopping", "estimated": 300.0, ...}}'
                f"]}}"
            )

            try:
                raw, provider, model, pt, ct, cost = await call_llm(
                    system_prompt, user_prompt,
                    json_mode=True, temperature=0.1, max_tokens=1024,
                )
                await _track_usage(session, user["user_id"], provider, model, pt, ct, cost)
                data = parse_json(raw)
                categories = data.get("categories", [])
                total_estimated = data.get("total_estimated", 0)
            except Exception as e:
                logger.warning("AI Holiday estimate failed: %s", e)
                categories = [
                    {"name": "flights", "estimated": 0},
                    {"name": "accommodation", "estimated": 0},
                    {"name": "food", "estimated": 0},
                    {"name": "travel", "estimated": 0},
                    {"name": "attractions", "estimated": 0},
                    {"name": "shopping", "estimated": 0},
                ]
                total_estimated = 0

            # Create BudgetOccasion + categories
            try:
                sd = datetime.fromisoformat(payload.start_date)
                ed = datetime.fromisoformat(payload.end_date)
            except Exception:
                sd = datetime.now(timezone.utc)
                ed = sd + timedelta(days=7)

            occ = BudgetOccasion(
                user_id=user["user_id"],
                budget_type="holiday",
                name=payload.name,
                event_date=sd,
                estimated_amount=total_estimated,
                status="approved",
            )
            session.add(occ)
            await session.flush()

            for cat in categories:
                cat_name = cat.get("name", "other").lower().strip()
                cat_est = cat.get("estimated", 0)
                cat_obj = BudgetOccasionCategory(
                    occasion_id=occ.id,
                    name=cat_name,
                    budgeted_amount=cat_est,
                    forecast_amount=cat_est,
                )
                session.add(cat_obj)

            await session.commit()
            await session.refresh(occ)

            return {
                "id": occ.id,
                "name": payload.name,
                "total_estimated": round(total_estimated, 2),
                "categories": categories,
            }

    # ── SIMCHA ─────────────────────────────────────────────────────────────

    @router.get("/simcha")
    async def list_simcha(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "simcha",
                ).order_by(BudgetOccasion.event_date.desc().nullslast())
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
                    "event_date": occ.event_date.isoformat() if occ.event_date else None,
                    "estimated_amount": round(occ.estimated_amount, 2),
                    "notes": occ.notes,
                    "categories": [{
                        "id": c.id,
                        "name": c.name,
                        "budgeted": round(c.budgeted_amount, 2),
                        "actual": round(c.actual_amount, 2),
                    } for c in cats],
                })
            return {"occasions": out}

    @router.post("/simcha")
    async def create_simcha(
        payload: SimchaIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            event_date = None
            if payload.event_date:
                try:
                    event_date = datetime.fromisoformat(payload.event_date)
                except Exception:
                    pass

            occ = BudgetOccasion(
                user_id=user["user_id"],
                budget_type="simcha",
                name=payload.name.strip(),
                event_date=event_date,
                estimated_amount=payload.estimated_amount or 0,
                status="approved",
            )
            session.add(occ)
            await session.flush()

            for cat in payload.categories:
                cat_obj = BudgetOccasionCategory(
                    occasion_id=occ.id,
                    name=cat.name.lower().strip(),
                    budgeted_amount=cat.budgeted_amount,
                )
                session.add(cat_obj)

            await session.commit()
            await session.refresh(occ)
            return {"id": occ.id, "name": occ.name, "estimated_amount": round(occ.estimated_amount, 2)}

    @router.put("/simcha/{occ_id}")
    async def update_simcha(
        occ_id: int,
        payload: SimchaIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.id == occ_id,
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "simcha",
                )
            )
            occ = result.scalar_one_or_none()
            if not occ:
                raise HTTPException(404, "Simcha occasion not found")

            if payload.name:
                occ.name = payload.name.strip()
            if payload.event_date:
                try:
                    occ.event_date = datetime.fromisoformat(payload.event_date)
                except Exception:
                    pass
            occ.estimated_amount = payload.estimated_amount or 0

            cat_result = await session.execute(
                select(BudgetOccasionCategory).where(
                    BudgetOccasionCategory.occasion_id == occ.id,
                )
            )
            for old_cat in cat_result.scalars().all():
                await session.delete(old_cat)

            for cat in payload.categories:
                cat_obj = BudgetOccasionCategory(
                    occasion_id=occ.id,
                    name=cat.name.lower().strip(),
                    budgeted_amount=cat.budgeted_amount,
                )
                session.add(cat_obj)

            await session.commit()
            return {"ok": True}

    @router.delete("/simcha/{occ_id}")
    async def delete_simcha(occ_id: int, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.id == occ_id,
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "simcha",
                )
            )
            occ = result.scalar_one_or_none()
            if not occ:
                raise HTTPException(404, "Simcha occasion not found")

            cat_result = await session.execute(
                select(BudgetOccasionCategory).where(
                    BudgetOccasionCategory.occasion_id == occ.id,
                )
            )
            for cat in cat_result.scalars().all():
                await session.delete(cat)

            await session.delete(occ)
            await session.commit()
            return {"ok": True}

    # ── OTHER BUDGET ─────────────────────────────────────────────────────

    @router.get("/other")
    async def list_other(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "other",
                ).order_by(BudgetOccasion.event_date.desc().nullslast())
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
                    "event_date": occ.event_date.isoformat() if occ.event_date else None,
                    "estimated_amount": round(occ.estimated_amount, 2),
                    "notes": occ.notes,
                    "categories": [{
                        "id": c.id,
                        "name": c.name,
                        "budgeted": round(c.budgeted_amount, 2),
                        "actual": round(c.actual_amount, 2),
                    } for c in cats],
                })
            return {"occasions": out}

    @router.post("/other")
    async def create_other(
        payload: OtherIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            event_date = None
            if payload.event_date:
                try:
                    event_date = datetime.fromisoformat(payload.event_date)
                except Exception:
                    pass

            occ = BudgetOccasion(
                user_id=user["user_id"],
                budget_type="other",
                name=payload.name.strip(),
                event_date=event_date,
                estimated_amount=payload.estimated_amount or 0,
                notes=payload.notes,
                status="approved",
            )
            session.add(occ)
            await session.flush()

            for cat in payload.categories:
                cat_obj = BudgetOccasionCategory(
                    occasion_id=occ.id,
                    name=cat.name.lower().strip(),
                    budgeted_amount=cat.budgeted_amount,
                )
                session.add(cat_obj)

            await session.commit()
            await session.refresh(occ)
            return {"id": occ.id, "name": occ.name, "estimated_amount": round(occ.estimated_amount, 2), "notes": occ.notes}

    @router.put("/other/{occ_id}")
    async def update_other(
        occ_id: int,
        payload: OtherIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.id == occ_id,
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "other",
                )
            )
            occ = result.scalar_one_or_none()
            if not occ:
                raise HTTPException(404, "Other budget not found")

            if payload.name:
                occ.name = payload.name.strip()
            if payload.event_date:
                try:
                    occ.event_date = datetime.fromisoformat(payload.event_date)
                except Exception:
                    pass
            occ.estimated_amount = payload.estimated_amount or 0
            if payload.notes is not None:
                occ.notes = payload.notes

            cat_result = await session.execute(
                select(BudgetOccasionCategory).where(
                    BudgetOccasionCategory.occasion_id == occ.id,
                )
            )
            for old_cat in cat_result.scalars().all():
                await session.delete(old_cat)

            for cat in payload.categories:
                cat_obj = BudgetOccasionCategory(
                    occasion_id=occ.id,
                    name=cat.name.lower().strip(),
                    budgeted_amount=cat.budgeted_amount,
                )
                session.add(cat_obj)

            await session.commit()
            return {"ok": True}

    @router.delete("/other/{occ_id}")
    async def delete_other(occ_id: int, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.id == occ_id,
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.budget_type == "other",
                )
            )
            occ = result.scalar_one_or_none()
            if not occ:
                raise HTTPException(404, "Other budget not found")

            cat_result = await session.execute(
                select(BudgetOccasionCategory).where(
                    BudgetOccasionCategory.occasion_id == occ.id,
                )
            )
            for cat in cat_result.scalars().all():
                await session.delete(cat)

            await session.delete(occ)
            await session.commit()
            return {"ok": True}

    # ── SMART ALERTS ──────────────────────────────────────────────────────

    @router.get("/alerts")
    async def smart_alerts(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            now = datetime.now(timezone.utc)
            start_dt, end_dt = _current_month_range()
            alerts = []

            # 1. Budget overruns (actual > budgeted * 1.2)
            occ_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.status == "approved",
                )
            )
            for occ in occ_result.scalars().all():
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == occ.id,
                    )
                )
                for cat in cat_result.scalars().all():
                    if cat.actual_amount > 0 and cat.budgeted_amount > 0 and cat.actual_amount > cat.budgeted_amount * 1.2:
                        alerts.append({
                            "type": "overrun",
                            "severity": "warning" if cat.actual_amount <= cat.budgeted_amount * 1.5 else "critical",
                            "message": f"{cat.name} in {occ.name} is £{cat.actual_amount - cat.budgeted_amount:.0f} over budget",
                            "category": cat.name, "occasion": occ.name,
                            "budgeted": round(cat.budgeted_amount, 2),
                            "actual": round(cat.actual_amount, 2),
                        })

            # 2. Unusual spending (last 30 days vs previous 30 days)
            period_end = now
            period_start = now - timedelta(days=30)
            prev_end = period_start
            prev_start = prev_end - timedelta(days=30)

            cur_tx = await session.execute(
                select(Transaction.category, func.coalesce(func.sum(Transaction.amount), 0))
                .where(Transaction.user_id == user["user_id"], Transaction.amount < 0,
                       Transaction.date >= period_start, Transaction.date <= period_end)
                .group_by(Transaction.category)
            )
            cur_spend = {r.category: abs(r[1]) for r in cur_tx.all()}

            prev_tx = await session.execute(
                select(Transaction.category, func.coalesce(func.sum(Transaction.amount), 0))
                .where(Transaction.user_id == user["user_id"], Transaction.amount < 0,
                       Transaction.date >= prev_start, Transaction.date <= prev_end)
                .group_by(Transaction.category)
            )
            prev_spend = {r.category: abs(r[1]) for r in prev_tx.all()}

            for cat, cur in cur_spend.items():
                prev = prev_spend.get(cat, 0)
                if prev > 0 and cur > prev * 1.3 and cur > 50:
                    alerts.append({
                        "type": "unusual_spending",
                        "severity": "info",
                        "message": f"{cat.title()} spending {((cur/prev)-1)*100:.0f}% higher than last month",
                        "category": cat, "current": round(cur, 2), "previous": round(prev, 2),
                    })

            # 3. Upcoming due within 7 days
            week_end = now + timedelta(days=7)
            rec_result = await session.execute(
                select(RecurringTransaction).where(
                    RecurringTransaction.user_id == user["user_id"],
                    RecurringTransaction.active == True,
                    RecurringTransaction.next_date >= now,
                    RecurringTransaction.next_date <= week_end,
                )
            )
            for rec in rec_result.scalars().all():
                alerts.append({
                    "type": "upcoming_due", "severity": "info",
                    "message": f"£{abs(rec.amount):.0f} due for {rec.description} on {rec.next_date.strftime('%d %b')}",
                    "name": rec.description, "amount": round(abs(rec.amount), 2),
                    "due_date": rec.next_date.isoformat(), "frequency": rec.frequency,
                })

            occ_result2 = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.status == "approved",
                    BudgetOccasion.estimated_amount > 0,
                    BudgetOccasion.event_date >= now,
                    BudgetOccasion.event_date <= week_end,
                )
            )
            for occ in occ_result2.scalars().all():
                alerts.append({
                    "type": "upcoming_due", "severity": "info",
                    "message": f"£{occ.estimated_amount:.0f} estimated for {occ.name} on {occ.event_date.strftime('%d %b')}",
                    "name": occ.name, "amount": round(occ.estimated_amount, 2),
                    "due_date": occ.event_date.isoformat(),
                })

            alerts.sort(key=lambda a: {"critical": 0, "warning": 1, "info": 2}.get(a.get("severity"), 3))
            return {"alerts": alerts}

    # ── MONTHLY REVIEW ────────────────────────────────────────────────────

    @router.post("/monthly-review")
    async def monthly_review(
        payload: MonthlyReviewIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            start_dt, end_dt = _month_start_end(f"{payload.year}-{payload.month:02d}")

            # Previous month
            prev_month = payload.month - 1
            prev_year = payload.year
            if prev_month == 0:
                prev_month = 12
                prev_year -= 1
            prev_start, prev_end = _month_start_end(f"{prev_year}-{prev_month:02d}")

            # Current month income/expenses
            tx_result = await session.execute(
                select(
                    func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0),
                    func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount < 0), 0),
                ).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= start_dt, Transaction.date <= end_dt,
                )
            )
            income, expenses = tx_result.one()
            expenses = abs(expenses)

            # Previous month income/expenses
            prev_tx = await session.execute(
                select(
                    func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0),
                    func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount < 0), 0),
                ).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= prev_start, Transaction.date <= prev_end,
                )
            )
            prev_income, prev_expenses = prev_tx.one()
            prev_expenses = abs(prev_expenses)

            # Budget occasions + categories
            occ_result = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.status == "approved",
                )
            )
            total_budgeted = 0
            total_actual = 0
            by_type = {}
            overspends = []
            for occ in occ_result.scalars().all():
                btype = occ.budget_type
                if btype not in by_type:
                    by_type[btype] = {"budgeted": 0, "actual": 0, "name": btype.replace("_", " ").title()}
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == occ.id,
                    )
                )
                for cat in cat_result.scalars().all():
                    by_type[btype]["budgeted"] += cat.budgeted_amount
                    by_type[btype]["actual"] += cat.actual_amount
                    total_budgeted += cat.budgeted_amount
                    total_actual += cat.actual_amount
                    if cat.actual_amount > cat.budgeted_amount > 0:
                        overspends.append({
                            "category": cat.name, "occasion": occ.name, "type": btype,
                            "budgeted": round(cat.budgeted_amount, 2),
                            "actual": round(cat.actual_amount, 2),
                            "over_by": round(cat.actual_amount - cat.budgeted_amount, 2),
                        })

            overspends.sort(key=lambda x: x["over_by"], reverse=True)
            savings_rate = ((income - expenses) / income * 100) if income > 0 else 0

            # Health score (reuse logic inline)
            occ_result2 = await session.execute(
                select(BudgetOccasion).where(
                    BudgetOccasion.user_id == user["user_id"],
                    BudgetOccasion.status == "approved",
                )
            )
            h_total_budgeted = 0
            h_total_actual = 0
            for occ in occ_result2.scalars().all():
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == occ.id,
                    )
                )
                for cat in cat_result.scalars().all():
                    h_total_budgeted += cat.budgeted_amount
                    h_total_actual += cat.actual_amount

            if h_total_budgeted > 0:
                adherence_pct = min(100, (h_total_actual / h_total_budgeted) * 100)
                adherence_score = max(0, 40 - (adherence_pct - 80) * 0.5) if adherence_pct > 80 else 40
            else:
                adherence_score = 0
            savings_score = min(30, max(0, savings_rate * 2)) if income > 0 else 0

            if income > 0 and expenses > 0:
                stability_score = 20 if (income > expenses) else 10
                budget_count = sum(1 for _ in occ_result2.scalars().all())
                stability_score += 10 if budget_count > 0 else 0
            else:
                stability_score = 0

            health_score = min(100, round(adherence_score + savings_score + stability_score))

            return {
                "month": f"{payload.year}-{payload.month:02d}",
                "income": round(income, 2), "expenses": round(expenses, 2),
                "saved": round(income - expenses, 2), "savings_rate": round(savings_rate, 1),
                "total_budgeted": round(total_budgeted, 2),
                "total_actual_budget_categories": round(total_actual, 2),
                "health_score": health_score,
                "health_breakdown": {
                    "budget_adherence": round(adherence_score, 1),
                    "savings_rate": round(savings_score, 1),
                    "cash_flow_stability": round(stability_score, 1),
                },
                "by_type": {k: {**v, "budgeted": round(v["budgeted"], 2), "actual": round(v["actual"], 2)}
                           for k, v in by_type.items()},
                "top_overspends": overspends[:5],
                "previous_month": {
                    "income": round(prev_income, 2), "expenses": round(prev_expenses, 2),
                    "month": f"{prev_year}-{prev_month:02d}",
                },
            }

    # ── DETECT PATTERNS ──────────────────────────────────────────────────

    @router.post("/detect-patterns")
    async def detect_patterns(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            now = datetime.now(timezone.utc)
            two_years_ago = now - timedelta(days=730)

            tx_result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.amount < 0,
                    Transaction.date >= two_years_ago,
                    Transaction.recurring_id.is_(None),
                ).order_by(Transaction.date)
            )
            all_txs = tx_result.scalars().all()

            patterns = []
            seen_tx_ids = set()

            for i, tx in enumerate(all_txs):
                if tx.transaction_id in seen_tx_ids:
                    continue
                tx_amt = abs(tx.amount)
                if tx_amt < 10:
                    continue
                tx_month = tx.date.month
                tx_desc = (tx.normalized_merchant or tx.description or "").lower().strip()[:25]
                if not tx_desc:
                    continue

                matches = []
                for j, other in enumerate(all_txs):
                    if i == j or other.transaction_id in seen_tx_ids:
                        continue
                    o_amt = abs(other.amount)
                    o_month = other.date.month
                    o_desc = (other.normalized_merchant or other.description or "").lower().strip()[:25]

                    # Same or adjacent month (Dec-Jan wrap)
                    month_diff = abs(tx_month - o_month)
                    if month_diff > 1 and month_diff != 11:
                        continue

                    # Similar amount ±20%
                    if o_amt < tx_amt * 0.8 or o_amt > tx_amt * 1.2:
                        continue

                    # Same category
                    if tx.category != other.category:
                        continue

                    # Description similarity (simple prefix match)
                    common = sum(1 for a, b in zip(tx_desc, o_desc) if a == b)
                    if len(tx_desc) < 5 or common / len(tx_desc) < 0.6:
                        continue

                    # Different year
                    if other.date.year == tx.date.year:
                        continue

                    matches.append(other)
                    seen_tx_ids.add(other.transaction_id)

                if matches:
                    seen_tx_ids.add(tx.transaction_id)
                    all_matches = [tx] + matches
                    avg_amt = sum(abs(m.amount) for m in all_matches) / len(all_matches)
                    years = set(m.date.year for m in all_matches)
                    freq = "yearly" if len(years) == len(all_matches) else "semi_annual"

                    # Skip if a RecurringTransaction already exists for this pattern
                    existing = await session.execute(
                        select(RecurringTransaction).where(
                            RecurringTransaction.user_id == user["user_id"],
                            RecurringTransaction.category == tx.category,
                            RecurringTransaction.description.ilike(f"%{tx_desc[:15]}%"),
                        )
                    )
                    if existing.scalar_one_or_none():
                        continue

                    patterns.append({
                        "description": tx_desc,
                        "category": tx.category,
                        "estimated_amount": round(avg_amt, 2),
                        "frequency": freq,
                        "month": tx_month,
                        "matches_found": len(all_matches),
                        "examples": [round(abs(m.amount), 2) for m in all_matches[:3]],
                    })

            # Auto-create RecurringTransaction records for detected patterns
            created = []
            for pat in patterns:
                # Next occurrence: same month next year (or later this year)
                next_month = pat["month"]
                next_year = now.year
                if next_month > now.month:
                    pass  # later this year
                elif next_month == now.month:
                    next_year = now.year if now.day <= 15 else now.year + 1
                else:
                    next_year = now.year + 1

                try:
                    next_date = datetime(next_year, next_month, 1, tzinfo=timezone.utc)
                except Exception:
                    next_date = now + timedelta(days=30)

                rec = RecurringTransaction(
                    user_id=user["user_id"],
                    description=pat["description"],
                    amount=-pat["estimated_amount"],
                    category=pat["category"],
                    frequency=pat["frequency"],
                    next_date=next_date,
                    active=True,
                )
                session.add(rec)
                await session.flush()
                created.append({**pat, "recurring_id": rec.id, "next_date": next_date.isoformat()})

            await session.commit()
            return {"patterns_detected": len(created), "created": created}

    # ── DEFAULTS / PRESETS ──────────────────────────────────────────────

    @router.get("/day-to-day/defaults")
    async def day_to_day_defaults():
        return {"categories": DEFAULT_DAY_TO_DAY_CATEGORIES}

    @router.post("/day-to-day/init")
    async def day_to_day_init(
        payload: DayToDayInitIn,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
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

            created = []
            for cat_name in DEFAULT_DAY_TO_DAY_CATEGORIES:
                cat_result = await session.execute(
                    select(BudgetOccasionCategory).where(
                        BudgetOccasionCategory.occasion_id == occasion.id,
                        BudgetOccasionCategory.name == cat_name,
                    )
                )
                existing = cat_result.scalar_one_or_none()
                if existing:
                    continue

                amount = 0
                if payload.amounts and cat_name in payload.amounts:
                    amount = payload.amounts[cat_name]

                cat = BudgetOccasionCategory(
                    occasion_id=occasion.id,
                    name=cat_name,
                    budgeted_amount=amount,
                )
                session.add(cat)
                created.append({"name": cat_name, "budgeted": amount})

            await session.commit()
            return {"created_count": len(created), "categories": created}

    @router.get("/presets/other")
    async def presets_other():
        return {
            "examples": [
                "Car purchase", "Home renovation", "Medical expense",
                "School fees", "Insurance", "Tax payment", "Furniture",
                "Garden project", "Pet expenses", "White goods",
            ],
            "categories": ["purchase", "repair", "service", "fee", "tax",
                           "insurance", "medical", "education", "home",
                           "vehicle", "pet", "other"],
        }

    @router.get("/presets/holiday")
    async def presets_holiday():
        return {
            "categories": ["flights", "accommodation", "food", "travel",
                           "attractions", "shopping"],
        }

    return router
