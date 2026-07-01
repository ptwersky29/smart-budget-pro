"""Pure helpers for bank sync identity, validation, and error classification."""
from __future__ import annotations

import hashlib
import logging
from datetime import date
from typing import Any, Mapping, Optional

logger = logging.getLogger("bank_sync_utils")


class BankSyncError(Exception):
    """Raised when a bank sync operation fails."""
    pass


class BankAuthError(BankSyncError):
    """Raised when authentication fails (token expired, etc)."""
    pass


class BankRateLimitError(BankSyncError):
    """Raised when the bank API rate-limits us."""
    pass


class BankApiError(BankSyncError):
    """Raised on unexpected API errors."""
    pass


def parse_import_from_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except (ValueError, TypeError) as e:
        logger.warning("Invalid import_from_date value: %s — %s", value, e)
        return None


def is_reauth_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(token in message for token in ("token expired", "refresh", "401", "unauthori", "invalid grant", "reconnect"))


def classify_sync_error(error: Exception) -> BankSyncError:
    """Classify a sync error into a specific exception type."""
    if isinstance(error, BankSyncError):
        return error
    if is_reauth_error(error):
        return BankAuthError(str(error))
    message = str(error).lower()
    if "429" in message or "rate limit" in message or "too many requests" in message:
        return BankRateLimitError(str(error))
    return BankApiError(str(error))


def connection_error_message(error: Exception, max_len: int = 500) -> str:
    return str(error)[:max_len]


def transaction_sync_id(
    connection_id: str,
    account_id: Optional[str],
    tx: Mapping[str, Any],
    timestamp: str,
    description: str,
    amount: float,
) -> str:
    if not isinstance(tx, dict):
        logger.warning("transaction_sync_id received non-dict tx: %s", type(tx))
        tx = {}
    provider_tx_id = tx.get("transaction_id") or tx.get("id") or tx.get("provider_transaction_id") or ""
    base_parts = [
        connection_id or "",
        account_id or "",
        provider_tx_id or "",
        timestamp or "",
        description or "",
        f"{amount:.2f}",
    ]
    raw = "|".join(base_parts)
    return f"tl_{hashlib.sha256(raw.encode()).hexdigest()[:40]}"
