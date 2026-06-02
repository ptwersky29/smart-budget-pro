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
from sqlalchemy import select, func, delete

import os
from db import Transaction, Statement, MaaserLedger
from auth import get_current_user
import maaser as maaser_mod

logger = logging.getLogger("statements")

MAX_BYTES = 5 * 1024 * 1024
PARSE_LIMIT_FREE = 1
MAX_CHARS_TO_AI = 40000

INCOME_CATEGORIES = {"salary", "income"}
EXPENSE_CATEGORIES = {
    "groceries", "dining", "transport", "utilities", "subscriptions",
    "tzedakah", "rent", "shopping", "health", "entertainment",
    "insurance", "education", "transfer", "cash", "tax", "fees",
    "mortgage",
}
ALL_CATEGORIES = INCOME_CATEGORIES | EXPENSE_CATEGORIES | {"uncategorized"}
CATEGORIES = sorted(ALL_CATEGORIES)

PARSE_PROMPT = """You are a UK bank statement parser. Below is text extracted from a bank statement (CSV or PDF).
Extract every transaction as JSON. Return STRICT JSON only — no markdown, no commentary.

INCOME vs EXPENSE RULES — this is CRITICAL:
- INCOME = money coming IN (salary, wages, refunds, interest, dividends, cashback, transfers IN, credits)
  → amount MUST be POSITIVE (e.g. 1500.00)
  → category = "salary" or "income"
- EXPENSE = money going OUT (purchases, bills, fees, transfers OUT, debits, withdrawals)
  → amount MUST be NEGATIVE (e.g. -45.99)
  → category = one of: groceries, dining, transport, utilities, subscriptions, tzedakah, rent, shopping, health, entertainment, insurance, education, transfer, cash, tax, fees, mortgage

Schema:
{
  "currency": "GBP|USD|EUR",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": string,
      "merchant": string|null,
      "amount": number,
      "category": string,
      "is_income": bool,
      "confidence": 0..1
    }
  ]
}

Rules:
- Use ISO date format YYYY-MM-DD.
- Amount sign: POSITIVE for income (salary, interest, refunds, credits), NEGATIVE for expenses (purchases, bills, debits).
- categorise EVERY transaction — never leave as "uncategorized".
- Skip header rows, balance lines, and footnotes.
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
    text = content.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    lines = []
    for i, row in enumerate(reader):
        lines.append(" | ".join(c.strip() for c in row))
        if i > 1000:
            break
    return "\n".join(lines)


async def _ai_parse_statement(text: str, session=None, user_id: str = None) -> dict:
    from llm import call_llm, parse_json as llm_parse, track_ai_usage
    raw, provider, model, pt, ct, cost = await call_llm(
        "You are a precise UK bank statement parser. Always output valid JSON only.",
        PARSE_PROMPT + text[:MAX_CHARS_TO_AI],
        json_mode=True,
    )
    if session and user_id:
        await track_ai_usage(session, user_id, provider, model, pt, ct, cost, endpoint="statement_parse")
    try:
        return llm_parse(raw)
    except ValueError as e:
        raise RuntimeError(f"AI JSON parse failed: {e}")


CATEGORISE_PROMPT = """You are a bank transaction categoriser. Given the description, merchant, and amount of a transaction, choose the best single category.

INCOME vs EXPENSE:
- If amount > 0 (money coming in): category is "salary" or "income" only
- If amount < 0 (money going out): category is one of the expense categories

Expense categories: groceries, dining, transport, utilities, subscriptions, tzedakah, rent, shopping, health, entertainment, insurance, education, transfer, cash, tax, fees, mortgage

Return STRICT JSON only: {{"category": "..."}}

Examples:
- "TESCO STORE 1234" | merchant: tesco | amount: -45.99 -> "groceries"
- "MCDONALD'S" | merchant: mcdonald | amount: -12.50 -> "dining"
- "SALARY" | merchant: employer | amount: 2500.00 -> "salary"
- "INTEREST" | merchant: bank | amount: 12.34 -> "income"
- "AMAZON PRIME" | merchant: amazon | amount: -7.99 -> "subscriptions"
- "NATIONAL GRID" | merchant: national grid | amount: -85.00 -> "utilities"

