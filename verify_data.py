#!/usr/bin/env python3
"""
Quick script to verify data exists in Neon database
"""
import asyncio
import os
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Neon database URL
DATABASE_URL = "postgresql+asyncpg://neondb_owner:npg_DEn4SXe1YkWV@ep-silent-water-ab6f94vy-pooler.eu-west-2.aws.neon.tech/neondb"

async def check_data():
    print("🔍 Connecting to Neon database...")
    engine = create_async_engine(DATABASE_URL, echo=False)
    
    async with engine.begin() as conn:
        print("\n📊 Checking database contents:\n")
        
        # Check users
        result = await conn.execute(text("SELECT COUNT(*) as count FROM users"))
        user_count = result.scalar()
        print(f"✅ Users: {user_count}")
        
        # Check transactions
        result = await conn.execute(text("SELECT COUNT(*) as count FROM transactions"))
        txn_count = result.scalar()
        print(f"✅ Transactions: {txn_count}")
        
        # Check budgets
        result = await conn.execute(text("SELECT COUNT(*) as count FROM budgets"))
        budget_count = result.scalar()
        print(f"✅ Budgets: {budget_count}")
        
        # Check bank connections
        result = await conn.execute(text("SELECT COUNT(*) as count FROM bank_connections"))
        bank_count = result.scalar()
        print(f"✅ Bank Connections: {bank_count}")
        
        # Check specific user data
        result = await conn.execute(
            text("SELECT user_id, email, name, tier, is_admin FROM users WHERE email = :email"),
            {"email": "ptwersky29@gmail.com"}
        )
        user = result.fetchone()
        if user:
            print(f"\n👤 Your account found:")
            print(f"   User ID: {user[0]}")
            print(f"   Email: {user[1]}")
            print(f"   Name: {user[2]}")
            print(f"   Tier: {user[3]}")
            print(f"   Admin: {user[4]}")
            
            # Check your transactions
            result = await conn.execute(
                text("SELECT COUNT(*) as count FROM transactions WHERE user_id = :user_id"),
                {"user_id": user[0]}
            )
            your_txn_count = result.scalar()
            print(f"   Your Transactions: {your_txn_count}")
        else:
            print("\n❌ Your account NOT found!")
        
        print("\n" + "="*50)
        if user_count > 0 and txn_count > 0:
            print("✅ DATA EXISTS IN NEON DATABASE!")
            print("⚠️  Backend needs to redeploy to connect to it")
        else:
            print("❌ No data found in database")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_data())
