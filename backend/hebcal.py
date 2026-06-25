"""Built-in Hebrew calendar — no external API calls."""

import logging
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from astral import LocationInfo, SunDirection
from astral.sun import sun as astral_sun
from astral.sun import time_at_elevation
from fastapi import APIRouter, HTTPException, Query
from pyluach import dates as pl_dates
from pyluach.hebrewcal import Month, Year

logger = logging.getLogger("hebcal")

CITIES: dict[str, tuple[float, float, str]] = {
    "london": (51.5, -0.1, "Europe/London"),
    "manchester": (53.5, -2.2, "Europe/London"),
    "gateshead": (54.9, -1.6, "Europe/London"),
    "leeds": (53.8, -1.5, "Europe/London"),
    "edinburgh": (55.9, -3.1, "Europe/London"),
    "glasgow": (55.8, -4.2, "Europe/London"),
    "stamford-hill": (51.5, -0.1, "Europe/London"),
    "jerusalem": (31.8, 35.2, "Asia/Jerusalem"),
    "tel-aviv": (32.1, 34.8, "Asia/Jerusalem"),
    "new-york": (40.7, -74.0, "America/New_York"),
    "monsey": (41.1, -74.1, "America/New_York"),
    "lakewood": (40.1, -74.2, "America/New_York"),
    "los-angeles": (34.0, -118.2, "America/Los_Angeles"),
    "miami": (25.8, -80.2, "America/New_York"),
}

ZMAN_ANGLE_KEYS = [
    ("alotHaShachar", "Alos HaShachar", -16.1, SunDirection.RISING),
    ("misheyakir", "Misheyakir", -10.2, SunDirection.RISING),
    ("tzeit7083deg", "Tzeis (8.5\u00b0)", -8.5, SunDirection.SETTING),
]


def _get_zman_times(
    observer: LocationInfo,
    dt: date,
    tz: ZoneInfo,
) -> dict[str, str]:
    s = astral_sun(observer, dt, tzinfo=tz)
    sunrise = s["sunrise"]
    sunset = s["sunset"]
    noon = s["noon"]
    dawn = s["dawn"]

    shaah = (sunset - sunrise) / 12

    times: dict[str, str] = {}

    # Elevation-based times
    for key, label, angle, direction in ZMAN_ANGLE_KEYS:
        try:
            t = time_at_elevation(observer, angle, dt, tzinfo=tz, direction=direction)
            times[key] = t.strftime("%H:%M")
        except Exception:
            pass

    # Derived times using sha'ot zmaniyot
    times["sunrise"] = sunrise.strftime("%H:%M")
    times["sofZmanShmaMGA"] = (dawn + 3 * shaah).strftime("%H:%M")
    times["sofZmanShma"] = (sunrise + 3 * shaah).strftime("%H:%M")
    times["sofZmanTfilla"] = (sunrise + 4 * shaah).strftime("%H:%M")
    times["chatzot"] = noon.strftime("%H:%M")
    times["minchaGedola"] = (noon + timedelta(hours=0.5)).strftime("%H:%M")
    times["minchaKetana"] = (sunrise + 9.5 * shaah).strftime("%H:%M")
    times["plagHaMincha"] = (sunrise + 10.75 * shaah).strftime("%H:%M")
    times["sunset"] = sunset.strftime("%H:%M")

    return times


ZMAN_KEY_LABEL = [
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
    ("tzeit7083deg", "Tzeis (8.5\u00b0)"),
]


def _collect_holidays(start: date, end: date) -> list[dict]:
    results: list[dict] = []
    seen = set()
    current = start
    while current <= end:
        gd = pl_dates.GregorianDate(current.year, current.month, current.day)
        hd = gd.to_heb()
        holiday_name = hd.holiday()

        is_rosh_chodesh = hd.day in (1, 30)

        if holiday_name:
            dedup_key = (current.isoformat(), holiday_name)
            if dedup_key not in seen:
                seen.add(dedup_key)
                results.append(
                    {
                        "date": current.isoformat(),
                        "title": holiday_name,
                        "hebrew": f"{hd.day} {hd.month_name()} {hd.year}",
                        "category": "holiday",
                        "subcat": None,
                        "is_upcoming": current >= date.today(),
                    }
                )

        if is_rosh_chodesh and not holiday_name:
            if hd.day == 30:
                tomorrow = current + timedelta(days=1)
                tmr_gd = pl_dates.GregorianDate(
                    tomorrow.year, tomorrow.month, tomorrow.day
                )
                tmr_hd = tmr_gd.to_heb()
                month_name = tmr_hd.month_name()
            else:
                month_name = hd.month_name()
            title = f"Rosh Chodesh {month_name}"
            dedup_key = (current.isoformat(), title)
            if dedup_key not in seen:
                seen.add(dedup_key)
                results.append(
                    {
                        "date": current.isoformat(),
                        "title": title,
                        "hebrew": f"{hd.day} {hd.month_name()} {hd.year}",
                        "category": "roshchodesh",
                        "subcat": None,
                        "is_upcoming": current >= date.today(),
                    }
                )

        current += timedelta(days=1)
    return results


