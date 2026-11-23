"""Regression tests for Penni MCP tools; no live database is needed."""
import asyncio
import pytest
import mcp_server


def run(coro):
    return asyncio.run(coro)


def test_tools_exposed():
    names = {t.name for t in mcp_server.mcp._tool_manager.list_tools()}
    assert {"penni_get_accounts", "penni_get_categories", "penni_list_transactions",
            "penni_add_transaction", "penni_update_transaction",
            "penni_categorize_transaction", "penni_get_spending_report",
            "penni_get_budgets", "penni_record_transfer"} <= names
    assert not any("delete" in name for name in names)


def test_transaction_create_calls_existing_api(monkeypatch):
    seen = []
    async def fake_api(method, path, *, params=None, payload=None):
        seen.append((method, path, payload))
        return {"transaction_id": "tx_test"}
    monkeypatch.setattr(mcp_server, "_require_scope", lambda s: s)
    monkeypatch.setattr(mcp_server, "_api_request", fake_api)
    result = run(mcp_server.penni_add_transaction(
        45.25, "Groceries", "acct_test", "expense", category="grocery"
    ))
    assert result["transaction_id"] == "tx_test"
    method, path, payload = seen[0]
    assert (method, path) == ("POST", "/api/transactions")
    assert payload["amount"] == 45.25 and payload["is_income"] is False
    assert payload["category"] == "grocery"


def test_report_chart_data(monkeypatch):
    async def fake_api(method, path, *, params=None, payload=None):
        if "spending-by-category" in path:
            return {"categories": [{"name": "grocery", "value": 100}], "total": 100}
        if "spending-trends" in path:
            return {"trends": [{"month": "2026-11", "spend": 100, "income": 200}]}
        if "budget-comparison" in path:
            return {"comparisons": []}
        raise AssertionError(path)
    monkeypatch.setattr(mcp_server, "_require_scope", lambda s: s)
    monkeypatch.setattr(mcp_server, "_api_request", fake_api)
    result = run(mcp_server.penni_get_spending_report())
    assert result["spending_total"] == 100
    assert result["chart_data"]["category_breakdown"][0]["name"] == "grocery"


def test_read_only_scope_blocks_writes(monkeypatch):
    def check(scope):
        if scope == "penni:write":
            raise PermissionError("Read-only connection")
    monkeypatch.setattr(mcp_server, "_require_scope", check)
    with pytest.raises(PermissionError):
        run(mcp_server.penni_add_transaction(5, "Test", "acct_test", "expense"))


def test_invalid_financial_actions_rejected(monkeypatch):
    monkeypatch.setattr(mcp_server, "_require_scope", lambda s: s)
    with pytest.raises(ValueError):
        run(mcp_server.penni_add_transaction(-10, "Test", "acct_test", "expense"))
    with pytest.raises(ValueError):
        run(mcp_server.penni_record_transfer("acct1", "acct2", 0))
    with pytest.raises(ValueError):
        run(mcp_server.penni_bulk_categorize_transactions(["x"] * 51, ["grocery"] * 51))


def test_oauth_token_keys_are_hashed():
    token = "a-secret-token-which-must-not-be-persisted-in-plaintext"
    key = mcp_server.oauth_provider._record_key("access", token)
    assert key.startswith("access:")
    assert token not in key


def test_consent_html_escapes_user_content():
    response = mcp_server._consent_page(
        "request", "csrf", {"email": "<script>alert(1)</script>"}, ["penni:read"]
    )
    assert b"<script>alert(1)</script>" not in response.body
    assert b"&lt;script&gt;" in response.body
