"""
Admin session authentication with password + httpOnly cookie.
Dev bypass when AIDJOBS_ENV=dev.
"""
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, Request, Response, Depends
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

# Session configuration
SESSION_COOKIE_NAME = "aidjobs_admin_session"
SESSION_MAX_AGE = 86400  # 24 hours
SECRET_KEY = os.getenv("SESSION_SECRET", secrets.token_hex(32))

serializer = URLSafeTimedSerializer(SECRET_KEY)


def create_session_token(username: str) -> str:
    """Create a signed session token."""
    return serializer.dumps({"username": username, "created": datetime.utcnow().isoformat()})


def verify_session_token(token: str, max_age: int = SESSION_MAX_AGE) -> Optional[dict]:
    """Verify and decode a session token."""
    try:
        data = serializer.loads(token, max_age=max_age)
        return data
    except (BadSignature, SignatureExpired):
        return None


def set_session_cookie(response: Response, username: str):
    """Set httpOnly session cookie."""
    token = create_session_token(username)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=os.getenv("AIDJOBS_ENV", "").lower() != "dev",  # Secure in production
        samesite="lax",
        max_age=SESSION_MAX_AGE,
    )


def clear_session_cookie(response: Response):
    """Clear session cookie."""
    response.delete_cookie(key=SESSION_COOKIE_NAME)


def get_current_admin(request: Request) -> Optional[str]:
    """
    Get current admin username from session cookie.
    Returns None if not authenticated.
    Dev bypass: returns 'dev-admin' when AIDJOBS_ENV=dev.
    """
    # Dev bypass
    if os.getenv("AIDJOBS_ENV", "").lower() == "dev":
        return "dev-admin"
    
    # Check session cookie
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    
    session_data = verify_session_token(token)
    if not session_data:
        return None
    
    return session_data.get("username")


def require_admin(request: Request) -> str:
    """
    Dependency that requires admin authentication.
    Raises HTTPException if not authenticated.
    """
    admin = get_current_admin(request)
    if not admin:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
    return admin


def verify_admin_password(password: str) -> bool:
    """Verify admin password against ADMIN_PASSWORD env var."""
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_password:
        # No password set - deny access in production, allow in dev
        return os.getenv("AIDJOBS_ENV", "").lower() == "dev"
    
    return secrets.compare_digest(password, admin_password)
