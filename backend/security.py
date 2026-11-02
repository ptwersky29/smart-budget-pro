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


def _derive_encryption_key(secret: str, salt: bytes) -> bytes:
    raw = secret.encode()
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600000)
    return base64.urlsafe_b64encode(kdf.derive(raw))


# Stable salt for version 2 tokens. Legacy salt was derived from FRONTEND_URL.
_V2_SALT = hashlib.sha256(b"penni-data-encryption-v2").digest()[:16]


def _data_secrets() -> list[str]:
    current = os.environ.get("ENCRYPTION_KEY") or _require_jwt_secret()
    previous = [value.strip() for value in os.environ.get("ENCRYPTION_PREVIOUS_KEYS", "").split(",") if value.strip()]
    secrets_to_try = list(dict.fromkeys([current, *previous]))
    if any(len(value) < 32 for value in secrets_to_try):
        raise RuntimeError("Data encryption keys must contain at least 32 characters")
    return secrets_to_try


def _legacy_fernets() -> list[Fernet]:
    """Read old unversioned Fernet values produced by the historical JWT KDF."""
    urls = [os.environ.get("FRONTEND_URL", "financeai")]
    urls += [value.strip() for value in os.environ.get("ENCRYPTION_LEGACY_FRONTEND_URLS", "").split(",") if value.strip()]
    secrets_to_try = list(dict.fromkeys([_require_jwt_secret(), *_data_secrets()]))
    return [
        Fernet(_derive_encryption_key(secret, hashlib.sha256(url.encode()).digest()[:16]))
        for secret in secrets_to_try for url in dict.fromkeys(urls)
    ]


def encrypt_value(plaintext: str) -> str:
    if not plaintext:
        return ""
    # The prefix identifies a rotation-safe KDF independently of site URL and JWT.
    primary = Fernet(_derive_encryption_key(_data_secrets()[0], _V2_SALT))
    return "v2:" + primary.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    if ciphertext.startswith("v2:"):
        token = ciphertext[3:].encode()
        keys = [Fernet(_derive_encryption_key(secret, _V2_SALT)) for secret in _data_secrets()]
    else:
        token = ciphertext.encode()
        keys = _legacy_fernets()
    for fernet in keys:
        try:
            return fernet.decrypt(token).decode()
        except InvalidToken:
            continue
    logger.error("Could not decrypt stored data: no configured data key matches")
    raise ValueError("Stored encrypted data cannot be decrypted; check key rotation settings")


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
