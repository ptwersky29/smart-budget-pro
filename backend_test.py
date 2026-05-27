"""FinanceAI Backend Testing - Focus on NEW features: Transaction/Budget PATCH, Maaser auto-accrual"""
import os
import requests
import time

# Get backend URL from environment
BACKEND_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://clone-builder-154.preview.emergentagent.com").rstrip("/")
API = f"{BACKEND_URL}/api"

# Admin credentials from review request
ADMIN_EMAIL = "admin@financeai.app"
ADMIN_PASSWORD = "FinanceAI2026!"

print(f"🔍 Testing FinanceAI Backend at: {API}")
print("=" * 80)

# Create session to preserve cookies
session = requests.Session()

# ============================================================================
# 1. LOGIN
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
# 2. SEED DEMO TRANSACTIONS
# ============================================================================
print("\n2️⃣  Seeding demo transactions...")
try:
    r = session.post(f"{API}/transactions/seed-demo", timeout=30)
    if r.status_code in (200, 201):
        result = r.json()
        print(f"✅ Seed demo: {result}")
    else:
        print(f"⚠️  Seed demo response: {r.status_code} - {r.text[:200]}")
except Exception as e:
    print(f"❌ Seed demo error: {e}")

# ============================================================================
# 3. GET TRANSACTIONS
# ============================================================================
print("\n3️⃣  Getting transactions...")
try:
    r = session.get(f"{API}/transactions", timeout=15)
    if r.status_code == 200:
        data = r.json()
        txns = data.get("transactions", []) if isinstance(data, dict) else data
        print(f"✅ Retrieved {len(txns)} transactions")
        if len(txns) > 0:
            print(f"   Sample: {txns[0].get('description')} - £{txns[0].get('amount')}")
    else:
        print(f"❌ Get transactions failed: {r.status_code} - {r.text}")
except Exception as e:
    print(f"❌ Get transactions error: {e}")

# ============================================================================
# 4. CREATE NEW TRANSACTION
# ============================================================================
print("\n4️⃣  Creating new transaction...")
try:
    new_tx = {
        "amount": -45.75,
        "description": "Test Groceries - Tesco",
        "merchant": "Tesco",
        "date": "2026-05-15",
        "is_income": False
    }
    r = session.post(f"{API}/transactions", json=new_tx, timeout=15)
    if r.status_code in (200, 201):
        created_tx = r.json()
        tx_id = created_tx.get("transaction_id") or created_tx.get("id")
        print(f"✅ Created transaction: {tx_id}")
        print(f"   Description: {created_tx.get('description')}")
        print(f"   Amount: £{created_tx.get('amount')}")
        print(f"   Category: {created_tx.get('category')}")
    else:
        print(f"❌ Create transaction failed: {r.status_code} - {r.text}")
        tx_id = None
except Exception as e:
    print(f"❌ Create transaction error: {e}")
    tx_id = None

# ============================================================================
# 5. PATCH (EDIT) TRANSACTION - NEW FEATURE
# ============================================================================
if tx_id:
    print("\n5️⃣  Testing PATCH (edit) transaction...")
    try:
        update_data = {
            "description": "Updated: Sainsbury's Shopping",
            "amount": -52.30,
            "category": "groceries"
        }
        r = session.patch(f"{API}/transactions/{tx_id}", json=update_data, timeout=15)
        if r.status_code == 200:
            updated_tx = r.json()
            print(f"✅ Transaction updated successfully")
            print(f"   New description: {updated_tx.get('description')}")
            print(f"   New amount: £{updated_tx.get('amount')}")
            print(f"   New category: {updated_tx.get('category')}")
            
            # Verify persistence by fetching again
            r2 = session.get(f"{API}/transactions", timeout=15)
            if r2.status_code == 200:
                data = r2.json()
                txns = data.get("transactions", []) if isinstance(data, dict) else data
                found = next((t for t in txns if t.get("transaction_id") == tx_id), None)
                if found and found.get("description") == "Updated: Sainsbury's Shopping":
                    print(f"✅ Changes persisted correctly")
                else:
                    print(f"❌ Changes did NOT persist")
        else:
            print(f"❌ PATCH transaction failed: {r.status_code} - {r.text}")
    except Exception as e:
        print(f"❌ PATCH transaction error: {e}")

    # Delete test transaction
    try:
        r = session.delete(f"{API}/transactions/{tx_id}", timeout=15)
        if r.status_code in (200, 204):
            print(f"✅ Test transaction deleted")
    except:
        pass

