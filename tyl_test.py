"""FinanceAI Tyl by NatWest Billing Endpoint Testing"""
import os
import requests

# Get backend URL from environment
BACKEND_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://clone-builder-154.preview.emergentagent.com").rstrip("/")
API = f"{BACKEND_URL}/api"

# Admin credentials from review request
ADMIN_EMAIL = "admin@financeai.app"
ADMIN_PASSWORD = "FinanceAI2026!"

print(f"🔍 Testing Tyl by NatWest Billing Endpoints at: {API}")
print("=" * 80)

# Create session to preserve cookies
session = requests.Session()

# ============================================================================
# 1. LOGIN FIRST
# ============================================================================
print("\n1️⃣  Testing Login...")
try:
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    if r.status_code == 200:
        user = r.json()
        print(f"✅ Login successful: {user.get('email')} (role: {user.get('role')}, tier: {user.get('tier')})")
    else:
        print(f"❌ Login failed: {r.status_code} - {r.text}")
        exit(1)
except Exception as e:
    print(f"❌ Login error: {e}")
    exit(1)

# ============================================================================
# 2. GET /api/billing/tyl/config (NO AUTH REQUIRED)
# ============================================================================
print("\n2️⃣  Testing GET /api/billing/tyl/config (no auth)...")
try:
    # Test without auth (create new session)
    r = requests.get(f"{API}/billing/tyl/config", timeout=15)
    if r.status_code == 200:
        config = r.json()
        print(f"✅ Tyl config retrieved (no auth required)")
        print(f"   configured: {config.get('configured')}")
        print(f"   gateway_url: {config.get('gateway_url')}")
        print(f"   store_id_set: {config.get('store_id_set')}")
        print(f"   secret_set: {config.get('secret_set')}")
        
        # Verify expected values
        expected = {
            "configured": False,  # Because secret is not set
            "gateway_url": "https://test.ipgonline.com/connect/gateway/processing",
            "store_id_set": True,  # TYL_STORE_ID="7250569397"
            "secret_set": False    # TYL_SHARED_SECRET=""
        }
        
        if config == expected:
            print(f"✅ Config matches expected values exactly")
        else:
            print(f"⚠️  Config mismatch:")
            for key, expected_val in expected.items():
                actual_val = config.get(key)
                if actual_val != expected_val:
                    print(f"   {key}: expected={expected_val}, actual={actual_val}")
    else:
        print(f"❌ Tyl config failed: {r.status_code} - {r.text}")
except Exception as e:
    print(f"❌ Tyl config error: {e}")

# ============================================================================
# 3. POST /api/billing/tyl/checkout (SHOULD FAIL - SECRET NOT SET)
# ============================================================================
print("\n3️⃣  Testing POST /api/billing/tyl/checkout (expect 503)...")
try:
    checkout_data = {
        "package_id": "premium_monthly",
        "origin_url": "https://example.com"
    }
    r = session.post(f"{API}/billing/tyl/checkout", json=checkout_data, timeout=15)
    
    if r.status_code == 503:
        print(f"✅ Checkout correctly refused (503) - Tyl not configured")
        response = r.json()
        detail = response.get("detail", "")
        if "Tyl is not configured" in detail or "TYL_SHARED_SECRET" in detail:
            print(f"   Message: {detail}")
            print(f"✅ Error message is appropriate")
        else:
            print(f"⚠️  Unexpected error message: {detail}")
    else:
        print(f"❌ Checkout should return 503, got: {r.status_code}")
        print(f"   Response: {r.text[:200]}")
except Exception as e:
    print(f"❌ Checkout error: {e}")

