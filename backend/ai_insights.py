"""Phase 5 — AI insights: dashboard, budget, forecast, report with real user data, cost tracking."""
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
from llm import call_llm, parse_json, estimate_cost

logger = logging.getLogger("ai_insights")

SYSTEM_PROMPT = (
    "You are FinanceAI's analytics engine. Generate clear, actionable, UK-focused "
    "personal-finance insights. Always respond ONLY with valid JSON matching the "
    "requested schema, no preamble or markdown fences. Be concise. Use British "
    "English. Currency is GBP. Never give regulated investment advice without a "
    "general-disclaimer caveat where appropriate."
)

FREE_TIER_DAILY_LIMIT = 5


async def _enforce_free_limit_if_needed(session, user: dict) -> None:
    if user.get("tier") == "premium" or user.get("role") == "admin":
        return
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    result = await session.execute(
        select(func.count()).select_from(AiUsage).where(
            AiUsage.user_id == user["user_id"], AiUsage.date >= start_of_day, AiUsage.endpoint == "insight",
        )
    )
    count = result.scalar() or 0
    if count >= FREE_TIER_DAILY_LIMIT:
        raise HTTPException(429, f"Free tier limit reached ({FREE_TIER_DAILY_LIMIT} AI insights / day). "
                                 "Upgrade to Premium for unlimited.")


async def _track_usage(session, user_id: str, provider: str, model: str,
                       prompt_tokens: int, completion_tokens: int, cost: float) -> None:
    try:
        usage = AiUsage(
            user_id=user_id, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
            cost=cost, provider=provider, endpoint="insight",
        )
        session.add(usage)
        await session.commit()
    except Exception as e:
        logger.warning(f"usage tracking failed: {e}")