Transaction: {description}
Merchant: {merchant}
Amount: {amount}
"""


def _fix_sign(tx: dict) -> dict:
    """Ensure amount sign matches the category (income=positive, expense=negative)."""
    cat = tx.get("category", "uncategorized").lower()
    amt = tx.get("amount", 0)
    try:
        amt = float(amt)
    except (TypeError, ValueError):
        amt = 0.0
    if cat in INCOME_CATEGORIES and amt < 0:
        tx["amount"] = abs(amt)
        tx["is_income"] = True
    elif cat in EXPENSE_CATEGORIES and amt > 0:
        tx["amount"] = -abs(amt)
        tx["is_income"] = False
    else:
        tx["is_income"] = amt > 0
    return tx


async def _ai_categorise(description: str, merchant: str | None, amount: float, session=None, user_id: str = None) -> str:
    from llm import call_llm, parse_json as llm_parse, track_ai_usage
    prompt = CATEGORISE_PROMPT.format(
        description=description[:100],
        merchant=merchant or "unknown",
        amount=amount,
    )
    try:
        raw, provider, model, pt, ct, cost = await call_llm(
            "You categorise bank transactions. Output valid JSON only.",
            prompt, json_mode=False,
        )
        if session and user_id:
            await track_ai_usage(session, user_id, provider, model, pt, ct, cost, endpoint="statement_categorize")
        data = llm_parse(raw)
        cat = str(data.get("category", "uncategorized")).lower().strip()
        return cat if cat in ALL_CATEGORIES else "uncategorized"
    except Exception:
        return "uncategorized"


def build_router() -> APIRouter:
    router = APIRouter(prefix="/statements", tags=["statements"])

    @router.post("/upload")
    async def upload(request: Request, file: UploadFile = File(...),
                     user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            if user.get("tier") != "premium" and user.get("role") != "admin":
                today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
                result = await session.execute(
                    select(func.count()).select_from(Statement).where(
                        Statement.user_id == user["user_id"],
                        Statement.created_at >= today,
                    )
                )
                count = result.scalar() or 0
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
                parsed = await _ai_parse_statement(text, session, user["user_id"])
            except Exception as e:
                logger.error(f"ai parse failed: {e}")
                raise HTTPException(500, f"AI parsing failed: {str(e)[:200]}")

            txs = parsed.get("transactions", []) or []
            clean = []
            for t in txs[:200]:
                try:
                    tx = _fix_sign({
                        "date": str(t.get("date", ""))[:10],
                        "description": str(t.get("description", ""))[:200],
                        "merchant": (str(t["merchant"])[:120] if t.get("merchant") else None),
                        "amount": float(t.get("amount", 0)),
                        "category": str(t.get("category", "uncategorized")).lower(),
                        "is_income": bool(t.get("is_income")),
                        "confidence": float(t.get("confidence", 0.5)),
                    })
                    clean.append(tx)
                except Exception:
                    continue

            uncat = [t for t in clean if t["category"] == "uncategorized"]
            if uncat:
                logger.info(f"Re-categorising {len(uncat)} uncategorised transactions")
                for t in uncat:
                    new_cat = await _ai_categorise(t["description"], t.get("merchant"), t["amount"], session, user["user_id"])
                    t["category"] = new_cat
                    _fix_sign(t)

            stmt = Statement(
                user_id=user["user_id"],
                period_start=None,
                period_end=None,
                total_income=sum(t["amount"] for t in clean if t["amount"] > 0),
                total_expenses=sum(-t["amount"] for t in clean if t["amount"] < 0),
                currency=parsed.get("currency", "GBP"),
                data={"filename": file.filename, "kind": kind, "size_bytes": len(content), "transactions": clean},
                status="draft",
            )
            session.add(stmt)
            await session.commit()
            await session.refresh(stmt)

            return {
                "statement_id": f"stmt_{stmt.id}",
                "filename": file.filename,
                "kind": kind,
                "currency": parsed.get("currency", "GBP"),
                "transaction_count": len(clean),
                "transactions": clean,
            }

    @router.get("")
    async def list_statements(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(Statement).where(Statement.user_id == user["user_id"])
                .order_by(Statement.created_at.desc()).limit(50)
            )
            rows = result.scalars().all()
            return {"statements": [
                {
                    "id": f"stmt_{r.id}",
                    "user_id": r.user_id,
                    "period_start": r.period_start.isoformat() if r.period_start else None,
                    "period_end": r.period_end.isoformat() if r.period_end else None,
                    "total_income": r.total_income,
                    "total_expenses": r.total_expenses,
                    "status": r.status,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]}

    @router.get("/{statement_id}")
    async def get_statement(statement_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            stmt_id_int = int(statement_id.replace("stmt_", "")) if statement_id.startswith("stmt_") else int(statement_id)
            result = await session.execute(
                select(Statement).where(
                    Statement.id == stmt_id_int,
                    Statement.user_id == user["user_id"],
                )
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Not found")
            return {
                "id": f"stmt_{rec.id}",
                "user_id": rec.user_id,
                "total_income": rec.total_income,
                "total_expenses": rec.total_expenses,
                "currency": rec.currency,
                "status": rec.status,
                "transactions": (rec.data or {}).get("transactions", []),
                "created_at": rec.created_at.isoformat() if rec.created_at else None,
            }

    @router.post("/{statement_id}/save")
    async def save_all(statement_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            stmt_id_int = int(statement_id.replace("stmt_", "")) if statement_id.startswith("stmt_") else int(statement_id)
            result = await session.execute(
                select(Statement).where(
                    Statement.id == stmt_id_int,
                    Statement.user_id == user["user_id"],
                )
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Not found")
            if rec.status != "draft":
                raise HTTPException(400, "Already saved")

            now = datetime.now(timezone.utc)
            txs_data = (rec.data or {}).get("transactions", [])
            docs = []
            for t in txs_data:
                tx = Transaction(
                    transaction_id=f"tx_{uuid.uuid4().hex[:12]}",
                    user_id=user["user_id"],
                    amount=float(t["amount"]),
                    currency=rec.currency,
                    description=t["description"],
                    merchant_name=t.get("merchant"),
                    category=t.get("category", "uncategorized"),
                    date=datetime.fromisoformat(t["date"]) if t.get("date") else now,
                    source="statement",
                )
                session.add(tx)
                docs.append({
                    "transaction_id": tx.transaction_id,
                    "user_id": user["user_id"],
                    "amount": float(t["amount"]),
                    "category": t.get("category", "uncategorized"),
                    "description": t["description"],
                    "is_income": float(t["amount"]) > 0,
                })
            rec.status = "final"
            await session.commit()
            accrued_count = 0
            for d in docs:
                a = await maaser_mod.maybe_accrue(session, user["user_id"], d)
                if a:
                    accrued_count += 1
            return {"ok": True, "saved_count": len(docs), "maaser_accrued_count": accrued_count}

    @router.delete("/{statement_id}")
    async def delete_statement(statement_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            stmt_id_int = int(statement_id.replace("stmt_", "")) if statement_id.startswith("stmt_") else int(statement_id)
            result = await session.execute(
                select(Statement).where(
                    Statement.id == stmt_id_int,
                    Statement.user_id == user["user_id"],
                )
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Not found")
            await session.delete(rec)
            await session.commit()
            return {"ok": True}

    return router
