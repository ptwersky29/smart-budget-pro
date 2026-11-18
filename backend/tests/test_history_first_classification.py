"""History-first categorisation: conservative reuse and AI fallback."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

import finance_engine
from db import Transaction
from historical_classification import evaluate_history


ACTIVE = {"grocery", "clothing_wife", "petrol_diesel", "taxi", "miscellaneous", "uncategorized"}


def old(description, category, *, merchant="Tesco", normalized="Tesco", amount=-21, approved=True):
    return Transaction(
        transaction_id=description + category,
        user_id="one", account_id="acc-1",
        date=datetime.now(timezone.utc), description=description,
        merchant_name=merchant, normalized_merchant=normalized,
        amount=amount, category=category,
        category_approval_status="approved" if approved else "unapproved",
        approval_status="approved", tx_type="expense",
    )


def suggestion(desc, rows, merchant="Tesco", normalized="Tesco", amount=-25):
    return evaluate_history(desc, merchant, normalized, amount, rows, ACTIVE)


def test_single_approved_exact_description_is_reused_without_ai():
    found, _ = suggestion("TESCO-AB123", [old("TESCO-AB123", "grocery")])
    assert found["category"] == "grocery"
    assert found["source"] == "history_exact"
    assert found["confidence"] >= 0.9


def test_unapproved_ai_prediction_does_not_teach_history():
    found, _ = suggestion("TESCO-AB123", [
        old("TESCO-AB123", "clothing_wife", approved=False),
    ])
    assert found is None


def test_conflicting_exact_description_requires_second_stage():
    found, detail = suggestion("TESCO-AB123", [
        old("TESCO-AB123", "grocery"),
        old("TESCO-AB123", "clothing_wife"),
    ])
    assert found is None
    assert "inconclusive" in detail


def test_repeated_consistent_specific_merchant_can_be_reused():
    rows = [
        old(f"ACME PETROL {i}", "petrol_diesel", merchant="Acme Fuel", normalized="Acme Fuel")
        for i in range(3)
    ]
    found, _ = suggestion("ACME PETROL NEW", rows, merchant="Acme Fuel", normalized="Acme Fuel")
    assert found["category"] == "petrol_diesel"
    assert found["source"] == "history_merchant"


def test_one_merchant_transaction_is_insufficient_for_auto_match():
    rows = [old("ACME PETROL OLD", "petrol_diesel", merchant="Acme Fuel", normalized="Acme Fuel")]
    found, _ = suggestion("ACME PETROL NEW", rows, merchant="Acme Fuel", normalized="Acme Fuel")
    assert found is None


def test_mixed_merchant_categories_do_not_auto_match():
    rows = [
        old("ACME 01", "petrol_diesel", merchant="Acme Fuel", normalized="Acme Fuel"),
        old("ACME 02", "grocery", merchant="Acme Fuel", normalized="Acme Fuel"),
        old("ACME 03", "petrol_diesel", merchant="Acme Fuel", normalized="Acme Fuel"),
    ]
    found, _ = suggestion("ACME 04", rows, merchant="Acme Fuel", normalized="Acme Fuel")
    assert found is None


def test_generic_multi_category_shops_do_not_use_merchant_only():
    rows = [old(f"TESCO SHOP {i}", "grocery") for i in range(8)]
    found, _ = suggestion("TESCO CLOTHES", rows)
    assert found is None


def test_income_does_not_inherit_expense_categories():
    rows = [old("ACME WEEKLY", "grocery", merchant="Acme", normalized="Acme", amount=-20)]
    found, _ = suggestion("ACME WEEKLY", rows, merchant="Acme", normalized="Acme", amount=30)
    assert found is None


@pytest.mark.asyncio
async def test_approved_history_returns_before_ai(monkeypatch):
    historical = AsyncMock(return_value=(
        {"category": "clothing_wife", "confidence": 0.96, "source": "history_exact", "reason": "Used before"},
        "Used before",
    ))
    llm = AsyncMock()
    monkeypatch.setattr("historical_classification.find_historical_category", historical)
    monkeypatch.setattr(finance_engine, "_active_category_names", AsyncMock(return_value=ACTIVE))
    monkeypatch.setattr(finance_engine, "call_llm", llm)
    results = await finance_engine._suggest_categories_for_tx(
        object(), "one", "CLOTHING PAYMENT", "Clothes Shop", -35,
        exclude_transaction_id="current-tx",
    )
    assert results[0]["category"] == "clothing_wife"
    llm.assert_not_called()
    assert historical.await_args.kwargs["exclude_transaction_id"] == "current-tx"


@pytest.mark.asyncio
async def test_inconclusive_history_calls_ai(monkeypatch):
    monkeypatch.setattr("historical_classification.find_historical_category", AsyncMock(
        return_value=(None, "Approved past matching transactions were inconclusive: grocery (1); clothing_wife (1)")
    ))
    monkeypatch.setattr(finance_engine, "_active_category_names", AsyncMock(return_value=ACTIVE))
    llm = AsyncMock(return_value=(
        '{"suggestions":[{"category":"clothing_wife","confidence":0.91,"reason":"Clothing purchase"}]}',
        "test", "test-model", 1, 1, 0.0,
    ))
    monkeypatch.setattr(finance_engine, "call_llm", llm)
    monkeypatch.setattr(finance_engine, "track_ai_usage", AsyncMock())
    result = await finance_engine._suggest_categories_for_tx(
        object(), "one", "PURCHASE AT CLOTHING SHOP", "Clothes", -35
    )
    assert result[0]["source"] == "ai"
    assert result[0]["category"] == "clothing_wife"
    assert "inconclusive" in llm.await_args.args[1]


@pytest.mark.asyncio
async def test_ai_invalid_category_is_never_accepted(monkeypatch):
    monkeypatch.setattr("historical_classification.find_historical_category", AsyncMock(
        return_value=(None, "No match")
    ))
    monkeypatch.setattr(finance_engine, "_active_category_names", AsyncMock(return_value=ACTIVE))
    monkeypatch.setattr(finance_engine, "call_llm", AsyncMock(return_value=(
        '{"suggestions":[{"category":"made_up_expense","confidence":0.99,"reason":"guess"}]}',
        "test", "test-model", 1, 1, 0.0,
    )))
    monkeypatch.setattr(finance_engine, "track_ai_usage", AsyncMock())
    result = await finance_engine._suggest_categories_for_tx(
        object(), "one", "UNRECOGNIZED PAYEE XYZ", "Unknown", -35
    )
    assert all(row["category"] != "made_up_expense" for row in result)
