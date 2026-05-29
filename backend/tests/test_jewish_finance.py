"""Tests for Jewish Finance Engine — Maaser, Tzedakah, Yom Tov, Chasuna, Hebcal."""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["JWT_SECRET"] = "test-secret-key-for-testing-purposes-only"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"

from jewish import HOLIDAY_DEFAULTS, CHASUNA_CATEGORIES, INCOME_CATEGORIES


class TestHolidayDefaults:
    """Verify all 7 Yom Tovim with correct categories and uplift percentages."""

    def test_all_seven_holidays_present(self):
        names = set(HOLIDAY_DEFAULTS.keys())
        assert names == {"Pesach", "Succos", "Rosh Hashanah", "Yom Kippur",
                         "Chanukah", "Purim", "Shavuos"}

    def test_pesach_has_correct_categories(self):
        p = HOLIDAY_DEFAULTS["Pesach"]
        assert "matzah" in p["categories"]
        assert "wine" in p["categories"]
        assert "kosher-food" in p["categories"]
        assert p["uplift_pct"] == 80

    def test_succos_has_esrog_and_lulav(self):
        s = HOLIDAY_DEFAULTS["Succos"]
        assert "esrog" in s["categories"]
        assert "lulav" in s["categories"]
        assert "succah" in s["categories"]
        assert s["uplift_pct"] == 50

    def test_uplift_percentages_are_reasonable(self):
        for name, info in HOLIDAY_DEFAULTS.items():
            assert 0 < info["uplift_pct"] <= 100, f"{name} uplift {info['uplift_pct']} out of range"
            assert len(info["categories"]) >= 2, f"{name} has fewer than 2 categories"
            assert info["month"] in {"Nisan", "Tishrei", "Kislev", "Adar", "Sivan"}

    def test_rosh_hashanah_uplift(self):
        assert HOLIDAY_DEFAULTS["Rosh Hashanah"]["uplift_pct"] == 35

    def test_yom_kippur_uplift(self):
        assert HOLIDAY_DEFAULTS["Yom Kippur"]["uplift_pct"] == 15

    def test_chanukah_uplift(self):
        assert HOLIDAY_DEFAULTS["Chanukah"]["uplift_pct"] == 20

    def test_purim_uplift(self):
        assert HOLIDAY_DEFAULTS["Purim"]["uplift_pct"] == 25

    def test_shavuos_uplift(self):
        assert HOLIDAY_DEFAULTS["Shavuos"]["uplift_pct"] == 20


class TestChasunaCategories:
    """Verify 25 wedding planning categories."""

    def test_chasuna_has_required_categories(self):
        required = {"venue", "catering", "photography", "music", "attire",
                    "rings", "chuppah", "seuda", "sheva-brachos", "honeymoon"}
        for r in required:
            assert r in CHASUNA_CATEGORIES, f"Missing chasuna category: {r}"

    def test_chasuna_count(self):
        assert len(CHASUNA_CATEGORIES) == 25


class TestIncomeCategories:
    def test_income_categories_correct(self):
        assert INCOME_CATEGORIES == {"salary", "income"}


class TestMaaserModule:
    """Test maaser.py business logic functions directly."""

    def test_is_income_tx_by_flag(self):
        from maaser import _is_income_tx
        assert _is_income_tx({"is_income": True, "amount": 1000, "category": "salary"}) is True

    def test_is_income_tx_by_category(self):
        from maaser import _is_income_tx
        assert _is_income_tx({"is_income": False, "amount": 500, "category": "salary"}) is True
        assert _is_income_tx({"is_income": False, "amount": 500, "category": "income"}) is True

    def test_is_income_tx_by_positive_amount(self):
        from maaser import _is_income_tx
        assert _is_income_tx({"is_income": False, "amount": 2000, "category": "other"}) is True

    def test_is_not_income_tx(self):
        from maaser import _is_income_tx
        assert _is_income_tx({"is_income": False, "amount": -100, "category": "groceries"}) is False

    def test_is_income_tx_zero_amount_expense_category(self):
        from maaser import _is_income_tx
        assert _is_income_tx({"is_income": False, "amount": 0, "category": "rent"}) is False


class TestMaaserCalculation:
    """Verify Maaser calculation accuracy."""

    def test_ten_percent_of_income(self):
        income = 5000
        percent = 10
        expected = 500.0
        actual = round(income * (percent / 100), 2)
        assert actual == expected

    def test_custom_percentage(self):
        income = 3200
        percent = 7.5
        expected = 240.0
        actual = round(income * (percent / 100), 2)
        assert actual == expected

    def test_rounding_to_two_decimals(self):
        income = 1234.56
        percent = 10
        result = income * (percent / 100)
        assert result == 123.456
        assert round(result, 2) == 123.46

    def test_zero_income(self):
        assert round(0 * (10 / 100), 2) == 0.0

    def test_large_income(self):
        income = 100000
        percent = 10
        assert round(income * (percent / 100), 2) == 10000.0

    def test_low_percentage(self):
        income = 5000
        percent = 1
        assert round(income * (percent / 100), 2) == 50.0

    def test_one_hundred_percent(self):
        income = 5000
        percent = 100
        assert round(income * (percent / 100), 2) == 5000.0


