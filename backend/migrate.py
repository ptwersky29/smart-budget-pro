"""One-shot: create all tables in Supabase (or any PostgreSQL)."""
import os
import sys
from pathlib import Path
from urllib.parse import unquote
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from sqlalchemy import create_engine, text
from db import Base

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR DATABASE_URL not set in .env")
    sys.exit(1)

# Decode URL-encoded password and build sync URL manually
# Format: postgresql+asyncpg://user:password@host:port/dbname
_rest, _dbname = DATABASE_URL.rsplit("/", 1)
_dbname = _dbname.split("?")[0]  # strip any query params
_auth, _hostport = _rest.split("@")
_prefix, _userpass = _auth.split("://")
_scheme, _user, _pass = _prefix.split("+")[0], _userpass.split(":", 1)[0], unquote(_userpass.split(":", 1)[1])

# Use the direct host (the pooler requires a specific setup)
sync_url = f"postgresql://{_user}:{_pass}@{_hostport}/{_dbname}?sslmode=require"

print(f"Connecting to: {sync_url[:50]}...")
engine = create_engine(sync_url, pool_pre_ping=True)

try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print(f"OK Connected to PostgreSQL: {result.scalar()}")
except Exception as e:
    print(f"FAIL Connection failed: {e}")
    sys.exit(1)

print("Creating all tables...")
Base.metadata.create_all(engine)
print("OK All tables created successfully!")
print()
print("Tables created:")
for table in Base.metadata.sorted_tables:
    print(f"  - {table.name}")

engine.dispose()
