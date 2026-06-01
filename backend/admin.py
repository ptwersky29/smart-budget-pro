"""Phase 9 — Admin dashboard: system stats, user management, feature flags."""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func

from db import User, Transaction, AuditLog, FeatureFlag, SupportTicket, OnboardingProgress
from auth import get_current_user, require_admin
from audit import log_action

logger = logging.getLogger("admin")


class FeatureFlagIn(BaseModel):
    flag: str = Field(..., max_length=64)
    enabled: bool = True
    description: Optional[str] = None
    user_id: Optional[str] = None


def build_router() -> APIRouter:
    router = APIRouter(prefix="/admin", tags=["admin"])

    @router.get("/dashboard")
    async def admin_dashboard(request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            total_users = (await session.execute(select(func.count()).select_from(User))).scalar() or 0
            from sqlalchemy import distinct
            active_users = len(set((await session.execute(
                select(AuditLog.user_id).where(
                    AuditLog.created_at >= datetime.now(timezone.utc) - timedelta(days=30),
                    AuditLog.user_id.isnot(None),
                )
            )).scalars().all()))
            total_tx = (await session.execute(select(func.count()).select_from(Transaction))).scalar() or 0
            total_value = (await session.execute(select(func.sum(Transaction.amount).where(Transaction.amount > 0)))).scalar() or 0
            total_spend = abs((await session.execute(select(func.sum(Transaction.amount).where(Transaction.amount < 0)))).scalar() or 0)
            open_tickets = (await session.execute(
                select(func.count()).select_from(SupportTicket).where(SupportTicket.status.in_(["open", "in_progress"]))
            )).scalar() or 0
            flags_count = (await session.execute(select(func.count()).select_from(FeatureFlag))).scalar() or 0
            recent_logs = (await session.execute(
                select(AuditLog).order_by(AuditLog.created_at.desc()).limit(10)
            )).scalars().all()
            return {
                "stats": {
                    "total_users": total_users,
                    "active_users_30d": active_users,
                    "total_transactions": total_tx,
                    "total_income": round(float(total_value), 2),
                    "total_spending": round(float(total_spend), 2),
                    "open_support_tickets": open_tickets,
                    "feature_flags": flags_count,
                },
                "recent_activity": [
                    {"action": a.action, "user_id": a.user_id, "resource": a.resource, "at": a.created_at.isoformat() if a.created_at else None}
                    for a in recent_logs
                ],
            }

    @router.get("/users")
    async def list_users(request: Request, user: dict = Depends(require_admin),
                          offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).order_by(User.created_at.desc()).offset(offset).limit(limit))
            users = result.scalars().all()
            total = (await session.execute(select(func.count()).select_from(User))).scalar() or 0
            return {
                "users": [{"user_id": u.user_id, "email": u.email, "name": u.name, "role": u.role, "tier": u.tier,
                           "created_at": u.created_at.isoformat() if u.created_at else None,
                           "onboarded": u.onboarding_completed, "disabled": u.disabled} for u in users],
                "total": total, "offset": offset, "limit": limit,
            }

    @router.put("/users/{user_id}/role")
    async def update_user_role(user_id: str, request: Request, user: dict = Depends(require_admin),
                                role: str = Query(...)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user_id))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            u.role = role
            await session.commit()
        await log_action(user["user_id"], "user_role_update", "user", user_id,
                         detail={"new_role": role}, request=request)
        return {"status": "ok", "user_id": user_id, "role": role}

    @router.put("/users/{user_id}/toggle-disable")
    async def toggle_disable_user(user_id: str, request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user_id))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            u.disabled = not u.disabled
            await session.commit()
        await log_action(user["user_id"], "user_toggle_disable", "user", user_id,
                         detail={"disabled": u.disabled}, request=request)
        return {"status": "ok", "user_id": user_id, "disabled": u.disabled}

    # ── Subscription Management ──────────────────────────────────────

    @router.put("/users/{user_id}/tier")
    async def set_user_tier(user_id: str, request: Request, user: dict = Depends(require_admin),
                            tier: str = Query(...)):
        if tier not in ("free", "premium"):
            raise HTTPException(400, "Tier must be 'free' or 'premium'")
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user_id))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            u.tier = tier
            if tier == "premium":
                u.subscription_status = "active"
            else:
                u.subscription_status = "canceled"
                u.stripe_subscription_id = None
            await session.commit()
        await log_action(user["user_id"], "user_tier_update", "user", user_id,
                         detail={"new_tier": tier}, request=request)
        return {"status": "ok", "user_id": user_id, "tier": tier}

    @router.post("/users/{user_id}/grant-premium")
    async def grant_premium(user_id: str, request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user_id))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            u.tier = "premium"
            u.subscription_status = "active"
            if not u.stripe_customer_id:
                u.stripe_customer_id = f"manual_{user_id}"
            await session.commit()
        await log_action(user["user_id"], "user_grant_premium", "user", user_id, request=request)
        return {"status": "ok", "user_id": user_id, "tier": "premium"}

    @router.post("/users/{user_id}/revoke-premium")
    async def revoke_premium(user_id: str, request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user_id))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            if u.role == "admin":
                raise HTTPException(400, "Cannot revoke premium from admin users")
            u.tier = "free"
            u.subscription_status = "canceled"
            u.stripe_subscription_id = None
            await session.commit()
        await log_action(user["user_id"], "user_revoke_premium", "user", user_id, request=request)
        return {"status": "ok", "user_id": user_id, "tier": "free"}

    # ── Feature Flags ──────────────────────────────────────────────────

    @router.get("/feature-flags")
    async def list_flags(request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(FeatureFlag).order_by(FeatureFlag.flag))
            return {"flags": [{"id": f.id, "flag": f.flag, "enabled": f.enabled,
                               "description": f.description, "user_id": f.user_id} for f in result.scalars().all()]}

    @router.post("/feature-flags")
    async def create_flag(payload: FeatureFlagIn, request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            existing = await session.execute(select(FeatureFlag).where(FeatureFlag.flag == payload.flag))
            if existing.scalar_one_or_none():
                raise HTTPException(400, "Flag already exists")
            ff = FeatureFlag(flag=payload.flag, enabled=payload.enabled,
                             description=payload.description, user_id=payload.user_id)
            session.add(ff)
            await session.commit()
            return {"status": "created", "flag": payload.flag}

    @router.put("/feature-flags/{flag_id}")
    async def update_flag(flag_id: int, payload: FeatureFlagIn, request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            ff = (await session.execute(select(FeatureFlag).where(FeatureFlag.id == flag_id))).scalar_one_or_none()
            if not ff:
                raise HTTPException(404, "Flag not found")
            ff.enabled = payload.enabled
            if payload.description is not None:
                ff.description = payload.description
            await session.commit()
            return {"status": "updated", "flag": ff.flag, "enabled": ff.enabled}

    @router.delete("/feature-flags/{flag_id}")
    async def delete_flag(flag_id: int, request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            ff = (await session.execute(select(FeatureFlag).where(FeatureFlag.id == flag_id))).scalar_one_or_none()
            if not ff:
                raise HTTPException(404, "Flag not found")
            await session.delete(ff)
            await session.commit()
            return {"status": "deleted"}

    @router.get("/health")
    async def admin_health():
        return {"status": "ok"}

    return router
