"""Phase 6 — Live market prices via CoinGecko (free, keyless)."""
import time
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger("prices")

# Map common tickers/aliases → CoinGecko ids
COIN_MAP = {
    "BTC": "bitcoin", "BITCOIN": "bitcoin",
    "ETH": "ethereum", "ETHEREUM": "ethereum",
    "SOL": "solana", "SOLANA": "solana",
    "ADA": "cardano", "DOT": "polkadot",
    "XRP": "ripple", "DOGE": "dogecoin",
    "MATIC": "polygon-pos", "LINK": "chainlink",
    "USDT": "tether", "USDC": "usd-coin",
    "GOLD": "pax-gold",  # tokenised gold approximation
}

# In-memory cache (60s TTL) — keeps us under CoinGecko rate limits
_cache = {"data": None, "ts": 0, "symbols": ""}
_CACHE_TTL = 60


async def _fetch_simple_price(ids: list[str], vs: str = "gbp") -> dict:
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ",".join(ids),
        "vs_currencies": vs,
        "include_24hr_change": "true",
        "include_market_cap": "true",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url, params=params)
    if r.status_code != 200:
        raise HTTPException(502, f"CoinGecko error {r.status_code}")
    return r.json()


def build_router() -> APIRouter:
    router = APIRouter(prefix="/prices", tags=["prices"])

    @router.get("/crypto")
    async def crypto(symbols: str = Query("BTC,ETH,SOL,ADA,XRP,DOGE"),
                      vs: str = Query("gbp")):
        """Live crypto prices for the given comma-separated tickers (or CoinGecko ids)."""
        global _cache
        key = f"{symbols}|{vs}"
        if _cache["symbols"] == key and time.time() - _cache["ts"] < _CACHE_TTL:
            return _cache["data"]

        tickers = [s.strip().upper() for s in symbols.split(",") if s.strip()]
        ids = []
        ticker_to_id = {}
        for t in tickers:
            cid = COIN_MAP.get(t, t.lower())
            ids.append(cid)
            ticker_to_id[t] = cid

        raw = await _fetch_simple_price(ids, vs)
        rows = []
        for ticker, cid in ticker_to_id.items():
            d = raw.get(cid)
            if not d:
                continue
            rows.append({
                "symbol": ticker,
                "coingecko_id": cid,
                "price": d.get(vs),
                "change_24h_pct": d.get(f"{vs}_24h_change"),
                "market_cap": d.get(f"{vs}_market_cap"),
                "currency": vs.upper(),
            })

        result = {"prices": rows, "vs": vs.upper(), "as_of": int(time.time())}
        _cache = {"data": result, "ts": time.time(), "symbols": key}
        return result

    @router.get("/top")
    async def top_coins(vs: str = Query("gbp"), n: int = Query(10, le=50)):
        """Top N coins by market cap."""
        url = "https://api.coingecko.com/api/v3/coins/markets"
        params = {"vs_currency": vs, "order": "market_cap_desc", "per_page": n, "page": 1,
                  "price_change_percentage": "24h,7d"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, params=params)
        if r.status_code != 200:
            raise HTTPException(502, f"CoinGecko error {r.status_code}")
        rows = [{
            "symbol": c["symbol"].upper(),
            "name": c["name"],
            "image": c.get("image"),
            "price": c["current_price"],
            "change_24h_pct": c.get("price_change_percentage_24h_in_currency"),
            "change_7d_pct": c.get("price_change_percentage_7d_in_currency"),
            "market_cap": c.get("market_cap"),
        } for c in r.json()]
        return {"coins": rows, "vs": vs.upper(), "as_of": int(time.time())}

    @router.get("/history/{symbol}")
    async def history(symbol: str, days: int = Query(30, le=365), vs: str = Query("gbp")):
        """Daily close history for the given crypto symbol."""
        cid = COIN_MAP.get(symbol.upper(), symbol.lower())
        url = f"https://api.coingecko.com/api/v3/coins/{cid}/market_chart"
        params = {"vs_currency": vs, "days": days, "interval": "daily" if days > 1 else "hourly"}
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, params=params)
        if r.status_code != 200:
            raise HTTPException(502, f"CoinGecko error {r.status_code}")
        data = r.json().get("prices", [])
        points = [{"ts": int(p[0] / 1000), "price": p[1]} for p in data]
        return {"symbol": symbol.upper(), "coingecko_id": cid, "points": points, "vs": vs.upper()}

    return router


