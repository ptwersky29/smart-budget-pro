"""Real Stripe subscription billing — monthly (£5) and yearly (£48)."""
import os
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy import select, update

from db import PaymentTransaction, User
from auth import get_current_user, require_admin

logger = logging.getLogger("billing")

MONTHLY_PRICE_ID = os.environ.get("STRIPE_MONTHLY_PRICE_ID", "")
YEARLY_PRICE_ID = os.environ.get("STRIPE_YEARLY_PRICE_ID", "")
FREE_TRIAL_DAYS = 14

PACKAGES = {
    "premium_monthly": {
        "amount": 5.00, "currency": "gbp", "label": "FinanceAI Premium (monthly)",
        "price_id": MONTHLY_PRICE_ID, "interval": "month",
    },
    "premium_yearly": {
        "amount": 48.00, "currency": "gbp", "label": "FinanceAI Premium (yearly)",
        "price_id": YEARLY_PRICE_ID, "interval": "year",
    },
}


def _get_stripe_key() -> str:
    key = os.environ.get("STRIPE_API_KEY", "")
    if not key:
        raise RuntimeError("Stripe not configured. Add STRIPE_API_KEY to backend .env")
    return key


class CheckoutIn(BaseModel):
    package_id: str = "premium_monthly"
    origin_url: str


