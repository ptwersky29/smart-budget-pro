"""Security utilities: encryption, password validation, input sanitization, CSRF."""
import os
import re
import base64
import hashlib
import secrets
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger("security")

_min_password_len = 8


def _require_jwt_secret() -> str:
    val = os.environ.get("JWT_SECRET")
    if not val or val in ("supersecretkey_change_me", "dev-secret-change-in-production-min-32-chars!!"):
        raise RuntimeError(
            "JWT_SECRET environment variable is required and must be a strong, unique value"
        )
    return val


def _get_encryption_key() -> bytes:
    secret = _require_jwt_secret()
    raw = secret.encode() if isinstance(secret, str) else secret
    salt = hashlib.sha256(os.environ.get("FRONTEND_URL", "financeai").encode()).digest()[:16]
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600000)
    return base64.urlsafe_b64encode(kdf.derive(raw))


_fernet = Fernet(_get_encryption_key())


def encrypt_value(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except Exception as e:
        logger.error("Decryption failed: %s", e)
        return ""


def hash_email(email: str) -> str:
    return hashlib.sha256(email.lower().encode()).hexdigest()[:16]


def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < _min_password_len:
        return False, f"Password must be at least {_min_password_len} characters"
    if len(password) > 128:
        return False, "Password must be at most 128 characters"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain an uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain a lowercase letter"
    if not re.search(r"\d", password):
        return False, "Password must contain a digit"
    if not re.search(r"[@$!%*?&]", password):
        return False, "Password must contain a special character (@$!%*?&)"
    return True, ""


def sanitize_input(value: str, max_len: int = 255) -> str:
    if not value:
        return ""
    cleaned = re.sub(r"[<>\";']", "", value.strip())
    return cleaned[:max_len]


# ── CSRF token generation ──────────────────────────────────────────────

def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def verify_csrf_token(token: str, expected: str) -> bool:
    if not token or not expected:
        return False
    return secrets.compare_digest(token, expected)
