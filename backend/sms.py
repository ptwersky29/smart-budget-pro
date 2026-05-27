"""Phase 5 — SMS finance. AI-parsed paste-SMS + Twilio webhook + admin Twilio config."""
import os
import uuid
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Form, Depends
from pydantic import BaseModel
from sqlalchemy import select, func

from db import User, Transaction, SmsMessage, AppConfig
from auth import get_current_user
from app_config import get_config
import maaser as maaser_mod

logger = logging.getLogger("sms")


PARSE_PROMPT = """You are a UK bank-SMS parser. Extract a transaction from this SMS. Return STRICT JSON only:
{"is_transaction": bool, "amount": number, "currency": "GBP|USD|EUR", "merchant": string|null, "description": string, "is_income": bool, "category": "groceries|dining|transport|utilities|subscriptions|tzedakah|rent|salary|income|uncategorized", "confidence": 0..1, "reason_if_not_transaction": string|null}

Rules:
- amount = absolute positive number
- is_income = true for credits, refunds, salary, transfers IN
- For declined/failed/balance-only messages: is_transaction=false
- confidence = your certainty 0..1
- Use British English categories.
SMS: """


class ParseIn(BaseModel):
    text: str
    auto_save: bool = False


class TwilioConfigIn(BaseModel):
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    phone_number: Optional[str] = None


async def _ai_parse(text: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get("OPENROUTER_API_KEY", os.environ.get("EMERGENT_LLM_KEY", ""))
    session_id = f"sms_parse_{uuid.uuid4().hex[:8]}"
    chat = LlmChat(api_key=api_key, session_id=session_id, system_message="You are a precise SMS parser. Always output valid JSON.").with_model("anthropic", "claude-sonnet-4-5-20250929")
    msg = UserMessage(text=PARSE_PROMPT + text)
    resp = await chat.send_message(msg)
    raw = str(resp)
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        raise RuntimeError("AI returned no JSON")
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"AI JSON parse failed: {e}")