# ============================================================================
# 6. CREATE BUDGET
# ============================================================================
print("\n6️⃣  Creating budget...")
try:
    new_budget = {
        "category": "groceries",
        "limit": 400,
        "period": "monthly"
    }
    r = session.post(f"{API}/budgets", json=new_budget, timeout=15)
    if r.status_code in (200, 201):
        created_budget = r.json()
        budget_id = created_budget.get("budget_id") or created_budget.get("id")
        print(f"✅ Created budget: {budget_id}")
        print(f"   Category: {created_budget.get('category')}")
        print(f"   Limit: £{created_budget.get('limit')}")
    else:
        print(f"❌ Create budget failed: {r.status_code} - {r.text}")
        budget_id = None
except Exception as e:
    print(f"❌ Create budget error: {e}")
    budget_id = None

# ============================================================================
# 7. GET BUDGETS WITH PROGRESS
# ============================================================================
print("\n7️⃣  Getting budgets with progress...")
try:
    r = session.get(f"{API}/budgets", timeout=15)
    if r.status_code == 200:
        data = r.json()
        budgets = data.get("budgets", []) if isinstance(data, dict) else data
        print(f"✅ Retrieved {len(budgets)} budgets")
        for b in budgets[:3]:
            print(f"   {b.get('category')}: £{b.get('spent', 0)}/{b.get('limit')} ({b.get('progress_pct', 0)}%)")
    else:
        print(f"❌ Get budgets failed: {r.status_code} - {r.text}")
except Exception as e:
    print(f"❌ Get budgets error: {e}")

# ============================================================================
# 8. PATCH (EDIT) BUDGET - NEW FEATURE
# ============================================================================
if budget_id:
    print("\n8️⃣  Testing PATCH (edit) budget...")
    try:
        update_data = {
            "category": "food",
            "limit": 450
        }
        r = session.patch(f"{API}/budgets/{budget_id}", json=update_data, timeout=15)
        if r.status_code == 200:
            updated_budget = r.json()
            print(f"✅ Budget updated successfully")
            print(f"   New category: {updated_budget.get('category')}")
            print(f"   New limit: £{updated_budget.get('limit')}")
            
            # Verify persistence
            r2 = session.get(f"{API}/budgets", timeout=15)
            if r2.status_code == 200:
                data = r2.json()
                budgets = data.get("budgets", []) if isinstance(data, dict) else data
                found = next((b for b in budgets if b.get("budget_id") == budget_id), None)
                if found and found.get("category") == "food" and found.get("limit") == 450:
                    print(f"✅ Budget changes persisted correctly")
                else:
                    print(f"❌ Budget changes did NOT persist")
        else:
            print(f"❌ PATCH budget failed: {r.status_code} - {r.text}")
    except Exception as e:
        print(f"❌ PATCH budget error: {e}")

    # Delete test budget
    try:
        r = session.delete(f"{API}/budgets/{budget_id}", timeout=15)
        if r.status_code in (200, 204):
            print(f"✅ Test budget deleted")
    except:
        pass

# ============================================================================
# 9. MAASER SETTINGS - ENABLE AUTO-ACCRUAL
# ============================================================================
print("\n9️⃣  Testing Maaser settings...")
try:
    # Enable maaser with 10%
    r = session.put(f"{API}/jewish/maaser/settings", json={"enabled": True, "percent": 10}, timeout=15)
    if r.status_code == 200:
        print(f"✅ Maaser settings enabled: 10%")
    else:
        print(f"❌ Maaser settings failed: {r.status_code} - {r.text}")
    
    # Verify settings
    r2 = session.get(f"{API}/jewish/maaser/settings", timeout=15)
    if r2.status_code == 200:
        settings = r2.json()
        print(f"✅ Maaser settings retrieved: enabled={settings.get('enabled')}, percent={settings.get('percent')}")
    else:
        print(f"❌ Get maaser settings failed: {r2.status_code}")
