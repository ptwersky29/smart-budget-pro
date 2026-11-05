import asyncio
import sys
from pathlib import Path
from typing import cast

from fastapi import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from middleware import (
    ErrorMonitorMiddleware,
    connections_redirect_url,
    is_truelayer_callback_path,
)


class _State:
    request_id = "test-request-id"


class _Url:
    def __init__(self, path: str):
        self.path = path


class _Request:
    method = "GET"
    state = _State()

    def __init__(self, path: str):
        self.url = _Url(path)


async def _raise_error(_request):
    raise RuntimeError("boom")


async def _noop_asgi(scope, receive, send):
    """Valid no-op ASGI application for middleware unit tests."""
    return None


def test_truelayer_callback_path_detection():
    assert is_truelayer_callback_path("/api/truelayer/callback")
    assert not is_truelayer_callback_path("/api/health")


def test_connections_redirect_url(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com/")
    assert connections_redirect_url("failed", "callback_error") == (
        "https://app.example.com/accounts?status=failed&reason=callback_error"
    )


def test_error_monitor_redirects_callback_failures(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com/")
    middleware = ErrorMonitorMiddleware(app=_noop_asgi)

    response = asyncio.run(
        middleware.dispatch(cast(Request, _Request("/api/truelayer/callback")), _raise_error)
    )

    assert response.status_code == 302
    assert response.headers["location"] == (
        "https://app.example.com/accounts?status=failed&reason=callback_error"
    )


def test_error_monitor_keeps_json_for_other_failures():
    middleware = ErrorMonitorMiddleware(app=_noop_asgi)

    response = asyncio.run(middleware.dispatch(cast(Request, _Request("/api/health")), _raise_error))

    assert response.status_code == 500
