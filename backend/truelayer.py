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

from auth import get_current_user
from app_config import get_truelayer_config

logger = logging.getLogger("truelayer")

SCOPES = "info accounts balance cards transactions direct_debits standing_orders offline_access"
PROVIDERS = "uk-cs-mock uk-ob-all uk-oauth-all"  # sandbox MockBank + real providers


def build_router() -> APIRouter:
    router = APIRouter(prefix="/truelayer", tags=["truelayer"])

    @router.get("/auth-url")
    async def get_auth_url(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        cfg = await get_truelayer_config(db, user_id=user["user_id"])
        if not cfg["client_id"] or not cfg["client_secret"]:
            raise HTTPException(400, "TrueLayer not configured. Add credentials in Integrations.")
        state = secrets.token_urlsafe(24)
        nonce = secrets.token_urlsafe(16)
        await db.truelayer_states.insert_one({
            "state": state,
            "nonce": nonce,
            "user_id": user["user_id"],
            "created_at": datetime.now(timezone.utc),
            "consumed": False,
        })
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
        await _log(db, user["user_id"], "auth_url_generated", {"state": state, "env": cfg["environment"]})
        return {"auth_url": auth_url, "state": state, "redirect_uri": cfg["redirect_uri"]}

    @router.get("/callback")
    async def callback(request: Request,
                       code: str = Query(None),
                       state: str = Query(None),
                       error: str = Query(None),
                       error_description: str = Query(None)):
        """OAuth callback - exchanges code for tokens and redirects to frontend."""
        db = request.app.state.db
        frontend = os.environ.get("FRONTEND_URL", "")

        if error:
            await _log(db, None, "callback_error", {"error": error, "desc": error_description})
            return RedirectResponse(f"{frontend}/connections?status=failed&reason={error}")

        if not code or not state:
            return RedirectResponse(f"{frontend}/connections?status=failed&reason=missing_params")

        state_doc = await db.truelayer_states.find_one({"state": state})
        if not state_doc or state_doc.get("consumed"):
            await _log(db, None, "invalid_state", {"state": state})
            return RedirectResponse(f"{frontend}/connections?status=failed&reason=invalid_state")

        user_id = state_doc["user_id"]
        try:
            token_data = await _exchange_code(db, code, user_id=user_id)
        except Exception as e:
            await _log(db, user_id, "token_exchange_failed", {"error": str(e)})
            return RedirectResponse(f"{frontend}/connections?status=failed&reason=token_exchange")

        # Identify provider via /data/v1/me
        provider_info = await _fetch_me(token_data["access_token"])

        connection_id = f"conn_{uuid.uuid4().hex[:12]}"
        await db.bank_connections.insert_one({
            "connection_id": connection_id,
            "user_id": user_id,
            "provider_id": provider_info.get("provider", {}).get("provider_id", "unknown"),
            "provider_name": provider_info.get("provider", {}).get("display_name", "Sandbox Bank"),
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token"),
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "active",
        })
        await db.truelayer_states.update_one({"state": state}, {"$set": {"consumed": True}})
        await _log(db, user_id, "connection_success", {"connection_id": connection_id})
        return RedirectResponse(f"{frontend}/connections?status=success&connection_id={connection_id}")

    @router.get("/connections")
    async def list_connections(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        rows = await db.bank_connections.find(
            {"user_id": user["user_id"]},
            {"_id": 0, "access_token": 0, "refresh_token": 0}
        ).to_list(100)
        return {"connections": rows}

    @router.delete("/connections/{connection_id}")
    async def remove_connection(connection_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        result = await db.bank_connections.delete_one({"connection_id": connection_id, "user_id": user["user_id"]})
        if result.deleted_count == 0:
            raise HTTPException(404, "Connection not found")
        return {"ok": True}

    @router.post("/refresh/{connection_id}")
    async def refresh_connection(connection_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        conn = await db.bank_connections.find_one({"connection_id": connection_id, "user_id": user["user_id"]})
        if not conn:
            raise HTTPException(404, "Connection not found")
        if not conn.get("refresh_token"):
            raise HTTPException(400, "No refresh token")
        try:
            token_data = await _refresh_access_token(db, conn["refresh_token"], user_id=user["user_id"])
            await db.bank_connections.update_one(
                {"connection_id": connection_id},
                {"$set": {
                    "access_token": token_data["access_token"],
                    "refresh_token": token_data.get("refresh_token", conn["refresh_token"]),
                    "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))).isoformat(),
                    "status": "active",
                }}
            )
            await _log(db, user["user_id"], "refresh_success", {"connection_id": connection_id})
            return {"ok": True}
        except Exception as e:
            await _log(db, user["user_id"], "refresh_failed", {"error": str(e)})
            raise HTTPException(500, f"Refresh failed: {e}")

    @router.get("/logs")
    async def get_logs(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        logs = await db.truelayer_logs.find(
            {"user_id": user["user_id"]}, {"_id": 0}
        ).sort("created_at", -1).limit(50).to_list(50)
        return {"logs": logs}

    return router


async def _exchange_code(db, code: str, user_id: Optional[str] = None) -> dict:
    cfg = await get_truelayer_config(db, user_id=user_id)
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


async def _refresh_access_token(db, refresh_token: str, user_id: Optional[str] = None) -> dict:
    cfg = await get_truelayer_config(db, user_id=user_id)
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


async def _log(db, user_id, event, payload):
    try:
        await db.truelayer_logs.insert_one({
            "log_id": str(uuid.uuid4()),
            "user_id": user_id,
            "event": event,
            "payload": payload,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error(f"log fail: {e}")
