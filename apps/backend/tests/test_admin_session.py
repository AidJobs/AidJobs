"""Admin login must mint a session the browser proxy can store and replay."""
import inspect

from fastapi.testclient import TestClient

import security.admin_auth as admin_auth
from main import app


def _client(monkeypatch):
    monkeypatch.setenv("AIDJOBS_ENV", "production")
    monkeypatch.setenv("COOKIE_SECRET", "admin-session-test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-session-test-password")
    return TestClient(app)


def test_login_mints_a_session_the_proxy_can_read(monkeypatch):
    client = _client(monkeypatch)

    rejected = client.post("/api/admin/login", json={"password": "wrong"})
    assert rejected.status_code == 401
    assert "aidjobs_admin_session" not in rejected.cookies
    assert admin_auth.SESSION_HEADER.lower() not in {name.lower() for name in rejected.headers}

    accepted = client.post("/api/admin/login", json={"password": "admin-session-test-password"})
    assert accepted.status_code == 200
    assert accepted.json() == {"authenticated": True}
    token = accepted.headers[admin_auth.SESSION_HEADER]
    assert token
    assert accepted.cookies["aidjobs_admin_session"] == token
    assert "password" not in accepted.text.lower()

    session = client.get(
        "/api/admin/session",
        cookies={"aidjobs_admin_session": token},
    )
    assert session.json() == {"authenticated": True}


def test_clear_cookie_uses_the_same_attributes_as_set_cookie():
    source = inspect.getsource(admin_auth.clear_admin_cookie)
    assert 'path="/"' in source
    assert 'samesite="lax"' in source
    assert "httponly=True" in source
    assert "secure=not is_dev_mode()" in source
