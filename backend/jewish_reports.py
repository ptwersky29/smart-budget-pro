"""Year-end Jewish Finance Reports - Maaser summaries and holiday budgets."""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from sqlalchemy import select, and_
from db import User, Transaction, MaaserLedger, HolidayBudget, Budget
from auth import get_current_user
from maaser import INCOME_CATEGORIES

logger = logging.getLogger("jewish_reports")

router = APIRouter(prefix="/jewish/reports", tags=["jewish-reports"])


def _maaser_to_dict(n: MaaserLedger) -> dict:
    """Convert Maaser ledger entry to dict."""
    return {
        "id": n.id,
        "date": n.date.isoformat() if n.date else None,
        "maaser_due": float(n.maaser_due or 0),
        "maaser_paid": float(n.maaser_paid or 0),
        "paid_to": n.paid_to,
        "note": n.note,
        "transaction_id": n.transaction_id,
    }


@router.get("/annual-maaser-summary")
async def annual_maaser_summary(
    request: Request,
    user: dict = Depends(get_current_user),
    year: int = Query(None),
):
    """Generate annual Maaser summary for tax/record purposes."""
    sm = request.app.state.db
    async with sm() as session:
        if year is None:
            year = datetime.now(timezone.utc).year

        # Get user maaser settings
        result = await session.execute(
            select(User).where(User.user_id == user["user_id"])
        )
        u = result.scalar_one_or_none()
        if not u:
            raise HTTPException(404, "User not found")
        
        prefs = u.preferences or {}
        maaser_settings = prefs.get("maaser", {})
        percent = float(maaser_settings.get("percent", 10))

        # Get transactions for the year
        tx_result = await session.execute(
            select(Transaction).where(
                and_(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= f"{year}-01-01",
                    Transaction.date < f"{year + 1}-01-01",
                )
            )
        )
        txs = tx_result.scalars().all()

        # Calculate income and tzedakah
        total_income = 0.0
        tx_given = 0.0
        months = {}

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
            month = str(t.date)[:7] if t.date else ""

            # Track monthly income
            if amt > 0 or cat in INCOME_CATEGORIES:
                total_income += abs(amt)
                if month not in months:
                    months[month] = {"income": 0, "given": 0}
                months[month]["income"] += abs(amt)

            # Track tzedakah
            if amt < 0 and cat == "tzedakah":
                tx_given += -amt
                if month not in months:
                    months[month] = {"income": 0, "given": 0}
                months[month]["given"] += -amt

        # Get ledger entries for the year
        ledger_result = await session.execute(
            select(MaaserLedger).where(
                and_(
                    MaaserLedger.user_id == user["user_id"],
                    MaaserLedger.date >= f"{year}-01-01",
                    MaaserLedger.date < f"{year + 1}-01-01",
                )
            )
        )
        ledger = ledger_result.scalars().all()

        # Calculate obligation and given
        obligation = round(total_income * percent / 100, 2)
        manual_given = sum((e.maaser_paid or 0) for e in ledger if e.maaser_paid and e.maaser_paid > 0)
        total_given = manual_given + tx_given
        balance_owed = round(max(0, obligation - total_given), 2)
        credit = round(max(0, total_given - obligation), 2)

        # Organize ledger entries by month
        for entry in ledger:
            month = str(entry.date)[:7] if entry.date else ""
            if month not in months:
                months[month] = {"income": 0, "given": 0}
            if entry.maaser_paid and entry.maaser_paid > 0:
                months[month]["given"] += entry.maaser_paid

        return {
            "year": year,
            "percent": percent,
            "total_income": round(total_income, 2),
            "obligation": obligation,
            "total_given": round(total_given, 2),
            "ledger_given": round(manual_given, 2),
            "tx_given": round(tx_given, 2),
            "balance_owed": balance_owed,
            "credit": credit,
            "status": "fulfilled" if balance_owed == 0 else "overfunded" if credit > 0 else "outstanding",
            "monthly_breakdown": {month: months[month] for month in sorted(months.keys())},
            "entries": [_maaser_to_dict(e) for e in ledger],
            "summary": {
                "title": f"Maaser Summary {year}",
                "description": f"{percent}% of income obligation for tzedakah and charitable giving",
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
        }


@router.get("/holiday-budget-report")
async def holiday_budget_report(
    request: Request,
    user: dict = Depends(get_current_user),
    year: int = Query(None),
):
    """Generate holiday budget spending report."""
    sm = request.app.state.db
    async with sm() as session:
        if year is None:
            year = datetime.now(timezone.utc).year

        # Get holiday budgets
        hb_result = await session.execute(
            select(HolidayBudget).where(HolidayBudget.user_id == user["user_id"])
        )
        holiday_budgets = hb_result.scalars().all()

        report = {
            "year": year,
            "holidays": [],
            "summary": {
                "total_budgeted": 0,
                "total_spent": 0,
                "total_balance": 0,
            }
        }

        # For each holiday, calculate budget vs actual
        for hb in holiday_budgets:
            # Get transactions tagged with this holiday category
            tx_result = await session.execute(
                select(Transaction).where(
                    and_(
                        Transaction.user_id == user["user_id"],
                        Transaction.category.ilike(hb.name),
                        Transaction.date >= f"{year}-01-01",
                        Transaction.date < f"{year + 1}-01-01",
                    )
                )
            )
            txs = tx_result.scalars().all()

            spent = sum(-float(t.amount) for t in txs if t.amount < 0)
            budgeted = float(hb.limit or 0)
            balance = budgeted - spent

            holiday_entry = {
                "name": hb.name,
                "budgeted": round(budgeted, 2),
                "spent": round(spent, 2),
                "balance": round(balance, 2),
                "status": "within" if balance >= 0 else "over",
                "percentage": round((spent / budgeted * 100) if budgeted > 0 else 0, 1),
            }
            report["holidays"].append(holiday_entry)
            report["summary"]["total_budgeted"] += budgeted
            report["summary"]["total_spent"] += spent
            report["summary"]["total_balance"] += balance

        report["summary"]["total_budgeted"] = round(report["summary"]["total_budgeted"], 2)
        report["summary"]["total_spent"] = round(report["summary"]["total_spent"], 2)
        report["summary"]["total_balance"] = round(report["summary"]["total_balance"], 2)
        report["summary"]["generated_at"] = datetime.now(timezone.utc).isoformat()

        return report


@router.get("/jewish-finance-year-end")
async def jewish_finance_year_end_report(
    request: Request,
    user: dict = Depends(get_current_user),
    year: int = Query(None),
):
    """Generate comprehensive year-end Jewish finance report."""
    sm = request.app.state.db
    
    # Get both reports
    maaser_report = await annual_maaser_summary(request, user, year)
    holiday_report = await holiday_budget_report(request, user, year)

    return {
        "report_type": "jewish_finance_year_end",
        "year": year or datetime.now(timezone.utc).year,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "user_id": user["user_id"],
        "sections": {
            "maaser": maaser_report,
            "holidays": holiday_report,
        },
        "pdf_url": f"/jewish/reports/download/year-end-{year or datetime.now(timezone.utc).year}.pdf",
    }
