from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from tyl import apply_tyl_entitlement, extend_premium_until, _tyl_payment_status

NOW = datetime(2026, 10, 21, tzinfo=timezone.utc)


def test_monthly_payment_sets_thirty_days():
    assert extend_premium_until("premium_monthly", None, NOW) == NOW + timedelta(
        days=30
    )


def test_yearly_payment_sets_365_days():
    assert extend_premium_until("premium_yearly", None, NOW) == NOW + timedelta(
        days=365
    )


def test_renewal_extends_from_later_expiry():
    current = NOW + timedelta(days=5)
    assert extend_premium_until("premium_monthly", current, NOW) == current + timedelta(
        days=30
    )


def test_expired_entitlement_restarts_from_now():
    current = NOW - timedelta(days=5)
    assert extend_premium_until("premium_monthly", current, NOW) == NOW + timedelta(
        days=30
    )


def test_naive_current_value_is_treated_as_utc():
    current = datetime(2026, 10, 25)
    result = extend_premium_until("premium_monthly", current, NOW)
    assert result == datetime(2026, 11, 24, tzinfo=timezone.utc)


def test_unknown_package_leaves_entitlement_unchanged():
    current = NOW + timedelta(days=5)
    assert extend_premium_until("unknown", current, NOW) == current


def test_apply_tyl_entitlement_grants_premium():
    user = SimpleNamespace(tier="free", premium_until=None)
    apply_tyl_entitlement(user, "premium_monthly", now=NOW)
    assert user.tier == "premium"
    assert user.premium_until == NOW + timedelta(days=30)


def test_replayed_payment_does_not_extend_entitlement_twice():
    user = SimpleNamespace(tier="free", premium_until=None)
    apply_tyl_entitlement(user, "premium_monthly", now=NOW)
    first_expiry = user.premium_until
    apply_tyl_entitlement(user, "premium_monthly", already_paid=True, now=NOW)
    assert user.premium_until == first_expiry


def test_unknown_package_does_not_grant_permanent_premium():
    user = SimpleNamespace(tier="free", premium_until=None)
    apply_tyl_entitlement(user, "unknown", now=NOW)
    assert user.tier == "free"
    assert user.premium_until is None


def test_tyl_payment_status_keeps_waiting_pending():
    assert _tyl_payment_status(True, "APPROVED") == "paid"
    assert _tyl_payment_status(False, "WAITING") == "pending"
    assert _tyl_payment_status(False, "PENDING") == "pending"
    assert _tyl_payment_status(False, "DECLINED") == "failed"
    assert _tyl_payment_status(False, "") == "failed"