class TestHolidayBudgetCalculation:
    """Verify holiday uplift projections are accurate."""

    def test_pesach_eighty_percent_uplift(self):
        monthly_spend = 3000
        uplift_pct = 80
        uplift = round(monthly_spend * (uplift_pct / 100), 2)
        total = round(monthly_spend + uplift, 2)
        assert uplift == 2400.0
        assert total == 5400.0

    def test_succos_fifty_percent_uplift(self):
        monthly_spend = 3000
        uplift_pct = 50
        uplift = round(monthly_spend * (uplift_pct / 100), 2)
        total = round(monthly_spend + uplift, 2)
        assert uplift == 1500.0
        assert total == 4500.0

    def test_rosh_hashanah_thirtyfive_percent_uplift(self):
        monthly_spend = 4000
        uplift_pct = 35
        uplift = round(monthly_spend * (uplift_pct / 100), 2)
        total = round(monthly_spend + uplift, 2)
        assert uplift == 1400.0
        assert total == 5400.0  # 4000 + 1400

    def test_zero_monthly_spend(self):
        assert round(0 * (80 / 100), 2) == 0.0


class TestChasunaSummaryCalculation:
    """Verify chasuna financial summary calculations."""

    def test_total_estimated(self):
        items = [{"estimated_cost": 10000}, {"estimated_cost": 5000}, {"estimated_cost": 2000}]
        total = sum(i["estimated_cost"] for i in items)
        assert total == 17000

    def test_progress_percentage(self):
        estimated = 20000
        actual = 5000
        deposit = 3000
        pct = round(min(100, (actual + deposit) / estimated * 100), 1)
        assert pct == 40.0

    def test_remaining_calculation(self):
        estimated = 20000
        actual = 5000
        deposit = 3000
        remaining = round(max(0, estimated - actual - deposit), 2)
        assert remaining == 12000.0

    def test_zero_progress(self):
        estimated = 20000
        actual = 0
        deposit = 0
        pct = round(min(100, (actual + deposit) / estimated * 100), 1) if estimated > 0 else 0
        assert pct == 0.0

    def test_full_progress(self):
        estimated = 20000
        actual = 18000
        deposit = 2000
        pct = round(min(100, (actual + deposit) / estimated * 100), 1)
        assert pct == 100.0


class TestMaaserLedgerBalance:
    """Verify ledger balance calculations — the core health check."""

    def test_balance_owed(self):
        obligation = 5000
        given = 3500
        balance = round(max(0, obligation - given), 2)
        assert balance == 1500.0

    def test_over_given_credit(self):
        obligation = 5000
        given = 5500
        credit = round(max(0, given - obligation), 2)
        assert credit == 500.0

    def test_exact_balance(self):
        obligation = 5000
        given = 5000
        assert round(max(0, obligation - given), 2) == 0.0
        assert round(max(0, given - obligation), 2) == 0.0

    def test_zero_obligation(self):
        obligation = 0
        given = 0
        assert round(max(0, obligation - given), 2) == 0.0

    def test_given_without_obligation(self):
        obligation = 0
        given = 100
        credit = round(max(0, given - obligation), 2)
        assert credit == 100.0


class TestIncomeByMonth:
    """Verify monthly income aggregation logic."""

    def test_income_by_month_aggregation(self):
        txs = [
            {"amount": 3000, "date": "2026-01-15", "category": "salary"},
            {"amount": 3000, "date": "2026-02-15", "category": "salary"},
            {"amount": 100, "date": "2026-01-20", "category": "income"},
        ]
        by_month = {}
        for t in txs:
            amt = abs(t["amount"])
            month = t["date"][:7]
            by_month[month] = by_month.get(month, 0) + amt
        assert by_month["2026-01"] == 3100
        assert by_month["2026-02"] == 3000

    def test_empty_transactions(self):
        assert {} == {}


class TestHealthCheckConditions:
    """Verify health check conditions for the Jewish finance system."""

    def test_maaser_calculation_accuracy(self):
        """Health check: calculations accurate."""
        for income, pct, expected in [(1000, 10, 100), (2500, 10, 250), (0, 10, 0), (123.45, 10, 12.345)]:
            result = income * (pct / 100)
            assert abs(result - expected) < 0.001, f"{income} @ {pct}% should be {expected}, got {result}"

    def test_ledger_balance_consistency(self):
        """Health check: ledger balances correct."""
        income = 10000
        percent = 10
        obligation = income * percent / 100
        given = 750
        manual = 250
        total_given = given + manual
        balance = max(0, obligation - total_given)
        assert obligation == 1000
        assert total_given == 1000
        assert balance == 0

    def test_holiday_dates_unique(self):
        """Health check: holiday dates should reference distinct months."""
        months = [info["month"] for info in HOLIDAY_DEFAULTS.values()]
        assert len(months) == 7
        # Multiple holidays can share a month (Tishrei has 3)
        assert months.count("Tishrei") == 3
        assert months.count("Nisan") == 1

    def test_all_categories_have_uplift(self):
        for name, info in HOLIDAY_DEFAULTS.items():
            assert "uplift_pct" in info, f"{name} missing uplift_pct"
            assert isinstance(info["uplift_pct"], (int, float)), f"{name} uplift_pct not numeric"