# ===== Yahoo Finance (stocks/ETFs) =====
STOCK_MAP = {
    # Popular UK-listed index ETFs
    "VUSA": "VUSA.L",       # Vanguard S&P 500 UCITS ETF
    "VWRL": "VWRL.L",       # Vanguard FTSE All-World UCITS ETF
    "VUKE": "VUKE.L",       # Vanguard FTSE 100 UCITS ETF
    "VFEM": "VFEM.L",       # Vanguard FTSE Emerging Markets
    "VHVG": "VHVG.L",       # Vanguard ESG Global All Cap
    "ISF":  "ISF.L",        # iShares Core FTSE 100
    "IUSA": "IUSA.L",       # iShares Core S&P 500 UCITS
    "IWDA": "IWDA.L",       # iShares Core MSCI World
    "EQQQ": "EQQQ.L",       # Invesco EQQQ Nasdaq-100
    "VWRP": "VWRP.L",       # Vanguard FTSE All-World accumulating
    # Indices
    "FTSE": "^FTSE",
    "FTSE100": "^FTSE",
    "S&P500": "^GSPC",
    "SP500": "^GSPC",
    "S+P500": "^GSPC",
    "NASDAQ": "^IXIC",
    # Stocks
    "BRK.B": "BRK-B",
    "BERKSHIRE": "BRK-B",
    "AAPL": "AAPL",
    "MSFT": "MSFT",
    "GOOGL": "GOOGL",
    "NVDA": "NVDA",
    "TSLA": "TSLA",
    # Legacy alias kept for old saved forecasts
    "VUAG": "VUAG.L",
}

_stock_cache = {}  # symbol -> (data, ts)
_STOCK_TTL = 60


async def _yahoo_chart(symbol: str, range_: str = "1d") -> dict:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"range": range_, "interval": "1d" if range_ != "1d" else "5m"}
    headers = {"User-Agent": "Mozilla/5.0 FinanceAI/1.0"}
    async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
        r = await client.get(url, params=params)
    if r.status_code != 200:
        raise HTTPException(502, f"Yahoo error {r.status_code}")
    return r.json()


async def _stock_quote(ticker: str) -> Optional[dict]:
    yahoo_sym = STOCK_MAP.get(ticker.upper(), ticker.upper())
    cached = _stock_cache.get(yahoo_sym)
    if cached and time.time() - cached[1] < _STOCK_TTL:
        return cached[0]
    try:
        data = await _yahoo_chart(yahoo_sym, "5d")
        result = data["chart"]["result"][0]
        meta = result.get("meta", {})
        price = meta.get("regularMarketPrice")
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
        change_pct = ((price - prev) / prev * 100) if (price and prev) else 0
        currency = meta.get("currency", "USD")
        row = {
            "symbol": ticker.upper(),
            "yahoo_symbol": yahoo_sym,
            "price": price,
            "previous_close": prev,
            "change_24h_pct": change_pct,
            "currency": currency,
            "exchange": meta.get("exchangeName"),
            "long_name": meta.get("longName") or meta.get("shortName"),
        }
        _stock_cache[yahoo_sym] = (row, time.time())
        return row
    except Exception as e:
        logger.warning(f"yahoo fetch {yahoo_sym} failed: {e}")
        return None


def build_stock_router() -> APIRouter:
    router = APIRouter(prefix="/prices/stocks", tags=["prices"])

    @router.get("")
    async def stocks(symbols: str = Query("VUSA,VWRL,VUKE,IWDA,EQQQ,FTSE,S&P500,NASDAQ")):
        tickers = [s.strip().upper() for s in symbols.split(",") if s.strip()]
        rows = []
        for t in tickers:
            q = await _stock_quote(t)
            if q:
                rows.append(q)
        return {"prices": rows, "as_of": int(time.time())}

    @router.get("/history/{symbol}")
    async def history(symbol: str, range_: str = Query("1mo", alias="range")):
        yahoo_sym = STOCK_MAP.get(symbol.upper(), symbol.upper())
        valid = {"1d","5d","1mo","3mo","6mo","1y","2y","5y","10y","ytd","max"}
        if range_ not in valid:
            range_ = "1mo"
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_sym}"
        params = {"range": range_, "interval": "1d"}
        headers = {"User-Agent": "Mozilla/5.0 FinanceAI/1.0"}
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            r = await client.get(url, params=params)
        if r.status_code != 200:
            raise HTTPException(502, f"Yahoo error {r.status_code}")
        result = r.json()["chart"]["result"][0]
        ts = result.get("timestamp", []) or []
        closes = (result.get("indicators", {}).get("quote", [{}])[0].get("close")) or []
        points = [{"ts": t, "price": c} for t, c in zip(ts, closes) if c is not None]
        return {"symbol": symbol.upper(), "yahoo_symbol": yahoo_sym, "points": points,
                "currency": result.get("meta", {}).get("currency", "USD")}

    return router