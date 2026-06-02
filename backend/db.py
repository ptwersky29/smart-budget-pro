"""SQLAlchemy 2.0 async models for PostgreSQL (Supabase)."""
import uuid
from datetime import date, datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Boolean, Integer, Float, Numeric, DateTime, Date, Text, Enum as SAEnum,
    ForeignKey, UniqueConstraint, Index, JSON,
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
            await conn.execute(text("ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS sender_phone VARCHAR(32)"))
            await conn.execute(text("ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS dedup_hash VARCHAR(64)"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS data_exported_at TIMESTAMPTZ"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS data_deleted_at TIMESTAMPTZ"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_terms BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_privacy BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_marketing BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS app_language VARCHAR(8) DEFAULT 'en'"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS app_theme VARCHAR(16) DEFAULT 'system'"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS app_currency VARCHAR(4) DEFAULT 'GBP'"))
            await conn.execute(text("ALTER TABLE truelayer_states ADD COLUMN IF NOT EXISTS meta JSON"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(32)"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS last_error TEXT"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ"))
            # Float → Numeric for monetary columns
            await conn.execute(text("ALTER TABLE transactions ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::numeric"))
            await conn.execute(text("ALTER TABLE split_transactions ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::numeric"))
            await conn.execute(text("ALTER TABLE budgets ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::numeric"))
            await conn.execute(text("ALTER TABLE recurring_transactions ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::numeric"))
            await conn.execute(text("ALTER TABLE maaser_ledger ALTER COLUMN income_amount TYPE NUMERIC(12,2) USING income_amount::numeric"))
            await conn.execute(text("ALTER TABLE maaser_ledger ALTER COLUMN maaser_due TYPE NUMERIC(12,2) USING maaser_due::numeric"))
            await conn.execute(text("ALTER TABLE maaser_ledger ALTER COLUMN maaser_paid TYPE NUMERIC(12,2) USING maaser_paid::numeric"))
            await conn.execute(text("ALTER TABLE payment_transactions ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::numeric"))
            await conn.execute(text("ALTER TABLE billing_records ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::numeric"))
            await conn.execute(text("ALTER TABLE statements ALTER COLUMN total_income TYPE NUMERIC(12,2) USING total_income::numeric"))
            await conn.execute(text("ALTER TABLE statements ALTER COLUMN total_expenses TYPE NUMERIC(12,2) USING total_expenses::numeric"))
            await conn.execute(text("ALTER TABLE statements ALTER COLUMN net_savings TYPE NUMERIC(12,2) USING net_savings::numeric"))
            await conn.execute(text("ALTER TABLE investment_holdings ALTER COLUMN shares TYPE NUMERIC(14,4) USING shares::numeric"))
            await conn.execute(text("ALTER TABLE investment_holdings ALTER COLUMN cost_basis TYPE NUMERIC(14,4) USING cost_basis::numeric"))
            await conn.execute(text("ALTER TABLE investment_holdings ALTER COLUMN current_price TYPE NUMERIC(14,4) USING current_price::numeric"))
            await conn.execute(text("ALTER TABLE investment_holdings ALTER COLUMN target_allocation_pct TYPE NUMERIC(8,4) USING target_allocation_pct::numeric"))
            await conn.execute(text("ALTER TABLE market_data ALTER COLUMN price TYPE NUMERIC(14,4) USING price::numeric"))
            await conn.execute(text("ALTER TABLE market_data ALTER COLUMN previous_close TYPE NUMERIC(14,4) USING previous_close::numeric"))
            await conn.execute(text("ALTER TABLE market_data ALTER COLUMN change_pct TYPE NUMERIC(8,4) USING change_pct::numeric"))
            await conn.execute(text("ALTER TABLE market_data ALTER COLUMN high_52w TYPE NUMERIC(14,4) USING high_52w::numeric"))
            await conn.execute(text("ALTER TABLE market_data ALTER COLUMN low_52w TYPE NUMERIC(14,4) USING low_52w::numeric"))
            await conn.execute(text("ALTER TABLE holiday_budgets ALTER COLUMN budgeted_amount TYPE NUMERIC(12,2) USING budgeted_amount::numeric"))
            await conn.execute(text("ALTER TABLE holiday_budgets ALTER COLUMN actual_amount TYPE NUMERIC(12,2) USING actual_amount::numeric"))
            await conn.execute(text("ALTER TABLE chasuna_plans ALTER COLUMN estimated_cost TYPE NUMERIC(12,2) USING estimated_cost::numeric"))
            await conn.execute(text("ALTER TABLE chasuna_plans ALTER COLUMN actual_cost TYPE NUMERIC(12,2) USING actual_cost::numeric"))
            await conn.execute(text("ALTER TABLE chasuna_plans ALTER COLUMN deposit_paid TYPE NUMERIC(12,2) USING deposit_paid::numeric"))
            await conn.execute(text("ALTER TABLE analytics_events ALTER COLUMN value TYPE NUMERIC(12,2) USING value::numeric"))
            # Currency case fix
            await conn.execute(text("ALTER TABLE payment_transactions ALTER COLUMN currency SET DEFAULT 'GBP'"))
            await conn.execute(text("UPDATE payment_transactions SET currency = 'GBP' WHERE currency = 'gbp'"))
            await conn.execute(text("ALTER TABLE billing_records ALTER COLUMN currency SET DEFAULT 'GBP'"))
            await conn.execute(text("UPDATE billing_records SET currency = 'GBP' WHERE currency = 'usd'"))
            # Account lockout columns
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ"))
            # Email verification columns
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(128)"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMPTZ"))
            # Missing columns from User model
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(32) DEFAULT 'free'"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step VARCHAR(64)"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSON"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT FALSE"))
            # Phase 2 — Bank connection improvements
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS import_start_date DATE"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS update_count INTEGER DEFAULT 0"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS config JSON"))
            # Phase 3 — Nicknames, balances
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS nickname VARCHAR(255)"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS balance NUMERIC(14,2)"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS balance_currency VARCHAR(3) DEFAULT 'GBP'"))
            await conn.execute(text("ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ"))


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
    consent_terms: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_privacy: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_marketing: Mapped[bool] = mapped_column(Boolean, default=False)
    data_exported_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    data_deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    app_language: Mapped[str] = mapped_column(String(8), default="en")
    app_theme: Mapped[str] = mapped_column(String(16), default="system")
    app_currency: Mapped[str] = mapped_column(String(4), default="GBP")
    login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verification_token: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    email_verification_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # relationships
    sessions: Mapped[List["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    bank_connections: Mapped[List["BankConnection"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    support_tickets: Mapped[List["SupportTicket"]] = relationship(back_populates="user", cascade="all, delete-orphan")


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
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


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
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False)
    redirect_uri: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
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
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_error_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    import_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    update_count: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    nickname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    balance: Mapped[Optional[float]] = mapped_column(Numeric(14, 2, asdecimal=False), nullable=True)
    balance_currency: Mapped[str] = mapped_column(String(3), default="GBP")
    balance_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None, onupdate=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship(back_populates="bank_connections")

    __table_args__ = (
        Index("idx_bank_connections_user_conn", "user_id", "connection_id"),
        Index("idx_bank_user_status", "user_id", "status"),
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
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
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
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    account_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    connection_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), nullable=False)
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
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class AccountNickname(Base, TimestampMixin):
    __tablename__ = "account_nicknames"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
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
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), nullable=False)
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
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    frequency: Mapped[str] = mapped_column(String(32), nullable=False)  # weekly, monthly, yearly
    next_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Category(Base, TimestampMixin):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    is_income: Mapped[bool] = mapped_column(Boolean, default=False)
    budget: Mapped[Optional[float]] = mapped_column(Numeric(12, 2, asdecimal=False), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_category_user_name"),
    )


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subscription_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="GBP")
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    merchant: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    frequency: Mapped[str] = mapped_column(String(16), default="monthly")
    next_billing: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class PendingUpdate(Base, TimestampMixin):
    __tablename__ = "pending_updates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    transaction_id: Mapped[str] = mapped_column(String(64), nullable=True)
    field: Mapped[str] = mapped_column(String(64), nullable=False)
    old_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    applied: Mapped[bool] = mapped_column(Boolean, default=False)


