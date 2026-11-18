"""Regression checks for background classification safety."""
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from classification_jobs import ClassifyBatchIn, _eligible, _snapshot
from db import Transaction


def sample(**changes):
    fields = dict(
        transaction_id="test-transaction", user_id="test-user",
        account_id="test-account", date=datetime.now(timezone.utc),
        description="TESCO STORES", merchant_name="Tesco", amount=-23.50,
        category="uncategorized", category_approval_status="unapproved",
        approval_status="unapproved", tx_type="expense", transfer_pair_id=None,
        parent_id=None, updated_at=None,
    )
    fields.update(changes)
    return Transaction(**fields)


def test_classification_checks_for_changes_before_applying_result():
    original = _snapshot(sample())
    assert original != _snapshot(sample(category="grocery"))
    assert original != _snapshot(sample(category_approval_status="approved"))
    assert original != _snapshot(sample(description="Other shop"))
    assert original != _snapshot(sample(amount=-24.5))
    assert original != _snapshot(sample(updated_at=datetime.now(timezone.utc)))


@pytest.mark.parametrize("fields", [
    {"tx_type": "transfer"}, {"transfer_pair_id": "paired"}, {"parent_id": "split"},
])
def test_transfers_and_split_children_are_ineligible(fields):
    assert not _eligible(sample(**fields))


def test_normal_transaction_is_eligible():
    assert _eligible(sample())


def test_classification_limits_work_size():
    ClassifyBatchIn(transaction_ids=["one"])
    with pytest.raises(ValidationError):
        ClassifyBatchIn(transaction_ids=[])
    with pytest.raises(ValidationError):
        ClassifyBatchIn(transaction_ids=[str(i) for i in range(201)])
