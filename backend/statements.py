"""Statement upload + AI-parsed transactions (CSV / PDF)."""
import io
import csv
import json
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Request, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from pypdf import PdfReader

import os
from auth import get_current_user
import maaser as maaser_mod

logger = logging.getLogger("statements")

MAX_BYTES = 5 * 1024 * 1024  # 5 MB hard cap
PARSE_LIMIT_FREE = 1  # per day
MAX_CHARS_TO_AI = 40000

PARSE_PROMPT = """You are a UK bank statement parser. Below is text extracted from a bank statement (CSV or PDF).
Extract every transaction as JSON. Return STRICT JSON only — no markdown, no commentary.

Schema:
{
  "currency": "GBP|USD|EUR",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": string,
      "merchant": string|null,
      "amount": number (positive for credits/income, negative for debits/spend),
      "category": "groceries|dining|transport|utilities|subscriptions|tzedakah|rent|salary|income|uncategorized",
      "is_income": bool,
      "confidence": 0..1
    }
  ]
}

Rules:
- Use ISO date format YYYY-MM-DD. If only DD/MM/YYYY appears, convert.
- Amount sign: negative for spend/debits/withdrawals, positive for credits/income/refunds.
- Use British English categories.
- Skip header rows, balance lines, and footnotes.
- Skip transactions with confidence < 0.4.
- Cap to 200 transactions.

STATEMENT TEXT:
"""


class SaveIn(BaseModel):
    statement_id: str


def _pdf_to_text(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    parts = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception as e:
            logger.warning(f"pdf page extract failed: {e}")
    return "\n".join(parts)


def _csv_to_text(content: bytes) -> str:
    """Decode CSV bytes → tab-separated text Claude can read precisely."""
    text = content.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    lines = []
    for i, row in enumerate(reader):
        lines.append(" | ".join(c.strip() for c in row))
        if i > 1000:  # safety cap
            break
    return "\n".join(lines)


async def _ai_parse_statement(text: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ["EMERGENT_LLM_KEY"]
    session_id = f"stmt_{uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=api_key, session_id=session_id,
        system_message="You are a precise UK bank statement parser. Always output valid JSON only.",
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    msg = UserMessage(text=PARSE_PROMPT + text[:MAX_CHARS_TO_AI])
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
    router = APIRouter(prefix="/statements", tags=["statements"])

    @router.post("/upload")
    async def upload(request: Request, file: UploadFile = File(...),
                     user: dict = Depends(get_current_user)):
        db = request.app.state.db
        # Free-tier daily limit
        if user.get("tier") != "premium" and user.get("role") != "admin":
            today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()
            count = await db.statements.count_documents(
                {"user_id": user["user_id"], "created_at": {"$gte": today}}
            )
            if count >= PARSE_LIMIT_FREE:
                raise HTTPException(429, "Free tier: 1 statement upload/day. Upgrade for unlimited.")

        content = await file.read()
        if len(content) > MAX_BYTES:
            raise HTTPException(413, "File too large (max 5 MB)")
        if len(content) == 0:
            raise HTTPException(400, "Empty file")

        fname = (file.filename or "").lower()
        kind = "unknown"
        text = ""
        if fname.endswith(".pdf") or (file.content_type or "").endswith("pdf"):
            kind = "pdf"
            try:
                text = _pdf_to_text(content)
            except Exception as e:
                raise HTTPException(400, f"Could not read PDF: {e}")
        elif fname.endswith(".csv") or (file.content_type or "").endswith("csv"):
            kind = "csv"
            text = _csv_to_text(content)
        else:
            raise HTTPException(400, "Only .csv or .pdf files are supported")

        if len(text.strip()) < 20:
            raise HTTPException(400, "Could not extract any text from the file")

        parsed = {}
        try:
            parsed = await _ai_parse_statement(text)
        except Exception as e:
            logger.error(f"ai parse failed: {e}")
            raise HTTPException(500, f"AI parsing failed: {str(e)[:200]}")

        txs = parsed.get("transactions", []) or []
        # Sanitise
        clean = []
        for t in txs[:200]:
            try:
                clean.append({
                    "date": str(t.get("date", ""))[:10],
                    "description": str(t.get("description", ""))[:200],
                    "merchant": (str(t["merchant"])[:120] if t.get("merchant") else None),
                    "amount": float(t.get("amount", 0)),
                    "category": str(t.get("category", "uncategorized")).lower(),
                    "is_income": bool(t.get("is_income")),
                    "confidence": float(t.get("confidence", 0.5)),
                })
            except Exception:
                continue

        statement_id = f"stmt_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        await db.statements.insert_one({
            "statement_id": statement_id,
            "user_id": user["user_id"],
            "filename": file.filename,
            "kind": kind,
            "size_bytes": len(content),
            "currency": parsed.get("currency", "GBP"),
            "transactions": clean,
            "saved": False,
            "saved_count": 0,
            "created_at": now,
        })

        return {
            "statement_id": statement_id,
            "filename": file.filename,
            "kind": kind,
            "currency": parsed.get("currency", "GBP"),
            "transaction_count": len(clean),
            "transactions": clean,
        }

    @router.get("")
    async def list_statements(request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        rows = await db.statements.find(
            {"user_id": user["user_id"]},
            {"_id": 0, "transactions": 0},  # omit heavy field
        ).sort("created_at", -1).limit(50).to_list(50)
        return {"statements": rows}

    @router.get("/{statement_id}")
    async def get_statement(statement_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        rec = await db.statements.find_one(
            {"statement_id": statement_id, "user_id": user["user_id"]}, {"_id": 0}
        )
        if not rec:
            raise HTTPException(404, "Not found")
        return rec

    @router.post("/{statement_id}/save")
    async def save_all(statement_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        rec = await db.statements.find_one(
            {"statement_id": statement_id, "user_id": user["user_id"]}, {"_id": 0}
        )
        if not rec:
            raise HTTPException(404, "Not found")
        if rec.get("saved"):
            raise HTTPException(400, "Already saved")

        now = datetime.now(timezone.utc).isoformat()
        docs = []
        accrued_count = 0
        for t in rec.get("transactions", []):
            doc = {
                "transaction_id": f"tx_{uuid.uuid4().hex[:12]}",
                "user_id": user["user_id"],
                "amount": float(t["amount"]),
                "currency": rec.get("currency", "GBP"),
                "description": t["description"],
                "merchant": t.get("merchant"),
                "category": t.get("category", "uncategorized"),
                "date": t.get("date") or now[:10],
                "is_income": bool(t.get("is_income")),
                "source": "statement",
                "source_id": statement_id,
                "created_at": now,
            }
            docs.append(doc)
        if docs:
            await db.transactions.insert_many(docs)
            for d in docs:
                a = await maaser_mod.maybe_accrue(db, user["user_id"], d)
                if a:
                    accrued_count += 1
        await db.statements.update_one(
            {"statement_id": statement_id},
            {"$set": {"saved": True, "saved_count": len(docs), "saved_at": now}},
        )
        return {"ok": True, "saved_count": len(docs), "maaser_accrued_count": accrued_count}

    @router.delete("/{statement_id}")
    async def delete_statement(statement_id: str, request: Request, user: dict = Depends(get_current_user)):
        db = request.app.state.db
        r = await db.statements.delete_one(
            {"statement_id": statement_id, "user_id": user["user_id"]}
        )
        if r.deleted_count == 0:
            raise HTTPException(404, "Not found")
        # Also remove transactions tagged to this statement
        await db.transactions.delete_many({"user_id": user["user_id"], "source_id": statement_id})
        return {"ok": True}

    return router
