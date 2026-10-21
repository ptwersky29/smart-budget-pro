"""Tyl by NatWest — UK-hosted card-payment gateway checkout."""
import os
import uuid
import hashlib
import hmac
import base64
import logging
from datetime import datetime, timedelta, timezone
import html
import urllib.parse
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select, or_

from db import PaymentTransaction, User
from auth import get_current_user

logger = logging.getLogger("tyl")

TYL_STORE_ID = os.environ.get("TYL_STORE_ID")
TYL_SHARED_SECRET = os.environ.get("TYL_SHARED_SECRET")
TYL_GATEWAY_URL = os.environ.get("TYL_GATEWAY_URL", "https://pay.tyl.com/checkout")
TYL_TIMEZONE = os.environ.get("TYL_TIMEZONE", "Europe/London")
TYL_CURRENCY_CODE = os.environ.get("TYL_CURRENCY_CODE", "826")  # 826 = GBP
TYL_HASH_ALGORITHM = os.environ.get("TYL_HASH_ALGORITHM", "HMAC_SHA256")

PACKAGES = {
    "premium_monthly": {"amount": "5.00", "label": "Premium Monthly", "days": 30},
    "premium_yearly": {"amount": "48.00", "label": "Premium Yearly", "days": 365},
}


def _build_extended_hash(fields: dict, secret: str) -> str:
    pairs = [(k, str(v)) for k, v in fields.items() if v not in (None, "") and k != "hashExtended"]
    pairs.sort(key=lambda kv: kv[0])
    base_str = "|".join(v for _, v in pairs)
    mac = hmac.new(secret.encode("utf-8"), base_str.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(mac).decode("ascii")


def _tyl_now() -> str:
    now = datetime.now(ZoneInfo(TYL_TIMEZONE))
    return now.strftime("%Y:%m:%d-%H:%M:%S")


def extend_premium_until(package_id, current=None, now=None):
    days = PACKAGES.get(package_id, {}).get("days")
    if not days:
        return current
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    if current:
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        base = max(now, current)
    else:
        base = now
    return base + timedelta(days=days)


def apply_tyl_entitlement(user, package_id, already_paid=False, now=None):
    expiry = (
        user.premium_until
        if already_paid
        else extend_premium_until(package_id, user.premium_until, now)
    )
    if not expiry:
        logger.warning(
            "Paid Tyl transaction has no entitlement duration for package %s",
            package_id,
        )
        return user
    user.tier = "premium"
    user.premium_until = expiry
    return user


def _verify_response_hash(response: dict, secret: str) -> bool:
    received = response.get("extended_response_hash") or ""
    if not received:
        return False
    pairs = [(k, str(v)) for k, v in response.items()
             if v not in (None, "") and k != "extended_response_hash"]
    pairs.sort(key=lambda item: item[0])
    base_str = "|".join(value for _, value in pairs)
    mac = hmac.new(secret.encode("utf-8"), base_str.encode("utf-8"), hashlib.sha256).digest()
    computed = base64.b64encode(mac).decode("ascii")
    return hmac.compare_digest(computed, received)


def _tyl_approved(signature_ok: bool, approval: str, status: str) -> bool:
    status_u = (status or "").upper()
    if not signature_ok or status_u in {"WAITING", "PENDING", "DECLINED", "FAILED", "CANCELLED"}:
        return False
    return approval.startswith("Y") or status_u == "APPROVED"


def _tyl_payment_status(approved: bool, status: str) -> str:
    if approved:
        return "paid"
    if (status or "").upper() in {"WAITING", "PENDING"}:
        return "pending"
    return "failed"


def _allowed_origins() -> set[str]:
    configured = {
        origin.strip().rstrip("/")
        for origin in os.environ.get("CORS_EXTRA_ORIGINS", "").split(",")
        if origin.strip()
    }
    return {
        origin
        for origin in [
            os.environ.get("FRONTEND_URL", "").rstrip("/"),
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            *configured,
        ]
        if origin
    }


class TylCheckoutIn(BaseModel):
    package_id: str = "premium_monthly"
    origin_url: str


def build_router() -> APIRouter:
    router = APIRouter(tags=["tyl-billing"])

    @router.post("/billing/tyl/checkout")
    async def tyl_checkout(payload: TylCheckoutIn, request: Request,
                           user: dict = Depends(get_current_user)):
        if payload.package_id not in PACKAGES:
            raise HTTPException(400, "Invalid package")
        if not TYL_STORE_ID or not TYL_SHARED_SECRET:
            raise HTTPException(
                503,
                "Tyl is not configured. Add TYL_STORE_ID and TYL_SHARED_SECRET to backend .env",
            )
        pkg = PACKAGES[payload.package_id]
        origin = payload.origin_url.rstrip("/")
        if origin not in _allowed_origins():
            raise HTTPException(400, "Invalid checkout origin")
        session_id = uuid.uuid4().hex
        oid = f"fai_{session_id[:16]}"

        public_base = (os.environ.get("FRONTEND_URL") or origin).rstrip("/")

        fields = {
            "storename": TYL_STORE_ID,
            "txntype": "sale",
            "timezone": TYL_TIMEZONE,
            "txndatetime": _tyl_now(),
            "hash_algorithm": TYL_HASH_ALGORITHM,
            "chargetotal": pkg["amount"],
            "currency": TYL_CURRENCY_CODE,
            "checkoutoption": "combinedpage",
            "oid": oid,
            "responseSuccessURL": f"{public_base}/api/billing/tyl/return?origin={urllib.parse.quote(origin)}&session_id={session_id}&result=success",
            "responseFailURL": f"{public_base}/api/billing/tyl/return?origin={urllib.parse.quote(origin)}&session_id={session_id}&result=failed",
            "transactionNotificationURL": f"{public_base}/api/billing/tyl/notify",
            "merchantTransactionId": session_id,
        }
        if user.get("email"):
            fields["email"] = user["email"]
        if user.get("name"):
            fields["bname"] = user["name"][:96]

        fields["hashExtended"] = _build_extended_hash(fields, TYL_SHARED_SECRET)

        sm = request.app.state.db
        async with sm() as db_session:
            tx = PaymentTransaction(
                session_id=session_id,
                oid=oid,
                provider="tyl",
                user_id=user["user_id"],
                user_email=user.get("email"),
                user_name=user.get("name"),
                origin=origin,
                amount=float(pkg["amount"]),
                currency="gbp",
                package_id=payload.package_id,
                payment_status="initiated",
                status="open",
            )
            db_session.add(tx)
            await db_session.commit()

        return {
            "action_url": TYL_GATEWAY_URL,
            "fields": fields,
            "session_id": session_id,
            "redirect_url": f"{public_base}/api/billing/tyl/redirect/{session_id}",
        }

    @router.get("/billing/tyl/redirect/{session_id}", response_class=HTMLResponse)
    async def tyl_redirect_page(session_id: str, request: Request):
        if not TYL_STORE_ID or not TYL_SHARED_SECRET:
            return HTMLResponse("<h1>Tyl is not configured</h1>", status_code=503)
        sm = request.app.state.db
        async with sm() as db_session:
            result = await db_session.execute(
                select(PaymentTransaction).where(PaymentTransaction.session_id == session_id)
            )
            rec = result.scalar_one_or_none()
            if not rec:
                return HTMLResponse("<h1>Session not found</h1>", status_code=404)
            amount = f"{float(rec.amount):.2f}"
            oid = rec.oid or f"fai_{session_id[:16]}"
            public_base = (os.environ.get("FRONTEND_URL") or "").rstrip("/")
            origin = rec.origin or public_base
            fields = {
                "storename": TYL_STORE_ID,
                "txntype": "sale",
                "timezone": TYL_TIMEZONE,
                "txndatetime": _tyl_now(),
                "hash_algorithm": TYL_HASH_ALGORITHM,
                "chargetotal": amount,
                "currency": TYL_CURRENCY_CODE,
                "checkoutoption": "combinedpage",
                "oid": oid,
                "responseSuccessURL": f"{public_base}/api/billing/tyl/return?origin={urllib.parse.quote(origin)}&session_id={session_id}&result=success",
                "responseFailURL": f"{public_base}/api/billing/tyl/return?origin={urllib.parse.quote(origin)}&session_id={session_id}&result=failed",
                "transactionNotificationURL": f"{public_base}/api/billing/tyl/notify",
                "merchantTransactionId": session_id,
            }
            if rec.user_email:
                fields["email"] = rec.user_email
            if rec.user_name:
                fields["bname"] = rec.user_name[:96]
            fields["hashExtended"] = _build_extended_hash(fields, TYL_SHARED_SECRET)

        inputs_html = "\n        ".join(
            f'<input type="hidden" name="{html.escape(str(k))}" value="{html.escape(str(v))}" />'
            for k, v in fields.items()
        )
        return HTMLResponse(f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Redirecting to Tyl by NatWest…</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #f8f9fa; color: #111; display: grid; place-items: center;
            min-height: 100vh; margin: 0; }}
    .card {{ background: white; padding: 40px 32px; border-radius: 24px;
             box-shadow: 0 10px 40px rgba(0,0,0,0.08); text-align: center; max-width: 420px; }}
    .spinner {{ width: 36px; height: 36px; border: 3px solid #e5e7eb;
                border-top-color: #10b981; border-radius: 50%;
                animation: spin 0.8s linear infinite; margin: 0 auto 20px; }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
    h1 {{ font-size: 20px; margin: 0 0 8px; font-weight: 500; letter-spacing: -0.02em; }}
    p {{ color: #6b7280; font-size: 14px; margin: 0; }}
    .fallback {{ display: none; margin-top: 20px; }}
    .fallback button {{ background: #10b981; color: white; border: 0; padding: 12px 24px;
                        border-radius: 9999px; font-size: 14px; cursor: pointer; font-weight: 500; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Redirecting to Tyl by NatWest…</h1>
    <p>Please wait, taking you to the secure card page.</p>
    <form id="tyl-form" method="POST" action="{html.escape(TYL_GATEWAY_URL)}">
        {inputs_html}
    </form>
    <noscript>
      <p style="margin-top:16px;color:#dc2626;">JavaScript is disabled — please click the button below to continue.</p>
      <button type="submit" form="tyl-form">Continue to payment</button>
    </noscript>
    <div class="fallback" id="fb">
      <p style="color:#dc2626;">Auto-submit failed. Click below to continue:</p>
      <button type="submit" form="tyl-form">Continue to payment</button>
    </div>
  </div>
  <script>
    (function(){{
      try {{
        document.getElementById('tyl-form').submit();
      }} catch(e) {{
        document.getElementById('fb').style.display = 'block';
      }}
      setTimeout(function(){{
        document.getElementById('fb').style.display = 'block';
      }}, 4000);
    }})();
  </script>
</body>
</html>""")

    async def _process_tyl_response(db_maker, data: dict, user_id: str | None = None) -> dict:
        sig_ok = _verify_response_hash(data, TYL_SHARED_SECRET) if data.get("extended_response_hash") else False
        approval = (data.get("approval_code") or "")
        status_u = (data.get("status") or "").upper()
        approved = _tyl_approved(sig_ok, approval, status_u)
        session_id = data.get("merchantTransactionId")
        result = {"approved": approved, "signature_valid": sig_ok, "status": status_u,
                  "approval_code": approval, "user_id": None}
        if not sig_ok:
            return result

        async with db_maker() as db_session:
            rec = None
            if session_id:
                query = select(PaymentTransaction).where(PaymentTransaction.session_id == session_id)
                if user_id:
                    query = query.where(PaymentTransaction.user_id == user_id)
                r = await db_session.execute(query.with_for_update())
                rec = r.scalar_one_or_none()
            if not rec and data.get("oid"):
                query = select(PaymentTransaction).where(PaymentTransaction.oid == data.get("oid"))
                if user_id:
                    query = query.where(PaymentTransaction.user_id == user_id)
                r = await db_session.execute(query.with_for_update())
                rec = r.scalar_one_or_none()
            already_paid = bool(rec and rec.payment_status == "paid")

            update_data = {
                "status": status_u or "UNKNOWN",
                "approval_code": approval,
                "ipg_transaction_id": data.get("ipgTransactionId"),
                "payment_status": _tyl_payment_status(approved, status_u),
                "signature_valid": sig_ok,
                "raw_response": data,
            }
            if rec:
                if not already_paid:
                    for k, v in update_data.items():
                        setattr(rec, k, v)
                    if approved and rec.user_id:
                        u_r = await db_session.execute(
                            select(User).where(User.user_id == rec.user_id)
                        )
                        u = u_r.scalar_one_or_none()
                        if u:
                            apply_tyl_entitlement(u, rec.package_id, already_paid)
                if already_paid:
                    result["approved"] = True
                result["user_id"] = rec.user_id
            await db_session.commit()
        return result

    @router.api_route("/billing/tyl/return", methods=["GET", "POST"])
    async def tyl_return(request: Request):
        origin_raw = (request.query_params.get("origin") or "").rstrip("/")
        frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
        origin = origin_raw if origin_raw in _allowed_origins() else frontend_url
        session_id_qs = request.query_params.get("session_id")
        result_hint = request.query_params.get("result", "")
        data: dict = {}
        if request.method == "POST":
            try:
                form = await request.form()
                data = {k: ("" if v is None else str(v)) for k, v in form.items()}
            except Exception:
                data = {}
        else:
            data = {k: v for k, v in request.query_params.items()}
        if session_id_qs and not data.get("merchantTransactionId"):
            data["merchantTransactionId"] = session_id_qs

        db_maker = request.app.state.db
        result = {"approved": False, "signature_valid": False, "status": "UNKNOWN"}
        if TYL_SHARED_SECRET and data:
            result = await _process_tyl_response(db_maker, data)

        base = (origin or os.environ.get("FRONTEND_URL", "")).rstrip("/")
        if not base:
            base = ""
        outcome = "approved" if result["approved"] else (result_hint or "failed")
        params = [
            ("session_id", data.get("merchantTransactionId") or session_id_qs or ""),
            ("outcome", outcome),
            ("status", result["status"]),
            ("approval_code", result.get("approval_code") or ""),
            ("signature_valid", "1" if result.get("signature_valid") else "0"),
        ]
        if data.get("ipgTransactionId"):
            params.append(("txn_id", data["ipgTransactionId"]))
        if data.get("fail_reason"):
            params.append(("fail_reason", data["fail_reason"]))
        target = f"{base}/billing/success?" + urllib.parse.urlencode(params)
        return RedirectResponse(url=target, status_code=303)

    @router.post("/billing/tyl/verify")
    async def tyl_verify(payload: dict, request: Request, user: dict = Depends(get_current_user)):
        if not TYL_SHARED_SECRET:
            raise HTTPException(503, "Tyl is not configured")
        response = {k: ("" if v is None else str(v)) for k, v in (payload or {}).items()}
        signature_ok = _verify_response_hash(response, TYL_SHARED_SECRET)
        if not signature_ok:
            raise HTTPException(400, "Invalid Tyl signature")

        approval = response.get("approval_code") or ""
        status = (response.get("status") or "").upper()
        if not _tyl_approved(signature_ok, approval, status):
            return {
                "approved": False,
                "signature_valid": True,
                "status": status,
                "approval_code": approval,
                "ipg_transaction_id": response.get("ipgTransactionId"),
            }

        session_id = response.get("merchantTransactionId") or response.get("session_id")
        oid = response.get("oid")
        if not session_id and not oid:
            raise HTTPException(400, "Missing Tyl transaction identifier")

        db_maker = request.app.state.db
        async with db_maker() as db_session:
            identifiers = []
            if session_id:
                identifiers.append(PaymentTransaction.session_id == session_id)
            if oid:
                identifiers.append(PaymentTransaction.oid == oid)
            query = select(PaymentTransaction).where(
                PaymentTransaction.user_id == user["user_id"],
                or_(*identifiers),
            )
            rec = (await db_session.execute(query)).scalars().first()
            if not rec:
                raise HTTPException(404, "Payment transaction not found")

            amount = response.get("amount")
            if amount not in (None, ""):
                try:
                    if abs(float(amount) - float(rec.amount)) > 0.01:
                        raise HTTPException(400, "Payment amount does not match")
                except ValueError:
                    raise HTTPException(400, "Invalid payment amount")
            currency = (response.get("currency") or "").upper()
            currency_aliases = {"826": "GBP", "840": "USD", "978": "EUR"}
            expected_currency = rec.currency.upper() if rec.currency else ""
            if currency and expected_currency:
                if currency_aliases.get(currency, currency) != expected_currency:
                    raise HTTPException(400, "Payment currency does not match")

        result = await _process_tyl_response(db_maker, response, user_id=user["user_id"])
        return {
            "approved": result["approved"],
            "signature_valid": result["signature_valid"],
            "status": result["status"],
            "approval_code": result.get("approval_code") or "",
            "ipg_transaction_id": response.get("ipgTransactionId"),
        }

    @router.post("/billing/tyl/notify")
    async def tyl_notify(request: Request):
        form = await request.form()
        data = {k: v for k, v in form.items()}
        if not TYL_SHARED_SECRET:
            logger.error("Tyl notify received but TYL_SHARED_SECRET is not set")
            return {"ok": False}
        result = await _process_tyl_response(request.app.state.db, data)
        return {
            "ok": result["signature_valid"],
            "signature_valid": result["signature_valid"],
            "approved": result["approved"],
        }

    @router.get("/billing/tyl/config")
    async def tyl_config():
        return {
            "configured": bool(TYL_STORE_ID and TYL_SHARED_SECRET),
            "gateway_url": TYL_GATEWAY_URL,
            "store_id_set": bool(TYL_STORE_ID),
            "secret_set": bool(TYL_SHARED_SECRET),
        }

    return router
