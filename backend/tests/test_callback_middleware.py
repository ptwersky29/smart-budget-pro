import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from middleware import ErrorMonitorMiddleware
from middleware import connections_redirect_url
from middleware import is_truelayer_callback_path


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


def test_truelayer_callback_path_detection():
    assert is_truelayer_callback_path("/api/truelayer/callback")
    assert not is_truelayer_callback_path("/api/health")


def test_connections_redirect_url(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com/")
    assert connections_redirect_url("failed", "callback_error") == (
        "https://app.example.com/connections?status=failed&reason=callback_error"
    )


def test_error_monitor_redirects_callback_failures(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com/")
    middleware = ErrorMonitorMiddleware(app=lambda scope, receive, send: None)

    response = asyncio.run(
        middleware.dispatch(_Request("/api/truelayer/callback"), _raise_error)
    )

    assert response.status_code == 302
    assert response.headers["location"] == (
        "https://app.example.com/connections?status=failed&reason=callback_error"
    )


def test_error_monitor_keeps_json_for_other_failures():
    middleware = ErrorMonitorMiddleware(app=lambda scope, receive, send: None)

    response = asyncio.run(middleware.dispatch(_Request("/api/health"), _raise_error))

    assert response.status_code == 500
