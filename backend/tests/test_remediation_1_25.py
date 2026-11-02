"""Regression checks for audit fixes: deletion scope and category restore."""
import asyncio
import inspect
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy import func, select

from db import (
    BankAccount, Budget, Statement, Transaction, User,
    create_tables, dispose_engine, get_session_maker, init_engine,
)
from finance_engine import BulkUpdateIn, build_router as finance_router
from gdpr import build_router as gdpr_router


def route_by_path(router, path, method):
    return next(r.endpoint for r in router.routes if r.path == path and method in r.methods)


def test_gdpr_deletion_removes_user_owned_budgets_and_statements(tmp_path):
    async def scenario():
        init_engine(f"sqlite+aiosqlite:///{tmp_path / 'gdpr.db'}")
        try:
            await create_tables()
            sm = get_session_maker()
            async with sm() as session:
                session.add(User(user_id="erase-me", email="erase@example.com", hashed_password="test"))
                session.add(User(user_id="keep-me", email="keep@example.com", hashed_password="test"))
                session.add(Budget(budget_id="bud_erase", user_id="erase-me", category="grocery", amount=100, month="2026-11"))
                session.add(Budget(budget_id="bud_keep", user_id="keep-me", category="grocery", amount=100, month="2026-11"))
                session.add(Statement(user_id="erase-me", data={"transactions":[]}, status="draft"))
                await session.commit()
            handler = route_by_path(gdpr_router(), "/gdpr/data", "DELETE")
            result = await handler(None, {"user_id": "erase-me"})
            assert result["status"] == "anonymized"
            async with sm() as session:
                erased = (await session.execute(select(User).where(User.user_id == "erase-me"))).scalar_one()
                assert erased.disabled is True
                assert erased.google_sub is None
                assert erased.email.startswith("deleted-")
                remaining = (await session.execute(select(Budget))).scalars().all()
                assert [x.user_id for x in remaining] == ["keep-me"]
                assert (await session.execute(select(func.count()).select_from(Statement))).scalar_one() == 0
        finally:
            await dispose_engine()
    asyncio.run(scenario())


def test_bulk_category_undo_restores_distinct_originals(tmp_path):
    async def scenario():
        init_engine(f"sqlite+aiosqlite:///{tmp_path / 'category.db'}")
        try:
            await create_tables()
            sm = get_session_maker()
            async with sm() as session:
                session.add(User(user_id="cat-user", email="cat@example.com", hashed_password="test"))
                session.add(BankAccount(account_id="acct_cat", user_id="cat-user", name="Cash", type="cash", balance=0, currency="GBP", provider="manual", is_offline=True))
                session.add_all([
                    Transaction(transaction_id="tx_food", user_id="cat-user", account_id="acct_cat", amount=-10, date=datetime(2026,11,1,tzinfo=timezone.utc), category="grocery"),
                    Transaction(transaction_id="tx_travel", user_id="cat-user", account_id="acct_cat", amount=-5, date=datetime(2026,11,1,tzinfo=timezone.utc), category="transport"),
                ])
                await session.commit()
            router = finance_router()
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=sm)))
            apply = route_by_path(router, "/transactions/bulk-category", "POST")
            result = await apply(BulkUpdateIn(transaction_ids=["tx_food","tx_travel"], category="shopping"), request, {"user_id":"cat-user"})
            assert result["previous_categories"] == {"tx_food":"grocery","tx_travel":"transport"}
            restore = route_by_path(router, "/transactions/bulk-category-restore", "POST")
            restore_model = inspect.signature(restore).parameters["payload"].annotation
            restored = await restore(restore_model(categories=result["previous_categories"]), request, {"user_id":"cat-user"})
            assert restored["restored"] == 2
            async with sm() as session:
                original = (await session.execute(select(Transaction))).scalars().all()
                assert {x.transaction_id:x.category for x in original} == {"tx_food":"grocery","tx_travel":"transport"}
        finally:
            await dispose_engine()
    asyncio.run(scenario())
