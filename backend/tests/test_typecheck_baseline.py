"""Regression checks for the incremental type-quality gate."""

from collections import Counter

from tools.typecheck_baseline import count_diagnostics, new_diagnostics


def diagnostic(source="account = None", path="/vercel/smart-budget-pro/backend/auth.py"):
    return {
        "file": path,
        "severity": "error",
        "rule": "reportOptionalMemberAccess",
        "message": 'Object of type "None" cannot access attribute "id"',
        "range": {"start": {"line": 0, "character": 1}},
    }


def test_detects_new_diagnostic_and_repeated_errors():
    old = count_diagnostics([diagnostic()])
    new = count_diagnostics([diagnostic(), diagnostic()])
    assert sum(new_diagnostics(new, old).values()) == 1


def test_resolved_errors_are_allowed():
    old = count_diagnostics([diagnostic()])
    assert new_diagnostics(Counter(), old) == Counter()


def test_warning_is_not_misidentified_as_a_type_error():
    warning = {**diagnostic(), "severity": "warning"}
    assert count_diagnostics([warning]) == Counter()
