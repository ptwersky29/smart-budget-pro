"""Read-only Trading 212 summary and synchronised Penni savings-account record."""
import asyncio
import logging
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from auth import get_current_user
from db import BankAccount

logger = logging.getLogger(__name__)
_cache = {"value": None, "until": 0.0, "fetched_at": 0.0}
_fetch_lock = asyncio.Lock()
_sync_lock = asyncio.Lock()


def is_owner(user: dict) -> bool:
    email = os.getenv("TRADING212_OWNER_EMAIL", "").strip().casefold()
    return bool(email) and email == user.get("email", "").strip().casefold()


async def fetch_account_summary(user: dict, refresh: bool = False) -> dict:
    if not is_owner(user):
        raise HTTPException(404, "Trading 212 is not connected")
    key = os.getenv("TRADING212_API_KEY", "").strip()
    secret = os.getenv("TRADING212_API_SECRET", "").strip()
    if not key or not secret:
        return {"connected": False, "status": "awaiting_keys"}
    env = os.getenv("TRADING212_ENV", "live").strip().lower()
    if env not in {"live", "demo"}:
        raise HTTPException(503, "Invalid Trading 212 environment")

    async with _fetch_lock:
        now = time.monotonic()
        if _cache["value"] is not None and (
            (now < _cache["until"] and not refresh)
            or now - _cache["fetched_at"] < 6
        ):
            return _cache["value"]
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"https://{env}.trading212.com/api/v0/equity/account/summary",
                    auth=httpx.BasicAuth(key, secret),
                    headers={"Accept": "application/json"},
                )
        except httpx.RequestError:
            logger.warning("Trading 212 balance unavailable")
            raise HTTPException(502, "Trading 212 is currently unavailable")
        if response.status_code == 401:
            raise HTTPException(502, "Trading 212 rejected the credentials")
        if response.status_code == 403:
            raise HTTPException(502, "Trading 212 key needs account read permission")
        if response.status_code == 429:
            raise HTTPException(503, "Trading 212 rate limit reached")
        if response.status_code >= 400:
            raise HTTPException(502, "Trading 212 could not return the balance")
        try:
            raw = response.json()
            cash = raw.get("cash") or {}
            investments = raw.get("investments") or {}
            data = {
                "connected": True,
                "status": "connected",
                "currency": str(raw.get("currency") or "GBP").upper(),
                "total_value": float(raw["totalValue"]),
                "cash_available": float(cash.get("availableToTrade") or 0),
                "cash_in_pies": float(cash.get("inPies") or 0),
                "cash_reserved": float(cash.get("reservedForOrders") or 0),
                "investments_value": float(investments.get("currentValue") or 0),
                "unrealized_profit_loss": float(investments.get("unrealizedProfitLoss") or 0),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        except (ValueError, TypeError, KeyError, AttributeError):
            raise HTTPException(502, "Trading 212 returned an unexpected balance")
        _cache.update(value=data, until=time.monotonic() + 60, fetched_at=time.monotonic())
        return data


async def sync_savings_account(request, user: dict, refresh: bool = False) -> bool:
    """Upsert one account after a successful fetch; never insert fake zero balances.

    The type=savings setting is Penni's display grouping, not a representation
    that an Invest or Stocks ISA portfolio is a bank cash savings deposit.
    """
    if not is_owner(user):
        return False
    data = await fetch_account_summary(user, refresh)
    if not data.get("connected"):
        return False

    uid = user["user_id"]
    balance = round(data["total_value"], 2)
    currency = data["currency"]
    # Penni sums GBP without FX conversion, so foreign currency is excluded.
    include_in_total = currency == "GBP"
    updated_at = datetime.fromisoformat(data["updated_at"])
    account_id = f"t212_{uid}"[:64]
    async with _sync_lock:
        async with request.app.state.db() as session:
            result = await session.execute(
                select(BankAccount).where(
                    BankAccount.user_id == uid,
                    BankAccount.provider == "trading212",
                )
            )
            acct = result.scalars().first()
            if acct is None:
                collision = await session.execute(
                    select(BankAccount).where(BankAccount.account_id == account_id)
                )
                if collision.scalar_one_or_none() is not None:
                    logger.warning("Trading 212 account id is already in use")
                    return False
                session.add(BankAccount(
                    account_id=account_id, user_id=uid,
                    name="Trading 212", type="savings", provider="trading212",
                    balance=balance, currency=currency, color="#256D62",
                    is_offline=False, include_in_total=include_in_total,
                    balance_updated_at=updated_at,
                ))
                await session.commit()
                return True
            changed = (
                round(float(acct.balance or 0), 2) != balance
                or acct.currency != currency or acct.type != "savings"
                or acct.include_in_total != include_in_total
                or acct.is_offline
                or acct.balance_updated_at is None
                or acct.balance_updated_at.replace(tzinfo=timezone.utc) != updated_at
            )
            if changed:
                acct.balance = balance
                acct.currency = currency
                acct.type = "savings"
                acct.is_offline = False
                acct.include_in_total = include_in_total
                acct.balance_updated_at = updated_at
                await session.commit()
            return changed


def build_router() -> APIRouter:
    router = APIRouter(prefix="/trading212", tags=["trading212"])

    @router.get("/summary")
    async def account_summary(
        refresh: bool = Query(False),
        user: dict = Depends(get_current_user),
    ):
        return await fetch_account_summary(user, refresh)

    return router
