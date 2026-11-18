"""Error monitoring, request ID, and performance middleware."""
import logging
import os
import time
import uuid
from urllib.parse import urlencode

from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

logger = logging.getLogger("monitor")

SLOW_REQUEST_MS = 1000
DEFAULT_FRONTEND_URL = "https://smart-budget-pro-ewtm.vercel.app"


def frontend_base_url() -> str:
    frontend = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
    return frontend or DEFAULT_FRONTEND_URL


def connections_redirect_url(status: str, reason: str | None = None) -> str:
    params = {"status": status}
    if reason:
        params["reason"] = reason
    return f"{frontend_base_url()}/accounts?{urlencode(params)}"


def is_truelayer_callback_path(path: str) -> bool:
    return path == "/api/truelayer/callback"


def _security_headers() -> dict[str, str]:
    return {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Cross-Origin-Resource-Policy": "same-origin",
    }


class RequestContextMiddleware:
    """One pure-ASGI pass for request ID, timing and security headers.

    Replaces four ``BaseHTTPMiddleware`` wrappers. It also catches unhandled
    errors after the application's own exception handlers have run, so a crash
    in another middleware still produces the standard JSON payload.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = StarletteRequest(scope)
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        state = scope.setdefault("state", {})
        state["request_id"] = rid
        start = time.perf_counter()
        response_started = False
        status_code = 500

        async def send_with_headers(message):
            nonlocal response_started, status_code
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                elapsed_ms = (time.perf_counter() - start) * 1000
                headers["X-Request-Id"] = rid
                headers["X-Response-Time-Ms"] = str(round(elapsed_ms, 1))
                for key, value in _security_headers().items():
                    headers[key] = value
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        except Exception as exc:  # noqa: BLE001 — last-resort handler
            logger.exception(
                "RID=%s Unhandled error %s %s: %s",
                rid,
                request.method,
                request.url.path,
                exc,
            )
            if response_started:
                raise
            if is_truelayer_callback_path(request.url.path):
                response = RedirectResponse(
                    connections_redirect_url("failed", "callback_error"),
                    status_code=302,
                )
            else:
                response = JSONResponse(
                    status_code=500,
                    content={
                        "detail": "Internal server error. Our team has been notified.",
                        "request_id": rid,
                    },
                )
            await response(scope, receive, send_with_headers)
            return

        elapsed_ms = (time.perf_counter() - start) * 1000
        if elapsed_ms > SLOW_REQUEST_MS:
            logger.warning(
                "RID=%s SLOW_REQUEST: %s %s took %.0fms (status=%s)",
                rid,
                request.method,
                request.url.path,
                elapsed_ms,
                status_code,
            )


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:16]
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response


class ErrorMonitorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            rid = getattr(request.state, "request_id", "?")
            logger.exception("RID=%s Unhandled error %s %s: %s", rid, request.method, request.url.path, e)
            if is_truelayer_callback_path(request.url.path):
                return RedirectResponse(
                    connections_redirect_url("failed", "callback_error"),
                    status_code=302,
                )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error. Our team has been notified.", "request_id": rid},
            )


class RequestTimerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        elapsed_ms = (time.time() - start) * 1000
        rid = getattr(request.state, "request_id", "?")
        if elapsed_ms > SLOW_REQUEST_MS:
            logger.warning("RID=%s SLOW_REQUEST: %s %s took %.0fms", rid, request.method, request.url.path, elapsed_ms)
        response.headers["X-Response-Time-Ms"] = str(round(elapsed_ms, 1))
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        return response
