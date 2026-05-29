"""Phase 7 — Investments: holdings, portfolio, forecasting, market data."""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func

from db import InvestmentHolding, MarketData
from auth import get_current_user, require_admin

logger = logging.getLogger("investments")

MARKET_SEED = {
    "SPY": {"name": "S&P 500 ETF", "type": "etf", "price": 543.21, "high_52w": 580.00, "low_52w": 410.00, "currency": "USD"},
    "VOO": {"name": "Vanguard S&P 500", "type": "etf", "price": 502.87, "high_52w": 535.00, "low_52w": 385.00, "currency": "USD"},
    "ISF": {"name": "iShares FTSE 100", "type": "etf", "price": 798.50, "high_52w": 840.00, "low_52w": 720.00, "currency": "GBP"},
    "VUKE": {"name": "Vanguard FTSE 100", "type": "etf", "price": 3250.00, "high_52w": 3480.00, "low_52w": 2900.00, "currency": "GBP"},
    "BTC": {"name": "Bitcoin", "type": "crypto", "price": 67500.00, "high_52w": 73500.00, "low_52w": 38500.00, "currency": "USD"},
    "ETH": {"name": "Ethereum", "type": "crypto", "price": 3450.00, "high_52w": 4090.00, "low_52w": 2150.00, "currency": "USD"},
    "SOL": {"name": "Solana", "type": "crypto", "price": 145.00, "high_52w": 210.00, "low_52w": 80.00, "currency": "USD"},
    "XAU": {"name": "Gold (per oz)", "type": "gold", "price": 2350.00, "high_52w": 2450.00, "low_52w": 1980.00, "currency": "USD"},
    "XAG": {"name": "Silver (per oz)", "type": "gold", "price": 28.50, "high_52w": 32.00, "low_52w": 22.00, "currency": "USD"},
    "GBP": {"name": "GBP/USD", "type": "fx", "price": 1.27, "high_52w": 1.31, "low_52w": 1.24, "currency": "GBP"},
}

DEFAULT_GROWTH_RATES = {
    "stock": 0.08, "etf": 0.07, "crypto": 0.15, "gold": 0.05, "bond": 0.03, "property": 0.04,
}

RISK_VOLATILITY = {
    "stock": 0.15, "etf": 0.12, "crypto": 0.50, "gold": 0.15, "bond": 0.05, "property": 0.06,
}


class HoldingIn(BaseModel):
    ticker: str = Field(..., max_length=16)
    name: str = Field(..., max_length=255)
    type: str = Field(..., pattern=r"^(stock|etf|crypto|gold|bond|property)$")
    shares: float = 0
    cost_basis: float = 0
    current_price: Optional[float] = None
    currency: str = "GBP"
    account_name: str = "General"
    notes: Optional[str] = None
    target_allocation_pct: float = 0


class HoldingUpdateIn(BaseModel):
    shares: Optional[float] = None
    cost_basis: Optional[float] = None
    current_price: Optional[float] = None
    currency: Optional[str] = None
    account_name: Optional[str] = None
    notes: Optional[str] = None
    target_allocation_pct: Optional[float] = None


class ForecastIn(BaseModel):
    symbol: str = ""
    current_value: float = 0
    monthly_contribution: float = 0
    annual_return_pct: float = 7.0
    years: int = 10
    inflation_pct: float = 2.5


class MarketDataIn(BaseModel):
    ticker: str = Field(..., max_length=16)
    name: str = Field(..., max_length=255)
    type: str = Field(..., pattern=r"^(stock|etf|crypto|gold|bond|fx)$")
    price: float
    previous_close: Optional[float] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    currency: str = "GBP"


def _h_to_dict(h: InvestmentHolding) -> dict:
    market_value = h.shares * h.current_price
    gain = market_value - (h.shares * h.cost_basis) if h.cost_basis else 0
    gain_pct = (gain / (h.shares * h.cost_basis)) * 100 if h.shares * h.cost_basis else 0
    return {
        "id": h.id, "user_id": h.user_id, "ticker": h.ticker, "name": h.name,
        "type": h.type, "shares": h.shares, "cost_basis": h.cost_basis,
        "current_price": h.current_price, "market_value": round(market_value, 2),
        "gain": round(gain, 2), "gain_pct": round(gain_pct, 2),
        "currency": h.currency, "account_name": h.account_name, "notes": h.notes,
        "target_allocation_pct": h.target_allocation_pct,
        "price_updated": h.price_updated.isoformat() if h.price_updated else None,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    }


