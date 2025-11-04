"""
Admin authentication with httpOnly cookie session.
Uses HMAC-signed session tokens with 8-hour expiry.
"""
import os
import hmac
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, Request, Response

COOKIE_NAME = "aidjobs_admin_session"
SESSION_DURATION_HOURS = 8
SESSION_MAX_AGE = SESSION_DURATION_HOURS * 3600


def get_cookie_secret() -> str:
    """Get COOKIE_SECRET from environment (fallback to SESSION_SECRET for backwards compat)."""
    secret = os.getenv("COOKIE_SECRET") or os.getenv("SESSION_SECRET")
    if not secret:
        raise ValueError("COOKIE_SECRET or SESSION_SECRET environment variable required")
    return secret


def get_admin_password() -> Optional[str]:
    """Get ADMIN_PASSWORD from environment."""
    return os.getenv("ADMIN_PASSWORD")


def is_dev_mode() -> bool:
    """Check if running in development mode."""
    return os.getenv("AIDJOBS_ENV", "").lower() == "dev"


def create_session_token(username: str, secret: str) -> str:
    """
    Create HMAC-signed session token.
    Format: username|expiry_timestamp|signature
    """
    expiry = datetime.utcnow() + timedelta(hours=SESSION_DURATION_HOURS)
    expiry_ts = int(expiry.timestamp())
    
    message = f"{username}|{expiry_ts}"
    signature = hmac.new(
        secret.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"{message}|{signature}"


def verify_session_token(token: str, secret: str) -> Optional[str]:
    """
    Verify HMAC-signed session token.
    Returns username if valid, None otherwise.
    """
    try:
        parts = token.split("|")
        if len(parts) != 3:
            return None
        
        username, expiry_ts_str, signature = parts
        expiry_ts = int(expiry_ts_str)
        
        if datetime.utcnow().timestamp() > expiry_ts:
            return None
        
        message = f"{username}|{expiry_ts_str}"
        expected_signature = hmac.new(
            secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_signature):
            return None
        
        return username
    except (ValueError, IndexError):
        return None


def set_admin_cookie(response: Response, username: str):
    """Set httpOnly session cookie."""
    try:
        secret = get_cookie_secret()
    except ValueError:
        raise HTTPException(status_code=500, detail="Server configuration error")
    
    token = create_session_token(username, secret)
    
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=not is_dev_mode(),
        samesite="lax",
        path="/",
        max_age=SESSION_MAX_AGE,
    )


def clear_admin_cookie(response: Response):
    """Clear session cookie."""
    response.delete_cookie(key=COOKIE_NAME, path="/")


def get_current_admin(request: Request) -> Optional[str]:
    """
    Get current admin username from session cookie.
    Returns None if not authenticated.
    """
    if is_dev_mode() and request.headers.get("X-Dev-Bypass") == "1":
        return "dev-admin"
    
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    
    try:
        secret = get_cookie_secret()
    except ValueError:
        return None
    
    return verify_session_token(token, secret)


def admin_required(request: Request) -> str:
    """
    FastAPI dependency that requires admin authentication.
    Raises 401 HTTPException if not authenticated.
    """
    admin = get_current_admin(request)
    if not admin:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
    return admin


def verify_admin_password(password: str) -> bool:
    """
    Verify password against ADMIN_PASSWORD.
    Uses constant-time comparison to prevent timing attacks.
    """
    admin_password = get_admin_password()
    if not admin_password:
        return False
    
    return secrets.compare_digest(password, admin_password)


def check_admin_configured() -> bool:
    """Check if admin authentication is properly configured."""
    return get_admin_password() is not None
