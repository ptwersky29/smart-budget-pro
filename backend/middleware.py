"""Error monitoring, request ID, and performance middleware."""
import os
import time
import uuid
import logging
from urllib.parse import urlencode
from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("monitor")

SLOW_REQUEST_MS = 1000
DEFAULT_FRONTEND_URL = "https://smart-budget-pro-ewtm.vercel.app"


def frontend_base_url() -> str:
    frontend = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
    return frontend or DEFAULT_FRONTEND_URL


def connections_redirect_url(status: str, reason: str = None) -> str:
    params = {"status": status}
    if reason:
        params["reason"] = reason
    return f"{frontend_base_url()}/connections?{urlencode(params)}"


def is_truelayer_callback_path(path: str) -> bool:
    return path == "/api/truelayer/callback"


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
