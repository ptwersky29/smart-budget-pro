"""In-memory rate limiter using a sliding window per user/IP."""
import time
import logging
from collections import defaultdict
from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("rate_limit")

DEFAULT_LIMIT = 60
DEFAULT_WINDOW = 60


class RateLimiter:
    def __init__(self, limit: int = DEFAULT_LIMIT, window: int = DEFAULT_WINDOW):
        self.limit = limit
        self.window = window
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def _key(self, request: Request) -> str:
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user:{user_id}"
        ip = request.client.host if request.client else "unknown"
        return f"ip:{ip}"

    def check(self, request: Request) -> bool:
        key = self._key(request)
        now = time.time()
        bucket = self._buckets[key]
        cutoff = now - self.window
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limiter: RateLimiter):
        super().__init__(app)
        self.limiter = limiter

    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/api/health", "/api/"):
            return await call_next(request)
        if not self.limiter.check(request):
            logger.warning("Rate limit exceeded for %s", self.limiter._key(request))
            raise HTTPException(429, "Too many requests. Please slow down.")
        return await call_next(request)
