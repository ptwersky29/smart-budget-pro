"""TrueLayer Open Banking — OAuth, auto-refresh, transaction sync, dedup, retry, encrypted tokens."""
import os
import uuid
import secrets
import hashlib
import hmac
import json
import logging
from base64 import b64encode, b64decode
from datetime import datetime, timezone, timedelta, date
from urllib.parse import urlencode, urlparse
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select, delete, func

from db import TrueLayerState, BankConnection, TrueLayerLog, SyncLog, Transaction
from auth import get_current_user
from bank_sync_utils import (
    parse_import_from_date,
    is_reauth_error,
    connection_error_message,
    transaction_sync_id,
)

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

    env = os.environ.get("TRUELAYER_ENVIRONMENT", "sandbox")
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
    if token_data.get("refresh_token"):
        conn.refresh_token = _encrypt(token_data["refresh_token"])
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
                import asyncio
                wait = 2 ** attempt
                logger.warning(f"rate limited, retrying in {wait}s")
                await asyncio.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            if attempt < MAX_RETRIES - 1:
                import asyncio
                await asyncio.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"TrueLayer API error {path}: {e.response.status_code} {e.response.text[:500]}")
        except httpx.RequestError as e:
            if attempt < MAX_RETRIES - 1:
                import asyncio
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
            return r.json().get("results", [])
    except Exception as e:
        logger.warning(f"/data/v1/accounts failed: {e}")
    # Fallback to /me for backwards compatibility
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(f"{cfg['api_url']}/data/v1/me", headers={"Authorization": f"Bearer {access_token}"})
        if r.status_code == 200:
            return r.json().get("results", [])
    except Exception as e:
        logger.warning(f"/data/v1/me fallback also failed: {e}")
    return []

