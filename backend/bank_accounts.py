"""Bank Account CRUD — first-class account entity (separate from BankConnection)."""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy import select, delete, func, or_

from db import BankAccount, Transaction
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
    ):
        sm = request.app.state.db
        async with sm() as session:
            stmt = select(BankAccount).where(
                BankAccount.user_id == user["user_id"]
            ).order_by(BankAccount.sort_order, BankAccount.created_at.desc())
            if type:
                stmt = stmt.where(BankAccount.type == type)
            result = await session.execute(stmt)
            rows = result.scalars().all()
            return {"accounts": [_acct_to_dict(a) for a in rows]}

    @router.get("/{account_id:path}")
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
                raise HTTPException(404, "Account not found")
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
                is_offline=True,
                include_in_total=body.get("include_in_total", True),
                sort_order=body.get("sort_order", 0),
                balance_updated_at=datetime.now(timezone.utc) if balance is not None else None,
            )
            session.add(ba)
            await session.commit()
            await session.refresh(ba)
            return _acct_to_dict(ba)

    @router.put("/{account_id:path}")
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

            await session.commit()
            await session.refresh(ba)
            return _acct_to_dict(ba)

    @router.delete("/{account_id:path}")
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

            await session.delete(ba)
            await session.commit()
            return {"deleted": True, "account_id": account_id}

    # ── Balance types / savings separation ──

    @router.post("/{account_id:path}/balance-type")
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

    @router.post("/{account_id:path}/recalculate")
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
