"""Trading 212 historical activity is read-only and supports safe pagination."""
import pytest
from fastapi import HTTPException

from trading212_history import continuation_params, normalise_activity


def test_broker_history_cursor_accepts_relative_path_and_query():
    assert continuation_params(
        "transactions",
        "limit=20&cursor=abc-123&time=2026-11-11T00%3A00%3A00Z",
    ) == {"limit": "50", "cursor": "abc-123", "time": "2026-11-11T00:00:00Z"}
    assert continuation_params(
        "orders",
        "/api/v0/equity/history/orders?limit=20&cursor=12345",
    ) == {"limit": "50", "cursor": "12345"}


@pytest.mark.parametrize("token", [
    "https://unsafe.example/api/v0/equity/history/orders?cursor=1",
    "//unsafe.example/path?cursor=1",
    "/api/v0/equity/orders/market?cursor=1",
    "http://localhost/secrets",
    "limit=10&unexpected=some-value",
    "cursor=" + "A" * 2000,
])
def test_history_cursor_cannot_redirect_api_requests(token):
    with pytest.raises(HTTPException) as exc:
        continuation_params("orders", token)
    assert exc.value.status_code == 422


def test_cash_movement_records_keep_broker_provided_amount_and_date():
    row = normalise_activity("transactions", {
        "reference": "T1", "type": "DEPOSIT", "amount": 500.01,
        "currency": "GBP", "dateTime": "2026-11-10T12:03:00Z",
    })
    assert row["description"] == "Deposit"
    assert row["amount"] == 500.01
    assert row["date"] == "2026-11-10T12:03:00Z"


def test_historical_order_uses_filled_trade_information_not_invented_profit():
    row = normalise_activity("orders", {
        "order": {
            "id": 22, "side": "BUY", "ticker": "ETF_US_EQ",
            "instrument": {"name": "Index tracker", "ticker": "ETF_US_EQ"},
        },
        "fill": {
            "id": 44, "filledAt": "2026-11-15T12:00:00Z", "quantity": 3.5,
            "walletImpact": {"currency": "GBP", "netValue": 90.20},
        },
    })
    assert row["description"] == "Index tracker"
    assert row["type"] == "BUY"
    assert row["quantity"] == 3.5
    assert row["amount"] == 90.20


def test_missing_amount_is_never_displayed_as_zero():
    row = normalise_activity("orders", {"order": {"ticker": "ETF_US_EQ"}})
    assert row["amount"] is None
