"""HTTP/OAuth smoke tests for Penni's MCP connection without live database access."""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi import FastAPI

import mcp_server
from rate_limit import CsrfProtectionMiddleware


@pytest.mark.asyncio
async def test_mcp_discovery_and_anonymous_access_denied(monkeypatch):
    app = FastAPI()
    # Simulate the same browser CSRF protection used by the real Penni app.
    app.add_middleware(CsrfProtectionMiddleware)
    previous = mcp_server._parent_app
    mcp_server.install(app)
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="https://penni-mcp-test.invalid",
        ) as client:
            authorization = await client.get("/.well-known/oauth-authorization-server")
            assert authorization.status_code == 200
            metadata = authorization.json()
            assert metadata["authorization_endpoint"].endswith("/authorize")
            assert metadata["token_endpoint"].endswith("/token")
            assert "S256" in metadata["code_challenge_methods_supported"]

            resource = await client.get("/.well-known/oauth-protected-resource/mcp")
            assert resource.status_code == 200
            assert resource.json()["resource"].endswith("/mcp")

            anonymous = await client.post(
                "/mcp",
                json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                headers={
                    "Accept": "application/json, text/event-stream",
                    "MCP-Protocol-Version": "2025-06-18",
                },
            )
            assert anonymous.status_code == 401
    finally:
        monkeypatch.setattr(mcp_server, "_parent_app", previous)


@pytest.mark.asyncio
async def test_consent_requires_explicit_write_permission(monkeypatch):
    pending_id = "pending-smoke-test"
    client_id = "https://chatgpt.com/oauth/test/client.json"
    state = "oauth-state"
    callback = "https://chatgpt.com/connector_platform_oauth_redirect"
    records = {
        ("pending", pending_id): {
            "client_id": client_id,
            "params": {
                "state": state,
                "scopes": ["penni:read", "penni:write", "offline_access"],
                "code_challenge": "A" * 43,
                "redirect_uri": callback,
                "redirect_uri_provided_explicitly": True,
                "resource": f"{mcp_server._public_base_url()}/mcp",
            },
            "requested_scopes": ["penni:read", "penni:write", "offline_access"],
        },
    }

    async def fake_load(kind, key):
        return records.get((kind, key))

    async def fake_save(kind, key, payload, expires_at=None):
        records[(kind, key)] = payload

    async def fake_delete(kind, key):
        records.pop((kind, key), None)

    async def fake_user(request):
        return {"user_id": "test-user-123", "email": "tester@example.com"}

    monkeypatch.setattr(mcp_server.oauth_provider, "_load", fake_load)
    monkeypatch.setattr(mcp_server.oauth_provider, "_save", fake_save)
    monkeypatch.setattr(mcp_server.oauth_provider, "_delete", fake_delete)
    monkeypatch.setattr(mcp_server, "_current_penni_user", fake_user)

    app = FastAPI()
    previous = mcp_server._parent_app
    mcp_server.install(app)
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="https://penni-mcp-test.invalid",
        ) as client:
            consent = await client.get(
                "/oauth/consent", params={"request_id": pending_id}
            )
            assert consent.status_code == 200
            assert "tester@example.com" in consent.text
            assert "allow_write" in consent.text
            csrf = records[("pending", pending_id)]["csrf_token"]

            # Leave the optional write checkbox unchecked.
            submit = await client.post(
                "/oauth/consent",
                data={
                    "request_id": pending_id,
                    "csrf_token": csrf,
                    "decision": "allow",
                },
                follow_redirects=False,
            )
            assert submit.status_code == 303
            redirect = urlparse(submit.headers["location"])
            assert f"{redirect.scheme}://{redirect.netloc}{redirect.path}" == callback
            query = parse_qs(redirect.query)
            assert query["state"] == [state]
            code = records[("code", query["code"][0])]
            assert code["subject"] == "test-user-123"
            assert code["scopes"] == ["penni:read", "offline_access"]
            assert ("pending", pending_id) not in records
    finally:
        monkeypatch.setattr(mcp_server, "_parent_app", previous)
