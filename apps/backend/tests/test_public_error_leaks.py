"""Security stage 3, phase 1: public endpoints and logs never carry database secrets.

Each check runs in a fresh process that builds the app as production does (no .env file,
a minimal environment), the method of test_public_surface.py. The database settings are fake
and unreachable, and every secret is assembled at runtime. Nothing touches a network.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from tests.signed_in import SIGN_IN_IN_PROCESS

BACKEND_DIR = Path(__file__).resolve().parents[1]
FRAGMENT = "FAKEPW7Q"
# A password with an unencoded "/": urllib cannot read the port, and its message quotes it.
MALFORMED_DB_URL = "postgresql://probe:" + FRAGMENT + "/dz9k" + "@127.0.0.1:1/postgres"
WELL_FORMED_DB_URL = "postgresql://probe:" + FRAGMENT + "dz9k" + "@127.0.0.1:1/postgres"
DSN_ERROR = 'invalid dsn: missing "=" after "' + FRAGMENT + 'dz9k" in connection info string'
JOB_ID = "00000000-0000-0000-0000-000000000000"

PREAMBLE = """
import json, sys, types
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: False
sys.modules.setdefault("app.db", types.ModuleType("app.db")).get_db_conn = lambda: None
from fastapi.testclient import TestClient
from main import app
client = TestClient(app, raise_server_exceptions=False)
def call(method, path, **kwargs):
    r = client.request(method, path, **kwargs)
    return {"path": path, "status": r.status_code, "body": r.text,
            "request_id": r.headers.get("X-Request-ID")}
"""

PUBLIC_CALLS = """
calls = [
    call("GET", "/api/healthz"),
    call("GET", "/api/search/facets"),
    call("GET", "/api/search/query", params={"q": "officer"}),
    call("GET", "/api/jobs/%s"),
    call("GET", "/api/db/status"),
    call("GET", "/api/capabilities"),
]
""" % JOB_ID

ADMIN_CALLS = """
from app import sources
app.dependency_overrides[sources.admin_required] = lambda: "test-admin"
""" + SIGN_IN_IN_PROCESS + """
calls = [
    call("GET", "/api/admin/sources"),
    call("GET", "/api/admin/organisations"),
]
"""

DRIVER_FAILURE = """
import psycopg2
import main
def refuse(*args, **kwargs):
    raise psycopg2.OperationalError(%r)
psycopg2.connect = refuse
def facets_query_fails():
    raise RuntimeError(%r)
main.search_service._get_database_facets = facets_query_fails
""" % (DSN_ERROR, DSN_ERROR)

_ENV_KEPT = ("PATH", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE",
             "PYTHONPATH")


def _run(db_url, body):
    env = {k: os.environ[k] for k in _ENV_KEPT if k in os.environ}
    env.update(SUPABASE_DB_URL=db_url, AIDJOBS_DISABLE_SCHEDULER="true", AIDJOBS_ENV="production",
               COOKIE_SECRET="test-secret-for-leak-checks", PYTHONIOENCODING="utf-8")
    result = subprocess.run(
        [sys.executable, "-c", PREAMBLE + body + '\nprint(json.dumps({"calls": calls}))'],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True, encoding="utf-8", timeout=180,
    )
    output = [line for line in result.stdout.splitlines() if line.startswith('{"calls"')]
    assert result.returncode == 0 and output, result.stderr[-3000:]
    return json.loads(output[-1])["calls"], result.stdout + result.stderr


def _assert_no_leak(calls, logs):
    """The leak first, for every response and the logs; request IDs are checked separately."""
    leaking = [c["path"] for c in calls if FRAGMENT in c["body"]]
    assert not leaking, f"responses quoting the database password: {leaking}"
    assert FRAGMENT not in logs, [line for line in logs.splitlines() if FRAGMENT in line][:5]


def _assert_request_ids(calls):
    for c in calls:
        assert c["request_id"] and len(c["request_id"]) == 32, c
    assert len({c["request_id"] for c in calls}) == len(calls)


def _statuses(calls):
    return {c["path"]: c["status"] for c in calls}


def test_a_malformed_database_url_reaches_no_response_or_log():
    """Treated as "database not configured": the same answers as an unset URL."""
    calls, logs = _run(MALFORMED_DB_URL, PUBLIC_CALLS)
    _assert_no_leak(calls, logs)
    assert _statuses(calls) == {
        "/api/healthz": 200,
        "/api/search/facets": 200,
        "/api/search/query": 200,
        f"/api/jobs/{JOB_ID}": 404,
        "/api/db/status": 200,
        "/api/capabilities": 200,
    }
    db_status = next(c for c in calls if c["path"] == "/api/db/status")
    assert json.loads(db_status["body"]) == {"ok": False, "error": "Database unavailable"}
    assert "could not be parsed (ValueError)" in logs


def test_admin_pages_answer_503_for_a_malformed_database_url():
    calls, logs = _run(MALFORMED_DB_URL, ADMIN_CALLS)
    _assert_no_leak(calls, logs)
    assert _statuses(calls) == {"/api/admin/sources": 503, "/api/admin/organisations": 503}
    for c in calls:
        assert json.loads(c["body"]) == {"detail": "Database settings could not be read"}
    _assert_request_ids(calls)


def test_every_public_response_carries_a_new_request_id():
    for db_url, body in ((MALFORMED_DB_URL, PUBLIC_CALLS),
                         (WELL_FORMED_DB_URL, DRIVER_FAILURE + PUBLIC_CALLS)):
        calls, _logs = _run(db_url, body)
        _assert_request_ids(calls)


def test_driver_errors_reach_no_response_or_log():
    calls, logs = _run(WELL_FORMED_DB_URL, DRIVER_FAILURE + PUBLIC_CALLS)
    _assert_no_leak(calls, logs)
    assert _statuses(calls) == {
        "/api/healthz": 200,
        "/api/search/facets": 200,
        "/api/search/query": 200,
        f"/api/jobs/{JOB_ID}": 404,
        "/api/db/status": 200,
        "/api/capabilities": 200,
    }
    by_path = {c["path"]: c for c in calls}
    facets = json.loads(by_path["/api/search/facets"]["body"])
    assert facets["error"] == "Facets unavailable" and facets["enabled"] is False
    assert json.loads(by_path["/api/db/status"]["body"]) == {
        "ok": False, "error": "Database unavailable",
    }
    assert "<redacted>" in logs


def test_search_reuses_the_request_id():
    calls, _logs = _run(MALFORMED_DB_URL, PUBLIC_CALLS)
    search = next(c for c in calls if c["path"] == "/api/search/query")
    assert search["status"] == 200
    assert json.loads(search["body"])["request_id"] == search["request_id"]
