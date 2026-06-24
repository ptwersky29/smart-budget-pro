"""Manual (offline) accounts — CRUD for BankConnection records with provider="manual"."""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy import select, delete

from db import BankAccount, BankConnection, Transaction
from auth import get_current_user

logger = logging.getLogger(__name__)

VALID_TYPES = {"current", "savings", "cash", "credit_card", "investment", "other"}


def build_router() -> APIRouter:
    router = APIRouter(prefix="/accounts/manual", tags=["manual"])

    @router.get("")
    async def list_manual(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankConnection).where(
                    BankConnection.user_id == user["user_id"],
                    BankConnection.provider == "manual",
                ).order_by(BankConnection.created_at.desc())
            )
            rows = result.scalars().all()
            return {
                "accounts": [
                    _conn_to_dict(c) for c in rows
                ]
            }

    @router.post("")
    async def create_manual(body: dict, request: Request, user: dict = Depends(get_current_user)):
        name = (body.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "name is required")
        account_type = (body.get("account_type") or "current").lower()
        if account_type not in VALID_TYPES:
            raise HTTPException(400, f"invalid account_type; must be one of {', '.join(sorted(VALID_TYPES))}")
        balance = body.get("balance")
        if balance is not None:
            try:
                balance = float(balance)
            except (TypeError, ValueError):
                raise HTTPException(400, "balance must be a number")
        currency = (body.get("currency") or "GBP").upper()
        color = body.get("color") or ""
        image = body.get("image") or ""
        conn_id = f"manual_{uuid.uuid4().hex[:12]}"

        config = {}
        if color:
            config["color"] = color
        if image:
            config["image"] = image

            sm = request.app.state.db
            async with sm() as session:
                bc = BankConnection(
                    user_id=user["user_id"],
                    connection_id=conn_id,
                    provider="manual",
                    account_id=conn_id,
                    account_name=name,
                    account_type=account_type,
                    status="active",
                    balance=balance,
                    balance_currency=currency,
                    balance_updated_at=datetime.now(timezone.utc) if balance is not None else None,
                    nickname=name,
                    config=config or None,
                )
                session.add(bc)

                # Also create a BankAccount entry for the new account system
                ba = BankAccount(
                    account_id=conn_id,
                    user_id=user["user_id"],
                    name=name,
                    type=account_type if account_type in ("current", "savings", "cash", "credit") else "current",
                    balance=balance,
                    currency=currency,
                    image=image or None,
                    color=color or None,
                    provider="manual",
                    connection_id=conn_id,
                    is_offline=True,
                    balance_updated_at=datetime.now(timezone.utc) if balance is not None else None,
                )
                session.add(ba)

                await session.commit()
                await session.refresh(bc)
                await session.refresh(ba)
                return _conn_to_dict(bc)

    @router.put("/{connection_id}")
    async def update_manual(connection_id: str, body: dict, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankConnection).where(
                    BankConnection.connection_id == connection_id,
                    BankConnection.user_id == user["user_id"],
                    BankConnection.provider == "manual",
                )
            )
            bc = result.scalar_one_or_none()
            if not bc:
                raise HTTPException(404, "manual account not found")

            # Also update BankAccount
            ba_result = await session.execute(
                select(BankAccount).where(
                    BankAccount.connection_id == connection_id,
                    BankAccount.user_id == user["user_id"],
                )
            )
            ba = ba_result.scalar_one_or_none()

            if "name" in body:
                name = (body["name"] or "").strip()
                if not name:
                    raise HTTPException(400, "name cannot be empty")
                bc.account_name = name
                bc.nickname = name
                if ba:
                    ba.name = name

            if "account_type" in body:
                at = body["account_type"].lower()
                if at not in VALID_TYPES:
                    raise HTTPException(400, f"invalid account_type")
                bc.account_type = at
                if ba and at in ("current", "savings", "cash", "credit"):
                    ba.type = at

            if "balance" in body:
                bal = body["balance"]
                if bal is not None:
                    try:
                        bal = float(bal)
                    except (TypeError, ValueError):
                        raise HTTPException(400, "balance must be a number")
                bc.balance = bal
                bc.balance_updated_at = datetime.now(timezone.utc)
                if ba:
                    ba.balance = bal
                    ba.balance_updated_at = datetime.now(timezone.utc)

            if "currency" in body:
                bc.balance_currency = body["currency"].upper()
                if ba:
                    ba.currency = body["currency"].upper()

            config = bc.config or {}
            if "color" in body:
                if body["color"]:
                    config["color"] = body["color"]
                else:
                    config.pop("color", None)
                if ba:
                    ba.color = body.get("color") or None
            if "image" in body:
                if body["image"]:
                    config["image"] = body["image"]
                else:
                    config.pop("image", None)
                if ba:
                    ba.image = body.get("image") or None
            bc.config = config if config else None

            await session.commit()
            await session.refresh(bc)
            return _conn_to_dict(bc)

    @router.delete("/{connection_id}")
    async def delete_manual(connection_id: str, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankConnection).where(
                    BankConnection.connection_id == connection_id,
                    BankConnection.user_id == user["user_id"],
                    BankConnection.provider == "manual",
                )
            )
            bc = result.scalar_one_or_none()
            if not bc:
                raise HTTPException(404, "manual account not found")

            # Also delete BankAccount
            ba_result = await session.execute(
                select(BankAccount).where(
                    BankAccount.connection_id == connection_id,
                    BankAccount.user_id == user["user_id"],
                )
            )
            ba = ba_result.scalar_one_or_none()
            if ba:
                await session.delete(ba)

            await session.delete(bc)
            await session.commit()
            return {"deleted": True, "connection_id": connection_id}

    return router


def _conn_to_dict(c: BankConnection) -> dict:
    return {
        "connection_id": c.connection_id,
        "account_id": c.account_id,
        "account_name": c.nickname or c.account_name,
        "account_type": c.account_type,
        "provider": c.provider,
        "status": c.status,
        "balance": float(c.balance) if c.balance is not None else None,
        "balance_currency": c.balance_currency,
        "balance_updated_at": c.balance_updated_at.isoformat() if c.balance_updated_at else None,
        "config": c.config or {},
        "nickname": c.nickname or c.account_name,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
