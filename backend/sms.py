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
    api_key = os.environ["EMERGENT_LLM_KEY"]
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
        db = request.app.state.db
        if user.get("tier") != "premium" and user.get("role") != "admin":
            count_today = await db.sms_messages.count_documents({
                "user_id": user["user_id"],
                "created_at": {"$gte": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()}
            })
            if count_today >= 3:
                raise HTTPException(429, "Free tier: 3 SMS parses/day. Upgrade for unlimited.")

        try:
            parsed = await _ai_parse(payload.text)
        except Exception as e:
            logger.error(f"parse failed: {e}")
            raise HTTPException(500, f"AI parse failed: {str(e)[:200]}")

        sms_id = f"sms_{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "sms_id": sms_id,
            "user_id": user["user_id"],
            "text": payload.text[:2000],
            "parsed": parsed,
            "source": "manual",
            "transaction_id": None,
            "created_at": now,
        }

        if payload.auto_save and parsed.get("is_transaction"):
            tx_id = f"tx_{uuid.uuid4().hex[:12]}"
            amt = abs(float(parsed.get("amount", 0)))
            tx_doc = {
                "transaction_id": tx_id,
                "user_id": user["user_id"],
                "amount": amt if parsed.get("is_income") else -amt,
                "currency": parsed.get("currency", "GBP"),
                "description": parsed.get("description", ""),
                "merchant": parsed.get("merchant"),
                "category": parsed.get("category", "uncategorized"),
                "date": now,
                "is_income": bool(parsed.get("is_income")),
                "source": "sms",
                "created_at": now,
            }
            await db.transactions.insert_one(tx_doc)
            record["transaction_id"] = tx_id
            await maaser_mod.maybe_accrue(db, user["user_id"], tx_doc)

        await db.sms_messages.insert_one(record)
        record.pop("_id", None)
        return record

    @router.get("/sms/inbox")
    async def inbox(request: Request, user: dict = Depends(get_current_user), limit: int = 50):
        db = request.app.state.db
        rows = await db.sms_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return {"messages": rows}

    @router.delete("/sms/{sms_id}")
    async def delete_sms(sms_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        r = await db.sms_messages.delete_one({"sms_id": sms_id, "user_id": user["user_id"]})
        if r.deleted_count == 0:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @router.post("/sms/{sms_id}/save")
    async def save_to_tx(sms_id: str, request: Request, user: dict = Depends(get_current_user)):
        """Convert an already-parsed SMS into a transaction."""
        db = request.app.state.db
        rec = await db.sms_messages.find_one({"sms_id": sms_id, "user_id": user["user_id"]})
        if not rec:
            raise HTTPException(404, "Not found")
        if rec.get("transaction_id"):
            raise HTTPException(400, "Already saved")
        parsed = rec.get("parsed") or {}
        if not parsed.get("is_transaction"):
            raise HTTPException(400, "Not a transaction")
        now = datetime.now(timezone.utc).isoformat()
        tx_id = f"tx_{uuid.uuid4().hex[:12]}"
        amt = abs(float(parsed.get("amount", 0)))
        await db.transactions.insert_one({
            "transaction_id": tx_id, "user_id": user["user_id"],
            "amount": amt if parsed.get("is_income") else -amt,
            "currency": parsed.get("currency", "GBP"),
            "description": parsed.get("description", ""),
            "merchant": parsed.get("merchant"),
            "category": parsed.get("category", "uncategorized"),
            "date": now, "is_income": bool(parsed.get("is_income")),
            "source": "sms", "created_at": now,
        })
        await db.sms_messages.update_one({"sms_id": sms_id}, {"$set": {"transaction_id": tx_id}})
        return {"ok": True, "transaction_id": tx_id}

    # ===== Twilio webhook (public) =====
    @router.post("/sms/webhook")
    async def twilio_webhook(request: Request,
                             From: str = Form(""), To: str = Form(""), Body: str = Form("")):
        """Twilio inbound SMS webhook. Routes by destination number (per-user)."""
        db = request.app.state.db

        # First, try to find user by their own Twilio phone_number (per-user setup)
        user = await db.users.find_one({"twilio.phone_number": To}, {"_id": 0})

        # Otherwise fall back to admin-level Twilio config
        if not user:
            twilio_number = await get_config(db, "twilio_phone_number", "TWILIO_PHONE_NUMBER")
            if twilio_number and To != twilio_number:
                return {"ok": True, "skipped": "number_mismatch"}
            user = await db.users.find_one({"sms_sender": From}, {"_id": 0})
            if not user:
                owner_email = await get_config(db, "twilio_owner_email", "ADMIN_EMAIL")
                user = await db.users.find_one({"email": (owner_email or "").lower()}, {"_id": 0})
        if not user:
            return {"ok": True, "skipped": "no_user"}

        try:
            parsed = await _ai_parse(Body)
        except Exception as e:
            logger.error(f"webhook AI parse failed: {e}")
            parsed = {"is_transaction": False, "confidence": 0, "reason_if_not_transaction": str(e)[:120]}

        now = datetime.now(timezone.utc).isoformat()
        sms_id = f"sms_{uuid.uuid4().hex[:10]}"
        rec = {
            "sms_id": sms_id, "user_id": user["user_id"],
            "text": Body[:2000], "parsed": parsed,
            "source": "twilio", "from": From, "to": To,
            "transaction_id": None, "created_at": now,
        }
        if parsed.get("is_transaction") and parsed.get("confidence", 0) >= 0.7:
            tx_id = f"tx_{uuid.uuid4().hex[:12]}"
            amt = abs(float(parsed.get("amount", 0)))
            await db.transactions.insert_one({
                "transaction_id": tx_id, "user_id": user["user_id"],
                "amount": amt if parsed.get("is_income") else -amt,
                "currency": parsed.get("currency", "GBP"),
                "description": parsed.get("description", ""),
                "merchant": parsed.get("merchant"),
                "category": parsed.get("category", "uncategorized"),
                "date": now, "is_income": bool(parsed.get("is_income")),
                "source": "sms", "created_at": now,
            })
            rec["transaction_id"] = tx_id
        await db.sms_messages.insert_one(rec)
        return {"ok": True, "parsed": parsed.get("is_transaction"), "confidence": parsed.get("confidence", 0)}

    # ===== Admin Twilio config =====
    @router.get("/admin/twilio-config")
    async def get_twilio_cfg(request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        db = request.app.state.db
        sid = await get_config(db, "twilio_account_sid", "TWILIO_ACCOUNT_SID")
        token_exists = bool(await get_config(db, "twilio_auth_token", "TWILIO_AUTH_TOKEN"))
        number = await get_config(db, "twilio_phone_number", "TWILIO_PHONE_NUMBER")
        webhook = f"{os.environ.get('FRONTEND_URL', '')}/api/sms/webhook"
        return {"account_sid": sid or "", "has_token": token_exists, "phone_number": number or "", "webhook_url": webhook}

    @router.put("/admin/twilio-config")
    async def put_twilio_cfg(payload: TwilioConfigIn, request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        db = request.app.state.db
        mapping = {
            "twilio_account_sid": payload.account_sid,
            "twilio_auth_token": payload.auth_token,
            "twilio_phone_number": payload.phone_number,
        }
        for k, v in mapping.items():
            if v is not None and v != "":
                await db.app_config.update_one({"key": k}, {"$set": {"key": k, "value": v}}, upsert=True)
        return {"ok": True}

    return router
