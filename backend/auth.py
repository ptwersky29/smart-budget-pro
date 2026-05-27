"""Authentication module: JWT + Emergent Google OAuth."""
import os
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update, delete

from db import User, UserSession, PasswordResetToken

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24
REFRESH_TOKEN_DAYS = 7
EMERGENT_SESSION_DAYS = 7


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=REFRESH_TOKEN_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6)


class EmergentSessionIn(BaseModel):
    session_id: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    role: str = "user"
    tier: str = "free"
    onboarded: bool = False
    preferences: dict = {}
    disabled: bool = False
    created_at: Optional[str] = None


def _user_to_dict(u: User) -> dict:
    return {
        "user_id": u.user_id,
        "email": u.email,
        "name": u.name or u.email.split("@")[0],
        "picture": u.picture,
        "role": "admin" if u.is_admin else "user",
        "tier": u.tier,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "onboarded": u.onboarded,
        "preferences": u.preferences or {},
        "disabled": u.disabled,
    }


async def get_current_user(request: Request) -> dict:
    sm = request.app.state.db
    async with sm() as session:
        candidates = []
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            candidates.append(("bearer", auth[7:]))
        cookie_token = request.cookies.get("access_token")
        if cookie_token:
            candidates.append(("cookie", cookie_token))
        for source, token in candidates:
            if token:
                try:
                    payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
                    if payload.get("type") == "access":
                        result = await session.execute(
                            select(User).where(User.user_id == payload["sub"])
                        )
                        user = result.scalar_one_or_none()
                        if user:
                            return _user_to_dict(user)
                except jwt.PyJWTError:
                    pass

        candidates = []
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            candidates.append(("bearer", auth[7:]))
        cookie_session = request.cookies.get("session_token")
        if cookie_session:
            candidates.append(("cookie", cookie_session))
        for source, session_token in candidates:
            if session_token:
                result = await session.execute(
                    select(UserSession).where(UserSession.session_token == session_token)
                )
                sess = result.scalar_one_or_none()
                if sess and sess.expires_at.tzinfo is None:
                    sess.expires_at = sess.expires_at.replace(tzinfo=timezone.utc)
                if sess and sess.expires_at > datetime.now(timezone.utc):
                    result = await session.execute(
                        select(User).where(User.user_id == sess.user_id)
                    )
                    user = result.scalar_one_or_none()
                    if user:
                        return _user_to_dict(user)

    raise HTTPException(status_code=401, detail="Not authenticated")


async def require_premium(user: dict = Depends(get_current_user)) -> dict:
    if user.get("tier") != "premium" and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Premium subscription required")
    return user


def build_router() -> APIRouter:
    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/register", response_model=UserOut)
    async def register(payload: RegisterIn, request: Request, response: Response):
        sm = request.app.state.db
        async with sm() as session:
            email = payload.email.lower()
            result = await session.execute(select(User).where(User.email == email))
            if result.scalar_one_or_none():
                raise HTTPException(400, "Email already registered")

            user_id = f"user_{uuid.uuid4().hex[:12]}"
            user = User(
                user_id=user_id,
                email=email,
                name=payload.name or email.split("@")[0],
                hashed_password=hash_password(payload.password),
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
            if not user or not verify_password(payload.password, user.hashed_password):
                raise HTTPException(401, "Invalid email or password")

            access = create_access_token(user.user_id, email)
            refresh = create_refresh_token(user.user_id)
            set_auth_cookies(response, access, refresh)
            ud = _user_to_dict(user)
            ud["access_token"] = access
            ud["refresh_token"] = refresh
            return ud

    @router.post("/logout")
    async def logout(request: Request, response: Response):
        sm = request.app.state.db
        async with sm() as session:
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
            payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "refresh":
                raise HTTPException(401, "Invalid token type")
            sm = request.app.state.db
            async with sm() as session:
                result = await session.execute(
                    select(User).where(User.user_id == payload["sub"])
                )
                user = result.scalar_one_or_none()
                if not user:
                    raise HTTPException(401, "User not found")
                access = create_access_token(user.user_id, user.email)
                response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                                    max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
                return {"ok": True}
        except jwt.PyJWTError:
            raise HTTPException(401, "Invalid refresh token")

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
        import urllib.parse
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
        from starlette.responses import RedirectResponse
        return RedirectResponse(url)

    @router.get("/google/callback")
    async def google_callback(code: str, request: Request):
        client_id = os.environ.get("GOOGLE_CLIENT_ID")
        client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise HTTPException(500, "Google OAuth not configured")
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        redirect_uri = f"{scheme}://{request.url.hostname}/api/auth/google/callback"
        import httpx
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
            import jwt as pyjwt
            info = pyjwt.decode(id_token, options={"verify_signature": False})
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
                user = User(
                    user_id=user_id,
                    email=email,
                    name=name,
                    picture=picture,
                    google_sub=google_sub,
                    hashed_password=hash_password(secrets.token_urlsafe(16)),
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
            frontend_url = os.environ.get("FRONTEND_URL", "https://smart-budget-pro-ewtm.vercel.app")
            import urllib.parse
            from starlette.responses import RedirectResponse
            redirect_url = f"{frontend_url}/dashboard?access_token={urllib.parse.quote(access)}&refresh_token={urllib.parse.quote(refresh)}"
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
                logger.info(f"PASSWORD RESET LINK: {os.environ.get('FRONTEND_URL', '')}/reset?token={token}")
        return {"ok": True, "message": "If the email exists, a reset link has been sent."}

    @router.post("/reset-password")
    async def reset_password(payload: ResetPasswordIn, request: Request):
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
                    hashed_password=hash_password(payload.new_password)
                )
            )
            await session.delete(rec)
            await session.commit()
            return {"ok": True}

    return router


async def seed_admin(session):
    email = os.environ.get("ADMIN_EMAIL", "admin@financeai.app")
    password = os.environ.get("ADMIN_PASSWORD", "FinanceAI2026!")
    result = await session.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()
    if existing is None:
        user = User(
            user_id=f"user_{uuid.uuid4().hex[:12]}",
            email=email,
            name="Admin",
            hashed_password=hash_password(password),
            is_admin=True,
            tier="premium",
        )
        session.add(user)
        await session.commit()
        logger.info("Seeded admin user.")
    else:
        changed = False
        if not existing.is_admin or existing.tier != "premium":
            existing.is_admin = True
            existing.tier = "premium"
            changed = True
        if not verify_password(password, existing.hashed_password):
            existing.hashed_password = hash_password(password)
            changed = True
        if changed:
            await session.commit()
            logger.info("Upgraded existing user to admin.")
