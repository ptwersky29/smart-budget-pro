"""TrueLayer Open Banking — OAuth, auto-refresh, transaction sync, dedup, retry, encrypted tokens."""
import os
import uuid
import secrets
import hashlib
import json
import logging
import asyncio
from base64 import b64encode, b64decode
from datetime import datetime, timezone, timedelta, date
from urllib.parse import urlencode, urlparse
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select, delete, func

from db import TrueLayerState, BankAccount, BankConnection, TrueLayerLog, SyncLog, Transaction
from auth import get_current_user
from bank_sync_utils import (
    parse_import_from_date,
    is_reauth_error,
    connection_error_message,
    transaction_sync_id,
)

# Lock to prevent concurrent syncs for the same connection
_sync_lock = asyncio.Lock()
from statements import _ai_categorise

logger = logging.getLogger("truelayer")

SCOPES = "info accounts balance cards transactions direct_debits standing_orders offline_access"
SYNC_PAGE_SIZE = 500
MAX_RETRIES = 3
MAX_ERROR_TEXT = 500
SYNC_INTERVAL_SECONDS = 300  # 5 minutes


# ── Encrypted token storage (AES-GCM authenticated encryption) ────────────

_ENC_PREFIX = "aesgcm1:"


def _derive_key() -> bytes:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is required for token encryption")
    return hashlib.sha256(secret.encode()).digest()


def _encrypt(plaintext: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = _derive_key()
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return _ENC_PREFIX + b64encode(nonce + ciphertext).decode()


def _decrypt(payload: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if not payload.startswith(_ENC_PREFIX):
        raise ValueError("Not an encrypted token")
    key = _derive_key()
    aesgcm = AESGCM(key)
    raw = b64decode(payload[len(_ENC_PREFIX):])
    nonce, ciphertext = raw[:12], raw[12:]
    return aesgcm.decrypt(nonce, ciphertext, None).decode()


# ── Config ────────────────────────────────────────────────────────────────

async def _tl_config_from_db(session=None) -> dict:
    """Read TrueLayer config from env vars, falling back to DB AppConfig."""
    async def _get(key: str, env_var: str) -> str:
        val = os.environ.get(env_var)
        if not val and session:
            from db import AppConfig
            r = await session.execute(select(AppConfig).where(AppConfig.key == f"truelayer_{key}"))
            c = r.scalar_one_or_none()
            if c and c.value:
                val = c.value
        return val or ""

    env = os.environ.get("TRUELAYER_ENVIRONMENT") or await _get("environment", "") or "sandbox"
    client_id = await _get("client_id", "TRUELAYER_CLIENT_ID")
    client_secret = await _get("client_secret", "TRUELAYER_CLIENT_SECRET")
    redirect_uri = await _get("redirect_uri", "TRUELAYER_REDIRECT_URI")

    if env == "live":
        return {
            "client_id": client_id, "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "auth_url": "https://auth.truelayer.com",
            "token_url": "https://auth.truelayer.com/connect/token",
            "api_url": "https://api.truelayer.com",
            "environment": "live",
        }
    return {
        "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "auth_url": os.environ.get("TRUELAYER_AUTH_URL", "https://auth.truelayer-sandbox.com"),
        "token_url": os.environ.get("TRUELAYER_TOKEN_URL", "https://auth.truelayer-sandbox.com/connect/token"),
        "api_url": os.environ.get("TRUELAYER_API_URL", "https://api.truelayer-sandbox.com"),
        "environment": "sandbox",
    }


def _build_auth_link_params(
    cfg: dict,
    *,
    env: str,
    redirect_uri: str,
    state: str,
    nonce: str,
    user_email: str,
) -> dict:
    """Build a TrueLayer auth-link parameter set.

    Sandbox uses a UK country hint to keep users on the normal UK provider
    selection path. Production stays untouched.
    """
    params = {
        "response_type": "code",
        "client_id": cfg["client_id"],
        "scope": SCOPES,
        "redirect_uri": redirect_uri,
        "state": state,
        "nonce": nonce,
    }
    if env == "sandbox":
        params["providers"] = "uk-cs-mock"
        if user_email:
            params["user_email"] = user_email
    return params


def _token_value(value: Optional[str]) -> str:
    return value or ""


def _parse_date_str(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _normalize_accounts_payload(payload) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        results = payload.get("results")
        if isinstance(results, list):
            return [item for item in results if isinstance(item, dict)]
        if isinstance(results, dict):
            return [results]
    return []


def _frontend_base_url() -> str:
    frontend = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
    if frontend:
        return frontend
    return "https://smart-budget-pro-ewtm.vercel.app"


def _connections_url(frontend: str, status: str, reason: Optional[str] = None, accounts: Optional[int] = None) -> str:
    params = {"status": status}
    if reason:
        params["reason"] = reason
    if accounts is not None:
        params["accounts"] = str(accounts)
    return f"{frontend.rstrip('/')}/connections?{urlencode(params)}"


async def _is_configured(session=None) -> bool:
    cfg = await _tl_config_from_db(session)
    return bool(cfg["client_id"] and cfg["client_secret"])


# ── TrueLayer API calls with auto-refresh ────────────────────────────────

async def _get_valid_token(session, conn: BankConnection) -> str:
    if conn.expires_at and conn.expires_at.tzinfo is None:
        conn.expires_at = conn.expires_at.replace(tzinfo=timezone.utc)
    if conn.expires_at and conn.expires_at > datetime.now(timezone.utc) + timedelta(minutes=5):
        return _decrypt(conn.access_token)
    if not conn.refresh_token:
        raise HTTPException(401, "Token expired and no refresh token available — reconnect your bank")
    token_data = await _refresh_access_token(_decrypt(conn.refresh_token), session)
    conn.access_token = _encrypt(token_data["access_token"])
    refresh_token = _token_value(token_data.get("refresh_token"))
    if refresh_token:
        conn.refresh_token = _encrypt(refresh_token)
    conn.expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))
    await session.commit()
    return _decrypt(conn.access_token)


async def _tl_get(session, conn: BankConnection, path: str, params: dict = None) -> dict:
    token = await _get_valid_token(session, conn)
    cfg = await _tl_config_from_db(session)
    url = f"{cfg['api_url']}{path}"
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(url, headers={"Authorization": f"Bearer {token}"}, params=params)
            if r.status_code == 401 and attempt < MAX_RETRIES - 1:
                conn.expires_at = datetime.now(timezone.utc)
                token = await _get_valid_token(session, conn)
                continue
            if r.status_code == 429:
                wait = 2 ** attempt
                logger.warning(f"rate limited, retrying in {wait}s")
                await asyncio.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"TrueLayer API error {path}: {e.response.status_code} {e.response.text[:500]}")
        except httpx.RequestError as e:
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"TrueLayer network error {path}: {e}")


