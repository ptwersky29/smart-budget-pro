"""Entrypoint for isolated Render staging services rooted at the repository top level."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))
from backend.server import app  # noqa: E402,F401
