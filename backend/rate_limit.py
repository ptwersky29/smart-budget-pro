"""In-memory rate limiter using a sliding window per user/IP + CSRF middleware."""
import time
import logging
from collections import defaultdict, deque
from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("rate_limit")

DEFAULT_LIMIT = 120
DEFAULT_WINDOW = 60
CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
CSRF_SAFE_PATH_PREFIXES = ("/api/auth/",)

# Stricter limits for sensitive endpoints
AUTH_LIMIT = 20
AUTH_WINDOW = 300  # 5 minutes


class RateLimiter:
    def __init__(self, limit: int = DEFAULT_LIMIT, window: int = DEFAULT_WINDOW):
        self.limit = limit
        self.window = window
        self._buckets: dict[str, deque] = defaultdict(deque)

    def _key(self, request: Request) -> str:
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user:{user_id}:{request.url.path}"
        ip = request.client.host if request.client else "unknown"
        return f"ip:{ip}:{request.url.path}"

    def check(self, request: Request) -> bool:
        key = self._key(request)
        now = time.time()
        bucket = self._buckets[key]
        cutoff = now - self.window
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True


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
        auth_paths = ("/api/auth/login", "/api/auth/forgot-password", "/api/auth/reset-password")
        limiter = self.auth_limiter if request.url.path in auth_paths else self.limiter
        if not limiter.check(request):
            logger.warning("Rate limit exceeded for %s", limiter._key(request))
            raise HTTPException(429, "Too many requests. Please slow down.")
        return await call_next(request)


class CsrfProtectionMiddleware(BaseHTTPMiddleware):
    """CSRF protection for cookie-authenticated state-changing requests.

    Requires GET /api/auth/csrf-token to return a CSRF token that is then
    sent as X-CSRF-Token header on POST/PUT/PATCH/DELETE requests.
    Skips CSRF for API-key or Bearer-token authenticated requests.
    """

    async def dispatch(self, request: Request, call_next):
        if request.method in CSRF_SAFE_METHODS:
            return await call_next(request)
        # Auth-flow endpoints skip CSRF (no cookie session yet)
        if any(request.url.path.startswith(p) for p in CSRF_SAFE_PATH_PREFIXES):
            return await call_next(request)
        # Check if request uses Bearer token (API clients skip CSRF)
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return await call_next(request)
        # CSRF check for cookie-authenticated requests
        csrf_header = request.headers.get("X-CSRF-Token", "")
        csrf_cookie = request.cookies.get("csrf_token", "")
        if not csrf_header or not csrf_cookie:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={"detail": "CSRF token missing"})
        from security import verify_csrf_token as _verify
        if not _verify(csrf_header, csrf_cookie):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={"detail": "CSRF token mismatch"})
        return await call_next(request)
