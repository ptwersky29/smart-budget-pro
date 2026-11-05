"""Transaction composer integration checks: atomic multi-splits and paired transfers."""
import asyncio
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

os.environ.setdefault("JWT_SECRET", "local-only-jwt-secret-long-enough-for-tests")
from auth import get_current_user
from db import BankAccount, Base, Transaction, TransactionTransferPair, User
from finance_engine import build_router


@pytest.fixture
def composer():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with sessions() as session:
            session.add(User(user_id="test-user", email="composer@example.com", hashed_password="test"))
            session.add(BankAccount(user_id="test-user", account_id="a1", name="Current", balance=1000))
            session.add(BankAccount(user_id="test-user", account_id="a2", name="Savings", balance=500))
            await session.commit()

    asyncio.run(setup())
    app = FastAPI()
    app.state.db = sessions
    app.include_router(build_router(), prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "test-user"}
    yield TestClient(app), sessions
    asyncio.run(engine.dispose())


def test_three_and_four_category_splits_are_atomic(composer):
    client, sessions = composer
    payload = {
        "account_id": "a1", "amount": 125, "is_income": False,
        "description": "Mixed shopping", "date": "2026-11-05",
        "splits": [
            {"category": "groceries", "amount": 55},
            {"category": "household", "amount": 40},
            {"category": "transport", "amount": 30},
        ],
    }
    created = client.post("/api/transactions/split-create", json=payload)
    assert created.status_code == 200, created.text
    tx_id = created.json()["transaction_id"]
    lines = client.get(f"/api/transactions/{tx_id}/splits").json()["splits"]
    assert len(lines) == 3
    assert round(sum(line["amount"] for line in lines), 2) == 125

    # An invalid update cannot partly replace the existing allocations.
    invalid = client.put(f"/api/transactions/{tx_id}/split-composed", json={
        **payload, "splits": [{"category": "groceries", "amount": 1} for _ in range(3)],
    })
    assert invalid.status_code == 400
    assert len(client.get(f"/api/transactions/{tx_id}/splits").json()["splits"]) == 3

    updated = client.put(f"/api/transactions/{tx_id}/split-composed", json={
        **payload, "amount": 140,
        "splits": payload["splits"] + [{"category": "bills", "amount": 15}],
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["split_count"] == 4
    assert len(client.get(f"/api/transactions/{tx_id}/splits").json()["splits"]) == 4

    async def check():
        async with sessions() as session:
            account = (await session.execute(select(BankAccount).where(BankAccount.account_id == "a1"))).scalar_one()
            transactions = (await session.execute(select(Transaction).where(Transaction.user_id == "test-user"))).scalars().all()
            assert round(account.balance, 2) == 860
            assert len(transactions) == 1
    asyncio.run(check())


def test_transfer_creates_linked_entries_and_preserves_total_balance(composer):
    client, sessions = composer
    response = client.post("/api/transactions/transfer-create", json={
        "from_account_id": "a1", "to_account_id": "a2", "amount": 60.5,
        "date": "2026-11-05", "description": "Move to savings",
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["transactions"]) == 2
    assert sorted(tx["amount"] for tx in data["transactions"]) == [-60.5, 60.5]
    assert all(tx["transfer_pair_id"] == data["transfer_pair_id"] for tx in data["transactions"])

    async def check():
        async with sessions() as session:
            balances = (await session.execute(select(BankAccount).where(BankAccount.user_id == "test-user"))).scalars().all()
            assert round(sum(account.balance for account in balances), 2) == 1500
            assert sorted(round(account.balance, 2) for account in balances) == [560.5, 939.5]
            rows = (await session.execute(select(Transaction).where(Transaction.transfer_pair_id == data["transfer_pair_id"]))).scalars().all()
            assert len(rows) == 2
            assert all(row.exclude_from_maaser for row in rows)
            pairs = (await session.execute(select(TransactionTransferPair))).scalars().all()
            assert len(pairs) == 1
    asyncio.run(check())


def test_bad_split_and_same_account_transfer_do_not_change_balances(composer):
    client, sessions = composer
    bad_split = client.post("/api/transactions/split-create", json={
        "account_id": "a1", "amount": 20, "description": "Invalid split",
        "splits": [{"category": "groceries", "amount": 8}, {"category": "bills", "amount": 8}],
    })
    assert bad_split.status_code == 400
    bad_transfer = client.post("/api/transactions/transfer-create", json={
        "from_account_id": "a1", "to_account_id": "a1", "amount": 20,
    })
    assert bad_transfer.status_code == 400
    async def check():
        async with sessions() as session:
            accounts = (await session.execute(select(BankAccount))).scalars().all()
            txs = (await session.execute(select(Transaction))).scalars().all()
            assert sorted(account.balance for account in accounts) == [500, 1000]
            assert txs == []
    asyncio.run(check())
