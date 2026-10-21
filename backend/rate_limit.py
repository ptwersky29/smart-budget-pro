"""Rate limiter with optional Redis backing, plus CSRF middleware."""
import os
import time
import logging
import uuid
from collections import defaultdict, deque
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("rate_limit")

DEFAULT_LIMIT = 120
DEFAULT_WINDOW = 60
CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
CSRF_SAFE_PATHS = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/verify-email",
    "/api/auth/emergent-session",
}

# Stricter limits for sensitive endpoints
AUTH_LIMIT = 20
AUTH_WINDOW = 300  # 5 minutes
AUTH_RATE_LIMIT_PATHS = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/sms/register-sender",
    "/api/sms/verify-sender",
}


def _request_id(request: Request) -> str:
    rid = getattr(request.state, "request_id", None) or request.headers.get("X-Request-Id")
    if not rid:
        rid = uuid.uuid4().hex[:16]
        request.state.request_id = rid
    return rid


def _error(detail: str, status_code: int, code: str, request: Request) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "code": code, "request_id": _request_id(request)},
    )


class RateLimiter:
    def __init__(
        self,
        limit: int = DEFAULT_LIMIT,
        window: int = DEFAULT_WINDOW,
        redis_client=None,
        redis_url: str | None = None,
    ):
        self.limit = limit
        self.window = window
        self._buckets: dict[str, deque] = defaultdict(deque)
        self._redis = redis_client
        self._redis_url = (
            redis_url if redis_url is not None else os.environ.get("REDIS_URL", "")
        ).strip()

    def _key(self, request: Request) -> str:
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user:{user_id}:{request.url.path}"
        ip = request.client.host if request.client else "unknown"
        return f"ip:{ip}:{request.url.path}"

    def _get_redis(self):
        if self._redis is not None:
            return self._redis
        if not self._redis_url:
            return None
        try:
            from redis.asyncio import from_url

            self._redis = from_url(
                self._redis_url,
                decode_responses=True,
                socket_connect_timeout=1.0,
                socket_timeout=1.0,
            )
        except Exception as exc:
            logger.error(
                "Redis rate limiter configuration failed (%s); using in-memory fallback",
                type(exc).__name__,
            )
            self._redis = None
            self._redis_url = ""
            return None
        return self._redis

    def _check_memory(self, key: str) -> bool:
        now = time.time()
        bucket = self._buckets[key]
        cutoff = now - self.window
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True

    async def _check_redis(self, client, key: str) -> bool:
        bucket = f"ratelimit:{key}:{int(time.time()) // self.window}"
        count = await client.incr(bucket)
        await client.expire(bucket, self.window + 1)
        return count <= self.limit

    async def check(self, request: Request) -> bool:
        key = self._key(request)
        client = self._get_redis()
        if client is not None:
            try:
                return await self._check_redis(client, key)
            except Exception as exc:
                logger.error(
                    "Redis rate limiter unavailable (%s); using in-memory fallback",
                    type(exc).__name__,
                )
                self._redis = None
                self._redis_url = ""
        return self._check_memory(key)


class AuthRateLimiter(RateLimiter):
    """Stricter rate limiter for auth endpoints (login, forgot-password, reset-password)."""
    def __init__(self):
        super().__init__(limit=AUTH_LIMIT, window=AUTH_WINDOW)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limiter: RateLimiter):
        super().__init__(app)
        self.limiter = limiter
        self.auth_limiter = AuthRateLimiter()

    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/api/health", "/api/"):
            return await call_next(request)
        # Sensitive auth endpoints get stricter rate limiting
        limiter = self.auth_limiter if request.url.path in AUTH_RATE_LIMIT_PATHS else self.limiter
        if not await limiter.check(request):
            logger.warning("Rate limit exceeded for %s", limiter._key(request))
            return _error("Too many requests. Please slow down.", 429, "rate_limited", request)
        return await call_next(request)


class CsrfProtectionMiddleware(BaseHTTPMiddleware):
    """CSRF protection for cookie-authenticated state-changing requests.

    Requires GET /api/csrf-token to return a CSRF token that is then
    sent as X-CSRF-Token header on POST/PUT/PATCH/DELETE requests.
    Skips CSRF for API-key or Bearer-token authenticated requests.
    """

    async def dispatch(self, request: Request, call_next):
        if request.method in CSRF_SAFE_METHODS:
            return await call_next(request)
        # Auth-flow endpoints skip CSRF (no cookie session yet)
        if request.url.path in CSRF_SAFE_PATHS:
            return await call_next(request)
        # Check if request uses Bearer token (API clients skip CSRF)
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return await call_next(request)
        # CSRF check for cookie-authenticated requests
        csrf_header = request.headers.get("X-CSRF-Token", "")
        csrf_cookie = request.cookies.get("csrf_token", "")
        if not csrf_header or not csrf_cookie:
            return _error("CSRF token missing", 403, "csrf_missing", request)
        from security import verify_csrf_token as _verify
        if not _verify(csrf_header, csrf_cookie):
            return _error("CSRF token mismatch", 403, "csrf_mismatch", request)
        return await call_next(request)
