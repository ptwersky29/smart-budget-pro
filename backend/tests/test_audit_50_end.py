"""Security and financial workflow regressions for audit items 51–66."""
import asyncio
import hashlib
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import select

from billing import _validated_checkout_origin
from db import (
    BankAccount, SplitTransaction, Transaction, User,
    create_tables, dispose_engine, get_session_maker, init_engine,
)
from finance_engine import (
    CreateSplitTransactionIn, CreatePairedTransferIn, TransactionIn,
    build_router as finance_router,
)
from security import _derive_encryption_key, decrypt_value, encrypt_value


def _route(path):
    return next(r.endpoint for r in finance_router().routes if r.path == path and "POST" in r.methods)


def test_encryption_survives_jwt_rotation_and_reads_legacy(monkeypatch):
    old_jwt = "old-jwt-secret-1234567890-keep-legacy!!"
    new_jwt = "new-jwt-secret-1234567890-rotate-now!!"
    data_key = "durable-encryption-key-123456789012345678901"
    monkeypatch.setenv("JWT_SECRET", old_jwt)
    monkeypatch.setenv("ENCRYPTION_KEY", data_key)
    monkeypatch.setenv("FRONTEND_URL", "https://old.example")
    legacy_salt = hashlib.sha256(b"https://old.example").digest()[:16]
    legacy = Fernet(_derive_encryption_key(old_jwt, legacy_salt)).encrypt(b"bank-secret").decode()
    updated = encrypt_value("new-bank-secret")
    assert updated.startswith("v2:")
    assert decrypt_value(legacy) == "bank-secret"
    monkeypatch.setenv("JWT_SECRET", new_jwt)
    monkeypatch.setenv("FRONTEND_URL", "https://new.example")
    monkeypatch.setenv("ENCRYPTION_PREVIOUS_KEYS", old_jwt)
    monkeypatch.setenv("ENCRYPTION_LEGACY_FRONTEND_URLS", "https://old.example")
    assert decrypt_value(legacy) == "bank-secret"
    assert decrypt_value(updated) == "new-bank-secret"
    with pytest.raises(ValueError):
        decrypt_value("v2:invalid-ciphertext")


def test_billing_only_returns_to_configured_origin(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://penni.leafaccounts.co.uk")
    monkeypatch.delenv("BILLING_ALLOWED_ORIGINS", raising=False)
    assert _validated_checkout_origin("https://penni.leafaccounts.co.uk/") == "https://penni.leafaccounts.co.uk"
    for origin in (
        "https://scam.example", "http://penni.leafaccounts.co.uk",
        "https://penni.leafaccounts.co.uk.evil.test",
        "https://penni.leafaccounts.co.uk@evil.test",
        "https://penni.leafaccounts.co.uk/redirect?next=https://evil.test",
    ):
        with pytest.raises(HTTPException) as exc:
            _validated_checkout_origin(origin)
        assert exc.value.status_code == 400


def test_split_creation_is_atomic_and_validated(tmp_path):
    async def scenario():
        init_engine(f"sqlite+aiosqlite:///{tmp_path / 'split.db'}")
        try:
            await create_tables()
            sm = get_session_maker()
            async with sm() as session:
                session.add(User(user_id="u1", email="split@example.com", hashed_password="test"))
                session.add(BankAccount(account_id="acct1", user_id="u1", name="Cash", type="cash",
                                        provider="manual", is_offline=True, currency="GBP", balance=100))
                await session.commit()
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=sm)))
            transaction = TransactionIn(account_id="acct1", description="Shopping", amount=20,
                                        is_income=False, date="2026-11-01")
            create = _route("/transactions/create-with-splits")
            with pytest.raises(HTTPException) as exc:
                await create(CreateSplitTransactionIn(transaction=transaction, splits=[
                    {"amount": 5, "category": "grocery"},
                    {"amount": 8, "category": "clothing"},
                ]), request, {"user_id": "u1"})
            assert exc.value.status_code == 400
            async with sm() as session:
                assert not (await session.execute(select(Transaction))).scalars().all()
            result = await create(CreateSplitTransactionIn(transaction=transaction, splits=[
                {"amount": 12, "category": "grocery"},
                {"amount": 8, "category": "clothing"},
            ]), request, {"user_id": "u1"})
            assert result["transaction_id"]
            async with sm() as session:
                rows = (await session.execute(select(SplitTransaction))).scalars().all()
                assert len(rows) == 2
                acct = (await session.execute(select(BankAccount))).scalar_one()
                assert round(float(acct.balance), 2) == 80.00
        finally:
            await dispose_engine()
    asyncio.run(scenario())


def test_transfer_pair_requires_match_before_creating_transaction(tmp_path):
    async def scenario():
        init_engine(f"sqlite+aiosqlite:///{tmp_path / 'pair.db'}")
        try:
            await create_tables()
            sm = get_session_maker()
            async with sm() as session:
                session.add(User(user_id="u1", email="pair@example.com", hashed_password="test"))
                session.add_all([
                    BankAccount(account_id="acct1", user_id="u1", name="Current", type="current",
                                provider="manual", is_offline=True, currency="GBP", balance=100),
                    BankAccount(account_id="acct2", user_id="u1", name="Savings", type="savings",
                                provider="manual", is_offline=True, currency="GBP", balance=50),
                ])
                session.add(Transaction(transaction_id="existing", user_id="u1", account_id="acct2",
                    description="Transfer receipt", amount=20, date=datetime(2026,11,1,tzinfo=timezone.utc)))
                await session.commit()
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=sm)))
            create = _route("/transactions/create-and-pair")
            bad = TransactionIn(account_id="acct1", description="Transfer out", amount=10,
                                is_income=False, date="2026-11-01", is_transfer=True)
            with pytest.raises(HTTPException):
                await create(CreatePairedTransferIn(transaction=bad, counterparty_transaction_id="existing"),
                             request, {"user_id":"u1"})
            async with sm() as session:
                assert len((await session.execute(select(Transaction))).scalars().all()) == 1
            good = bad.model_copy(update={"amount":20})
            result = await create(CreatePairedTransferIn(transaction=good, counterparty_transaction_id="existing"),
                                  request, {"user_id":"u1"})
            async with sm() as session:
                txs = (await session.execute(select(Transaction))).scalars().all()
                assert len(txs) == 2
                assert all(tx.transfer_pair_id == result["transfer_pair_id"] for tx in txs)
                assert all(tx.exclude_from_maaser for tx in txs)
        finally:
            await dispose_engine()
    asyncio.run(scenario())
