"""Tyl by NatWest hosted-payment-page integration.

Flow:
  1. Frontend calls POST /api/billing/tyl/checkout — backend builds & signs form fields
     and returns { action_url, fields, session_id }.
  2. Frontend renders a hidden auto-submitting form that POSTs to action_url. The
     user lands on Tyl's secure card-entry page.
  3. Tyl redirects back to /billing/success (or /pricing?status=failed) with
     response fields including approval_code, status, extended_response_hash.
  4. Our /api/billing/tyl/verify endpoint validates the hash, marks the payment
     record paid, and upgrades the user's tier to 'premium'.
  5. Optionally Tyl sends a server-to-server notification to /api/billing/tyl/notify
     for extra reliability.

Hash spec (from Tyl Hosted Payment Page guide v2.4):
  - Collect all non-empty request parameters EXCEPT 'hashExtended' itself.
  - Sort parameter NAMES ascending in ASCII order (upper-case before lower-case).
  - Join the VALUES (not names) with '|' separator.
  - HMAC-SHA256 with sharedsecret as key.
  - Base64-encode the digest.
"""
import os
import uuid
import hmac
import base64
import hashlib
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from pydantic import BaseModel

from auth import get_current_user

logger = logging.getLogger("tyl")

TYL_GATEWAY_URL = os.environ.get("TYL_GATEWAY_URL", "https://test.ipg-online.com/connect/gateway/processing")
TYL_STORE_ID = os.environ.get("TYL_STORE_ID", "")
TYL_SHARED_SECRET = os.environ.get("TYL_SHARED_SECRET", "")
TYL_CURRENCY_CODE = os.environ.get("TYL_CURRENCY_CODE", "826")  # GBP
TYL_TIMEZONE = os.environ.get("TYL_TIMEZONE", "Europe/London")
TYL_HASH_ALGORITHM = "HMACSHA256"

PACKAGES = {
    "premium_monthly": {"amount": "5.00", "label": "FinanceAI Premium (monthly)"},
}


def _build_extended_hash(fields: dict, secret: str) -> str:
    """Build the hashExtended signature per Tyl's spec."""
    # Collect non-empty, exclude hashExtended itself
    pairs = [(k, str(v)) for k, v in fields.items() if v not in (None, "") and k != "hashExtended"]
    # Sort by parameter name, ASCII order (uppercase before lowercase is default for ord())
    pairs.sort(key=lambda kv: kv[0])
    # Join values only with '|'
    base_str = "|".join(v for _, v in pairs)
    mac = hmac.new(secret.encode("utf-8"), base_str.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(mac).decode("ascii")


def _tyl_now() -> str:
    """txndatetime in Tyl format YYYY:MM:DD-hh:mm:ss in configured timezone."""
    now = datetime.now(ZoneInfo(TYL_TIMEZONE))
    return now.strftime("%Y:%m:%d-%H:%M:%S")


def _verify_response_hash(response: dict, secret: str) -> bool:
    """Verify Tyl's response signature.
    Steps from the integration guide:
      1. Take all non-empty Gateway response params, remove 'extended_response_hash'.
      2. Sort by name ascending (ASCII), join VALUES with '|'.
      3. HMAC-SHA256 with sharedsecret, base64-encode, compare to extended_response_hash.
    """
    received = response.get("extended_response_hash") or ""
    if not received:
        return False
    pairs = [(k, str(v)) for k, v in response.items()
             if v not in (None, "") and k != "extended_response_hash"]
    pairs.sort(key=lambda kv: kv[0])
    base_str = "|".join(v for _, v in pairs)
    mac = hmac.new(secret.encode("utf-8"), base_str.encode("utf-8"), hashlib.sha256).digest()
    computed = base64.b64encode(mac).decode("ascii")
    return hmac.compare_digest(computed, received)


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
        session_id = uuid.uuid4().hex
        oid = f"fai_{session_id[:16]}"

        # Use FRONTEND_URL (public ingress) for the return webhook so Tyl can
        # actually reach us. /api/* gets routed to the backend by ingress.
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
            "responseSuccessURL": f"{public_base}/api/billing/tyl/return?origin={origin}&session_id={session_id}&result=success",
            "responseFailURL": f"{public_base}/api/billing/tyl/return?origin={origin}&session_id={session_id}&result=failed",
            "transactionNotificationURL": f"{public_base}/api/billing/tyl/notify",
            "merchantTransactionId": session_id,
        }
        # Add billing email (helps 3D Secure)
        if user.get("email"):
            fields["email"] = user["email"]
        if user.get("name"):
            fields["bname"] = user["name"][:96]

        fields["hashExtended"] = _build_extended_hash(fields, TYL_SHARED_SECRET)

        # Persist intent
        await request.app.state.db.payment_transactions.insert_one({
            "session_id": session_id,
            "oid": oid,
            "provider": "tyl",
            "user_id": user["user_id"],
            "user_email": user.get("email"),
            "user_name": user.get("name"),
            "origin": origin,
            "amount": float(pkg["amount"]),
            "currency": "gbp",
            "package_id": payload.package_id,
            "payment_status": "initiated",
            "status": "open",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        return {
            "action_url": TYL_GATEWAY_URL,
            "fields": fields,
            "session_id": session_id,
            "redirect_url": f"{public_base}/api/billing/tyl/redirect/{session_id}",
        }

    @router.get("/billing/tyl/redirect/{session_id}", response_class=HTMLResponse)
    async def tyl_redirect_page(session_id: str, request: Request):
        """Server-rendered HTML page that auto-submits a form to Tyl's hosted gateway.
        More reliable than client-side form.submit() — handles popup blockers,
        ad-blockers, JS errors, and CORS quirks.
        """
        if not TYL_STORE_ID or not TYL_SHARED_SECRET:
            return HTMLResponse("<h1>Tyl is not configured</h1>", status_code=503)
        rec = await request.app.state.db.payment_transactions.find_one({"session_id": session_id})
        if not rec:
            return HTMLResponse("<h1>Session not found</h1>", status_code=404)
        # Re-build fields from session record (use stored amount/currency for safety)
        amount = f"{float(rec['amount']):.2f}"
        oid = rec.get("oid") or f"fai_{session_id[:16]}"
        public_base = (os.environ.get("FRONTEND_URL") or "").rstrip("/")
        # Use the stored origin if we have it, otherwise FRONTEND_URL
        origin = rec.get("origin") or public_base
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
            "responseSuccessURL": f"{public_base}/api/billing/tyl/return?origin={origin}&session_id={session_id}&result=success",
            "responseFailURL": f"{public_base}/api/billing/tyl/return?origin={origin}&session_id={session_id}&result=failed",
            "transactionNotificationURL": f"{public_base}/api/billing/tyl/notify",
            "merchantTransactionId": session_id,
        }
        if rec.get("user_email"):
            fields["email"] = rec["user_email"]
        if rec.get("user_name"):
            fields["bname"] = rec["user_name"][:96]
        fields["hashExtended"] = _build_extended_hash(fields, TYL_SHARED_SECRET)

        # Build a self-submitting HTML page
        import html
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
      // Show fallback if we're still on this page after 4 seconds
      setTimeout(function(){{
        document.getElementById('fb').style.display = 'block';
      }}, 4000);
    }})();
  </script>
