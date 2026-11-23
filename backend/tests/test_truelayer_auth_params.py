import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import cast

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-truelayer-auth-params")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db import BankConnection
from truelayer import (
    _build_auth_link_params,
    _connections_url,
    _frontend_base_url,
    _normalize_accounts_payload,
    _sync_from_date,
    _token_value,
)


def test_build_auth_link_params_sandbox():
    params = _build_auth_link_params(
        {"client_id": "client_123"},
        env="sandbox",
        redirect_uri="https://example.com/api/truelayer/callback",
        state="state123",
        nonce="nonce123",
        user_email="user@example.com",
    )

    assert params["client_id"] == "client_123"
    assert params["redirect_uri"] == "https://example.com/api/truelayer/callback"
    assert params["providers"] == "uk-cs-mock"
    assert params["user_email"] == "user@example.com"
    assert "provider_id" not in params
    assert "country_id" not in params


def test_build_auth_link_params_live():
    params = _build_auth_link_params(
        {"client_id": "client_123"},
        env="live",
        redirect_uri="https://example.com/api/truelayer/callback",
        state="state123",
        nonce="nonce123",
        user_email="user@example.com",
    )

    assert "providers" not in params
    assert "user_email" not in params
    assert "provider_id" not in params
    assert "country_id" not in params


def test_token_value_normalizes_none():
    assert _token_value(None) == ""
    assert _token_value("") == ""
    assert _token_value("abc") == "abc"


def test_normalize_accounts_payload():
    assert _normalize_accounts_payload([]) == []
    assert _normalize_accounts_payload({"results": []}) == []
    payload = {"results": [{"account_id": "acc_1", "provider": None}, "ignore-me", 123]}
    normalized = _normalize_accounts_payload(payload)
    assert normalized == [{"account_id": "acc_1", "provider": None}]
    assert _normalize_accounts_payload({"results": {"account_id": "acc_2"}}) == [{"account_id": "acc_2"}]


def test_connections_url():
    assert _connections_url("https://app.example.com", "success", accounts=2) == (
        "https://app.example.com/accounts?status=success&accounts=2"
    )
    assert _connections_url("https://app.example.com/", "failed", reason="callback_error") == (
        "https://app.example.com/accounts?status=failed&reason=callback_error"
    )


def test_frontend_base_url_defaults(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    assert _frontend_base_url() == "https://smart-budget-pro-ewtm.vercel.app"


def test_frontend_base_url_env(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com/")
    assert _frontend_base_url() == "https://app.example.com"



def test_sync_from_date_uses_import_start_for_first_sync():
    conn = cast(
        BankConnection,
        SimpleNamespace(import_start_date=date(2026, 1, 1), last_sync_at=None),
    )
    assert _sync_from_date(conn) == "2026-01-01T00:00:00Z"


def test_sync_from_date_uses_seven_day_overlap_after_successful_sync():
    conn = cast(
        BankConnection,
        SimpleNamespace(
            import_start_date=date(2026, 1, 1),
            last_sync_at=datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc),
        ),
    )
    assert _sync_from_date(conn) == "2026-11-16T00:00:00Z"


def test_sync_from_date_never_moves_before_user_import_start():
    conn = cast(
        BankConnection,
        SimpleNamespace(
            import_start_date=date(2026, 11, 20),
            last_sync_at=datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc),
        ),
    )
    assert _sync_from_date(conn) == "2026-11-20T00:00:00Z"


def test_sync_from_date_handles_legacy_naive_timestamps():
    conn = cast(
        BankConnection,
        SimpleNamespace(
            import_start_date=None,
            last_sync_at=datetime(2026, 11, 23, 12, 0),
        ),
    )
    assert _sync_from_date(conn) == "2026-11-16T00:00:00Z"
