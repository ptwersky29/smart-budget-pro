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

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24  # 24h for SaaS comfort
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


# Pydantic models
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
    created_at: Optional[str] = None


async def _get_db_from_request(request: Request):
    return request.app.state.db


async def get_current_user(request: Request) -> dict:
    db = request.app.state.db
    # 1. Try JWT access cookie / bearer
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        try:
            payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "access":
                user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
                if user:
                    return user
        except jwt.PyJWTError:
            pass

    # 2. Try Emergent session_token cookie
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            session_token = auth[7:]
    if session_token:
        session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if session:
            expires = session["expires_at"]
            if isinstance(expires, str):
                expires = datetime.fromisoformat(expires)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires > datetime.now(timezone.utc):
                user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
                if user:
                    return user

    raise HTTPException(status_code=401, detail="Not authenticated")


async def require_premium(user: dict = Depends(get_current_user)) -> dict:
    if user.get("tier") != "premium" and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Premium subscription required")
    return user


def build_router() -> APIRouter:
    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/register", response_model=UserOut)
    async def register(payload: RegisterIn, request: Request, response: Response):
        db = request.app.state.db
        email = payload.email.lower()
        if await db.users.find_one({"email": email}):
            raise HTTPException(400, "Email already registered")
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        doc = {
            "user_id": user_id,
            "email": email,
            "name": payload.name or email.split("@")[0],
            "picture": None,
            "password_hash": hash_password(payload.password),
            "role": "user",
            "tier": "free",
            "ai_provider_configs": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(doc)
        access = create_access_token(user_id, email)
        refresh = create_refresh_token(user_id)
        set_auth_cookies(response, access, refresh)
        doc.pop("password_hash", None)
        doc.pop("_id", None)
        return doc

    @router.post("/login", response_model=UserOut)
    async def login(payload: LoginIn, request: Request, response: Response):
        db = request.app.state.db
        email = payload.email.lower()
        user = await db.users.find_one({"email": email})
        if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(401, "Invalid email or password")
        access = create_access_token(user["user_id"], email)
        refresh = create_refresh_token(user["user_id"])
        set_auth_cookies(response, access, refresh)
        user.pop("password_hash", None)
        user.pop("_id", None)
        return user

    @router.post("/logout")
    async def logout(request: Request, response: Response):
        session_token = request.cookies.get("session_token")
        if session_token:
            await request.app.state.db.user_sessions.delete_one({"session_token": session_token})
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
            user = await request.app.state.db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
            if not user:
                raise HTTPException(401, "User not found")
            access = create_access_token(user["user_id"], user["email"])
            response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                                max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
            return {"ok": True}
        except jwt.PyJWTError:
            raise HTTPException(401, "Invalid refresh token")

    @router.post("/forgot-password")
    async def forgot_password(payload: ForgotPasswordIn, request: Request):
        db = request.app.state.db
        user = await db.users.find_one({"email": payload.email.lower()})
        if user:
            token = secrets.token_urlsafe(32)
            await db.password_reset_tokens.insert_one({
                "token": token,
                "user_id": user["user_id"],
                "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
                "used": False,
            })
            logger.info(f"PASSWORD RESET LINK: {os.environ.get('FRONTEND_URL', '')}/reset?token={token}")
        return {"ok": True, "message": "If the email exists, a reset link has been sent."}

    @router.post("/reset-password")
    async def reset_password(payload: ResetPasswordIn, request: Request):
        db = request.app.state.db
        rec = await db.password_reset_tokens.find_one({"token": payload.token})
        if not rec or rec.get("used"):
            raise HTTPException(400, "Invalid or used token")
        expires = rec["expires_at"]
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(400, "Token expired")
        await db.users.update_one({"user_id": rec["user_id"]},
                                  {"$set": {"password_hash": hash_password(payload.new_password)}})
        await db.password_reset_tokens.update_one({"token": payload.token}, {"$set": {"used": True}})
        return {"ok": True}


    return router


async def seed_admin(db):
    email = os.environ.get("ADMIN_EMAIL", "admin@financeai.app")
    password = os.environ.get("ADMIN_PASSWORD", "FinanceAI2026!")
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": email,
            "name": "Admin",
            "password_hash": hash_password(password),
            "role": "admin",
            "tier": "premium",
            "ai_provider_configs": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin user.")
    elif not verify_password(password, existing.get("password_hash", "")):
        await db.users.update_one({"email": email},
                                  {"$set": {"password_hash": hash_password(password),
                                            "role": "admin", "tier": "premium"}})
