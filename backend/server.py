"""FinanceAI - main FastAPI app."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import sys
import json
import logging
import logging.config
from datetime import datetime, timezone
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy import text

from db import init_engine, dispose_engine, get_session_maker, Base, create_tables

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
import investments
import uk_tools
import gdpr
import onboarding
import admin as admin_module
import support
import app_settings
import analytics
import empty_states
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
    logger.error("DATABASE_URL environment variable is not set!")
    raise RuntimeError("DATABASE_URL environment variable is required")

# Validate JWT_SECRET early — will raise if missing/weak
_require_jwt_secret()
logger.info("JWT_SECRET validated")

init_engine(database_url, echo=False)

app = FastAPI(title="FinanceAI API", version="1.1.0")
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
    try:
        sm = get_session_maker()
        async with sm() as session:
            await session.execute(text("SELECT 1"))
            return {
                "status": "ok",
                "database": "connected",
                "auth_configured": bool(os.environ.get("JWT_SECRET")),
                "stripe_configured": all(os.environ.get(v) for v in stripe_vars),
                "routers": len(api.routes),
            }
    except Exception as e:
        return {
            "status": "error",
            "detail": str(e),
            "database": "unavailable",
            "auth_configured": bool(os.environ.get("JWT_SECRET")),
            "stripe_configured": all(os.environ.get(v) for v in stripe_vars),
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
api.include_router(investments.build_router())
api.include_router(uk_tools.build_router())
api.include_router(gdpr.build_router())
api.include_router(onboarding.build_router())
api.include_router(admin_module.build_router())
api.include_router(support.build_router())
api.include_router(app_settings.build_router())
api.include_router(analytics.build_router())
api.include_router(empty_states.build_router())

app.include_router(api)

# CORS: allow frontend origin with credentials
frontend = os.environ.get("FRONTEND_URL", "")
vercel_url = "https://smart-budget-pro-ewtm.vercel.app"
origins = list({o for o in [frontend, vercel_url, "http://localhost:3000", "http://127.0.0.1:3000"] if o})
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
    logger.info("FinanceAI startup complete.")


@app.on_event("shutdown")
async def shutdown():
    await dispose_engine()
