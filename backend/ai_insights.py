"""AI-generated insights: dashboard, budget, forecast, report.

One-shot prompts (no chat history) — fetches relevant user data, asks the
user's chosen LLM provider for insights, returns structured JSON.
"""
import os
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy import select, func

from db import Transaction, Budget, AiUsage
from auth import get_current_user

logger = logging.getLogger("ai_insights")

DEFAULT_PROVIDER = "openai"
DEFAULT_MODEL = "google/gemini-2.0-flash-lite-001"
FREE_TIER_DAILY_LIMIT = 5

SYSTEM_PROMPT = (
    "You are FinanceAI's analytics engine. Generate clear, actionable, UK-focused "
    "personal-finance insights. Always respond ONLY with valid JSON matching the "
    "requested schema, no preamble or markdown fences. Be concise. Use British "
    "English. Currency is GBP. Never give regulated investment advice without a "
    "general-disclaimer caveat where appropriate."
)


def _pick_provider(user: dict) -> tuple[str, str, str, bool]:
    active = next(
        (p for p in user.get("ai_provider_configs", []) if p.get("is_default") and p.get("api_key")),
        None,
    )
    if active:
        return active["provider"], active["model"], active["api_key"], True
    api_key = os.environ.get("OPENROUTER_API_KEY", os.environ.get("EMERGENT_LLM_KEY", ""))
    if not api_key:
        raise HTTPException(503, "AI is not configured. Add your own API key in Integrations.")
    return DEFAULT_PROVIDER, DEFAULT_MODEL, api_key, False


async def _enforce_free_limit_if_needed(session, user: dict, is_user_key: bool) -> None:
    if is_user_key:
        return
    if user.get("tier") == "premium" or user.get("role") == "admin":
        return
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    result = await session.execute(
        select(func.count()).select_from(AiUsage).where(
            AiUsage.user_id == user["user_id"],
            AiUsage.date >= start_of_day,
            AiUsage.endpoint == "insight",
        )
    )
    count = result.scalar() or 0
    if count >= FREE_TIER_DAILY_LIMIT:
        raise HTTPException(
            429,
            f"Free tier limit reached ({FREE_TIER_DAILY_LIMIT} AI insights / day). "
            "Add your own AI API key in Integrations for unlimited, or upgrade to Premium.",
        )


async def _track_usage(session, user_id: str, provider: str, model: str, prompt: str, response: str, is_user_key: bool) -> None:
    try:
        usage = AiUsage(
            user_id=user_id,
            prompt_tokens=len(prompt.split()),
            completion_tokens=len(response.split()),
            provider=provider,
            endpoint="insight",
        )
        session.add(usage)
        await session.commit()
    except Exception as e:
        logger.warning(f"usage tracking failed: {e}")


async def _call_llm(session, user: dict, system: str, user_prompt: str) -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    provider, model, api_key, is_user_key = _pick_provider(user)
    await _enforce_free_limit_if_needed(session, user, is_user_key)
    import uuid as _uuid
    sess_id = f"insight_{_uuid.uuid4().hex[:10]}"
    try:
        client = LlmChat(api_key=api_key, session_id=sess_id, system_message=system).with_model(provider, model)
        resp = await client.send_message(UserMessage(text=user_prompt))
        text = str(resp or "")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LLM call failed (provider={provider} model={model} user_key={is_user_key}): {e}")
        if is_user_key:
            raise HTTPException(502, f"Your provider returned an error: {str(e)[:200]}. Check the API key in Integrations.")
        raise HTTPException(502, f"AI provider error: {str(e)[:200]}")
    if not text:
        raise HTTPException(502, "AI returned an empty response")
    await _track_usage(session, user["user_id"], provider, model, user_prompt, text, is_user_key)
    return text


def _parse_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        start = t.find("{")
        end = t.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(t[start:end + 1])
            except json.JSONDecodeError:
                pass
        raise HTTPException(502, "AI returned unparseable JSON")