# ── Auth helpers ──────────────────────────────────────────────────────────

async def _exchange_code(code: str, redirect_uri: str, session) -> dict:
    cfg = await _tl_config_from_db(session)
    data = {
        "grant_type": "authorization_code",
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "redirect_uri": redirect_uri,
        "code": code,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(cfg["token_url"], data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    if r.status_code != 200:
        raise RuntimeError(f"Token exchange failed: {r.status_code} {r.text[:300]}")
    return r.json()


async def _refresh_access_token(refresh_token: str, session) -> dict:
    cfg = await _tl_config_from_db(session)
    data = {
        "grant_type": "refresh_token",
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "refresh_token": refresh_token,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(cfg["token_url"], data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    if r.status_code != 200:
        raise RuntimeError(f"Refresh failed: {r.status_code} {r.text[:300]}")
    return r.json()


async def _fetch_accounts(access_token: str, session) -> list:
    cfg = await _tl_config_from_db(session)
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(f"{cfg['api_url']}/data/v1/accounts", headers={"Authorization": f"Bearer {access_token}"})
        if r.status_code == 200:
            return _normalize_accounts_payload(r.json())
    except Exception as e:
        logger.warning(f"/data/v1/accounts failed: {e}")
    # Fallback to /me for backwards compatibility
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(f"{cfg['api_url']}/data/v1/me", headers={"Authorization": f"Bearer {access_token}"})
        if r.status_code == 200:
            return _normalize_accounts_payload(r.json())
    except Exception as e:
        logger.warning(f"/data/v1/me fallback also failed: {e}")
    return []

async def _fetch_and_store_balances(session, conn: BankConnection):
    """Fetch balance for a single account and store it, with card fallback."""
    account_id = conn.account_id
    if not account_id:
        return
    endpoints = [
        f"/data/v1/accounts/{account_id}/balance",
        f"/data/v1/cards/{account_id}/balance",
    ]
    last_error = None
    for path in endpoints:
        try:
            data = await _tl_get(session, conn, path)
            results = data.get("results", [])
            if results:
                bal = results[0]
                conn.balance = float(bal.get("current", bal.get("available", 0)))
                conn.balance_currency = bal.get("currency", "GBP")
                conn.balance_updated_at = datetime.now(timezone.utc)

                # Also update BankAccount balance
                ba_result = await session.execute(
                    select(BankAccount).where(
                        BankAccount.connection_id == conn.connection_id,
                    )
                )
                ba = ba_result.scalar_one_or_none()
                if ba:
                    ba.balance = conn.balance
                    ba.balance_currency = conn.balance_currency
                    ba.balance_updated_at = conn.balance_updated_at

                await session.commit()
                return
        except Exception as e:
            last_error = e
            continue
    if last_error:
        logger.warning(f"balance fetch failed for {account_id} (tried accounts & cards): {last_error}")


# ── Logging ───────────────────────────────────────────────────────────────

async def _mark_connection_state(session, conn: BankConnection, *, status: str, error: str = None, synced_at: datetime = None):
    conn.status = status
    conn.last_sync_status = status
    if synced_at:
        conn.last_sync_at = synced_at
    if error:
        conn.last_error = error[:MAX_ERROR_TEXT]
        conn.last_error_at = datetime.now(timezone.utc)
    else:
        conn.last_error = None
        conn.last_error_at = None
    await session.commit()

async def _log_sync(session, user_id: str, connection_id: str, event: str, status: str = "info", message: str = None, details: dict = None):
    try:
        session.add(SyncLog(user_id=user_id, connection_id=connection_id, provider="truelayer", event=event, status=status, message=message, details=details))
        await session.commit()
    except Exception as e:
        logger.error(f"sync log fail: {e}")


async def _log_oauth(session, user_id, event, payload):
    try:
        session.add(TrueLayerLog(user_id=user_id, endpoint=event, request_body=payload))
        await session.commit()
    except Exception as e:
        logger.error(f"oauth log fail: {e}")


# ── Router ────────────────────────────────────────────────────────────────

def build_router() -> APIRouter:
    router = APIRouter(prefix="/truelayer", tags=["truelayer"])

    def _backend_callback_url(request: Request, cfg: dict) -> str:
        """Resolve the exact TrueLayer callback URL.

        Prefer the admin/env configured redirect URI because TrueLayer requires
        an exact string match with the URL registered in the console.
        Fall back to the live request only when no configured redirect exists.
        """
        configured = (cfg.get("redirect_uri") or "").strip()
        if configured:
            return configured

        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        if scheme not in ("http", "https"):
            scheme = "https"
        host = (
            request.headers.get("x-forwarded-host")
            or request.headers.get("host")
            or request.url.hostname
            or urlparse(os.environ.get("RENDER_EXTERNAL_URL", "")).hostname
            or "budget-pro-4jlg.onrender.com"
        )
        derived = f"{scheme}://{host}/api/truelayer/callback"
        logger.warning("TrueLayer redirect_uri not configured; derived %s. Register this exact URL in TrueLayer Console.", derived)
        return derived

    @router.get("/auth-url")
    async def get_auth_url(request: Request, from_date: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            if not await _is_configured(session):
                raise HTTPException(400, "TrueLayer not configured by the administrator.")
            cfg = await _tl_config_from_db(session)
            env = cfg.get("environment", "sandbox")
            state = secrets.token_urlsafe(24)
            nonce = secrets.token_urlsafe(16)
            import_from_date = parse_import_from_date(from_date)
            redirect_uri = _backend_callback_url(request, cfg)
            logger.info("truelayer auth-url: env=%s redirect_uri=%r scheme=%s host=%s xfp=%s",
                        env, redirect_uri, request.url.scheme, request.url.hostname,
                        request.headers.get("x-forwarded-proto", ""))
            session.add(
                TrueLayerState(
                    state=state, user_id=user["user_id"],
                    redirect_uri=redirect_uri,
                    meta={"from_date": import_from_date} if import_from_date else {},
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
                )
            )
            # Clean up expired states
            await session.execute(
                delete(TrueLayerState).where(TrueLayerState.expires_at < datetime.now(timezone.utc))
            )
            params = _build_auth_link_params(
                cfg,
                env=env,
                redirect_uri=redirect_uri,
                state=state,
                nonce=nonce,
                user_email=user.get("email", ""),
            )
            auth_url = f"{cfg['auth_url']}/?{urlencode(params)}"
            await _log_oauth(session, user["user_id"], "auth_url_generated", {"state": state, "redirect_uri": redirect_uri})
            await session.commit()
            return {"auth_url": auth_url, "state": state, "redirect_uri": redirect_uri}

    @router.get("/callback")
    async def callback(request: Request, code: str = Query(None), state: str = Query(None), error: str = Query(None), error_description: str = Query(None)):
        sm = request.app.state.db
        frontend = _frontend_base_url()
        try:
            async with sm() as session:
                if error:
                    await _log_oauth(session, None, "callback_error", {"error": error, "desc": error_description})
                    return RedirectResponse(_connections_url(frontend, "failed", reason=error))
                if not code or not state:
                    return RedirectResponse(_connections_url(frontend, "failed", reason="missing_params"))
                result = await session.execute(select(TrueLayerState).where(TrueLayerState.state == state))
                state_doc = result.scalar_one_or_none()
                if not state_doc:
                    return RedirectResponse(_connections_url(frontend, "failed", reason="invalid_state"))
                user_id = state_doc.user_id
                state_meta = state_doc.meta or {}
                raw_from_date = state_meta.get("from_date") if isinstance(state_meta, dict) else None
                import_from_date = _parse_date_str(raw_from_date)
                connection_id_to_update = state_meta.get("connection_id") if isinstance(state_meta, dict) else None
                try:
                    token_data = await _exchange_code(code, state_doc.redirect_uri, session)
                except Exception as e:
                    await _log_oauth(session, user_id, "token_exchange_failed", {"error": str(e)})
                    return RedirectResponse(_connections_url(frontend, "failed", reason="token_exchange"))

                # Reconnect flow — update existing connection tokens
                if connection_id_to_update:
                    result = await session.execute(
                        select(BankConnection).where(
                            BankConnection.connection_id == connection_id_to_update,
                            BankConnection.user_id == user_id,
                        )
                    )
                    existing = result.scalar_one_or_none()
                    if existing:
                        existing.access_token = _encrypt(token_data["access_token"])
                        existing.refresh_token = _encrypt(_token_value(token_data.get("refresh_token")))
                        existing.expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))
                        existing.status = "active"
                        existing.last_error = None
                        existing.last_error_at = None
                        existing.last_sync_status = "connected"
                        existing.update_count = (existing.update_count or 0) + 1
                        await session.delete(state_doc)
                        await session.commit()
                        # Trigger initial sync for reconnected connection
                        try:
                            _, _ = await _sync_connection(session, existing, user_id)
                        except Exception as e:
                            logger.error(f"reconnect sync failed for {existing.connection_id}: {e}")
                        return RedirectResponse(_connections_url(frontend, "success", accounts=1))

                # New connection flow
                accounts = await _fetch_accounts(token_data["access_token"], session)
                if not accounts:
                    await _log_oauth(session, user_id, "no_accounts_selected", {"state": state, "meta": state_meta})
                    await session.delete(state_doc)
                    await session.commit()
                    return RedirectResponse(_connections_url(frontend, "failed", reason="no_accounts"))
                created_connections = []
                for acc in accounts:
                    provider_info = acc.get("provider") or {}
                    connection_id = f"conn_{uuid.uuid4().hex[:12]}"
                    provider_name = provider_info.get("display_name")
                    config = {"account_ids": [acc.get("account_id", "")]} if acc.get("account_id") else {}
                    if provider_name:
                        config["institution"] = provider_name
                    conn = BankConnection(
                        connection_id=connection_id, user_id=user_id, provider="truelayer",
                        account_id=acc.get("account_id") or provider_info.get("provider_id", "unknown"),
                        account_name=acc.get("display_name") or provider_info.get("display_name", "UK Bank"),
                        account_type=acc.get("account_type", ""),
                        access_token=_encrypt(token_data["access_token"]),
                        refresh_token=_encrypt(_token_value(token_data.get("refresh_token"))),
                        expires_at=datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600)),
                        import_start_date=import_from_date,
                        config=config,
                        status="active",
                        last_sync_status="connected",
                    )
                    session.add(conn)
                    created_connections.append(conn)

                    # Also create a BankAccount entry for the new account system
                    acct_type = acc.get("account_type", "").lower()
                    if acct_type not in ("current", "savings", "cash", "credit"):
                        acct_type = "current"
                    ba_acct_id = conn.account_id or f"acct_{uuid.uuid4().hex[:12]}"
                    ba = BankAccount(
                        account_id=ba_acct_id,
                        user_id=user_id,
                        name=acc.get("display_name") or provider_info.get("display_name", "UK Bank"),
                        type=acct_type,
                        balance=0,
                        currency="GBP",
                        provider="truelayer",
                        connection_id=connection_id,
                        is_offline=False,
                    )
                    session.add(ba)
                await session.delete(state_doc)
                await _log_oauth(session, user_id, "connection_success", {"accounts_count": len(accounts)})
                await session.commit()
                # Trigger initial sync for all new connections
                for conn in created_connections:
                    try:
                        _, _ = await _sync_connection(session, conn, user_id)
                    except Exception as e:
                        logger.error(f"initial sync failed for {conn.connection_id}: {e}")
                return RedirectResponse(_connections_url(frontend, "success", accounts=len(accounts)))
        except Exception as e:
            rid = getattr(request.state, "request_id", "?")
            logger.exception("RID=%s TrueLayer callback failed: %s", rid, e)
            return RedirectResponse(_connections_url(frontend, "failed", reason="callback_error"))

    @router.get("/connections")
    async def list_connections(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(BankConnection).where(BankConnection.user_id == user["user_id"]).order_by(BankConnection.created_at.desc()))
            rows = result.scalars().all()
            result2 = await session.execute(
                select(Transaction.user_id, func.count().label("cnt")).where(Transaction.user_id == user["user_id"]).group_by(Transaction.user_id)
            )
            tx_counts = {}
            for row in result2:
                tx_counts[row.user_id] = row.cnt
            result3 = await session.execute(
                select(SyncLog).where(SyncLog.user_id == user["user_id"]).order_by(SyncLog.created_at.desc()).limit(20)
            )
            recent_syncs = result3.scalars().all()
            return {
                "connections": [
                    {"connection_id": c.connection_id, "account_id": c.account_id,
                     "account_name": c.nickname or c.account_name, "account_type": c.account_type,
                     "provider": c.provider, "status": c.status,
                     "created_at": c.created_at.isoformat() if c.created_at else None,
                     "expires_at": c.expires_at.isoformat() if c.expires_at else None,
                     "last_sync_at": c.last_sync_at.isoformat() if c.last_sync_at else None,
                     "last_sync_status": c.last_sync_status or c.status,
                     "last_error": c.last_error,
                     "last_error_at": c.last_error_at.isoformat() if c.last_error_at else None,
                     "config": c.config or {},
                     "import_from_date": c.import_start_date.isoformat() if c.import_start_date else None,
                     "nickname": c.nickname or c.account_name,
                     "balance": float(c.balance) if c.balance is not None else None,
                     "balance_currency": c.balance_currency,
                     "balance_updated_at": c.balance_updated_at.isoformat() if c.balance_updated_at else None}
                    for c in rows
                ],
                "total_transactions": tx_counts.get(user["user_id"], 0),
                "recent_syncs": [
                    {"event": s.event, "status": s.status, "message": s.message,
                     "created_at": s.created_at.isoformat() if s.created_at else None}
                    for s in recent_syncs
                ],
            }

    @router.get("/connections/{connection_id}")
    async def get_connection(connection_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankConnection).where(
                    BankConnection.connection_id == connection_id,
                    BankConnection.user_id == user["user_id"],
                )
            )
            conn = result.scalar_one_or_none()
            if not conn:
                raise HTTPException(status_code=404, detail="Connection not found")
            tx_count_result = await session.execute(
                select(func.count()).where(Transaction.connection_id == connection_id)
            )
            tx_count = tx_count_result.scalar() or 0
            last_tx_result = await session.execute(
                select(Transaction).where(Transaction.connection_id == connection_id)
                .order_by(Transaction.date.desc()).limit(1)
            )
            last_tx = last_tx_result.scalar_one_or_none()
            return {
                "connection_id": conn.connection_id,
                "account_id": conn.account_id,
                "account_name": conn.nickname or conn.account_name,
                "account_type": conn.account_type,
                "provider": conn.provider,
                "status": conn.status,
                "created_at": conn.created_at.isoformat() if conn.created_at else None,
                "expires_at": conn.expires_at.isoformat() if conn.expires_at else None,
                "last_sync_at": conn.last_sync_at.isoformat() if conn.last_sync_at else None,
                "last_sync_status": conn.last_sync_status or conn.status,
                "last_error": conn.last_error,
                "last_error_at": conn.last_error_at.isoformat() if conn.last_error_at else None,
                "config": conn.config or {},
                "import_from_date": conn.import_start_date.isoformat() if conn.import_start_date else None,
                "nickname": conn.nickname or conn.account_name,
                "balance": float(conn.balance) if conn.balance is not None else None,
                "balance_currency": conn.balance_currency,
                "balance_updated_at": conn.balance_updated_at.isoformat() if conn.balance_updated_at else None,
                "transaction_count": tx_count,
                "last_transaction_date": last_tx.date.isoformat() if last_tx and last_tx.date else None,
            }

    @router.post("/reconnect/{connection_id}")
    async def reconnect_connection(connection_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankConnection).where(
                    BankConnection.connection_id == connection_id,
                    BankConnection.user_id == user["user_id"],
                )
            )
            conn = result.scalar_one_or_none()
            if not conn:
                raise HTTPException(404, "Connection not found")
            if not await _is_configured(session):
                raise HTTPException(400, "TrueLayer not configured by the administrator.")
            cfg = await _tl_config_from_db(session)
            env = cfg.get("environment", "sandbox")
            state = secrets.token_urlsafe(24)
            nonce = secrets.token_urlsafe(16)
            redirect_uri = _backend_callback_url(request, cfg)
            session.add(
                TrueLayerState(
                    state=state, user_id=user["user_id"],
                    redirect_uri=redirect_uri,
                    meta={"connection_id": connection_id,
                          "from_date": conn.import_start_date.isoformat() if conn.import_start_date else None},
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
                )
            )
            await session.execute(
                delete(TrueLayerState).where(TrueLayerState.expires_at < datetime.now(timezone.utc))
            )
            params = _build_auth_link_params(
                cfg,
                env=env,
                redirect_uri=redirect_uri,
                state=state,
                nonce=nonce,
                user_email=user.get("email", ""),
            )
            auth_url = f"{cfg['auth_url']}/?{urlencode(params)}"
            await session.commit()
            return {"auth_url": auth_url, "state": state, "redirect_uri": redirect_uri}

    @router.post("/sync")
    async def sync_transactions(request: Request, user: dict = Depends(get_current_user)):
        async with _sync_lock:
            sm = request.app.state.db
            async with sm() as session:
                result = await session.execute(select(BankConnection).where(BankConnection.user_id == user["user_id"], BankConnection.status == "active"))
                conns = result.scalars().all()
                if not conns:
                    raise HTTPException(400, "No active bank connections")
                total_new = 0
                total_dup = 0
                errors = []
                for conn in conns:
                    try:
                        new, dup = await _sync_connection(session, conn, user["user_id"])
                        total_new += new
                        total_dup += dup
                    except Exception as e:
                        logger.error(f"sync failed for {conn.connection_id}: {e}")
                        errors.append({"connection_id": conn.connection_id, "error": str(e)[:200]})
                        await _log_sync(session, user["user_id"], conn.connection_id, "sync_failed", "error", str(e)[:500])
                await _log_sync(session, user["user_id"], "all", "sync_complete", "success",
                               f"Imported {total_new} new, skipped {total_dup} duplicates across {len(conns)} connections")
                return {"ok": True, "connections_synced": len(conns), "new_transactions": total_new, "duplicates_skipped": total_dup, "errors": errors}

    @router.post("/sync/all")
    async def sync_all_users(request: Request):
        """Background sync — called by cron or scheduler. Accepts a secret token for auth."""
        token = request.headers.get("X-Sync-Secret")
        expected = os.environ.get("SYNC_SECRET", "")
        if expected and token != expected:
            raise HTTPException(403, "Invalid sync secret")
        result = await run_background_sync(request.app.state.db)
        return result

    @router.put("/connections/{connection_id}")
    async def update_connection(connection_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankConnection).where(BankConnection.connection_id == connection_id, BankConnection.user_id == user["user_id"])
            )
            conn = result.scalar_one_or_none()
            if not conn:
                raise HTTPException(404, "Connection not found")
            body = await request.json()
            if "nickname" in body:
                conn.nickname = body["nickname"]
            if "import_start_date" in body:
                try:
                    conn.import_start_date = date.fromisoformat(body["import_start_date"])
                except (ValueError, TypeError):
                    raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
            await session.commit()
            await _log_sync(session, user["user_id"], connection_id, "connection_updated", "info", "Nickname or settings updated")
            return {"ok": True}

    @router.delete("/connections/{connection_id}")
    async def remove_connection(connection_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(BankConnection).where(BankConnection.connection_id == connection_id, BankConnection.user_id == user["user_id"]))
            conn = result.scalar_one_or_none()
            if not conn:
                raise HTTPException(404, "Connection not found")
            await session.delete(conn)
            await session.commit()
            await _log_sync(session, user["user_id"], connection_id, "connection_removed", "info")
            return {"ok": True}

    @router.get("/logs")
    async def get_logs(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(SyncLog).where(SyncLog.user_id == user["user_id"]).order_by(SyncLog.created_at.desc()).limit(50))
            logs = result.scalars().all()
            return {"logs": [{"id": str(l.id), "event": l.event, "status": l.status, "message": l.message, "created_at": l.created_at.isoformat() if l.created_at else None} for l in logs]}

    return router


