"""SQLAlchemy 2.0 async models for PostgreSQL (Supabase)."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Boolean, Integer, Float, DateTime, Text, Enum as SAEnum,
    ForeignKey, UniqueConstraint, Index, JSON, delete as sa_delete,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

import enum


class Base(DeclarativeBase):
    pass


# ── Engine & Session ──────────────────────────────────────────────────────

_engine = None
_async_session_maker = None


def init_engine(database_url: str, echo: bool = False):
    global _engine, _async_session_maker
    _engine = create_async_engine(database_url, echo=echo, pool_pre_ping=True)
    _async_session_maker = async_sessionmaker(_engine, expire_on_commit=False)


def get_session_maker():
    return _async_session_maker


async def dispose_engine():
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None


async def create_tables():
    """Create all tables via the async engine (safe to call on every startup)."""
    if _engine:
        async with _engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            from sqlalchemy import text
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS picture VARCHAR(512)"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(128)"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'user'"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(32)"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS free_trial_end TIMESTAMPTZ"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS remember_me BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64)"))
            await conn.execute(text("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_agent VARCHAR(512)"))
            await conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS normalized_merchant VARCHAR(255)"))
            await conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS parent_id VARCHAR(64)"))
            await conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_id VARCHAR(64)"))
            await conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subscription_name VARCHAR(255)"))


async def get_session() -> AsyncSession:
    sm = get_session_maker()
    async with sm() as session:
        yield session


# ── Mixins ────────────────────────────────────────────────────────────────

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, onupdate=lambda: datetime.now(timezone.utc)
    )


# ── Users ─────────────────────────────────────────────────────────────────

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    picture: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    google_sub: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="user")
    tier: Mapped[str] = mapped_column(String(32), default="free")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    subscription_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    free_trial_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_started: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_step: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    preferences: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # relationships
    sessions: Mapped[List["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    bank_connections: Mapped[List["BankConnection"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserSession(Base, TimestampMixin):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    session_token: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    remember_me: Mapped[bool] = mapped_column(Boolean, default=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    jti: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


# ── Config ────────────────────────────────────────────────────────────────

class AppConfig(Base):
    __tablename__ = "app_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


# ── TrueLayer / Bank Connections ──────────────────────────────────────────

class TrueLayerState(Base):
    __tablename__ = "truelayer_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    state: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    redirect_uri: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BankConnection(Base):
    __tablename__ = "bank_connections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    connection_id: Mapped[str] = mapped_column(String(128), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), default="truelayer")
    account_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    account_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    account_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active")
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship(back_populates="bank_connections")

    __table_args__ = (
        Index("idx_bank_connections_user_conn", "user_id", "connection_id"),
    )


class TrueLayerLog(Base):
    __tablename__ = "truelayer_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    endpoint: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    request_body: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    response_body: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


# ── Sync Logs (TrueLayer / Open Banking sync history) ─────────────────────

class SyncLog(Base):
    __tablename__ = "sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    connection_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), default="truelayer")
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="info")  # info, success, error
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("idx_sync_logs_user_created", "user_id", "created_at"),
    )


# ── Transactions ──────────────────────────────────────────────────────────

class Transaction(Base, TimestampMixin):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    account_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    connection_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="GBP")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    subcategory: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    merchant_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    normalized_merchant: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pending: Mapped[bool] = mapped_column(Boolean, default=False)
    tx_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    exclude_from_maaser: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(32), default="manual")
    parent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    recurring_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    subscription_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("idx_transactions_user_date", "user_id", "date"),
    )


class SplitTransaction(Base, TimestampMixin):
    __tablename__ = "split_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    split_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    parent_transaction_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class AccountNickname(Base, TimestampMixin):
    __tablename__ = "account_nicknames"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(128), nullable=False)
    nickname: Mapped[str] = mapped_column(String(255), nullable=False)
    account_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "account_id", name="uq_account_nickname_user"),
    )


class Budget(Base, TimestampMixin):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    budget_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    period: Mapped[str] = mapped_column(String(16), default="monthly")  # weekly, monthly, yearly
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_budgets_user_category", "user_id", "category"),
    )


class RecurringTransaction(Base, TimestampMixin):
    __tablename__ = "recurring_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    frequency: Mapped[str] = mapped_column(String(32), nullable=False)  # weekly, monthly, yearly
    next_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PendingUpdate(Base, TimestampMixin):
    __tablename__ = "pending_updates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    transaction_id: Mapped[str] = mapped_column(String(64), nullable=True)
    field: Mapped[str] = mapped_column(String(64), nullable=False)
    old_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    applied: Mapped[bool] = mapped_column(Boolean, default=False)


# ── Maaser / Tzedakah ─────────────────────────────────────────────────────

class MaaserLedger(Base, TimestampMixin):
    __tablename__ = "maaser_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    transaction_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    income_amount: Mapped[float] = mapped_column(Float, default=0)
    maaser_due: Mapped[float] = mapped_column(Float, default=0)
    maaser_paid: Mapped[float] = mapped_column(Float, default=0)
    paid_to: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("idx_maaser_user_date", "user_id", "date"),
    )


# ── AI ────────────────────────────────────────────────────────────────────

class AiMessage(Base, TimestampMixin):
    __tablename__ = "ai_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user, assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    __table_args__ = (
        Index("idx_ai_messages_user_session", "user_id", "session_id", "created_at"),
    )


class AiUsage(Base):
    __tablename__ = "ai_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0)
    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    endpoint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class AiProvider(Base, TimestampMixin):
    __tablename__ = "ai_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(32), nullable=False)  # openai, anthropic, etc.
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_ai_providers_user_name"),
    )


# ── Billing ───────────────────────────────────────────────────────────────

class PaymentTransaction(Base, TimestampMixin):
    __tablename__ = "payment_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    oid: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    provider: Mapped[str] = mapped_column(String(16), default="stripe")  # stripe, tyl
    user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    origin: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    amount: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="gbp")
    package_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(32), default="initiated")
    status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    approval_code: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    ipg_transaction_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    signature_valid: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    raw_response: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    notify_received_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class BillingRecord(Base, TimestampMixin):
    __tablename__ = "billing_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    stripe_session_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    amount: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="usd")
    package: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")


# ── SMS ───────────────────────────────────────────────────────────────────

class SmsMessage(Base, TimestampMixin):
    __tablename__ = "sms_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    to_number: Mapped[str] = mapped_column(String(32), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="sent")  # sent, delivered, failed
    provider: Mapped[str] = mapped_column(String(32), default="twilio")
    external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    direction: Mapped[str] = mapped_column(String(8), default="outbound")


# ── Statements ────────────────────────────────────────────────────────────

class Statement(Base, TimestampMixin):
    __tablename__ = "statements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    account_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_income: Mapped[float] = mapped_column(Float, default=0)
    total_expenses: Mapped[float] = mapped_column(Float, default=0)
    net_savings: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="GBP")
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft, final
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


# ── Integrations ──────────────────────────────────────────────────────────

class Integration(Base, TimestampMixin):
    __tablename__ = "integrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)  # truelayer, twilio, etc.
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    label: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_integrations_user_provider"),
    )
