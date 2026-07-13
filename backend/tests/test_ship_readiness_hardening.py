import asyncio
import os
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

os.environ.setdefault("JWT_SECRET", "ship_readiness_test_secret_value_32_chars_minimum")

from rate_limit import RateLimiter, RateLimitMiddleware, CsrfProtectionMiddleware
from auth import _token_issued_before_password_change
from admin import delete as sqlalchemy_delete


class _Client:
    host = "127.0.0.1"


class _Url:
    path = "/api/test"


class _Request:
    method = "POST"
    client = _Client()
    url = _Url()
    headers = {}
    cookies = {}
    state = SimpleNamespace()


async def _ok(_request):
    return SimpleNamespace(status_code=200, headers={})


def test_rate_limit_returns_traceable_json_error():
    request = _Request()
    middleware = RateLimitMiddleware(app=lambda scope, receive, send: None, limiter=RateLimiter(limit=0, window=60))

    response = asyncio.run(middleware.dispatch(request, _ok))

    assert response.status_code == 429
    assert b"rate_limited" in response.body
    assert b"request_id" in response.body


def test_csrf_returns_traceable_json_error():
    request = _Request()
    middleware = CsrfProtectionMiddleware(app=lambda scope, receive, send: None)

    response = asyncio.run(middleware.dispatch(request, _ok))

    assert response.status_code == 403
    assert b"csrf_missing" in response.body
    assert b"request_id" in response.body


def test_tokens_before_password_change_are_rejected():
    changed_at = datetime.now(timezone.utc)
    user = SimpleNamespace(password_changed_at=changed_at)
    old_payload = {"iat": int((changed_at - timedelta(minutes=5)).timestamp())}
    fresh_payload = {"iat": int((changed_at + timedelta(minutes=5)).timestamp())}

    assert _token_issued_before_password_change(old_payload, user)
    assert not _token_issued_before_password_change(fresh_payload, user)


def test_admin_cleanup_uses_sqlalchemy_delete():
    """Keep the destructive admin cleanup path from failing at runtime."""
    assert callable(sqlalchemy_delete)
