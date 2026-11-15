"""Security stage 3, phase 2, PR 1: the sources admin routes return no exception text.

The route walks run in a fresh process built as production builds it (the method of
test_public_error_leaks.py), signed in through a dependency override, with a database driver
that fails with fake connection-string text. Every secret is assembled at runtime and
nothing touches a network or a database.

W-35 3a: the presets routes are gone; failures cover the sources routes only.
"""
import json
import logging
import os
import re
import subprocess
import sys
from pathlib import Path

import httpx
import psycopg2
import pytest

from app.log_safety import REQUEST_ID
from contracts.outbound import FetchError
from tests.signed_in import SIGN_IN_IN_PROCESS

BACKEND_DIR = Path(__file__).resolve().parents[1]
FRAGMENT = "FAKEPW3k"
WELL_FORMED_DB_URL = "postgresql://probe:" + FRAGMENT + "q8" + "@127.0.0.1:1/postgres"
MALFORMED_DB_URL = "postgresql://probe:" + FRAGMENT + "/q8" + "@127.0.0.1:1/postgres"
DSN_ERROR = 'invalid dsn: missing "=" after "' + FRAGMENT + 'q8" in connection info string'
SOURCE_ID = "00000000-0000-0000-0000-000000000000"

PREAMBLE = """
import json, sys, types
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: False
from fastapi.testclient import TestClient
from main import app
from app import sources
app.dependency_overrides[sources.admin_required] = lambda: "test-admin"
client = TestClient(app, raise_server_exceptions=False)
""" + SIGN_IN_IN_PROCESS + """
def call(method, path, **kwargs):
    r = client.request(method, path, **kwargs)
    return {"route": method + " " + path, "status": r.status_code, "body": r.text,
            "request_id": r.headers.get("X-Request-ID")}
"""

SID = SOURCE_ID
NEW_SOURCE = {"careers_url": "https://example.org/jobs", "source_type": "html"}
SOURCE_CALLS = f"""
calls = [
    call("GET", "/api/admin/sources"),
    call("GET", "/api/admin/organisations"),
    call("GET", "/api/admin/sources/{SID}"),
    call("POST", "/api/admin/sources", json={NEW_SOURCE!r}),
    call("PATCH", "/api/admin/sources/{SID}", json={{"org_name": "Renamed"}}),
    call("DELETE", "/api/admin/sources/{SID}"),
    call("DELETE", "/api/admin/sources/{SID}/permanent"),
    call("GET", "/api/admin/sources/{SID}/export"),
    call("POST", "/api/admin/sources/import", json={NEW_SOURCE!r}),
    call("POST", "/api/admin/sources/{SID}/test"),
    call("POST", "/api/admin/sources/{SID}/simulate_extract"),
]
"""

FAILURES = """
import psycopg2
def refuse(*args, **kwargs):
    raise psycopg2.OperationalError(%r)
psycopg2.connect = refuse
""" % (DSN_ERROR,)

INTERNAL_ERRORS = {
    "GET /api/admin/sources": "Failed to list sources",
    "GET /api/admin/organisations": "Failed to list organisations",
    f"GET /api/admin/sources/{SID}": "Failed to load source",
    "POST /api/admin/sources": "Failed to create source",
    f"PATCH /api/admin/sources/{SID}": "Failed to update source",
    f"DELETE /api/admin/sources/{SID}": "Failed to delete source",
    f"DELETE /api/admin/sources/{SID}/permanent": "Failed to permanently delete source",
    f"GET /api/admin/sources/{SID}/export": "Failed to export source",
    "POST /api/admin/sources/import": "Failed to import source",
}
DIAGNOSTIC_TOOLS = {
    f"POST /api/admin/sources/{SID}/test",
    f"POST /api/admin/sources/{SID}/simulate_extract",
}
DATABASE_ROUTES = list(INTERNAL_ERRORS) + sorted(DIAGNOSTIC_TOOLS)

_ENV_KEPT = ("PATH", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE",
             "PYTHONPATH")


