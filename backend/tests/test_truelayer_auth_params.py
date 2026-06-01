from pathlib import Path
import os
import sys

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-truelayer-auth-params")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from truelayer import _build_auth_link_params


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
    assert params["providers"] == "uk-ob-all uk-oauth-all"
    assert params["country_id"] == "GB"
    assert params["user_email"] == "user@example.com"
    assert "provider_id" not in params


def test_build_auth_link_params_live():
    params = _build_auth_link_params(
        {"client_id": "client_123"},
        env="live",
        redirect_uri="https://example.com/api/truelayer/callback",
        state="state123",
        nonce="nonce123",
        user_email="user@example.com",
    )

    assert params["providers"] == "uk-ob-all uk-oauth-all"
    assert "country_id" not in params
    assert "user_email" not in params
    assert "provider_id" not in params
