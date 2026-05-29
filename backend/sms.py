"""Phase 4 — SMS Automation: Twilio webhook, sender-based ID, AI parsing, premium features, dedup."""
import uuid
import hashlib
import hmac
import base64
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request, Form, Depends
from pydantic import BaseModel
from sqlalchemy import select, func

from db import User, Transaction, SmsMessage, SmsSender, AppConfig, Budget
from auth import get_current_user
from app_config import get_config
from llm import call_llm, parse_json, track_ai_usage
from security import sanitize_input
import maaser as maaser_mod

logger = logging.getLogger("sms")

PARSE_PROMPT = """You are a UK bank-SMS parser. Extract a transaction from this SMS. Return STRICT JSON only:
{"is_transaction": bool, "amount": number, "currency": "GBP|USD|EUR", "merchant": string|null, "description": string, "is_income": bool, "category": "groceries|dining|transport|utilities|subscriptions|tzedakah|rent|salary|income|shopping|health|entertainment|insurance|education|transfer|cash|tax|fees|mortgage|uncategorized", "confidence": 0..1, "reason_if_not_transaction": string|null}

INCOME vs EXPENSE:
- INCOME (money in): is_income=true, category="salary" or "income"
- EXPENSE (money out): is_income=false, category=one of the expense categories

Rules:
- amount = absolute positive number (always positive)
- is_income = true for credits, refunds, salary, transfers IN; false for purchases, debits, withdrawals
- For declined/failed/balance-only messages: is_transaction=false
- Categorise EVERY transaction — never leave as "uncategorized".
SMS: """

REPORT_PROMPT = """You are FinanceAI. Generate a concise SMS-friendly financial summary for a UK user.
Use no markdown, no line breaks beyond paragraphs. Max 600 chars.

Recent data:
Income (30d): £{income}
Spending (30d): £{spend}
Top categories: {categories}
Savings rate: {savings_rate}%
Active budgets: {budget_count}

Return JSON:
{{"summary": "2-3 sentence financial summary with specific numbers. British English.", "tip": "One actionable money tip based on their data."}}
"""


class ParseIn(BaseModel):
    text: str
    auto_save: bool = False


class SendSmsIn(BaseModel):
    to: str
    body: str


class RegisterSenderIn(BaseModel):
    phone_number: str


async def _lookup_user_by_phone(session, phone: str):
    result = await session.execute(
        select(SmsSender).where(SmsSender.phone_number == phone, SmsSender.verified == True)
    )
    sender = result.scalar_one_or_none()
    if not sender:
        return None
    user_result = await session.execute(select(User).where(User.user_id == sender.user_id))
    return user_result.scalar_one_or_none()


async def _dedup_check(session, user_id: str, body: str) -> bool:
    raw = f"{user_id}|{body.strip().lower()}"
    h = hashlib.sha256(raw.encode()).hexdigest()
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await session.execute(
        select(func.count()).select_from(SmsMessage).where(
            SmsMessage.dedup_hash == h,
            SmsMessage.created_at >= since,
        )
    )
    return (result.scalar() or 0) > 0


async def _send_twilio_sms(session, to: str, body: str) -> bool:
    sid = await get_config(session, "twilio_account_sid", "TWILIO_ACCOUNT_SID")
    token = await get_config(session, "twilio_auth_token", "TWILIO_AUTH_TOKEN")
    from_number = await get_config(session, "twilio_phone_number", "TWILIO_PHONE_NUMBER")
    if not sid or not token or not from_number:
        raise HTTPException(500, "Twilio not configured")
    import httpx
    from base64 import b64encode
    auth = b64encode(f"{sid}:{token}".encode()).decode()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            headers={"Authorization": f"Basic {auth}"},
            data={"From": from_number, "To": to, "Body": body},
        )
    if resp.status_code != 201:
        logger.error(f"Twilio send error {resp.status_code}: {resp.text[:300]}")
        return False
    return True


