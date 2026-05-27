"""Hebrew calendar + Zmanim widget via Hebcal (keyless)."""
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger("hebcal")

# Common UK + Jewish-population city geonameids for Hebcal
CITIES = {
    "london": 2643743,
    "manchester": 2643123,
    "gateshead": 2647928,
    "leeds": 2644688,
    "edinburgh": 2650225,
    "glasgow": 2648579,
    "stamford-hill": 2643743,  # same lat/lon as London
    "jerusalem": 281184,
    "tel-aviv": 293397,
    "new-york": 5128581,
    "monsey": 5128217,
    "lakewood": 5101798,
    "los-angeles": 5368361,
    "miami": 4164138,
}

_cache = {}  # key -> (data, ts)
_TTL = 1800  # 30 min


def _ck(parts) -> str:
    return "|".join(str(p) for p in parts)


def _cached(key):
    rec = _cache.get(key)
    if rec and time.time() - rec[1] < _TTL:
        return rec[0]
    return None


def _store(key, val):
    _cache[key] = (val, time.time())


async def _fetch_json(url: str, params: dict) -> dict:
    async with httpx.AsyncClient(timeout=15.0,
                                 headers={"User-Agent": "FinanceAI/1.0 (UK Jewish budgeting)"}) as client:
        r = await client.get(url, params=params)
    if r.status_code != 200:
        raise HTTPException(502, f"Hebcal error {r.status_code}")
    return r.json()


def build_router() -> APIRouter:
    router = APIRouter(prefix="/jewish/hebcal", tags=["jewish"])

    @router.get("/today")
    async def today(date: Optional[str] = None):
        """Convert today (or `date=YYYY-MM-DD`) to Hebrew calendar."""
        if date:
            try:
                dt = datetime.strptime(date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(400, "date must be YYYY-MM-DD")
        else:
            dt = datetime.now(timezone.utc)
        key = _ck(["today", dt.strftime("%Y-%m-%d")])
        cached = _cached(key)
        if cached:
            return cached
        data = await _fetch_json(
            "https://www.hebcal.com/converter",
            {"cfg": "json", "gy": dt.year, "gm": dt.month, "gd": dt.day, "g2h": 1, "strict": 1},
        )
        result = {
            "gregorian_date": dt.strftime("%Y-%m-%d"),
            "hebrew_date": data.get("hebrew"),
            "hd": data.get("hd"),
            "hm": data.get("hm"),
            "hy": data.get("hy"),
            "events": data.get("events", []) or [],
        }
        _store(key, result)
        return result

    @router.get("/zmanim")
    async def zmanim(city: str = Query("london"), date: Optional[str] = None):
        """Sunrise, sunset, candle lighting, havdalah, etc."""
        city_key = city.lower().strip()
        geonameid = CITIES.get(city_key)
        if not geonameid:
            raise HTTPException(400, f"Unknown city '{city}'. Supported: {', '.join(CITIES.keys())}")
        target_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        key = _ck(["zmanim", geonameid, target_date])
        cached = _cached(key)
        if cached:
            return cached
        data = await _fetch_json(
            "https://www.hebcal.com/zmanim",
            {"cfg": "json", "geonameid": geonameid, "date": target_date},
        )
        times = data.get("times", {})
        # Pretty-format a curated set
        keys = [
            ("alotHaShachar", "Alos HaShachar"),
            ("misheyakir", "Misheyakir"),
            ("sunrise", "Sunrise"),
            ("sofZmanShmaMGA", "Krias Shma (MGA)"),
            ("sofZmanShma", "Krias Shma (GRA)"),
            ("sofZmanTfilla", "Sof Zman Tefilla"),
            ("chatzot", "Chatzos"),
            ("minchaGedola", "Mincha Gedolah"),
            ("minchaKetana", "Mincha Ketanah"),
            ("plagHaMincha", "Plag HaMincha"),
            ("sunset", "Shkiah"),
            ("tzeit7083deg", "Tzeis (8.5°)"),
        ]
        rows = []
        for k, label in keys:
            v = times.get(k)
            if v:
                rows.append({"key": k, "label": label, "time": v[11:16]})  # HH:MM from ISO
        result = {
            "city": city_key,
            "date": target_date,
            "location": data.get("location", {}),
            "times": rows,
        }
        _store(key, result)
        return result

    @router.get("/upcoming-holidays")
    async def upcoming_holidays(year: Optional[int] = None):
        """Major Jewish holidays for the calendar year (Gregorian)."""
        y = year or datetime.now(timezone.utc).year
        key = _ck(["hol", y])
        cached = _cached(key)
        if cached:
            return cached
        data = await _fetch_json(
            "https://www.hebcal.com/hebcal",
            {"v": 1, "cfg": "json", "maj": "on", "min": "on", "mod": "on", "year": y, "month": "x", "i": "off"},
        )
        items = data.get("items", []) or []
        # Filter to holidays (not parsha or candle-lighting)
        clean = []
        today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for it in items:
            if it.get("category") in ("holiday", "roshchodesh"):
                clean.append({
                    "date": it.get("date"),
                    "title": it.get("title"),
                    "hebrew": it.get("hebrew"),
                    "category": it.get("category"),
                    "subcat": it.get("subcat"),
                    "is_upcoming": (it.get("date", "") >= today_iso),
                })
        # Show the next 12 upcoming
        upcoming = [c for c in clean if c["is_upcoming"]][:12]
        result = {"year": y, "upcoming": upcoming, "count_total": len(clean)}
        _store(key, result)
        return result

    @router.get("/cities")
    async def list_cities():
        return {"cities": sorted(CITIES.keys())}

    return router
