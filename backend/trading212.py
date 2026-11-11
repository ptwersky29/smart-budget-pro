"""Read-only Trading 212 account summary for the configured Penni owner.

API credentials are held in Render environment variables. Nothing in this module
sends a trading order or returns credentials to the browser.
"""
import asyncio
import logging
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user

logger = logging.getLogger(__name__)
_cache = {"value": None, "until": 0.0, "fetched_at": 0.0}
_cache_lock = asyncio.Lock()


def build_router():
    router = APIRouter(prefix="/trading212", tags=["trading212"])

    @router.get("/summary")
    async def account_summary(
        refresh: bool = Query(False),
        user: dict = Depends(get_current_user),
    ):
        owner = os.environ.get("TRADING212_OWNER_EMAIL", "").strip().casefold()
        # Render holds one person's credentials. Never expose that person's
        # financial information to other Penni users or public demo visitors.
        if not owner or user.get("email", "").strip().casefold() != owner:
            raise HTTPException(404, "Trading 212 is not connected")

        key = os.environ.get("TRADING212_API_KEY", "").strip()
        secret = os.environ.get("TRADING212_API_SECRET", "").strip()
        if not key or not secret:
            return {"connected": False, "status": "awaiting_keys"}

        env = os.environ.get("TRADING212_ENV", "live").strip().lower()
        if env not in {"live", "demo"}:
            raise HTTPException(503, "Trading 212 environment must be live or demo")
        url = f"https://{env}.trading212.com/api/v0/equity/account/summary"

        async with _cache_lock:
            now = time.monotonic()
            # At least five seconds between requests, and ordinarily a
            # 60-second cache. Explicit refresh can bypass only the latter.
            if _cache["value"] is not None and (
                now < _cache["until"] and not refresh
                or now - _cache["fetched_at"] < 6
            ):
                return _cache["value"]

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(
                        url,
                        auth=httpx.BasicAuth(key, secret),
                        headers={"Accept": "application/json"},
                    )
            except httpx.RequestError:
                logger.warning("Trading 212 summary request failed")
                raise HTTPException(502, "Trading 212 is currently unavailable")

            if response.status_code == 401:
                raise HTTPException(502, "Trading 212 rejected the API credentials")
            if response.status_code == 403:
                raise HTTPException(502, "Trading 212 API key needs account read permission")
            if response.status_code == 429:
                raise HTTPException(503, "Trading 212 rate limit reached; try again soon")
            if response.status_code >= 400:
                raise HTTPException(502, "Trading 212 account summary could not be loaded")

            try:
                payload = response.json()
                cash = payload.get("cash") or {}
                investments = payload.get("investments") or {}
                total = float(payload["totalValue"])
                summary = {
                    "connected": True,
                    "status": "connected",
                    "currency": str(payload.get("currency") or "GBP").upper(),
                    "total_value": total,
                    "cash_available": float(cash.get("availableToTrade") or 0),
                    "cash_in_pies": float(cash.get("inPies") or 0),
                    "cash_reserved": float(cash.get("reservedForOrders") or 0),
                    "investments_value": float(investments.get("currentValue") or 0),
                    "unrealized_profit_loss": float(investments.get("unrealizedProfitLoss") or 0),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            except (ValueError, TypeError, KeyError, AttributeError):
                logger.warning("Trading 212 returned an unexpected summary structure")
                raise HTTPException(502, "Trading 212 returned an unexpected account summary")

            _cache.update(value=summary, until=time.monotonic() + 60, fetched_at=time.monotonic())
            return summary

    return router