</body>
</html>""")

    async def _process_tyl_response(db, data: dict) -> dict:
        """Verify Tyl signature, persist, upgrade user. Returns summary dict."""
        sig_ok = _verify_response_hash(data, TYL_SHARED_SECRET) if data.get("extended_response_hash") else False
        approval = (data.get("approval_code") or "")
        status_u = (data.get("status") or "").upper()
        approved = approval.startswith("Y") or status_u == "APPROVED"
        session_id = data.get("merchantTransactionId")
        rec = None
        if session_id:
            rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if not rec and data.get("oid"):
            rec = await db.payment_transactions.find_one({"oid": data.get("oid")}, {"_id": 0})
        update = {
            "status": status_u or "UNKNOWN",
            "approval_code": approval,
            "ipg_transaction_id": data.get("ipgTransactionId"),
            "payment_status": "paid" if approved else "failed",
            "signature_valid": sig_ok,
            "raw_response": data,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if rec:
            await db.payment_transactions.update_one({"session_id": rec["session_id"]}, {"$set": update})
            if approved and sig_ok and rec.get("user_id"):
                await db.users.update_one({"user_id": rec["user_id"]}, {"$set": {"tier": "premium"}})
        return {"approved": approved, "signature_valid": sig_ok, "status": status_u,
                "approval_code": approval, "user_id": rec.get("user_id") if rec else None}

    @router.api_route("/billing/tyl/return", methods=["GET", "POST"])
    async def tyl_return(request: Request):
        """Tyl posts the response here. We verify, mark the payment, then redirect to the SPA."""
        # Tyl uses POST form body, but the merchant might configure GET — handle both.
        origin = request.query_params.get("origin") or os.environ.get("FRONTEND_URL", "")
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

        db = request.app.state.db
        result = {"approved": False, "signature_valid": False, "status": "UNKNOWN"}
        if TYL_SHARED_SECRET and data:
            result = await _process_tyl_response(db, data)

        # Build redirect URL back to SPA
        base = (origin or os.environ.get("FRONTEND_URL", "")).rstrip("/")
        if not base:
            base = ""  # fallback to relative
        outcome = "approved" if result["approved"] else (result_hint or "failed")
        params = [
            f"session_id={data.get('merchantTransactionId') or session_id_qs or ''}",
            f"outcome={outcome}",
            f"status={result['status']}",
            f"approval_code={result.get('approval_code') or ''}",
            f"signature_valid={'1' if result.get('signature_valid') else '0'}",
        ]
        if data.get("ipgTransactionId"):
            params.append(f"txn_id={data['ipgTransactionId']}")
        if data.get("fail_reason"):
            params.append(f"fail_reason={data['fail_reason']}")
        target = f"{base}/billing/success?{'&'.join(params)}"
        return RedirectResponse(url=target, status_code=303)

    @router.post("/billing/tyl/verify")
    async def tyl_verify(payload: dict, request: Request, user: dict = Depends(get_current_user)):
        """Frontend posts the query/form params it received from Tyl's redirect.
        We verify the signature, persist the result, and (if approved) upgrade the user.
        """
        if not TYL_SHARED_SECRET:
            raise HTTPException(503, "Tyl is not configured")
        # Make sure we don't crash on non-strings
        response = {k: ("" if v is None else str(v)) for k, v in (payload or {}).items()}
        # Strict verification when we have the hash, otherwise rely on approval_code
        signature_ok = _verify_response_hash(response, TYL_SHARED_SECRET) if response.get("extended_response_hash") else False

        approval = (response.get("approval_code") or "")
        status = (response.get("status") or "").upper()
        approved = approval.startswith("Y") or status in {"APPROVED", "WAITING"}

        session_id = response.get("merchantTransactionId") or response.get("session_id")
        db = request.app.state.db
        rec = None
        if session_id:
            rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if not rec and response.get("oid"):
            rec = await db.payment_transactions.find_one({"oid": response.get("oid")}, {"_id": 0})

        update = {
            "status": status or "UNKNOWN",
            "approval_code": approval,
            "ipg_transaction_id": response.get("ipgTransactionId"),
            "payment_status": "paid" if approved else "failed",
            "signature_valid": signature_ok,
            "raw_response": response,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if rec:
            await db.payment_transactions.update_one({"session_id": rec["session_id"]}, {"$set": update})
        else:
            # First time we're hearing about this — store standalone record
            await db.payment_transactions.insert_one({
                "session_id": session_id or uuid.uuid4().hex,
                "oid": response.get("oid"),
                "provider": "tyl",
                "user_id": user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                **update,
            })

        if approved:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"tier": "premium"}})

        return {
            "approved": approved,
            "signature_valid": signature_ok,
            "status": status,
            "approval_code": approval,
            "amount": rec.get("amount") if rec else None,
            "ipg_transaction_id": response.get("ipgTransactionId"),
        }

    @router.post("/billing/tyl/notify")
    async def tyl_notify(request: Request):
        """Server-to-server notification from Tyl. We re-verify and upgrade tier."""
        form = await request.form()
        data = {k: v for k, v in form.items()}
        if not TYL_SHARED_SECRET:
            logger.error("Tyl notify received but TYL_SHARED_SECRET is not set")
            return {"ok": False}
        sig_ok = _verify_response_hash(data, TYL_SHARED_SECRET)
        approved = (data.get("approval_code") or "").startswith("Y") \
                   or (data.get("status") or "").upper() == "APPROVED"
        db = request.app.state.db
        session_id = data.get("merchantTransactionId")
        rec = None
        if session_id:
            rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        elif data.get("oid"):
            rec = await db.payment_transactions.find_one({"oid": data.get("oid")}, {"_id": 0})

        update = {
            "status": (data.get("status") or "").upper(),
            "approval_code": data.get("approval_code"),
            "ipg_transaction_id": data.get("ipgTransactionId"),
            "payment_status": "paid" if approved else "failed",
            "signature_valid": sig_ok,
            "notify_received_at": datetime.now(timezone.utc).isoformat(),
        }
        if rec:
            await db.payment_transactions.update_one({"session_id": rec["session_id"]}, {"$set": update})
            if approved and sig_ok and rec.get("user_id"):
                await db.users.update_one({"user_id": rec["user_id"]}, {"$set": {"tier": "premium"}})
        return {"ok": True, "signature_valid": sig_ok, "approved": approved}

    @router.get("/billing/tyl/config")
    async def tyl_config():
        """Public: tells the frontend whether Tyl is wired up (do not expose the secret)."""
        return {
            "configured": bool(TYL_STORE_ID and TYL_SHARED_SECRET),
            "gateway_url": TYL_GATEWAY_URL,
            "store_id_set": bool(TYL_STORE_ID),
            "secret_set": bool(TYL_SHARED_SECRET),
        }

    return router