def build_router() -> APIRouter:
    router = APIRouter(tags=["billing"])

    @router.get("/billing/packages")
    async def packages():
        return {"packages": [
            {"id": k, "amount": v["amount"], "currency": v["currency"],
             "label": v["label"], "interval": v["interval"]}
            for k, v in PACKAGES.items()
        ]}

    @router.post("/billing/create-checkout")
    async def create_checkout(payload: CheckoutIn, request: Request, user: dict = Depends(get_current_user)):
        if payload.package_id not in PACKAGES:
            raise HTTPException(400, "Invalid package")
        pkg = PACKAGES[payload.package_id]
        origin = payload.origin_url.rstrip("/")

        stripe.api_key = _get_stripe_key()

        sm = request.app.state.db
        async with sm() as session:
            u_result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = u_result.scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")

            stripe_customer_id = u.stripe_customer_id
            customer_email = u.email
            customer_name = u.name or ""

            if not stripe_customer_id:
                customer = stripe.Customer.create(
                    email=customer_email,
                    name=customer_name,
                    metadata={"user_id": user["user_id"]},
                )
                stripe_customer_id = customer.id
                u.stripe_customer_id = stripe_customer_id
                await session.commit()

            session_data = stripe.checkout.Session.create(
                customer=stripe_customer_id,
                mode="subscription",
                line_items=[{"price": pkg["price_id"], "quantity": 1}],
                subscription_data={
                    "trial_period_days": FREE_TRIAL_DAYS,
                    "metadata": {"user_id": user["user_id"], "package_id": payload.package_id},
                },
                success_url=f"{origin}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{origin}/pricing?status=cancelled",
                metadata={"user_id": user["user_id"], "package_id": payload.package_id},
            )

            tx = PaymentTransaction(
                session_id=session_data.id,
                user_id=user["user_id"],
                amount=pkg["amount"],
                currency=pkg["currency"],
                package_id=payload.package_id,
                payment_status="initiated",
                status="open",
                provider="stripe",
            )
            session.add(tx)
            await session.commit()

            return {"checkout_url": session_data.url, "session_id": session_data.id}

    @router.get("/billing/status/{session_id}")
    async def checkout_status(session_id: str, request: Request, user: dict = Depends(get_current_user)):
        stripe.api_key = _get_stripe_key()
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(PaymentTransaction).where(PaymentTransaction.session_id == session_id)
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(404, "Session not found")

            cs = stripe.checkout.Session.retrieve(session_id)
            rec.payment_status = cs.payment_status
            rec.status = cs.status

            if cs.payment_status == "paid" or (cs.mode == "subscription" and cs.status == "complete"):
                u_result = await session.execute(select(User).where(User.user_id == user["user_id"]))
                u = u_result.scalar_one_or_none()
                if u:
                    u.tier = "premium"
                    u.subscription_status = "active"
                    if cs.subscription:
                        sub = stripe.Subscription.retrieve(cs.subscription)
                        u.stripe_subscription_id = cs.subscription
                        u.subscription_status = sub.status
            await session.commit()

            return {
                "session_id": rec.session_id,
                "payment_status": rec.payment_status,
                "status": rec.status,
                "amount": rec.amount,
            }

    @router.get("/billing/subscription")
    async def get_subscription(user: dict = Depends(get_current_user)):
        stripe.api_key = _get_stripe_key()
        sm = request.app.state.db
        async with sm() as session:
            u_result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = u_result.scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")

            free_trial_end = u.free_trial_end.isoformat() if u.free_trial_end else None
            sub_info = {
                "tier": u.tier,
                "subscription_status": u.subscription_status,
                "free_trial_end": free_trial_end,
                "on_trial": bool(u.free_trial_end and u.free_trial_end > datetime.now(timezone.utc) and u.tier != "premium"),
                "is_premium": u.tier == "premium",
                "is_admin": u.role == "admin",
            }

            if u.stripe_subscription_id:
                try:
                    sub = stripe.Subscription.retrieve(u.stripe_subscription_id)
                    sub_info["stripe_status"] = sub.status
                    sub_info["current_period_end"] = datetime.fromtimestamp(sub.current_period_end, tz=timezone.utc).isoformat()
                    sub_info["cancel_at_period_end"] = sub.cancel_at_period_end
                except Exception:
                    pass

            return sub_info

    @router.post("/billing/portal")
    async def billing_portal(request: Request, user: dict = Depends(get_current_user)):
        stripe.api_key = _get_stripe_key()
        sm = request.app.state.db
        async with sm() as session:
            u_result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = u_result.scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            if not u.stripe_customer_id:
                raise HTTPException(400, "No Stripe customer yet — subscribe first")

            origin = str(request.base_url).rstrip("/")
            portal = stripe.billing_portal.Session.create(
                customer=u.stripe_customer_id,
                return_url=f"{origin}/settings",
            )
            return {"url": portal.url}

    @router.post("/billing/cancel")
    async def cancel_subscription(request: Request, user: dict = Depends(get_current_user)):
        stripe.api_key = _get_stripe_key()
        sm = request.app.state.db
        async with sm() as session:
            u_result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            u = u_result.scalar_one_or_none()
            if not u:
                raise HTTPException(404, "User not found")
            if not u.stripe_subscription_id:
                raise HTTPException(400, "No active subscription")
            try:
                stripe.Subscription.modify(u.stripe_subscription_id, cancel_at_period_end=True)
                u.subscription_status = "canceled"
                await session.commit()
                return {"ok": True, "message": "Subscription will cancel at period end"}
            except Exception as e:
                raise HTTPException(400, str(e))

    @router.post("/webhook/stripe")
    async def stripe_webhook(request: Request):
        stripe.api_key = _get_stripe_key()
        body = await request.body()
        sig = request.headers.get("Stripe-Signature", "")
        endpoint_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        try:
            if endpoint_secret:
                evt = stripe.Webhook.construct_event(payload=body, sig_header=sig, secret=endpoint_secret)
            else:
                evt = stripe.Event.construct_from(json.loads(body), stripe.api_key)
        except (ValueError, stripe.error.StripeError) as e:
            logger.error(f"webhook error: {e}")
            raise HTTPException(400, "Invalid webhook")

        sm = request.app.state.db
        async with sm() as session:
            if evt.type == "checkout.session.completed":
                session_obj = evt.data.object
                user_id = (session_obj.metadata or {}).get("user_id", "")
                if user_id:
                    u_result = await session.execute(select(User).where(User.user_id == user_id))
                    u = u_result.scalar_one_or_none()
                    if u:
                        u.tier = "premium"
                        u.subscription_status = "active"
                        u.stripe_customer_id = session_obj.customer
                        if session_obj.subscription:
                            u.stripe_subscription_id = session_obj.subscription

                    tx_result = await session.execute(
                        select(PaymentTransaction).where(PaymentTransaction.session_id == session_obj.id)
                    )
                    rec = tx_result.scalar_one_or_none()
                    if rec:
                        rec.payment_status = "paid"
                        rec.status = "complete"

            elif evt.type in ("customer.subscription.updated", "customer.subscription.created"):
                sub = evt.data.object
                user_id = (sub.metadata or {}).get("user_id", "")
                if not user_id and sub.customer:
                    c_result = await session.execute(
                        select(User).where(User.stripe_customer_id == sub.customer)
                    )
                    u = c_result.scalar_one_or_none()
                    if u:
                        user_id = u.user_id
                if user_id:
                    u_result = await session.execute(select(User).where(User.user_id == user_id))
                    u = u_result.scalar_one_or_none()
                    if u:
                        u.stripe_subscription_id = sub.id
                        u.subscription_status = sub.status
                        if sub.status == "active" or sub.status == "trialing":
                            u.tier = "premium"
                        elif sub.status in ("past_due", "incomplete", "canceled"):
                            u.tier = "free"

            elif evt.type == "customer.subscription.deleted":
                sub = evt.data.object
                c_result = await session.execute(
                    select(User).where(User.stripe_subscription_id == sub.id)
                )
                u = c_result.scalar_one_or_none()
                if u:
                    u.tier = "free"
                    u.subscription_status = "canceled"
                    u.stripe_subscription_id = None

            elif evt.type == "invoice.paid":
                invoice = evt.data.object
                sub_id = invoice.subscription
                if sub_id:
                    c_result = await session.execute(
                        select(User).where(User.stripe_subscription_id == sub_id)
                    )
                    u = c_result.scalar_one_or_none()
                    if u:
                        u.tier = "premium"
                        u.subscription_status = "active"

            elif evt.type == "invoice.payment_failed":
                invoice = evt.data.object
                sub_id = invoice.subscription
                if sub_id:
                    c_result = await session.execute(
                        select(User).where(User.stripe_subscription_id == sub_id)
                    )
                    u = c_result.scalar_one_or_none()
                    if u:
                        u.subscription_status = "past_due"

            await session.commit()
        return {"ok": True}

    return router
