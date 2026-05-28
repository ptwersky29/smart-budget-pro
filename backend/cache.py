"""Simple in-memory TTL cache for frequently accessed data."""
import time
import logging
from typing import Any, Optional

logger = logging.getLogger("cache")


class TTLCache:
    def __init__(self, ttl: int = 300):
        self._default_ttl = ttl
        self._store: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._store:
            value, expiry = self._store[key]
            if time.time() < expiry:
                return value
            del self._store[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        self._store[key] = (value, time.time() + (ttl or self._default_ttl))

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()


market_cache = TTLCache(ttl=120)
audit_cache = TTLCache(ttl=10)
