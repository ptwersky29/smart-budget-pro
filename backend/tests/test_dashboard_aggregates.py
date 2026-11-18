"""Dashboard SQL aggregates must match the effective-transaction rules.

The overview endpoint used to sum ``_effective_transaction_lines`` in Python.
It now aggregates in SQL, which is much faster but easy to get subtly wrong
(splits, transfers, unapproved rows). This test pins the two implementations
together on a small, deliberately awkward ledger.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from auth import get_current_user
from db import BankAccount, Base, SplitTransaction, Transaction, User
from finance_engine import _effective_transaction_lines, build_router

USER_ID = "user_dashboard_aggregates"


def _tx(transaction_id, amount, category, when, **overrides):
    fields = {
        "transaction_id": transaction_id,
        "user_id": USER_ID,
        "account_id": "acct_1",
        "amount": amount,
        "category": category,
        "date": when,
        "description": transaction_id,
        "source": "manual",
        "approval_status": "approved",
        "category_approval_status": "approved",
    }
    fields.update(overrides)
    return Transaction(**fields)


async def _seed(session):
    now = datetime.now(timezone.utc)
    session.add(
        User(
            user_id=USER_ID,
            email="aggregates@example.com",
            name="Aggregates",
            hashed_password="x",
            role="user",
        )
    )
    session.add(
        BankAccount(
            account_id="acct_1",
            user_id=USER_ID,
            name="Current",
            type="current",
            provider="manual",
            balance=0.0,
            currency="GBP",
            include_in_total=True,
        )
    )

    session.add_all(
        [
            _tx("t_income", 3000.0, "income", now),
            _tx("t_grocery", -100.0, "Grocery", now),
            # Split parent: its own category and amount must be replaced by the
            # two split lines.
            _tx("t_split_parent", -60.0, "Shopping", now),
            # Transfer pair: neither side is income or spend.
            _tx("t_transfer_out", -500.0, "transfer", now, tx_type="transfer", transfer_pair_id="pair_1"),
            _tx("t_transfer_in", 500.0, "transfer", now, tx_type="transfer", transfer_pair_id="pair_1"),
            # Awaiting review: not counted in money totals.
            _tx("t_pending", -50.0, "Grocery", now, approval_status="pending"),
            # Older history still counts toward balance but not this month.
            _tx("t_last_year", 1000.0, "income", now - timedelta(days=400)),
        ]
    )
    session.add_all(
        [
            SplitTransaction(split_id="s_1", parent_transaction_id="t_split_parent", user_id=USER_ID, amount=40.0, category="Grocery"),
            SplitTransaction(split_id="s_2", parent_transaction_id="t_split_parent", user_id=USER_ID, amount=20.0, category="Household"),
        ]
    )
    await session.commit()


@pytest.fixture()
def dashboard_app():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with maker() as session:
            await _seed(session)

    asyncio.run(setup())

    app = FastAPI()
    app.state.db = maker
    app.include_router(build_router(), prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"user_id": USER_ID}
    return app, maker, engine


def test_overview_matches_effective_transaction_lines(dashboard_app):
    app, maker, engine = dashboard_app
    month_start = datetime.now(timezone.utc).replace(day=1)
    month_end = (month_start + timedelta(days=40)).replace(day=1) - timedelta(days=1)

    async def run():
        async with maker() as session:
            lines = await _effective_transaction_lines(session, USER_ID)
            # SQLite returns naive datetimes; the app stores UTC.
            for line in lines:
                if line["date"] and line["date"].tzinfo is None:
                    line["date"] = line["date"].replace(tzinfo=timezone.utc)
            in_month = [
                line["amount"]
                for line in lines
                if line["date"] >= month_start and line["date"] < month_end + timedelta(days=1)
            ]

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/dashboard/overview",
                params={
                    "date_from": month_start.date().isoformat(),
                    "date_to": month_end.date().isoformat(),
                },
            )
        return lines, in_month, response

    lines, in_month, response = asyncio.run(run())
    assert response.status_code == 200, response.text
    payload = response.json()

    expected_balance = round(sum(float(line["amount"]) for line in lines), 2)
    expected_income = round(sum(amount for amount in in_month if amount > 0), 2)
    expected_spend = round(sum(-amount for amount in in_month if amount < 0), 2)
    expected_categories = {}
    for line in lines:
        if line["date"] < month_start or line["date"] > month_end:
            continue
        if line["amount"] < 0:
            key = line["category"] or "uncategorized"
            expected_categories[key] = round(
                expected_categories.get(key, 0.0) - line["amount"], 2
            )

    assert payload["balance"] == expected_balance == 3840.0
    assert payload["income"] == expected_income == 3000.0
    assert payload["spend"] == expected_spend == 160.0
    assert {row["name"]: row["value"] for row in payload["categories"]} == expected_categories
    assert expected_categories == {"Grocery": 140.0, "Household": 20.0}

    # A transfer must not leak into the six-month flow either.
    flow = {row["month"]: row for row in payload["monthly_flow"]}
    current = flow[month_start.strftime("%Y-%m")]
    assert current["income"] == 3000.0
    assert current["spend"] == 160.0

    assert payload["needs_review_count"] == 1
    assert "t_income" in {row["transaction_id"] for row in payload["recent"]}

    asyncio.run(engine.dispose())
