"""Penni's authenticated Model Context Protocol server.

The MCP server delegates to Penni's existing API so transaction validation,
category learning, account-balance updates, and user ownership rules remain
centralised in the application.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

import hashlib
import html
import hmac
import logging
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import parse_qs, quote, urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import AnyHttpUrl
from sqlalchemy import DateTime, Integer, JSON, String, select
from sqlalchemy.orm import Mapped, mapped_column

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    RefreshToken,
    RegistrationError,
    TokenError,
    construct_redirect_uri,
)
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.mcpserver import MCPServer
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

import auth as penni_auth
from db import Base, get_session_maker

logger = logging.getLogger("penni.mcp")

SUPPORTED_SCOPES = ["penni:read", "penni:write", "offline_access"]
DEFAULT_SCOPES = ["penni:read", "penni:write", "offline_access"]
ACCESS_TOKEN_SECONDS = 60 * 60
REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 90
AUTH_CODE_SECONDS = 5 * 60
PENDING_AUTH_SECONDS = 10 * 60
MAX_BULK_CATEGORISE = 50


def _public_base_url() -> str:
    value = (
        os.environ.get("MCP_PUBLIC_BASE_URL")
        or os.environ.get("RENDER_EXTERNAL_URL")
        or "https://budget-pro-4jlg.onrender.com"
    )
    return value.rstrip("/")


class MCPOAuthRecord(Base):
    """Persistent OAuth client, pending consent, code, and token storage."""

    __tablename__ = "mcp_oauth_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    record_key: Mapped[str] = mapped_column(String(512), unique=True, nullable=False, index=True)
    record_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class PenniOAuthProvider:
    """Database-backed OAuth 2.1 provider for ChatGPT's remote MCP connection."""

    @staticmethod
    def _record_key(kind: str, value: str) -> str:
        if kind in {"code", "access", "refresh"}:
            value = hashlib.sha256(value.encode("utf-8")).hexdigest()
        return f"{kind}:{value}"

    async def _save(
        self,
        kind: str,
        value: str,
        payload: dict[str, Any],
        expires_at: float | None = None,
    ) -> None:
        record_key = self._record_key(kind, value)
        expiry = datetime.fromtimestamp(expires_at, timezone.utc) if expires_at else None
        async with get_session_maker()() as session:
            result = await session.execute(
                select(MCPOAuthRecord).where(MCPOAuthRecord.record_key == record_key)
            )
            row = result.scalar_one_or_none()
            if row:
                row.record_type = kind
                row.payload = payload
                row.expires_at = expiry
                row.revoked_at = None
            else:
                session.add(
                    MCPOAuthRecord(
                        record_key=record_key,
                        record_type=kind,
                        payload=payload,
                        expires_at=expiry,
                    )
                )
            await session.commit()

    async def _load(self, kind: str, value: str) -> dict[str, Any] | None:
        record_key = self._record_key(kind, value)
        async with get_session_maker()() as session:
            result = await session.execute(
                select(MCPOAuthRecord).where(MCPOAuthRecord.record_key == record_key)
            )
            row = result.scalar_one_or_none()
            if not row or row.revoked_at:
                return None
            if row.expires_at:
                expiry = row.expires_at
                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)
                if expiry <= datetime.now(timezone.utc):
                    await session.delete(row)
                    await session.commit()
                    return None
            return dict(row.payload or {})

    async def _delete(self, kind: str, value: str) -> None:
        record_key = self._record_key(kind, value)
        async with get_session_maker()() as session:
            result = await session.execute(
                select(MCPOAuthRecord).where(MCPOAuthRecord.record_key == record_key)
            )
            row = result.scalar_one_or_none()
            if row:
                await session.delete(row)
                await session.commit()

    async def _revoke_family(self, family_id: str) -> None:
        now = datetime.now(timezone.utc)
        async with get_session_maker()() as session:
            result = await session.execute(
                select(MCPOAuthRecord).where(
                    MCPOAuthRecord.record_type.in_(["access", "refresh"])
                )
            )
            for row in result.scalars().all():
                if (row.payload or {}).get("family_id") == family_id:
                    row.revoked_at = now
            await session.commit()

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        cached = await self._load("client", client_id)
        if cached:
            return OAuthClientInformationFull.model_validate(cached)

        # ChatGPT can identify itself with Client ID Metadata Documents (CIMD).
        # Only fetch metadata from ChatGPT's fixed HTTPS origin to prevent SSRF.
        parsed = urlparse(client_id)
        is_chatgpt_cimd = (
            parsed.scheme == "https"
            and parsed.hostname == "chatgpt.com"
            and parsed.path.startswith("/oauth/")
            and parsed.path.endswith("/client.json")
            and ".." not in parsed.path.split("/")
        )
        if not is_chatgpt_cimd:
            return None

        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
                response = await client.get(client_id, headers={"Accept": "application/json"})
                response.raise_for_status()
                metadata = response.json()
            if metadata.get("client_id") != client_id:
                return None
            client = OAuthClientInformationFull.model_validate(metadata)
            await self._save(
                "client",
                client_id,
                client.model_dump(mode="json"),
                time.time() + 24 * 60 * 60,
            )
            return client
        except Exception as exc:  # metadata lookup must fail closed
            logger.warning("ChatGPT client metadata lookup failed: %s", type(exc).__name__)
            return None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        client_id = client_info.client_id
        if not client_id or not client_info.redirect_uris:
            raise RegistrationError(
                error="invalid_client_metadata",
                error_description="A client ID and at least one redirect URI are required.",
            )
        await self._save("client", str(client_id), client_info.model_dump(mode="json"))

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        if not client.client_id:
            raise AuthorizeError(error="unauthorized_client")
        requested = list(dict.fromkeys(params.scopes or DEFAULT_SCOPES))
        unknown = set(requested) - set(SUPPORTED_SCOPES)
        if unknown:
            raise AuthorizeError(
                error="invalid_scope",
                error_description="Penni supports penni:read, penni:write, and offline_access.",
            )
        if "penni:read" not in requested:
            requested.insert(0, "penni:read")

        request_id = secrets.token_urlsafe(24)
        await self._save(
            "pending",
            request_id,
            {
                "client_id": str(client.client_id),
                "params": params.model_dump(mode="json"),
                "requested_scopes": requested,
            },
            time.time() + PENDING_AUTH_SECONDS,
        )
        return f"{_public_base_url()}/oauth/consent?request_id={request_id}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        payload = await self._load("code", authorization_code)
        if not payload:
            return None
        try:
            code = AuthorizationCode.model_validate(payload)
        except Exception:
            return None
        if code.client_id != client.client_id:
            return None
        return code

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        stored = await self.load_authorization_code(client, authorization_code.code)
        if not stored:
            raise TokenError(error="invalid_grant", error_description="The authorization code is invalid or expired.")
        await self._delete("code", stored.code)
        return await self._issue_tokens(
            client_id=stored.client_id,
            scopes=stored.scopes,
            resource=stored.resource,
            subject=stored.subject,
        )

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        payload = await self._load("refresh", refresh_token)
        if not payload or payload.get("client_id") != client.client_id:
            return None
        return RefreshToken(
            token=refresh_token,
            client_id=payload["client_id"],
            scopes=payload["scopes"],
            expires_at=payload["expires_at"],
            resource=payload.get("resource"),
            subject=payload.get("subject"),
        )

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        stored = await self.load_refresh_token(client, refresh_token.token)
        if not stored:
            raise TokenError(error="invalid_grant", error_description="The refresh token is invalid or expired.")
        granted = scopes or stored.scopes
        if not set(granted).issubset(set(stored.scopes)):
            raise TokenError(error="invalid_scope", error_description="A refresh cannot increase granted permissions.")
        await self.revoke_token(stored)
        return await self._issue_tokens(
            client_id=stored.client_id,
            scopes=granted,
            resource=stored.resource,
            subject=stored.subject,
        )

    async def load_access_token(self, token: str) -> AccessToken | None:
        payload = await self._load("access", token)
        if not payload:
            return None
        return AccessToken(
            token=token,
            client_id=payload["client_id"],
            scopes=payload["scopes"],
            expires_at=payload["expires_at"],
            resource=payload.get("resource"),
            subject=payload.get("subject"),
            claims={"iss": _public_base_url()},
        )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        for kind in ("access", "refresh"):
            payload = await self._load(kind, token.token)
            if payload:
                family_id = payload.get("family_id")
                if family_id:
                    await self._revoke_family(family_id)
                else:
                    record_key = self._record_key(kind, token.token)
                    async with get_session_maker()() as session:
                        result = await session.execute(
                            select(MCPOAuthRecord).where(MCPOAuthRecord.record_key == record_key)
                        )
                        row = result.scalar_one_or_none()
                        if row:
                            row.revoked_at = datetime.now(timezone.utc)
                            await session.commit()
                return

    async def _issue_tokens(
        self,
        client_id: str,
        scopes: list[str],
        resource: str | None,
        subject: str | None,
    ) -> OAuthToken:
        now = int(time.time())
        family_id = secrets.token_urlsafe(24)
        access = secrets.token_urlsafe(40)
        refresh = secrets.token_urlsafe(48)
        access_expiry = now + ACCESS_TOKEN_SECONDS
        refresh_expiry = now + REFRESH_TOKEN_SECONDS

        common = {
            "client_id": client_id,
            "scopes": scopes,
            "resource": resource or f"{_public_base_url()}/mcp",
            "subject": subject,
            "family_id": family_id,
        }
        await self._save(
            "access",
            access,
            {**common, "expires_at": access_expiry},
            access_expiry,
        )
        await self._save(
            "refresh",
            refresh,
            {**common, "expires_at": refresh_expiry},
            refresh_expiry,
        )
        return OAuthToken(
            access_token=access,
            token_type="Bearer",
            expires_in=ACCESS_TOKEN_SECONDS,
            refresh_token=refresh,
            scope=" ".join(scopes),
        )


