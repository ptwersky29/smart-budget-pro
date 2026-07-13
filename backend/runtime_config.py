"""Runtime configuration helpers with production-safe defaults."""

from __future__ import annotations

import os
from collections.abc import Mapping


LOCAL_DATABASE_URL = "sqlite+aiosqlite:///financeai.db"


def is_production_environment(environ: Mapping[str, str] | None = None) -> bool:
    env = environ if environ is not None else os.environ
    environment = env.get("ENVIRONMENT", "").strip().lower()
    return environment in {"production", "prod"} or env.get("RENDER", "").strip().lower() == "true"


def resolve_database_url(environ: Mapping[str, str] | None = None) -> str:
    """Return the configured database URL, failing closed in production."""
    env = environ if environ is not None else os.environ
    database_url = env.get("DATABASE_URL", "").strip()
    if database_url:
        return database_url
    if is_production_environment(env):
        raise RuntimeError(
            "DATABASE_URL is required in production. Configure it in the hosting provider before starting the API."
        )
    return LOCAL_DATABASE_URL