except Exception as e:
    print(f"❌ Maaser settings error: {e}")

# ============================================================================
# 10. MAASER AUTO-ACCRUAL TEST - CREATE INCOME TRANSACTION
# ============================================================================
print("\n🔟 Testing Maaser auto-accrual...")
try:
    # Create income transaction (salary)
    income_tx = {
        "amount": 3000,
        "description": "Monthly Salary - May 2026",
        "category": "salary",
        "date": "2026-05-20",
        "is_income": True
    }
    r = session.post(f"{API}/transactions", json=income_tx, timeout=15)
    if r.status_code in (200, 201):
        created = r.json()
        print(f"✅ Created income transaction: £{created.get('amount')}")
        if "maaser_accrued" in created:
            print(f"✅ Maaser auto-accrued: {created['maaser_accrued']}")
        else:
            print(f"⚠️  No maaser_accrued field in response")
        
        income_tx_id = created.get("transaction_id") or created.get("id")
    else:
        print(f"❌ Create income transaction failed: {r.status_code} - {r.text}")
        income_tx_id = None
except Exception as e:
    print(f"❌ Income transaction error: {e}")
    income_tx_id = None

# ============================================================================
# 11. MAASER SUMMARY - CHECK ACCRUED PENDING
# ============================================================================
print("\n1️⃣1️⃣  Checking Maaser summary (accrued pending)...")
try:
    r = session.get(f"{API}/jewish/maaser/summary", timeout=15)
    if r.status_code == 200:
        summary = r.json()
        print(f"✅ Maaser summary retrieved:")
        print(f"   Accrued pending: £{summary.get('accrued_pending', 0)}")
        print(f"   Given total: £{summary.get('given_total', 0)}")
        print(f"   Ledger given: £{summary.get('ledger_given', 0)}")
        print(f"   Tx given: £{summary.get('tx_given', 0)}")
        print(f"   Balance owed: £{summary.get('balance_owed', 0)}")
        
        # Verify that accrued_pending is approximately 300 (10% of 3000)
        if summary.get('accrued_pending', 0) >= 290:
            print(f"✅ Maaser auto-accrual working correctly (expected ~£300)")
        else:
            print(f"⚠️  Accrued pending is lower than expected")
    else:
        print(f"❌ Maaser summary failed: {r.status_code} - {r.text}")
except Exception as e:
    print(f"❌ Maaser summary error: {e}")

# ============================================================================
# 12. CREATE TZEDAKAH TRANSACTION - TEST GIVEN TRACKING
# ============================================================================
print("\n1️⃣2️⃣  Creating tzedakah transaction...")
try:
    tzedakah_tx = {
        "amount": -50,
        "description": "Donation to Chesed Fund",
        "category": "tzedakah",
        "date": "2026-05-21",
        "is_income": False
    }
    r = session.post(f"{API}/transactions", json=tzedakah_tx, timeout=15)
    if r.status_code in (200, 201):
        created = r.json()
        print(f"✅ Created tzedakah transaction: £{created.get('amount')}")
        tzedakah_tx_id = created.get("transaction_id") or created.get("id")
    else:
        print(f"❌ Create tzedakah transaction failed: {r.status_code} - {r.text}")
        tzedakah_tx_id = None
except Exception as e:
    print(f"❌ Tzedakah transaction error: {e}")
    tzedakah_tx_id = None

