"""Phase 9 — Analytics event tracking for product usage insights."""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func

from db import AnalyticsEvent
from auth import get_current_user, require_admin

logger = logging.getLogger("analytics")


class AnalyticsEventIn(BaseModel):
    event: str = Field(..., max_length=64)
    category: str = "engagement"
    value: float = 0
    event_meta: Optional[dict] = None


def build_router() -> APIRouter:
    router = APIRouter(prefix="/analytics", tags=["analytics"])

    @router.post("/track")
    async def track_event(payload: AnalyticsEventIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            ae = AnalyticsEvent(
                user_id=user["user_id"], event=payload.event,
                category=payload.category, value=payload.value,
                event_meta=payload.event_meta, ip_address=request.client.host if request.client else None,
            )
            session.add(ae)
            await session.commit()
            return {"status": "tracked"}

    @router.get("/events")
    async def list_events(request: Request, user: dict = Depends(get_current_user),
                           limit: int = Query(50, le=200), category: str = Query(None)):
        sm = request.app.state.db
        async with sm() as session:
            q = select(AnalyticsEvent).where(AnalyticsEvent.user_id == user["user_id"])
            if category:
                q = q.where(AnalyticsEvent.category == category)
            result = await session.execute(q.order_by(AnalyticsEvent.created_at.desc()).limit(limit))
            events = result.scalars().all()
            return {
                "events": [{
                    "id": e.id, "event": e.event, "category": e.category,
                    "value": e.value, "metadata": e.event_meta,
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                } for e in events],
                "count": len(events),
            }

    @router.get("/summary")
    async def get_summary(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            rows = (await session.execute(
                select(AnalyticsEvent.event, func.count().label("count"), func.sum(AnalyticsEvent.value).label("total"))
                .where(AnalyticsEvent.user_id == user["user_id"])
                .group_by(AnalyticsEvent.event)
            )).all()
            return {"summary": {row.event: {"count": row.count, "total": round(float(row.total or 0), 2)} for row in rows}}

    @router.get("/health")
    async def analytics_health():
        return {"status": "ok"}

    return router