def build_router() -> APIRouter:
    router = APIRouter(tags=["sms"])

    @router.post("/sms/parse")
    async def parse_sms(payload: ParseIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            if user.get("tier") != "premium" and user.get("role") != "admin":
                today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
                result = await session.execute(
                    select(func.count()).select_from(SmsMessage).where(
                        SmsMessage.user_id == user["user_id"],
                        SmsMessage.created_at >= today_start,
                    )
                )
                count_today = result.scalar() or 0
                if count_today >= 3:
                    raise HTTPException(429, "Free tier: 3 SMS parses/day. Upgrade for unlimited.")

            try:
                parsed = await _ai_parse(payload.text)
            except Exception as e:
                logger.error(f"parse failed: {e}")
                raise HTTPException(500, f"AI parse failed: {str(e)[:200]}")

            now = datetime.now(timezone.utc)
            sms_id = f"sms_{uuid.uuid4().hex[:10]}"
            sms = SmsMessage(
                user_id=user["user_id"],
                to_number="",
                body=payload.text[:2000],
                direction="outbound",
                provider="manual",
            )

            transaction_id = None
            if payload.auto_save and parsed.get("is_transaction"):
                tx_id = f"tx_{uuid.uuid4().hex[:12]}"
                amt = abs(float(parsed.get("amount", 0)))
                tx = Transaction(
                    transaction_id=tx_id,
                    user_id=user["user_id"],
                    amount=amt if parsed.get("is_income") else -amt,
                    currency=parsed.get("currency", "GBP"),
                    description=parsed.get("description", ""),
                    merchant_name=parsed.get("merchant"),
                    category=parsed.get("category", "uncategorized"),
                    date=now,
                    source="sms",
                )
                session.add(tx)
                transaction_id = tx_id
                tx_doc = {
                    "transaction_id": tx_id,
                    "user_id": user["user_id"],
                    "amount": amt if parsed.get("is_income") else -amt,
                    "category": parsed.get("category", "uncategorized"),
                    "description": parsed.get("description", ""),
                    "is_income": bool(parsed.get("is_income")),
                }
                await maaser_mod.maybe_accrue(session, user["user_id"], tx_doc)

            session.add(sms)
            await session.commit()
            return {
                "sms_id": sms_id,
                "user_id": user["user_id"],
                "text": payload.text[:2000],
                "parsed": parsed,
                "source": "manual",
                "transaction_id": transaction_id,
                "created_at": now.isoformat(),
            }

    @router.get("/sms/inbox")
    async def inbox(request: Request, user: dict = Depends(get_current_user), limit: int = 50):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(SmsMessage).where(SmsMessage.user_id == user["user_id"])
                .order_by(SmsMessage.created_at.desc()).limit(limit)
            )
            rows = result.scalars().all()
            return {"messages": [
                {"sms_id": f"sms_{r.id}", "user_id": r.user_id, "text": r.body,
                 "direction": r.direction, "created_at": r.created_at.isoformat() if r.created_at else None}
                for r in rows
            ]}

    @router.delete("/sms/{sms_id}")
    async def delete_sms(sms_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            sms_id_int = int(sms_id.replace("sms_", "")) if sms_id.startswith("sms_") else int(sms_id)
            result = await session.execute(
                select(SmsMessage).where(
                    SmsMessage.id == sms_id_int,
                    SmsMessage.user_id == user["user_id"],
                )
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Not found")
            await session.delete(rec)
            await session.commit()
            return {"ok": True}

    @router.post("/sms/{sms_id}/save")
    async def save_to_tx(sms_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            sms_id_int = int(sms_id.replace("sms_", "")) if sms_id.startswith("sms_") else int(sms_id)
            result = await session.execute(
                select(SmsMessage).where(
                    SmsMessage.id == sms_id_int,
                    SmsMessage.user_id == user["user_id"],
                )
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Not found")
            # We don't store parsed JSON on SMS — re-parse or skip
            raise HTTPException(400, "Re-parse the SMS with auto_save=true")

    @router.post("/sms/webhook")
    async def twilio_webhook(request: Request,
                             From: str = Form(""), To: str = Form(""), Body: str = Form("")):
        sm = request.app.state.db
        async with sm() as session:
            twilio_number = await get_config(session, "twilio_phone_number", "TWILIO_PHONE_NUMBER")
            if twilio_number and To != twilio_number:
                return {"ok": True, "skipped": "number_mismatch"}
            owner_email = await get_config(session, "twilio_owner_email", "ADMIN_EMAIL")
            result = await session.execute(
                select(User).where(User.email == (owner_email or "").lower())
            )
            user_row = result.scalar_one_or_none()
            if not user_row:
                return {"ok": True, "skipped": "no_user"}

            try:
                parsed = await _ai_parse(Body)
            except Exception as e:
                logger.error(f"webhook AI parse failed: {e}")
                parsed = {"is_transaction": False, "confidence": 0, "reason_if_not_transaction": str(e)[:120]}

            now = datetime.now(timezone.utc)
            sms = SmsMessage(
                user_id=user_row.user_id,
                to_number=To,
                body=Body[:2000],
                direction="inbound",
                provider="twilio",
            )
            session.add(sms)

            transaction_id = None
            if parsed.get("is_transaction") and parsed.get("confidence", 0) >= 0.7:
                tx_id = f"tx_{uuid.uuid4().hex[:12]}"
                amt = abs(float(parsed.get("amount", 0)))
                tx = Transaction(
                    transaction_id=tx_id,
                    user_id=user_row.user_id,
                    amount=amt if parsed.get("is_income") else -amt,
                    currency=parsed.get("currency", "GBP"),
                    description=parsed.get("description", ""),
                    merchant_name=parsed.get("merchant"),
                    category=parsed.get("category", "uncategorized"),
                    date=now,
                    source="sms",
                )
                session.add(tx)
                transaction_id = tx_id

            await session.commit()
            return {"ok": True, "parsed": parsed.get("is_transaction"), "confidence": parsed.get("confidence", 0)}

    @router.get("/admin/twilio-config")
    async def get_twilio_cfg(request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            sid = await get_config(session, "twilio_account_sid", "TWILIO_ACCOUNT_SID")
            token_exists = bool(await get_config(session, "twilio_auth_token", "TWILIO_AUTH_TOKEN"))
            number = await get_config(session, "twilio_phone_number", "TWILIO_PHONE_NUMBER")
            webhook = f"{os.environ.get('FRONTEND_URL', '')}/api/sms/webhook"
            return {"account_sid": sid or "", "has_token": token_exists, "phone_number": number or "", "webhook_url": webhook}

    @router.put("/admin/twilio-config")
    async def put_twilio_cfg(payload: TwilioConfigIn, request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            mapping = {
                "twilio_account_sid": payload.account_sid,
                "twilio_auth_token": payload.auth_token,
                "twilio_phone_number": payload.phone_number,
            }
            for k, v in mapping.items():
                if v is not None and v != "":
                    existing = await session.execute(select(AppConfig).where(AppConfig.key == k))
                    cfg = existing.scalar_one_or_none()
                    if cfg:
                        cfg.value = v
                    else:
                        session.add(AppConfig(key=k, value=v))
            await session.commit()
            return {"ok": True}

    return router
