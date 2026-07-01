"""Audit logging: track important user actions."""
import logging
from typing import Optional
import re

from fastapi import Request
from sqlalchemy import select

from db import AuditLog, get_session_maker

logger = logging.getLogger("audit")


def _sanitize_for_log(value: str) -> str:
    if not value:
        return value
    cleaned = re.sub(r"[\n\r\t]", " ", str(value))
    return cleaned[:1024]


def _sanitize_dict(d: Optional[dict]) -> Optional[dict]:
    if not d:
        return d
    sanitized = {}
    for k, v in d.items():
        if isinstance(v, str):
            sanitized[k] = _sanitize_for_log(v)
        elif isinstance(v, dict):
            sanitized[k] = _sanitize_dict(v)
        else:
            sanitized[k] = v
    return sanitized


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
            action=_sanitize_for_log(action),
            resource=_sanitize_for_log(resource),
            resource_id=_sanitize_for_log(resource_id) if resource_id else None,
            detail=_sanitize_dict(detail),
            ip_address=request.client.host if request and request.client else None,
            user_agent=_sanitize_for_log(request.headers.get("user-agent", "") if request else ""),
            success=success,
        )
        session.add(entry)
        try:
            await session.commit()
        except Exception as e:
            logger.warning("Failed to write audit log: %s", e)
            await session.rollback()
