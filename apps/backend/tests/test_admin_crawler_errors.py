"""Security stage 3, phase 2, PR 2: the crawler admin routes return no exception text.

The route walk runs in a fresh process built as production builds it (the method of
test_admin_sources_errors.py), signed in through a dependency override. The database driver, the
coverage monitor, the extraction logger and the Meilisearch client fail with fake connection-string
text. Real sockets and DNS are refused in that process (only the event loop's own loopback socket
pair is allowed), so no route can reach a network or a database. Secrets are assembled at runtime.
"""
import json
import logging
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

from tests.signed_in import SIGN_IN_IN_PROCESS

BACKEND_DIR = Path(__file__).resolve().parents[1]
FRAGMENT = "FAKEPW3k"
WELL_FORMED_DB_URL = "postgresql://probe:" + FRAGMENT + "q8" + "@127.0.0.1:1/postgres"
DSN_ERROR = 'invalid dsn: missing "=" after "' + FRAGMENT + 'q8" in connection info string'
SID = "00000000-0000-0000-0000-000000000000"

PREAMBLE = """
import asyncio, json, os, socket, sys, threading, types
_attempts = []
async def _refuse_async(self, *args, **kwargs):
    _attempts.append(repr(args[1:3]))
    raise OSError("network refused in this test")
asyncio.base_events.BaseEventLoop.create_connection = _refuse_async
asyncio.base_events.BaseEventLoop.sock_connect = _refuse_async
_pairing = threading.local()
_real_connect = socket.socket.connect
_real_pair = socket.socketpair
def _pair(*args, **kwargs):
    _pairing.on = True
    try:
        return _real_pair(*args, **kwargs)
    finally:
        _pairing.on = False
def _connect(self, *args, **kwargs):
    if getattr(_pairing, "on", False):
        return _real_connect(self, *args, **kwargs)
    _attempts.append(repr(args[:1]))
    raise OSError("network refused in this test")
def _refuse(*args, **kwargs):
    _attempts.append(repr(args[:1]))
    raise OSError("network refused in this test")
socket.socketpair = _pair
socket.socket.connect = _connect
socket.socket.connect_ex = _refuse
socket.create_connection = _refuse
socket.getaddrinfo = _refuse
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: False
from fastapi.testclient import TestClient
from main import app
from app import crawler_admin
app.dependency_overrides[crawler_admin.admin_required] = lambda: "test-admin"
client = TestClient(app, raise_server_exceptions=False)
""" + SIGN_IN_IN_PROCESS + """
def call(method, path, **kwargs):
    r = client.request(method, path, **kwargs)
    return {"route": method + " " + path, "status": r.status_code, "body": r.text,
            "request_id": r.headers.get("X-Request-ID")}
"""

FAILURES = """
import psycopg2
import meilisearch
from core import coverage_monitor, extraction_logger
def refuse(*args, **kwargs):
    raise psycopg2.OperationalError(%r)
def broken(*args, **kwargs):
    raise RuntimeError(%r)
psycopg2.connect = refuse
for name in ("get_coverage_stats", "get_source_coverage", "flag_sources_with_issues"):
    setattr(coverage_monitor.CoverageMonitor, name, broken)
for name in ("get_extraction_stats", "get_failed_inserts"):
    setattr(extraction_logger.ExtractionLogger, name, broken)
meilisearch.Client = broken
os.environ["MEILISEARCH_URL"] = "http://127.0.0.1:1"
os.environ["MEILISEARCH_KEY"] = "probe-" + "value"
""" % (DSN_ERROR, DSN_ERROR)

