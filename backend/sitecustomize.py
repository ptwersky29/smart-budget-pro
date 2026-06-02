"""Runtime hardening patches for production startup.

This module is imported automatically by Python's site machinery when the
backend directory is on the import path. We use it to keep the TrueLayer
callback from dumping users onto the backend JSON error page if an unexpected
exception slips through the route handler.
"""
from __future__ import annotations

import importlib
import logging
import os
from typing import Any

from fastapi.responses import JSONResponse, RedirectResponse

logger = logging.getLogger("monitor")
_DEFAULT_FRONTEND_URL = "https://smart-budget-pro-ewtm.vercel.app"


def _frontend_base_url() -> str:
    frontend = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
    return frontend or _DEFAULT_FRONTEND_URL


def _callback_failure_redirect(reason: str = "callback_error") -> RedirectResponse:
    return RedirectResponse(
        f"{_frontend_base_url()}/connections?status=failed&reason={reason}",
        status_code=302,
    )


def _patch_error_monitor() -> None:
    try:
        middleware_mod = importlib.import_module("middleware")
    except Exception as exc:  # pragma: no cover - defensive startup patching
        logger.debug("sitecustomize: middleware import skipped: %s", exc)
        return

    error_monitor = getattr(middleware_mod, "ErrorMonitorMiddleware", None)
    if error_monitor is None:
        return

    async def _patched_dispatch(self: Any, request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as exc:
            rid = getattr(request.state, "request_id", "?")
            logger.exception(
                "RID=%s Unhandled error %s %s: %s",
                rid,
                request.method,
                request.url.path,
                exc,
            )
            if request.url.path == "/api/truelayer/callback":
                return _callback_failure_redirect()
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error. Our team has been notified.",
                    "request_id": rid,
                },
            )

    error_monitor.dispatch = _patched_dispatch


_patch_error_monitor()
