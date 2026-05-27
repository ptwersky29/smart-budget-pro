"""AI provider system: Claude Sonnet 4.5 default (Emergent key) + user-supplied providers."""
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field

from auth import get_current_user

logger = logging.getLogger("ai")

DEFAULT_PROVIDER = "anthropic"
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"

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
    provider: str  # openai | anthropic | gemini | custom
    model: str
    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    is_default: bool = False


def build_router() -> APIRouter:
    router = APIRouter(prefix="/ai", tags=["ai"])

    @router.post("/chat")
    async def chat(payload: ChatIn, request: Request, user: dict = Depends(get_current_user)):
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        db = request.app.state.db
        session_id = payload.session_id or f"sess_{uuid.uuid4().hex[:10]}"

        # Premium uses internal key; free uses their configured provider OR demo (limited)
        provider = DEFAULT_PROVIDER
        model = DEFAULT_MODEL
        api_key = os.environ["EMERGENT_LLM_KEY"]

        # Allow custom configured provider
        active = next((p for p in user.get("ai_provider_configs", []) if p.get("is_default")), None)
        if active and active.get("api_key"):
            provider = active["provider"]
            model = active["model"]
            api_key = active["api_key"]
        elif user.get("tier") != "premium" and user.get("role") != "admin":
            # Free tier rate limit: 5 messages/day on internal key
            count = await db.ai_messages.count_documents({
                "user_id": user["user_id"],
                "created_at": {"$gte": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()}
            })
            if count >= 5:
                raise HTTPException(429, "Free tier daily limit reached. Upgrade to Premium for unlimited AI.")

        # Build context-aware system prompt
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

        # Persist messages
        now = datetime.now(timezone.utc).isoformat()
        await db.ai_messages.insert_many([
            {"message_id": str(uuid.uuid4()), "session_id": session_id, "user_id": user["user_id"],
             "role": "user", "content": payload.message, "created_at": now},
            {"message_id": str(uuid.uuid4()), "session_id": session_id, "user_id": user["user_id"],
             "role": "assistant", "content": response_text, "provider": provider, "model": model,
             "created_at": now},
        ])
        # Usage tracking
        await db.ai_usage.insert_one({
            "user_id": user["user_id"], "provider": provider, "model": model,
            "approx_tokens": len(payload.message.split()) + len(response_text.split()),
            "created_at": now,
        })
        return {"session_id": session_id, "response": response_text, "provider": provider, "model": model}

    @router.get("/history/{session_id}")
    async def history(session_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        msgs = await db.ai_messages.find(
            {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0}
        ).sort("created_at", 1).to_list(200)
        return {"messages": msgs}

    @router.get("/sessions")
    async def sessions(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        pipeline = [
            {"$match": {"user_id": user["user_id"]}},
            {"$sort": {"created_at": -1}},
            {"$group": {"_id": "$session_id", "last": {"$first": "$content"}, "ts": {"$first": "$created_at"}}},
            {"$sort": {"ts": -1}},
            {"$limit": 30},
        ]
        rows = await db.ai_messages.aggregate(pipeline).to_list(30)
        return {"sessions": [{"session_id": r["_id"], "preview": r["last"][:80], "ts": r["ts"]} for r in rows]}

    @router.get("/providers")
    async def list_providers(user: dict = Depends(get_current_user)):
        return {"providers": user.get("ai_provider_configs", []),
                "default": {"provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL}}

    @router.post("/providers")
    async def add_provider(cfg: ProviderConfig, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        configs = user.get("ai_provider_configs", [])
        if cfg.is_default:
            for c in configs:
                c["is_default"] = False
        configs.append(cfg.model_dump())
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"ai_provider_configs": configs}})
        return {"ok": True, "providers": configs}

    @router.delete("/providers/{provider_id}")
    async def remove_provider(provider_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        configs = [c for c in user.get("ai_provider_configs", []) if c.get("provider_id") != provider_id]
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"ai_provider_configs": configs}})
        return {"ok": True, "providers": configs}

    @router.get("/usage")
    async def usage(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        rows = await db.ai_usage.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
        total = sum(r.get("approx_tokens", 0) for r in rows)
        return {"recent": rows, "approx_total_tokens": total, "approx_cost_usd": round(total * 0.000003, 4)}

    return router