async def _call_llm_insight(session, user: dict, system: str, user_prompt: str) -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    model = "openrouter/free"
    configs = user.get("preferences", {}).get("ai_provider_configs", [])
    active = next((p for p in configs if p.get("is_default") and p.get("api_key")), None)
    if active:
        key = active.get("api_key", key)
        model = active.get("model", model)
    if not key:
        raise HTTPException(503, "AI is not configured. Add your own API key in Settings.")
    await _enforce_free_limit_if_needed(session, user)
    try:
        text, provider, used_model, pt, ct, cost = await call_llm(system, user_prompt, model=model, api_key=key, temperature=0.1, max_tokens=4096)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LLM call failed (model={model}): {e}")
        raise HTTPException(502, f"AI provider error: {str(e)[:200]}")
    if not text:
        raise HTTPException(502, "AI returned an empty response")
    await _track_usage(session, user["user_id"], provider, used_model, pt, ct, cost)
    return text


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
            now = datetime.now(timezone.utc)
            since_60 = now - timedelta(days=60)
            since_30 = now - timedelta(days=30)
            result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"], Transaction.date >= since_60,
                ).order_by(Transaction.date.desc()).limit(500)
            )
            txs = result.scalars().all()
            if not txs:
                return {"insights": [], "note": "Not enough transactions yet — add some to unlock insights."}

            income_60 = sum(t.amount for t in txs if t.amount > 0)
            spend_60 = sum(-t.amount for t in txs if t.amount < 0)
            by_cat_60 = {}
            for t in txs:
                if t.amount < 0:
                    c = (t.category or "uncategorized").lower()
                    by_cat_60[c] = by_cat_60.get(c, 0) + (-t.amount)
            by_cat_30 = {}
            for t in txs:
                if t.amount < 0 and t.date >= since_30:
                    c = (t.category or "uncategorized").lower()
                    by_cat_30[c] = by_cat_30.get(c, 0) + (-t.amount)
            top_cats_60 = sorted(by_cat_60.items(), key=lambda kv: -kv[1])[:6]
            top_cats_30 = sorted(by_cat_30.items(), key=lambda kv: -kv[1])[:6]
            savings_rate = round((income_60 - spend_60) / income_60 * 100, 1) if income_60 > 0 else 0

            # Pre-compute category trend: 30d vs previous 30d
            cat_trends = []
            for cat, v60 in by_cat_60.items():
                v30 = by_cat_30.get(cat, 0)
                prev_30 = v60 - v30
                if prev_30 > 0:
                    change_pct = round((v30 - prev_30) / prev_30 * 100, 1)
                    cat_trends.append({"category": cat, "last_30": round(v30, 2), "prev_30": round(prev_30, 2), "change_pct": change_pct})
            cat_trends.sort(key=lambda x: abs(x["change_pct"]), reverse=True)

            # Detect recurring subscriptions
            merchant_totals = {}
            for t in txs:
                if t.amount < 0 and (t.merchant_name or t.description):
                    key = (t.merchant_name or t.description[:30]).strip()
                    merchant_totals[key] = merchant_totals.get(key, 0) + 1
            recurring = [m for m, c in merchant_totals.items() if c >= 2][:10]

            budget_result = await session.execute(
                select(Budget).where(Budget.user_id == user["user_id"])
            )
            budgets = budget_result.scalars().all()
            budget_status = []
            for b in budgets:
                spent = by_cat_30.get(b.category, 0) * 2  # 30d extrapolated to 60d
                limit_60d = (b.amount or 0) * 2
                pct = round(spent / limit_60d * 100, 1) if limit_60d > 0 else 0
                budget_status.append({"category": b.category, "monthly_limit": b.amount, "pct_used_60d": pct})

            prompt = f"""Analyse this UK user's last 60 days of personal finance and return 3-5 specific, actionable insights.

=== INCOME & SPEND (60d) ===
Income: £{income_60:.2f}
Spending: £{spend_60:.2f}
Net: £{income_60 - spend_60:.2f}
Savings rate: {savings_rate}%

=== TOP SPENDING (60d) ===
{", ".join(f"{c}: £{v:.0f}" for c, v in top_cats_60)}

=== TOP SPENDING (30d, last 30 days only) ===
{", ".join(f"{c}: £{v:.0f}" for c, v in top_cats_30)}

=== CATEGORY TRENDS (30d vs prior 30d) ===
{json.dumps(cat_trends[:8], indent=2)}

=== RECURRING MERCHANTS (2+ occurrences, possible subscriptions) ===
{", ".join(recurring) if recurring else "none detected"}

=== BUDGET STATUS ===
{json.dumps(budget_status, indent=2) if budget_status else "No budgets set"}

User tier: {user.get('tier', 'free')}
Number of transactions: {len(txs)}

Return JSON in this EXACT shape (no markdown):
{{
  "headline": "One-sentence summary of their financial health (max 14 words).",
  "insights": [
    {{"title": "Short title (3-5 words)", "body": "1-2 sentence explanation with concrete numbers and category names from the data above.", "severity": "good|neutral|warning|critical", "action": "Optional one-line suggested action or null"}}
  ],
  "next_step": "The single most impactful next step they should take this week."
}}

Make insights specific (cite actual £amounts and category names). Mix positive observations with improvements. Use British English (e.g. '£', 'colour', 'organise')."""
            text = await _call_llm_insight(session, user, SYSTEM_PROMPT, prompt)
            return parse_json(text)

    @router.post("/budget")
    async def budget_insights(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            now = datetime.now(timezone.utc)
            since_90 = now - timedelta(days=90)
            since_30 = now - timedelta(days=30)
            result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"], Transaction.date >= since_90, Transaction.amount < 0,
                )
            )
            txs = result.scalars().all()
            cat_amounts = {}
            cat_amounts_30d = {}
            for t in txs:
                c = (t.category or "uncategorized").lower()
                cat_amounts.setdefault(c, []).append(-t.amount)
                if t.date >= since_30:
                    cat_amounts_30d.setdefault(c, []).append(-t.amount)
            cat_summary = {}
            for c, v in cat_amounts.items():
                total_90 = sum(v)
                monthly_avg = total_90 / 3
                last_30_total = sum(cat_amounts_30d.get(c, []))
                cat_summary[c] = {
                    "total_90d": round(total_90, 2),
                    "monthly_avg": round(monthly_avg, 2),
                    "last_30d": round(last_30_total, 2),
                    "count": len(v),
                    "avg_per_txn": round(sum(v) / len(v), 2) if v else 0,
                }
            budget_result = await session.execute(
                select(Budget).where(Budget.user_id == user["user_id"])
            )
            budgets = budget_result.scalars().all()
            income_result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"], Transaction.date >= since_30, Transaction.amount > 0,
                )
            )
            income_30d = sum(t.amount for t in income_result.scalars().all())

            prompt = f"""Suggest budget improvements for this UK user.

=== INCOME (30d) ===
£{income_30d:.2f}

=== SPENDING BY CATEGORY (90d) ===
{json.dumps(cat_summary, indent=2)}

Categories excluded: tzedakah, transfer, fees, tax (typically not budgetable)

=== EXISTING BUDGETS ===
{json.dumps([{"category": b.category, "monthly_limit": b.amount} for b in budgets], indent=2)}

=== EXAMPLES OF GOOD RECOMMENDATIONS ===
- groceries monthly_avg £380 → suggest £400 with rationale "You averaged £380/month, suggest £400 for a 5% buffer"
- dining monthly_avg £250 → suggest reducing to £200 with specific tip

Return JSON (no markdown):
{{
  "recommendations": [
    {{"category": "groceries", "suggested_monthly_limit": 400, "rationale": "Why this number (1-2 sentences citing the 90d data and any variance)."}}
  ],
  "categories_to_add_budget_for": ["category1", "category2"],
  "categories_to_reduce": [{{"category": "dining", "potential_monthly_saving": 50, "tip": "Specific actionable UK-relevant tip (e.g. meal prep, lunch club)."}}],
  "summary": "One-sentence overall recommendation."
}}

Suggest realistic limits (not too aggressive). Aim for total monthly spending ≤ 80% of income (£{income_30d:.0f}). Use British English."""
            text = await _call_llm_insight(session, user, SYSTEM_PROMPT, prompt)
            return parse_json(text)

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
            text = await _call_llm_insight(session, user, SYSTEM_PROMPT, prompt)
            return parse_json(text)

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
                    Transaction.user_id == user["user_id"], Transaction.date >= start, Transaction.date < end,
                )
            )
            txs = result.scalars().all()
            if not txs:
                return {"narrative": f"No transactions found for {start.strftime('%B %Y')}. Add some to generate a report.",
                        "highlights": [], "metrics": {}}

            income = sum(t.amount for t in txs if t.amount > 0)
            spend = sum(-t.amount for t in txs if t.amount < 0)
            by_cat = {}
            for t in txs:
                if t.amount < 0:
                    c = (t.category or "uncategorized").lower()
                    by_cat[c] = by_cat.get(c, 0) + (-t.amount)
            top_merchants = {}
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
            text = await _call_llm_insight(session, user, SYSTEM_PROMPT, prompt)
            return parse_json(text)

    @router.post("/unusual-spending")
    async def unusual_spending(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            since = datetime.now(timezone.utc) - timedelta(days=60)
            result = await session.execute(
                select(Transaction).where(
                    Transaction.user_id == user["user_id"], Transaction.date >= since, Transaction.amount < 0,
                )
            )
            txs = result.scalars().all()
            if not txs:
                return {"unusual": [], "note": "Not enough data to detect unusual spending."}

            by_cat = {}
            for t in txs:
                c = (t.category or "uncategorized").lower()
                by_cat.setdefault(c, []).append(-t.amount)

            cat_stats = {}
            for cat, amounts in by_cat.items():
                avg = sum(amounts) / len(amounts)
                cat_stats[cat] = {"total": round(sum(amounts), 2), "count": len(amounts), "average": round(avg, 2)}

            mid = since + timedelta(days=30)
            recent_by_cat = {}
            older_by_cat = {}
            for t in txs:
                c = (t.category or "uncategorized").lower()
                if t.date >= mid:
                    recent_by_cat[c] = recent_by_cat.get(c, 0) + (-t.amount)
                else:
                    older_by_cat[c] = older_by_cat.get(c, 0) + (-t.amount)

            prompt = f"""Analyse this UK user's 60-day spending data and identify unusual patterns.

Category stats (all 60 days):
{json.dumps(cat_stats, indent=2)}

Last 30 days spending by category:
{json.dumps(recent_by_cat, indent=2)}

Previous 30 days spending by category:
{json.dumps(older_by_cat, indent=2)}

Return JSON:
{{
  "unusual": [
    {{
      "category": "category_name",
      "current_spend": 123.45,
      "previous_spend": 67.89,
      "change_pct": 81.6,
      "severity": "low|medium|high",
      "insight": "One-sentence explanation of what's unusual.",
      "suggestion": "Actionable suggestion for the user."
    }}
  ],
  "summary": "One-line overall assessment."
}}

Focus on categories with significant changes (>20% increase) or unusually high spend. British English."""
            text = await _call_llm_insight(session, user, SYSTEM_PROMPT, prompt)
            return parse_json(text)

    return router