# ── Maaser / Tzedakah ─────────────────────────────────────────────────────

class MaaserLedger(Base, TimestampMixin):
    __tablename__ = "maaser_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    transaction_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    income_amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    maaser_due: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    maaser_paid: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
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
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
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
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Numeric(12, 6, asdecimal=False), default=0)
    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    endpoint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class AiProvider(Base, TimestampMixin):
    __tablename__ = "ai_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(32), nullable=False)  # openai, anthropic, etc.
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_ai_providers_user_name"),
    )


# ── Learned categorisation rules ──────────────────────────────────────────

class CategoryRule(Base, TimestampMixin):
    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    merchant: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    match_count: Mapped[int] = mapped_column(Integer, default=1)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="learned")  # learned, manual

    __table_args__ = (
        UniqueConstraint("user_id", "merchant", name="uq_category_rules_user_merchant"),
        Index("idx_category_rules_user_category", "user_id", "category"),
    )


# ── Billing ───────────────────────────────────────────────────────────────

class PaymentTransaction(Base, TimestampMixin):
    __tablename__ = "payment_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    oid: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    provider: Mapped[str] = mapped_column(String(16), default="stripe")  # stripe, tyl
    user_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=True)
    user_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    origin: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="GBP")
    package_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(32), default="initiated")
    approval_code: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    ipg_transaction_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    signature_valid: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    raw_response: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    notify_received_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class BillingRecord(Base, TimestampMixin):
    __tablename__ = "billing_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    stripe_session_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    package: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")


# ── SMS ───────────────────────────────────────────────────────────────────

