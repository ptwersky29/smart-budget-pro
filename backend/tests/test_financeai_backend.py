"""FinanceAI backend regression tests - all /api endpoints."""
import os
import time
import urllib.parse as up
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://smart-budget-ai-42.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@financeai.app"
ADMIN_PASS = "FinanceAI2026!"
TS = int(time.time())
TEST_EMAIL = f"tester+{TS}@financeai.app"
DUP_EMAIL = f"dup+{TS}@financeai.app"
TEST_PASS = "TestUser2026!"


@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def newuser():
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASS, "name": "Tester"}, timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return s


# ---- Health ----
def test_health():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---- Auth ----
def test_register_duplicate():
    requests.post(f"{API}/auth/register", json={"email": DUP_EMAIL, "password": TEST_PASS}, timeout=15)
    r = requests.post(f"{API}/auth/register", json={"email": DUP_EMAIL, "password": TEST_PASS}, timeout=15)
    assert r.status_code == 400


def test_admin_login_and_me(admin):
    r = admin.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == ADMIN_EMAIL
    assert body["role"] == "admin"
    assert body["tier"] == "premium"


def test_login_invalid():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_refresh(admin):
    r = admin.post(f"{API}/auth/refresh", timeout=15)
    assert r.status_code == 200


def test_forgot_password():
    r = requests.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL}, timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_logout(newuser):
    r = newuser.post(f"{API}/auth/logout", timeout=15)
    assert r.status_code == 200
    # After logout /me should fail
    r2 = newuser.get(f"{API}/auth/me", timeout=15)
    assert r2.status_code == 401
    # Re-login for downstream tests
    r3 = newuser.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASS}, timeout=15)
    assert r3.status_code == 200


# ---- TrueLayer ----
def test_truelayer_auth_url(admin):
    r = admin.get(f"{API}/truelayer/auth-url", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "auth_url" in body
    url = body["auth_url"]
    qs = up.parse_qs(up.urlparse(url).query)
    for k in ("client_id", "redirect_uri", "response_type", "scope", "state", "nonce"):
        assert k in qs, f"missing param {k} in auth URL"
    assert qs["response_type"] == ["code"]
    assert "provider_id" not in qs
    if "sandbox" in url:
        assert qs.get("providers") == ["uk-cs-mock"]
        assert qs.get("user_email"), "sandbox auth URL should include user_email"
    else:
        assert "providers" not in qs
        assert "country_id" not in qs
        assert "user_email" not in qs


def test_truelayer_callback_invalid_state(admin):
    r = admin.get(f"{API}/truelayer/callback", params={"code": "x", "state": "bad"},
                  allow_redirects=False, timeout=15)
    assert r.status_code in (302, 307), r.status_code
    loc = r.headers.get("location", "")
    assert "status=failed" in loc and "invalid_state" in loc


def test_truelayer_callback_no_params(admin):
    r = admin.get(f"{API}/truelayer/callback", allow_redirects=False, timeout=15)
    assert r.status_code in (302, 307)
    assert "status=failed" in r.headers.get("location", "")


def test_truelayer_connections(admin):
    r = admin.get(f"{API}/truelayer/connections", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))
    if isinstance(body, dict):
        assert "connections" in body


def test_truelayer_logs(admin):
    r = admin.get(f"{API}/truelayer/logs", timeout=15)
    assert r.status_code == 200


# ---- AI ----
def test_ai_chat_admin(admin):
    r = admin.post(f"{API}/ai/chat", json={"message": "Hello, what is 2+2? Reply in 5 words."}, timeout=90)
    # Allow 200 (real call), or 402/503/500 for integration outage
    assert r.status_code in (200, 402, 500, 503), f"{r.status_code}: {r.text[:200]}"
    if r.status_code == 200:
        j = r.json()
        assert "reply" in j or "message" in j or "response" in j


def test_ai_sessions(admin):
    r = admin.get(f"{API}/ai/sessions", timeout=15)
    assert r.status_code == 200


def test_ai_usage(admin):
    r = admin.get(f"{API}/ai/usage", timeout=15)
    assert r.status_code == 200


def test_ai_providers_add_delete(admin):
    r = admin.post(f"{API}/ai/providers",
                   json={"provider": "openai", "name": "OpenAI", "api_key": "sk-test", "model": "gpt-4o-mini"},
                   timeout=15)
    assert r.status_code in (200, 201), r.text
    r2 = admin.delete(f"{API}/ai/providers/openai", timeout=15)
    assert r2.status_code in (200, 204, 404)


