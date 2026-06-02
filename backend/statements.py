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


CATEGORISE_KEYWORDS = {
    "groceries": ["tesco", "sainsbury", "asda", "waitrose", "lidl", "aldi", "morrisons", "co-op", "coop", "m&s", "marks and spencer", "iceland", "farmfoods", "budgens", "spar", "nisa", "londis", "supermarket"],
    "dining": ["mcdonald", "nando", "kfc", "subway", "pret", "starbucks", "costa", "cafe nero", "wagamama", "pizza hut", "dominos", "deliveroo", "uber eats", "just eat", "restaurant", "cafe", "bistro", "pub", "bar ", "grill", "kitchen", "diner", "brasserie", "eatery", "bagel", "sushi", "noodle", "thai", "indian", "chinese", "chippy"],
    "transport": ["uber", "bolt", "lyft", "free now", "viavan", "addison lee", "tfl", "oyster", "tube", "rail", "trainline", "national rail", "stagecoach", "arriva", "first bus", "shell", "bp ", "esso", "texaco", "fuel", "petrol", "parking", "ncp", "apcoa", "zipcar", "enterprise car", "hertz", "avis", "budget rent", "mot", "autoglass", "kwik fit", "halfords"],
    "utilities": ["british gas", "edf", "eon", "octopus", "scottish power", "npower", "bulb", "ovo", "thames water", "anglian water", "welsh water", "bt ", "sky", "virgin media", "vodafone", "ee", "three", "o2", "talk talk", "plusnet", "now tv", "amazon prime", "council tax", "gas", "electric", "broadband", "wifi", "phone bill"],
    "subscriptions": ["netflix", "spotify", "disney", "apple.com/bill", "apple.com", "icloud", "google one", "microsoft 365", "office 365", "dropbox", "adobe", "notion", "slack", "zoom", "github", "patreon", "onlyfans", "paramount", "now tv", "hbo", "apple tv", "youtube premium", "tidal", "deezer", "audible", "kindle unlimited", "gym", "puregym", "david lloyd", "nuffield", "anytime fitness"],
    "health": ["boots", "lloyds pharmacy", "superdrug", "pharmacy", "nhs", "bupa", "practitioner", "dental", "dentist", "optician", "specsavers", "vision express", "hospital", "clinic", "physio", "chiropractor", "counselling", "therapy", "prescription"],
    "entertainment": ["odeon", "vue ", "cineworld", "cinema", "theatre", "concert", "ticket", "stubhub", "viagogo", "steam", "playstation", "xbox", "nintendo", "epic games", "gog.com", "spotify family"],
    "shopping": ["amazon", "ebay", "argos", "john lewis", "next", "zara", "h&m", "primark", "tk maxx", "matalan", "asos", "boohoo", "river island", "new look", "debenhams", "selfridges", "harrods", "apple store", "currys", "pc world", "game ", "decathlon", "ikea", "dunelm", "wilko", "homebase", "b&q", "wickes", "screwfix", "toolstation"],
    "insurance": ["aviva", "direct line", "admiral", "lv=", "liverpool victoria", "churchill", "compare the market", "go compare", "money supermarket", "axa", "zurich", "legal & general", "scottish widows", "standard life", "hastings", "esure", "saga", "petplan", "animal friends"],
    "education": ["university", "ucas", "tuition", "udemy", "coursera", "linkedin learning", "skillshare", "masterclass", "futurelearn", "open university", "oxford", "cambridge", "imperial"],
    "transfer": ["faster payment", "bacs", "chaps", "standing order", "direct debit", "monzo to monzo", "revolut", "wise", "paypal", "venmo", "zelle"],
    "cash": ["atm", "cashpoint", "link ", "cash withdrawal", "cashback"],
    "tax": ["hmrc", "self assessment", "vat payment"],
    "fees": ["overdraft", "bank fee", "monthly fee", "service charge", "interest charge"],
    "rent": ["rent", "landlord", "letting agent", "foxtons", "savills", "knight frank"],
    "mortgage": ["mortgage", "halifax", "natwest", "santander", "barclays", "lloyds", "hsbc", "first direct", "yorkshire bs", "skipton", "nationwide"],
    "tzedakah": ["tzedakah", "tzedaka", "jnf", "jewish national fund", "world jewish relief", "chabad", "jewish charity", "gift aid", "justgiving", "go fund me", "gofundme"],
    "income": ["salary", "wages", "payroll", "pension", "interest", "dividend", "refund", "rebate", "tax credit", "child benefit", "universal credit"],
}


