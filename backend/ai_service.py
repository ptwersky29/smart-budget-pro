"""Phase 5 — AI Intelligence Layer: multi-model (Claude, GPT, Gemini), real data context, cost tracking, rate limiting."""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, func, text

from db import AiMessage, AiUsage, User, Transaction, Budget
from auth import get_current_user
from llm import call_llm, parse_json, estimate_cost, track_ai_usage
from security import sanitize_input

logger = logging.getLogger("ai")

SYSTEM_PROMPT = (
    "You are FinanceAI, a premium AI financial assistant specialized in UK personal finance, "
    "smart budgeting, investment forecasting, and Jewish lifestyle financial planning "
    "(Maaser, Tzedakah, Yom Tov budgeting). Respond concisely, with clear actionable advice. "
    "Use British English. Never give regulated financial advice without disclaimer."
)

FREE_TIER_DAILY_LIMIT = 5


class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None
    include_financial_context: bool = False


class ProviderConfig(BaseModel):
    provider_id: str = Field(default_factory=lambda: f"prov_{uuid.uuid4().hex[:8]}")
    name: str
    provider: str
    model: str
    api_key: Optional[str] = None
    is_default: bool = False


async def _build_financial_context(session, user_id: str) -> str:
    since = datetime.now(timezone.utc) - timedelta(days=60)
    result = await session.execute(
        select(Transaction).where(
            Transaction.user_id == user_id, Transaction.date >= since,
        ).order_by(Transaction.date.desc()).limit(200)
    )
    txs = result.scalars().all()
    if not txs:
        return "No recent transactions."
    income = sum(t.amount for t in txs if t.amount > 0)
    spend = sum(-t.amount for t in txs if t.amount < 0)
    by_cat = {}
    for t in txs:
        if t.amount < 0:
            c = (t.category or "uncategorized").lower()
            by_cat[c] = by_cat.get(c, 0) + (-t.amount)
    top = sorted(by_cat.items(), key=lambda kv: -kv[1])[:5]
    budget_result = await session.execute(
        select(Budget).where(Budget.user_id == user_id)
    )
    budgets = budget_result.scalars().all()
    ctx = f"Income (60d): £{income:.2f}\nSpending (60d): £{spend:.2f}\nNet: £{income-spend:.2f}\n"
    ctx += f"Top categories: {', '.join(f'{c}: £{v:.0f}' for c, v in top)}\n"
    ctx += f"Budgets: {len(budgets)} active\n"
    ctx += f"Transactions: {len(txs)} in period\n"
    return ctx


async def _enforce_rate_limit(session, user: dict) -> None:
    if user.get("tier") == "premium" or user.get("role") == "admin":
        return
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    result = await session.execute(
        select(func.count()).select_from(AiMessage).where(
            AiMessage.user_id == user["user_id"], AiMessage.created_at >= today_start,
            AiMessage.role == "user",
        )
    )
    count = result.scalar() or 0
    if count >= FREE_TIER_DAILY_LIMIT:
        raise HTTPException(429, f"Free tier: {FREE_TIER_DAILY_LIMIT} AI messages/day. Upgrade to Premium for unlimited.")


def _pick_model(user: dict) -> tuple[str, str, str]:
    configs = user.get("preferences", {}).get("ai_provider_configs", [])
    active = next((p for p in configs if p.get("is_default") and p.get("api_key")), None)
    if active:
        return active.get("api_key"), active.get("model", "google/gemini-2.0-flash-lite-001"), active.get("provider", "openrouter")
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise HTTPException(503, "AI is not configured. Add your own API key in Settings, or set OPENROUTER_API_KEY.")
    return key, "google/gemini-2.0-flash-lite-001", "openrouter"


