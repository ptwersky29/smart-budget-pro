# Backend CI quality policy

The backend CI job runs Ruff and Pyright against Python 3.12.

1. Ruff checks correctness, import ordering and names with ruff.toml. The
   intentional exclusions (E402, E701 and E712) are documented in that file,
   including the SQLAlchemy requirement for explicit boolean comparisons.
2. Pyright analyzes every backend source and test Python file using the
   pinned version and installed backend requirements. It must report zero
   errors, with no historical-error baseline or ignored diagnostic backlog.

## Local checks

Run from the backend directory using Python 3.12:

    pip install -r requirements.txt ruff==0.17.3 pyright==1.1.414
    ruff check .
    pyright . --pythonpath "$(command -v python)"
    pytest -m "not stress"

Ruff and Pyright are both required CI gates. Never disable either to unblock
a release; fix new diagnostics or adjust the underlying type declarations.
