"""Fail CI on new Pyright errors while reporting legacy type debt explicitly.

The project has a historical backlog of typing diagnostics.  A baseline is
NOT a blanket Pyright disable: the complete project is analyzed at every run.
Previously unseen diagnostics fail CI; diagnostics already documented remain
visible until fixed. This gate can be removed once the baseline reaches zero.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
BASELINE = BACKEND / "typecheck-baseline.json"


def diagnostic_key(item: dict) -> str:
    """Stable fingerprint independent of absolute checkout path or line shifts."""
    filename = Path(item.get("file", "")).name
    file_path = Path(item.get("file", ""))
    try:
        relative = file_path.relative_to(BACKEND).as_posix()
    except ValueError:
        relative = filename

    # Source snippet prevents a new error of the same type in the same module
    # from being hidden simply because an unrelated old error was removed.
    line_index = item.get("range", {}).get("start", {}).get("line", -1)
    source = ""
    try:
        source_lines = (BACKEND / relative).read_text(encoding="utf-8").splitlines()
        if 0 <= line_index < len(source_lines):
            source = source_lines[line_index].strip()
    except (OSError, ValueError):
        pass

    return json.dumps(
        [relative, item.get("severity", "error"), item.get("rule", ""),
         " ".join(item.get("message", "").split()), source],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def count_diagnostics(items: list[dict]) -> Counter[str]:
    return Counter(diagnostic_key(item) for item in items if item.get("severity") == "error")


def new_diagnostics(current: Counter[str], baseline: Counter[str]) -> Counter[str]:
    """Count newly introduced errors, including repeated identical diagnostics."""
    return current - baseline


def run_pyright() -> dict:
    cmd = [
        "pyright", ".", "--pythonversion", "3.12",
        "--pythonpath", sys.executable, "--outputjson",
    ]
    result = subprocess.run(
        cmd, cwd=BACKEND, capture_output=True, text=True, check=False,
    )
    if result.returncode not in {0, 1}:
        print("Pyright could not run:\n" + result.stderr, file=sys.stderr)
        raise SystemExit(result.returncode)
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("Pyright did not produce valid JSON:\n" + result.stdout[-3000:], file=sys.stderr)
        raise SystemExit(2) from None
    if "generalDiagnostics" not in report or "summary" not in report:
        raise SystemExit("Incomplete Pyright output; refusing to treat it as passing.")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update-baseline", action="store_true",
        help="Explicit maintenance operation: save current legacy errors",
    )
    args = parser.parse_args()
    report = run_pyright()
    current = count_diagnostics(report["generalDiagnostics"])
    if args.update_baseline:
        document = {
            "comment": (
                "Tracked existing Pyright errors; the CI gate rejects any new "
                "error signatures. Delete entries as issues are fixed."
            ),
            "pyright": "1.1.414",
            "diagnostics": dict(sorted(current.items())),
        }
        BASELINE.write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Recorded {sum(current.values())} legacy Pyright errors in {BASELINE.name}")
        return 0

    if not BASELINE.exists():
        print("Missing type-error baseline; refusing to pass CI.", file=sys.stderr)
        return 1
    document = json.loads(BASELINE.read_text(encoding="utf-8"))
    allowed = Counter(document.get("diagnostics", {}))
    added = new_diagnostics(current, allowed)
    resolved = allowed - current
    print(
        f"Pyright analyzed {report['summary']['filesAnalyzed']} Python files: "
        f"{sum(current.values())} known/current errors, "
        f"{sum(resolved.values())} resolved baseline errors, "
        f"{sum(added.values())} NEW errors."
    )
    if added:
        print("\nNew type errors introduced (CI failure):")
        for key, count in added.most_common(35):
            print(f"  {count}x {key}")
        print("Fix the new errors. Do not regenerate the baseline merely to pass CI.")
        return 1
    if current:
        print(
            "No new Pyright errors. Existing issues are tracked in "
            "backend/typecheck-baseline.json (not treated as resolved)."
        )
    else:
        print("All Pyright diagnostics resolved: remove the baseline gate.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