CONVERTED = [  # (method, path, JSON body, fixed message)
    ("GET", "/api/admin/crawl/status", None, "Failed to get crawler status"),
    ("GET", f"/api/admin/data-quality/source/{SID}", None, "Failed to get quality report"),
    ("POST", "/api/admin/crawl/delete-jobs-by-org?org_name=Probe", None, "Failed to delete jobs"),
    ("GET", "/api/admin/data-quality/global", None, "Failed to get global quality report"),
    ("GET", "/api/admin/crawl/analytics/overview", None, "Failed to get analytics"),
    ("GET", f"/api/admin/crawl/analytics/source/{SID}", None, "Failed to get source analytics"),
    ("POST", "/api/admin/link-validation/validate", {"job_ids": [SID]}, "Link validation failed"),
    ("GET", "/api/admin/link-validation/stats", None, "Failed to get stats"),
    ("POST", f"/api/admin/link-validation/validate-job/{SID}", None, "Link validation failed"),
    ("POST", "/api/admin/meilisearch/sync", None, "Meilisearch sync failed"),
    ("GET", "/api/admin/observability/coverage", None, "Failed to get coverage stats"),
    ("GET", "/api/admin/observability/coverage/sources", None, "Failed to get source coverage"),
    ("GET", "/api/admin/observability/coverage/issues", None, "Failed to get coverage issues"),
    ("GET", "/api/admin/observability/extraction/stats", None, "Failed to get extraction stats"),
    ("POST", "/api/admin/crawl/backfill-quality-scores", {"dry_run": True}, "Database error"),
    ("GET", "/api/admin/observability/failed-inserts", None, "Failed to get failed inserts"),
    ("GET", "/api/admin/observability/validation-errors", None,
     "Failed to get validation errors"),
]
# Not converted: they have no exception text of their own. A failure reaches the global
# middleware's generic 500; expired-job deletion and the migration route are disabled; the test
# route is static.
OTHERS = [  # (method, path, JSON body, status)
    ("POST", "/api/admin/crawl/run", {"source_id": SID}, 500),
    ("POST", "/api/admin/crawl/run_due", None, 500),
    ("POST", "/api/admin/crawl/cleanup_expired", None, 200),
    ("GET", "/api/admin/crawl/logs", None, 500),
    ("GET", "/api/admin/robots/example.org", None, 500),
    ("GET", "/api/admin/domain_policies/example.org", None, 500),
    ("POST", "/api/admin/domain_policies/example.org", {"max_pages": 5}, 500),
    ("POST", "/api/admin/crawl/run-migration", None, 410),
    ("GET", "/api/admin/observability/test", None, 200),
]
ONE_ITEM = {
    f"GET /api/admin/data-quality/source/{SID}": ("source", SID),
    f"GET /api/admin/crawl/analytics/source/{SID}": ("source", SID),
    f"POST /api/admin/link-validation/validate-job/{SID}": ("job", SID),
}
ALL_ROUTES = [route[:3] for route in CONVERTED + OTHERS]


def _calls_source(routes):
    lines = ["calls = []"]
    for method, path, body in routes:
        extra = f", json={body!r}" if body is not None else ""
        lines.append(f"calls.append(call({method!r}, {path!r}{extra}))")
    lines.append('calls.append({"route": "network attempts", "status": len(_attempts), '
                 '"body": json.dumps(_attempts), "request_id": None})')
    return "\n".join(lines)


_ENV_KEPT = ("PATH", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE",
             "PYTHONPATH")


def _run(body):
    env = {k: os.environ[k] for k in _ENV_KEPT if k in os.environ}
    env.update(AIDJOBS_DISABLE_SCHEDULER="true", AIDJOBS_ENV="production",
               COOKIE_SECRET="test-secret-for-leak-checks", PYTHONIOENCODING="utf-8",
               SUPABASE_DB_URL=WELL_FORMED_DB_URL)
    result = subprocess.run(
        [sys.executable, "-c", PREAMBLE + body + '\nprint(json.dumps({"calls": calls}))'],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True, encoding="utf-8", timeout=300,
    )
    output = [line for line in result.stdout.splitlines() if line.startswith('{"calls"')]
    assert result.returncode == 0 and output, result.stderr[-3000:]
    calls = {c["route"]: c for c in json.loads(output[-1])["calls"]}
    return calls, result.stdout + result.stderr


@pytest.fixture(scope="module")
def walk():
    calls, logs = _run(FAILURES + _calls_source(ALL_ROUTES))
    return calls, logs


def _key(method, path):
    return f"{method} {path}"


def _routes(calls):
    return {route: c for route, c in calls.items() if route != "network attempts"}


def test_no_route_reaches_a_network(walk):
    calls, _logs = walk
    attempts = calls["network attempts"]
    assert attempts["status"] == 0, attempts["body"]


def test_the_network_guard_records_and_refuses_an_attempt():
    # Aimed at loopback (port 9, discard), so even a broken guard sends nothing off the machine.
    probe = """
import urllib.request
import httpx
try:
    urllib.request.urlopen("http://127.0.0.1:9/", timeout=1)
except OSError:
    pass
try:
    socket.create_connection(("127.0.0.1", 9), timeout=1)
except OSError:
    pass
async def via_the_loop():
    async with httpx.AsyncClient() as http:
        try:
            await http.head("http://127.0.0.1:9/")
        except httpx.HTTPError:
            pass
asyncio.run(via_the_loop())
calls = [{"route": "network attempts", "status": len(_attempts), "body": "",
          "request_id": None}]
"""
    calls, _logs = _run(probe)
    assert calls["network attempts"]["status"] == 3


