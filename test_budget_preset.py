"""
Static test for budget pre-setting implementation (no env vars needed)
"""
import re
from pathlib import Path

def test_budget_preset():
    """Verify budget seeding code exists in the right places"""
    print("=" * 60)
    print("Testing Budget Pre-Setting Implementation")
    print("=" * 60)
    
    base_path = Path(__file__).parent / "backend"
    budget_file = base_path / "budget_system.py"
    auth_file = base_path / "auth.py"
    
    success = True
    
    # Test 1: Check budget_system.py for DEFAULT_MONTHLY_BUDGETS
    print("\n[TEST 1] Checking DEFAULT_MONTHLY_BUDGETS in budget_system.py...")
    with open(budget_file, 'r') as f:
        budget_content = f.read()
    
    if "DEFAULT_MONTHLY_BUDGETS = {" in budget_content:
        print("✅ DEFAULT_MONTHLY_BUDGETS dictionary found")
    else:
        print("❌ DEFAULT_MONTHLY_BUDGETS dictionary not found")
        success = False
    
    # Test 2: Count categories
    print("\n[TEST 2] Counting budget categories...")
    # Find the DEFAULT_MONTHLY_BUDGETS section specifically
    budget_start = budget_content.find("DEFAULT_MONTHLY_BUDGETS = {")
    budget_end = budget_content.find("}", budget_start) + 1
    budget_dict_str = budget_content[budget_start:budget_end]
    
    categories = re.findall(r'"(\w+)":\s*(\d+)', budget_dict_str)
    print(f"   Found {len(categories)} categories")
    if len(categories) == 22:
        print("✅ Correct number of categories (22)")
    else:
        print(f"❌ Expected 22 categories, found {len(categories)}")
        success = False
    
    # Test 3: Display categories and totals
    print("\n[TEST 3] Budget breakdown:")
    print("-" * 60)
    total = 0
    category_list = []
    for cat, amount in categories:
        amount = int(amount)
        total += amount
        category_list.append((cat, amount))
    
    # Sort by amount descending
    category_list.sort(key=lambda x: x[1], reverse=True)
    for cat, amount in category_list:
        pct = (amount / total) * 100 if total > 0 else 0
        print(f"  {cat:20} £{amount:3} ({pct:5.1f}%)")
    
    print("-" * 60)
    print(f"  {'TOTAL':20} £{total:3} (100.0%)")
    
    if total == 1810:
        print("\n✅ Total budget correct (£1,810)")
    else:
        print(f"\n❌ Expected total £1,810, got £{total}")
        success = False
    
    # Test 4: Check seed function exists
    print("\n[TEST 4] Checking seed function in budget_system.py...")
    if "async def seed_default_budgets_for_user" in budget_content:
        print("✅ seed_default_budgets_for_user function found")
        
        # Check function has required components
        checks = [
            ("BudgetOccasion creation", "BudgetOccasion("),
            ("session.flush()", "await session.flush()"),
            ("BudgetOccasionCategory", "BudgetOccasionCategory("),
            ("Error handling", "except Exception"),
            ("Logging", "logger."),
        ]
        
        func_start = budget_content.find("async def seed_default_budgets_for_user")
        func_end = budget_content.find("\n\n# ── Pydantic models", func_start)
        func_content = budget_content[func_start:func_end]
        
        for check_name, check_str in checks:
            if check_str in func_content:
                print(f"   ✅ {check_name}")
            else:
                print(f"   ❌ Missing: {check_name}")
                success = False
    else:
        print("❌ seed_default_budgets_for_user function not found")
        success = False
    
    # Test 5: Check auth.py integration
    print("\n[TEST 5] Checking integration in auth.py...")
    with open(auth_file, 'r') as f:
        auth_content = f.read()
    
    checks = [
        ("Import statement", "from budget_system import seed_default_budgets_for_user"),
        ("Function call", "await seed_default_budgets_for_user(session, user_id)"),
        ("Error handling", "except Exception as e:"),
    ]
    
    for check_name, check_str in checks:
        if check_str in auth_content:
            print(f"   ✅ {check_name} found")
        else:
            print(f"   ❌ {check_name} not found")
            success = False
    
    # Test 6: Verify it's in the register function
    print("\n[TEST 6] Verifying placement in register function...")
    # Look for the specific pattern of register function
    if "async def register" in auth_content and "seed_default_budgets_for_user" in auth_content:
        # Check they're in the right order
        register_pos = auth_content.find("async def register")
        seed_pos = auth_content.find("seed_default_budgets_for_user")
        
        if register_pos < seed_pos:
            # Find the next function after register
            next_func_pos = auth_content.find("\nasync def ", register_pos + 1)
            if next_func_pos == -1:
                next_func_pos = len(auth_content)
            
            # Check if seed call is before the next function
            if seed_pos < next_func_pos:
                print("✅ Budget seeding is in register function")
            else:
                print("❌ Budget seeding appears after register function")
                success = False
        else:
            print("❌ Register function not found before seed_default_budgets_for_user")
            success = False
    else:
        print("❌ Could not find register function or seed function call")
        success = False
    
    # Summary
    print("\n" + "=" * 60)
    if success:
        print("✅ All checks passed!")
        print("=" * 60)
        print("\nImplementation Summary:")
        print(f"• 22 spending categories configured")
        print(f"• Total monthly budget: £{total}")
        print(f"• Budget seeding function created")
        print(f"• Integration with registration complete")
        print(f"• Error handling and logging included")
        print(f"\nNew users will automatically receive:")
        print(f"• 'Monthly Living' budget occasion")
        print(f"• 22 pre-configured spending categories")
        print(f"• Smart monthly budget limits")
        return True
    else:
        print("❌ Some checks failed")
        print("=" * 60)
        return False

if __name__ == "__main__":
    import sys
    result = test_budget_preset()
    sys.exit(0 if result else 1)