def _run(db_url, body):
    env = {k: os.environ[k] for k in _ENV_KEPT if k in os.environ}
    env.update(AIDJOBS_DISABLE_SCHEDULER="true", AIDJOBS_ENV="production",
               COOKIE_SECRET="test-secret-for-leak-checks", PYTHONIOENCODING="utf-8")
    if db_url is not None:
        env["SUPABASE_DB_URL"] = db_url
    result = subprocess.run(
        [sys.executable, "-c", PREAMBLE + body + '\nprint(json.dumps({"calls": calls}))'],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True, encoding="utf-8", timeout=180,
    )
    output = [line for line in result.stdout.splitlines() if line.startswith('{"calls"')]
    assert result.returncode == 0 and output, result.stderr[-3000:]
    calls = {c["route"]: c for c in json.loads(output[-1])["calls"]}
    return calls, result.stdout + result.stderr


def _assert_no_leak(calls, logs):
    leaking = [route for route, c in calls.items() if FRAGMENT in c["body"]]
    assert not leaking, f"responses quoting the fake database password: {leaking}"
    assert FRAGMENT not in logs, [line for line in logs.splitlines() if FRAGMENT in line][:5]


def test_failures_return_a_fixed_message_with_a_reference_and_no_secret():
    calls, logs = _run(WELL_FORMED_DB_URL, FAILURES + SOURCE_CALLS)
    _assert_no_leak(calls, logs)
    assert set(calls) == set(INTERNAL_ERRORS) | DIAGNOSTIC_TOOLS
    for route, message in INTERNAL_ERRORS.items():
        c = calls[route]
        request_id = c["request_id"]
        assert c["status"] == 500, (route, c["status"])
        assert re.fullmatch(r"[0-9a-f]{32}", request_id or ""), route
        assert json.loads(c["body"]) == {
            "detail": f"{message} (ref {request_id[:8]})", "request_id": request_id,
        }, route
    for route in DIAGNOSTIC_TOOLS:
        c = calls[route]
        body = json.loads(c["body"])
        assert c["status"] == 200, (route, c["status"])
        assert body["ok"] is False
        assert body["error"] == f"Unexpected error (ref {c['request_id'][:8]})", route
    assert json.loads(calls[f"POST /api/admin/sources/{SID}/simulate_extract"]["body"])[
        "error_category"] == "unknown"
    assert "<redacted>" in logs


def test_each_reference_leads_to_the_logged_cause():
    calls, logs = _run(WELL_FORMED_DB_URL, FAILURES + SOURCE_CALLS)
    assert len(calls) == 11
    cause_lines = [line for line in logs.splitlines() if "OperationalError" in line]
    for route, c in calls.items():
        assert any(line.startswith(f"[{c['request_id']}]") for line in cause_lines), route
        if SID in route:
            mine = [line for line in logs.splitlines() if line.startswith(f"[{c['request_id']}]")]
            assert any(SID in line for line in mine), f"{route}: no log line names the source"


def test_unreadable_database_settings_are_named_and_still_503():
    calls, logs = _run(MALFORMED_DB_URL, SOURCE_CALLS)
    _assert_no_leak(calls, logs)
    for route in DATABASE_ROUTES:
        assert calls[route]["status"] == 503, route
        assert json.loads(calls[route]["body"]) == {
            "detail": "Database settings could not be read"}, route
    assert "could not be parsed (ValueError). Check the port, and percent-encode" in logs


def test_absent_database_settings_keep_not_configured():
    calls, _logs = _run(None, SOURCE_CALLS)
    for route in DATABASE_ROUTES:
        assert calls[route]["status"] == 503, route
        assert json.loads(calls[route]["body"]) == {"detail": "Database not configured"}, route


@pytest.fixture
def request_id():
    token = REQUEST_ID.set("abcdef1234567890abcdef1234567890")
    yield "abcdef12"
    REQUEST_ID.reset(token)


def _status_error(code):
    request = httpx.Request("GET", "https://example.org/jobs?key=" + FRAGMENT)
    response = httpx.Response(code, request=request)
    return httpx.HTTPStatusError("HTTP " + FRAGMENT, request=request, response=response)


