"""Security stage 3, extra pull request: the admin gate, the internal key comparison, the shortlist.

The gate is driven through the whole app at the ASGI level, so each test can see whether the
request body was read at all. No database and no network.
"""
import asyncio
import importlib.util
import json

import pytest

from security import admin_gate
from security.admin_gate import MAX_ADMIN_BODY_BYTES, AdminGateMiddleware
from tests.signed_in import session_headers


def _scope(method, path, headers=()):
    return {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
        "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"",
        "root_path": "", "headers": [(k.lower().encode(), v.encode()) for k, v in headers],
        "client": ("127.0.0.1", 50000), "server": ("testserver", 80),
    }


def _call(app, method, path, headers=(), chunks=(b"",)):
    """Run one request; return the status, the JSON body, the headers, and how many reads."""
    pending = list(chunks)
    reads = []
    sent = []

    async def receive():
        reads.append(1)
        if pending:
            body = pending.pop(0)
            return {"type": "http.request", "body": body, "more_body": bool(pending)}
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    asyncio.run(app(_scope(method, path, headers), receive, send))
    start = next(m for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    response_headers = {k.decode().lower(): v.decode() for k, v in start["headers"]}
    try:
        parsed = json.loads(body) if body else None
    except ValueError:
        parsed = body.decode(errors="replace")
    return start["status"], parsed, response_headers, len(reads)


@pytest.fixture
def app():
    from main import app as application

    return application


JSON = ("Content-Type", "application/json")


@pytest.mark.parametrize("method, path", [
    ("POST", "/api/admin/jobs/delete-bulk"),
    ("POST", "/api/admin/sources"),
    ("POST", "/api/admin/crawl/run"),
    ("GET", "/api/admin/jobs/search"),
    ("POST", "/api/admin/a-route-that-does-not-exist"),
])
def test_without_a_session_nothing_of_the_body_is_read(app, method, path):
    body = b'{"job_ids": ["x"]}'
    status, answer, headers, reads = _call(
        app, method, path, [JSON, ("Content-Length", str(len(body)))], [body])
    assert (status, answer) == (401, {"detail": "Authentication required"})
    assert reads == 0
    assert len(headers["x-request-id"]) == 32


def test_malformed_json_without_a_session_is_401_not_422(app):
    status, answer, _headers, reads = _call(
        app, "POST", "/api/admin/jobs/delete-bulk", [JSON, ("Content-Length", "9")], [b"{not json"])
    assert (status, answer, reads) == (401, {"detail": "Authentication required"}, 0)


def test_an_invalid_session_header_is_refused_even_with_a_valid_cookie(app, monkeypatch):
    from security.admin_auth import COOKIE_NAME, SESSION_HEADER

    valid = session_headers(monkeypatch)[SESSION_HEADER]
    status, answer, _headers, reads = _call(app, "GET", "/api/admin/jobs/search", [
        (SESSION_HEADER, "v1.forged.token"), ("Cookie", f"{COOKIE_NAME}={valid}")])
    assert (status, answer, reads) == (401, {"detail": "Authentication required"}, 0)


def test_a_signed_in_request_reaches_its_route(app, monkeypatch):
    from app import job_management

    monkeypatch.setattr(job_management.db_config, "get_connection_params", lambda: None)
    status, answer, _headers, _reads = _call(
        app, "GET", "/api/admin/jobs/search", list(session_headers(monkeypatch).items()))
    assert (status, answer) == (500, {"detail": "Database not configured"})


def test_a_signed_in_body_is_read_by_its_route(app, monkeypatch):
    from app import job_management

    monkeypatch.setattr(job_management.db_config, "get_connection_params", lambda: None)
    body = b'{"job_ids": ["x"]}'
    status, answer, _headers, reads = _call(
        app, "POST", "/api/admin/jobs/delete-bulk",
        list(session_headers(monkeypatch).items()) + [JSON, ("Content-Length", str(len(body)))],
        [body])
    assert (status, answer) == (500, {"detail": "Database not configured"})
    assert reads >= 1


def test_the_cookie_alone_still_signs_in(app, monkeypatch):
    from app import job_management
    from security.admin_auth import COOKIE_NAME, SESSION_HEADER

    monkeypatch.setattr(job_management.db_config, "get_connection_params", lambda: None)
    token = session_headers(monkeypatch)[SESSION_HEADER]
    status, _answer, _headers, _reads = _call(
        app, "GET", "/api/admin/jobs/search", [("Cookie", f"{COOKIE_NAME}={token}")])
    assert status == 500


def test_the_session_check_and_sign_out_answer_before_signing_in(app):
    status, answer, _headers, _reads = _call(app, "GET", "/api/admin/session")
    assert (status, answer) == (200, {"authenticated": False})
    status, answer, _headers, _reads = _call(app, "POST", "/api/admin/logout")
    assert (status, answer) == (200, {"authenticated": False})


def test_sign_in_is_reachable_before_signing_in(app, monkeypatch):
    monkeypatch.setenv("COOKIE_SECRET", "gate-test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "gate-test-password")
    body = b'{"password": "wrong"}'
    status, answer, _headers, _reads = _call(
        app, "POST", "/api/admin/login", [JSON, ("Content-Length", str(len(body)))], [body])
    assert (status, answer) == (401, {"detail": "Invalid credentials"})


@pytest.mark.parametrize("path, signed", [
    ("/api/admin/jobs/delete-bulk", True),
    ("/api/admin/login", False),
])
def test_a_declared_oversized_body_is_refused_unread(app, monkeypatch, path, signed):
    headers = list(session_headers(monkeypatch).items()) if signed else []
    status, answer, _headers, reads = _call(
        app, "POST", path, headers + [JSON, ("Content-Length", str(MAX_ADMIN_BODY_BYTES + 1))],
        [b"x"])
    assert (status, answer, reads) == (413, {"detail": "Request too large"}, 0)


def test_a_streamed_oversized_body_is_cut_off(app, monkeypatch):
    chunk = b" " * (256 * 1024)
    status, answer, _headers, reads = _call(
        app, "POST", "/api/admin/jobs/delete-bulk",
        list(session_headers(monkeypatch).items()) + [JSON], [chunk] * 40)
    assert (status, answer) == (413, {"detail": "Request too large"})
    assert reads <= 5


def test_a_preflight_is_answered_by_cors_before_the_gate(app):
    status, _answer, headers, reads = _call(app, "OPTIONS", "/api/admin/jobs/delete-bulk", [
        ("Origin", "https://aidjobs.app"), ("Access-Control-Request-Method", "POST")])
    assert status == 200
    assert headers["access-control-allow-origin"] == "https://aidjobs.app"
    assert reads == 0


def test_the_gates_answers_carry_cors_headers(app):
    status, _answer, headers, _reads = _call(
        app, "POST", "/api/admin/jobs/delete-bulk", [("Origin", "https://aidjobs.app")])
    assert status == 401
    assert headers["access-control-allow-origin"] == "https://aidjobs.app"


@pytest.mark.parametrize("path", ["/api/healthz", "/api/db/status"])
def test_paths_outside_the_admin_are_not_gated(app, path):
    status, answer, _headers, _reads = _call(app, "GET", path)
    assert answer != {"detail": "Authentication required"}
    assert status != 413


# The limit's boundary, with the gate around an app that reads the whole body -------------------

async def _echo(scope, receive, send):
    total = 0
    while True:
        message = await receive()
        total += len(message.get("body", b""))
        if not message.get("more_body"):
            break
    await send({"type": "http.response.start", "status": 200,
                "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": json.dumps({"read": total}).encode()})


@pytest.mark.parametrize("size, status", [(10, 200), (11, 413)])
def test_the_limit_is_exact_for_declared_and_streamed_bodies(monkeypatch, size, status):
    gate = AdminGateMiddleware(_echo, max_body_bytes=10)
    signed = list(session_headers(monkeypatch).items())
    declared = _call(gate, "POST", "/api/admin/x", signed + [("Content-Length", str(size))],
                     [b"a" * size])
    streamed = _call(gate, "POST", "/api/admin/x", signed, [b"a" * (size - 1), b"a"])
    assert (declared[0], streamed[0]) == (status, status)
    if status == 200:
        assert declared[1] == streamed[1] == {"read": size}


def test_the_gate_reuses_the_session_check_of_admin_required():
    from security import admin_auth

    assert admin_gate.get_current_admin is admin_auth.get_current_admin


# The internal key, and the shortlist module ------------------------------------------------------

def test_the_internal_key_is_compared_in_constant_time(monkeypatch):
    from fastapi.testclient import TestClient

    from app import pipeline_api
    from main import app

    compared = []
    real = pipeline_api.hmac.compare_digest

    def recording(a, b):
        compared.append((type(a).__name__, type(b).__name__))
        return real(a, b)

    monkeypatch.setattr(pipeline_api, "INTERNAL_API_KEY", "probe-" + "internal-key")
    monkeypatch.setattr(pipeline_api.hmac, "compare_digest", recording)
    monkeypatch.setattr(pipeline_api.db_config, "get_connection_params", lambda: None)
    client = TestClient(app, raise_server_exceptions=False)
    wrong = client.get("/_internal/jobs", headers={"X-Internal-API-Key": "probe-internal-kez"})
    right = client.get("/_internal/jobs", headers={"X-Internal-API-Key": "probe-internal-key"})
    assert wrong.status_code == 401 and right.status_code == 500
    assert compared == [("bytes", "bytes"), ("bytes", "bytes")]


def test_a_missing_or_non_ascii_key_is_refused(monkeypatch):
    from fastapi.testclient import TestClient

    from app import pipeline_api
    from main import app

    monkeypatch.setattr(pipeline_api, "INTERNAL_API_KEY", "probe-" + "internal-key")
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/_internal/jobs").status_code == 401
    latin1 = {"X-Internal-API-Key": b"prob\xe9"}
    assert client.get("/_internal/jobs", headers=latin1).status_code == 401


def test_the_unused_shortlist_module_is_gone():
    assert importlib.util.find_spec("app.shortlist") is None
