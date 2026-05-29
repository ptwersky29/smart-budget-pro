"""Error monitoring, request ID, and performance middleware."""
import time
import uuid
import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("monitor")

SLOW_REQUEST_MS = 1000


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
        return response