class SmsMessage(Base, TimestampMixin):
    __tablename__ = "sms_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    to_number: Mapped[str] = mapped_column(String(32), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="sent")  # sent, delivered, failed
    provider: Mapped[str] = mapped_column(String(32), default="twilio")
    external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    direction: Mapped[str] = mapped_column(String(8), default="outbound")
    sender_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    dedup_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class SmsSender(Base, TimestampMixin):
    __tablename__ = "sms_senders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    phone_number: Mapped[str] = mapped_column(String(32), nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "phone_number", name="uq_sms_sender_user_phone"),
    )


# ── Statements ────────────────────────────────────────────────────────────

class Statement(Base, TimestampMixin):
    __tablename__ = "statements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    account_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_income: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    total_expenses: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    net_savings: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="GBP")
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft, final
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


# ── Audit ────────────────────────────────────────────────────────────────

class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    resource: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    detail: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        Index("idx_audit_user_action", "user_id", "action"),
        Index("idx_audit_created", "created_at"),
    )


class ConsentRecord(Base, TimestampMixin):
    __tablename__ = "consent_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    consent_type: Mapped[str] = mapped_column(String(64), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, default=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index("idx_consent_user_type", "user_id", "consent_type"),
    )


# ── Investments ──────────────────────────────────────────────────────────

INVESTMENT_TYPES = {"stock", "etf", "crypto", "gold", "bond", "property"}

class InvestmentHolding(Base, TimestampMixin):
    __tablename__ = "investment_holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    ticker: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    shares: Mapped[float] = mapped_column(Numeric(14, 4, asdecimal=False), default=0)
    cost_basis: Mapped[float] = mapped_column(Numeric(14, 4, asdecimal=False), default=0)
    current_price: Mapped[float] = mapped_column(Numeric(14, 4, asdecimal=False), default=0)
    currency: Mapped[str] = mapped_column(String(4), default="GBP")
    account_name: Mapped[str] = mapped_column(String(64), default="General")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price_updated: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    target_allocation_pct: Mapped[float] = mapped_column(Numeric(8, 4, asdecimal=False), default=0)

    __table_args__ = (
        Index("idx_investment_user_ticker", "user_id", "ticker"),
    )


class MarketData(Base, TimestampMixin):
    __tablename__ = "market_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(14, 4, asdecimal=False), default=0)
    previous_close: Mapped[float] = mapped_column(Numeric(14, 4, asdecimal=False), default=0)
    change_pct: Mapped[float] = mapped_column(Numeric(8, 4, asdecimal=False), default=0)
    high_52w: Mapped[Optional[float]] = mapped_column(Numeric(14, 4, asdecimal=False), nullable=True)
    low_52w: Mapped[Optional[float]] = mapped_column(Numeric(14, 4, asdecimal=False), nullable=True)
    currency: Mapped[str] = mapped_column(String(4), default="GBP")
    last_updated: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="manual")


# ── Jewish Finance ───────────────────────────────────────────────────────

class HolidayBudget(Base, TimestampMixin):
    __tablename__ = "holiday_budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    holiday_name: Mapped[str] = mapped_column(String(64), nullable=False)
    hebrew_year: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    budgeted_amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    actual_amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_holiday_budget_user_holiday", "user_id", "holiday_name"),
    )


class ChasunaPlan(Base, TimestampMixin):
    __tablename__ = "chasuna_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    estimated_cost: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    actual_cost: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    status: Mapped[str] = mapped_column(String(16), default="planned")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    vendor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    deposit_paid: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)


class Integration(Base, TimestampMixin):
    __tablename__ = "integrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)  # truelayer, twilio, etc.
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    label: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_integrations_user_provider"),
    )


# ── Phase 9: Onboarding ──────────────────────────────────────────────────

ONBOARDING_STEPS = ["connect_bank", "first_transaction", "set_budget", "ai_intro", "complete"]


class OnboardingProgress(Base, TimestampMixin):
    __tablename__ = "onboarding_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True, unique=True)
    step: Mapped[str] = mapped_column(String(32), default="connect_bank")
    completed_steps: Mapped[dict] = mapped_column(JSON, default=dict)
    skipped: Mapped[bool] = mapped_column(Boolean, default=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ── Phase 9: Feature Flags ───────────────────────────────────────────────

class FeatureFlag(Base, TimestampMixin):
    __tablename__ = "feature_flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    flag: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)


# ── Phase 9: Support Tickets ─────────────────────────────────────────────

TICKET_STATUSES = {"open", "in_progress", "resolved", "closed"}
TICKET_PRIORITIES = {"low", "medium", "high", "critical"}


class SupportTicket(Base, TimestampMixin):
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.user_id"), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="open")
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    admin_reply: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="support_tickets")

    __table_args__ = (
        Index("idx_support_user_status", "user_id", "status"),
    )


# ── Phase 9: Analytics ───────────────────────────────────────────────────

class AnalyticsEvent(Base, TimestampMixin):
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    event: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(32), default="engagement")
    value: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    event_meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
