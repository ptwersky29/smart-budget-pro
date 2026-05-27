"""AI provider system: Claude Sonnet 4.5 default (Emergent key) + user-supplied providers."""
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, func, text

from db import AiMessage, AiUsage, User
from auth import get_current_user

logger = logging.getLogger("ai")

DEFAULT_PROVIDER = "openai"
DEFAULT_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = (
    "You are FinanceAI, a premium AI financial assistant specialized in UK personal finance, "
    "smart budgeting, investment forecasting, and Jewish lifestyle financial planning "
    "(Maaser, Tzedakah, Yom Tov budgeting). Respond concisely, with clear actionable advice. "
    "Use British English. Never give regulated financial advice without disclaimer."
)


class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None
    context: Optional[dict] = None


class ProviderConfig(BaseModel):
    provider_id: str = Field(default_factory=lambda: f"prov_{uuid.uuid4().hex[:8]}")
    name: str
    provider: str
    model: str
    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    is_default: bool = False


def build_router() -> APIRouter:
    router = APIRouter(prefix="/ai", tags=["ai"])

    @router.post("/chat")
    async def chat(payload: ChatIn, request: Request, user: dict = Depends(get_current_user)):
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        sm = request.app.state.db
        async with sm() as session:
            session_id = payload.session_id or f"sess_{uuid.uuid4().hex[:10]}"

            provider = DEFAULT_PROVIDER
            model = DEFAULT_MODEL
            api_key = os.environ["EMERGENT_LLM_KEY"]

            active = next((p for p in user.get("ai_provider_configs", []) if p.get("is_default")), None)
            if active and active.get("api_key"):
                provider = active["provider"]
                model = active["model"]
                api_key = active["api_key"]
            elif user.get("tier") != "premium" and user.get("role") != "admin":
                today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
                result = await session.execute(
                    select(func.count()).select_from(AiMessage).where(
                        AiMessage.user_id == user["user_id"],
                        AiMessage.created_at >= today_start,
                    )
                )
                count = result.scalar() or 0
                if count >= 5:
                    raise HTTPException(429, "Free tier daily limit reached. Upgrade to Premium for unlimited AI.")

            sys_msg = SYSTEM_PROMPT
            if payload.context:
                sys_msg += f"\n\nUser context: {payload.context}"

            response_text = ""
            try:
                chat_client = LlmChat(api_key=api_key, session_id=session_id, system_message=sys_msg).with_model(provider, model)
                user_msg = UserMessage(text=payload.message)
                response = await chat_client.send_message(user_msg)
                response_text = str(response) if response is not None else ""
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"AI chat error: {e}")
                raise HTTPException(500, f"AI provider error: {str(e)[:200]}")

            if not response_text:
                raise HTTPException(502, "AI provider returned an empty response")

            now = datetime.now(timezone.utc)
            msgs = [
                AiMessage(user_id=user["user_id"], session_id=session_id, role="user", content=payload.message),
                AiMessage(user_id=user["user_id"], session_id=session_id, role="assistant", content=response_text,
                          provider=provider),
            ]
            for m in msgs:
                session.add(m)

            usage = AiUsage(
                user_id=user["user_id"], provider=provider,
                prompt_tokens=len(payload.message.split()),
                completion_tokens=len(response_text.split()),
                endpoint="chat",
            )
            session.add(usage)
            await session.commit()

            return {"session_id": session_id, "response": response_text, "provider": provider, "model": model}

    @router.get("/history/{session_id}")
    async def history(session_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(AiMessage).where(
                    AiMessage.session_id == session_id,
                    AiMessage.user_id == user["user_id"],
                ).order_by(AiMessage.created_at)
            )
            msgs = result.scalars().all()
            return {"messages": [
                {"message_id": str(m.id), "session_id": m.session_id, "role": m.role,
                 "content": m.content, "created_at": m.created_at.isoformat() if m.created_at else None}
                for m in msgs
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
                    ORDER BY created_at DESC
                    LIMIT 30
                """),
                {"uid": user["user_id"]},
            )
            rows = result.all()
            return {"sessions": [
                {"session_id": r[0], "preview": (r[1] or "")[:80], "ts": r[2].isoformat() if r[2] else None}
                for r in rows
            ]}

    @router.get("/providers")
    async def list_providers(user: dict = Depends(get_current_user)):
        return {"providers": user.get("ai_provider_configs", []),
                "default": {"provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL}}

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
                .order_by(AiUsage.date.desc()).limit(100)
            )
            rows = result.scalars().all()
            total = sum((r.prompt_tokens or 0) + (r.completion_tokens or 0) for r in rows)
            return {"recent": [
                {"id": str(r.id), "date": r.date.isoformat() if r.date else None,
                 "prompt_tokens": r.prompt_tokens, "completion_tokens": r.completion_tokens,
                 "provider": r.provider, "endpoint": r.endpoint}
                for r in rows
            ], "approx_total_tokens": total, "approx_cost_usd": round(total * 0.000003, 4)}

    return router
