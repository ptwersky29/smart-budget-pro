from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import cast

from auth import _effective_tier, _resolve_role
from db import User

NOW = datetime.now(timezone.utc)


def make_user(**overrides):
    values = {
        "user_id": "user_1",
        "email": "user@example.com",
        "tier": "premium",
        "is_admin": False,
        "role": "user",
        "subscription_status": None,
        "premium_until": None,
    }
    values.update(overrides)
    # The test fixture deliberately only supplies the attributes used by auth.
    return cast(User, SimpleNamespace(**values))


def test_admin_is_always_premium():
    assert _effective_tier(make_user(is_admin=True, tier="free")) == "premium"


def test_active_stripe_subscription_is_premium():
    user = make_user(
        subscription_status="active", premium_until=NOW - timedelta(days=1)
    )
    assert _effective_tier(user) == "premium"


def test_expired_tyl_entitlement_downgrades_effective_tier():
    assert _effective_tier(make_user(premium_until=NOW - timedelta(days=1))) == "free"


def test_future_tyl_entitlement_stays_premium():
    user = make_user(premium_until=NOW + timedelta(days=1))
    assert _effective_tier(user) == "premium"


def test_legacy_premium_without_expiry_is_grandfathered():
    assert _effective_tier(make_user()) == "premium"


def test_role_uses_effective_tier():
    assert (
        _resolve_role(make_user(premium_until=NOW - timedelta(days=1))) == "free_user"
    )
    assert (
        _resolve_role(make_user(premium_until=NOW + timedelta(days=1)))
        == "premium_user"
    )