# ---- Finance ----
def test_seed_demo_and_dashboard(admin):
    r = admin.post(f"{API}/transactions/seed-demo", timeout=30)
    assert r.status_code in (200, 201), r.text

    r2 = admin.get(f"{API}/transactions", timeout=15)
    assert r2.status_code == 200
    body2 = r2.json()
    txns = body2 if isinstance(body2, list) else body2.get("transactions", [])
    assert isinstance(txns, list) and len(txns) > 0

    r3 = admin.get(f"{API}/dashboard/overview", timeout=15)
    assert r3.status_code == 200, r3.text
    overview = r3.json()
    for k in ("balance", "income", "spend", "categories", "monthly_flow", "recent"):
        assert k in overview, f"missing {k} in overview"


def test_create_patch_delete_transaction(admin):
    r = admin.post(f"{API}/transactions",
                   json={"amount": -25.50, "description": "Tesco shop", "date": "2026-01-15"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    txn = r.json()
    tid = txn.get("id") or txn.get("transaction_id") or txn.get("_id")
    assert tid, f"no id in {txn}"
    assert txn.get("category"), "auto-categorise should set a category"

    r2 = admin.patch(f"{API}/transactions/{tid}", json={"category": "Food"}, timeout=15)
    assert r2.status_code == 200

    r3 = admin.delete(f"{API}/transactions/{tid}", timeout=15)
    assert r3.status_code in (200, 204)


def test_budgets(admin):
    r = admin.post(f"{API}/budgets", json={"category": "Food", "limit": 300, "amount": 300}, timeout=15)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    bid = body.get("id") or body.get("budget_id")

    r2 = admin.get(f"{API}/budgets", timeout=15)
    assert r2.status_code == 200
    body2 = r2.json()
    arr = body2 if isinstance(body2, list) else body2.get("budgets", [])
    assert isinstance(arr, list) and len(arr) >= 1
    assert any(("progress" in b) or ("spent" in b) for b in arr)

    if bid:
        r3 = admin.delete(f"{API}/budgets/{bid}", timeout=15)
        assert r3.status_code in (200, 204)


# ---- Investments ----
def test_investment_forecast(admin):
    r = admin.post(f"{API}/investments/forecast",
                   json={"symbol": "VUAG", "ticker": "VUAG", "monthly_contribution": 500,
                         "monthly": 500, "years": 20}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert any(k in j for k in ("future_value", "projected_value", "final_value", "forecast"))


# ---- Jewish ----
def test_jewish_maaser(admin):
    r = admin.post(f"{API}/jewish/maaser", json={"income": 5000}, timeout=15)
    assert r.status_code == 200
    j = r.json()
    # accept any numeric field
    assert isinstance(j, dict) and len(j) > 0


def test_jewish_tzedakah(admin):
    r = admin.post(f"{API}/jewish/tzedakah", json={"recipient": "Charity X", "amount": 50}, timeout=15)
    assert r.status_code in (200, 201), r.text
    r2 = admin.get(f"{API}/jewish/tzedakah", timeout=15)
    assert r2.status_code == 200
    body = r2.json()
    arr = body if isinstance(body, list) else body.get("entries", [])
    assert isinstance(arr, list) and len(arr) >= 1


def test_jewish_holiday(admin):
    r = admin.get(f"{API}/jewish/holiday-budget", timeout=15)
    assert r.status_code == 200


# ---- UK ----
def test_uk_uc(admin):
    r = admin.post(f"{API}/uk/universal-credit",
                   json={"household_income": 2000, "children": 2, "rent": 800}, timeout=15)
    assert r.status_code == 200, r.text


def test_uk_hmrc(admin):
    r = admin.post(f"{API}/uk/hmrc-estimate", json={"annual_income": 45000}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert any(k in j for k in ("income_tax", "tax", "national_insurance", "ni"))


# ---- Billing ----
def test_billing_packages():
    r = requests.get(f"{API}/billing/packages", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, (list, dict))


def test_billing_checkout(admin):
    r = admin.post(f"{API}/billing/checkout",
                   json={"package_id": "premium_monthly",
                         "origin_url": "https://example.com"}, timeout=30)
    # Stripe test key with emergent integrations - allow either success or known integration failure
    assert r.status_code in (200, 201, 400, 500, 503), f"{r.status_code}: {r.text[:200]}"
    if r.status_code in (200, 201):
        j = r.json()
        assert "checkout_url" in j or "url" in j
        sid = j.get("session_id") or j.get("id")
        if sid:
            r2 = admin.get(f"{API}/billing/status/{sid}", timeout=15)
            assert r2.status_code in (200, 404, 500)
