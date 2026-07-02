"""Authentication module: JWT + remember me + session management + role permissions.

Roles hierarchy: guest < free_user < premium_user < admin.
"""
import os
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import asyncio
import bcrypt
import jwt as pyjwt
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, EmailStr, Field
import json
from sqlalchemy import select, update, delete
import httpx
import urllib.parse
from starlette.responses import RedirectResponse

from db import User, UserSession, PasswordResetToken, TokenBlacklist, TrueLayerState, AuditLog
from security import validate_password, _require_jwt_secret, generate_csrf_token, verify_csrf_token

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 30
REFRESH_TOKEN_DAYS = 7
REMEMBER_ME_DAYS = 30
FREE_TRIAL_DAYS = 14

ROLE_HIERARCHY = {"guest": 0, "free_user": 1, "premium_user": 2, "admin": 3}


def _jti() -> str:
    return uuid.uuid4().hex


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def hash_password_async(password: str) -> str:
    return await asyncio.to_thread(hash_password, password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


async def verify_password_async(plain: str, hashed: str) -> bool:
    return await asyncio.to_thread(verify_password, plain, hashed)


def create_access_token(user_id: str, email: str, jti: str = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "jti": jti or _jti(),
        "iat": int(now.timestamp()),
        "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return pyjwt.encode(payload, _require_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, remember_me: bool = False, jti: str = None) -> str:
    now = datetime.now(timezone.utc)
    days = REMEMBER_ME_DAYS if remember_me else REFRESH_TOKEN_DAYS
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": jti or _jti(),
        "iat": int(now.timestamp()),
        "exp": now + timedelta(days=days),
    }
    return pyjwt.encode(payload, _require_jwt_secret(), algorithm=JWT_ALGORITHM)


def _cookie_secure() -> bool:
    explicit = os.environ.get("COOKIE_SECURE")
    if explicit is not None:
        return explicit.lower() in {"1", "true", "yes", "on"}
    frontend = os.environ.get("FRONTEND_URL", "")
    return frontend.startswith("https://")


def set_auth_cookies(response: Response, access: str, refresh: str, remember_me: bool = False) -> None:
    refresh_max_age = REMEMBER_ME_DAYS * 86400 if remember_me else REFRESH_TOKEN_DAYS * 86400
    secure = _cookie_secure()
    same_site = "none" if secure else "lax"
    response.set_cookie("access_token", access, httponly=True, secure=secure, samesite=same_site,
                        max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=secure, samesite=same_site,
                        max_age=refresh_max_age, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")
    response.delete_cookie("csrf_token", path="/")


# ── Role helpers ────────────────────────────────────────────────────────────

def _resolve_role(user_obj: User) -> str:
    """Map DB user to role hierarchy: admin > premium_user > free_user > guest."""
    if user_obj.is_admin or user_obj.role == "admin":
        return "admin"
    if user_obj.tier == "premium":
        return "premium_user"
    return "free_user"


def _effective_tier(user_obj: User) -> str:
    """Admins are always premium; other users use their stored tier."""
    if user_obj.is_admin or user_obj.role == "admin":
        return "premium"
    return user_obj.tier


# ── Pydantic schemas ──────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Optional[str] = Field(None, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class EmergentSessionIn(BaseModel):
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    session_id: Optional[str] = None


class UserOut(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    role: str = "free_user"
    tier: str = "free"
    subscription_status: Optional[str] = None
    free_trial_end: Optional[str] = None
    onboarded: bool = False
    preferences: dict = Field(default_factory=dict)
    disabled: bool = False
    email_verified: bool = False
    created_at: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None


class EmailVerifyIn(BaseModel):
    email: EmailStr


# ── User data helpers ─────────────────────────────────────────────────────

def _user_to_dict(u: User) -> dict:
    role = _resolve_role(u)
    tier = _effective_tier(u)
    free_trial_end = u.free_trial_end.isoformat() if u.free_trial_end else None
    return {
        "user_id": u.user_id,
        "email": u.email,
        "name": u.name or u.email.split("@")[0],
        "picture": u.picture,
        "role": role,
        "tier": tier,
        "subscription_status": u.subscription_status,
        "free_trial_end": free_trial_end,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "onboarded": u.onboarded or False,
        "preferences": u.preferences or {},
        "disabled": u.disabled or False,
        "email_verified": u.email_verified or False,
    }


# ── Dependencies ──────────────────────────────────────────────────────────

def _token_issued_before_password_change(payload: dict, user_obj: User) -> bool:
    changed_at = user_obj.password_changed_at
    if not changed_at:
        return False
    if changed_at.tzinfo is None:
        changed_at = changed_at.replace(tzinfo=timezone.utc)
    issued_at = payload.get("iat")
    if issued_at is None:
        return True
    try:
        issued_dt = datetime.fromtimestamp(float(issued_at), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return True
    return issued_dt < changed_at - timedelta(seconds=1)


async def get_current_user(request: Request) -> dict:
    sm = request.app.state.db
    async with sm() as session:
        token_str = None
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token_str = auth[7:]
        if not token_str:
            token_str = request.cookies.get("access_token")

        if token_str:
            try:
                payload = pyjwt.decode(token_str, _require_jwt_secret(), algorithms=[JWT_ALGORITHM])
                if payload.get("type") == "access":
                    result = await session.execute(
                        select(TokenBlacklist).where(TokenBlacklist.jti == payload.get("jti", ""))
                    )
                    if result.scalar_one_or_none():
                        raise HTTPException(401, "Token revoked")
                    result = await session.execute(
                        select(User).where(User.user_id == payload["sub"])
                    )
                    user = result.scalar_one_or_none()
                    if user:
                        if _token_issued_before_password_change(payload, user):
                            raise HTTPException(401, "Token expired by password change")
                        if user.disabled:
                            raise HTTPException(403, "Account disabled")
                        request.state.user_id = user.user_id
                        return _user_to_dict(user)
            except pyjwt.ExpiredSignatureError:
                pass
            except pyjwt.InvalidTokenError as e:
                logger.debug("JWT validation failed: %s", e)

        cookie_session = request.cookies.get("session_token")
        if cookie_session:
            result = await session.execute(
                select(UserSession).where(UserSession.session_token == cookie_session)
            )
            sess = result.scalar_one_or_none()
            if sess:
                if sess.expires_at.tzinfo is None:
                    sess.expires_at = sess.expires_at.replace(tzinfo=timezone.utc)
                if sess.expires_at > datetime.now(timezone.utc):
                    result = await session.execute(
                        select(User).where(User.user_id == sess.user_id)
                    )
                    user = result.scalar_one_or_none()
                    if user:
                        if user.disabled:
                            raise HTTPException(403, "Account disabled")
                        request.state.user_id = user.user_id
                        return _user_to_dict(user)

    raise HTTPException(status_code=401, detail="Not authenticated")


async def require_premium(user: dict = Depends(get_current_user)) -> dict:
    """Require the user's tier to be 'premium'."""
    if user.get("tier") != "premium":
        raise HTTPException(status_code=403, detail="Premium subscription required")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = user.get("role", "free_user")
    if ROLE_HIERARCHY.get(role, 0) < ROLE_HIERARCHY["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_role(required: str):
    async def _check(user: dict = Depends(get_current_user)):
        role = user.get("role", "free_user")
        if ROLE_HIERARCHY.get(role, 0) < ROLE_HIERARCHY.get(required, 0):
            raise HTTPException(status_code=403, detail=f"{required} role required")
        return user
    return _check


# ── Router ────────────────────────────────────────────────────────────────

def build_router() -> APIRouter:
    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/register", response_model=UserOut)
    async def register(payload: RegisterIn, request: Request, response: Response):
        valid, msg = validate_password(payload.password)
        if not valid:
            raise HTTPException(400, msg)
        sm = request.app.state.db
        async with sm() as session:
            email = payload.email.lower()
            result = await session.execute(select(User).where(User.email == email))
            if result.scalar_one_or_none():
                raise HTTPException(400, "Email already registered")

            user_id = f"user_{uuid.uuid4().hex[:12]}"
            free_trial_end = datetime.now(timezone.utc) + timedelta(days=FREE_TRIAL_DAYS)
            verify_token = secrets.token_urlsafe(32)
            user = User(
                user_id=user_id,
                email=email,
                name=payload.name or email.split("@")[0],
                hashed_password=await hash_password_async(payload.password),
                free_trial_end=free_trial_end,
                trial_started=True,
                password_changed_at=datetime.now(timezone.utc),
                email_verification_token=verify_token,
                email_verification_sent_at=datetime.now(timezone.utc),
            )
            session.add(user)

            # Seed default budgets for new user
            try:
                from budget_system import seed_default_budgets_for_user
                await seed_default_budgets_for_user(session, user_id)
            except Exception as e:
                logger.warning("Failed to seed budgets for new user: %s", str(e))

            await session.commit()

            logger.info("User %s registered. Verification token: %s", user_id[:16], verify_token[:16])

            access = create_access_token(user_id, email)
            refresh = create_refresh_token(user_id)
            set_auth_cookies(response, access, refresh)
            ud = _user_to_dict(user)
            ud["access_token"] = access
            ud["refresh_token"] = refresh
            return ud

    @router.post("/login", response_model=UserOut)
    async def login(payload: LoginIn, request: Request, response: Response):
        sm = request.app.state.db
        async with sm() as session:
            email = payload.email.lower()
            result = await session.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

            ip = request.client.host if request.client else None
            ua = (request.headers.get("user-agent", "") or "")[:512]

            async def _write_audit(uid, act, success, extra=None):
                session.add(
                    AuditLog(
                        user_id=uid,
                        action=act,
                        resource="auth",
                        detail=extra,
                        ip_address=ip,
                        user_agent=ua,
                        success=success,
                    )
                )

            # Account lockout check
            if user and user.locked_until:
                if user.locked_until.tzinfo is None:
                    user.locked_until = user.locked_until.replace(tzinfo=timezone.utc)
                if user.locked_until > datetime.now(timezone.utc):
                    remaining = int((user.locked_until - datetime.now(timezone.utc)).total_seconds())
                    await _write_audit(user.user_id, "login_locked", False, {"reason": "account_locked"})
                    await session.commit()
                    raise HTTPException(429, f"Account locked. Try again in {remaining} seconds.")
                user.locked_until = None
                user.login_attempts = 0

            if not user or not await verify_password_async(payload.password, user.hashed_password):
                if user:
                    user.login_attempts = (user.login_attempts or 0) + 1
                    if user.login_attempts >= 5:
                        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
                    await _write_audit(user.user_id, "login_failed", False, {"reason": "invalid_password", "attempts": user.login_attempts})
                    await session.commit()
                raise HTTPException(401, "Invalid email or password")
            if user.disabled:
                await _write_audit(user.user_id, "login_failed", False, {"reason": "account_disabled"})
                await session.commit()
                raise HTTPException(403, "Account disabled")

            # Reset lockout counters
            user.login_attempts = 0
            user.locked_until = None

            await _write_audit(user.user_id, "login", True)
            await session.commit()

            request.state.user_id = user.user_id
            access = create_access_token(user.user_id, email)
            refresh = create_refresh_token(user.user_id, remember_me=payload.remember_me)
            set_auth_cookies(response, access, refresh, remember_me=payload.remember_me)
            ud = _user_to_dict(user)
            ud["access_token"] = access
            ud["refresh_token"] = refresh
            return ud

    @router.post("/logout")
    async def logout(request: Request, response: Response):
        sm = request.app.state.db
        async with sm() as session:
            token_str = request.cookies.get("access_token")
            if token_str:
                try:
                    payload = pyjwt.decode(token_str, _require_jwt_secret(), algorithms=[JWT_ALGORITHM])
                    jti = payload.get("jti", "")
                    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc) if payload.get("exp") else datetime.now(timezone.utc) + timedelta(hours=1)
                    if jti:
                        session.add(TokenBlacklist(jti=jti, expires_at=exp))
                except pyjwt.PyJWTError as e:
                    logger.debug("Logout token decode skipped: %s", e)
            # Also blacklist refresh token
            refresh_str = request.cookies.get("refresh_token")
            if refresh_str:
                try:
                    payload = pyjwt.decode(refresh_str, _require_jwt_secret(), algorithms=[JWT_ALGORITHM])
                    jti = payload.get("jti", "")
                    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc) if payload.get("exp") else datetime.now(timezone.utc) + timedelta(days=7)
                    if jti:
                        session.add(TokenBlacklist(jti=jti, expires_at=exp))
                except pyjwt.PyJWTError as e:
                    logger.debug("Logout refresh token decode skipped: %s", e)
            session_token = request.cookies.get("session_token")
            if session_token:
                await session.execute(
                    delete(UserSession).where(UserSession.session_token == session_token)
                )
            await session.commit()
        clear_auth_cookies(response)
        return {"ok": True}

    @router.get("/me", response_model=UserOut)
    async def me(user: dict = Depends(get_current_user)):
        return user

    @router.get("/debug-cookies")
    async def debug_cookies(request: Request):
        """Debug: show what cookies and auth headers are being received."""
        auth_header = request.headers.get("Authorization", "")
        cookies = dict(request.cookies)
        origin = request.headers.get("Origin", "")
        referer = request.headers.get("Referer", "")
        return {
            "origin": origin,
            "referer": referer,
            "has_auth_header": bool(auth_header),
            "auth_header_prefix": auth_header[:20] + "..." if auth_header else "",
            "cookie_names": list(cookies.keys()),
            "has_access_token": "access_token" in cookies,
            "has_refresh_token": "refresh_token" in cookies,
            "has_csrf_token": "csrf_token" in cookies,
            "access_token_len": len(cookies.get("access_token", "")),
            "refresh_token_len": len(cookies.get("refresh_token", "")),
        }

    @router.post("/emergent-session", response_model=UserOut)
    async def emergent_session(payload: EmergentSessionIn, request: Request, response: Response):
        if not payload.access_token:
            raise HTTPException(400, "access_token is required")
        if payload.session_id and not payload.refresh_token:
            raise HTTPException(400, "Legacy session_id callbacks are no longer supported")

        try:
            secret = _require_jwt_secret()
        except RuntimeError as e:
            raise HTTPException(500, f"JWT secret error: {e}")

        try:
            token_data = pyjwt.decode(payload.access_token, secret, algorithms=[JWT_ALGORITHM])
            if token_data.get("type") != "access":
                raise HTTPException(401, "Invalid token type")
        except pyjwt.PyJWTError as e:
            logger.warning("emergent_session JWT decode failed: %s %s", type(e).__name__, e)
            raise HTTPException(401, f"Invalid access token: {type(e).__name__}")

        try:
            sm = request.app.state.db
            async with sm() as session:
                result = await session.execute(select(User).where(User.user_id == token_data["sub"]))
                user = result.scalar_one_or_none()
                if not user:
                    raise HTTPException(404, "User not found")
                if user.disabled:
                    raise HTTPException(403, "Account disabled")
                if _token_issued_before_password_change(token_data, user):
                    raise HTTPException(401, "Token expired by password change")

                if payload.refresh_token:
                    set_auth_cookies(response, payload.access_token, payload.refresh_token)
                user_dict = _user_to_dict(user)
                user_dict["access_token"] = payload.access_token
                user_dict["refresh_token"] = payload.refresh_token
                return user_dict
        except HTTPException:
            raise
        except Exception as e:
            logger.error("emergent_session DB failed for user %s: %s: %s",
                         token_data.get("sub", "unknown"), type(e).__name__, e)
            raise HTTPException(500, f"Session validation failed: {type(e).__name__}: {e}")

    @router.post("/refresh")
    async def refresh_token(request: Request, response: Response):
        # Accept token from cookie (browser) or Authorization header (localStorage)
        token = request.cookies.get("refresh_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        logger.info("refresh attempt: cookie=%s header=%s",
                    "yes" if request.cookies.get("refresh_token") else "no",
                    "yes" if request.headers.get("Authorization", "").startswith("Bearer ") else "no")
        if not token:
            logger.warning("refresh rejected: no refresh token in cookie or header")
            raise HTTPException(401, "No refresh token")
        try:
            payload = pyjwt.decode(token, _require_jwt_secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "refresh":
                logger.warning("refresh rejected: wrong token type for sub=%s", payload.get("sub"))
                raise HTTPException(401, "Invalid token type")
            sm = request.app.state.db
            async with sm() as session:
                # Check if refresh token is blacklisted (rotation detection)
                result = await session.execute(
                    select(TokenBlacklist).where(TokenBlacklist.jti == payload.get("jti", ""))
                )
                if result.scalar_one_or_none():
                    raise HTTPException(401, "Refresh token revoked")
                result = await session.execute(
                    select(User).where(User.user_id == payload["sub"])
                )
                user = result.scalar_one_or_none()
                if not user:
                    raise HTTPException(401, "User not found")
                if user.disabled:
                    raise HTTPException(403, "Account disabled")
                if _token_issued_before_password_change(payload, user):
                    raise HTTPException(401, "Refresh token expired by password change")
                # Rotate: blacklist old refresh token, issue new pair
                exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc) if payload.get("exp") else datetime.now(timezone.utc) + timedelta(days=7)
                session.add(TokenBlacklist(jti=payload["jti"], expires_at=exp))
                access = create_access_token(user.user_id, user.email)
                refresh = create_refresh_token(user.user_id)
                set_auth_cookies(response, access, refresh)
                await session.commit()
                return {"ok": True, "access_token": access, "refresh_token": refresh}
        except pyjwt.PyJWTError:
            raise HTTPException(401, "Invalid refresh token")

    @router.get("/sessions")
    async def list_sessions(request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(UserSession).where(UserSession.user_id == user["user_id"]).order_by(UserSession.created_at.desc())
            )
            sessions = result.scalars().all()
            return {"sessions": [
                {
                    "id": s.id,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                    "expires_at": s.expires_at.isoformat() if s.expires_at else None,
                    "remember_me": s.remember_me,
                    "ip_address": s.ip_address,
                    "user_agent": s.user_agent[:100] if s.user_agent else None,
                }
                for s in sessions
            ]}

    @router.delete("/sessions/{session_id}")
    async def revoke_session(session_id: int, request: Request, user: dict = Depends(get_current_user)):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user["user_id"])
            )
            sess = result.scalar_one_or_none()
            if not sess:
                raise HTTPException(404, "Session not found")
            await session.delete(sess)
            await session.commit()
            return {"ok": True}

    # ── Email verification ──────────────────────────────────────────────

    @router.post("/verify-email/send")
    async def send_verification_email(request: Request, user: dict = Depends(get_current_user)):
        """Generate and store a verification token, log it (in production would email it)."""
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(User).where(User.user_id == user["user_id"])
            )
            db_user = result.scalar_one_or_none()
            if not db_user:
                raise HTTPException(404, "User not found")
            if db_user.email_verified:
                return {"ok": True, "message": "Email already verified"}
            token = secrets.token_urlsafe(32)
            db_user.email_verification_token = token
            db_user.email_verification_sent_at = datetime.now(timezone.utc)
            await session.commit()
            frontend = os.environ.get("FRONTEND_URL", "")
            verify_link = f"{frontend}/verify-email?token={token}"
            logger.info("Verification link for %s: %s", user["user_id"][:16], verify_link)
            return {"ok": True, "message": "Verification email sent", "verify_url": verify_link}

    @router.post("/verify-email")
    async def verify_email(token: str, request: Request):
        """Verify email with a token."""
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(User).where(User.email_verification_token == token)
            )
            db_user = result.scalar_one_or_none()
            if not db_user:
                raise HTTPException(400, "Invalid verification token")
            db_user.email_verified = True
            db_user.email_verification_token = None
            db_user.email_verification_sent_at = None
            await session.commit()
            return {"ok": True, "message": "Email verified"}

    # ── OAuth diagnostic ────────────────────────────────────────────────

    @router.get("/oauth-status")
    async def oauth_status(request: Request):
        """Check if Google OAuth is configured (no secrets leaked)."""
        client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
        client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
        frontend_url = os.environ.get("FRONTEND_URL", "")
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        redirect_uri = f"{scheme}://{request.url.hostname}/api/auth/google/callback"
        return {
            "google_configured": bool(client_id and client_secret),
            "google_client_id_set": bool(client_id),
            "google_client_secret_set": bool(client_secret),
            "frontend_url": frontend_url or "(not set)",
            "redirect_uri": redirect_uri,
            "cookie_secure": _cookie_secure(),
        }

    # ── Google OAuth ────────────────────────────────────────────────────

    @router.get("/google")
    async def google_login(request: Request):
        client_id = os.environ.get("GOOGLE_CLIENT_ID")
        if not client_id:
            raise HTTPException(500, "Google OAuth not configured")
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        redirect_uri = f"{scheme}://{request.url.hostname}/api/auth/google/callback"
        state = generate_csrf_token()
        # Store state in TrueLayerState table for verification
        sm = request.app.state.db
        async with sm() as session:
            state_record = TrueLayerState(
                state=state,
                user_id=f"oauth_{uuid.uuid4().hex[:8]}",
                redirect_uri=redirect_uri,
                meta={"purpose": "google_oauth"},
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
            session.add(state_record)
            await session.commit()
        params = dict(
            client_id=client_id,
            redirect_uri=redirect_uri,
            response_type="code",
            scope="openid email profile",
            access_type="offline",
            prompt="select_account",
            state=state,
        )
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
        return RedirectResponse(url)

    @router.get("/google/callback")
    async def google_callback(code: str, state: str = None, request: Request = None):
        client_id = os.environ.get("GOOGLE_CLIENT_ID")
        client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise HTTPException(500, "Google OAuth not configured")

        # Validate state parameter (CSRF protection)
        if not state:
            logger.warning("Google OAuth callback missing state parameter")
            raise HTTPException(400, "Missing state parameter")
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(TrueLayerState).where(
                    TrueLayerState.state == state,
                    TrueLayerState.meta["purpose"].as_string() == "google_oauth",
                )
            )
            state_record = result.scalar_one_or_none()
            if not state_record:
                logger.warning("Google OAuth callback with invalid/expired state")
                raise HTTPException(400, "Invalid state parameter")
            # Clean up used state
            await session.delete(state_record)
            await session.commit()

        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        redirect_uri = f"{scheme}://{request.url.hostname}/api/auth/google/callback"
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data=dict(
                    code=code,
                    client_id=client_id,
                    client_secret=client_secret,
                    redirect_uri=redirect_uri,
                    grant_type="authorization_code",
                ),
            )
            if token_resp.status_code != 200:
                raise HTTPException(400, "Failed to exchange auth code")
            token_data = token_resp.json()
            id_token = token_data["id_token"]
            try:
                jwks_client = pyjwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", cache_keys=True)
                signing_key = jwks_client.get_signing_key_from_jwt(id_token)
                info = pyjwt.decode(
                    id_token, signing_key.key, algorithms=["RS256"],
                    audience=client_id, options={"require": ["sub", "email"]},
                )
            except Exception:
                raise HTTPException(400, "Invalid Google ID token: signature verification failed")
        email = info.get("email", "").lower()
        name = info.get("name") or email.split("@")[0]
        picture = info.get("picture")
        google_sub = info.get("sub")
        if not email:
            raise HTTPException(400, "Google account has no email")
        async with sm() as session:
            result = await session.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            ip = request.client.host if request.client else None
            ua = request.headers.get("user-agent", "")[:512] if request else ""
            if user is None:
                user_id = f"user_{uuid.uuid4().hex[:12]}"
                free_trial_end = datetime.now(timezone.utc) + timedelta(days=FREE_TRIAL_DAYS)
                user = User(
                    user_id=user_id,
                    email=email,
                    name=name,
                    picture=picture,
                    google_sub=google_sub,
                    hashed_password=await hash_password_async(secrets.token_urlsafe(16)),
                    free_trial_end=free_trial_end,
                    trial_started=True,
                    email_verified=True,
                )
                session.add(user)
                session.add(AuditLog(user_id=user_id, action="login", resource="auth",
                                     ip_address=ip, user_agent=ua, success=True))
                await session.commit()
            elif user.disabled:
                session.add(AuditLog(user_id=user.user_id, action="login_failed", resource="auth",
                                     detail={"reason": "account_disabled"}, ip_address=ip, user_agent=ua,
                                     success=False))
                await session.commit()
                raise HTTPException(403, "Account disabled")
            else:
                if picture and (not user.picture or user.picture != picture):
                    user.picture = picture
                if google_sub and not user.google_sub:
                    user.google_sub = google_sub
                session.add(AuditLog(user_id=user.user_id, action="login", resource="auth",
                                     ip_address=ip, user_agent=ua, success=True))
                await session.commit()
            access = create_access_token(user.user_id, email)
            refresh = create_refresh_token(user.user_id)
            frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
            if not frontend_url:
                raise HTTPException(500, "FRONTEND_URL not configured")
            redirect_url = f"{frontend_url}/callback#access_token={urllib.parse.quote(access, safe='')}&refresh_token={urllib.parse.quote(refresh, safe='')}"
            resp = RedirectResponse(url=redirect_url)
            set_auth_cookies(resp, access, refresh)
            return resp

    # ── Password reset ──────────────────────────────────────────────────

    @router.post("/forgot-password")
    async def forgot_password(payload: ForgotPasswordIn, request: Request):
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(User).where(User.email == payload.email.lower())
            )
            user = result.scalar_one_or_none()
            if user:
                token = secrets.token_urlsafe(32)
                reset = PasswordResetToken(
                    user_id=user.user_id,
                    token=token,
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                )
                session.add(reset)
                await session.commit()
                frontend_url = os.environ.get("FRONTEND_URL", "")
                reset_link = f"{frontend_url}/reset-password?token={token}"
                logger.info("Password reset link for %s: %s", user.user_id[:16], reset_link)
        return {"ok": True, "message": "If the email exists, a reset link has been sent."}

    @router.post("/change-password")
    async def change_password(payload: ChangePasswordIn, request: Request, user: dict = Depends(get_current_user)):
        valid, msg = validate_password(payload.new_password)
        if not valid:
            raise HTTPException(400, msg)
        if payload.current_password == payload.new_password:
            raise HTTPException(400, "New password must be different from current password")
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.user_id == user["user_id"]))
            db_user = result.scalar_one_or_none()
            if not db_user:
                raise HTTPException(404, "User not found")
            if not await verify_password_async(payload.current_password, db_user.hashed_password):
                raise HTTPException(400, "Current password is incorrect")
            db_user.hashed_password = await hash_password_async(payload.new_password)
            db_user.password_changed_at = datetime.now(timezone.utc)
            session_token = request.cookies.get("session_token", "")
            await session.execute(
                delete(UserSession).where(
                    UserSession.user_id == db_user.user_id,
                    UserSession.session_token != session_token,
                )
            )
            await session.commit()
            logger.info("Password changed for user %s", user["user_id"][:16])
            return {"ok": True}

    @router.post("/reset-password")
    async def reset_password(payload: ResetPasswordIn, request: Request):
        valid, msg = validate_password(payload.new_password)
        if not valid:
            raise HTTPException(400, msg)
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(
                select(PasswordResetToken).where(PasswordResetToken.token == payload.token)
            )
            rec = result.scalar_one_or_none()
            if not rec:
                raise HTTPException(400, "Invalid or used token")
            if rec.expires_at.tzinfo is None:
                rec.expires_at = rec.expires_at.replace(tzinfo=timezone.utc)
            if rec.expires_at < datetime.now(timezone.utc):
                raise HTTPException(400, "Token expired")
            await session.execute(
                update(User).where(User.user_id == rec.user_id).values(
                    hashed_password=await hash_password_async(payload.new_password),
                    password_changed_at=datetime.now(timezone.utc),
                )
            )
            # Invalidate all existing sessions after password reset
            await session.execute(
                delete(UserSession).where(UserSession.user_id == rec.user_id)
            )
            await session.delete(rec)
            await session.commit()
            logger.info("Password reset completed for user %s", rec.user_id[:16])
            return {"ok": True}

    return router


async def seed_admin(session):
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        logger.info("ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed")
        return
    result = await session.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()
    if existing is None:
        user = User(
            user_id=f"user_{uuid.uuid4().hex[:12]}",
            email=email,
            name="Admin",
            hashed_password=await hash_password_async(password),
            role="admin",
            is_admin=True,
            tier="premium",
            subscription_status="active",
            email_verified=True,
        )
        session.add(user)
        await session.commit()
        logger.info("Seeded admin user.")
    else:
        changed = False
        if not existing.is_admin or existing.tier != "premium":
            existing.is_admin = True
            existing.tier = "premium"
            existing.role = "admin"
            existing.subscription_status = "active"
            changed = True
        if not await verify_password_async(password, existing.hashed_password):
            existing.hashed_password = await hash_password_async(password)
            changed = True
        if changed:
            await session.commit()
            logger.info("Upgraded existing user to admin.")
