from pathlib import Path
import os
import sys

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-truelayer-auth-params")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from truelayer import _build_auth_link_params
from truelayer import _normalize_accounts_payload
from truelayer import _token_value


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
