"""Phase 9 — Empty states: contextual guides when user has no data yet."""
import logging

from fastapi import APIRouter, Request, Depends
from sqlalchemy import select, func

from db import Transaction, HolidayBudget, ChasunaPlan, InvestmentHolding, SupportTicket
from auth import get_current_user

logger = logging.getLogger("empty_states")

RESOURCE_GUIDES = {
    "transactions": {
        "title": "No transactions yet",
        "message": "Add your first transaction manually or connect your bank account to auto-sync.",
        "actions": [
            {"label": "Connect bank", "path": "/connections"},
            {"label": "Add transaction", "path": "/transactions/add"},
        ],
    },
    "budgets": {
        "title": "No budgets set",
        "message": "Create a monthly budget to track your spending across categories.",
        "actions": [{"label": "Create budget", "path": "/budgets/new"}],
    },
    "holidays": {
        "title": "No holiday budgets yet",
        "message": "Plan your spending for Yom Tov with automatic holiday budgets.",
        "actions": [{"label": "Set up holidays", "path": "/jewish/holidays"}],
    },
    "chasuna": {
        "title": "No wedding plan yet",
        "message": "Plan every aspect of your simcha with our 25-category wedding planner.",
        "actions": [{"label": "Start planning", "path": "/jewish/chasuna"}],
    },
    "maaser": {
        "title": "Track your maaser",
        "message": "Automatically calculate your 10% maaser obligation based on income.",
        "actions": [{"label": "Set up maaser", "path": "/jewish/maaser"}],
    },
    "investments": {
        "title": "No investments tracked",
        "message": "Add your stocks, ETFs, crypto, or gold holdings to track your portfolio.",
        "actions": [{"label": "Add holding", "path": "/investments/add"}],
    },
    "support_tickets": {
        "title": "No support tickets",
        "message": "Submit a ticket if you need help or have a question.",
        "actions": [{"label": "Contact support", "path": "/support/new"}],
    },
}


def build_router() -> APIRouter:
    router = APIRouter(prefix="/empty-states", tags=["empty_states"])

    @router.get("/check")
    async def check_empty_states(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            tx_count = (await session.execute(
                select(func.count()).select_from(Transaction).where(Transaction.user_id == user["user_id"])
            )).scalar() or 0
            holiday_count = (await session.execute(
                select(func.count()).select_from(HolidayBudget).where(HolidayBudget.user_id == user["user_id"])
            )).scalar() or 0
            chasuna_count = (await session.execute(
                select(func.count()).select_from(ChasunaPlan).where(ChasunaPlan.user_id == user["user_id"])
            )).scalar() or 0
            invest_count = (await session.execute(
                select(func.count()).select_from(InvestmentHolding).where(InvestmentHolding.user_id == user["user_id"])
            )).scalar() or 0
            ticket_count = (await session.execute(
                select(func.count()).select_from(SupportTicket).where(SupportTicket.user_id == user["user_id"])
            )).scalar() or 0
        empty = []
        if tx_count == 0:
            empty.append(RESOURCE_GUIDES["transactions"])
        if holiday_count == 0:
            empty.append(RESOURCE_GUIDES["holidays"])
        if chasuna_count == 0:
            empty.append(RESOURCE_GUIDES["chasuna"])
        if invest_count == 0:
            empty.append(RESOURCE_GUIDES["investments"])
        if tx_count == 0:
            empty.append(RESOURCE_GUIDES["budgets"])
        if tx_count == 0:
            empty.append(RESOURCE_GUIDES["maaser"])
        if ticket_count == 0:
            empty.append(RESOURCE_GUIDES["support_tickets"])
        return {
            "empty_resources": empty,
            "needs_onboarding": tx_count == 0,
        }

    @router.get("/guide/{resource}")
    async def get_guide(resource: str):
        if resource not in RESOURCE_GUIDES:
            return {"error": f"No guide for '{resource}'"}
        return RESOURCE_GUIDES[resource]

    @router.get("/health")
    async def empty_states_health():
        return {"status": "ok"}

    return router