@pytest.mark.parametrize("error, expected", [
    (FetchError("timeout"), "Fetch failed: timeout"),
    (FetchError("DNS resolution failed"), "Fetch failed: DNS resolution failed"),
    (FetchError("destination host is not permitted"),
     "Fetch failed: destination host is not permitted"),
    (FetchError("upstream said " + FRAGMENT), "Fetch failed"),
    (json.JSONDecodeError("Expecting value", '{"key": ' + FRAGMENT, 8),
     "Invalid JSON at line 1, column 9"),
    (_status_error(503), "The source answered HTTP 503"),
    (httpx.ConnectTimeout("timed out reaching " + FRAGMENT),
     "Connection timeout. The server took too long to respond."),
    (httpx.ConnectError("[Errno 111] refused " + FRAGMENT),
     "Could not connect: the host name did not resolve or the connection was refused."),
    (httpx.TooManyRedirects("redirect loop via " + FRAGMENT), "Too many redirects"),
    (RuntimeError("password=" + FRAGMENT), "Unexpected error (ref abcdef12)"),
    (ValueError("bad value " + FRAGMENT), "Unexpected error (ref abcdef12)"),
    (TypeError("fetch_api() got an unexpected keyword argument " + FRAGMENT),
     "Unexpected error (ref abcdef12)"),
])
def test_failures_are_described_by_type_never_by_their_text(request_id, error, expected):
    from app.sources import describe_failure

    described = describe_failure(error)
    assert described == expected
    assert FRAGMENT not in described


class _FakeCursor:
    def __init__(self, row):
        self.row = row

    def execute(self, *args):
        pass

    def fetchone(self):
        return self.row

    def close(self):
        pass


class _FakeConnection:
    def __init__(self, row):
        self.row = row

    def cursor(self, cursor_factory=None):
        return _FakeCursor(self.row)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


def _diagnostic_client(monkeypatch, source_row):
    """The sources router alone, signed in, over a fake connection that returns `source_row`."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app import sources
    from app.errors import RequestIdMiddleware

    app = FastAPI()
    app.include_router(sources.router)
    app.add_middleware(RequestIdMiddleware)
    app.dependency_overrides[sources.admin_required] = lambda: "test-admin"
    monkeypatch.setenv("SUPABASE_DB_URL", WELL_FORMED_DB_URL)
    monkeypatch.setattr(sources.db_config, "get_connection_params", lambda: {"host": "unused"})
    monkeypatch.setattr(sources.psycopg2, "connect", lambda **kwargs: _FakeConnection(source_row))
    return TestClient(app)


def _api_source(parser_hint):
    return {"id": SOURCE_ID, "careers_url": "https://example.org/api", "source_type": "api",
            "parser_hint": parser_hint, "org_name": "Example", "org_type": None,
            "time_window": None}


@pytest.mark.parametrize("parser_hint", [None, '{"v": 1}'])
def test_source_test_is_a_policy_head_for_every_type(monkeypatch, parser_hint):
    """W-33 / W-35: connectivity is HEAD only; extraction is Simulate extraction.

    A leftover v1 parser_hint must not revive the old API schema branch.
    """
    from contracts.outbound import FetchResult

    async def fake_head(url, **kwargs):
        assert kwargs.get("method") == "HEAD"
        return FetchResult(status_code=200, headers={}, body=b"", url=url)

    monkeypatch.setattr("contracts.outbound.fetch_url", fake_head)
    client = _diagnostic_client(monkeypatch, _api_source(parser_hint))
    body = client.post(f"/api/admin/sources/{SOURCE_ID}/test").json()
    assert body["ok"] is True
    assert body["status"] == 200
    assert body["host"] == "example.org"
    assert "missing_secrets" not in body
    assert "count" not in body


@pytest.mark.parametrize("separator", ["/", "?", "#"])
@pytest.mark.parametrize("port", ["", "12"])
def test_a_password_with_an_unencoded_separator_is_unreadable(monkeypatch, caplog, separator, port):
    """urllib would read the password's start as the port and log its tail as the database."""
    from app.db_config import DBConfig

    url = f"postgresql://u:{port}{separator}{FRAGMENT}tail@127.0.0.1:5432/db"
    monkeypatch.setenv("SUPABASE_DB_URL", url)
    with caplog.at_level(logging.DEBUG, logger="app.db_config"):
        config = DBConfig()
        assert config.get_connection_params() is None
        assert config.settings_unreadable is True
    messages = [r.getMessage() for r in caplog.records]
    assert not any(FRAGMENT in m for m in messages), messages
    assert any("could not be parsed (ValueError)" in m for m in messages)


