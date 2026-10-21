import asyncio

import pytest

import email_service

SMTP_ENV = (
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_FROM_EMAIL",
    "SMTP_FROM_NAME",
    "SMTP_SSL",
    "SMTP_STARTTLS",
    "SMTP_TIMEOUT",
    "PUBLIC_APP_URL",
    "FRONTEND_URL",
)


@pytest.fixture(autouse=True)
def clear_email_env(monkeypatch):
    for name in SMTP_ENV:
        monkeypatch.delenv(name, raising=False)


def test_email_is_unconfigured_without_host_or_sender():
    assert email_service._smtp_settings() is None
    assert not email_service.is_email_configured()


def test_smtp_settings_parse_environment(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "2525")
    monkeypatch.setenv("SMTP_USERNAME", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "no-reply@example.com")
    monkeypatch.setenv("SMTP_FROM_NAME", "Penni Mail")
    monkeypatch.setenv("SMTP_STARTTLS", "false")

    cfg = email_service._smtp_settings()

    assert cfg["host"] == "smtp.example.com"
    assert cfg["port"] == 2525
    assert cfg["from_email"] == "no-reply@example.com"
    assert cfg["from_name"] == "Penni Mail"
    assert cfg["starttls"] is False


def test_frontend_link_prefers_public_app_url(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com/")
    monkeypatch.setenv("PUBLIC_APP_URL", "https://public.example.com/")

    assert email_service.frontend_link("/reset-password", {"token": "abc"}) == (
        "https://public.example.com/reset-password?token=abc"
    )


def test_password_reset_email_contains_reset_link(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    sent = {}

    async def fake_send(to_email, subject, text_body, html_body=None):
        sent.update(to=to_email, subject=subject, text=text_body, html=html_body)

    monkeypatch.setattr(email_service, "send_email", fake_send)
    asyncio.run(
        email_service.send_password_reset_email("user@example.com", "reset-token")
    )

    assert sent["to"] == "user@example.com"
    assert "Reset your Smart Budget Pro password" == sent["subject"]
    assert "https://app.example.com/reset-password?token=reset-token" in sent["text"]
    assert "https://app.example.com/reset-password?token=reset-token" in sent["html"]


def test_verification_email_contains_frontend_link(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    sent = {}

    async def fake_send(to_email, subject, text_body, html_body=None):
        sent.update(to=to_email, subject=subject, text=text_body, html=html_body)

    monkeypatch.setattr(email_service, "send_email", fake_send)
    asyncio.run(
        email_service.send_verification_email("user@example.com", "verify-token")
    )

    assert sent["to"] == "user@example.com"
    assert "https://app.example.com/verify-email?token=verify-token" in sent["text"]


def test_safe_reset_sender_does_not_raise_when_unconfigured():
    asyncio.run(
        email_service.send_password_reset_email_safe("user@example.com", "token")
    )


def test_send_email_raises_when_unconfigured():
    with pytest.raises(email_service.EmailNotConfigured):
        asyncio.run(email_service.send_email("user@example.com", "Subject", "Body"))


def test_smtp_delivery_builds_message(monkeypatch):
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            sent.update(host=host, port=port, timeout=timeout)

        def starttls(self, context=None):
            sent["starttls"] = True

        def login(self, username, password):
            sent["login"] = username

        def send_message(self, message):
            sent["message"] = message

        def quit(self):
            sent["quit"] = True

    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    cfg = {
        "host": "smtp.example.com",
        "port": 587,
        "username": "mailer",
        "password": "secret",
        "from_email": "no-reply@example.com",
        "from_name": "Penni Mail",
        "use_ssl": False,
        "starttls": True,
        "timeout": 5,
    }

    email_service._send_sync(
        "user@example.com", "Subject", "Plain body", "<p>Html body</p>", cfg
    )

    message = sent["message"]
    assert sent["host"] == "smtp.example.com"
    assert sent["starttls"] is True
    assert sent["login"] == "mailer"
    assert message["To"] == "user@example.com"
    assert message["Subject"] == "Subject"
    assert "Plain body" in message.get_body(preferencelist=("plain",)).get_content()
    assert "Html body" in message.get_body(preferencelist=("html",)).get_content()


def test_safe_email_logs_do_not_include_token(caplog):
    caplog.set_level("ERROR")
    asyncio.run(
        email_service.send_password_reset_email_safe("user@example.com", "secret-token")
    )

    assert "secret-token" not in caplog.text
    assert "SMTP is not configured" in caplog.text
