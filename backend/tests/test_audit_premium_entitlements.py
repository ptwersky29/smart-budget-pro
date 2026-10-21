import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from audit_premium_entitlements import build_report, evaluate_entitlement, mask_email
from db import (
    PaymentTransaction,
    User,
    create_tables,
    dispose_engine,
    get_session_maker,
    init_engine,
)

NOW = datetime(2026, 10, 21, tzinfo=timezone.utc)


def make_user(**overrides):
    values = {
        "user_id": "user_1",
        "email": "user@example.com",
        "tier": "premium",
        "is_admin": False,
        "role": "user",
        "subscription_status": None,
        "stripe_subscription_id": None,
        "premium_until": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_payment(package="premium_monthly", days_ago=1, status="paid", created_at=None):
    return SimpleNamespace(
        payment_status=status,
        package_id=package,
        created_at=created_at or (NOW - timedelta(days=days_ago)),
        notify_received_at=None,
    )


def test_admin_is_entitled():
    result = evaluate_entitlement(make_user(is_admin=True), None, NOW)
    assert result["entitled"] is True
    assert result["reason"] == "admin"


def test_stripe_subscription_is_entitled():
    user = make_user(subscription_status="active", stripe_subscription_id="sub_123")
    result = evaluate_entitlement(user, None, NOW)
    assert result["entitled"] is True
    assert result["reason"] == "stripe_active"


def test_active_status_without_stripe_id_is_suspect():
    result = evaluate_entitlement(make_user(subscription_status="active"), None, NOW)
    assert result["entitled"] is False
    assert result["reason"] == "stripe_status_without_subscription"


def test_future_premium_until_is_entitled():
    user = make_user(premium_until=NOW + timedelta(days=10))
    result = evaluate_entitlement(user, None, NOW)
    assert result["entitled"] is True
    assert result["reason"] == "premium_until"


def test_expired_premium_until_without_payment_is_suspect():
    user = make_user(premium_until=NOW - timedelta(days=1))
    result = evaluate_entitlement(user, None, NOW)
    assert result["entitled"] is False
    assert result["reason"] == "premium_expired"


def test_active_monthly_tyl_payment_is_entitled():
    result = evaluate_entitlement(make_user(), make_payment(days_ago=10), NOW)
    assert result["entitled"] is True
    assert result["reason"] == "tyl_active"
    assert result["tyl_ends_at"] == (NOW + timedelta(days=20)).isoformat()


def test_expired_monthly_tyl_payment_is_suspect():
    result = evaluate_entitlement(make_user(), make_payment(days_ago=31), NOW)
    assert result["entitled"] is False
    assert result["reason"] == "tyl_expired"


def test_active_yearly_tyl_payment_is_entitled():
    result = evaluate_entitlement(
        make_user(), make_payment("premium_yearly", days_ago=100), NOW
    )
    assert result["entitled"] is True
    assert result["reason"] == "tyl_active"


def test_expired_yearly_tyl_payment_is_suspect():
    result = evaluate_entitlement(
        make_user(), make_payment("premium_yearly", days_ago=400), NOW
    )
    assert result["entitled"] is False
    assert result["reason"] == "tyl_expired"


def test_unknown_package_is_suspect():
    result = evaluate_entitlement(
        make_user(), make_payment("lifetime_deal", days_ago=1), NOW
    )
    assert result["entitled"] is False
    assert result["reason"] == "tyl_unknown_package"


def test_failed_payment_is_not_entitled():
    result = evaluate_entitlement(make_user(), make_payment(status="failed"), NOW)
    assert result["entitled"] is False
    assert result["reason"] == "no_active_entitlement"


def test_naive_payment_timestamp_is_treated_as_utc():
    payment = make_payment(created_at=datetime(2026, 10, 11))
    result = evaluate_entitlement(make_user(), payment, NOW)
    assert result["entitled"] is True
    assert (
        result["tyl_ends_at"] == datetime(2026, 11, 10, tzinfo=timezone.utc).isoformat()
    )


def test_email_is_masked_in_report():
    assert mask_email("alice@example.com") == "a***@example.com"
    assert mask_email("") == ""


def test_build_report_reads_sqlite_without_writes(tmp_path, monkeypatch):
    database_url = f"sqlite+aiosqlite:///{tmp_path.as_posix()}/audit.db"

    async def seed():
        init_engine(database_url)
        try:
            await create_tables()
            session_maker = get_session_maker()
            async with session_maker() as session:
                session.add_all(
                    [
                        User(
                            user_id="user_admin",
                            email="admin@example.com",
                            hashed_password="x",
                            tier="premium",
                            is_admin=True,
                            role="admin",
                        ),
                        User(
                            user_id="user_expired",
                            email="expired@example.com",
                            hashed_password="x",
                            tier="premium",
                        ),
                        User(
                            user_id="user_active",
                            email="active@example.com",
                            hashed_password="x",
                            tier="premium",
                            subscription_status="active",
                            stripe_subscription_id="sub_active",
                        ),
                        User(
                            user_id="user_free_stripe",
                            email="free-stripe@example.com",
                            hashed_password="x",
                            tier="free",
                            subscription_status="active",
                            stripe_subscription_id="sub_free",
                        ),
                        PaymentTransaction(
                            session_id="session_expired",
                            user_id="user_expired",
                            provider="tyl",
                            package_id="premium_monthly",
                            payment_status="paid",
                            created_at=datetime.now(timezone.utc) - timedelta(days=40),
                        ),
                    ]
                )
                await session.commit()
        finally:
            await dispose_engine()

    asyncio.run(seed())
    monkeypatch.setenv("DATABASE_URL", database_url)
    report = asyncio.run(build_report(include_email=True))

    assert report["premium_users"] == 4
    assert report["entitled"] == 3
    assert report["suspects"] == 1
    suspect = next(row for row in report["rows"] if not row["entitled"])
    assert suspect["user_id"] == "user_expired"
    assert suspect["reason"] == "tyl_expired"
    assert suspect["email"] == "expired@example.com"
