"""Focused regression tests for Week 1 security hardening."""

import asyncio
import base64
import hashlib
import hmac
import os
import sys
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("JWT_SECRET", "week1-security-test-secret-value-32-chars")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import datetime, timezone
from db import User
from rate_limit import CsrfProtectionMiddleware
from sms import (
    _OTP_MAX_ATTEMPTS,
    _hash_otp,
    _otp_config_key,
    _otp_config_value,
    _parse_otp_config,
    _twilio_signature,
)
from tyl import _allowed_origins, _tyl_approved, _verify_response_hash


def _tyl_hash(data: dict, secret: str) -> str:
    pairs = sorted(
        (key, str(value))
        for key, value in data.items()
        if value not in (None, "") and key != "extended_response_hash"
    )
    payload = "|".join(value for _, value in pairs)
    digest = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def test_tyl_hash_requires_and_validates_signature():
    secret = "tyl-test-secret"
    data = {
        "status": "APPROVED",
        "approval_code": "Y:123",
        "merchantTransactionId": "sess_1",
    }
    assert not _verify_response_hash(data, secret)

    data["extended_response_hash"] = _tyl_hash(data, secret)
    assert _verify_response_hash(data, secret)

    data["approval_code"] = "Y:999"
    assert not _verify_response_hash(data, secret)


def test_tyl_waiting_or_unsigned_response_is_not_approved():
    assert not _tyl_approved(True, "Y:123", "WAITING")
    assert not _tyl_approved(True, "Y:123", "PENDING")
    assert not _tyl_approved(False, "Y:123", "APPROVED")
    assert _tyl_approved(True, "Y:123", "")
    assert _tyl_approved(True, "", "APPROVED")


def test_tyl_allowed_origins_are_exact(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com/")
    monkeypatch.setenv(
        "CORS_EXTRA_ORIGINS",
        "https://preview.example.com/, https://staging.example.com",
    )
    origins = _allowed_origins()
    assert "https://app.example.com" in origins
    assert "https://preview.example.com" in origins
    assert "https://staging.example.com" in origins
    assert "https://app.example.com.evil.test" not in origins


def test_twilio_signature_uses_sorted_form_fields():
    token = "twilio-test-token"
    url = "https://api.example.com/api/sms/webhook"
    params = {"To": "+15550002", "Body": "Tesco 10", "From": "+15550001"}
    expected_payload = url + "".join(f"{key}{params[key]}" for key in sorted(params))
    expected = base64.b64encode(
        hmac.new(token.encode(), expected_payload.encode(), hashlib.sha1).digest()
    ).decode()

    assert _twilio_signature(url, params, token) == expected
    assert (
        _twilio_signature(url, dict(reversed(list(params.items()))), token) == expected
    )


def test_otp_helpers_are_deterministic_and_peppered():
    secret = "otp-test-secret"
    expected = hmac.new(secret.encode(), b"123456", hashlib.sha256).hexdigest()
    assert _otp_config_key(7) == "sms_otp:7"
    assert _hash_otp("123456", secret) == expected
    assert _hash_otp("123456") == _hash_otp("123456")
    assert _hash_otp("123456") != _hash_otp("654321")


def test_otp_config_parses_attempts_and_legacy_values():
    expires_at = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)
    assert _parse_otp_config(_otp_config_value("hash", expires_at, 3)) == (
        "hash",
        expires_at,
        3,
    )
    assert _parse_otp_config(f"hash|{expires_at.isoformat()}") == (
        "hash",
        expires_at,
        0,
    )
    assert _parse_otp_config("") is None
    assert _parse_otp_config("hash|not-a-date") is None
    assert _OTP_MAX_ATTEMPTS == 5


def test_new_users_default_to_free_tier():
    assert User.__table__.c.tier.default.arg == "free"


class _Client:
    host = "127.0.0.1"


class _Request:
    def __init__(self, path, headers=None, cookies=None):
        self.method = "POST"
        self.client = _Client()
        self.url = SimpleNamespace(path=path)
        self.headers = headers or {}
        self.cookies = cookies or {}
        self.state = SimpleNamespace()


async def _ok(_request):
    return SimpleNamespace(status_code=200, headers={})


def _csrf(path, headers=None):
    middleware = CsrfProtectionMiddleware(app=lambda scope, receive, send: None)
    return asyncio.run(middleware.dispatch(_Request(path, headers=headers), _ok))


def test_csrf_exact_auth_path_is_exempt():
    assert _csrf("/api/auth/login").status_code == 200
    assert _csrf("/api/auth/verify-email").status_code == 200


def test_csrf_auth_path_prefix_lookalike_is_not_exempt():
    assert _csrf("/api/auth/login/anything").status_code == 403


def test_csrf_bearer_requests_are_exempt():
    assert (
        _csrf("/api/transactions", {"Authorization": "Bearer token"}).status_code == 200
    )
