"""Admin-managed app configuration (TrueLayer credentials) stored in PostgreSQL.
Falls back to env vars when DB value is missing.
"""
import os
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy import select
from typing import Optional

from db import AppConfig
from auth import get_current_user


async def get_config(session, key: str, env_var: str) -> str:
    val = os.environ.get(env_var)
    if not val:
        r = await session.execute(select(AppConfig).where(AppConfig.key == key))
        c = r.scalar_one_or_none()
        if c and c.value:
            val = c.value
    return val or ""


class TrueLayerConfigIn(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    redirect_uri: Optional[str] = None
    environment: Optional[str] = None


def build_router() -> APIRouter:
    router = APIRouter(prefix="/admin", tags=["admin"])

    @router.get("/truelayer-config")
    async def get_tl_config(request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            async def _get(key: str, env_var: str) -> str:
                import os
                val = os.environ.get(env_var)
                if not val:
                    from sqlalchemy import select
                    r = await session.execute(select(AppConfig).where(AppConfig.key == f"truelayer_{key}"))
                    c = r.scalar_one_or_none()
                    if c and c.value:
                        val = c.value
                return val or ""
            return {
                "client_id": await _get("client_id", "TRUELAYER_CLIENT_ID"),
                "has_secret": bool(await _get("client_secret", "TRUELAYER_CLIENT_SECRET")),
                "redirect_uri": await _get("redirect_uri", "TRUELAYER_REDIRECT_URI"),
                "environment": os.environ.get("TRUELAYER_ENVIRONMENT", "sandbox"),
            }

    @router.put("/truelayer-config")
    async def set_tl_config(payload: TrueLayerConfigIn, request: Request,
                            user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            from sqlalchemy import select
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
