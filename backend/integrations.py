"""Integrations — lists available integration providers and their status.
System-wide Twilio config is in sms.py; other integrations are detected by checking env vars."""
import logging
import os
from fastapi import APIRouter, HTTPException, Request, Depends
from auth import get_current_user, require_admin
from sqlalchemy import select
from db import get_session_maker
import httpx

logger = logging.getLogger("integrations")


def _check_provider(key: str) -> dict:
    present = bool(os.environ.get(key))
    return {"name": key, "configured": present}


def build_router() -> APIRouter:
    router = APIRouter(prefix="/integrations", tags=["integrations"])

    @router.get("/status")
    async def integration_status():
        providers = [
            _check_provider("STRIPE_API_KEY"),
            _check_provider("OPENROUTER_API_KEY"),
            _check_provider("GOOGLE_CLIENT_ID"),
            _check_provider("TRUELAYER_CLIENT_ID"),
        ]
        return {
            "providers": providers,
            "configured_count": sum(1 for p in providers if p["configured"]),
            "total": len(providers),
        }

    @router.get("/twilio")
    async def get_twilio_config(user: dict = Depends(get_current_user)):
        twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        return {
            "configured": bool(twilio_sid),
            "has_token": bool(twilio_sid),
            "verified": bool(twilio_sid),
        }

    @router.put("/twilio")
    async def update_twilio_config(request: Request, user: dict = Depends(require_admin)):
        body = await request.json()
        sm = request.app.state.db
        async with sm() as session:
            from db import AppConfig
            result = await session.execute(
                select(AppConfig).where(AppConfig.key == "twilio_config")
            )
            row = result.scalar_one_or_none()
            if row:
                row.value = body
            else:
                session.add(AppConfig(key="twilio_config", value=body))
            await session.commit()
            return {"ok": True}

    @router.post("/twilio/test")
    async def test_twilio_config(request: Request, user: dict = Depends(require_admin)):
        twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID")
        twilio_token = os.environ.get("TWILIO_AUTH_TOKEN")
        if not twilio_sid or not twilio_token:
            raise HTTPException(400, "Twilio not configured")
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}.json",
                    auth=(twilio_sid, twilio_token), timeout=10
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        except Exception as e:
            raise HTTPException(502, f"Twilio test failed: {e}")

    return router