def _get_hebrew_months() -> list[dict]:
    today_gd = pl_dates.GregorianDate.today()
    today_hd = today_gd.to_heb()

    start_gd = date.today() - timedelta(days=365)
    end_gd = date.today() + timedelta(days=1095)

    months: list[dict] = []
    for hy in range(today_hd.year - 2, today_hd.year + 5):
        y = Year(hy)
        for hm in range(1, y.monthscount() + 1):
            m = Month(hy, hm)
            days = list(m.iterdates())
            first = days[0].to_greg().to_pydate()
            last = days[-1].to_greg().to_pydate()
            if last < start_gd or first > end_gd:
                continue
            months.append(
                {
                    "hebrew_month": hm,
                    "hebrew_year": hy,
                    "month_name": m.month_name(),
                    "gregorian_start": first.isoformat(),
                    "gregorian_end": last.isoformat(),
                    "is_current": hy == today_hd.year and hm == today_hd.month,
                    "is_leap": y.leap,
                    "days": len(days),
                }
            )

    months.sort(key=lambda m: m["gregorian_start"])
    return months


def build_router() -> APIRouter:
    router = APIRouter(prefix="/jewish/hebcal", tags=["jewish"])

    @router.get("/today")
    async def today(gregorian_date: Optional[str] = Query(None, alias="date")):
        if gregorian_date:
            try:
                dt = datetime.strptime(gregorian_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(400, "date must be YYYY-MM-DD")
        else:
            dt = date.today()

        hd = pl_dates.GregorianDate(dt.year, dt.month, dt.day).to_heb()

        events: list[str] = []
        holiday_name = hd.holiday()
        if holiday_name:
            events.append(holiday_name)

        return {
            "gregorian_date": dt.isoformat(),
            "hebrew_date": f"{hd.day} {hd.month_name()} {hd.year}",
            "hd": hd.day,
            "hm": hd.month,
            "hy": hd.year,
            "events": events,
        }

    @router.get("/zmanim")
    async def zmanim(city: str = Query("london"), target_date: Optional[str] = None):
        city_key = city.lower().strip()
        coords = CITIES.get(city_key)
        if not coords:
            raise HTTPException(
                400,
                f"Unknown city '{city}'. Supported: {', '.join(sorted(CITIES.keys()))}",
            )

        lat, lon, tz_name = coords
        tz = ZoneInfo(tz_name)
        dt = (
            date.today()
            if target_date is None
            else datetime.strptime(target_date, "%Y-%m-%d").date()
        )

        loc = LocationInfo(city_key, "", tz_name, lat, lon)

        try:
            times_map = _get_zman_times(loc.observer, dt, tz)
        except Exception as exc:
            raise HTTPException(502, f"Failed to compute zmanim: {exc}")

        rows = []
        for key, label in ZMAN_KEY_LABEL:
            val = times_map.get(key)
            if val:
                rows.append({"key": key, "label": label, "time": val})

        return {
            "city": city_key,
            "date": dt.isoformat(),
            "location": {"lat": lat, "lng": lon, "tzid": tz_name},
            "times": rows,
        }

    @router.get("/upcoming-holidays")
    async def upcoming_holidays(year: Optional[int] = None):
        today_dt = date.today()
        y = year if year else today_dt.year

        start = date(y, 1, 1)
        end = date(y, 12, 31)

        all_holidays = _collect_holidays(start, end)

        upcoming = [h for h in all_holidays if h["is_upcoming"]][:12]
        return {"year": y, "upcoming": upcoming, "count_total": len(all_holidays)}

    @router.get("/cities")
    async def list_cities():
        return {"cities": sorted(CITIES.keys())}

    @router.get("/months")
    async def list_months():
        return {"months": _get_hebrew_months()}

    return router
