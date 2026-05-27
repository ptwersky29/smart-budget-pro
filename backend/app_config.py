"""Admin-managed app configuration (TrueLayer credentials, etc.) stored in PostgreSQL.
Falls back to env vars when DB value is missing.
"""
import os
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, update

from db import AppConfig, User
from auth import get_current_user


class TrueLayerConfigIn(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    redirect_uri: Optional[str] = None
    environment: Optional[str] = None


async def get_config(session, key: str, env_fallback: Optional[str] = None) -> Optional[str]:
    result = await session.execute(select(AppConfig).where(AppConfig.key == key))
    doc = result.scalar_one_or_none()
    if doc and doc.value:
        return doc.value
    if env_fallback:
        return os.environ.get(env_fallback)
    return None


async def get_truelayer_config(session, user_id: Optional[str] = None) -> dict:
    per_user = {}
    if user_id:
        result = await session.execute(select(User).where(User.user_id == user_id))
        u = result.scalar_one_or_none()
        prefs = u.preferences or {} if u else {}
        per_user = prefs.get("truelayer") or {}
    cid = per_user.get("client_id") or await get_config(session, "truelayer_client_id", "TRUELAYER_CLIENT_ID")
    sec = per_user.get("client_secret") or await get_config(session, "truelayer_client_secret", "TRUELAYER_CLIENT_SECRET")
    redir = per_user.get("redirect_uri") or await get_config(session, "truelayer_redirect_uri", "TRUELAYER_REDIRECT_URI")
    env = per_user.get("environment") or await get_config(session, "truelayer_environment", None) or "sandbox"
    if not redir:
        base = os.environ.get("FRONTEND_URL", "")
        redir = f"{base}/api/truelayer/callback"
    if env == "live":
        auth_url = "https://auth.truelayer.com"
        token_url = "https://auth.truelayer.com/connect/token"
        api_url = "https://api.truelayer.com"
    else:
        auth_url = os.environ.get("TRUELAYER_AUTH_URL", "https://auth.truelayer-sandbox.com")
        token_url = os.environ.get("TRUELAYER_TOKEN_URL", "https://auth.truelayer-sandbox.com/connect/token")
        api_url = os.environ.get("TRUELAYER_API_URL", "https://api.truelayer-sandbox.com")
    return {
        "client_id": cid, "client_secret": sec, "redirect_uri": redir,
        "environment": env, "auth_url": auth_url, "token_url": token_url, "api_url": api_url,
        "source": "user" if per_user.get("client_id") else ("admin" if cid else "none"),
    }


def build_router() -> APIRouter:
    router = APIRouter(prefix="/admin", tags=["admin"])

    @router.get("/truelayer-config")
    async def get_tl_config(request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            cfg = await get_truelayer_config(session)
            return {
                "client_id": cfg["client_id"] or "",
                "has_secret": bool(cfg["client_secret"]),
                "redirect_uri": cfg["redirect_uri"],
                "environment": cfg["environment"],
                "auth_url": cfg["auth_url"],
            }

    @router.put("/truelayer-config")
    async def set_tl_config(payload: TrueLayerConfigIn, request: Request,
                            user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            mapping = {
                "truelayer_client_id": payload.client_id,
                "truelayer_client_secret": payload.client_secret,
                "truelayer_redirect_uri": payload.redirect_uri,
                "truelayer_environment": payload.environment,
            }
            for k, v in mapping.items():
                if v is not None and v != "":
                    existing = await session.execute(select(AppConfig).where(AppConfig.key == k))
                    cfg = existing.scalar_one_or_none()
                    if cfg:
                        cfg.value = v
                    else:
                        session.add(AppConfig(key=k, value=v))
            await session.commit()
            return {"ok": True}

    return router
