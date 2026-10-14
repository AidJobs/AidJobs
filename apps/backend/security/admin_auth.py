"""
Admin authentication with an HMAC session token.

The browser cookie and the API credential are different transports of one
token. The token alphabet is limited to characters that survive both cookie
storage and encodeURIComponent, so a proxy cannot silently rewrite it.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import HTTPException, Request, Response

COOKIE_NAME = "aidjobs_admin_session"
# Server-to-server credential. The admin app copies its own cookie into this
# header. Browsers do not receive the login response as a script-readable token.
SESSION_HEADER = "X-Aidjobs-Admin-Session"
SESSION_DURATION_HOURS = 8
SESSION_MAX_AGE = SESSION_DURATION_HOURS * 3600
TOKEN_VERSION = "v1"
# encodeURIComponent leaves this alphabet unchanged. Dots separate version,
# payload, and signature. The payload itself is base64url and contains no dots.
_TOKEN_GRAMMAR = re.compile(r"^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$")


def get_cookie_secret() -> str:
    """Get COOKIE_SECRET from environment (fallback to SESSION_SECRET for backwards compat)."""
    secret = os.getenv("COOKIE_SECRET") or os.getenv("SESSION_SECRET")
    if not secret:
        raise ValueError("COOKIE_SECRET or SESSION_SECRET environment variable required")
    return secret


def get_admin_password() -> Optional[str]:
    """Get ADMIN_PASSWORD from environment."""
    password = os.getenv("ADMIN_PASSWORD")
    if password and password.strip():
        return password.strip()
    return None


def is_dev_mode() -> bool:
    """Check if running in development mode."""
    return os.getenv("AIDJOBS_ENV", "").lower() == "dev"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def encode_uri_component(value: str) -> str:
    """Match JavaScript encodeURIComponent, which Next uses for cookie values."""
    return quote(value, safe="-_.!~*'()")


def create_session_token(username: str, secret: str) -> str:
    """
    HMAC-signed session token.

    Wire format: v1.<base64url payload>.<base64url signature>
    The signature covers the version and payload exactly as transmitted.
    """
    if not isinstance(username, str) or not username or "|" in username or "." in username:
        raise ValueError("Invalid session username")

    expiry = datetime.now(timezone.utc) + timedelta(hours=SESSION_DURATION_HOURS)
    payload = json.dumps(
        {"exp": int(expiry.timestamp()), "u": username},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    payload_b64 = _b64url(payload)
    signing_input = f"{TOKEN_VERSION}.{payload_b64}".encode("ascii")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    token = f"{TOKEN_VERSION}.{payload_b64}.{_b64url(signature)}"
    if encode_uri_component(token) != token or not _TOKEN_GRAMMAR.fullmatch(token):
        raise ValueError("Session token is not cookie-safe")
    return token


def verify_session_token(token: str, secret: str) -> Optional[str]:
    """
    Verify an HMAC session token.
    Returns the username when the token is intact and unexpired.
    """
    try:
        if not isinstance(token, str) or encode_uri_component(token) != token:
            return None
        if not _TOKEN_GRAMMAR.fullmatch(token):
            return None
        version, payload_b64, signature_b64 = token.split(".")
        if version != TOKEN_VERSION:
            return None

        payload = json.loads(_b64url_decode(payload_b64))
        if not isinstance(payload, dict):
            return None
        username = payload.get("u")
        expiry_ts = payload.get("exp")
        if not isinstance(username, str) or not username:
            return None
        if type(expiry_ts) is not int:
            return None
        if datetime.now(timezone.utc).timestamp() > expiry_ts:
            return None

        signing_input = f"{version}.{payload_b64}".encode("ascii")
        expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual = _b64url_decode(signature_b64)
        if not hmac.compare_digest(expected, actual):
            return None
        return username
    except (ValueError, json.JSONDecodeError, TypeError):
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
    response.headers[SESSION_HEADER] = token


def clear_admin_cookie(response: Response):
    """Clear session cookie with the same attributes used when it was set."""
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        secure=not is_dev_mode(),
        httponly=True,
        samesite="lax",
    )


def session_token_from_request(request: Request) -> Optional[str]:
    """
    Read the session credential.

    A present header wins, including when it is invalid. The admin app sends
    only that header. Falling through to a cookie would hide a bad header.
    Direct API clients that do not send the header still use the cookie.
    """
    header = request.headers.get(SESSION_HEADER)
    if header is not None and header.strip():
        return header.strip()
    return request.cookies.get(COOKIE_NAME)


def get_current_admin(request: Request) -> Optional[str]:
    """
    Get current admin username from the session credential.
    Returns None if not authenticated.
    """
    token = session_token_from_request(request)
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
    A missing password denies login in every environment.
    """
    admin_password = get_admin_password()
    if not admin_password:
        return False
    
    return secrets.compare_digest(password, admin_password)


def check_admin_configured() -> bool:
    """Admin login requires ADMIN_PASSWORD in every environment."""
    password = get_admin_password()
    return password is not None and len(password) > 0
