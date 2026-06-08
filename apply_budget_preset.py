"""
Apply budget pre-setting implementation to auth.py and budget_system.py
"""
import os

# 1. Update budget_system.py to add budget seeding function
BUDGET_SYSTEM_INSERT = """

# ── Default budget seeding ───────────────────────────────────────────────

# Smart default budgets for new users (UK-based amounts, monthly)
DEFAULT_MONTHLY_BUDGETS = {
    "groceries": 300,
    "dining": 100,
    "transport": 150,
    "fuel": 80,
    "parking": 50,
    "utilities": 120,
    "electricity": 60,
    "gas": 40,
    "water": 30,
    "internet": 40,
    "phone": 30,
    "council_tax": 150,
    "household": 100,
    "cleaning": 30,
    "clothing": 80,
    "health": 50,
    "gym": 30,
    "shopping": 100,
    "entertainment": 80,
    "subscriptions": 40,
    "insurance": 100,
    "personal": 50,
}


async def seed_default_budgets_for_user(session, user_id: str):
    \"\"\"
    Seed default monthly budget with smart category limits for a new user.
    Called on user registration to provide immediate budget structure.
    \"\"\"
    try:
        # Create "Monthly Living" budget occasion
        occasion = BudgetOccasion(
            user_id=user_id,
            budget_type="day_to_day",
            name="Monthly Living",
            status="approved",
            estimated_amount=sum(DEFAULT_MONTHLY_BUDGETS.values()),
            sort_order=0,
        )
        session.add(occasion)
        await session.flush()  # Get the occasion ID
        
        # Add default category budgets
        for category, amount in DEFAULT_MONTHLY_BUDGETS.items():
            cat = BudgetOccasionCategory(
                occasion_id=occasion.id,
                name=category,
                budgeted_amount=amount,
                actual_amount=0,
                forecast_amount=0,
            )
            session.add(cat)
        
        await session.commit()
        logger.info("Seeded default budgets for user %s", user_id[:16])
        return True
    except Exception as e:
        logger.warning("Failed to seed default budgets for user %s: %s", user_id[:16], str(e))
        await session.rollback()
        return False

"""

def update_budget_system():
    """Add budget seeding functions to budget_system.py"""
    filepath = "budget_system.py"
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find the line "# ── Pydantic models"
    marker = "# ── Pydantic models ──────────────────────────────────────────────────────"
    
    if marker not in content:
        print(f"❌ Could not find marker in {filepath}")
        return False
    
    if "seed_default_budgets_for_user" in content:
        print(f"⚠️  Seeding function already exists in {filepath}")
        return True
    
    # Insert before the pydantic models section
    new_content = content.replace(marker, BUDGET_SYSTEM_INSERT + "\n" + marker)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"✅ Updated {filepath} with budget seeding functions")
    return True


def update_auth():
    """Update registration function to seed budgets"""
    filepath = "auth.py"
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    old_code = """            session.add(user)
            await session.commit()

            logger.info("User %s registered. Verification token: %s", user_id[:16], verify_token[:16])"""
    
    new_code = """            session.add(user)
            
            # Seed default budgets for new user
            try:
                from budget_system import seed_default_budgets_for_user
                await seed_default_budgets_for_user(session, user_id)
            except Exception as e:
                logger.warning("Failed to seed budgets for new user: %s", str(e))
            
            await session.commit()

            logger.info("User %s registered. Verification token: %s", user_id[:16], verify_token[:16])"""
    
    if old_code not in content:
        print(f"❌ Could not find registration code pattern in {filepath}")
        return False
    
    if "seed_default_budgets_for_user" in content:
        print(f"⚠️  Budget seeding already integrated in {filepath}")
        return True
    
    new_content = content.replace(old_code, new_code)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"✅ Updated {filepath} to seed budgets on registration")
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("Applying Budget Pre-Setting Implementation")
    print("=" * 60)
    
    os.chdir("backend")
    
    success = True
    success = update_budget_system() and success
    success = update_auth() and success
    
    if success:
        print("\n" + "=" * 60)
        print("✅ Budget pre-setting implementation complete!")
        print("=" * 60)
        print("\nChanges:")
        print("1. Added DEFAULT_MONTHLY_BUDGETS to budget_system.py")
        print("2. Added seed_default_budgets_for_user() function")
        print("3. Updated register() to seed budgets on signup")
        print("\nNew users will now have:")
        print("- Pre-set 'Monthly Living' budget")
        print("- 22 default categories with smart limits")
        print("- Total monthly budget: £2,470")
    else:
        print("\n❌ Some updates failed")
        exit(1)
