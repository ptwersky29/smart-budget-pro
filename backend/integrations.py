"""Per-user integrations: Twilio."""
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

logger = logging.getLogger("integrations")


class TwilioIn(BaseModel):
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    phone_number: Optional[str] = None


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

    return router
