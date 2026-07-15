import pytest

from runtime_config import LOCAL_DATABASE_URL, is_production_environment, resolve_database_url


def test_configured_database_url_is_used():
    assert resolve_database_url({"DATABASE_URL": "postgresql+asyncpg://db/app"}) == "postgresql+asyncpg://db/app"


def test_local_development_uses_sqlite_fallback():
    assert resolve_database_url({"ENVIRONMENT": "development"}) == LOCAL_DATABASE_URL


@pytest.mark.parametrize("env", [{"ENVIRONMENT": "production"}, {"RENDER": "true"}])
def test_production_requires_database_url(env):
    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        resolve_database_url(env)


def test_render_is_recognized_as_production():
    assert is_production_environment({"RENDER": "true"})
