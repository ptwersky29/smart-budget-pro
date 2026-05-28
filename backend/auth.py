"""Authentication module: JWT + remember me + session management + role permissions."""
import os
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt as pyjwt
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update, delete
import httpx
import urllib.parse
from starlette.responses import RedirectResponse

from db import User, UserSession, PasswordResetToken, TokenBlacklist
from security import validate_password

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 30
REFRESH_TOKEN_DAYS = 7
REMEMBER_ME_DAYS = 30
FREE_TRIAL_DAYS = 14


def _secret() -> str:
    val = os.environ.get("JWT_SECRET")
    if not val:
        raise RuntimeError("JWT_SECRET environment variable is required")
    return val


def _jti() -> str:
    return uuid.uuid4().hex


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, jti: str = None) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "jti": jti or _jti(),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return pyjwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, remember_me: bool = False, jti: str = None) -> str:
    days = REMEMBER_ME_DAYS if remember_me else REFRESH_TOKEN_DAYS
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": jti or _jti(),
        "exp": datetime.now(timezone.utc) + timedelta(days=days),
    }
    return pyjwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str, remember_me: bool = False) -> None:
    refresh_max_age = REMEMBER_ME_DAYS * 86400 if remember_me else REFRESH_TOKEN_DAYS * 86400
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=refresh_max_age, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")


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


class UserOut(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    role: str = "user"
    tier: str = "free"
    subscription_status: Optional[str] = None
    free_trial_end: Optional[str] = None
    onboarded: bool = False
    preferences: dict = Field(default_factory=dict)
    disabled: bool = False
    created_at: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None


def _user_to_dict(u: User, check_trial: bool = True) -> dict:
    role = u.role or ("admin" if u.is_admin else "user")
    tier = u.tier
    free_trial_end = u.free_trial_end.isoformat() if u.free_trial_end else None

    if check_trial and tier != "premium" and free_trial_end:
        now = datetime.now(timezone.utc)
        trial_end = u.free_trial_end
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=timezone.utc)
        if trial_end > now:
            tier = "premium"

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
        "onboarded": u.onboarded,
        "preferences": u.preferences or {},
        "disabled": u.disabled,
    }


# ── Dependencies ──────────────────────────────────────────────────────────

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
                payload = pyjwt.decode(token_str, _secret(), algorithms=[JWT_ALGORITHM])
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
                        if user.disabled:
                            raise HTTPException(403, "Account disabled")
                        return _user_to_dict(user)
            except pyjwt.PyJWTError:
                pass

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
                            return _user_to_dict(user)

    raise HTTPException(status_code=401, detail="Not authenticated")


