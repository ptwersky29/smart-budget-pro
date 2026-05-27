"""Per-user integrations: Twilio + TrueLayer test/connect endpoints."""
import os
import logging
from datetime import datetime, timezone
import httpx
from base64 import b64encode

from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select

from db import User, get_session_maker
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
    environment: Optional[str] = None


def build_router() -> APIRouter:
    router = APIRouter(prefix="/integrations", tags=["integrations"])

    @router.get("/twilio")
    async def get_twilio(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = result.scalar_one_or_none()
            prefs = u.preferences or {} if u else {}
            tw = prefs.get("twilio") or {}
            return {
                "account_sid": tw.get("account_sid", ""),
                "has_token": bool(tw.get("auth_token")),
                "phone_number": tw.get("phone_number", ""),
                "webhook_url": f"{os.environ.get('FRONTEND_URL', '')}/api/sms/webhook",
                "verified": bool(tw.get("verified_at")),
            }

    @router.put("/twilio")
    async def put_twilio(payload: TwilioIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = result.scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            prefs = u.preferences or {}
            tw = prefs.get("twilio") or {}
            if payload.account_sid is not None:
                tw["account_sid"] = payload.account_sid
            if payload.auth_token:
                tw["auth_token"] = payload.auth_token
            if payload.phone_number is not None:
                tw["phone_number"] = payload.phone_number
            prefs["twilio"] = tw
            u.preferences = prefs
            await session.commit()
            return {"ok": True}

    @router.post("/twilio/test")
    async def test_twilio(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = result.scalar_one_or_none()
            prefs = u.preferences or {} if u else {}
            tw = prefs.get("twilio") or {}
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
                tw["verified_at"] = datetime.now(timezone.utc).isoformat()
                tw["friendly_name"] = data.get("friendly_name")
                tw["status"] = data.get("status")
                prefs["twilio"] = tw
                u.preferences = prefs
                await session.commit()
                return {"ok": True, "friendly_name": data.get("friendly_name"), "status": data.get("status")}
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"twilio test failed: {e}")
                raise HTTPException(502, f"Twilio request failed: {str(e)[:150]}")

    @router.get("/truelayer")
    async def get_truelayer(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = result.scalar_one_or_none()
            prefs = u.preferences or {} if u else {}
            per_user = prefs.get("truelayer") or {}
            admin_cfg = await get_truelayer_config(session)
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
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = result.scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            prefs = u.preferences or {}
            tl = prefs.get("truelayer") or {}
            if payload.client_id is not None:
                tl["client_id"] = payload.client_id
            if payload.client_secret:
                tl["client_secret"] = payload.client_secret
            if payload.redirect_uri is not None:
                tl["redirect_uri"] = payload.redirect_uri
            if payload.environment in ("sandbox", "live"):
                tl["environment"] = payload.environment
            prefs["truelayer"] = tl
            u.preferences = prefs
            await session.commit()
            return {"ok": True}

    @router.post("/truelayer/test")
    async def test_truelayer(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = result.scalar_one_or_none()
            prefs = u.preferences or {} if u else {}
            per_user = prefs.get("truelayer") or {}
            admin_cfg = await get_truelayer_config(session)
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
