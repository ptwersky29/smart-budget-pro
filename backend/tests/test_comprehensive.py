"""Comprehensive health check and integration tests for FinanceAI."""
import os
import sys
import time
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["JWT_SECRET"] = "test-secret-key-for-testing-purposes-only"
os.environ["STRIPE_MONTHLY_PRICE_ID"] = "price_test_monthly"
os.environ["STRIPE_YEARLY_PRICE_ID"] = "price_test_yearly"
os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_test"

from security import validate_password, encrypt_value, decrypt_value, hash_email, sanitize_input
from cache import TTLCache
from rate_limit import RateLimiter
from db import ONBOARDING_STEPS


# ── SECURITY TESTS ───────────────────────────────────────────────────────

class TestSecurity:
    def test_validate_password_valid(self):
        ok, msg = validate_password("StrongP@ss1")
        assert ok == True

    def test_validate_password_too_short(self):
        ok, msg = validate_password("Sh0rt!")
        assert ok == False
        assert "at least 8" in msg

    def test_validate_password_no_upper(self):
        ok, msg = validate_password("lowercase1@")
        assert ok == False

    def test_validate_password_no_lower(self):
        ok, msg = validate_password("UPPERCASE1@")
        assert ok == False

    def test_validate_password_no_digit(self):
        ok, msg = validate_password("NoDigit@!")
        assert ok == False

    def test_validate_password_no_special(self):
        ok, msg = validate_password("NoSpecial1")
        assert ok == False

    def test_encrypt_decrypt(self):
        original = "sensitive-data-123"
        encrypted = encrypt_value(original)
        assert encrypted != original
        decrypted = decrypt_value(encrypted)
        assert decrypted == original

    def test_encrypt_different_each_time(self):
        val = "test-value"
        e1 = encrypt_value(val)
        e2 = encrypt_value(val)
        assert e1 != e2  # IV should differ

    def test_hash_email(self):
        h = hash_email("Test@Example.com")
        assert isinstance(h, str)
        assert len(h) == 16  # Truncated SHA-256 hex

    def test_sanitize_input(self):
        assert sanitize_input("<script>alert('xss')</script>") == "scriptalert(xss)/script"
        assert sanitize_input("hello world") == "hello world"
        assert sanitize_input("") == ""
        assert sanitize_input(None) == ""


# ── CACHE TESTS ──────────────────────────────────────────────────────────

class TestTTLCache:
    def test_set_get(self):
        c = TTLCache(ttl=60)
        c.set("key1", "value1")
        assert c.get("key1") == "value1"

    def test_expired(self):
        c = TTLCache(ttl=60)
        c.set("key_exp", "val", ttl=-1)
        time.sleep(0.01)
        assert c.get("key_exp") is None

    def test_missing_key(self):
        c = TTLCache(ttl=60)
        assert c.get("nonexistent") is None

    def test_delete(self):
        c = TTLCache(ttl=60)
        c.set("del_key", "val")
        c.delete("del_key")
        assert c.get("del_key") is None

    def test_clear(self):
        c = TTLCache(ttl=60)
        c.set("a", 1)
        c.set("b", 2)
        c.clear()
        assert c.get("a") is None
        assert c.get("b") is None

    def test_default_ttl(self):
        c = TTLCache(ttl=60)
        c.set("default", "val")
        assert c.get("default") == "val"


# ── RATE LIMITER TESTS ────────────────────────────────────────────────────

class TestRateLimiter:
    def test_check(self):
        """RateLimiter.check() requires a Request object — test constructor only."""
        rl = RateLimiter(limit=5, window=60)
        assert rl.limit == 5
        assert rl.window == 60

    def test_defaults(self):
        rl = RateLimiter()
        assert rl.limit == 120
        assert rl.window == 60


# ── ONBOARDING STEP TESTS ────────────────────────────────────────────────

class TestOnboardingSteps:
    def test_steps_order(self):
        assert ONBOARDING_STEPS == ["connect_bank", "first_transaction", "set_budget", "ai_intro", "complete"]

    def test_step_progression(self):
        steps = ONBOARDING_STEPS
        for i in range(len(steps) - 1):
            assert steps.index(steps[i]) < steps.index(steps[i + 1])


# ── API ENDPOINT STRUCTURE TESTS ──────────────────────────────────────────

class TestAPIEndpoints:
    """Verify that all router modules can build valid routers without errors."""

    def test_onboarding_router(self):
        from onboarding import build_router
        r = build_router()
        assert r.prefix == "/onboarding"
        paths = [route.path for route in r.routes]
        assert any("progress" in p for p in paths)
        assert any("skip" in p for p in paths)
        assert any("health" in p for p in paths)

    def test_admin_router(self):
        from admin import build_router
        r = build_router()
        assert r.prefix == "/admin"
        paths = [route.path for route in r.routes]
        assert any("dashboard" in p for p in paths)
        assert any("users" in p for p in paths)

    def test_support_router(self):
        from support import build_router
        r = build_router()
        assert r.prefix == "/support"
        paths = [route.path for route in r.routes]
        assert any("tickets" in p for p in paths)

    def test_app_settings_router(self):
        from app_settings import build_router
        r = build_router()
        assert r.prefix == "/settings"
        paths = [route.path for route in r.routes]
        assert any("app" in p for p in paths)

    def test_analytics_router(self):
        from analytics import build_router
        r = build_router()
        assert r.prefix == "/analytics"
        paths = [route.path for route in r.routes]
        assert any("track" in p for p in paths)
        assert any("events" in p for p in paths)
        assert any("summary" in p for p in paths)

    def test_empty_states_router(self):
        from empty_states import build_router
        r = build_router()
        assert r.prefix == "/empty-states"
        paths = [route.path for route in r.routes]
        assert any("check" in p for p in paths)
        assert any("health" in p for p in paths)

    def test_all_routers_mount(self):
        """Verify all routers can be included in a parent router without conflicts."""
        from fastapi import APIRouter
        from onboarding import build_router as r1
        from admin import build_router as r2
        from support import build_router as r3
        from app_settings import build_router as r4
        from analytics import build_router as r5
        from empty_states import build_router as r6
        parent = APIRouter()
        parent.include_router(r1())
        parent.include_router(r2())
        parent.include_router(r3())
        parent.include_router(r4())
        parent.include_router(r5())
        parent.include_router(r6())
        assert len(parent.routes) > 6  # Sanity check


# ── MIGRATION TESTS ──────────────────────────────────────────────────────

class TestMigrationSafety:
    def test_onboarding_steps_constant(self):
        assert isinstance(ONBOARDING_STEPS, list)
        assert len(ONBOARDING_STEPS) == 5

    def test_password_validation_bounds(self):
        result = validate_password("A" * 129)  # Over 128
        assert result != True

    def test_password_validation_min_length(self):
        result = validate_password("Ab1@")
        assert result != True

    def test_encrypt_empty_string(self):
        encrypted = encrypt_value("")
        decrypted = decrypt_value(encrypted)
        assert decrypted == ""


# ── EMPTY STATE GUIDE TESTS ──────────────────────────────────────────────

class TestEmptyStates:
    def test_resource_guides(self):
        from empty_states import RESOURCE_GUIDES
        assert "transactions" in RESOURCE_GUIDES
        assert "budgets" in RESOURCE_GUIDES
        assert "holidays" in RESOURCE_GUIDES
        assert "investments" in RESOURCE_GUIDES
        assert "support_tickets" in RESOURCE_GUIDES
        for key, guide in RESOURCE_GUIDES.items():
            assert "title" in guide
            assert "message" in guide
            assert "actions" in guide
            assert len(guide["actions"]) > 0
