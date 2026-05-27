"""Per-user integrations: Twilio + TrueLayer test/connect endpoints."""
import os
import logging
import httpx
from base64 import b64encode

from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from auth import get_current_user
from app_config import get_truelayer_config

logger = logging.getLogger("integrations")


class TwilioIn(BaseModel):
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    phone_number: Optional[str] = None


class TrueLayerIn(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    redirect_uri: Optional[str] = None
    environment: Optional[str] = None  # "sandbox" | "live"


def build_router() -> APIRouter:
    router = APIRouter(prefix="/integrations", tags=["integrations"])

    # ===== Per-user Twilio =====
    @router.get("/twilio")
    async def get_twilio(request: Request, user: dict = Depends(get_current_user)):
        u = await request.app.state.db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
        tw = (u or {}).get("twilio") or {}
        return {
            "account_sid": tw.get("account_sid", ""),
            "has_token": bool(tw.get("auth_token")),
            "phone_number": tw.get("phone_number", ""),
            "webhook_url": f"{os.environ.get('FRONTEND_URL', '')}/api/sms/webhook",
            "verified": bool(tw.get("verified_at")),
        }

    @router.put("/twilio")
    async def put_twilio(payload: TwilioIn, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        update = {}
        if payload.account_sid is not None:
            update["twilio.account_sid"] = payload.account_sid
        if payload.auth_token:
            update["twilio.auth_token"] = payload.auth_token
        if payload.phone_number is not None:
            update["twilio.phone_number"] = payload.phone_number
        if not update:
            raise HTTPException(400, "Nothing to save")
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
        # Map sms_sender (the user's mobile that texts INTO Twilio) is configured separately
        if payload.phone_number:
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"sms_inbox_number": payload.phone_number}},
            )
        return {"ok": True}

    @router.post("/twilio/test")
    async def test_twilio(request: Request, user: dict = Depends(get_current_user)):
        """Verifies the saved Twilio credentials by calling the Accounts API."""
        u = await request.app.state.db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
        tw = (u or {}).get("twilio") or {}
        sid, token = tw.get("account_sid"), tw.get("auth_token")
        if not sid or not token:
            raise HTTPException(400, "Twilio credentials missing — save SID and Auth Token first.")
        try:
            auth = b64encode(f"{sid}:{token}".encode()).decode()
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(
                    f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json",
                    headers={"Authorization": f"Basic {auth}"},
                )
            if r.status_code != 200:
                raise HTTPException(401, f"Twilio rejected credentials ({r.status_code}). Check SID & Auth Token.")
            data = r.json()
            from datetime import datetime, timezone
            await request.app.state.db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"twilio.verified_at": datetime.now(timezone.utc).isoformat(),
                          "twilio.friendly_name": data.get("friendly_name"),
                          "twilio.status": data.get("status")}},
            )
            return {"ok": True, "friendly_name": data.get("friendly_name"), "status": data.get("status")}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"twilio test failed: {e}")
            raise HTTPException(502, f"Twilio request failed: {str(e)[:150]}")

    # ===== TrueLayer test =====
    @router.get("/truelayer")
    async def get_truelayer(request: Request, user: dict = Depends(get_current_user)):
        """Returns the effective TrueLayer config for this user (per-user → admin → env)."""
        db = request.app.state.db
        u = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
        per_user = (u or {}).get("truelayer") or {}
        admin_cfg = await get_truelayer_config(db)
        # Prefer per-user values when present
        client_id = per_user.get("client_id") or admin_cfg["client_id"]
        has_secret = bool(per_user.get("client_secret") or admin_cfg["client_secret"])
        env = per_user.get("environment") or admin_cfg["environment"]
        redirect = per_user.get("redirect_uri") or admin_cfg["redirect_uri"]
        return {
            "client_id": client_id or "",
            "has_secret": has_secret,
            "environment": env,
            "redirect_uri": redirect,
            "source": "user" if per_user.get("client_id") else ("admin" if admin_cfg["client_id"] else "none"),
        }

    @router.put("/truelayer")
    async def put_truelayer(payload: TrueLayerIn, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        update = {}
        if payload.client_id is not None:
            update["truelayer.client_id"] = payload.client_id
        if payload.client_secret:
            update["truelayer.client_secret"] = payload.client_secret
        if payload.redirect_uri is not None:
            update["truelayer.redirect_uri"] = payload.redirect_uri
        if payload.environment in ("sandbox", "live"):
            update["truelayer.environment"] = payload.environment
        if not update:
            raise HTTPException(400, "Nothing to save")
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
        return {"ok": True}

    @router.post("/truelayer/test")
    async def test_truelayer(request: Request, user: dict = Depends(get_current_user)):
        """Confirms TrueLayer credentials can mint an auth URL (does not perform a full OAuth)."""
        db = request.app.state.db
        u = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
        per_user = (u or {}).get("truelayer") or {}
        admin_cfg = await get_truelayer_config(db)
        client_id = per_user.get("client_id") or admin_cfg["client_id"]
        client_secret = per_user.get("client_secret") or admin_cfg["client_secret"]
        env = per_user.get("environment") or admin_cfg["environment"] or "sandbox"
        auth_url = "https://auth.truelayer.com" if env == "live" else "https://auth.truelayer-sandbox.com"
        if not client_id or not client_secret:
            raise HTTPException(400, "TrueLayer not configured. Add Client ID and Client Secret.")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(f"{auth_url}/.well-known/openid-configuration")
            ok = r.status_code in (200, 301, 302)
        except Exception:
            ok = False
        return {
            "ok": ok,
            "environment": env,
            "auth_host_reachable": ok,
            "client_id": (client_id[:8] + "…") if client_id else "",
            "source": "user" if per_user.get("client_id") else "admin",
        }

    return router