def _m_to_dict(m: MarketData) -> dict:
    return {
        "id": m.id, "ticker": m.ticker, "name": m.name, "type": m.type,
        "price": m.price, "previous_close": m.previous_close,
        "change_pct": m.change_pct, "high_52w": m.high_52w, "low_52w": m.low_52w,
        "currency": m.currency,
        "last_updated": m.last_updated.isoformat() if m.last_updated else None,
        "source": m.source,
    }


async def _seed_market_data(session):
    for ticker, info in MARKET_SEED.items():
        existing = await session.execute(select(MarketData).where(MarketData.ticker == ticker))
        if not existing.scalar_one_or_none():
            md = MarketData(
                ticker=ticker, name=info["name"], type=info["type"],
                price=info["price"], high_52w=info.get("high_52w"),
                low_52w=info.get("low_52w"), currency=info.get("currency", "GBP"),
                last_updated=datetime.now(timezone.utc), source="seed",
            )
            session.add(md)


def build_router() -> APIRouter:
    router = APIRouter(prefix="/investments", tags=["investments"])

    # ── Health ───────────────────────────────────────────────────────

    @router.get("/health")
    async def investments_health(request: Request, user: dict = Depends(get_current_user)):
        try:
            sm = request.app.state.db
            async with sm() as session:
                hc = await session.execute(
                    select(func.count()).select_from(InvestmentHolding).where(InvestmentHolding.user_id == user["user_id"])
                )
                mc = await session.execute(select(func.count()).select_from(MarketData))
                return {
                    "status": "ok",
                    "holdings_count": hc.scalar() or 0,
                    "market_tickers": mc.scalar() or 0,
                }
        except Exception as e:
            return {"status": "error", "detail": str(e)[:200]}

    # ── Holdings CRUD ────────────────────────────────────────────────

    @router.get("/holdings")
    async def list_holdings(request: Request, user: dict = Depends(get_current_user),
                            type: str = Query(None), account: str = Query(None)):
        sm = request.app.state.db
        async with sm() as session:
            q = select(InvestmentHolding).where(InvestmentHolding.user_id == user["user_id"])
            if type:
                q = q.where(InvestmentHolding.type == type)
            if account:
                q = q.where(InvestmentHolding.account_name.ilike(account))
            result = await session.execute(q.order_by(InvestmentHolding.type, InvestmentHolding.ticker))
            rows = result.scalars().all()
            total_value = sum(h.shares * h.current_price for h in rows)
            total_cost = sum(h.shares * h.cost_basis for h in rows)
            return {
                "holdings": [_h_to_dict(r) for r in rows],
                "total_market_value": round(total_value, 2),
                "total_cost_basis": round(total_cost, 2),
                "total_gain": round(total_value - total_cost, 2),
                "count": len(rows),
            }

    @router.post("/holdings")
    async def add_holding(payload: HoldingIn, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            if payload.current_price is None:
                md = await session.execute(select(MarketData).where(MarketData.ticker == payload.ticker.upper()))
                m = md.scalar_one_or_none()
                payload.current_price = m.price if m else 0
            h = InvestmentHolding(
                user_id=user["user_id"], ticker=payload.ticker.upper(), name=payload.name,
                type=payload.type, shares=payload.shares, cost_basis=payload.cost_basis,
                current_price=payload.current_price or 0, currency=payload.currency,
                account_name=payload.account_name, notes=payload.notes,
                target_allocation_pct=payload.target_allocation_pct,
                price_updated=datetime.now(timezone.utc),
            )
            session.add(h)
            await session.commit()
            await session.refresh(h)
            return _h_to_dict(h)

    @router.put("/holdings/{holding_id}")
    async def update_holding(holding_id: int, payload: HoldingUpdateIn,
                              request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(InvestmentHolding).where(
                    InvestmentHolding.id == holding_id, InvestmentHolding.user_id == user["user_id"]
                )
            )
            h = result.scalar_one_or_none()
            if not h:
                raise HTTPException(404, "Holding not found")
            if payload.shares is not None: h.shares = payload.shares
            if payload.cost_basis is not None: h.cost_basis = payload.cost_basis
            if payload.current_price is not None:
                h.current_price = payload.current_price
                h.price_updated = datetime.now(timezone.utc)
            if payload.currency is not None: h.currency = payload.currency
            if payload.account_name is not None: h.account_name = payload.account_name
            if payload.notes is not None: h.notes = payload.notes
            if payload.target_allocation_pct is not None: h.target_allocation_pct = payload.target_allocation_pct
            await session.commit()
            await session.refresh(h)
            return _h_to_dict(h)

    @router.delete("/holdings/{holding_id}")
    async def delete_holding(holding_id: int, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(InvestmentHolding).where(
                    InvestmentHolding.id == holding_id, InvestmentHolding.user_id == user["user_id"]
                )
            )
            h = result.scalar_one_or_none()
            if not h:
                raise HTTPException(404, "Holding not found")
            await session.delete(h)
            await session.commit()
            return {"ok": True}

    # ── Portfolio ────────────────────────────────────────────────────

    @router.get("/portfolio")
    async def portfolio_summary(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(InvestmentHolding).where(InvestmentHolding.user_id == user["user_id"])
            )
            rows = result.scalars().all()
            if not rows:
                return {
                    "total_value": 0, "total_cost": 0, "total_gain": 0, "total_gain_pct": 0,
                    "by_type": {}, "by_account": {}, "top_holdings": [], "diversification_score": 0,
                }
            total_value = sum(h.shares * h.current_price for h in rows)
            total_cost = sum(h.shares * h.cost_basis for h in rows)
            total_gain = total_value - total_cost
            total_gain_pct = (total_gain / total_cost * 100) if total_cost else 0
            by_type = {}
            by_account = {}
            for h in rows:
                mv = h.shares * h.current_price
                by_type.setdefault(h.type, {"value": 0, "cost": 0, "pct": 0})
                by_type[h.type]["value"] += mv
                by_type[h.type]["cost"] += h.shares * h.cost_basis
                acct = h.account_name or "General"
                by_account.setdefault(acct, {"value": 0, "cost": 0})
                by_account[acct]["value"] += mv
                by_account[acct]["cost"] += h.shares * h.cost_basis
            for t in by_type.values():
                t["pct"] = round((t["value"] / total_value * 100), 1) if total_value else 0
                t["gain"] = round(t["value"] - t["cost"], 2)
            sorted_holdings = sorted(rows, key=lambda h: h.shares * h.current_price, reverse=True)
            n_types = len(by_type)
            top_pct = sum(h.shares * h.current_price for h in sorted_holdings[:3]) / total_value * 100 if total_value and sorted_holdings else 0
            div_score = min(100, n_types * 15 + max(0, 100 - top_pct) * 0.3)
            return {
                "total_value": round(total_value, 2),
                "total_cost": round(total_cost, 2),
                "total_gain": round(total_gain, 2),
                "total_gain_pct": round(total_gain_pct, 1),
                "by_type": {k: {sk: round(sv, 2) if isinstance(sv, float) else sv for sk, sv in v.items()} for k, v in by_type.items()},
                "by_account": {k: {sk: round(sv, 2) for sk, sv in v.items()} for k, v in by_account.items()},
                "top_holdings": [_h_to_dict(h) for h in sorted_holdings[:5]],
                "diversification_score": round(div_score, 1),
                "holding_count": len(rows),
            }

    # ── Forecasting ──────────────────────────────────────────────────

    @router.post("/forecast")
    async def investment_forecast(payload: ForecastIn, user: dict = Depends(get_current_user)):
        if payload.years < 1 or payload.years > 50:
            raise HTTPException(400, "Years must be between 1 and 50")
        r = payload.annual_return_pct / 100
        i = payload.inflation_pct / 100
        monthly = payload.monthly_contribution
        principal = payload.current_value
        years = payload.years
        nominal_proj = []
        real_proj = []
        for y in range(years + 1):
            n = y * 12
            fv_nominal = principal * (1 + r) ** y + monthly * (((1 + r) ** y - 1) / r) if r > 0 else principal + monthly * n
            fv_real = fv_nominal / ((1 + i) ** y)
            contributed_so_far = principal + monthly * n
            nominal_proj.append({"year": y, "value": round(fv_nominal, 2), "contributed": round(contributed_so_far, 2)})
            real_proj.append({"year": y, "value": round(fv_real, 2)})
        final_nominal = nominal_proj[-1]["value"]
        final_real = real_proj[-1]["value"]
        total_contributions = principal + monthly * 12 * years
        gain_nominal = final_nominal - total_contributions
        optimistic = final_nominal * 1.3
        pessimistic = min(final_nominal * 0.6, total_contributions * 0.9)
        return {
            "symbol": payload.symbol,
            "current_value": principal,
            "monthly_contribution": monthly,
            "annual_return_pct": payload.annual_return_pct,
            "inflation_pct": payload.inflation_pct,
            "years": years,
            "total_contributions": round(total_contributions, 2),
            "final_value_nominal": final_nominal,
            "final_value_real": final_real,
            "gain_nominal": round(gain_nominal, 2),
            "optimistic_scenario": round(optimistic, 2),
            "pessimistic_scenario": round(pessimistic, 2),
            "projection_nominal": nominal_proj,
            "projection_real": real_proj,
            "points": nominal_proj,
            "future_value": final_nominal,
            "total_contributed": round(total_contributions, 2),
            "gain": round(gain_nominal, 2),
        }

    # ── User portfolio forecast ──────────────────────────────────────

    @router.post("/forecast/portfolio")
    async def portfolio_forecast(request: Request, user: dict = Depends(get_current_user),
                                  monthly_contribution: float = Query(0),
                                  years: int = Query(10)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(InvestmentHolding).where(InvestmentHolding.user_id == user["user_id"])
            )
            rows = result.scalars().all()
            if not rows:
                raise HTTPException(400, "No holdings found. Add holdings first.")
            current_value = sum(h.shares * h.current_price for h in rows)
            weighted_return = 0
            for h in rows:
                mv = h.shares * h.current_price
                gr = DEFAULT_GROWTH_RATES.get(h.type, 0.07)
                weighted_return += (mv / current_value) * gr if current_value else 0
            annual_return_pct = round(weighted_return * 100, 2)
            r = weighted_return
            i = 0.025
            monthly = monthly_contribution
            principal = current_value
            nominal_proj = []
            for y in range(years + 1):
                n = y * 12
                fv = principal * (1 + r) ** y + monthly * (((1 + r) ** y - 1) / r) if r > 0 else principal + monthly * n
                nominal_proj.append({"year": y, "value": round(fv, 2)})
            return {
                "current_value": round(principal, 2),
                "weighted_return_pct": annual_return_pct,
                "years": years,
                "monthly_contribution": monthly,
                "final_value": nominal_proj[-1]["value"],
                "projection": nominal_proj,
                "holdings_used": len(rows),
            }

    # ── Market Data ──────────────────────────────────────────────────

    @router.get("/market")
    async def list_market_data(request: Request):
        sm = request.app.state.db
        async with sm() as session:
            await _seed_market_data(session)
            await session.commit()
            result = await session.execute(
                select(MarketData).order_by(MarketData.type, MarketData.ticker)
            )
            rows = result.scalars().all()
            by_type = {}
            for m in rows:
                by_type.setdefault(m.type, [])
                by_type[m.type].append(_m_to_dict(m))
            return {
                "tickers": [_m_to_dict(r) for r in rows],
                "by_type": by_type,
                "count": len(rows),
            }

    @router.get("/market/{ticker}")
    async def get_market_ticker(ticker: str, request: Request):
        sm = request.app.state.db
        async with sm() as session:
            await _seed_market_data(session)
            await session.commit()
            result = await session.execute(
                select(MarketData).where(MarketData.ticker == ticker.upper())
            )
            m = result.scalar_one_or_none()
            if not m:
                raise HTTPException(404, f"Ticker '{ticker}' not found")
            return _m_to_dict(m)

    @router.post("/market")
    async def upsert_market_data(payload: MarketDataIn, request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(MarketData).where(MarketData.ticker == payload.ticker.upper()))
            existing = result.scalar_one_or_none()
            if existing:
                existing.price = payload.price
                existing.previous_close = payload.previous_close or existing.previous_close
                prev = payload.previous_close or existing.price
                existing.change_pct = ((payload.price - prev) / prev * 100) if prev else 0
                if payload.high_52w: existing.high_52w = payload.high_52w
                if payload.low_52w: existing.low_52w = payload.low_52w
                existing.currency = payload.currency
                existing.last_updated = datetime.now(timezone.utc)
                existing.source = "manual"
            else:
                md = MarketData(
                    ticker=payload.ticker.upper(), name=payload.name, type=payload.type,
                    price=payload.price, previous_close=payload.previous_close or payload.price,
                    high_52w=payload.high_52w, low_52w=payload.low_52w,
                    currency=payload.currency, last_updated=datetime.now(timezone.utc), source="manual",
                )
                session.add(md)
            await session.commit()
            return {"ok": True}

    @router.post("/market/refresh")
    async def refresh_market_data(request: Request, user: dict = Depends(require_admin)):
        sm = request.app.state.db
        async with sm() as session:
            await _seed_market_data(session)
            rows = (await session.execute(select(MarketData))).scalars().all()
            updated = 0
            for m in rows:
                old_price = m.price
                jitter = 1 + (0.01 * (datetime.now(timezone.utc).timestamp() % 1 - 0.5))
                m.price = round(m.price * jitter, 2)
                m.previous_close = old_price
                m.change_pct = round((m.price - old_price) / old_price * 100, 2)
                m.last_updated = datetime.now(timezone.utc)
                updated += 1
            await session.commit()
            return {"ok": True, "tickers_updated": updated}

    return router
