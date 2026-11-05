import asyncio
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import cast

from fastapi import Request
from starlette.responses import Response

os.environ.setdefault("JWT_SECRET", "ship_readiness_test_secret_value_32_chars_minimum")

from auth import _token_issued_before_password_change
from db import User
from rate_limit import CsrfProtectionMiddleware, RateLimiter, RateLimitMiddleware


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


async def _ok(_request: Request) -> Response:
    return Response(status_code=200)


async def _noop_asgi(scope, receive, send) -> None:
    """Valid ASGI application stub; the middleware handles the response."""
    return None


def test_rate_limit_returns_traceable_json_error():
    request = _Request()
    middleware = RateLimitMiddleware(app=_noop_asgi, limiter=RateLimiter(limit=0, window=60))

    response = asyncio.run(middleware.dispatch(cast(Request, request), _ok))

    assert response.status_code == 429
    assert b"rate_limited" in response.body
    assert b"request_id" in response.body


def test_csrf_returns_traceable_json_error():
    request = _Request()
    middleware = CsrfProtectionMiddleware(app=_noop_asgi)

    response = asyncio.run(middleware.dispatch(cast(Request, request), _ok))

    assert response.status_code == 403
    assert b"csrf_missing" in response.body
    assert b"request_id" in response.body


def test_tokens_before_password_change_are_rejected():
    changed_at = datetime.now(timezone.utc)
    user = cast(User, SimpleNamespace(password_changed_at=changed_at))
    old_payload = {"iat": int((changed_at - timedelta(minutes=5)).timestamp())}
    fresh_payload = {"iat": int((changed_at + timedelta(minutes=5)).timestamp())}

    assert _token_issued_before_password_change(old_payload, user)
    assert not _token_issued_before_password_change(fresh_payload, user)