class ForecastInsightIn(BaseModel):
    symbol: str
    initial_value: float
    monthly_contribution: float
    years: int
    future_value: Optional[float] = None
    annual_return_pct: Optional[float] = None


class ReportInsightIn(BaseModel):
    year: int
    month: int


def build_router() -> APIRouter:
    router = APIRouter(prefix="/ai/insights", tags=["ai-insights"])

    @router.post("/dashboard")
    async def dashboard_insights(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            since = datetime.now(timezone.utc) - timedelta(days=60)
            result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= since,
                ).order_by(Transaction.date.desc()).limit(500)
            )
            txs = result.scalars().all()
            if not txs:
                return {"insights": [], "note": "Not enough transactions yet — add some to unlock insights."}

            income = sum(t.amount for t in txs if t.amount > 0)
            spend = sum(-t.amount for t in txs if t.amount < 0)
            by_cat: dict[str, float] = {}
            for t in txs:
                if t.amount < 0:
                    c = (t.category or "uncategorized").lower()
                    by_cat[c] = by_cat.get(c, 0) + (-t.amount)
            top_cats = sorted(by_cat.items(), key=lambda kv: -kv[1])[:6]
            savings_rate = round((income - spend) / income * 100, 1) if income > 0 else 0

            budget_result = await session.execute(
                select(Budget).where(Budget.user_id == user["user_id"])
            )
            budgets = budget_result.scalars().all()

            prompt = f"""Analyse this user's last 60 days of UK personal finance and return 3-5 specific, actionable insights.

Income: £{income:.2f}
Spending: £{spend:.2f}
Net: £{income - spend:.2f}
Savings rate: {savings_rate}%
Top spending categories: {", ".join(f"{c}: £{v:.0f}" for c, v in top_cats)}
Active budgets: {len(budgets)}
Tier: {user.get('tier', 'free')}

Return JSON in this exact shape:
{{
  "headline": "One-sentence summary of their financial health (max 14 words).",
  "insights": [
    {{"title": "Short title", "body": "1-2 sentence explanation with concrete numbers from the data.", "severity": "good|neutral|warning|critical", "action": "Optional one-line suggested action or null"}}
  ],
  "next_step": "The single most impactful next step they should take this week."
}}

Make insights specific (cite actual amounts/categories). Mix positive observations with improvements. Use British English."""
            text = await _call_llm(session, user, SYSTEM_PROMPT, prompt)
            return _parse_json(text)

    @router.post("/budget")
    async def budget_insights(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            since = datetime.now(timezone.utc) - timedelta(days=90)
            result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= since,
                    Transaction.amount < 0,
                )
            )
            txs = result.scalars().all()
            by_cat: dict[str, list[float]] = {}
            for t in txs:
                c = (t.category or "uncategorized").lower()
                by_cat.setdefault(c, []).append(-t.amount)
            cat_summary = {c: {"total": round(sum(v), 2), "count": len(v), "avg": round(sum(v) / len(v), 2)}
                           for c, v in by_cat.items()}
            budget_result = await session.execute(
                select(Budget).where(Budget.user_id == user["user_id"])
            )
            budgets = budget_result.scalars().all()

            prompt = f"""Suggest budget improvements for this UK user.

Last 90 days spending by category (monthly averages can be derived by dividing total by 3):
{json.dumps(cat_summary, indent=2)}

Existing budgets:
{json.dumps([{"category": b.category, "limit": b.amount} for b in budgets], indent=2)}

Return JSON:
{{
  "recommendations": [
    {{"category": "groceries", "suggested_monthly_limit": 350, "rationale": "Why this number (1-2 sentences with cited data)."}}
  ],
  "categories_to_add_budget_for": ["category1", "category2"],
  "categories_to_reduce": [{{"category": "dining", "potential_monthly_saving": 60, "tip": "Specific actionable tip."}}],
  "summary": "One-sentence overall recommendation."
}}

Suggest realistic limits (not too aggressive). Use British English."""
            text = await _call_llm(session, user, SYSTEM_PROMPT, prompt)
            return _parse_json(text)

    @router.post("/forecast")
    async def forecast_insights(payload: ForecastInsightIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            prompt = f"""A UK user is forecasting this investment:
- Symbol: {payload.symbol}
- Initial: £{payload.initial_value:.0f}
- Monthly contribution: £{payload.monthly_contribution:.0f}
- Years: {payload.years}
- Projected value: £{(payload.future_value or 0):.0f}
- Assumed annual return: {payload.annual_return_pct or 0}%

Return JSON:
{{
  "summary": "1-2 sentence verdict on this strategy.",
  "ideas": [
    {{"title": "Idea title", "body": "Concrete 1-2 sentence idea (e.g. tax-wrapper, alternative ETF, rebalancing)."}}
  ],
  "risks": ["Risk 1 (one phrase)", "Risk 2"],
  "uk_tax_tip": "One UK-specific tip (ISA, SIPP, capital gains allowance, dividend allowance) with a brief explanation.",
  "alternative_etfs": [
    {{"ticker": "VWRL", "name": "Vanguard FTSE All-World", "why": "One sentence why it might suit."}}
  ],
  "disclaimer": "Brief general disclaimer that this is not regulated investment advice."
}}

Provide 3-5 ideas, 3 risks, 3 alternative ETFs. British English."""
            text = await _call_llm(session, user, SYSTEM_PROMPT, prompt)
            return _parse_json(text)

    @router.post("/report")
    async def report_insights(payload: ReportInsightIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            start = datetime(payload.year, payload.month, 1, tzinfo=timezone.utc)
            end_month = payload.month + 1 if payload.month < 12 else 1
            end_year = payload.year if payload.month < 12 else payload.year + 1
            end = datetime(end_year, end_month, 1, tzinfo=timezone.utc)
            result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"],
                    Transaction.date >= start,
                    Transaction.date < end,
                )
            )
            txs = result.scalars().all()
            if not txs:
                return {"narrative": f"No transactions found for {start.strftime('%B %Y')}. Add some to generate a report.",
                        "highlights": [], "metrics": {}}

            income = sum(t.amount for t in txs if t.amount > 0)
            spend = sum(-t.amount for t in txs if t.amount < 0)
            by_cat: dict[str, float] = {}
            for t in txs:
                if t.amount < 0:
                    c = (t.category or "uncategorized").lower()
                    by_cat[c] = by_cat.get(c, 0) + (-t.amount)
            top_merchants: dict[str, float] = {}
            for t in txs:
                if t.amount < 0:
                    m = (t.description or "Unknown")[:40]
                    top_merchants[m] = top_merchants.get(m, 0) + (-t.amount)
            top5 = sorted(top_merchants.items(), key=lambda kv: -kv[1])[:5]

            prompt = f"""Write a friendly monthly finance narrative for {start.strftime('%B %Y')} for a UK user.

Income: £{income:.2f}
Spending: £{spend:.2f}
Net: £{income - spend:.2f}
Category breakdown: {json.dumps({k: round(v, 2) for k, v in by_cat.items()})}
Top merchants: {json.dumps([{"name": n, "amount": round(a, 2)} for n, a in top5])}
Number of transactions: {len(txs)}

Return JSON:
{{
  "narrative": "2-3 paragraph plain-English review of the month. Friendly tone. Cite specific numbers and merchants. British English. End with one forward-looking sentence.",
  "highlights": [
    {{"icon": "trending-up|trending-down|alert|sparkle|wallet", "text": "One-line highlight"}}
  ],
  "metrics": {{
    "income": {income:.2f},
    "spend": {spend:.2f},
    "net": {income - spend:.2f},
    "savings_rate_pct": {(round((income - spend) / income * 100, 1) if income > 0 else 0)}
  }},
  "month_grade": "A|B|C|D|F (single letter, based on savings rate and budget discipline)"
}}

5-7 highlights. British English."""
            text = await _call_llm(session, user, SYSTEM_PROMPT, prompt)
            return _parse_json(text)

    return router