def test_every_route_is_mounted(walk):
    calls, _logs = walk
    routes = _routes(calls)
    missing = [route for route, c in routes.items() if c["status"] in (404, 405)]
    assert not missing, missing
    assert set(routes) == {_key(method, path) for method, path, _body in ALL_ROUTES}


def test_no_response_or_log_line_quotes_the_fake_password(walk):
    calls, logs = walk
    leaking = [route for route, c in calls.items() if FRAGMENT in c["body"]]
    assert not leaking, f"responses quoting the fake database password: {leaking}"
    assert FRAGMENT not in logs, [line for line in logs.splitlines() if FRAGMENT in line][:5]


def test_failures_return_a_fixed_message_with_a_reference(walk):
    calls, _logs = walk
    for method, path, _body, message in CONVERTED:
        c = calls[_key(method, path)]
        request_id = c["request_id"]
        assert c["status"] == 500, (path, c["status"], c["body"][:300])
        assert re.fullmatch(r"[0-9a-f]{32}", request_id or ""), path
        assert json.loads(c["body"]) == {
            "detail": f"{message} (ref {request_id[:8]})", "request_id": request_id,
        }, path


def test_routes_that_are_not_converted_answer_as_before(walk):
    calls, _logs = walk
    for method, path, _body, status in OTHERS:
        c = calls[_key(method, path)]
        assert c["status"] == status, (path, c["status"], c["body"][:300])
        assert re.fullmatch(r"[0-9a-f]{32}", c["request_id"] or ""), path


def test_each_reference_leads_to_the_logged_cause(walk):
    calls, logs = walk
    cause_lines = [line for line in logs.splitlines()
                   if "OperationalError" in line or "RuntimeError" in line]
    for method, path, _body, _message in CONVERTED:
        c = calls[_key(method, path)]
        assert any(line.startswith(f"[{c['request_id']}]") for line in cause_lines), path
    for route, (kind, item_id) in ONE_ITEM.items():
        c = calls[route]
        mine = [line for line in logs.splitlines() if line.startswith(f"[{c['request_id']}]")]
        assert any(f"{kind} '{item_id}'" in line for line in mine), f"{route}: no ID in the log"


class _ScoringCursor:
    def __init__(self, jobs):
        self.jobs = jobs

    def execute(self, sql, params=None):
        pass

    def fetchall(self):
        return self.jobs

    def close(self):
        pass


class _ScoringConnection:
    def __init__(self, jobs):
        self.jobs = jobs

    def cursor(self, cursor_factory=None):
        return _ScoringCursor(self.jobs)

    def commit(self):
        pass

    def close(self):
        pass


def test_a_job_that_cannot_be_scored_is_named_without_the_text(monkeypatch, caplog):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import core.data_quality
    from app import crawler_admin

    class FailingScorer:
        def score_job(self, job):
            raise ValueError("bad value " + FRAGMENT)

    monkeypatch.setenv("SUPABASE_DB_URL", WELL_FORMED_DB_URL)
    monkeypatch.setattr(crawler_admin.psycopg2, "connect",
                        lambda url: _ScoringConnection([{"id": "job-1"}, {"id": "job-2"}]))
    monkeypatch.setattr(core.data_quality, "get_quality_scorer", lambda: FailingScorer())
    app = FastAPI()
    app.include_router(crawler_admin.router)
    app.dependency_overrides[crawler_admin.admin_required] = lambda: "test-admin"
    with caplog.at_level(logging.ERROR, logger="app.crawler_admin"):
        response = TestClient(app).post("/api/admin/crawl/backfill-quality-scores",
                                        json={"dry_run": True})
    body = response.json()
    assert response.status_code == 200
    assert body["errors"] == ["Job job-1: could not be scored", "Job job-2: could not be scored"]
    assert body["updated"] == 0 and body["total"] == 2
    assert FRAGMENT not in response.text
    logged = [r.getMessage() for r in caplog.records if "Could not score job" in r.getMessage()]
    assert len(logged) == 2 and "'job-1'" in logged[0] and "ValueError" in logged[0]


def test_a_job_url_that_cannot_be_parsed_is_named_without_the_text(monkeypatch):
    from app import data_quality

    def explode(url):
        raise ValueError("Invalid IPv6 URL " + FRAGMENT)

    monkeypatch.setattr(data_quality, "urlparse", explode)
    validator = data_quality.DataQualityValidator("postgresql://unused")
    ok, errors = validator.validate_job({"title": "Programme Officer",
                                         "apply_url": "https://[::1/jobs/1"})
    assert ok is False
    assert "URL parsing error" in errors
    assert not any(FRAGMENT in e for e in errors)
