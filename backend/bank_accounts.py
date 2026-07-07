"""Bank Account CRUD — first-class account entity (separate from BankConnection)."""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from sqlalchemy import select, delete, func, or_

from db import BankAccount, BankConnection, Transaction
from auth import get_current_user

logger = logging.getLogger(__name__)

VALID_TYPES = {"current", "savings", "cash", "credit"}
VALID_BALANCE_TYPES = {"available", "savings"}


def build_router() -> APIRouter:
    router = APIRouter(prefix="/accounts", tags=["accounts"])

    def _acct_to_dict(a: BankAccount) -> dict:
        return {
            "account_id": a.account_id,
            "name": a.name,
            "type": a.type,
            "balance": float(a.balance) if a.balance is not None else 0,
            "currency": a.currency,
            "image": a.image or None,
            "color": a.color or None,
            "provider": a.provider,
            "connection_id": a.connection_id,
            "is_offline": a.is_offline,
            "include_in_total": a.include_in_total,
            "sort_order": a.sort_order,
            "balance_updated_at": a.balance_updated_at.isoformat() if a.balance_updated_at else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }

    @router.get("")
    async def list_accounts(
        request: Request,
        user: dict = Depends(get_current_user),
        type: str = None,
        limit: int = Query(100, ge=1, le=1000),
        offset: int = Query(0, ge=0),
    ):
        sm = request.app.state.db
        async with sm() as session:
            # Auto-migrate any old BankConnections to the new BankAccount table
            from sqlalchemy import select
            from db import BankConnection
            conn_result = await session.execute(
                select(BankConnection).where(
                    BankConnection.user_id == user["user_id"],
                    BankConnection.status == "active"
                )
            )
            for c in conn_result.scalars().all():
                ba_res = await session.execute(
                    select(BankAccount).where(
                        BankAccount.user_id == user["user_id"],
                        or_(
                            BankAccount.connection_id == c.connection_id,
                            BankAccount.account_id == c.account_id,
                        ),
                    )
                )
                existing_ba = ba_res.scalars().first()
                if existing_ba:
                    if not existing_ba.connection_id:
                        existing_ba.connection_id = c.connection_id
                else:
                    acct_type = c.account_type.lower() if c.account_type else "current"
                    if acct_type not in ("current", "savings", "cash", "credit"):
                        acct_type = "current"
                    provider_name = c.config.get("institution", "") if c.config else ""
                    ba_name = c.nickname or c.account_name or (provider_name + " Account" if provider_name else "Bank Account")
                    
                    ba = BankAccount(
                        account_id=c.account_id or f"acct_{uuid.uuid4().hex[:12]}",
                        user_id=user["user_id"],
                        name=ba_name,
                        type=acct_type,
                        balance=c.balance if c.balance is not None else 0,
                        currency=c.balance_currency or "GBP",
                        provider=c.provider or "truelayer",
                        connection_id=c.connection_id,
                        is_offline=(c.provider == "manual"),
                    )
                    session.add(ba)

            # Backfill null connection_ids on existing BankAccounts that have a matching BankConnection
            orphan_result = await session.execute(
                select(BankAccount).where(
                    BankAccount.user_id == user["user_id"],
                    BankAccount.connection_id.is_(None),
                )
            )
            for ba in orphan_result.scalars().all():
                bc_lookup = await session.execute(
                    select(BankConnection).where(
                        BankConnection.user_id == user["user_id"],
                        BankConnection.account_id == ba.account_id,
                    )
                )
                bc_match = bc_lookup.scalar_one_or_none()
                if bc_match:
                    ba.connection_id = bc_match.connection_id
                else:
                    ba.connection_id = ba.account_id
            await session.commit()

            stmt = select(BankAccount).where(
                BankAccount.user_id == user["user_id"]
            ).order_by(BankAccount.sort_order, BankAccount.created_at.desc())
            if type:
                stmt = stmt.where(BankAccount.type == type)
            stmt = stmt.offset(offset).limit(limit)
            result = await session.execute(stmt)
            rows = result.scalars().all()
            return {"accounts": [_acct_to_dict(a) for a in rows]}

    @router.get("/{account_id:str}")
    async def get_account(
        account_id: str,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankAccount).where(
                    BankAccount.account_id == account_id,
                    BankAccount.user_id == user["user_id"],
                )
            )
            a = result.scalar_one_or_none()
            if not a:
                # Fallback: lookup by connection_id (dashboard links use connection_id)
                result = await session.execute(
                    select(BankAccount).where(
                        BankAccount.connection_id == account_id,
                        BankAccount.user_id == user["user_id"],
                    )
                )
                a = result.scalar_one_or_none()
            if not a:
                # Fallback: look up BankConnection and auto-create BankAccount
                bc_result = await session.execute(
                    select(BankConnection).where(
                        BankConnection.connection_id == account_id,
                        BankConnection.user_id == user["user_id"],
                    )
                )
                bc = bc_result.scalar_one_or_none()
                if not bc:
                    raise HTTPException(404, "Account not found")
                acct_type = bc.account_type.lower() if bc.account_type else "current"
                if acct_type not in ("current", "savings", "cash", "credit"):
                    acct_type = "current"
                provider_name = bc.config.get("institution", "") if bc.config else ""
                ba_name = bc.nickname or bc.account_name or (provider_name + " Account" if provider_name else "Bank Account")
                a = BankAccount(
                    account_id=bc.account_id or f"acct_{uuid.uuid4().hex[:12]}",
                    user_id=user["user_id"],
                    name=ba_name,
                    type=acct_type,
                    balance=bc.balance if bc.balance is not None else 0,
                    currency=bc.balance_currency or "GBP",
                    provider=bc.provider or "truelayer",
                    connection_id=bc.connection_id,
                    is_offline=(bc.provider == "manual"),
                )
                session.add(a)
                await session.commit()
                await session.refresh(a)
            return _acct_to_dict(a)

    @router.post("")
    async def create_account(
        body: dict,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        name = (body.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "name is required")
        if len(name) > 255:
            raise HTTPException(400, "name must not exceed 255 characters")
        acct_type = (body.get("type") or "current").lower()
        if acct_type not in VALID_TYPES:
            raise HTTPException(400, f"invalid type; must be one of {', '.join(sorted(VALID_TYPES))}")
        balance = body.get("balance")
        if balance is not None:
            try:
                balance = float(balance)
            except (TypeError, ValueError):
                raise HTTPException(400, "balance must be a number")
        currency = (body.get("currency") or "GBP").upper()
        if len(currency) > 4:
            raise HTTPException(400, "invalid currency code")
        acct_id = f"acct_{uuid.uuid4().hex[:12]}"

        sm = request.app.state.db
        async with sm() as session:
            ba = BankAccount(
                account_id=acct_id,
                user_id=user["user_id"],
                name=name,
                type=acct_type,
                balance=balance,
                currency=currency,
                image=body.get("image") or None,
                color=body.get("color") or None,
                provider="manual",
                connection_id=acct_id,
                is_offline=True,
                include_in_total=body.get("include_in_total", True),
                sort_order=body.get("sort_order", 0),
                balance_updated_at=datetime.now(timezone.utc) if balance is not None else None,
            )
            session.add(ba)

            # Also create a BankConnection for backward compatibility
            bc = BankConnection(
                user_id=user["user_id"],
                connection_id=acct_id,
                provider="manual",
                account_id=acct_id,
                account_name=name,
                account_type=acct_type if acct_type != "credit" else "credit_card",
                status="active",
                balance=balance,
                balance_currency=currency,
                balance_updated_at=datetime.now(timezone.utc) if balance is not None else None,
                nickname=name,
                config={"color": body.get("color")} if body.get("color") else None,
            )
            session.add(bc)

            await session.commit()
            await session.refresh(ba)
            return _acct_to_dict(ba)

    @router.put("/{account_id:str}")
    async def update_account(
        account_id: str,
        body: dict,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankAccount).where(
                    BankAccount.account_id == account_id,
                    BankAccount.user_id == user["user_id"],
                )
            )
            ba = result.scalar_one_or_none()
            if not ba:
                raise HTTPException(404, "Account not found")

            if "name" in body:
                n = (body["name"] or "").strip()
                if not n:
                    raise HTTPException(400, "name cannot be empty")
                if len(n) > 255:
                    raise HTTPException(400, "name must not exceed 255 characters")
                ba.name = n
            if "type" in body:
                t = body["type"].lower()
                if t not in VALID_TYPES:
                    raise HTTPException(400, f"invalid type")
                ba.type = t
            if "balance" in body:
                bal = body["balance"]
                if bal is not None:
                    try:
                        bal = float(bal)
                    except (TypeError, ValueError):
                        raise HTTPException(400, "balance must be a number")
                ba.balance = bal
                ba.balance_updated_at = datetime.now(timezone.utc)
            if "currency" in body:
                ba.currency = body["currency"].upper()
            if "image" in body:
                ba.image = body["image"] or None
            if "color" in body:
                ba.color = body["color"] or None
            if "include_in_total" in body:
                ba.include_in_total = bool(body["include_in_total"])
            if "sort_order" in body:
                ba.sort_order = int(body["sort_order"])

            # Sync BankConnection for backward compatibility
            bc_result = await session.execute(
                select(BankConnection).where(
                    BankConnection.connection_id == account_id,
                    BankConnection.user_id == user["user_id"],
                )
            )
            bc = bc_result.scalar_one_or_none()
            if bc:
                if "name" in body:
                    bc.account_name = body["name"]
                    bc.nickname = body["name"]
                if "type" in body:
                    bc.account_type = body["type"] if body["type"] != "credit" else "credit_card"
                if "balance" in body:
                    bc.balance = body["balance"]
                    bc.balance_updated_at = datetime.now(timezone.utc)
                if "currency" in body:
                    bc.balance_currency = body["currency"].upper()
                config = bc.config or {}
                if "color" in body:
                    if body["color"]:
                        config["color"] = body["color"]
                    else:
                        config.pop("color", None)
                bc.config = config if config else None

            await session.commit()
            await session.refresh(ba)
            return _acct_to_dict(ba)

    @router.delete("/{account_id:str}")
    async def delete_account(
        account_id: str,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankAccount).where(
                    BankAccount.account_id == account_id,
                    BankAccount.user_id == user["user_id"],
                )
            )
            ba = result.scalar_one_or_none()
            if not ba:
                raise HTTPException(404, "Account not found")

            # Check for orphaned transactions
            tx_count = await session.execute(
                select(func.count()).select_from(Transaction).where(
                    Transaction.account_id == account_id,
                    Transaction.user_id == user["user_id"],
                )
            )
            count = tx_count.scalar() or 0
            if count > 0:
                raise HTTPException(400, f"Cannot delete account with {count} transaction(s). Reassign them first.")

            # Also delete BankConnection for backward compatibility
            bc_result = await session.execute(
                select(BankConnection).where(
                    BankConnection.connection_id == account_id,
                    BankConnection.user_id == user["user_id"],
                )
            )
            bc = bc_result.scalar_one_or_none()
            if bc:
                await session.delete(bc)

            await session.delete(ba)
            await session.commit()
            return {"deleted": True, "account_id": account_id}

    # ── Balance types / savings separation ──

    @router.post("/{account_id:str}/balance-type")
    async def set_balance_type(
        account_id: str,
        body: dict,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        """Set the balance_type for an account (affects all future transactions)."""
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankAccount).where(
                    BankAccount.account_id == account_id,
                    BankAccount.user_id == user["user_id"],
                )
            )
            ba = result.scalar_one_or_none()
            if not ba:
                raise HTTPException(404, "Account not found")

            bal_type = (body.get("balance_type") or "available").lower()
            if bal_type not in VALID_BALANCE_TYPES:
                raise HTTPException(400, f"invalid balance_type; use available or savings")
            if bal_type == "savings" and ba.type != "savings":
                ba.type = "savings"
            await session.commit()
            return {"account_id": account_id, "balance_type": bal_type}

    # ── Recalculate balance from transactions ──

    @router.post("/{account_id:str}/recalculate")
    async def recalculate_balance(
        account_id: str,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankAccount).where(
                    BankAccount.account_id == account_id,
                    BankAccount.user_id == user["user_id"],
                )
            )
            ba = result.scalar_one_or_none()
            if not ba:
                raise HTTPException(404, "Account not found")

            agg = await session.execute(
                select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                    Transaction.account_id == account_id,
                    Transaction.user_id == user["user_id"],
                )
            )
            calculated_balance = float(agg.scalar() or 0)
            ba.balance = calculated_balance
            ba.balance_updated_at = datetime.now(timezone.utc)
            await session.commit()
            return {
                "account_id": account_id,
                "balance": calculated_balance,
                "recalculated": True,
            }

    # ── Overview / total balance ──

    @router.get("/overview/balances")
    async def balances_overview(
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(BankAccount).where(
                    BankAccount.user_id == user["user_id"],
                    BankAccount.include_in_total == True,
                ).order_by(BankAccount.sort_order, BankAccount.created_at)
            )
            accounts = result.scalars().all()

            total_balance = sum(float(a.balance or 0) for a in accounts)
            savings_balance = sum(float(a.balance or 0) for a in accounts if a.type == "savings")
            current_balance = total_balance - savings_balance

            return {
                "total_balance": round(total_balance, 2),
                "savings_balance": round(savings_balance, 2),
                "current_balance": round(current_balance, 2),
                "accounts": [_acct_to_dict(a) for a in accounts],
            }

    return router
