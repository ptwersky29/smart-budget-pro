# Backend CI quality policy

The backend CI job runs two independent checks:

1. **Ruff** checks Python correctness, names and import ordering using the rules in
   \`ruff.toml\`. The project deliberately excludes E402 (environment-dependent
   imports), E701 (compact existing one-line guards) and E712 (SQLAlchemy boolean
   comparisons use SQL semantics). Ruff must report **zero violations**.
2. **Pyright** analyzes **all backend Python files** with the installed application
   dependencies and pinned Pyright version. The repository carries a documented,
   machine-readable baseline of legacy errors in \`typecheck-baseline.json\`. The
   gate in \`tools/typecheck_baseline.py\` fails immediately if any **new error**
   appears. The baseline does not mean the legacy errors have been fixed.

The baseline exists because large historical typing issues in the Stripe SDK,
nullable SQLAlchemy session factories and older dynamic modules would require a
separate, risk-controlled refactor. All current type errors stay visible in the
baseline; none are represented as resolved.

## Local checks

Use Python 3.12:

\`\`\`bash
pip install -r requirements.txt ruff==0.17.3 pyright==1.1.414
ruff check .
python tools/typecheck_baseline.py
pytest -m "not stress"
\`\`\`

When fixing known type errors, regenerate the baseline *only after reviewing the
changes* with \`python tools/typecheck_baseline.py --update-baseline\`. Remove
resolved entries and drive the count toward zero. Never use this switch as an
automatic CI step; CI must reject new errors.

The quality gate intentionally does not modify any production runtime code, API
response models or financial calculations.