def test_the_database_name_is_not_logged(monkeypatch, caplog):
    """Without "@" a URL cannot be told apart from host:port/db, so the path is never logged."""
    from app.db_config import DBConfig

    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://pooler-probe:12/" + FRAGMENT)
    with caplog.at_level(logging.DEBUG, logger="app.db_config"):
        params = DBConfig().get_connection_params()
    assert params is not None and params["database"] == FRAGMENT
    messages = [r.getMessage() for r in caplog.records]
    assert any("Database connection params" in m for m in messages)
    assert any("SUPABASE_DB_URL configured" in m for m in messages)
    assert not any(FRAGMENT in m for m in messages), messages


def test_a_source_id_cannot_forge_a_log_line(monkeypatch, caplog):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app import sources
    from app.errors import InternalError, internal_error_handler

    def refuse(**kwargs):
        raise psycopg2.OperationalError("refused")

    app = FastAPI()
    app.include_router(sources.router)
    app.add_exception_handler(InternalError, internal_error_handler)
    app.dependency_overrides[sources.admin_required] = lambda: "test-admin"
    monkeypatch.setattr(sources.db_config, "get_connection_params", lambda: {"host": "unused"})
    monkeypatch.setattr(sources.psycopg2, "connect", refuse)
    with caplog.at_level(logging.ERROR, logger="app.sources"):
        response = TestClient(app, raise_server_exceptions=False).get(
            "/api/admin/sources/abc%0D%0A%5Bforged%5D%20INFO%20line")
    assert response.status_code == 500
    named = [r.getMessage() for r in caplog.records if "Failed to load source" in r.getMessage()]
    assert named and not any("\n" in m or "\r" in m for m in named), named


def test_the_reference_is_never_empty():
    from app.sources import describe_failure

    token = REQUEST_ID.set("")
    try:
        assert describe_failure(RuntimeError(FRAGMENT)) == "Unexpected error (ref unavailable)"
    finally:
        REQUEST_ID.reset(token)


@pytest.mark.parametrize("url, readable", [
    ("postgresql://postgres.abcdef:FAKE%2Fpw@pooler.example.com:6543/postgres", True),
    ("postgresql://postgres.abcdef:FAKEpw@pooler.example.com:6543/postgres?sslmode=require", True),
    ("postgresql://u:FAKEpw@127.0.0.1:5432/db?application_name=a@b", True),
    ("postgresql://u:12?" + FRAGMENT + "@127.0.0.1:5432/db", False),
    ("postgresql://postgres.abc@" + FRAGMENT + "@127.0.0.1:5432/db", False),
])
def test_well_formed_urls_stay_readable(monkeypatch, url, readable):
    """Pooler names and IP addresses only: other host names would be resolved over DNS."""
    from app.db_config import DBConfig

    monkeypatch.setenv("SUPABASE_DB_URL", url)
    config = DBConfig()
    assert config.settings_unreadable is (not readable)
    assert (config.get_connection_params() is not None) is readable


def test_fetch_messages_are_repeated_only_when_they_are_ours():
    from contracts.outbound import fetch_message

    assert fetch_message(FetchError("timeout")) == "timeout"
    assert fetch_message(FetchError("upstream said " + FRAGMENT)) is None
    assert fetch_message(TimeoutError("timeout")) is None


