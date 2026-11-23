"""Regression tests for Neon quota handling on Render startup."""

import asyncio
from unittest.mock import AsyncMock

import pytest

import server


def test_quota_detection_ignores_unrelated_database_errors():
    assert server._is_neon_quota_error(
        RuntimeError("Your account or project has exceeded the quota.")
    )
    assert server._is_neon_quota_error(
        RuntimeError("asyncpg.exceptions.InsufficientResourcesError")
    )
    assert not server._is_neon_quota_error(RuntimeError("relation users does not exist"))


@pytest.mark.asyncio
async def test_quota_blocked_startup_is_degraded_not_crashed(monkeypatch):
    monkeypatch.setattr(
        server,
        "create_tables",
        AsyncMock(side_effect=RuntimeError("exceeded the quota")),
    )
    # A quota rejection must not start workers or require an active database.
    try:
        await server.startup()
        assert server.app.state.database_ready is False
        recovery = server.app.state.database_recovery_task
        assert not recovery.done()
        health = await server.health()
        assert health["status"] == "degraded"
    finally:
        recovery = getattr(server.app.state, "database_recovery_task", None)
        if recovery:
            recovery.cancel()
            with pytest.raises(asyncio.CancelledError):
                await recovery
            delattr(server.app.state, "database_recovery_task")


@pytest.mark.asyncio
async def test_non_quota_startup_failure_is_not_hidden(monkeypatch):
    monkeypatch.setattr(
        server,
        "create_tables",
        AsyncMock(side_effect=RuntimeError("migration schema mismatch")),
    )
    with pytest.raises(RuntimeError, match="migration schema mismatch"):
        await server.startup()
