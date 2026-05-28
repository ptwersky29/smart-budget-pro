"""Error monitoring and performance middleware."""
import time
import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("monitor")

SLOW_REQUEST_MS = 1000


class ErrorMonitorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.exception("Unhandled error processing %s %s: %s", request.method, request.url.path, e)
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error. Our team has been notified."},
            )


class RequestTimerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        elapsed_ms = (time.time() - start) * 1000
        if elapsed_ms > SLOW_REQUEST_MS:
            logger.warning("SLOW_REQUEST: %s %s took %.0fms", request.method, request.url.path, elapsed_ms)
        response.headers["X-Response-Time-Ms"] = str(round(elapsed_ms, 1))
        return response
