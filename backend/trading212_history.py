"""Read-only Trading 212 history. Never write trade events into Penni transactions."""
import asyncio
import logging
import math
import os
import time
from urllib.parse import parse_qsl, urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user
from trading212 import is_owner

logger = logging.getLogger(__name__)
_lock = asyncio.Lock()
_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_PATHS = {
    "transactions": "/api/v0/equity/history/transactions",
    "orders": "/api/v0/equity/history/orders",
}


def continuation_params(kind: str, token: str | None) -> dict:
    """The broker may return an API-relative path or a bare query string."""
    if not token:
        return {"limit": "50"}
    if len(token) > 1024:
        raise HTTPException(422, "Invalid history page")
    parsed = urlsplit(token)
    if parsed.scheme or parsed.netloc:
        raise HTTPException(422, "Invalid history page")
    if parsed.path.lstrip("/") == _PATHS[kind].lstrip("/"):
        raw_query = parsed.query
    elif "/" not in token and "?" not in token and "=" in token:
        raw_query = token
    else:
        raise HTTPException(422, "Invalid history page")
    fields = parse_qsl(raw_query, keep_blank_values=False, max_num_fields=12)
    allowed = {"limit", "cursor", "time"} if kind == "transactions" else {"limit", "cursor", "ticker"}
    if not fields or any(name not in allowed for name, _ in fields):
        raise HTTPException(422, "Invalid history page")
    result = dict(fields)
    result["limit"] = "50"
    return result


def _number(value):
    try:
        num = float(value)
        return round(num, 2) if math.isfinite(num) else None
    except (TypeError, ValueError, OverflowError):
        return None


def normalise_activity(kind: str, record: dict) -> dict:
    if kind == "transactions":
        tx_type = str(record.get("type") or "CASH MOVEMENT").upper()[:40]
        timestamp = str(record.get("dateTime") or "")[:50]
        reference = str(record.get("reference") or "")[:120]
        descriptions = {
            "DEPOSIT": "Deposit", "WITHDRAW": "Withdrawal",
            "FEE": "Fee", "TRANSFER": "Internal transfer",
        }
        return {
            "id": reference or f"cash:{tx_type}:{timestamp}:{record.get('amount')}",
            "date": timestamp, "type": tx_type,
            "description": descriptions.get(tx_type, tx_type.replace("_", " ").title()),
            "amount": _number(record.get("amount")),
            "currency": str(record.get("currency") or "GBP").upper()[:3],
            "reference": reference,
        }
    order_data = record.get("order")
    order = order_data if isinstance(order_data, dict) else record
    fill_data = record.get("fill")
    fill = fill_data if isinstance(fill_data, dict) else {}
    instrument_data = order.get("instrument")
    instrument = instrument_data if isinstance(instrument_data, dict) else {}
    impact_data = fill.get("walletImpact")
    impact = impact_data if isinstance(impact_data, dict) else {}
    ticker = str(instrument.get("ticker") or order.get("ticker") or "Investment")[:80]
    timestamp = str(fill.get("filledAt") or order.get("createdAt") or "")[:50]
    order_id = str(fill.get("id") or order.get("id") or "")[:80]
    return {
        "id": f"order:{order_id}" if order_id else f"order:{ticker}:{timestamp}",
        "date": timestamp,
        "type": str(order.get("side") or "TRADE").upper()[:24],
        "description": str(instrument.get("name") or ticker)[:180],
        "ticker": ticker,
        "amount": _number(impact.get("netValue")),
        "currency": str(impact.get("currency") or order.get("currency") or "GBP").upper()[:3],
        "quantity": _number(fill.get("quantity")),
        "reference": order_id,
    }


async def get_history(user: dict, kind: str, token: str | None) -> dict:
    if not is_owner(user):
        raise HTTPException(404, "Trading 212 is not connected")
    key = os.getenv("TRADING212_API_KEY", "").strip()
    secret = os.getenv("TRADING212_API_SECRET", "").strip()
    if not key or not secret:
        raise HTTPException(503, "Trading 212 credentials are not configured")
    env = os.getenv("TRADING212_ENV", "live").strip().lower()
    if env not in {"live", "demo"}:
        raise HTTPException(503, "Invalid Trading 212 environment")
    params = continuation_params(kind, token)
    cache_key = (kind, str(sorted(params.items())))
    now = time.monotonic()
    cached = _cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    async with _lock:
        cached = _cache.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                response = await client.get(
                    f"https://{env}.trading212.com{_PATHS[kind]}",
                    auth=httpx.BasicAuth(key, secret), params=params,
                    headers={"Accept": "application/json"},
                )
        except httpx.RequestError:
            logger.warning("Trading 212 history request unavailable")
            raise HTTPException(502, "Trading 212 history is currently unavailable")
        if response.status_code in (401, 403):
            raise HTTPException(403, "Trading 212 API key needs History permission")
        if response.status_code == 429:
            raise HTTPException(503, "Trading 212 history rate limit reached")
        if response.status_code >= 400:
            raise HTTPException(502, "Trading 212 could not return history")
        try:
            body = response.json()
            if not isinstance(body, dict) or not isinstance(body.get("items"), list):
                raise ValueError("Invalid history response")
            result = {
                "items": [normalise_activity(kind, item) for item in body["items"] if isinstance(item, dict)],
                "next_page": body.get("nextPagePath") or None,
                "kind": kind, "source": "trading212",
            }
        except (TypeError, ValueError):
            raise HTTPException(502, "Trading 212 returned invalid history")
        _cache[cache_key] = (time.monotonic() + 70, result)
        return result


def build_router() -> APIRouter:
    router = APIRouter(prefix="/trading212", tags=["trading212"])

    @router.get("/activity")
    async def history(
        kind: str = Query("transactions", pattern="^(transactions|orders)$"),
        next_page: str | None = Query(None, max_length=1024),
        user: dict = Depends(get_current_user),
    ):
        return await get_history(user, kind, next_page)

    return router