async def _fetch_and_store_balances(session, token: str, conn: BankConnection, cfg: dict):
    """Fetch balance for a single account and store it."""
    account_id = conn.account_id
    if not account_id:
        return
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{cfg['api_url']}/data/v1/accounts/{account_id}/balance",
                headers={"Authorization": f"Bearer {token}"},
            )
        if r.status_code == 200:
            results = r.json().get("results", [])
            if results:
                bal = results[0]
                conn.balance = float(bal.get("balance", 0))
                conn.balance_currency = bal.get("currency", "GBP")
                conn.balance_updated_at = datetime.now(timezone.utc)
                await session.commit()
    except Exception as e:
        logger.warning(f"balance fetch failed for {account_id}: {e}")


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
        """Derive the TrueLayer callback URL from the request.

        Always derive from the live request so the redirect_uri exactly matches
        the host the browser used to reach us (and what's registered in the
        TrueLayer Console). Ignore any stale value in cfg/env to avoid
        "Invalid redirect_uri" errors from mismatched dev/prod URLs.
        """
        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        if scheme not in ("http", "https"):
            scheme = "https"
        host = (
            request.headers.get("x-forwarded-host")
            or request.headers.get("host")
            or request.url.hostname
            or urlparse(os.environ.get("RENDER_EXTERNAL_URL", "")).hostname
            or "financeai-api.onrender.com"
        )
        return f"{scheme}://{host}/api/truelayer/callback"

    @router.get("/auth-url")
    async def get_auth_url(request: Request, from_date: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            if not await _is_configured(session):
                raise HTTPException(400, "TrueLayer not configured by the administrator.")
            cfg = await _tl_config_from_db(session)
            env = cfg.get("environment", "sandbox")
            # Use correct providers per environment
            providers = "uk-cs-mock uk-ob-all uk-oauth-all" if env == "sandbox" else "uk-ob-all uk-oauth-all"
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
            params = {
                "response_type": "code", "client_id": cfg["client_id"],
                "scope": SCOPES, "redirect_uri": redirect_uri,
                "providers": providers, "state": state, "nonce": nonce,
            }
            auth_url = f"{cfg['auth_url']}/?{urlencode(params)}"
            await _log_oauth(session, user["user_id"], "auth_url_generated", {"state": state, "redirect_uri": redirect_uri})
            await session.commit()
            return {"auth_url": auth_url, "state": state, "redirect_uri": redirect_uri}

    @router.get("/callback")
    async def callback(request: Request, code: str = Query(None), state: str = Query(None), error: str = Query(None), error_description: str = Query(None)):
        sm = request.app.state.db
        async with sm() as session:
            frontend = os.environ.get("FRONTEND_URL", "")
            if error:
                await _log_oauth(session, None, "callback_error", {"error": error, "desc": error_description})
                return RedirectResponse(f"{frontend}/connections?status=failed&reason={error}")
            if not code or not state:
                return RedirectResponse(f"{frontend}/connections?status=failed&reason=missing_params")
            result = await session.execute(select(TrueLayerState).where(TrueLayerState.state == state))
            state_doc = result.scalar_one_or_none()
            if not state_doc:
                return RedirectResponse(f"{frontend}/connections?status=failed&reason=invalid_state")
            user_id = state_doc.user_id
            state_meta = state_doc.meta or {}
            import_from_date = state_meta.get("from_date") if isinstance(state_meta, dict) else None
            connection_id_to_update = state_meta.get("connection_id") if isinstance(state_meta, dict) else None
            try:
                token_data = await _exchange_code(code, state_doc.redirect_uri, session)
            except Exception as e:
                await _log_oauth(session, user_id, "token_exchange_failed", {"error": str(e)})
                return RedirectResponse(f"{frontend}/connections?status=failed&reason=token_exchange")

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
                    existing.refresh_token = _encrypt(token_data.get("refresh_token", ""))
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
                    return RedirectResponse(f"{frontend}/connections?status=success&accounts=1")

            # New connection flow
            accounts = await _fetch_accounts(token_data["access_token"], session)
            if not accounts:
                await _log_oauth(session, user_id, "no_accounts_selected", {"state": state, "meta": state_meta})
                await session.delete(state_doc)
                await session.commit()
                return RedirectResponse(f"{frontend}/connections?status=failed&reason=no_accounts")
            created_connections = []
            for acc in accounts:
                provider_info = acc.get("provider", {})
                connection_id = f"conn_{uuid.uuid4().hex[:12]}"
                conn = BankConnection(
                    connection_id=connection_id, user_id=user_id, provider="truelayer",
                    account_id=acc.get("account_id") or provider_info.get("provider_id", "unknown"),
                    account_name=acc.get("display_name") or provider_info.get("display_name", "UK Bank"),
                    account_type=acc.get("account_type", ""),
                    access_token=_encrypt(token_data["access_token"]),
                    refresh_token=_encrypt(token_data.get("refresh_token", "")),
                    expires_at=datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600)),
                    import_start_date=import_from_date,
                    config={"account_ids": [acc.get("account_id", "")]} if acc.get("account_id") else None,
                    status="active",
                    last_sync_status="connected",
                )
                session.add(conn)
                created_connections.append(conn)
            await session.delete(state_doc)
            await _log_oauth(session, user_id, "connection_success", {"accounts_count": len(accounts)})
            await session.commit()
            # Trigger initial sync for all new connections
            for conn in created_connections:
                try:
                    _, _ = await _sync_connection(session, conn, user_id)
                except Exception as e:
                    logger.error(f"initial sync failed for {conn.connection_id}: {e}")
            return RedirectResponse(f"{frontend}/connections?status=success&accounts={len(accounts)}")

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
            providers = "uk-cs-mock uk-ob-all uk-oauth-all" if env == "sandbox" else "uk-ob-all uk-oauth-all"
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
            params = {
                "response_type": "code", "client_id": cfg["client_id"],
                "scope": SCOPES, "redirect_uri": redirect_uri,
                "providers": providers, "state": state, "nonce": nonce,
            }
            auth_url = f"{cfg['auth_url']}/?{urlencode(params)}"
            await session.commit()
            return {"auth_url": auth_url, "state": state, "redirect_uri": redirect_uri}

    @router.post("/sync")
    async def sync_transactions(request: Request, user: dict = Depends(get_current_user)):
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
            cfg = await _tl_config_from_db(session)
            token = await _get_valid_token(session, conn)
            await _fetch_and_store_balances(session, token, conn, cfg)
        except Exception as e:
            logger.warning(f"balance sync failed for {conn.connection_id}: {e}")

        conn.update_count = (conn.update_count or 0) + 1
        await session.commit()
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