async def require_premium(user: dict = Depends(get_current_user)) -> dict:
    if user.get("tier") != "premium" and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Premium subscription required. Visit /pricing to upgrade.")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = user.get("role", "user")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_role(required: str):
    async def _check(user: dict = Depends(get_current_user)):
        roles = {"admin": 2, "moderator": 1, "user": 0}
        if roles.get(user.get("role", "user"), 0) < roles.get(required, 0):
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
            user = User(
                user_id=user_id,
                email=email,
                name=payload.name or email.split("@")[0],
                hashed_password=hash_password(payload.password),
                free_trial_end=free_trial_end,
                trial_started=True,
                password_changed_at=datetime.now(timezone.utc),
            )
            session.add(user)
            await session.commit()

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

            # Account lockout check
            if user and user.locked_until:
                if user.locked_until.tzinfo is None:
                    user.locked_until = user.locked_until.replace(tzinfo=timezone.utc)
                if user.locked_until > datetime.now(timezone.utc):
                    remaining = int((user.locked_until - datetime.now(timezone.utc)).total_seconds())
                    raise HTTPException(429, f"Account locked. Try again in {remaining} seconds.")
                user.locked_until = None
                user.login_attempts = 0

            if not user or not verify_password(payload.password, user.hashed_password):
                if user:
                    user.login_attempts = (user.login_attempts or 0) + 1
                    if user.login_attempts >= 5:
                        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
                    await session.commit()
                raise HTTPException(401, "Invalid email or password")
            if user.disabled:
                raise HTTPException(403, "Account disabled")

            user.login_attempts = 0
            user.locked_until = None
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
                    payload = pyjwt.decode(token_str, _secret(), algorithms=[JWT_ALGORITHM])
                    jti = payload.get("jti", "")
                    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc) if payload.get("exp") else datetime.now(timezone.utc) + timedelta(hours=1)
                    if jti:
                        session.add(TokenBlacklist(jti=jti, expires_at=exp))
                except pyjwt.PyJWTError:
                    pass
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

    @router.post("/refresh")
    async def refresh_token(request: Request, response: Response):
        token = request.cookies.get("refresh_token")
        if not token:
            raise HTTPException(401, "No refresh token")
        try:
            payload = pyjwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "refresh":
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

    @router.get("/google")
    async def google_login(request: Request):
        client_id = os.environ.get("GOOGLE_CLIENT_ID")
        if not client_id:
            raise HTTPException(500, "Google OAuth not configured")
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        redirect_uri = f"{scheme}://{request.url.hostname}/api/auth/google/callback"
        params = dict(
            client_id=client_id,
            redirect_uri=redirect_uri,
            response_type="code",
            scope="openid email profile",
            access_type="offline",
            prompt="select_account",
        )
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
        return RedirectResponse(url)

    @router.get("/google/callback")
    async def google_callback(code: str, request: Request):
        client_id = os.environ.get("GOOGLE_CLIENT_ID")
        client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise HTTPException(500, "Google OAuth not configured")
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
        sm = request.app.state.db
        async with sm() as session:
            result = await session.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            if user is None:
                user_id = f"user_{uuid.uuid4().hex[:12]}"
                free_trial_end = datetime.now(timezone.utc) + timedelta(days=FREE_TRIAL_DAYS)
                user = User(
                    user_id=user_id,
                    email=email,
                    name=name,
                    picture=picture,
                    google_sub=google_sub,
                    hashed_password=hash_password(secrets.token_urlsafe(16)),
                    free_trial_end=free_trial_end,
                    trial_started=True,
                )
                session.add(user)
                await session.commit()
            elif user.disabled:
                raise HTTPException(403, "Account disabled")
            else:
                if picture and (not user.picture or user.picture != picture):
                    user.picture = picture
                if google_sub and not user.google_sub:
                    user.google_sub = google_sub
                await session.commit()
            access = create_access_token(user.user_id, email)
            refresh = create_refresh_token(user.user_id)
            frontend_url = os.environ.get("FRONTEND_URL")
            if not frontend_url:
                raise HTTPException(500, "FRONTEND_URL not configured")
            redirect_url = f"{frontend_url}/dashboard#access_token={urllib.parse.quote(access)}&refresh_token={urllib.parse.quote(refresh)}"
            resp = RedirectResponse(url=redirect_url)
            set_auth_cookies(resp, access, refresh)
            return resp

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
                logger.info(f"password reset link generated for user {user.user_id[:16]}")
        return {"ok": True, "message": "If the email exists, a reset link has been sent."}

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
                    hashed_password=hash_password(payload.new_password),
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
        logger.warning("ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed")
        return
    result = await session.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()
    if existing is None:
        user = User(
            user_id=f"user_{uuid.uuid4().hex[:12]}",
            email=email,
            name="Admin",
            hashed_password=hash_password(password),
            role="admin",
            is_admin=True,
            tier="premium",
            subscription_status="active",
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
        if not verify_password(password, existing.hashed_password):
            existing.hashed_password = hash_password(password)
            changed = True
        if changed:
            await session.commit()
            logger.info("Upgraded existing user to admin.")
