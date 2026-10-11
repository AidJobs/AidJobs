"""Admin login must mint a session the browser proxy can store and replay."""
import inspect
from urllib.parse import unquote

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
    secret = "admin-session-test-secret"

    rejected = client.post("/api/admin/login", json={"password": "wrong"})
    assert rejected.status_code == 401
    assert admin_auth.COOKIE_NAME not in rejected.cookies
    assert admin_auth.SESSION_HEADER.lower() not in {name.lower() for name in rejected.headers}

    accepted = client.post("/api/admin/login", json={"password": "admin-session-test-password"})
    assert accepted.status_code == 200
    assert accepted.json() == {"authenticated": True}
    token = accepted.headers[admin_auth.SESSION_HEADER]
    assert token
    assert accepted.cookies[admin_auth.COOKIE_NAME] == token
    assert "password" not in accepted.text.lower()
    assert admin_auth.encode_uri_component(token) == token
    assert "|" not in token

    stored = admin_auth.encode_uri_component(token)
    replayed = unquote(stored)
    assert replayed == token
    assert admin_auth.verify_session_token(replayed, secret) == "admin"

    by_cookie = client.get("/api/admin/session", cookies={admin_auth.COOKIE_NAME: replayed})
    assert by_cookie.json() == {"authenticated": True}

    by_header = client.get(
        "/api/admin/session",
        headers={admin_auth.SESSION_HEADER: replayed},
    )
    assert by_header.json() == {"authenticated": True}


def test_header_does_not_fall_through_to_a_valid_cookie(monkeypatch):
    client = _client(monkeypatch)
    accepted = client.post("/api/admin/login", json={"password": "admin-session-test-password"})
    token = accepted.headers[admin_auth.SESSION_HEADER]

    session = client.get(
        "/api/admin/session",
        headers={admin_auth.SESSION_HEADER: "admin%7C1%7Csig"},
        cookies={admin_auth.COOKIE_NAME: token},
    )
    assert session.json() == {"authenticated": False}


def test_rewritten_pipe_token_is_rejected(monkeypatch):
    monkeypatch.setenv("COOKIE_SECRET", "admin-session-test-secret")
    assert admin_auth.verify_session_token("admin%7C1%7Csig", "admin-session-test-secret") is None
    assert admin_auth.verify_session_token("admin|1|sig", "admin-session-test-secret") is None


def test_clear_cookie_uses_the_same_attributes_as_set_cookie():
    source = inspect.getsource(admin_auth.clear_admin_cookie)
    assert 'path="/"' in source
    assert 'samesite="lax"' in source
    assert "httponly=True" in source
    assert "secure=not is_dev_mode()" in source
