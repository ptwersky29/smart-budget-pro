"""GDPR compliance: data export, deletion, consent management."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy import select, delete as sa_delete, func

from db import (
    get_session_maker, User, Transaction, MaaserLedger, HolidayBudget,
    ChasunaPlan, InvestmentHolding, ConsentRecord, Budget, BankAccount,
    BankConnection, Subscription, RecurringTransaction, SplitTransaction,
    Category, CategoryRule, SmsMessage, SmsSender, Notification,
    PaymentTransaction, TrueLayerLog, SyncLog, AuditLog,
    UserSession, TokenBlacklist, AccountNickname, AiMessage, AiUsage,
    Statement, Integration, SupportTicket,
)
from auth import get_current_user
from audit import log_action

logger = logging.getLogger("gdpr")


class ConsentIn(BaseModel):
    consent_type: str
    granted: bool = True


def _serialize(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "__dict__"):
        d = {k: v for k, v in obj.__dict__.items() if not k.startswith("_") and not callable(v)}
        return {k: _serialize(v) for k, v in d.items()}
    if isinstance(obj, list):
        return [_serialize(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    return obj


def build_router() -> APIRouter:
    router = APIRouter(prefix="/gdpr", tags=["gdpr"])

    @router.get("/data")
    async def export_data(request: Request, user: dict = Depends(get_current_user)):
        sm = get_session_maker()
        uid = user["user_id"]
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == uid))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            txs = (await session.execute(select(Transaction).where(Transaction.user_id == uid))).scalars().all()
            maaser = (await session.execute(select(MaaserLedger).where(MaaserLedger.user_id == uid))).scalars().all()
            hb = (await session.execute(select(HolidayBudget).where(HolidayBudget.user_id == uid))).scalars().all()
            cp = (await session.execute(select(ChasunaPlan).where(ChasunaPlan.user_id == uid))).scalars().all()
            inv = (await session.execute(select(InvestmentHolding).where(InvestmentHolding.user_id == uid))).scalars().all()
            consent = (await session.execute(select(ConsentRecord).where(ConsentRecord.user_id == uid).order_by(ConsentRecord.created_at.desc()))).scalars().all()
            budgets = (await session.execute(select(Budget).where(Budget.user_id == uid))).scalars().all()
            accounts = (await session.execute(select(BankAccount).where(BankAccount.user_id == uid))).scalars().all()
            connections = (await session.execute(select(BankConnection).where(BankConnection.user_id == uid))).scalars().all()
            subs = (await session.execute(select(Subscription).where(Subscription.user_id == uid))).scalars().all()
            recurring = (await session.execute(select(RecurringTransaction).where(RecurringTransaction.user_id == uid))).scalars().all()
            splits = (await session.execute(select(SplitTransaction).where(SplitTransaction.user_id == uid))).scalars().all()
            categories = (await session.execute(select(Category).where(Category.user_id == uid))).scalars().all()
            rules = (await session.execute(select(CategoryRule).where(CategoryRule.user_id == uid))).scalars().all()
            sms_messages = (await session.execute(select(SmsMessage).where(SmsMessage.user_id == uid))).scalars().all()
            sms_senders = (await session.execute(select(SmsSender).where(SmsSender.user_id == uid))).scalars().all()
            notifications = (await session.execute(select(Notification).where(Notification.user_id == uid))).scalars().all()
            payments = (await session.execute(select(PaymentTransaction).where(PaymentTransaction.user_id == uid))).scalars().all()
            sessions = (await session.execute(select(UserSession).where(UserSession.user_id == uid))).scalars().all()
            nicknames = (await session.execute(select(AccountNickname).where(AccountNickname.user_id == uid))).scalars().all()
            ai_messages = (await session.execute(select(AiMessage).where(AiMessage.user_id == uid))).scalars().all()
            ai_usage = (await session.execute(select(AiUsage).where(AiUsage.user_id == uid))).scalars().all()
            statements = (await session.execute(select(Statement).where(Statement.user_id == uid))).scalars().all()
            integrations = (await session.execute(select(Integration).where(Integration.user_id == uid))).scalars().all()
            tickets = (await session.execute(select(SupportTicket).where(SupportTicket.user_id == uid))).scalars().all()
            sync_logs = (await session.execute(select(SyncLog).where(SyncLog.user_id == uid))).scalars().all()
            tl_logs = (await session.execute(select(TrueLayerLog).where(TrueLayerLog.user_id == uid))).scalars().all()
            audits = (await session.execute(select(AuditLog).where(AuditLog.user_id == uid))).scalars().all()
        data = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "profile": {"email": u.email, "name": u.name, "role": u.role, "created_at": u.created_at.isoformat() if u.created_at else None},
            "transactions": [_serialize(t) for t in txs],
            "maaser_ledger": [_serialize(t) for t in maaser],
            "holiday_budgets": [_serialize(t) for t in hb],
            "chasuna_plans": [_serialize(t) for t in cp],
            "investments": [_serialize(t) for t in inv],
            "consent_records": [_serialize(t) for t in consent],
            "budgets": [_serialize(t) for t in budgets],
            "bank_accounts": [_serialize(t) for t in accounts],
            "bank_connections": [_serialize(t) for t in connections],
            "subscriptions": [_serialize(t) for t in subs],
            "recurring_transactions": [_serialize(t) for t in recurring],
            "split_transactions": [_serialize(t) for t in splits],
            "categories": [_serialize(t) for t in categories],
            "category_rules": [_serialize(t) for t in rules],
            "sms_messages": [_serialize(t) for t in sms_messages],
            "sms_senders": [_serialize(t) for t in sms_senders],
            "notifications": [_serialize(t) for t in notifications],
            "payments": [_serialize(t) for t in payments],
            "sessions": [_serialize(t) for t in sessions],
            "account_nicknames": [_serialize(t) for t in nicknames],
            "ai_messages": [_serialize(t) for t in ai_messages],
            "ai_usage": [_serialize(t) for t in ai_usage],
            "statements": [_serialize(t) for t in statements],
            "integrations": [_serialize(t) for t in integrations],
            "support_tickets": [_serialize(t) for t in tickets],
            "sync_logs": [_serialize(t) for t in sync_logs],
            "truelayer_logs": [_serialize(t) for t in tl_logs],
            "audit_logs": [_serialize(t) for t in audits],
            "total_items": len(txs) + len(maaser) + len(hb) + len(cp) + len(inv) + len(budgets) + len(accounts) + len(connections) + len(subs) + len(recurring) + len(splits) + len(categories) + len(rules) + len(sms_messages) + len(sms_senders) + len(notifications) + len(payments) + len(sessions) + len(nicknames) + len(ai_messages) + len(ai_usage) + len(statements) + len(integrations) + len(tickets) + len(sync_logs) + len(tl_logs) + len(audits),
        }
        await log_action(user["user_id"], "data_export", "user", user["user_id"], request=request)
        u.data_exported_at = datetime.now(timezone.utc)
        async with sm() as session:
            session.add(u)
            await session.commit()
        return data

    @router.delete("/data")
    async def delete_data(request: Request, user: dict = Depends(get_current_user)):
        sm = get_session_maker()
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            for tbl in [Transaction, MaaserLedger, HolidayBudget, ChasunaPlan, InvestmentHolding]:
                await session.execute(sa_delete(tbl).where(tbl.user_id == user["user_id"]))
            u.email = f"deleted-{user['user_id'][:8]}@anonymized.com"
            u.name = "Deleted User"
            u.picture = None
            u.preferences = {}
            u.data_deleted_at = datetime.now(timezone.utc)
            await session.commit()
        await log_action(user["user_id"], "data_deletion", "user", user["user_id"], request=request)
        return {"status": "deleted", "message": "All personal data has been deleted and account anonymized."}

    @router.post("/consent")
    async def record_consent(payload: ConsentIn, request: Request, user: dict = Depends(get_current_user)):
        if payload.consent_type not in ("terms", "privacy", "marketing", "cookies"):
            raise HTTPException(400, "Invalid consent type. Use: terms, privacy, marketing, cookies")
        sm = get_session_maker()
        async with sm() as session:
            cr = ConsentRecord(user_id=user["user_id"], consent_type=payload.consent_type, granted=payload.granted,
                               ip_address=request.client.host if request.client else None)
            session.add(cr)
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if u and payload.consent_type == "terms":
                u.consent_terms = payload.granted
            elif u and payload.consent_type == "privacy":
                u.consent_privacy = payload.granted
            elif u and payload.consent_type == "marketing":
                u.consent_marketing = payload.granted
            await session.commit()
        await log_action(user["user_id"], f"consent_{payload.consent_type}", "user", user["user_id"],
                         detail={"consent_type": payload.consent_type, "granted": payload.granted}, request=request)
        return {"status": "ok", "consent_type": payload.consent_type, "granted": payload.granted}

    @router.get("/consent")
    async def get_consent(user: dict = Depends(get_current_user)):
        sm = get_session_maker()
        async with sm() as session:
            u = (await session.execute(select(User).where(User.user_id == user["user_id"]))).scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            records = (await session.execute(
                select(ConsentRecord).where(ConsentRecord.user_id == user["user_id"]).order_by(ConsentRecord.created_at.desc()).limit(20)
            )).scalars().all()
            history = {}
            for r in records:
                history.setdefault(r.consent_type, []).append({"granted": r.granted, "at": r.created_at.isoformat() if r.created_at else None})
            return {
                "current": {
                    "terms": u.consent_terms if u.consent_terms is not None else None,
                    "privacy": u.consent_privacy if u.consent_privacy is not None else None,
                    "marketing": u.consent_marketing if u.consent_marketing is not None else None,
                },
                "history": history,
            }

    @router.get("/health")
    async def gdpr_health():
        return {"status": "ok"}

    return router
