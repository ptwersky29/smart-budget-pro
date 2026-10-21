"""Read-only audit of premium entitlements."""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select

from db import PaymentTransaction, User, dispose_engine, get_session_maker, init_engine

STRIPE_ACTIVE = {"active", "trialing"}
TYL_DURATIONS = {
    "premium_monthly": timedelta(days=30),
    "premium_yearly": timedelta(days=365),
}


def _utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def mask_email(email):
    if not email or "@" not in email:
        return email or ""
    local, domain = email.split("@", 1)
    return f"{local[:1]}***@{domain}"


def evaluate_entitlement(user, latest_payment, now=None):
    now = _utc(now) or datetime.now(timezone.utc)
    email = getattr(user, "email", "") or ""
    result = {
        "user_id": getattr(user, "user_id", ""),
        "email": mask_email(email),
        "tier": getattr(user, "tier", ""),
        "entitled": False,
        "reason": "no_active_entitlement",
        "tyl_package": None,
        "tyl_ends_at": None,
    }

    if getattr(user, "is_admin", False) or getattr(user, "role", "") == "admin":
        result.update(entitled=True, reason="admin")
        return result

    status = (getattr(user, "subscription_status", "") or "").lower()
    if status in STRIPE_ACTIVE:
        if getattr(user, "stripe_subscription_id", None):
            result.update(entitled=True, reason="stripe_active")
            return result
        result["reason"] = "stripe_status_without_subscription"

    premium_until = _utc(getattr(user, "premium_until", None))
    if premium_until:
        if premium_until > now:
            result.update(
                entitled=True,
                reason="premium_until",
                tyl_ends_at=premium_until.isoformat(),
            )
            return result
        result["reason"] = "premium_expired"

    if (
        latest_payment
        and (getattr(latest_payment, "payment_status", "") or "").lower() == "paid"
    ):
        package = getattr(latest_payment, "package_id", None)
        duration = TYL_DURATIONS.get(package)
        started = _utc(
            getattr(latest_payment, "created_at", None)
            or getattr(latest_payment, "notify_received_at", None)
        )
        if not duration or not started:
            result["reason"] = "tyl_unknown_package"
            return result
        ends_at = started + duration
        result.update(
            reason="tyl_active" if ends_at > now else "tyl_expired",
            entitled=ends_at > now,
            tyl_package=package,
            tyl_ends_at=ends_at.isoformat(),
        )
        return result

    return result


async def build_report(include_email=False):
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    init_engine(database_url)
    try:
        session_maker = get_session_maker()
        async with session_maker() as session:
            audited_scope = or_(
                User.tier == "premium",
                User.subscription_status.in_(STRIPE_ACTIVE),
                User.premium_until.is_not(None),
            )
            premium_ids = select(User.user_id).where(audited_scope)
            users = (
                (
                    await session.execute(
                        select(User).where(audited_scope).order_by(User.user_id)
                    )
                )
                .scalars()
                .all()
            )
            payments = (
                (
                    await session.execute(
                        select(PaymentTransaction)
                        .where(
                            PaymentTransaction.user_id.in_(premium_ids),
                            PaymentTransaction.provider == "tyl",
                            PaymentTransaction.payment_status == "paid",
                        )
                        .order_by(PaymentTransaction.created_at.asc())
                    )
                )
                .scalars()
                .all()
            )
    finally:
        await dispose_engine()

    latest_payment = {}
    for payment in payments:
        latest_payment[payment.user_id] = payment

    rows = []
    for user in users:
        row = evaluate_entitlement(user, latest_payment.get(user.user_id))
        if include_email:
            row["email"] = user.email
        rows.append(row)

    suspects = [row for row in rows if not row["entitled"]]
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "premium_users": len(rows),
        "entitled": len(rows) - len(suspects),
        "suspects": len(suspects),
        "rows": rows,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Audit premium entitlements without modifying data."
    )
    parser.add_argument(
        "--json", action="store_true", help="Output the full report as JSON."
    )
    parser.add_argument(
        "--all", action="store_true", help="Include entitled users in text output."
    )
    parser.add_argument(
        "--include-email", action="store_true", help="Show full email addresses."
    )
    args = parser.parse_args()

    try:
        report = asyncio.run(build_report(include_email=args.include_email))
    except Exception as exc:
        print(f"Audit failed: {type(exc).__name__}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print(
        f"Audited accounts: {report['premium_users']}  "
        f"Entitled: {report['entitled']}  Suspect: {report['suspects']}"
    )
    rows = (
        report["rows"] if args.all else [r for r in report["rows"] if not r["entitled"]]
    )
    if not rows:
        print("No suspect premium accounts.")
        return 0
    print(f"{'USER_ID':28} {'EMAIL':28} {'REASON':32} {'TYL_ENDS_AT'}")
    for row in rows:
        print(
            f"{row['user_id'][:28]:28} {row['email'][:28]:28} "
            f"{row['reason'][:32]:32} {row['tyl_ends_at'] or ''}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
