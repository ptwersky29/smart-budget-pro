"""Audit logging: track important user actions."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import Request
from sqlalchemy import select

from db import AuditLog, get_session_maker

logger = logging.getLogger("audit")


async def log_action(
    user_id: Optional[str],
    action: str,
    resource: str,
    resource_id: Optional[str] = None,
    detail: Optional[dict] = None,
    request: Optional[Request] = None,
    success: bool = True,
) -> None:
    sm = get_session_maker()
    async with sm() as session:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource=resource,
            resource_id=resource_id,
            detail=detail,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent", "")[:512] if request else None,
            success=success,
        )
        session.add(entry)
        try:
            await session.commit()
        except Exception as e:
            logger.warning("Failed to write audit log: %s", e)
            await session.rollback()