oauth_provider = PenniOAuthProvider()
mcp = MCPServer(
    "Penni",
    auth=AuthSettings(
        issuer_url=AnyHttpUrl(_public_base_url()),
        resource_server_url=AnyHttpUrl(f"{_public_base_url()}/mcp"),
        required_scopes=["penni:read"],
        client_registration_options=ClientRegistrationOptions(
            enabled=True,
            valid_scopes=SUPPORTED_SCOPES,
            default_scopes=DEFAULT_SCOPES,
        ),
        revocation_options=RevocationOptions(enabled=True),
        validate_token_resource=True,
    ),
    auth_server_provider=oauth_provider,
)

_parent_app: FastAPI | None = None


def _require_scope(scope: str):
    token = get_access_token()
    if token is None or not token.subject:
        raise PermissionError("Reconnect Penni to ChatGPT to continue.")
    if scope not in token.scopes:
        raise PermissionError(
            "This action needs additional Penni permission. Reconnect and grant the requested access."
        )
    return token


async def _api_request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> Any:
    """Call Penni's own API with a short-lived, user-bound internal JWT."""
    token = _require_scope("penni:read")
    if _parent_app is None:
        raise RuntimeError("Penni MCP has not been installed into the API application.")
    internal_token = penni_auth.create_access_token(
        str(token.subject), "mcp@penni.internal"
    )
    transport = httpx.ASGITransport(app=_parent_app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://penni.internal",
        timeout=20.0,
    ) as client:
        response = await client.request(
            method,
            path,
            params=params,
            json=payload,
            headers={"Authorization": f"Bearer {internal_token}"},
        )
    try:
        result = response.json()
    except ValueError:
        result = {"detail": response.text[:500]}
    if response.status_code >= 400:
        detail = result.get("detail", "Penni API request failed") if isinstance(result, dict) else result
        raise RuntimeError(f"Penni returned HTTP {response.status_code}: {detail}")
    return result