# Exported for background scheduler (module-level, not inside build_router)
async def run_background_sync(db_maker) -> dict:
    """Sync all active connections. Can be called from scheduler or endpoint."""
    async with _sync_lock:
        sm = db_maker
        async with sm() as session:
            result = await session.execute(select(BankConnection).where(BankConnection.status == "active"))
            conns = result.scalars().all()
            total_new = 0
            total_dup = 0
            for conn in conns:
                try:
                    new, dup = await _sync_connection(session, conn, conn.user_id)
                    total_new += new
                    total_dup += dup
                except Exception as e:
                    logger.error(f"background sync failed for {conn.connection_id}: {e}")
                    await _log_sync(session, conn.user_id, conn.connection_id, "background_sync_failed", "error", str(e)[:500])
            logger.info(f"Background sync: {total_new} new, {total_dup} duplicates, {len(conns)} connections")
            return {"ok": True, "connections_synced": len(conns), "new_transactions": total_new, "duplicates_skipped": total_dup}


# ── Sync engine ───────────────────────────────────────────────────────────

async def _sync_connection(session, conn: BankConnection, user_id: str) -> tuple:
    new_count = 0
    dup_count = 0
    page = 1
    has_more = True
    from_date = conn.import_start_date.isoformat() + "T00:00:00Z" if conn.import_start_date else None
    started_at = datetime.now(timezone.utc)
    existing_hashes = set()

    await _log_sync(session, user_id, conn.connection_id, "sync_started", "info", f"Starting sync for {conn.account_name}")
    result = await session.execute(select(Transaction.transaction_id).where(Transaction.user_id == user_id))
    for row in result.scalars().all():
        existing_hashes.add(row)

    try:
        while has_more:
            params = {
                "page": page,
                "page_size": SYNC_PAGE_SIZE,
            }
            if from_date:
                params["from"] = from_date
            try:
                data = await _tl_get(session, conn, f"/data/v1/accounts/{conn.account_id}/transactions", params=params)
            except Exception as e:
                try:
                    data = await _tl_get(session, conn, f"/data/v1/cards/{conn.account_id}/transactions", params=params)
                except Exception as e2:
                    await _log_sync(session, user_id, conn.connection_id, "sync_page_failed", "error", str(e)[:500])
                    raise

            results = data.get("results", [])
            if not results:
                break

            for tx in results:
                amount = float(tx.get("amount", 0))
                ts = tx.get("timestamp", tx.get("date", ""))
                desc = (tx.get("description") or tx.get("transaction_category", "") or "")[:200]
                merchant = (tx.get("merchant_name") or tx.get("meta", {}).get("provider_merchant_name") or "")[:255]
                cat = (tx.get("transaction_classification") or [""])[0] or "uncategorized"

                sync_id = transaction_sync_id(conn.connection_id, conn.account_id, tx, ts, desc, amount)
                if sync_id in existing_hashes:
                    dup_count += 1
                    continue

                try:
                    tx_date = datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else datetime.now(timezone.utc)
                except (ValueError, TypeError):
                    tx_date = datetime.now(timezone.utc)

                tx_obj = Transaction(
                    transaction_id=sync_id,
                    user_id=user_id,
                    account_id=conn.account_id,
                    connection_id=conn.connection_id,
                    amount=amount,
                    currency=tx.get("currency", "GBP"),
                    description=desc,
                    category=cat,
                    merchant_name=merchant or None,
                    date=tx_date,
                    source="truelayer",
                )
                session.add(tx_obj)
                existing_hashes.add(sync_id)
                new_count += 1

            total_pages = data.get("total_pages", data.get("totalPages", 1))
            has_more = page < total_pages
            page += 1

        # Also fetch and store current balance
        try:
            await _fetch_and_store_balances(session, conn)
        except Exception as e:
            logger.warning(f"balance sync failed for {conn.connection_id}: {e}")

        conn.update_count = (conn.update_count or 0) + 1
        await session.commit()

        # AI categorise uncategorized transactions after every sync
        try:
            result = await session.execute(
                select(Transaction).where(
                    Transaction.connection_id == conn.connection_id,
                    Transaction.user_id == user_id,
                    Transaction.category == "uncategorized",
                )
            )
            uncategorized = result.scalars().all()
            if uncategorized:
                cat_count = 0
                for tx in uncategorized[:50]:
                    new_cat = await _ai_categorise(tx.description, tx.merchant_name, tx.amount, session, user_id)
                    if new_cat and new_cat != "uncategorized":
                        tx.category = new_cat
                        cat_count += 1
                if cat_count:
                    await session.commit()
                    logger.info("AI categorised %s transactions for %s", cat_count, conn.connection_id)
        except Exception as e:
            logger.warning("AI categorisation failed for %s: %s", conn.connection_id, e)

        await _mark_connection_state(
            session,
            conn,
            status="active",
            synced_at=started_at,
        )
        await _log_sync(
            session,
            user_id,
            conn.connection_id,
            "sync_completed",
            "success",
            f"Imported {new_count} new, skipped {dup_count} duplicates from {conn.account_name}",
            {"new": new_count, "duplicates": dup_count},
        )
        return new_count, dup_count
    except Exception as e:
        status = "reconnect_required" if is_reauth_error(e) else "error"
        error = connection_error_message(e)
        conn.last_sync_status = status
        conn.last_error = error
        conn.last_error_at = datetime.now(timezone.utc)
        conn.status = status
        await session.commit()
        await _log_sync(
            session,
            user_id,
            conn.connection_id,
            "sync_failed",
            "error",
            error,
            {"status": status, "reconnect_required": status == "reconnect_required"},
        )
        raise
