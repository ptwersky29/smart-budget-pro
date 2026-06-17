"""FinanceAI - main FastAPI app."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / ".env.local", override=True)

import os
import sys
import json
import logging
import logging.config
from datetime import datetime, timezone
from fastapi import FastAPI, APIRouter, HTTPException
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.requests import Request as StarletteRequest
from sqlalchemy import text

import asyncio
from db import init_engine, dispose_engine, get_session_maker, Base, create_tables, BankConnection
from sqlalchemy import select

import auth
import truelayer
import ai_service
import ai_insights
import finance_engine
import billing
import tyl
import app_config
import sms
import prices
import reports
import statements
import integrations
import hebcal
import jewish
import jewish_reports
import investments
import uk_tools
import gdpr
import onboarding
import admin as admin_module
import support
import app_settings
import analytics
import empty_states
import budget_system
import notifications
from exceptions import FinanceAIError
from rate_limit import RateLimiter, RateLimitMiddleware, CsrfProtectionMiddleware
from middleware import ErrorMonitorMiddleware, RequestTimerMiddleware, RequestIdMiddleware, SecurityHeadersMiddleware
from security import generate_csrf_token, _require_jwt_secret

# Optional Sentry integration
SENTRY_DSN = os.environ.get("SENTRY_DSN")
if SENTRY_DSN:
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.1)
        logger.info("Sentry error monitoring enabled")
    except ImportError:
        logger.warning("SENTRY_DSN set but sentry-sdk not installed — skipping")


class JsonFormatter(logging.Formatter):
    def format(self, record):
        log = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0]:
            log["exc"] = self.formatException(record.exc_info)
        return json.dumps(log)


_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(JsonFormatter() if os.environ.get("JSON_LOG") else logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
))
logging.basicConfig(level=logging.INFO, handlers=[_handler])
logger = logging.getLogger("financeai")

# ── Startup validation ──────────────────────────────────────────────────

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    database_url = "sqlite+aiosqlite:///financeai.db"
    logger.info("No DATABASE_URL set — using local SQLite: %s", database_url)

# Validate JWT_SECRET early — will raise if missing/weak
_require_jwt_secret()
logger.info("JWT_SECRET validated")

init_engine(database_url, echo=False)

app = FastAPI(title="FinanceAI API", version="1.1.1")

GIT_COMMIT = "17a2c91"
app.state.db = get_session_maker()

# Middleware stack (order matters: outermost first)
app.add_middleware(ErrorMonitorMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CsrfProtectionMiddleware)
app.add_middleware(RequestTimerMiddleware)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(RateLimitMiddleware, limiter=RateLimiter(limit=120, window=60))

api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"app": "FinanceAI", "status": "online"}


@api.get("/health")
async def health():
    stripe_vars = ["STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_MONTHLY_PRICE_ID", "STRIPE_YEARLY_PRICE_ID"]
    checks = {"database": "unavailable", "version": app.version, "uptime": None}
    db_ok = False
    try:
        sm = get_session_maker()
        async with sm() as session:
            await session.execute(text("SELECT 1"))
            db_ok = True
            checks["database"] = "connected"
    except Exception as e:
        checks["database"] = f"error: {str(e)[:60]}"

    try:
        import time
        if not hasattr(app.state, "started_at"):
            app.state.started_at = time.time()
        checks["uptime"] = round(time.time() - app.state.started_at, 1)
    except Exception:
        checks["uptime"] = None

    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "version": app.version,
        "commit": GIT_COMMIT,
        "checks": checks,
        "auth_configured": bool(os.environ.get("JWT_SECRET")),
        "frontend_url_set": bool(os.environ.get("FRONTEND_URL")),
        "stripe_configured": all(os.environ.get(v) for v in stripe_vars),
        "sentry_configured": bool(os.environ.get("SENTRY_DSN")),
        "routers": len(api.routes),
    }


@api.get("/csrf-token")
async def csrf_token():
    token = generate_csrf_token()
    return {"csrf_token": token}


# Mount sub-routers
api.include_router(auth.build_router())
api.include_router(truelayer.build_router())
api.include_router(ai_service.build_router())
api.include_router(ai_insights.build_router())
api.include_router(finance_engine.build_router())
api.include_router(billing.build_router())
api.include_router(tyl.build_router())
api.include_router(app_config.build_router())
api.include_router(sms.build_router())
api.include_router(prices.build_router())
api.include_router(prices.build_stock_router())
api.include_router(reports.build_router())
api.include_router(statements.build_router())
api.include_router(integrations.build_router())
api.include_router(hebcal.build_router())
api.include_router(jewish.build_router())
api.include_router(jewish_reports.router)
api.include_router(investments.build_router())
api.include_router(uk_tools.build_router())
api.include_router(gdpr.build_router())
api.include_router(onboarding.build_router())
api.include_router(admin_module.build_router())
api.include_router(support.build_router())
api.include_router(app_settings.build_router())
api.include_router(analytics.build_router())
api.include_router(empty_states.build_router())
api.include_router(budget_system.build_router())
api.include_router(notifications.router)

app.include_router(api)

# CORS config (defined before exception handlers that reference it)
frontend_url = os.environ.get("FRONTEND_URL", "")
vercel_url = "https://smart-budget-pro-ewtm.vercel.app"
origins = list({o for o in [frontend_url, vercel_url, "http://localhost:3000", "http://127.0.0.1:3000"] if o})

def _cors_headers(request: StarletteRequest):
    """Build CORS headers for the given origin."""
    origin = request.headers.get("origin", "")
    if not origin:
        return {}
    if origin in origins or (origin.startswith("https://") and origin.endswith(".vercel.app")):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {}

# HTTPException handler adds CORS headers (preserves status code)
@app.exception_handler(HTTPException)
async def http_exception_handler(request: StarletteRequest, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=_cors_headers(request),
    )

# FinanceAIError handler
@app.exception_handler(FinanceAIError)
async def financeai_exception_handler(request: StarletteRequest, exc: FinanceAIError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
        headers=_cors_headers(request),
    )

# Global exception handler — catches every unhandled error and logs it
@app.exception_handler(Exception)
async def global_exception_handler(request: StarletteRequest, exc: Exception):
    logger.exception("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."},
        headers=_cors_headers(request),
    )

# CORS: allow frontend origin with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["http://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    logger.info("Running DB migrations (v1.1.0) ...")
    await create_tables()
    logger.info("DB tables created / verified.")
    sm = get_session_maker()
    async with sm() as session:
        await auth.seed_admin(session)
    if not os.environ.get("FRONTEND_URL"):
        logger.warning("FRONTEND_URL not set — Google OAuth redirects will fail")

    # Start background sync loop for TrueLayer
    try:
        from truelayer import run_background_sync, SYNC_INTERVAL_SECONDS

        async def _background_sync_loop():
            logger.info("Background TrueLayer sync loop started (interval=%ss)", SYNC_INTERVAL_SECONDS)
            while True:
                await asyncio.sleep(SYNC_INTERVAL_SECONDS)
                try:
                    db_maker = get_session_maker()
                    await run_background_sync(db_maker)
                except Exception as e:
                    logger.error("Background sync loop error: %s", e)

        asyncio.create_task(_background_sync_loop())
        logger.info("Background sync task created")
    except Exception as e:
        logger.warning("Could not start background sync: %s", e)

    logger.info("FinanceAI startup complete.")


@app.on_event("shutdown")
async def shutdown():
    from llm import close_llm_client
    await close_llm_client()
    await dispose_engine()