def build_router() -> APIRouter:
    router = APIRouter(prefix="/ai", tags=["ai"])

    @router.post("/chat")
    async def chat(payload: ChatIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            await _enforce_rate_limit(session, user)
            session_id = payload.session_id or f"sess_{uuid.uuid4().hex[:10]}"
            api_key, model, provider_label = _pick_model(user)

            context = ""
            if payload.include_financial_context:
                context = await _build_financial_context(session, user["user_id"])

            sys = SYSTEM_PROMPT
            if context:
                sys += f"\n\nUser's financial data (use this to give personalised answers):\n{context}"

            clean_message = sanitize_input(payload.message, max_len=4000)

            response_text = ""
            prompt_tokens = 0
            completion_tokens = 0
            cost = 0.0
            try:
                result = await call_llm(sys, clean_message, model=model, api_key=api_key,
                                        json_mode=False, max_tokens=4096, temperature=0.7)
                response_text, used_provider, used_model, pt, ct, cst = result
                prompt_tokens, completion_tokens, cost = pt, ct, cst
            except Exception as e:
                logger.error(f"AI chat error: {e}")
                raise HTTPException(500, f"AI provider error: {str(e)[:200]}")

            if not response_text:
                raise HTTPException(502, "AI provider returned an empty response")

            now = datetime.now(timezone.utc)
            msgs = [
                AiMessage(user_id=user["user_id"], session_id=session_id, role="user", content=payload.message),
                AiMessage(user_id=user["user_id"], session_id=session_id, role="assistant",
                          content=response_text, provider=used_provider),
            ]
            for m in msgs:
                session.add(m)

            usage = AiUsage(
                user_id=user["user_id"], provider=used_provider,
                prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                cost=cost, endpoint="chat",
            )
            session.add(usage)
            await session.commit()

            return {
                "session_id": session_id, "response": response_text,
                "provider": used_provider, "model": used_model,
                "cost": cost, "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens,
            }

    @router.get("/history/{session_id}")
    async def history(session_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(AiMessage).where(
                    AiMessage.session_id == session_id, AiMessage.user_id == user["user_id"],
                ).order_by(AiMessage.created_at)
            )
            return {"messages": [
                {"message_id": str(m.id), "session_id": m.session_id, "role": m.role,
                 "content": m.content, "created_at": m.created_at.isoformat() if m.created_at else None}
                for m in result.scalars().all()
            ]}

    @router.get("/sessions")
    async def sessions(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                text("""
                    SELECT session_id, content, created_at FROM (
                        SELECT session_id, content, created_at,
                               ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) as rn
                        FROM ai_messages
                        WHERE user_id = :uid AND role = 'assistant'
                    ) sub WHERE rn = 1
                    ORDER BY created_at DESC LIMIT 30
                """),
                {"uid": user["user_id"]},
            )
            return {"sessions": [
                {"session_id": r[0], "preview": (r[1] or "")[:80], "ts": r[2].isoformat() if r[2] else None}
                for r in result.all()
            ]}

    @router.get("/providers")
    async def list_providers(user: dict = Depends(get_current_user)):
        return {"providers": user.get("ai_provider_configs", []),
                "default": {"provider": "openrouter", "model": "google/gemini-2.0-flash-lite-001"}}

    @router.post("/providers")
    async def add_provider(cfg: ProviderConfig, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = result.scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            prefs = u.preferences or {}
            configs = prefs.get("ai_provider_configs", [])
            if cfg.is_default:
                for c in configs:
                    c["is_default"] = False
            configs.append(cfg.model_dump())
            prefs["ai_provider_configs"] = configs
            u.preferences = prefs
            await session.commit()
            return {"ok": True, "providers": configs}

    @router.delete("/providers/{provider_id}")
    async def remove_provider(provider_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = result.scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            prefs = u.preferences or {}
            configs = [c for c in prefs.get("ai_provider_configs", []) if c.get("provider_id") != provider_id]
            prefs["ai_provider_configs"] = configs
            u.preferences = prefs
            await session.commit()
            return {"ok": True, "providers": configs}

    @router.get("/usage")
    async def usage(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(AiUsage).where(AiUsage.user_id == user["user_id"])
                .order_by(AiUsage.date.desc()).limit(200)
            )
            rows = result.scalars().all()
            total_prompt = sum(r.prompt_tokens or 0 for r in rows)
            total_completion = sum(r.completion_tokens or 0 for r in rows)
            total_cost = sum(r.cost or 0 for r in rows)
            return {
                "recent": [
                    {"id": str(r.id), "date": r.date.isoformat() if r.date else None,
                     "prompt_tokens": r.prompt_tokens, "completion_tokens": r.completion_tokens,
                     "cost": r.cost, "provider": r.provider, "endpoint": r.endpoint}
                    for r in rows
                ],
                "total_prompt_tokens": total_prompt,
                "total_completion_tokens": total_completion,
                "total_cost_usd": round(total_cost, 6),
            }

    return router
