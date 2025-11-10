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


@router.get("/config-check")
async def admin_config_check():
    """
    Diagnostic endpoint to check admin configuration.
    Returns configuration status without exposing sensitive data.
    """
    import os
    import logging
    from security.admin_auth import get_admin_password, is_dev_mode, get_cookie_secret
    
    logger = logging.getLogger(__name__)
    
    try:
        cookie_secret = get_cookie_secret()
        cookie_secret_set = True
        cookie_secret_length = len(cookie_secret)
    except ValueError as e:
        logger.warning(f"[config_check] COOKIE_SECRET error: {e}")
        cookie_secret_set = False
        cookie_secret_length = 0
    
    admin_password = get_admin_password()
    
    is_dev = is_dev_mode()
    admin_configured = check_admin_configured()
    
    # Determine status
    if cookie_secret_set and admin_configured:
        if is_dev and not admin_password:
            status = "ok_dev_mode"  # Dev mode without password is OK
        elif admin_password:
            status = "ok_production"  # Production mode with password
        else:
            status = "ok_dev_mode"  # Dev mode (shouldn't happen, but safe)
    else:
        status = "missing_config"
    
    config = {
        "admin_password_set": bool(admin_password),
        "admin_password_length": len(admin_password) if admin_password else 0,
        "cookie_secret_set": cookie_secret_set,
        "cookie_secret_length": cookie_secret_length,
        "aidjobs_env": os.getenv("AIDJOBS_ENV", "not set"),
        "is_dev_mode": is_dev,
        "admin_configured": admin_configured,
        "status": status,
        "recommendations": []
    }
    
    # Add recommendations (only for production or if something is missing)
    if not cookie_secret_set:
        config["recommendations"].append("Set COOKIE_SECRET environment variable")
    if not is_dev and not admin_password:
        config["recommendations"].append("Set ADMIN_PASSWORD environment variable (required in production)")
    elif is_dev and not admin_password:
        config["recommendations"].append("Optional: Set ADMIN_PASSWORD for password protection in dev mode")
    elif is_dev and admin_password:
        config["recommendations"].append("Consider setting AIDJOBS_ENV=production for production deployment")
    
    return config
