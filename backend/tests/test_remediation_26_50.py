"""Source-level regression tests for audit issues 26–50."""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from sqlalchemy import select

from auth import build_router as auth_router
from db import (
    BankAccount,
    Statement,
    Transaction,
    User,
    create_tables,
    dispose_engine,
    get_session_maker,
    init_engine,
)
from finance_engine import TransferPairIn
from finance_engine import build_router as finance_router
from statements import build_router as statement_router


def route(router, path, method):
    return next(r.endpoint for r in router.routes if isinstance(r, APIRoute) and r.path == path and method in r.methods)


def test_auth_debug_token_endpoint_is_not_public():
    routes = {(r.path, tuple(r.methods)) for r in auth_router().routes if isinstance(r, APIRoute)}
    assert not any(path == "/auth/debug-cookies" for path, _ in routes)


def test_transfer_pair_rejects_mismatched_amounts(tmp_path):
    async def scenario():
        init_engine(f"sqlite+aiosqlite:///{tmp_path / 'pair.db'}")
        try:
            await create_tables()
            sm = get_session_maker()
            async with sm() as session:
                session.add(User(user_id="u1", email="pair@example.com", hashed_password="test"))
                session.add_all([
                    BankAccount(account_id="acct_1", user_id="u1", name="Current", type="current",
                                balance=0, currency="GBP", provider="manual", is_offline=True),
                    BankAccount(account_id="acct_2", user_id="u1", name="Savings", type="savings",
                                balance=0, currency="GBP", provider="manual", is_offline=True),
                ])
                session.add_all([
                    Transaction(transaction_id="transfer_out", user_id="u1", account_id="acct_1",
                                amount=-50, date=datetime(2026,11,1,tzinfo=timezone.utc), description="Transfer out"),
                    Transaction(transaction_id="transfer_in", user_id="u1", account_id="acct_2",
                                amount=40, date=datetime(2026,11,1,tzinfo=timezone.utc), description="Transfer in"),
                ])
                await session.commit()
            handler = route(finance_router(), "/transactions/transfer-pairs", "POST")
            req = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=sm)))
            with pytest.raises(HTTPException) as error:
                await handler(TransferPairIn(outgoing_transaction_id="transfer_out",
                    incoming_transaction_id="transfer_in"), req, {"user_id":"u1"})
            assert error.value.status_code == 400
            assert "amounts must be equal" in str(error.value.detail)
            async with sm() as session:
                rows = (await session.execute(select(Transaction))).scalars().all()
                assert all(tx.transfer_pair_id is None for tx in rows)
        finally:
            await dispose_engine()
    asyncio.run(scenario())


def test_reimport_requires_explicit_duplicate_review(tmp_path):
    async def scenario():
        init_engine(f"sqlite+aiosqlite:///{tmp_path / 'statement.db'}")
        try:
            await create_tables()
            sm = get_session_maker()
            async with sm() as session:
                session.add(User(user_id="u2", email="statement@example.com", hashed_password="test"))
                session.add(BankAccount(account_id="acct_statement", user_id="u2",
                    name="Current", type="current", balance=100, currency="GBP",
                    provider="manual", is_offline=True))
                session.add(Transaction(transaction_id="existing_tx", user_id="u2",
                    account_id="acct_statement", amount=-9.95, description="Coffee Shop",
                    date=datetime(2026,10,20,tzinfo=timezone.utc), source="truelayer"))
                statement = Statement(user_id="u2", account_id="acct_statement", currency="GBP",
                    status="draft", data={"transactions":[{
                        "date":"2026-10-20", "amount":-9.95, "description":"  COFFEE shop ",
                        "category":"takeaway"
                    }]})
                session.add(statement)
                await session.commit()
                statement_id = statement.id
            save = route(statement_router(), "/statements/{statement_id}/save", "POST")
            req = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=sm)))
            with pytest.raises(HTTPException) as error:
                await save(f"stmt_{statement_id}", req, account_id="acct_statement",
                           transactions_json=None, allow_duplicates=False, user={"user_id":"u2"})
            assert error.value.status_code == 409
            detail = cast(dict[str, object], error.value.detail)
            assert detail["code"] == "duplicate_statement_transactions"
            async with sm() as session:
                txs = (await session.execute(select(Transaction))).scalars().all()
                assert len(txs) == 1
                record = (await session.execute(select(Statement))).scalar_one()
                assert record.status == "draft"
        finally:
            await dispose_engine()
    asyncio.run(scenario())
