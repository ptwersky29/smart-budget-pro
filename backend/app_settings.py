"""User-facing app settings: language, theme, currency, preferences, and more."""
import copy
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from db import User
from auth import get_current_user

logger = logging.getLogger("app_settings")

# ── Default preferences JSON ─────────────────────────────────────────────
DEFAULT_PREFERENCES = {
    "appearance": {"density": "comfortable", "font_size": "medium"},
    "dashboard": {
        "layout": "default",
        "widgets": ["overview", "recent_transactions", "budget_summary", "ai_insights", "spending_chart", "upcoming_events"],
    },
    "automation": {"ai_enabled": True, "auto_categorize": True, "predict_budget": True},
    "notifications": {
        "email_alerts": True,
        "push_alerts": True,
        "sms_alerts": False,
        "budget_reminders": True,
        "weekly_report": True,
        "spending_alerts": True,
    },
    "accessibility": {"high_contrast": False, "font_scaling": 100, "keyboard_navigation": True, "reduce_motion": False},
}


class AppSettingsIn(BaseModel):
    language: Optional[str] = Field(None, max_length=8)
    theme: Optional[str] = Field(None, max_length=16)
    currency: Optional[str] = Field(None, max_length=4)
    onboarding_completed: Optional[bool] = None
    preferences: Optional[dict] = None  # partial deep-merge into stored JSON


VALID_LANGUAGES = {"en", "he", "yi", "fr"}
VALID_THEMES = {"light", "dark", "system"}
VALID_CURRENCIES = {"GBP", "USD", "EUR", "ILS"}


def _deep_merge(base: dict, overlay: dict) -> dict:
    """Recursively merge overlay into base (mutates base)."""
    for key, value in overlay.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def build_router() -> APIRouter:
    router = APIRouter(prefix="/settings", tags=["settings"])

    @router.get("/app")
    async def get_settings(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            stored = copy.deepcopy(u.preferences) if u.preferences else {}
            merged = _deep_merge(copy.deepcopy(DEFAULT_PREFERENCES), stored)
            return {
                "language": u.app_language or "en",
                "theme": u.app_theme or "system",
                "currency": u.app_currency or "GBP",
                "onboarding_completed": u.onboarding_completed,
                "preferences": merged,
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
            if payload.preferences is not None:
                stored = copy.deepcopy(u.preferences) if u.preferences else {}
                merged = _deep_merge(stored, payload.preferences)
                u.preferences = merged
            await session.commit()
            stored = copy.deepcopy(u.preferences) if u.preferences else {}
            merged = _deep_merge(copy.deepcopy(DEFAULT_PREFERENCES), stored)
            return {
                "status": "updated",
                "language": u.app_language,
                "theme": u.app_theme,
                "currency": u.app_currency,
                "onboarding_completed": u.onboarding_completed,
                "preferences": merged,
            }

    @router.get("/health")
    async def settings_health():
        return {"status": "ok"}

    return router