def _keyword_categorise(description: str, merchant: str | None, amount: float) -> str | None:
    """Fast keyword-based categorisation. Returns category if confident, else None."""
    text = f"{(description or '')} {(merchant or '')}".lower()
    if not text.strip():
        return None
    for category, keywords in CATEGORISE_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                if category in ("income", "salary") and amount <= 0:
                    continue
                return category
    return None


CATEGORISE_PROMPT = """You are a UK bank transaction categoriser. Given the description, merchant, and amount of a transaction, choose the best single category.

SIGN: amount > 0 means money coming IN (income), amount < 0 means money going OUT (expense).

CATEGORIES:
- income: salary, wages, pension, refunds, interest, dividends (amount > 0)
- groceries: supermarkets, food shops (Tesco, Sainsbury's, Asda, Waitrose, Lidl, Aldi, M&S, Co-op, Morrisons)
- dining: restaurants, cafes, takeaways, pubs, bars, fast food (McDonald's, Nando's, Pret, Starbucks, Deliveroo, Uber Eats, Just Eat)
- transport: fuel, parking, tube, train, bus, taxi, Uber, Bolt, TfL, Oyster, rail tickets, car maintenance
- utilities: gas, electric, water, broadband, phone, council tax (British Gas, EDF, Eon, Octopus, BT, Sky, Virgin, Vodafone, EE, Three, O2)
- subscriptions: streaming, software, memberships (Netflix, Spotify, Disney+, Amazon Prime, Apple, iCloud, gym)
- tzedakah: charitable donations, Jewish charitable giving (Jewish charities, tzedakah, Gift Aid to charity)
- rent: monthly rent payments to landlord or letting agent
- shopping: general retail, online shopping, clothes, electronics (Amazon non-Prime, eBay, Argos, John Lewis, Next, H&M, Zara, Primark)
- health: pharmacies, GP, dentist, opticians, hospital (Boots, Lloyds Pharmacy, NHS, Bupa)
- entertainment: cinema, theatre, concerts, books, games (Odeon, Vue, Cineworld, Steam, PlayStation, Xbox)
- insurance: home, car, life, pet, travel insurance (Aviva, Direct Line, Admiral, LV=, Churchill)
- education: tuition, books, courses, training (UCAS, university, Udemy, Coursera)
- transfer: bank transfers between own accounts, peer-to-peer (Faster Payment, BACS, standing order to own account, Monzo to Monzo, Revolut)
- cash: ATM withdrawals, cashback
- tax: HMRC, VAT, self-assessment, council tax
- fees: bank fees, overdraft, FX, interest charges
- mortgage: monthly mortgage payments
- uncategorized: only if nothing above fits

Output STRICT JSON only: {{"category": "<one of the above>"}}

Examples:
- "TESCO STORE 1234" | merchant: tesco | amount: -45.99 -> "groceries"
- "MCDONALD'S" | merchant: mcdonald | amount: -12.50 -> "dining"
- "BACS SALARY ACME LTD" | merchant: acme | amount: 2500.00 -> "salary"
- "INTEREST" | merchant: bank | amount: 12.34 -> "income"
- "AMAZON PRIME" | merchant: amazon | amount: -7.99 -> "subscriptions"
- "AMAZON.CO.UK*XYZ" | merchant: amazon | amount: -34.99 -> "shopping"
- "NATIONAL GRID" | merchant: national grid | amount: -85.00 -> "utilities"
- "SHELL FORECOURT" | merchant: shell | amount: -52.30 -> "transport"
- "UBER TRIP" | merchant: uber | amount: -15.40 -> "transport"
- "NETFLIX.COM" | merchant: netflix | amount: -15.99 -> "subscriptions"
- "BOOTS PHARMACY" | merchant: boots | amount: -8.75 -> "health"
- "GIFT AID DONATION" | merchant: charity | amount: -50.00 -> "tzedakah"
- "HMRC TAX" | merchant: hmrc | amount: -1200.00 -> "tax"
- "ATM CASH" | merchant: link | amount: -100.00 -> "cash"
- "MONZO TO MONZO" | merchant: monzo | amount: -25.00 -> "transfer"

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
    from db import CategoryRule
    # Fast path: keyword matching for obvious cases
    fast = _keyword_categorise(description, merchant, amount)
    if fast:
        return fast
    if session and user_id and merchant:
        try:
            key = (merchant or "").strip().upper()
            if key:
                r = await session.execute(
                    select(CategoryRule).where(
                        CategoryRule.user_id == user_id,
                        CategoryRule.merchant == key,
                    )
                )
                rule = r.scalar_one_or_none()
                if rule:
                    rule.match_count = (rule.match_count or 0) + 1
                    from datetime import datetime, timezone as _tz
                    rule.last_used_at = datetime.now(_tz.utc)
                    return rule.category
        except Exception:
            pass
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
