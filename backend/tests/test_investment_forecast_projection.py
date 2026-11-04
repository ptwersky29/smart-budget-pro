"""Investment forecast financial correctness: independent monthly recurrence."""
import pytest
from investments import calculate_projection


def expected_balance(principal, monthly, annual_rate, months):
    growth = (1 + annual_rate / 100) ** (1 / 12)
    value = principal
    for _ in range(months):
        value = value * growth + monthly
    return round(value, 2)


@pytest.mark.parametrize("years", [0, 1, 20, 50])
def test_zero_rate_is_exact_contributions(years):
    rows = calculate_projection(5000, 500, 0, years)
    assert len(rows) == years + 1
    assert rows[-1]["value"] == 5000 + 500 * 12 * years
    assert rows[-1]["contributed"] == 5000 + 500 * 12 * years


def test_positive_rate_never_drops_below_contributions():
    rows = calculate_projection(5000, 500, 7, 20)
    assert rows[-1]["contributed"] == 125000
    assert rows[-1]["value"] == expected_balance(5000, 500, 7, 240)
    assert rows[-1]["value"] > rows[-1]["contributed"]
    assert all(point["value"] >= point["contributed"] for point in rows)


def test_negative_rate_and_zero_deposits():
    rows = calculate_projection(1000, 0, -10, 10)
    assert rows[-1]["value"] == pytest.approx(round(1000 * 0.9 ** 10, 2), abs=0.01)
    assert rows[-1]["value"] < rows[-1]["contributed"]


def test_zero_principal_and_single_year_monthly_deposits():
    rows = calculate_projection(0, 100, 5, 1)
    assert rows[0] == {"year": 0, "value": 0, "contributed": 0}
    assert rows[-1]["contributed"] == 1200
    assert rows[-1]["value"] == expected_balance(0, 100, 5, 12)


@pytest.mark.parametrize("rate", [-100, -120])
def test_impossible_annual_returns_rejected(rate):
    with pytest.raises(ValueError):
        calculate_projection(1000, 100, rate, 1)


def test_end_of_month_deposit_timing():
    rows = calculate_projection(0, 100, 12, 1)
    monthly_rate = 1.12 ** (1 / 12) - 1
    independent = round(100 * sum((1 + monthly_rate) ** k for k in range(12)), 2)
    assert rows[-1]["value"] == independent
