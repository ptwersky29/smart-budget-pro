"""Focused runtime checks for API typing fixes (not just static analysis)."""

import asyncio
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest

import truelayer
from billing import _stripe_resource_id
from db import BankConnection


def test_stripe_expandable_resource_ids():
    assert _stripe_resource_id("sub_123") == "sub_123"
    assert _stripe_resource_id(SimpleNamespace(id="in_456")) == "in_456"
    assert _stripe_resource_id(None) is None
    assert _stripe_resource_id(SimpleNamespace(id=None)) is None


def test_truelayer_rate_limit_retry_exhaustion_raises(monkeypatch):
    """A persistently rate-limited bank API must never silently return None."""
    monkeypatch.setattr(truelayer, "MAX_RETRIES", 1)
    monkeypatch.setattr(truelayer, "_get_valid_token", AsyncMock(return_value="token"))
    monkeypatch.setattr(
        truelayer,
        "_tl_config_from_db",
        AsyncMock(return_value={"api_url": "https://bank.invalid"}),
    )
    monkeypatch.setattr(truelayer.asyncio, "sleep", AsyncMock())

    class RateLimitedClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, *args, **kwargs):
            return SimpleNamespace(status_code=429)

    monkeypatch.setattr(truelayer.httpx, "AsyncClient", lambda **kwargs: RateLimitedClient())
    conn = cast(BankConnection, SimpleNamespace(account_id="acct_1"))

    with pytest.raises(RuntimeError, match="exhausted retries"):
        asyncio.run(truelayer._tl_get(None, conn, "/data/v1/accounts"))


def test_truelayer_uses_existing_valid_access_token(monkeypatch):
    """A valid unexpired token is decrypted rather than refreshed."""
    from datetime import datetime, timedelta, timezone

    conn = cast(BankConnection, SimpleNamespace(
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        access_token="encrypted-token",
        refresh_token=None,
    ))

    # Decryption itself is synchronous.
    monkeypatch.setattr(truelayer, "_decrypt", lambda token: "plain-token")
    refresh = AsyncMock(side_effect=AssertionError("token was already valid"))
    monkeypatch.setattr(truelayer, "_refresh_access_token", refresh)
    assert asyncio.run(truelayer._get_valid_token(None, conn)) == "plain-token"
    refresh.assert_not_awaited()
