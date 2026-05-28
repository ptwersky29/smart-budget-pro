"""Phase 9 — Support ticket system: submit, track, reply."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func

from db import SupportTicket
from auth import get_current_user, require_admin
from audit import log_action

logger = logging.getLogger("support")


class TicketIn(BaseModel):
    subject: str = Field(..., min_length=3, max_length=255)
    message: str = Field(..., min_length=10, max_length=5000)
    category: Optional[str] = None
    priority: str = "medium"


class TicketReplyIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)


def build_router() -> APIRouter:
    router = APIRouter(prefix="/support", tags=["support"])

    @router.get("/tickets")
    async def list_tickets(request: Request, user: dict = Depends(get_current_user),
                            status: str = Query(None), limit: int = Query(50, le=200)):
        sm = request.app.state.db
        async with sm() as session:
            q = select(SupportTicket).where(SupportTicket.user_id == user["user_id"])
            if status:
                q = q.where(SupportTicket.status == status)
            if user.get("role") in ("admin", "support"):
                q = select(SupportTicket)
            result = await session.execute(q.order_by(SupportTicket.created_at.desc()).limit(limit))
            rows = result.scalars().all()
            return {
                "tickets": [{
                    "id": t.id, "subject": t.subject, "message": t.message,
                    "status": t.status, "priority": t.priority, "category": t.category,
                    "admin_reply": t.admin_reply,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                    "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
                } for t in rows],
                "count": len(rows),
            }

    @router.post("/tickets")
    async def create_ticket(payload: TicketIn, request: Request, user: dict = Depends(get_current_user)):
        if payload.priority not in ("low", "medium", "high", "critical"):
            raise HTTPException(400, "Invalid priority")
        sm = request.app.state.db
        async with sm() as session:
            ticket = SupportTicket(
                user_id=user["user_id"], subject=payload.subject, message=payload.message,
                category=payload.category, priority=payload.priority,
            )
            session.add(ticket)
            await session.commit()
            await session.refresh(ticket)
        await log_action(user["user_id"], "ticket_created", "support", str(ticket.id), request=request)
        return {"id": ticket.id, "status": "open"}

    @router.get("/tickets/{ticket_id}")
    async def get_ticket(ticket_id: int, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            t = (await session.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))).scalar_one_or_none()
            if not t:
                raise HTTPException(404, "Ticket not found")
            if t.user_id != user["user_id"] and user.get("role") not in ("admin", "support"):
                raise HTTPException(403, "Not your ticket")
            return {
                "id": t.id, "subject": t.subject, "message": t.message, "status": t.status,
                "priority": t.priority, "category": t.category, "admin_reply": t.admin_reply,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
            }

    @router.post("/tickets/{ticket_id}/reply")
    async def admin_reply(ticket_id: int, payload: TicketReplyIn, request: Request,
                          user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            t = (await session.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))).scalar_one_or_none()
            if not t:
                raise HTTPException(404, "Ticket not found")
            t.admin_reply = payload.message
            t.status = "resolved"
            t.resolved_at = datetime.now(timezone.utc)
            await session.commit()
        await log_action(user["user_id"], "ticket_replied", "support", str(ticket_id), request=request)
        return {"status": "resolved"}

    @router.get("/health")
    async def support_health():
        return {"status": "ok"}

    return router
