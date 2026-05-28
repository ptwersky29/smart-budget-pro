"""Regression tests for pure bank-sync helpers."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bank_sync_utils import (
    connection_error_message,
    is_reauth_error,
    parse_import_from_date,
    transaction_sync_id,
)


def test_parse_import_from_date_normalizes_iso_date():
    assert parse_import_from_date("2026-05-28") == "2026-05-28"


def test_parse_import_from_date_rejects_invalid_values():
    try:
        parse_import_from_date("28/05/2026")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for invalid date input")


def test_reauth_error_classification_is_broad_but_practical():
    assert is_reauth_error(RuntimeError("401 unauthorized"))
    assert is_reauth_error(RuntimeError("Refresh token expired"))
    assert not is_reauth_error(RuntimeError("temporary upstream timeout"))


def test_connection_error_message_truncates_long_errors():
    message = connection_error_message(RuntimeError("x" * 600), max_len=50)
    assert len(message) == 50
    assert message == "x" * 50


def test_transaction_sync_id_is_stable_for_same_inputs():
    tx = {"transaction_id": "abc123"}
    first = transaction_sync_id("conn_1", "acc_1", tx, "2026-05-28T00:00:00Z", "Tesco", -10.5)
    second = transaction_sync_id("conn_1", "acc_1", tx, "2026-05-28T00:00:00Z", "Tesco", -10.5)
    third = transaction_sync_id("conn_1", "acc_1", tx, "2026-05-28T00:00:00Z", "Tesco", -11.5)
    assert first == second
    assert first != third
    assert first.startswith("tl_")
