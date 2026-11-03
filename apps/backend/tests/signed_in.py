"""A real admin session for tests that go through the whole app, admin gate included.

Overriding `admin_required` is not enough since the admin gate (security/admin_gate.py) checks
the session itself before any route runs.
"""
from security.admin_auth import SESSION_HEADER, create_session_token

TEST_SECRET = "test-secret-for-signed-in-requests"

# For tests that run the app in a fresh process: `os.environ["COOKIE_SECRET"]` must be set there.
SIGN_IN_IN_PROCESS = """
import os as _os
from security.admin_auth import SESSION_HEADER as _SESSION_HEADER, create_session_token as _token
client.headers[_SESSION_HEADER] = _token("test-admin", _os.environ["COOKIE_SECRET"])
"""


def session_headers(monkeypatch, secret: str = TEST_SECRET) -> dict[str, str]:
    """Set the signing secret for this test and return headers carrying a valid session."""
    monkeypatch.setenv("COOKIE_SECRET", secret)
    return {SESSION_HEADER: create_session_token("test-admin", secret)}
