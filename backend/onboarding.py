"""Phase 9 — Onboarding flow: step tracking, progress, guided setup."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from db import User, OnboardingProgress, ONBOARDING_STEPS
from auth import get_current_user
from audit import log_action

logger = logging.getLogger("onboarding")


class OnboardingUpdateIn(BaseModel):
    step: str = Field(..., pattern=r"^(connect_bank|first_transaction|set_budget|ai_intro|complete)$")
    skip: bool = False


def build_router() -> APIRouter:
    router = APIRouter(prefix="/onboarding", tags=["onboarding"])

    @router.get("/progress")
    async def get_progress(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            prog = (await session.execute(
                select(OnboardingProgress).where(OnboardingProgress.user_id == user["user_id"])
            )).scalar_one_or_none()
            steps = []
            completed_set = set(prog.completed_steps.keys()) if prog and prog.completed_steps else set()
            for s in ONBOARDING_STEPS:
                if s == "complete":
                    continue
                steps.append({
                    "step": s,
                    "completed": s in completed_set,
                    "label": {
                        "connect_bank": "Connect your bank",
                        "first_transaction": "Add your first transaction",
                        "set_budget": "Set a monthly budget",
                        "ai_intro": "Try AI insights",
                    }.get(s, s),
                })
            all_done = all(s["completed"] for s in steps)
            return {
                "current_step": prog.step if prog else "connect_bank",
                "steps": steps,
                "all_completed": u.onboarding_completed if u else False,
                "can_skip": True,
                "progress_pct": round(sum(1 for s in steps if s["completed"]) / max(len(steps), 1) * 100),
            }

    @router.post("/progress")
    async def update_progress(payload: OnboardingUpdateIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            prog = (await session.execute(
                select(OnboardingProgress).where(OnboardingProgress.user_id == user["user_id"])
            )).scalar_one_or_none()
            if not prog:
                prog = OnboardingProgress(user_id=user["user_id"], step=payload.step, completed_steps={})
                session.add(prog)
            completed = dict(prog.completed_steps) if prog.completed_steps else {}
            if payload.skip:
                completed[prog.step] = {"skipped": True, "at": datetime.now(timezone.utc).isoformat()}
                prog.step = _next_step(prog.step)
            else:
                completed[payload.step] = {"completed": True, "at": datetime.now(timezone.utc).isoformat()}
                prog.step = _next_step(payload.step)
            prog.completed_steps = completed
            if prog.step == "complete" or all(s in completed for s in ONBOARDING_STEPS if s != "complete"):
                u.onboarding_completed = True
                prog.finished_at = datetime.now(timezone.utc)
            await session.commit()
        await log_action(user["user_id"], "onboarding_step", "onboarding", payload.step, request=request)
        return {"status": "ok", "current_step": prog.step, "completed_steps": list(completed.keys())}

    @router.post("/skip")
    async def skip_onboarding(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if u:
                u.onboarding_completed = True
            prog = (await session.execute(
                select(OnboardingProgress).where(OnboardingProgress.user_id == user["user_id"])
            )).scalar_one_or_none()
            if not prog:
                prog = OnboardingProgress(user_id=user["user_id"], step="complete", completed_steps={}, skipped=True, finished_at=datetime.now(timezone.utc))
                session.add(prog)
            else:
                prog.skipped = True
                prog.finished_at = datetime.now(timezone.utc)
            await session.commit()
        await log_action(user["user_id"], "onboarding_skip", "onboarding", user["user_id"], request=request)
        return {"status": "skipped"}

    @router.get("/health")
    async def onboarding_health():
        return {"status": "ok", "steps": ONBOARDING_STEPS}

    def _next_step(current: str) -> str:
        idx = ONBOARDING_STEPS.index(current) if current in ONBOARDING_STEPS else 0
        return ONBOARDING_STEPS[idx + 1] if idx + 1 < len(ONBOARDING_STEPS) else "complete"

    return router