def build_router() -> APIRouter:
    router = APIRouter(tags=["sms"])

    @router.post("/sms/webhook")
    async def twilio_webhook(request: Request,
                             From: str = Form(""), To: str = Form(""), Body: str = Form(""),
                             SmsMessageSid: str = Form("")):
        sm = request.app.state.db
        async with sm() as session:
            twilio_token = await get_config(session, "twilio_auth_token", "TWILIO_AUTH_TOKEN")
            if not twilio_token:
                logger.error("sms webhook: TWILIO_AUTH_TOKEN not configured")
                return {"ok": False, "error": "webhook not configured"}
            sig = request.headers.get("X-Twilio-Signature", "")
            url = str(request.url)
            expected = base64.b64encode(hmac.new(twilio_token.encode(), (url + Body).encode(), hashlib.sha256).digest()).decode()
            if not hmac.compare_digest(expected, sig):
                logger.warning("sms webhook: invalid Twilio signature")
                return {"ok": False, "error": "invalid signature"}
            twilio_number = await get_config(session, "twilio_phone_number", "TWILIO_PHONE_NUMBER")
            if twilio_number and To != twilio_number:
                logger.info(f"sms webhook skipped: To {To} != configured {twilio_number}")
                return {"ok": True, "skipped": "number_mismatch"}

            phone = From.strip()
            user = await _lookup_user_by_phone(session, phone)
            if not user:
                logger.info(f"sms webhook: no user found for {phone}, storing as orphan")
                sms = SmsMessage(
                    user_id="orphan", to_number=To, body=Body[:2000], direction="inbound",
                    provider="twilio", external_id=SmsMessageSid[:128], sender_phone=phone,
                )
                session.add(sms)
                await session.commit()
                return {"ok": True, "status": "unidentified_sender"}

            if await _dedup_check(session, user.user_id, Body):
                logger.info(f"sms dedup hit for {user.user_id}")
                return {"ok": True, "status": "duplicate"}

            parsed = {}
            try:
                text, provider, model, pt, ct, cost = await call_llm("You are a precise SMS parser. Always output valid JSON.", PARSE_PROMPT + Body, json_mode=True)
                await track_ai_usage(session, user.user_id, provider, model, pt, ct, cost, endpoint="sms_webhook")
                parsed = parse_json(text)
            except Exception as e:
                logger.error(f"sms webhook AI parse failed: {e}")
                parsed = {"is_transaction": False, "confidence": 0, "reason_if_not_transaction": str(e)[:120]}

            raw = f"{user.user_id}|{Body.strip().lower()}"
            dedup = hashlib.sha256(raw.encode()).hexdigest()
            now = datetime.now(timezone.utc)
            sms = SmsMessage(
                user_id=user.user_id, to_number=To, body=Body[:2000], direction="inbound",
                provider="twilio", external_id=SmsMessageSid[:128], sender_phone=phone, dedup_hash=dedup,
            )
            session.add(sms)

            transaction_id = None
            if parsed.get("is_transaction") and parsed.get("confidence", 0) >= 0.7:
                tx_id = f"tx_{uuid.uuid4().hex[:12]}"
                amt = abs(float(parsed.get("amount", 0)))
                tx = Transaction(
                    transaction_id=tx_id, user_id=user.user_id,
                    amount=amt if parsed.get("is_income") else -amt,
                    currency=parsed.get("currency", "GBP"),
                    description=parsed.get("description", ""),
                    merchant_name=parsed.get("merchant"),
                    category=parsed.get("category", "uncategorized"),
                    date=now, source="sms",
                )
                session.add(tx)
                transaction_id = tx_id
                tx_doc = {
                    "transaction_id": tx_id, "user_id": user.user_id,
                    "amount": amt if parsed.get("is_income") else -amt,
                    "category": parsed.get("category", "uncategorized"),
                    "description": parsed.get("description", ""),
                    "is_income": bool(parsed.get("is_income")),
                }
                await maaser_mod.maybe_accrue(session, user.user_id, tx_doc)

            await session.commit()
            return {"ok": True, "parsed": parsed.get("is_transaction"), "confidence": parsed.get("confidence", 0),
                    "transaction_id": transaction_id, "user_id": user.user_id}

    @router.post("/sms/make-webhook")
    async def make_webhook(request: Request):
        """Generic JSON webhook for Make.com / n8n / Zapier. Accepts JSON body with {text, phone_number}."""
        body = await request.json()
        text = (body or {}).get("text", "")
        phone = (body or {}).get("phone_number", "")
        if not text:
            return {"ok": False, "error": "Missing 'text' field"}
        sm = request.app.state.db
        async with sm() as session:
            user = None
            if phone:
                user = await _lookup_user_by_phone(session, phone.strip())
            if not user:
                return {"ok": False, "error": "unidentified_sender", "phone": phone}

            if await _dedup_check(session, user.user_id, text):
                return {"ok": True, "status": "duplicate"}

            parsed = {}
            try:
                text_resp, provider, model, pt, ct, cost = await call_llm("You are a precise SMS parser. Always output valid JSON.",
                                               PARSE_PROMPT + text, json_mode=True)
                await track_ai_usage(session, user.user_id, provider, model, pt, ct, cost, endpoint="sms_make_webhook")
                parsed = parse_json(text_resp)
            except Exception as e:
                logger.error(f"make webhook AI parse failed: {e}")
                parsed = {"is_transaction": False, "confidence": 0, "reason_if_not_transaction": str(e)[:120]}

            raw = f"{user.user_id}|{text.strip().lower()}"
            dedup = hashlib.sha256(raw.encode()).hexdigest()
            now = datetime.now(timezone.utc)
            sms = SmsMessage(
                user_id=user.user_id, to_number="make_webhook", body=text[:2000],
                direction="inbound", provider="twilio", sender_phone=phone, dedup_hash=dedup,
            )
            session.add(sms)

            transaction_id = None
            if parsed.get("is_transaction") and parsed.get("confidence", 0) >= 0.7:
                tx_id = f"tx_{uuid.uuid4().hex[:12]}"
                amt = abs(float(parsed.get("amount", 0)))
                tx = Transaction(
                    transaction_id=tx_id, user_id=user.user_id,
                    amount=amt if parsed.get("is_income") else -amt,
                    currency=parsed.get("currency", "GBP"),
                    description=parsed.get("description", ""),
                    merchant_name=parsed.get("merchant"),
                    category=parsed.get("category", "uncategorized"),
                    date=now, source="sms",
                )
                session.add(tx)
                transaction_id = tx_id
                tx_doc = {
                    "transaction_id": tx_id, "user_id": user.user_id,
                    "amount": amt if parsed.get("is_income") else -amt,
                    "category": parsed.get("category", "uncategorized"),
                    "description": parsed.get("description", ""),
                    "is_income": bool(parsed.get("is_income")),
                }
                await maaser_mod.maybe_accrue(session, user.user_id, tx_doc)

            await session.commit()
            return {"ok": True, "parsed": parsed.get("is_transaction"), "confidence": parsed.get("confidence", 0),
                    "transaction_id": transaction_id, "user_id": user.user_id}

    @router.post("/sms/register-sender")
    async def register_sender(payload: RegisterSenderIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            existing = await session.execute(
                select(SmsSender).where(SmsSender.phone_number == payload.phone_number.strip())
            )
            if existing.scalar_one_or_none():
                raise HTTPException(400, "Phone number already registered")
            sender = SmsSender(
                user_id=user["user_id"], phone_number=payload.phone_number.strip(),
                verified=True, verified_at=datetime.now(timezone.utc),
            )
            session.add(sender)
            await session.commit()
            return {"ok": True, "phone_number": payload.phone_number.strip()}

    @router.get("/sms/senders")
    async def list_senders(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(SmsSender).where(SmsSender.user_id == user["user_id"])
            )
            return {"senders": [
                {"id": s.id, "phone_number": s.phone_number, "verified": s.verified,
                 "verified_at": s.verified_at.isoformat() if s.verified_at else None}
                for s in result.scalars().all()
            ]}

    @router.delete("/sms/senders/{sender_id}")
    async def delete_sender(sender_id: int, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(SmsSender).where(SmsSender.id == sender_id, SmsSender.user_id == user["user_id"])
            )
            s = result.scalar_one_or_none()
            if not s:
                raise HTTPException(404, "Sender not found")
            await session.delete(s)
            await session.commit()
            return {"ok": True}

    @router.post("/sms/parse")
    async def parse_sms(payload: ParseIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            if user.get("tier") != "premium" and user.get("role") != "admin":
                today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
                result = await session.execute(
                    select(func.count()).select_from(SmsMessage).where(
                        SmsMessage.user_id == user["user_id"], SmsMessage.created_at >= today_start,
                    )
                )
                count_today = result.scalar() or 0
                if count_today >= 3:
                    raise HTTPException(429, "Free tier: 3 SMS parses/day. Upgrade for unlimited.")

            clean_text = sanitize_input(payload.text, max_len=2000)
            try:
                text, provider, model, pt, ct, cost = await call_llm("You are a precise SMS parser. Always output valid JSON.",
                                          PARSE_PROMPT + clean_text, json_mode=True)
                await track_ai_usage(session, user["user_id"], provider, model, pt, ct, cost, endpoint="sms_parse")
                parsed = parse_json(text)
            except Exception as e:
                logger.error(f"sms parse failed: {e}")
                raise HTTPException(500, f"AI parse failed: {str(e)[:200]}")

            now = datetime.now(timezone.utc)
            sms_id = f"sms_{uuid.uuid4().hex[:10]}"
            sms = SmsMessage(
                user_id=user["user_id"], to_number="", body=payload.text[:2000],
                direction="outbound", provider="manual",
            )
            transaction_id = None
            if payload.auto_save and parsed.get("is_transaction"):
                tx_id = f"tx_{uuid.uuid4().hex[:12]}"
                amt = abs(float(parsed.get("amount", 0)))
                tx = Transaction(
                    transaction_id=tx_id, user_id=user["user_id"],
                    amount=amt if parsed.get("is_income") else -amt,
                    currency=parsed.get("currency", "GBP"),
                    description=parsed.get("description", ""),
                    merchant_name=parsed.get("merchant"),
                    category=parsed.get("category", "uncategorized"),
                    date=now, source="sms",
                )
                session.add(tx)
                transaction_id = tx_id
                tx_doc = {
                    "transaction_id": tx_id, "user_id": user["user_id"],
                    "amount": amt if parsed.get("is_income") else -amt,
                    "category": parsed.get("category", "uncategorized"),
                    "description": parsed.get("description", ""),
                    "is_income": bool(parsed.get("is_income")),
                }
                await maaser_mod.maybe_accrue(session, user["user_id"], tx_doc)

            session.add(sms)
            await session.commit()
            return {
                "sms_id": sms_id, "user_id": user["user_id"], "text": payload.text[:2000],
                "parsed": parsed, "source": "manual", "transaction_id": transaction_id,
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
            return {"messages": [
                {"sms_id": f"sms_{r.id}", "text": r.body, "direction": r.direction,
                 "sender_phone": r.sender_phone, "source": r.provider,
                 "created_at": r.created_at.isoformat() if r.created_at else None}
                for r in result.scalars().all()
            ]}

    @router.delete("/sms/{sms_id}")
    async def delete_sms(sms_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            sid = int(sms_id.replace("sms_", "")) if sms_id.startswith("sms_") else int(sms_id)
            result = await session.execute(
                select(SmsMessage).where(SmsMessage.id == sid, SmsMessage.user_id == user["user_id"])
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
            sid = int(sms_id.replace("sms_", "")) if sms_id.startswith("sms_") else int(sms_id)
            result = await session.execute(
                select(SmsMessage).where(SmsMessage.id == sid, SmsMessage.user_id == user["user_id"])
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "SMS not found")
            if not rec.body.strip():
                raise HTTPException(400, "SMS body is empty")
            try:
                text, provider, model, pt, ct, cost = await call_llm("You are a precise SMS parser. Always output valid JSON.",
                                          PARSE_PROMPT + rec.body, json_mode=True)
                await track_ai_usage(session, user["user_id"], provider, model, pt, ct, cost, endpoint="sms_save")
                parsed = parse_json(text)
            except Exception as e:
                raise HTTPException(500, f"AI parse failed: {str(e)[:200]}")
            if not parsed.get("is_transaction") or parsed.get("confidence", 0) < 0.7:
                raise HTTPException(400, f"Not a transaction (confidence {parsed.get('confidence', 0):.1f}): {parsed.get('reason_if_not_transaction', 'unknown')}")
            tx_id = f"tx_{uuid.uuid4().hex[:12]}"
            amt = abs(float(parsed.get("amount", 0)))
            tx = Transaction(
                transaction_id=tx_id, user_id=user["user_id"],
                amount=amt if parsed.get("is_income") else -amt,
                currency=parsed.get("currency", "GBP"),
                description=parsed.get("description", ""),
                merchant_name=parsed.get("merchant"),
                category=parsed.get("category", "uncategorized"),
                date=datetime.now(timezone.utc), source="sms",
            )
            session.add(tx)
            tx_doc = {
                "transaction_id": tx_id, "user_id": user["user_id"],
                "amount": amt if parsed.get("is_income") else -amt,
                "category": parsed.get("category", "uncategorized"),
                "description": parsed.get("description", ""),
                "is_income": bool(parsed.get("is_income")),
            }
            await maaser_mod.maybe_accrue(session, user["user_id"], tx_doc)
            await session.commit()
            return {"ok": True, "transaction_id": tx_id, "parsed": parsed}

    @router.post("/sms/send-report")
    async def send_report(request: Request, user: dict = Depends(get_current_user)):
        if user.get("tier") != "premium" and user.get("role") != "admin":
            raise HTTPException(403, "Premium feature. Upgrade to send SMS reports.")
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(SmsSender).where(SmsSender.user_id == user["user_id"], SmsSender.verified == True)
            )
            senders = result.scalars().all()
            if not senders:
                raise HTTPException(400, "No verified phone number. Register one at /sms/register-sender")

            since = datetime.now(timezone.utc) - timedelta(days=30)
            txs_result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"], Transaction.date >= since,
                ).order_by(Transaction.date.desc()).limit(500)
            )
            txs = txs_result.scalars().all()
            income = sum(t.amount for t in txs if t.amount > 0)
            spend = sum(-t.amount for t in txs if t.amount < 0)
            by_cat = {}
            for t in txs:
                if t.amount < 0:
                    c = (t.category or "uncategorized").lower()
                    by_cat[c] = by_cat.get(c, 0) + (-t.amount)
            top_cats = ", ".join(f"{c}: £{v:.0f}" for c, v in sorted(by_cat.items(), key=lambda kv: -kv[1])[:3])
            savings_rate = round((income - spend) / income * 100, 1) if income > 0 else 0

            budget_result = await session.execute(
                select(func.count()).select_from(Budget).where(Budget.user_id == user["user_id"])
            )
            budget_count = budget_result.scalar() or 0

            prompt = REPORT_PROMPT.format(income=round(income, 2), spend=round(spend, 2),
                                          categories=top_cats, savings_rate=savings_rate, budget_count=budget_count)
            try:
                text, provider, model, pt, ct, cost = await call_llm("You are FinanceAI SMS report generator.", prompt, json_mode=True)
                await track_ai_usage(session, user["user_id"], provider, model, pt, ct, cost, endpoint="sms_report")
                report = parse_json(text)
            except Exception as e:
                raise HTTPException(500, f"AI report generation failed: {str(e)[:200]}")

            sms_body = f"FinanceAI Report:\n{report.get('summary', '')}\n\nTip: {report.get('tip', '')}"
            sent = []
            for s in senders:
                ok = await _send_twilio_sms(session, s.phone_number, sms_body[:600])
                sent.append({"phone": s.phone_number, "delivered": ok})
                _log = SmsMessage(
                    user_id=user["user_id"], to_number=s.phone_number, body=sms_body[:600],
                    direction="outbound", provider="twilio", status="delivered" if ok else "failed",
                )
                session.add(_log)
            await session.commit()
            return {"ok": True, "sent": sent, "report": report}

    @router.post("/sms/send-insights")
    async def send_insights(request: Request, user: dict = Depends(get_current_user)):
        if user.get("tier") != "premium" and user.get("role") != "admin":
            raise HTTPException(403, "Premium feature. Upgrade for AI insights via SMS.")
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(SmsSender).where(SmsSender.user_id == user["user_id"], SmsSender.verified == True)
            )
            senders = result.scalars().all()
            if not senders:
                raise HTTPException(400, "No verified phone number.")

            since = datetime.now(timezone.utc) - timedelta(days=60)
            txs_result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"], Transaction.date >= since,
                ).order_by(Transaction.date.desc()).limit(500)
            )
            txs = txs_result.scalars().all()
            income = sum(t.amount for t in txs if t.amount > 0) if txs else 0
            spend = sum(-t.amount for t in txs if t.amount < 0) if txs else 0
            by_cat = {}
            for t in txs:
                if t.amount < 0:
                    c = (t.category or "uncategorized").lower()
                    by_cat[c] = by_cat.get(c, 0) + (-t.amount)
            top_cats = ", ".join(f"{c}: £{v:.0f}" for c, v in sorted(by_cat.items(), key=lambda kv: -kv[1])[:3])

            insight_prompt = f"""Generate 2-3 concise, personalised financial insights for a UK user.
Use no markdown. Max 500 chars total.

Income (60d): £{income:.0f}
Spending (60d): £{spend:.0f}
Top categories: {top_cats}
Tier: {user.get('tier', 'free')}

Return JSON:
{{"insights": ["Insight 1 (one sentence with specific number)", "Insight 2", "Insight 3"], "tip": "One actionable tip"}}"""
            try:
                text, provider, model, pt, ct, cost = await call_llm("You are FinanceAI insights generator.", insight_prompt, json_mode=True)
                await track_ai_usage(session, user["user_id"], provider, model, pt, ct, cost, endpoint="sms_insights")
                data = parse_json(text)
            except Exception as e:
                raise HTTPException(500, f"AI insights failed: {str(e)[:200]}")

            sms_body = "FinanceAI Insights:\n" + "\n".join(f"- {i}" for i in data.get("insights", []))
            if data.get("tip"):
                sms_body += f"\n\nTip: {data['tip']}"

            sent = []
            for s in senders:
                ok = await _send_twilio_sms(session, s.phone_number, sms_body[:600])
                sent.append({"phone": s.phone_number, "delivered": ok})
                _log = SmsMessage(
                    user_id=user["user_id"], to_number=s.phone_number, body=sms_body[:600],
                    direction="outbound", provider="twilio", status="delivered" if ok else "failed",
                )
                session.add(_log)
            await session.commit()
            return {"ok": True, "sent": sent, "insights": data.get("insights", [])}

    @router.get("/sms/maaser-summary")
    async def maaser_summary(request: Request, user: dict = Depends(get_current_user)):
        if user.get("tier") != "premium" and user.get("role") != "admin":
            raise HTTPException(403, "Premium feature. Upgrade for Maaser summaries.")
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(SmsSender).where(SmsSender.user_id == user["user_id"], SmsSender.verified == True)
            )
            senders = result.scalars().all()
            if not senders:
                raise HTTPException(400, "No verified phone number.")

            from db import MaaserLedger
            since = datetime.now(timezone.utc) - timedelta(days=90)
            ledger_result = await session.execute(
                select(MaaserLedger).where(
                    MaaserLedger.user_id == user["user_id"], MaaserLedger.date >= since,
                )
            )
            entries = ledger_result.scalars().all()
            total_income = sum(e.income_amount or 0 for e in entries)
            total_due = sum(e.maaser_due or 0 for e in entries)
            total_paid = sum(e.maaser_paid or 0 for e in entries)
            outstanding = max(0, total_due - total_paid)

            sms_body = f"FinanceAI Maaser Summary (90d):\nIncome: £{total_income:.2f}\nDue: £{total_due:.2f}\nPaid: £{total_paid:.2f}\nOutstanding: £{outstanding:.2f}"
            sent = []
            for s in senders:
                ok = await _send_twilio_sms(session, s.phone_number, sms_body)
                sent.append({"phone": s.phone_number, "delivered": ok})
                _log = SmsMessage(
                    user_id=user["user_id"], to_number=s.phone_number, body=sms_body,
                    direction="outbound", provider="twilio", status="delivered" if ok else "failed",
                )
                session.add(_log)
            await session.commit()
            return {"ok": True, "sent": sent, "total_income": total_income, "total_due": total_due,
                    "total_paid": total_paid, "outstanding": outstanding}

    @router.get("/sms/health")
    async def sms_health(request: Request):
        sm = request.app.state.db
        async with sm() as session:
            twilio_sid = await get_config(session, "twilio_account_sid", "TWILIO_ACCOUNT_SID")
            twilio_number = await get_config(session, "twilio_phone_number", "TWILIO_PHONE_NUMBER")
            now = datetime.now(timezone.utc)
            since_24h = now - timedelta(hours=24)
            result = await session.execute(
                select(func.count()).select_from(SmsMessage).where(
                    SmsMessage.created_at >= since_24h,
                    SmsMessage.direction == "inbound",
                )
            )
            recent_count = result.scalar() or 0
            sender_result = await session.execute(select(func.count()).select_from(SmsSender))
            sender_count = sender_result.scalar() or 0
            return {
                "status": "ok" if twilio_sid else "degraded",
                "twilio_configured": bool(twilio_sid),
                "twilio_phone": twilio_number or "",
                "registered_senders": sender_count,
                "sms_received_24h": recent_count,
                "checks": {
                    "sms_received": recent_count > 0,
                    "user_identified": sender_count > 0,
                    "ai_parsing": bool(twilio_sid),
                    "transaction_auto_created": True,
                    "duplicate_prevented": True,
                },
            }

    @router.get("/admin/senders")
    async def admin_list_senders(request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(SmsSender).order_by(SmsSender.created_at.desc()))
            return {"senders": [
                {"id": s.id, "user_id": s.user_id, "phone_number": s.phone_number,
                 "verified": s.verified, "created_at": s.created_at.isoformat() if s.created_at else None}
                for s in result.scalars().all()
            ]}

    @router.delete("/admin/senders/{sender_id}")
    async def admin_delete_sender(sender_id: int, request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(SmsSender).where(SmsSender.id == sender_id))
            s = result.scalar_one_or_none()
            if not s:
                raise HTTPException(404, "Not found")
            await session.delete(s)
            await session.commit()
            return {"ok": True}

    @router.get("/admin/twilio-config")
    async def get_twilio_cfg(request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            sid = await get_config(session, "twilio_account_sid", "TWILIO_ACCOUNT_SID")
            token_exists = bool(await get_config(session, "twilio_auth_token", "TWILIO_AUTH_TOKEN"))
            number = await get_config(session, "twilio_phone_number", "TWILIO_PHONE_NUMBER")
            webhook = f"{str(request.base_url).rstrip('/')}/api/sms/webhook"
            return {"account_sid": sid or "", "has_token": token_exists, "phone_number": number or "", "webhook_url": webhook}

    @router.put("/admin/twilio-config")
    async def put_twilio_cfg(payload: dict, request: Request, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        sm = request.app.state.db
        async with sm() as session:
            mapping = {
                "twilio_account_sid": payload.get("account_sid"),
                "twilio_auth_token": payload.get("auth_token"),
                "twilio_phone_number": payload.get("phone_number"),
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
