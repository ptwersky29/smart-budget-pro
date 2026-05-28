"""Phase 9 — User-facing app settings: language, theme, currency."""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from db import User
from auth import get_current_user

logger = logging.getLogger("app_settings")


class AppSettingsIn(BaseModel):
    language: Optional[str] = Field(None, max_length=8)
    theme: Optional[str] = Field(None, max_length=16)
    currency: Optional[str] = Field(None, max_length=4)
    onboarding_completed: Optional[bool] = None


VALID_LANGUAGES = {"en", "he", "yi", "fr"}
VALID_THEMES = {"light", "dark", "system"}
VALID_CURRENCIES = {"GBP", "USD", "EUR", "ILS"}


def build_router() -> APIRouter:
    router = APIRouter(prefix="/settings", tags=["settings"])

    @router.get("/app")
    async def get_settings(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            return {
                "language": u.app_language or "en",
                "theme": u.app_theme or "system",
                "currency": u.app_currency or "GBP",
                "onboarding_completed": u.onboarding_completed,
            }

    @router.put("/app")
    async def update_settings(payload: AppSettingsIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            if payload.language:
                if payload.language not in VALID_LANGUAGES:
                    raise HTTPException(400, f"Invalid language. Valid: {', '.join(sorted(VALID_LANGUAGES))}")
                u.app_language = payload.language
            if payload.theme:
                if payload.theme not in VALID_THEMES:
                    raise HTTPException(400, f"Invalid theme. Valid: {', '.join(sorted(VALID_THEMES))}")
                u.app_theme = payload.theme
            if payload.currency:
                if payload.currency not in VALID_CURRENCIES:
                    raise HTTPException(400, f"Invalid currency. Valid: {', '.join(sorted(VALID_CURRENCIES))}")
                u.app_currency = payload.currency
            if payload.onboarding_completed is not None:
                u.onboarding_completed = payload.onboarding_completed
            await session.commit()
            return {
                "status": "updated",
                "language": u.app_language,
                "theme": u.app_theme,
                "currency": u.app_currency,
                "onboarding_completed": u.onboarding_completed,
            }

    @router.get("/health")
    async def settings_health():
        return {"status": "ok"}

    return router