@mcp.tool()
async def penni_get_accounts() -> dict[str, Any]:
    """Read the connected and manual Penni accounts, including their current balances."""
    _require_scope("penni:read")
    return await _api_request(
        "GET",
        "/api/accounts",
        params={"limit": 200, "refresh_trading212": False},
    )


@mcp.tool()
async def penni_get_categories() -> dict[str, Any]:
    """Read the user's active Penni categories and their metadata."""
    _require_scope("penni:read")
    return await _api_request("GET", "/api/categories")


@mcp.tool()
async def penni_list_transactions(
    date_from: str | None = None,
    date_to: str | None = None,
    category: str | None = None,
    account_id: str | None = None,
    transaction_type: Literal["income", "expense", "transfer"] | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """Search and read the user's Penni transactions. Dates use YYYY-MM-DD."""
    _require_scope("penni:read")
    params: dict[str, Any] = {
        "limit": max(1, min(int(limit), 200)),
        "offset": max(0, int(offset)),
        "sort": "date",
        "order": "desc",
    }
    for key, value in {
        "date_from": date_from,
        "date_to": date_to,
        "category": category,
        "account_id": account_id,
        "tx_type": transaction_type,
        "search": search,
    }.items():
        if value:
            params[key] = value
    return await _api_request("GET", "/api/transactions", params=params)


@mcp.tool()
async def penni_get_uncategorized_transactions(limit: int = 50) -> dict[str, Any]:
    """List transactions that still need a category."""
    _require_scope("penni:read")
    result = await _api_request(
        "GET",
        "/api/transactions",
        params={"limit": max(1, min(int(limit), 200)), "sort": "date", "order": "desc", "category": "uncategorized"},
    )
    rows = result.get("transactions", []) if isinstance(result, dict) else []
    uncategorized = [
        row for row in rows
        if not row.get("category") or row.get("category") == "uncategorized"
    ]
    return {"transactions": uncategorized, "count": len(uncategorized), "scanned": len(rows)}


@mcp.tool()
async def penni_get_budgets(month: str | None = None) -> dict[str, Any]:
    """Read Penni budgets. Optionally pass a month in YYYY-MM format."""
    _require_scope("penni:read")
    params = {"month": month} if month else None
    return await _api_request("GET", "/api/budgets", params=params)


@mcp.tool()
async def penni_get_spending_report(
    date_from: str | None = None,
    date_to: str | None = None,
    months: int = 6,
) -> dict[str, Any]:
    """Return chart-ready spending categories, monthly trends, and budget comparisons."""
    _require_scope("penni:read")
    date_params: dict[str, Any] = {}
    if date_from:
        date_params["date_from"] = date_from
    if date_to:
        date_params["date_to"] = date_to
    category_report = await _api_request(
        "GET", "/api/analytics/spending-by-category", params=date_params or None
    )
    trend_report = await _api_request(
        "GET",
        "/api/analytics/spending-trends",
        params={"months": max(1, min(int(months), 24))},
    )
    budget_report = await _api_request("GET", "/api/analytics/budget-comparison")
    return {
        "period": {"date_from": date_from, "date_to": date_to},
        "spending_total": category_report.get("total", 0),
        "spending_by_category": category_report.get("categories", []),
        "monthly_trends": trend_report.get("trends", []),
        "budget_comparison": budget_report.get("comparisons", []),
        "chart_data": {
            "category_breakdown": category_report.get("categories", []),
            "monthly_income_expense_net": trend_report.get("trends", []),
        },
    }


@mcp.tool()
async def penni_get_budget_insights() -> dict[str, Any]:
    """Read Penni's existing budget insights and budget alerts."""
    _require_scope("penni:read")
    insights = await _api_request("GET", "/api/budgets/insights")
    alerts = await _api_request("GET", "/api/budgets/alerts")
    return {"insights": insights, "alerts": alerts}


@mcp.tool()
async def penni_get_recurring_transactions() -> dict[str, Any]:
    """Read the recurring payment patterns detected by Penni."""
    _require_scope("penni:read")
    return await _api_request("GET", "/api/transactions/recurring")


@mcp.tool()
async def penni_get_category_rules() -> dict[str, Any]:
    """Read the merchant-to-category rules Penni has learned for this user."""
    _require_scope("penni:read")
    return await _api_request("GET", "/api/category-rules")


@mcp.tool()
async def penni_suggest_transaction_category(transaction_id: str) -> dict[str, Any]:
    """Ask Penni's classifier to save category suggestions for one transaction."""
    _require_scope("penni:write")
    return await _api_request(
        "POST", f"/api/transactions/{quote(transaction_id, safe='')}/classify"
    )


@mcp.tool()
async def penni_review_uncategorized_transactions(limit: int = 10) -> dict[str, Any]:
    """Classify up to ten uncategorized transactions and return suggestions for review."""
    _require_scope("penni:write")
    result = await _api_request(
        "GET",
        "/api/transactions",
        params={"limit": max(1, min(int(limit), 10)), "sort": "date", "order": "desc", "category": "uncategorized"},
    )
    rows = result.get("transactions", []) if isinstance(result, dict) else []
    rows = [
        row for row in rows
        if not row.get("category") or row.get("category") == "uncategorized"
    ]
    reviews = []
    for row in rows:
        transaction_id = row.get("transaction_id")
        if not transaction_id:
            continue
        try:
            suggestions = await _api_request(
                "POST",
                f"/api/transactions/{quote(str(transaction_id), safe='')}/classify",
            )
            reviews.append({"transaction": row, "classification": suggestions})
        except Exception as exc:
            reviews.append({"transaction": row, "error": str(exc)[:250]})
    return {"reviews": reviews, "count": len(reviews)}


@mcp.tool()
async def penni_categorize_transaction(
    transaction_id: str,
    category: str,
) -> dict[str, Any]:
    """Assign a category to one transaction and let Penni learn the merchant rule."""
    _require_scope("penni:write")
    return await _api_request(
        "PATCH",
        f"/api/transactions/{quote(transaction_id, safe='')}/approve-category",
        payload={"category": category, "approve_transaction": False},
    )


@mcp.tool()
async def penni_bulk_categorize_transactions(
    transaction_ids: list[str],
    categories: list[str],
) -> dict[str, Any]:
    """Assign categories to up to 50 transactions; IDs and categories must match by position."""
    _require_scope("penni:write")
    if not transaction_ids or len(transaction_ids) != len(categories):
        raise ValueError("Provide equally sized, non-empty transaction_ids and categories lists.")
    if len(transaction_ids) > MAX_BULK_CATEGORISE:
        raise ValueError(f"Categorise at most {MAX_BULK_CATEGORISE} transactions per request.")
    results = []
    for transaction_id, category in zip(transaction_ids, categories):
        try:
            updated = await _api_request(
                "PATCH",
                f"/api/transactions/{quote(transaction_id, safe='')}/approve-category",
                payload={"category": category, "approve_transaction": False},
            )
            results.append({"transaction_id": transaction_id, "updated": True, "transaction": updated})
        except Exception as exc:
            results.append({"transaction_id": transaction_id, "updated": False, "error": str(exc)[:250]})
    return {
        "updated": sum(1 for item in results if item["updated"]),
        "failed": sum(1 for item in results if not item["updated"]),
        "results": results,
    }


@mcp.tool()
async def penni_apply_learned_category_rules() -> dict[str, Any]:
    """Apply existing user-approved merchant category rules to matching transactions."""
    _require_scope("penni:write")
    return await _api_request("POST", "/api/category-rules/apply")


@mcp.tool()
async def penni_add_transaction(
    amount: float,
    description: str,
    account_id: str,
    transaction_type: Literal["expense", "income"],
    date: str | None = None,
    category: str | None = None,
    merchant: str | None = None,
    currency: str = "GBP",
    notes: str | None = None,
) -> dict[str, Any]:
    """Record a manual income or expense in Penni. This records data; it does not move bank money."""
    _require_scope("penni:write")
    if amount <= 0:
        raise ValueError("Enter a positive amount; transaction_type determines income or expense.")
    if not description.strip():
        raise ValueError("A transaction description is required.")
    payload: dict[str, Any] = {
        "amount": round(abs(float(amount)), 2),
        "description": description.strip(),
        "account_id": account_id,
        "is_income": transaction_type == "income",
        "is_transfer": False,
        "currency": currency.upper(),
        "source": "manual",
        "approval_status": "approved",
    }
    for key, value in {"date": date, "category": category, "merchant": merchant, "notes": notes}.items():
        if value is not None:
            payload[key] = value
    return await _api_request("POST", "/api/transactions", payload=payload)


@mcp.tool()
async def penni_update_transaction(
    transaction_id: str,
    amount: float | None = None,
    description: str | None = None,
    merchant: str | None = None,
    category: str | None = None,
    date: str | None = None,
    is_income: bool | None = None,
    account_id: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Edit an existing transaction. If amount is supplied, use a positive income or negative expense amount."""
    _require_scope("penni:write")
    payload = {
        key: value
        for key, value in {
            "amount": amount,
            "description": description,
            "merchant": merchant,
            "category": category,
            "date": date,
            "is_income": is_income,
            "account_id": account_id,
            "notes": notes,
        }.items()
        if value is not None
    }
    if not payload:
        raise ValueError("Supply at least one transaction field to update.")
    return await _api_request(
        "PATCH",
        f"/api/transactions/{quote(transaction_id, safe='')}",
        payload=payload,
    )


@mcp.tool()
async def penni_record_transfer(
    from_account_id: str,
    to_account_id: str,
    amount: float,
    date: str | None = None,
    description: str = "Transfer between accounts",
    notes: str | None = None,
) -> dict[str, Any]:
    """Record a linked transfer between two Penni accounts; this does not initiate a bank transfer."""
    _require_scope("penni:write")
    if amount <= 0:
        raise ValueError("Transfer amount must be positive.")
    payload: dict[str, Any] = {
        "from_account_id": from_account_id,
        "to_account_id": to_account_id,
        "amount": round(float(amount), 2),
        "description": description,
        "notes": notes,
    }
    if date:
        payload["date"] = date
    return await _api_request("POST", "/api/transactions/transfer-create", payload=payload)


@mcp.tool()
async def penni_get_transaction_splits(transaction_id: str) -> dict[str, Any]:
    """Read the category allocations attached to a split transaction."""
    _require_scope("penni:read")
    return await _api_request(
        "GET", f"/api/transactions/{quote(transaction_id, safe='')}/splits"
    )


@mcp.tool()
async def penni_split_transaction(
    transaction_id: str,
    splits: list[dict[str, Any]],
) -> dict[str, Any]:
    """Split a transaction into category allocations. Penni validates the allocation totals."""
    _require_scope("penni:write")
    if len(splits) < 2 or len(splits) > 10:
        raise ValueError("Provide between 2 and 10 split allocations.")
    return await _api_request(
        "PUT",
        f"/api/transactions/{quote(transaction_id, safe='')}/splits",
        payload={"splits": splits},
    )


@mcp.tool()
async def penni_create_budget(
    category: str,
    limit: float,
    period: Literal["weekly", "monthly", "yearly"] = "monthly",
    month: str | None = None,
) -> dict[str, Any]:
    """Create a monthly, weekly, or yearly Penni budget for a category."""
    _require_scope("penni:write")
    if limit <= 0:
        raise ValueError("Budget limit must be greater than zero.")
    payload: dict[str, Any] = {
        "category": category,
        "limit": round(float(limit), 2),
        "period": period,
        "budget_type": "everyday",
    }
    if month:
        payload["month"] = month
    return await _api_request("POST", "/api/budgets", payload=payload)


@mcp.tool()
async def penni_update_budget(
    budget_id: str,
    category: str | None = None,
    limit: float | None = None,
    period: Literal["weekly", "monthly", "yearly"] | None = None,
    month: str | None = None,
) -> dict[str, Any]:
    """Update an existing Penni budget without deleting it."""
    _require_scope("penni:write")
    payload = {
        key: value
        for key, value in {
            "category": category,
            "limit": round(float(limit), 2) if limit is not None else None,
            "period": period,
            "month": month,
        }.items()
        if value is not None
    }
    if not payload:
        raise ValueError("Supply at least one budget field to update.")
    return await _api_request(
        "PATCH", f"/api/budgets/{quote(budget_id, safe='')}", payload=payload
    )


@mcp.tool()
async def penni_create_category(
    name: str,
    label: str | None = None,
    emoji: str | None = None,
    color: str | None = None,
    description: str | None = None,
    section: str | None = None,
    is_income: bool = False,
) -> dict[str, Any]:
    """Create a personal category in Penni."""
    _require_scope("penni:write")
    payload = {"name": name, "is_income": is_income}
    for key, value in {
        "label": label,
        "emoji": emoji,
        "color": color,
        "description": description,
        "section": section,
    }.items():
        if value is not None:
            payload[key] = value
    return await _api_request("POST", "/api/categories", payload=payload)


@mcp.tool()
async def penni_update_category(
    category_id: str,
    label: str | None = None,
    emoji: str | None = None,
    color: str | None = None,
    description: str | None = None,
    section: str | None = None,
) -> dict[str, Any]:
    """Update the display details of an existing Penni category."""
    _require_scope("penni:write")
    payload = {
        key: value
        for key, value in {
            "label": label,
            "emoji": emoji,
            "color": color,
            "description": description,
            "section": section,
        }.items()
        if value is not None
    }
    if not payload:
        raise ValueError("Supply at least one category field to update.")
    return await _api_request(
        "PATCH", f"/api/categories/{quote(category_id, safe='')}", payload=payload
    )


async def _current_penni_user(request: Request) -> dict[str, Any] | None:
    try:
        return await penni_auth.get_current_user(request)
    except HTTPException:
        return None


def _consent_page(
    request_id: str,
    csrf_token: str,
    user: dict[str, Any] | None,
    requested_scopes: list[str],
) -> HTMLResponse:
    frontend = html.escape(os.environ.get("FRONTEND_URL", "https://penni.leafaccounts.co.uk").rstrip("/"))
    escaped_id = html.escape(request_id, quote=True)
    escaped_csrf = html.escape(csrf_token, quote=True)
    if not user:
        body = f"""
        <h1>Connect Penni to ChatGPT</h1>
        <p>Sign in to your Penni account first. Your sign-in details are never shared with ChatGPT.</p>
        <p><a class="button" href="{frontend}/login" target="_blank" rel="noopener">Open Penni sign in</a></p>
        <p>After signing in, return to this page and refresh it to review the permissions.</p>
        <button type="button" onclick="location.reload()">I've signed in — refresh</button>
        """
    else:
        email = html.escape(str(user.get("email") or "your Penni account"))
        write_option = ""
        if "penni:write" in requested_scopes:
            write_option = """
            <label class="permission">
              <input type="checkbox" name="allow_write" value="yes">
              <span><strong>Make changes</strong><small>Add and edit transactions, categorise transactions, manage budgets, and manage categories.</small></span>
            </label>
            """
        body = f"""
        <h1>Connect Penni to ChatGPT</h1>
        <p>Signed in as <strong>{email}</strong></p>
        <p>Choose what ChatGPT is allowed to do with this Penni account.</p>
        <form method="post" action="/oauth/consent">
          <input type="hidden" name="request_id" value="{escaped_id}">
          <input type="hidden" name="csrf_token" value="{escaped_csrf}">
          <label class="permission">
            <input type="checkbox" checked disabled>
            <span><strong>Read financial data</strong><small>View accounts, balances, transactions, categories, budgets, and reports.</small></span>
          </label>
          {write_option}
          <div class="actions">
            <button type="submit" name="decision" value="allow">Allow access</button>
            <button class="secondary" type="submit" name="decision" value="deny">Cancel</button>
          </div>
        </form>
        """
    page = f"""<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Connect Penni to ChatGPT</title>
    <style>
      body{{margin:0;background:#f4f7f5;color:#15221b;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}}
      main{{background:white;width:min(560px,calc(100% - 32px));box-sizing:border-box;padding:32px;border:1px solid #dfe8e2;border-radius:18px;box-shadow:0 12px 40px #102a1b12}}
      h1{{font-size:25px;margin:0 0 16px}} p{{line-height:1.55;color:#53635a}}
      .permission{{display:flex;gap:12px;align-items:flex-start;padding:16px;border:1px solid #e2e9e4;border-radius:12px;margin:12px 0}}
      .permission input{{margin-top:4px}} small{{display:block;color:#64746a;margin-top:4px;line-height:1.4}}
      button,.button{{display:inline-block;background:#166534;color:white;border:0;border-radius:9px;padding:12px 16px;text-decoration:none;font-weight:600;cursor:pointer}}
      .secondary{{background:#e8eee9;color:#26382c;margin-left:8px}} .actions{{margin-top:20px}}
    </style></head><body><main>{body}</main></body></html>"""
    response = HTMLResponse(page)
    response.set_cookie(
        "mcp_consent_csrf",
        csrf_token,
        httponly=True,
        secure=_public_base_url().startswith("https://"),
        samesite="lax",
        path="/oauth/consent",
        max_age=PENDING_AUTH_SECONDS,
    )
    return response


async def _oauth_consent(request: Request):
    if request.method == "GET":
        request_id = request.query_params.get("request_id", "")
        pending = await oauth_provider._load("pending", request_id) if request_id else None
        if not pending:
            return HTMLResponse("This connection request has expired. Return to ChatGPT and try again.", status_code=400)
        csrf_token = secrets.token_urlsafe(32)
        pending["csrf_token"] = csrf_token
        await oauth_provider._save(
            "pending", request_id, pending, time.time() + PENDING_AUTH_SECONDS
        )
        user = await _current_penni_user(request)
        return _consent_page(
            request_id,
            csrf_token,
            user,
            pending.get("requested_scopes", ["penni:read"]),
        )

    form = parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True)

    def field(name: str) -> str:
        return form.get(name, [""])[0]

    request_id = field("request_id")
    pending = await oauth_provider._load("pending", request_id) if request_id else None
    csrf_cookie = request.cookies.get("mcp_consent_csrf", "")
    csrf_form = field("csrf_token")
    if (
        not pending
        or not csrf_cookie
        or not csrf_form
        or not hmac.compare_digest(csrf_cookie, csrf_form)
        or not hmac.compare_digest(str(pending.get("csrf_token", "")), csrf_form)
    ):
        return HTMLResponse("The consent request is invalid or expired. Return to ChatGPT and try again.", status_code=403)

    params = pending["params"]
    if field("decision") != "allow":
        await oauth_provider._delete("pending", request_id)
        denied = construct_redirect_uri(
            str(params["redirect_uri"]),
            error="access_denied",
            state=params.get("state"),
        )
        response = RedirectResponse(denied, status_code=303)
        response.delete_cookie("mcp_consent_csrf", path="/oauth/consent")
        return response

    user = await _current_penni_user(request)
    if not user:
        return _consent_page(
            request_id,
            csrf_form,
            None,
            pending.get("requested_scopes", ["penni:read"]),
        )

    requested_scopes = pending.get("requested_scopes", ["penni:read"])
    granted_scopes = ["penni:read"]
    if "penni:write" in requested_scopes and field("allow_write") == "yes":
        granted_scopes.append("penni:write")
    if "offline_access" in requested_scopes:
        granted_scopes.append("offline_access")

    code_value = secrets.token_urlsafe(32)
    code = AuthorizationCode(
        code=code_value,
        scopes=granted_scopes,
        expires_at=time.time() + AUTH_CODE_SECONDS,
        client_id=pending["client_id"],
        code_challenge=params["code_challenge"],
        redirect_uri=params["redirect_uri"],
        redirect_uri_provided_explicitly=params.get("redirect_uri_provided_explicitly", True),
        resource=params.get("resource"),
        subject=user["user_id"],
    )
    await oauth_provider._save(
        "code",
        code_value,
        code.model_dump(mode="json"),
        time.time() + AUTH_CODE_SECONDS,
    )
    await oauth_provider._delete("pending", request_id)
    redirect_to = construct_redirect_uri(
        str(params["redirect_uri"]),
        code=code_value,
        state=params.get("state"),
    )
    response = RedirectResponse(redirect_to, status_code=303)
    response.delete_cookie("mcp_consent_csrf", path="/oauth/consent")
    return response


def install(app: FastAPI) -> None:
    """Install OAuth consent and the remote Streamable HTTP MCP endpoint."""
    global _parent_app
    if getattr(app.state, "penni_mcp_installed", False):
        return
    _parent_app = app
    # This route has its own one-time CSRF token check; OAuth protocol endpoints
    # are separately protected by PKCE, client validation, and bearer tokens.
    app.add_route("/oauth/consent", _oauth_consent, methods=["GET", "POST"], name="penni-mcp-consent")
    mcp_app = mcp.streamable_http_app(
        streamable_http_path="/mcp", stateless_http=True, json_response=True, host="0.0.0.0"
    )
    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def penni_mcp_lifespan(application: FastAPI):
        # Parent and mounted child lifespans must both run. Starlette does not
        # automatically start the lifespan of a mounted application.
        async with original_lifespan(application):
            async with mcp_app.router.lifespan_context(mcp_app):
                yield

    app.router.lifespan_context = penni_mcp_lifespan
    app.mount("/", mcp_app)
    app.state.penni_mcp_installed = True
    logger.info("Penni MCP mounted at /mcp")


def _require_write() -> None:
    _require_scope("penni:write")
