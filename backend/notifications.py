"""Notification system for budget alerts, bank sync status, and user reminders."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy import select, and_, desc

from db import Notification, User
from auth import get_current_user

logger = logging.getLogger("notifications")

router = APIRouter(prefix="/notifications", tags=["notifications"])


async def get_or_create_notification(session, user_id: str, title: str, message: str, notification_type: str = "info") -> dict:
    """Create a new notification for a user."""
    notif = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=notification_type,
        read=False,
    )
    session.add(notif)
    await session.commit()
    await session.refresh(notif)
    return _notif_to_dict(notif)


def _notif_to_dict(n: Notification) -> dict:
    """Convert notification to dictionary."""
    return {
        "id": n.id,
        "user_id": n.user_id,
        "title": n.title,
        "message": n.message,
        "type": n.type,
        "read": n.read,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


@router.get("")
async def list_notifications(
    request: Request,
    user: dict = Depends(get_current_user),
    limit: int = 50,
    unread_only: bool = False,
):
    """Get user notifications, optionally filtered by unread status."""
    sm = request.app.state.db
    async with sm() as session:
        query = select(Notification).where(
            Notification.user_id == user["user_id"]
        )
        if unread_only:
            query = query.where(Notification.read == False)
        
        query = query.order_by(desc(Notification.created_at)).limit(limit)
        result = await session.execute(query)
        notifications = result.scalars().all()
        return [_notif_to_dict(n) for n in notifications]


@router.get("/{notification_id}")
async def get_notification(
    notification_id: int,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Get a specific notification."""
    sm = request.app.state.db
    async with sm() as session:
        result = await session.execute(
            select(Notification).where(
                and_(
                    Notification.id == notification_id,
                    Notification.user_id == user["user_id"],
                )
            )
        )
        n = result.scalar_one_or_none()
        if not n:
            raise HTTPException(404, "Notification not found")
        return _notif_to_dict(n)


@router.put("/{notification_id}")
async def update_notification(
    notification_id: int,
    payload: dict,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Mark a notification as read/unread."""
    sm = request.app.state.db
    async with sm() as session:
        result = await session.execute(
            select(Notification).where(
                and_(
                    Notification.id == notification_id,
                    Notification.user_id == user["user_id"],
                )
            )
        )
        n = result.scalar_one_or_none()
        if not n:
            raise HTTPException(404, "Notification not found")
        
        if "read" in payload:
            n.read = payload["read"]
            if payload["read"]:
                n.read_at = datetime.now(timezone.utc)
            else:
                n.read_at = None
        
        await session.commit()
        await session.refresh(n)
        return _notif_to_dict(n)


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Delete a notification."""
    sm = request.app.state.db
    async with sm() as session:
        result = await session.execute(
            select(Notification).where(
                and_(
                    Notification.id == notification_id,
                    Notification.user_id == user["user_id"],
                )
            )
        )
        n = result.scalar_one_or_none()
        if not n:
            raise HTTPException(404, "Notification not found")
        
        await session.delete(n)
        await session.commit()
        return {"ok": True}


@router.post("/clear")
async def clear_all_notifications(
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Clear all notifications for the user."""
    sm = request.app.state.db
    async with sm() as session:
        await session.execute(
            select(Notification).where(Notification.user_id == user["user_id"])
        )
        # Delete all
        result = await session.execute(
            select(Notification).where(Notification.user_id == user["user_id"])
        )
        notifications = result.scalars().all()
        for n in notifications:
            await session.delete(n)
        await session.commit()
        return {"ok": True, "cleared": len(notifications)}
