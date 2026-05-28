"""Pure helpers for bank sync identity, validation, and error classification."""
from __future__ import annotations

import hashlib
from datetime import date
from typing import Any, Mapping, Optional


def parse_import_from_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return date.fromisoformat(value).isoformat()


def is_reauth_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(token in message for token in ("token expired", "refresh", "401", "unauthori", "invalid grant", "reconnect"))


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
