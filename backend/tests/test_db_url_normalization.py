from db import _normalize_async_database_url


def test_normalizes_postgres_url_for_asyncpg():
    assert (
        _normalize_async_database_url("postgresql://user:pass@host:5432/postgres")
        == "postgresql+asyncpg://user:pass@host:5432/postgres"
    )


def test_normalizes_legacy_postgres_url_for_asyncpg():
    assert (
        _normalize_async_database_url("postgres://user:pass@host:5432/postgres")
        == "postgresql+asyncpg://user:pass@host:5432/postgres"
    )


def test_keeps_existing_asyncpg_url_unchanged():
    url = "postgresql+asyncpg://user:pass@host:5432/postgres"
    assert _normalize_async_database_url(url) == url


def test_keeps_sqlite_url_unchanged():
    url = "sqlite+aiosqlite:///financeai.db"
    assert _normalize_async_database_url(url) == url
