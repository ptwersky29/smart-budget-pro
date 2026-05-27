"""TrueLayer Sandbox OAuth integration."""
import os
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy import select, update, delete

from db import TrueLayerState, BankConnection, TrueLayerLog
from auth import get_current_user
from app_config import get_truelayer_config

logger = logging.getLogger("truelayer")

SCOPES = "info accounts balance cards transactions direct_debits standing_orders offline_access"
PROVIDERS = "uk-cs-mock uk-ob-all uk-oauth-all"


def build_router() -> APIRouter:
    router = APIRouter(prefix="/truelayer", tags=["truelayer"])

    @router.get("/auth-url")
    async def get_auth_url(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            cfg = await get_truelayer_config(session, user_id=user["user_id"])
            if not cfg["client_id"] or not cfg["client_secret"]:
                raise HTTPException(400, "TrueLayer not configured. Add credentials in Integrations.")
            state = secrets.token_urlsafe(24)
            nonce = secrets.token_urlsafe(16)
            session.add(TrueLayerState(
                state=state,
                user_id=user["user_id"],
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            ))
            params = {
                "response_type": "code",
                "client_id": cfg["client_id"],
                "scope": SCOPES,
                "redirect_uri": cfg["redirect_uri"],
                "providers": PROVIDERS,
                "state": state,
                "nonce": nonce,
            }
            auth_url = f"{cfg['auth_url']}/?{urlencode(params)}"
            await _log(session, user["user_id"], "auth_url_generated", {"state": state, "env": cfg["environment"]})
            await session.commit()
            return {"auth_url": auth_url, "state": state, "redirect_uri": cfg["redirect_uri"]}

    @router.get("/callback")
    async def callback(request: Request,
                       code: str = Query(None),
                       state: str = Query(None),
                       error: str = Query(None),
                       error_description: str = Query(None)):
        sm = request.app.state.db
        async with sm() as session:
            frontend = os.environ.get("FRONTEND_URL", "")

            if error:
                await _log(session, None, "callback_error", {"error": error, "desc": error_description})
                return RedirectResponse(f"{frontend}/connections?status=failed&reason={error}")

            if not code or not state:
                return RedirectResponse(f"{frontend}/connections?status=failed&reason=missing_params")

            result = await session.execute(
                select(TrueLayerState).where(TrueLayerState.state == state)
            )
            state_doc = result.scalar_one_or_none()
            if not state_doc:
                await _log(session, None, "invalid_state", {"state": state})
                return RedirectResponse(f"{frontend}/connections?status=failed&reason=invalid_state")

            user_id = state_doc.user_id
            try:
                token_data = await _exchange_code(session, code, user_id=user_id)
            except Exception as e:
                await _log(session, user_id, "token_exchange_failed", {"error": str(e)})
                return RedirectResponse(f"{frontend}/connections?status=failed&reason=token_exchange")

            provider_info = await _fetch_me(token_data["access_token"])

            connection_id = f"conn_{uuid.uuid4().hex[:12]}"
            conn = BankConnection(
                connection_id=connection_id,
                user_id=user_id,
                provider="truelayer",
                account_id=provider_info.get("provider", {}).get("provider_id", "unknown"),
                account_name=provider_info.get("provider", {}).get("display_name", "Sandbox Bank"),
                access_token=token_data["access_token"],
                refresh_token=token_data.get("refresh_token"),
                expires_at=datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600)),
                status="active",
            )
            session.add(conn)
            await session.delete(state_doc)
            await _log(session, user_id, "connection_success", {"connection_id": connection_id})
            await session.commit()
            return RedirectResponse(f"{frontend}/connections?status=success&connection_id={connection_id}")

    @router.get("/connections")
    async def list_connections(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankConnection).where(BankConnection.user_id == user["user_id"])
            )
            rows = result.scalars().all()
            return {"connections": [
                {"connection_id": c.connection_id, "account_id": c.account_id,
                 "account_name": c.account_name, "provider": c.provider,
                 "status": c.status, "created_at": c.created_at.isoformat() if c.created_at else None}
                for c in rows
            ]}

    @router.delete("/connections/{connection_id}")
    async def remove_connection(connection_id: str, request: Request, user: dict = Depends(get_current_user)):
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
            await session.delete(conn)
            await session.commit()
            return {"ok": True}

    @router.post("/refresh/{connection_id}")
    async def refresh_connection(connection_id: str, request: Request, user: dict = Depends(get_current_user)):
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
            if not conn.refresh_token:
                raise HTTPException(400, "No refresh token")
            try:
                token_data = await _refresh_access_token(session, conn.refresh_token, user_id=user["user_id"])
                conn.access_token = token_data["access_token"]
                conn.refresh_token = token_data.get("refresh_token", conn.refresh_token)
                conn.expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))
                conn.status = "active"
                await _log(session, user["user_id"], "refresh_success", {"connection_id": connection_id})
                await session.commit()
                return {"ok": True}
            except Exception as e:
                await _log(session, user["user_id"], "refresh_failed", {"error": str(e)})
                raise HTTPException(500, f"Refresh failed: {e}")

    @router.get("/logs")
    async def get_logs(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(TrueLayerLog).where(TrueLayerLog.user_id == user["user_id"])
                .order_by(TrueLayerLog.created_at.desc()).limit(50)
            )
            logs = result.scalars().all()
            return {"logs": [
                {"id": str(l.id), "endpoint": l.endpoint,
                 "status_code": l.status_code, "error": l.error,
                 "created_at": l.created_at.isoformat() if l.created_at else None}
                for l in logs
            ]}

    return router


async def _exchange_code(session, code: str, user_id: Optional[str] = None) -> dict:
    cfg = await get_truelayer_config(session, user_id=user_id)
    data = {
        "grant_type": "authorization_code",
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "redirect_uri": cfg["redirect_uri"],
        "code": code,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            cfg["token_url"], data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if r.status_code != 200:
        raise RuntimeError(f"Token exchange failed: {r.status_code} {r.text}")
    return r.json()


async def _refresh_access_token(session, refresh_token: str, user_id: Optional[str] = None) -> dict:
    cfg = await get_truelayer_config(session, user_id=user_id)
    data = {
        "grant_type": "refresh_token",
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "refresh_token": refresh_token,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            cfg["token_url"], data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if r.status_code != 200:
        raise RuntimeError(f"Refresh failed: {r.status_code} {r.text}")
    return r.json()


async def _fetch_me(access_token: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"{os.environ['TRUELAYER_API_URL']}/data/v1/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if r.status_code == 200:
            results = r.json().get("results", [])
            return results[0] if results else {}
    except Exception as e:
        logger.warning(f"/me failed: {e}")
    return {}


async def _log(session, user_id, event, payload):
    try:
        log = TrueLayerLog(
            user_id=user_id,
            endpoint=event,
            request_body=payload,
        )
        session.add(log)
        await session.commit()
    except Exception as e:
        logger.error(f"log fail: {e}")
