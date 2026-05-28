"""Integrations — placeholder. Per-user Twilio removed; system-wide Twilio config is in sms.py admin endpoints."""
import logging
from fastapi import APIRouter

logger = logging.getLogger("integrations")


def build_router() -> APIRouter:
    router = APIRouter(prefix="/integrations", tags=["integrations"])
    return router