# ============================================================================
# 4. GET /api/billing/tyl/return (REDIRECT TEST)
# ============================================================================
print("\n4️⃣  Testing GET /api/billing/tyl/return (redirect)...")
try:
    # Test the return endpoint with query params
    params = {
        "origin": "https://example.com",
        "session_id": "test",
        "result": "failed"
    }
    r = requests.get(f"{API}/billing/tyl/return", params=params, timeout=15, allow_redirects=False)
    
    if r.status_code == 303:
        print(f"✅ Return endpoint returns 303 redirect")
        location = r.headers.get("Location", "")
        print(f"   Redirect to: {location}")
        
        # Verify redirect URL structure
        if "https://example.com/billing/success" in location:
            print(f"✅ Redirect URL starts with origin/billing/success")
        else:
            print(f"⚠️  Unexpected redirect base: {location}")
        
        # Check for expected query params
        if "outcome=failed" in location:
            print(f"✅ Contains outcome=failed")
        else:
            print(f"⚠️  Missing or wrong outcome parameter")
        
        if "session_id=test" in location:
            print(f"✅ Contains session_id=test")
        else:
            print(f"⚠️  Missing or wrong session_id parameter")
    else:
        print(f"❌ Expected 303 redirect, got: {r.status_code}")
        print(f"   Response: {r.text[:200]}")
except Exception as e:
    print(f"❌ Return endpoint error: {e}")

# ============================================================================
# 5. SANITY RE-CHECK: Previously-tested endpoints
# ============================================================================
print("\n5️⃣  Sanity re-check of previously-tested endpoints...")

# 5a. POST /api/auth/login (already tested above)
print("   ✅ POST /api/auth/login - working (tested in step 1)")

# 5b. GET /api/transactions
try:
    r = session.get(f"{API}/transactions", timeout=15)
    if r.status_code == 200:
        data = r.json()
        txns = data.get("transactions", []) if isinstance(data, dict) else data
        print(f"   ✅ GET /api/transactions - working ({len(txns)} transactions)")
    else:
        print(f"   ❌ GET /api/transactions failed: {r.status_code}")
except Exception as e:
    print(f"   ❌ GET /api/transactions error: {e}")

# 5c. GET /api/jewish/maaser/summary - CHECK NEW SHAPE
print("\n   📋 Checking Maaser summary NEW shape...")
try:
    r = session.get(f"{API}/jewish/maaser/summary", timeout=15)
    if r.status_code == 200:
        summary = r.json()
        print(f"   ✅ GET /api/jewish/maaser/summary - working")
        
        # Check for required fields from review request
        required_fields = [
            "total_income",
            "obligation",
            "given_total",
            "tx_given",
            "ledger_given",
            "accrued_pending",
            "balance_owed",
            "credit",
            "percent"
        ]
        
        print(f"   📊 Maaser summary fields:")
        missing_fields = []
        for field in required_fields:
            if field in summary:
                print(f"      ✅ {field}: {summary[field]}")
            else:
                print(f"      ❌ {field}: MISSING")
                missing_fields.append(field)
        
        if not missing_fields:
            print(f"   ✅ All required fields present in new shape")
        else:
            print(f"   ❌ Missing fields: {missing_fields}")
    else:
        print(f"   ❌ GET /api/jewish/maaser/summary failed: {r.status_code}")
except Exception as e:
    print(f"   ❌ GET /api/jewish/maaser/summary error: {e}")

# 5d. POST /api/jewish/maaser/reset
try:
    r = session.post(f"{API}/jewish/maaser/reset", timeout=15)
    if r.status_code == 200:
        result = r.json()
        print(f"   ✅ POST /api/jewish/maaser/reset - working")
    else:
        print(f"   ❌ POST /api/jewish/maaser/reset failed: {r.status_code}")
except Exception as e:
    print(f"   ❌ POST /api/jewish/maaser/reset error: {e}")

# ============================================================================
# 6. HASH SANITY (OPTIONAL - SKIP IF CAN'T MUTATE ENV)
# ============================================================================
print("\n6️⃣  Hash sanity check (skipped - cannot mutate env in test)...")
print("   ℹ️  To test hash generation, TYL_SHARED_SECRET must be set in .env")
print("   ℹ️  Current test confirms endpoint refuses checkout when secret is missing")

print("\n" + "=" * 80)
print("✅ Tyl billing endpoint testing complete!")
print("=" * 80)
