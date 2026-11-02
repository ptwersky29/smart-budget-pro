"""Security utilities: encryption, password validation, input sanitization, CSRF."""
import os
import re
import base64
import hashlib
import secrets
import logging
from cryptography.fernet import Fernet, InvalidToken
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


def _derive_encryption_key(secret: str) -> bytes:
    """Preserve the legacy KDF for previously encrypted values."""
    raw = secret.encode()
    salt = hashlib.sha256(os.environ.get("FRONTEND_URL", "financeai").encode()).digest()[:16]
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600000)
    return base64.urlsafe_b64encode(kdf.derive(raw))


def _encryption_keyring() -> list[Fernet]:
    """Use a stable, independent data key. Legacy JWT ciphertext remains readable.

    ENCRYPTION_KEY must be kept when JWT_SECRET rotates.
    ENCRYPTION_PREVIOUS_KEYS is a comma-separated history of earlier data keys;
    do not remove those keys until ciphertext has been explicitly migrated.
    """
    current = os.environ.get("ENCRYPTION_KEY") or _require_jwt_secret()
    previous = [
        value.strip() for value in os.environ.get("ENCRYPTION_PREVIOUS_KEYS", "").split(",")
        if value.strip()
    ]
    legacy = _require_jwt_secret()
    secrets_to_try = list(dict.fromkeys([current, *previous, legacy]))
    if any(len(value) < 32 for value in secrets_to_try):
        raise RuntimeError("Data encryption keys must contain at least 32 characters")
    return [Fernet(_derive_encryption_key(secret)) for secret in secrets_to_try]


def encrypt_value(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _encryption_keyring()[0].encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    for fernet in _encryption_keyring():
        try:
            return fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken:
            continue
    # An empty string looks like a legitimate missing credential and can cause
    # further destructive changes. Surface the failure without logging secrets.
    logger.error("Could not decrypt stored data: no configured data key matches")
    raise ValueError("Stored encrypted data cannot be decrypted; check encryption key rotation settings")


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