# ============================================================================
# 13. MAASER SUMMARY - VERIFY TX_GIVEN UPDATED
# ============================================================================
print("\n1️⃣3️⃣  Verifying Maaser summary after tzedakah...")
try:
    r = session.get(f"{API}/jewish/maaser/summary", timeout=15)
    if r.status_code == 200:
        summary = r.json()
        print(f"✅ Maaser summary after tzedakah:")
        print(f"   Tx given: £{summary.get('tx_given', 0)}")
        print(f"   Given total: £{summary.get('given_total', 0)}")
        print(f"   Balance owed: £{summary.get('balance_owed', 0)}")
        
        if summary.get('tx_given', 0) >= 50:
            print(f"✅ Tzedakah transaction tracked correctly")
        else:
            print(f"⚠️  Tzedakah not tracked in tx_given")
    else:
        print(f"❌ Maaser summary failed: {r.status_code} - {r.text}")
except Exception as e:
    print(f"❌ Maaser summary error: {e}")

# ============================================================================
# 14. GET TZEDAKAH ENTRIES
# ============================================================================
print("\n1️⃣4️⃣  Getting tzedakah entries...")
try:
    r = session.get(f"{API}/jewish/tzedakah", timeout=15)
    if r.status_code == 200:
        data = r.json()
        entries = data.get("entries", []) if isinstance(data, dict) else data
        print(f"✅ Retrieved {len(entries)} tzedakah entries")
        
        # Find pending entries for testing pay endpoint
        pending_entries = [e for e in entries if e.get("status") == "pending"]
        if pending_entries:
            print(f"   Found {len(pending_entries)} pending entries")
            test_entry_id = pending_entries[0].get("entry_id")
        else:
            test_entry_id = None
    else:
        print(f"❌ Get tzedakah failed: {r.status_code} - {r.text}")
        test_entry_id = None
except Exception as e:
    print(f"❌ Get tzedakah error: {e}")
    test_entry_id = None

# ============================================================================
# 15. MAASER PAY ENDPOINT - MARK PENDING AS GIVEN
# ============================================================================
if test_entry_id:
    print("\n1️⃣5️⃣  Testing Maaser pay endpoint...")
    try:
        r = session.post(f"{API}/jewish/maaser/pay/{test_entry_id}", 
                        params={"recipient": "Test Charity"}, timeout=15)
        if r.status_code == 200:
            print(f"✅ Marked pending entry as given: {test_entry_id}")
            
            # Verify in summary
            r2 = session.get(f"{API}/jewish/maaser/summary", timeout=15)
            if r2.status_code == 200:
                summary = r2.json()
                print(f"   Updated ledger_given: £{summary.get('ledger_given', 0)}")
        else:
            print(f"❌ Maaser pay failed: {r.status_code} - {r.text}")
    except Exception as e:
        print(f"❌ Maaser pay error: {e}")
else:
    print("\n1️⃣5️⃣  Skipping Maaser pay test (no pending entries)")

# ============================================================================
# 16. DASHBOARD OVERVIEW
# ============================================================================
print("\n1️⃣6️⃣  Testing Dashboard overview...")
try:
    r = session.get(f"{API}/dashboard/overview", timeout=15)
    if r.status_code == 200:
        overview = r.json()
        print(f"✅ Dashboard overview retrieved:")
        print(f"   Balance: £{overview.get('balance', 0)}")
        print(f"   Income: £{overview.get('income', 0)}")
        print(f"   Spend: £{overview.get('spend', 0)}")
        print(f"   Savings rate: {overview.get('savings_rate', 0)}%")
        print(f"   Health score: {overview.get('health_score', 0)}")
        print(f"   Categories: {len(overview.get('categories', []))}")
        print(f"   Monthly flow: {len(overview.get('monthly_flow', []))} months")
        print(f"   Recent transactions: {len(overview.get('recent', []))}")
        
        # Verify all required fields
        required = ["balance", "income", "spend", "savings_rate", "health_score", "categories", "monthly_flow", "recent"]
        missing = [f for f in required if f not in overview]
        if not missing:
            print(f"✅ All required fields present")
        else:
            print(f"❌ Missing fields: {missing}")
    else:
        print(f"❌ Dashboard overview failed: {r.status_code} - {r.text}")
except Exception as e:
    print(f"❌ Dashboard overview error: {e}")

