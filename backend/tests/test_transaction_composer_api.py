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
from db import Base, BankAccount, Transaction, TransactionTransferPair, User
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
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "test-user¶»§q«^