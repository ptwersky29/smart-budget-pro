"""One-shot migration: add event_group_id, event_group_name, partial unique index to budgets table."""
import os
import sys
from pathlib import Path
from urllib.parse import unquote
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR DATABASE_URL not set in .env")
    sys.exit(1)

_rest, _dbname = DATABASE_URL.rsplit("/", 1)
_dbname = _dbname.split("?")[0]
_auth, _hostport = _rest.split("@")
_prefix, _userpass = _auth.split("://")
_scheme, _user, _pass = _prefix.split("+")[0], _userpass.split(":", 1)[0], unquote(_userpass.split(":", 1)[1])

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

with engine.connect() as conn:
    print("Adding event_group_id column...")
    conn.execute(text("ALTER TABLE budgets ADD COLUMN IF NOT EXISTS event_group_id VARCHAR(64)"))
    print("Adding event_group_name column...")
    conn.execute(text("ALTER TABLE budgets ADD COLUMN IF NOT EXISTS event_group_name VARCHAR(255)"))
    print("Creating index on event_group_id...")
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_budgets_event_group ON budgets(event_group_id)"))
    print("Creating partial unique index for everyday budgets (prevents duplicates)...")
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_everyday_user_cat ON budgets(user_id, category) WHERE budget_type = 'everyday'"))
    conn.commit()
    print("OK Migration complete!")

engine.dispose()
