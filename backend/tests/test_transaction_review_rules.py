from maaser import _is_income_tx


def test_maaser_counts_approved_income():
    assert _is_income_tx(
        {
            "amount": 100,
            "is_income": True,
            "approval_status": "approved",
            "exclude_from_maaser": False,
        }
    )


def test_maaser_excludes_unapproved_income():
    assert not _is_income_tx(
        {
            "amount": 100,
            "is_income": True,
            "approval_status": "unapproved",
            "exclude_from_maaser": False,
        }
    )


def test_maaser_excludes_transfer_pair_income():
    assert not _is_income_tx(
        {
            "amount": 100,
            "is_income": True,
            "approval_status": "approved",
            "transfer_pair_id": "trp_123",
        }
    )
