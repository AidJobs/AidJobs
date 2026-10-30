"""The HTTP contract the frontend relies on, as FastAPI 0.141 enforces it (security stage 3A).

JSON bodies must say they are JSON; the internal API accepts only its key in the
`X-Internal-Api-Key` header; the removed route list stays removed.
"""
import pytest
from fastapi import HTTPException
from fastapi.routing import iter_route_contexts
from fastapi.testclient import TestClient

import app.admin_auth_routes as admin_auth_routes
import app.pipeline_api as pipeline_api
import security.admin_auth as admin_auth
from app.rate_limit import limiter
from main import app

PASSWORD = "http-contract-test-password"
INTERNAL_KEY = "http-contract-test-internal-key"
LOGIN_BODY = b'{"password": "http-contract-test-password"}'


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AIDJOBS_ENV", "production")
    monkeypatch.setenv("COOKIE_SECRET", "http-contract-test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", PASSWORD)
    limiter.reset()
    # https, so the client sends back the Secure session cookie a production sign-in sets.
    yield TestClient(app, base_url="https://testserver", raise_server_exceptions=False)
    limiter.reset()


@pytest.fixture
def password_checks(monkeypatch):
    calls = []
    real = admin_auth_routes.verify_admin_password

    def counting(password):
        calls.append(1)
        return real(password)

    monkeypatch.setattr(admin_auth_routes, "verify_admin_password", counting)
    return calls


def _no_session(response):
    assert admin_auth.COOKIE_NAME not in response.cookies
    assert admin_auth.SESSION_HEADER.lower() not in {name.lower() for name in response.headers}


@pytest.mark.parametrize("content_type", [None, "text/plain"])
def test_login_body_not_labelled_json_is_refused(client, password_checks, content_type):
    headers = {"Content-Type": content_type} if content_type else {}
    response = client.post("/api/admin/login", content=LOGIN_BODY, headers=headers)

    assert response.status_code == 422
    assert [error["type"] for error in response.json()["detail"]] == ["model_attributes_type"]
    assert password_checks == []
    _no_session(response)
    assert client.get("/api/admin/session").json() == {"authenticated": False}


@pytest.mark.parametrize("content_type", ["application/json", "application/json; charset=utf-8"])
def test_login_body_labelled_json_reaches_sign_in(client, password_checks, content_type):
    wrong = client.post(
        "/api/admin/login",
        content=b'{"password": "wrong"}',
        headers={"Content-Type": content_type},
    )
    assert wrong.status_code == 401
    assert wrong.json() == {"detail": "Invalid credentials"}
    _no_session(wrong)

    right = client.post(
        "/api/admin/login", content=LOGIN_BODY, headers={"Content-Type": content_type}
    )
    assert right.status_code == 200
    assert right.json() == {"authenticated": True}
    assert right.headers[admin_auth.SESSION_HEADER]
    assert password_checks == [1, 1]
    assert client.get("/api/admin/session").json() == {"authenticated": True}


@pytest.fixture
def internal(monkeypatch):
    def stub_database():
        raise HTTPException(status_code=418, detail="stub database")

    monkeypatch.setattr(pipeline_api, "INTERNAL_API_KEY", INTERNAL_KEY)
    monkeypatch.setattr(pipeline_api, "get_db_conn", stub_database)
    paths = {ctx.path for ctx in iter_route_contexts(app.routes)}
    assert "/_internal/jobs/{job_id}" in paths
    return "/_internal/jobs/00000000-0000-0000-0000-000000000000"


def test_internal_api_accepts_its_key(client, internal):
    response = client.get(internal, headers={"X-Internal-Api-Key": INTERNAL_KEY})
    assert (response.status_code, response.json()) == (418, {"detail": "stub database"})


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-Internal-Api-Key": "wrong-key"},
        {"X-Internal-Api-Key": ""},
        {"x_internal_api_key": INTERNAL_KEY},
    ],
    ids=["missing", "wrong", "empty", "underscore-spelling"],
)
def test_internal_api_refuses_other_keys(client, internal, headers):
    response = client.get(internal, headers=headers)
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or missing internal API key"}


def test_internal_api_is_closed_when_no_key_is_configured(client, internal, monkeypatch):
    monkeypatch.setattr(pipeline_api, "INTERNAL_API_KEY", "")
    response = client.get(internal, headers={"X-Internal-Api-Key": INTERNAL_KEY})
    assert response.status_code == 503


def test_debug_route_list_is_removed(client):
    paths = [ctx.path for ctx in iter_route_contexts(app.routes)]
    assert not [path for path in paths if path.startswith("/api/debug")]
    assert client.get("/api/debug/routes").status_code == 404

    login = client.post("/api/admin/login", json={"password": PASSWORD})
    token = login.headers[admin_auth.SESSION_HEADER]
    session = client.get("/api/admin/session", headers={admin_auth.SESSION_HEADER: token})
    assert session.json() == {"authenticated": True}
    signed_in = client.get("/api/debug/routes", headers={admin_auth.SESSION_HEADER: token})
    assert signed_in.status_code == 404
