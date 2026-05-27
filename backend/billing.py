"""Stripe subscription billing for £5/month Premium tier."""
import os
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy import select, update

from db import PaymentTransaction, User
from auth import get_current_user

logger = logging.getLogger("billing")

PACKAGES = {
    "premium_monthly": {"amount": 5.00, "currency": "gbp", "label": "FinanceAI Premium (monthly)"},
}


class CheckoutIn(BaseModel):
    package_id: str = "premium_monthly"
    origin_url: str


def build_router() -> APIRouter:
    router = APIRouter(tags=["billing"])

    @router.get("/billing/packages")
    async def packages():
        return {"packages": [{"id": k, **v} for k, v in PACKAGES.items()]}

    @router.post("/billing/checkout")
    async def create_checkout(payload: CheckoutIn, request: Request, user: dict = Depends(get_current_user)):
        from emergentintegrations.payments.stripe.checkout import (
            StripeCheckout, CheckoutSessionRequest,
        )
        if payload.package_id not in PACKAGES:
            raise HTTPException(400, "Invalid package")
        pkg = PACKAGES[payload.package_id]
        host_url = str(request.base_url).rstrip("/")
        webhook_url = f"{host_url}/api/webhook/stripe"
        api_key = os.environ.get("STRIPE_API_KEY", "")
        if not api_key:
            raise HTTPException(503, "Stripe is not configured. Add STRIPE_API_KEY to backend .env")
        sc = StripeCheckout(api_key=api_key, webhook_url=webhook_url)

        success_url = f"{payload.origin_url.rstrip('/')}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{payload.origin_url.rstrip('/')}/pricing?status=cancelled"
        req_obj = CheckoutSessionRequest(
            amount=pkg["amount"],
            currency=pkg["currency"],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": user["user_id"], "package_id": payload.package_id},
        )
        session = await sc.create_checkout_session(req_obj)
        sm = request.app.state.db
        async with sm() as db_session:
            tx = PaymentTransaction(
                session_id=session.session_id,
                user_id=user["user_id"],
                amount=pkg["amount"],
                currency=pkg["currency"],
                package_id=payload.package_id,
                payment_status="initiated",
                status="open",
            )
            db_session.add(tx)
            await db_session.commit()
        return {"checkout_url": session.url, "session_id": session.session_id}

    @router.get("/billing/status/{session_id}")
    async def checkout_status(session_id: str, request: Request, user: dict = Depends(get_current_user)):
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        sm = request.app.state.db
        async with sm() as db_session:
            result = await db_session.execute(
                select(PaymentTransaction).where(PaymentTransaction.session_id == session_id)
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Session not found")
            if rec.payment_status == "paid":
                return {"session_id": rec.session_id, "payment_status": "paid", "status": rec.status, "amount": rec.amount}
            host_url = str(request.base_url).rstrip("/")
            sc = StripeCheckout(api_key=os.environ["STRIPE_API_KEY"], webhook_url=f"{host_url}/api/webhook/stripe")
            status_obj = await sc.get_checkout_status(session_id)
            rec.status = status_obj.status
            rec.payment_status = status_obj.payment_status
            if status_obj.payment_status == "paid" and rec.payment_status != "paid":
                u_result = await db_session.execute(select(User).where(User.user_id == user["user_id"]))
                u = u_result.scalar_one_or_none()
                if u:
                    u.tier = "premium"
            await db_session.commit()
            return {"session_id": rec.session_id, "payment_status": rec.payment_status, "status": rec.status, "amount": rec.amount}

    @router.post("/webhook/stripe")
    async def stripe_webhook(request: Request):
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        body = await request.body()
        sig = request.headers.get("Stripe-Signature", "")
        host_url = str(request.base_url).rstrip("/")
        sc = StripeCheckout(api_key=os.environ["STRIPE_API_KEY"], webhook_url=f"{host_url}/api/webhook/stripe")
        try:
            evt = await sc.handle_webhook(body, sig)
        except Exception as e:
            logger.error(f"webhook error: {e}")
            raise HTTPException(400, "Invalid webhook")
        sm = request.app.state.db
        async with sm() as db_session:
            result = await db_session.execute(
                select(PaymentTransaction).where(PaymentTransaction.session_id == evt.session_id)
            )
            rec = result.scalar_one_or_none()
            if rec:
                rec.payment_status = "paid" if evt.payment_status == "paid" else rec.payment_status
                rec.status = "complete"
            if evt.payment_status == "paid":
                user_id = (evt.metadata or {}).get("user_id")
                if user_id:
                    u_result = await db_session.execute(select(User).where(User.user_id == user_id))
                    u = u_result.scalar_one_or_none()
                    if u:
                        u.tier = "premium"
            await db_session.commit()
        return {"ok": True}

    return router
