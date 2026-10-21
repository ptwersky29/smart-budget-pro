"""SMTP-backed transactional email delivery."""

import asyncio
import html
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from urllib.parse import urlencode

logger = logging.getLogger(__name__)


class EmailNotConfigured(RuntimeError):
    pass


class EmailDeliveryError(RuntimeError):
    pass


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _smtp_settings():
    host = os.environ.get("SMTP_HOST", "").strip()
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    from_email = os.environ.get("SMTP_FROM_EMAIL", "").strip() or username
    use_ssl = _env_bool("SMTP_SSL", False)
    if not host or not from_email:
        return None
    return {
        "host": host,
        "port": int(os.environ.get("SMTP_PORT", "465" if use_ssl else "587")),
        "username": username,
        "password": password,
        "from_email": from_email,
        "from_name": os.environ.get("SMTP_FROM_NAME", "Smart Budget Pro").strip(),
        "use_ssl": use_ssl,
        "starttls": _env_bool("SMTP_STARTTLS", not use_ssl),
        "timeout": float(os.environ.get("SMTP_TIMEOUT", "15")),
    }


def is_email_configured() -> bool:
    return _smtp_settings() is not None


def frontend_link(path: str, params: dict | None = None) -> str:
    base = (
        os.environ.get("PUBLIC_APP_URL", "").strip()
        or os.environ.get("FRONTEND_URL", "").strip()
        or "http://localhost:3000"
    ).rstrip("/")
    link = f"{base}/{path.lstrip('/')}"
    if params:
        link = f"{link}?{urlencode(params)}"
    return link


def _send_sync(
    to_email: str, subject: str, text_body: str, html_body: str | None, cfg: dict
) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((cfg["from_name"], cfg["from_email"]))
    message["To"] = to_email
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    if cfg["use_ssl"]:
        smtp = smtplib.SMTP_SSL(
            cfg["host"], cfg["port"], timeout=cfg["timeout"], context=context
        )
    else:
        smtp = smtplib.SMTP(cfg["host"], cfg["port"], timeout=cfg["timeout"])
    try:
        if cfg["starttls"] and not cfg["use_ssl"]:
            smtp.starttls(context=context)
        if cfg["username"]:
            smtp.login(cfg["username"], cfg["password"])
        smtp.send_message(message)
    finally:
        try:
            smtp.quit()
        except Exception:
            smtp.close()


async def send_email(
    to_email: str, subject: str, text_body: str, html_body: str | None = None
) -> None:
    cfg = _smtp_settings()
    if not cfg:
        raise EmailNotConfigured("SMTP email delivery is not configured")
    try:
        await asyncio.to_thread(
            _send_sync, to_email, subject, text_body, html_body, cfg
        )
    except Exception as exc:
        logger.error("Email delivery failed: %s", type(exc).__name__)
        raise EmailDeliveryError("Email delivery failed") from exc


def _reset_body(link: str) -> tuple[str, str]:
    text = (
        "We received a request to reset your Smart Budget Pro password.\n\n"
        f"Reset it here: {link}\n\n"
        "This link expires in 1 hour. If you did not request a reset, ignore this email."
    )
    escaped = html.escape(link, quote=True)
    body = (
        "<p>We received a request to reset your Smart Budget Pro password.</p>"
        f'<p><a href="{escaped}">Reset your password</a></p>'
        "<p>This link expires in 1 hour. If you did not request a reset, ignore this email.</p>"
    )
    return text, body


def _verification_body(link: str) -> tuple[str, str]:
    text = (
        "Confirm your email address for Smart Budget Pro.\n\n"
        f"Verify it here: {link}\n\n"
        "If you did not create this account, ignore this email."
    )
    escaped = html.escape(link, quote=True)
    body = (
        "<p>Confirm your email address for Smart Budget Pro.</p>"
        f'<p><a href="{escaped}">Verify your email</a></p>'
        "<p>If you did not create this account, ignore this email.</p>"
    )
    return text, body


async def send_password_reset_email(to_email: str, token: str) -> None:
    link = frontend_link("/reset-password", {"token": token})
    text, body = _reset_body(link)
    await send_email(to_email, "Reset your Smart Budget Pro password", text, body)


async def send_verification_email(to_email: str, token: str) -> None:
    link = frontend_link("/verify-email", {"token": token})
    text, body = _verification_body(link)
    await send_email(to_email, "Verify your Smart Budget Pro email", text, body)


async def send_password_reset_email_safe(to_email: str, token: str) -> None:
    try:
        await send_password_reset_email(to_email, token)
    except EmailNotConfigured:
        logger.error("Password reset email not sent: SMTP is not configured")
    except Exception as exc:
        logger.error("Password reset email not sent: %s", type(exc).__name__)


async def send_verification_email_safe(to_email: str, token: str) -> None:
    try:
        await send_verification_email(to_email, token)
    except EmailNotConfigured:
        logger.error("Verification email not sent: SMTP is not configured")
    except Exception as exc:
        logger.error("Verification email not sent: %s", type(exc).__name__)
