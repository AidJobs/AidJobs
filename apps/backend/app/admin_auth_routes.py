"""
Admin authentication endpoints.
Provides login, logout, and session status routes.
"""
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel
from app.rate_limit import limiter, RATE_LIMIT_LOGIN
from security.admin_auth import (
    verify_admin_password,
    set_admin_cookie,
    clear_admin_cookie,
    get_current_admin,
    check_admin_configured,
)

router = APIRouter(prefix="/api/admin", tags=["admin-auth"])


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
@limiter.limit(RATE_LIMIT_LOGIN)
async def admin_login(request: Request, response: Response, body: LoginRequest):
    """
    Admin login with password.
    Sets httpOnly session cookie on success.
    Returns 503 if ADMIN_PASSWORD not configured.
    Returns 401 on invalid password.
    """
    if not check_admin_configured():
        raise HTTPException(
            status_code=503,
            detail="Admin not configured"
        )
    
    if not verify_admin_password(body.password):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )
    
    set_admin_cookie(response, "admin")
    return {"authenticated": True}


@router.post("/logout")
async def admin_logout(response: Response):
    """Admin logout. Clears session cookie."""
    clear_admin_cookie(response)
    return {"authenticated": False}


@router.get("/session")
async def admin_session(request: Request):
    """Check admin authentication status."""
    admin = get_current_admin(request)
    return {"authenticated": admin is not None}
