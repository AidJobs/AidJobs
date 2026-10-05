"""
Admin authentication endpoints.
Provides login, logout, and session status routes.
"""
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app.rate_limit import RATE_LIMIT_LOGIN, limiter
from security.admin_auth import (
    check_admin_configured,
    clear_admin_cookie,
    get_current_admin,
    set_admin_cookie,
    verify_admin_password,
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
    import logging
    logger = logging.getLogger(__name__)
    
    # Log login attempt (for debugging)
    client_host = request.client.host if request.client else 'unknown'
    logger.info(f"[admin_login] Login attempt from {client_host}")
    
    # Check if COOKIE_SECRET is set (required for session cookies)
    try:
        from security.admin_auth import get_cookie_secret
        get_cookie_secret()
    except ValueError as e:
        logger.error(f"[admin_login] COOKIE_SECRET not configured: {e}")
        raise HTTPException(
            status_code=500,
            detail="COOKIE_SECRET not configured. Please set COOKIE_SECRET environment variable."
        )
    
    if not check_admin_configured():
        logger.warning("[admin_login] Admin not configured (ADMIN_PASSWORD not set)")
        raise HTTPException(
            status_code=503,
            detail="Admin not configured"
        )
    
    # Verify password
    password_match = verify_admin_password(body.password)
    if not password_match:
        logger.warning(f"[admin_login] Invalid password attempt from {client_host}")
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )
    
    # Set session cookie
    try:
        set_admin_cookie(response, "admin")
        logger.info(f"[admin_login] Login successful from {client_host}")
        return {"authenticated": True}
    except Exception as e:
        logger.error(f"[admin_login] Failed to set cookie: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create session"
        )


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


