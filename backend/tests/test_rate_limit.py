import asyncio
from types import SimpleNamespace

from rate_limit import AUTH_RATE_LIMIT_PATHS, RateLimiter


class _Client:
    host = "127.0.0.1"


class _Url:
    path = "/api/test"


def make_request(user_id=None):
    state = SimpleNamespace()
    if user_id:
        state.user_id = user_id
    return SimpleNamespace(client=_Client(), url=_Url(), state=state)


class FakeRedis:
    def __init__(self):
        self.counts = {}
        self.expirations = {}

    async def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def expire(self, key, ttl):
        self.expirations[key] = ttl
        return True


class BrokenRedis:
    async def incr(self, key):
        raise RuntimeError("redis unavailable")

    async def expire(self, key, ttl):
        return True


def test_memory_limiter_blocks_after_limit():
    limiter = RateLimiter(limit=2, window=60, redis_url="")
    request = make_request()

    assert asyncio.run(limiter.check(request)) is True
    assert asyncio.run(limiter.check(request)) is True
    assert asyncio.run(limiter.check(request)) is False


def test_redis_limiter_is_shared_across_workers():
    redis = FakeRedis()
    worker_a = RateLimiter(limit=2, window=60, redis_client=redis)
    worker_b = RateLimiter(limit=2, window=60, redis_client=redis)
    request = make_request()

    assert asyncio.run(worker_a.check(request)) is True
    assert asyncio.run(worker_a.check(request)) is True
    assert asyncio.run(worker_b.check(request)) is False


def test_redis_failure_falls_back_to_memory():
    limiter = RateLimiter(limit=1, window=60, redis_client=BrokenRedis())
    request = make_request()

    assert asyncio.run(limiter.check(request)) is True
    assert limiter._redis is None
    assert asyncio.run(limiter.check(request)) is False


def test_sensitive_sms_paths_use_strict_limiter():
    assert "/api/sms/register-sender" in AUTH_RATE_LIMIT_PATHS
    assert "/api/sms/verify-sender" in AUTH_RATE_LIMIT_PATHS
