"""FinanceAI - main FastAPI app."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

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

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("financeai")

mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

app = FastAPI(title="FinanceAI API", version="1.0.0")
app.state.db = db

api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"app": "FinanceAI", "status": "online"}


@api.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


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

app.include_router(api)

# CORS: allow frontend origin with credentials
frontend = os.environ.get("FRONTEND_URL", "")
origins = [o for o in [frontend, "http://localhost:3000"] if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.bank_connections.create_index([("user_id", 1), ("connection_id", 1)])
    await db.transactions.create_index([("user_id", 1), ("date", -1)])
    await db.budgets.create_index([("user_id", 1), ("category", 1)])
    await db.tzedakah.create_index([("user_id", 1), ("date", -1)])
    await db.ai_messages.create_index([("user_id", 1), ("session_id", 1), ("created_at", 1)])
    await db.payment_transactions.create_index("session_id", unique=True)
    await auth.seed_admin(db)
    logger.info("FinanceAI startup complete.")


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
