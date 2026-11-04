"""Regression contract for current-month everyday budget comparison.

This endpoint is a read-only view; historical and event budgets must never be
presented as duplicate current-month categories in Analytics.
"""
from pathlib import Path


def test_budget_comparison_is_scoped_to_the_current_calendar_month():
    source = (Path(__file__).resolve().parents[1] / "finance_engine.py").read_text()
    block = source.split('    @router.get("/analytics/budget-comparison")', 1)[1]
    block = block.split('    @router.get("/analytics/period-comparison")', 1)[0]
    assert 'Budget.month == month_key' in block
    assert 'Budget.budget_type == "everyday"' in block
    assert 'date_from=month_start, date_to=next_month' in block
    assert '.order_by(Budget.category)' in block


def test_overbudget_remaining_and_percentage_not_artificially_capped():
    source = (Path(__file__).resolve().parents[1] / "finance_engine.py").read_text()
    block = source.split('    @router.get("/analytics/budget-comparison")', 1)[1]
    block = block.split('    @router.get("/analytics/period-comparison")', 1)[0]
    assert '"remaining": round(float(b.amount) - spent, 2)' in block
    assert 'spent / float(b.amount) * 100' in block