def test_the_fetch_message_list_is_what_outbound_raises():
    """Every FetchError("...") in contracts/outbound.py is on the list, and nothing else is."""
    import ast

    from contracts.outbound import FETCH_MESSAGES

    tree = ast.parse((BACKEND_DIR / "contracts" / "outbound.py").read_text(encoding="utf-8"))
    raised = {
        node.args[0].value for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
        and node.func.id == "FetchError"
    }
    assert raised == set(FETCH_MESSAGES)


@pytest.mark.parametrize("raised, category, message", [
    (httpx.ConnectError("refused by " + FRAGMENT), "unknown",
     "Could not connect: the host name did not resolve or the connection was refused."),
    (RuntimeError("upstream " + FRAGMENT), "runtime", None),
    (json.JSONDecodeError("Expecting value", "<html>" + FRAGMENT, 0), "validation",
     "Invalid JSON at line 1, column 1"),
])
def test_simulation_keeps_its_category_and_drops_the_text(monkeypatch, raised, category, message):
    from crawler_v2 import simple_crawler

    async def fail(self, url, *args, **kwargs):
        raise raised

    monkeypatch.setattr(simple_crawler.SimpleCrawler, "_fetch_page", fail)
    html_source = {"id": SOURCE_ID, "careers_url": "https://example.org/jobs",
                   "source_type": "html", "parser_hint": None, "org_name": "Example",
                   "org_type": None, "time_window": None}
    client = _diagnostic_client(monkeypatch, html_source)
    response = client.post(f"/api/admin/sources/{SOURCE_ID}/simulate_extract")
    body = response.json()
    expected = message or f"Unexpected error (ref {response.headers['X-Request-ID'][:8]})"
    assert response.status_code == 200
    assert body == {"ok": False, "error": expected, "error_category": category}
    assert FRAGMENT not in response.text


def test_simulate_refuses_a_challenge_page_like_the_crawl(monkeypatch):
    """A 200 with a challenge stop is not read; same fixed words as crawl_source."""
    from crawler_v2 import simple_crawler
    from crawler_v2 import simulate as simulate_mod

    async def challenge(self, url):
        body = "<html><title>Just a moment...</title></html>"
        return 200, body, "HTTP 200 (Cloudflare challenge)"

    async def readers_must_not_run(*args, **kwargs):
        raise AssertionError("simulate_html must not run on a refused first page")

    monkeypatch.setattr(simple_crawler.SimpleCrawler, "_fetch_page", challenge)
    monkeypatch.setattr(simulate_mod, "simulate_html", readers_must_not_run)
    html_source = {"id": SOURCE_ID, "careers_url": "https://example.org/jobs",
                   "source_type": "html", "parser_hint": None, "org_name": "Example",
                   "org_type": None, "time_window": None}
    client = _diagnostic_client(monkeypatch, html_source)
    response = client.post(f"/api/admin/sources/{SOURCE_ID}/simulate_extract")
    assert response.status_code == 200
    assert response.json() == {
        "ok": False,
        "error": "Refused: HTTP 200 (Cloudflare challenge)",
        "error_category": "runtime",
    }


def test_import_no_longer_requires_a_v1_api_schema(monkeypatch):
    """W-33: the unused v1 schema check is gone; import stores parser_hint as free text."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app import sources

    created = {
        "id": SOURCE_ID, "org_name": "Example", "careers_url": "https://example.org/api",
        "source_type": "api", "org_type": None, "status": "active",
        "crawl_frequency_days": 3, "next_run_at": None, "last_crawled_at": None,
        "last_crawl_status": None, "parser_hint": '{"v": 2}', "time_window": None,
        "created_at": "2026-01-01", "updated_at": "2026-01-01",
    }
    app = FastAPI()
    app.include_router(sources.router)
    app.dependency_overrides[sources.admin_required] = lambda: "test-admin"
    monkeypatch.setattr(sources.db_config, "get_connection_params", lambda: {"host": "unused"})
    monkeypatch.setattr(sources.psycopg2, "connect",
                        lambda **kwargs: _FakeConnection(created))
    response = TestClient(app).post("/api/admin/sources/import", json={
        "careers_url": "https://example.org/api", "source_type": "api",
        "parser_hint": '{"v": 2}'})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["data"]["parser_hint"] == '{"v": 2}'