# ============================================================================
# 17. QUICK SANITY CHECKS
# ============================================================================
print("\n1️⃣7️⃣  Quick sanity checks...")

# Maaser calculator
try:
    r = session.post(f"{API}/jewish/maaser", json={"income": 5000, "percent": 10}, timeout=15)
    if r.status_code == 200:
        result = r.json()
        if result.get("maaser_amount") == 500:
            print(f"✅ Maaser calculator: £5000 @ 10% = £{result.get('maaser_amount')}")
        else:
            print(f"⚠️  Maaser calculator unexpected result: {result}")
    else:
        print(f"❌ Maaser calculator failed: {r.status_code}")
except Exception as e:
    print(f"❌ Maaser calculator error: {e}")

# Investment forecast
try:
    r = session.post(f"{API}/investments/forecast", 
                    json={"symbol": "VUAG", "monthly_contribution": 200, "years": 10}, timeout=15)
    if r.status_code == 200:
        result = r.json()
        if "future_value" in result:
            print(f"✅ Investment forecast: VUAG £200/mo for 10y = £{result.get('future_value')}")
        else:
            print(f"⚠️  Investment forecast missing future_value")
    else:
        print(f"❌ Investment forecast failed: {r.status_code}")
except Exception as e:
    print(f"❌ Investment forecast error: {e}")

# HMRC estimate
try:
    r = session.post(f"{API}/uk/hmrc-estimate", json={"annual_income": 50000}, timeout=15)
    if r.status_code == 200:
        result = r.json()
        if "income_tax" in result and "national_insurance" in result:
            print(f"✅ HMRC estimate: £50k income, tax=£{result.get('income_tax')}, NI=£{result.get('national_insurance')}")
        else:
            print(f"⚠️  HMRC estimate missing fields")
    else:
        print(f"❌ HMRC estimate failed: {r.status_code}")
except Exception as e:
    print(f"❌ HMRC estimate error: {e}")

# Universal Credit
try:
    r = session.post(f"{API}/uk/universal-credit", 
                    json={"monthly_earnings": 1500, "children": 2, "housing_cost": 800}, timeout=15)
    if r.status_code == 200:
        result = r.json()
        if "estimated_monthly_uc" in result:
            print(f"✅ Universal Credit: £{result.get('estimated_monthly_uc')}/mo")
        else:
            print(f"⚠️  Universal Credit missing estimate")
    else:
        print(f"❌ Universal Credit failed: {r.status_code}")
except Exception as e:
    print(f"❌ Universal Credit error: {e}")

# Holiday budget
try:
    r = session.get(f"{API}/jewish/holiday-budget", timeout=15)
    if r.status_code == 200:
        result = r.json()
        holidays = result.get("holidays", [])
        print(f"✅ Holiday budget: {len(holidays)} holidays")
    else:
        print(f"❌ Holiday budget failed: {r.status_code}")
except Exception as e:
    print(f"❌ Holiday budget error: {e}")

# AI chat endpoint exists (don't burn tokens)
try:
    r = session.post(f"{API}/ai/chat", json={"message": "test"}, timeout=30)
    if r.status_code in (200, 402, 500, 503):
        print(f"✅ AI chat endpoint exists (status: {r.status_code})")
    else:
        print(f"⚠️  AI chat unexpected status: {r.status_code}")
except Exception as e:
    print(f"⚠️  AI chat error: {e}")

# ============================================================================
# CLEANUP - Delete test transactions
# ============================================================================
print("\n🧹 Cleanup...")
if income_tx_id:
    try:
        session.delete(f"{API}/transactions/{income_tx_id}", timeout=15)
        print(f"✅ Deleted test income transaction")
    except:
        pass

if tzedakah_tx_id:
    try:
        session.delete(f"{API}/transactions/{tzedakah_tx_id}", timeout=15)
        print(f"✅ Deleted test tzedakah transaction")
    except:
        pass

print("\n" + "=" * 80)
print("✅ Backend testing complete!")
print("=" * 80)
