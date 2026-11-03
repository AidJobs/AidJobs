"""Security stage 3, phase 2, PR 3: the job management admin routes return no exception text.

The route walk reuses test_admin_crawler_errors.py's fresh process (production build, signed in
through a dependency override, real sockets and DNS refused); the database driver fails with fake
connection-string text. The statement record proves the routes send the database exactly what
`main` sent before this change (recorded from `main` at 130be19 into a fixture), so deleting,
restoring and exporting are unchanged. No database and no network.
"""
import asyncio
import json
import logging
import re
from pathlib import Path

import psycopg2
import psycopg2.errors
import pytest

from tests.signed_in import session_headers
from tests.test_admin_crawler_errors import DSN_ERROR, FRAGMENT, _calls_source, _run

SID = "00000000-0000-0000-0000-000000000000"
STATEMENTS = Path(__file__).resolve().parent / "fixtures" / "job_routes" / "statements.json"

FAILURES = """
import psycopg2
def refuse(*args, **kwargs):
    raise psycopg2.OperationalError(%r)
psycopg2.connect = refuse
""" % DSN_ERROR

CONVERTED = [  # (method, path, JSON body, fixed message)
    ("GET", "/api/admin/jobs/search", None, "Failed to search jobs"),
    ("POST", "/api/admin/jobs/impact-analysis", {"job_ids": [SID]}, "Failed to analyze impact"),
    ("POST", "/api/admin/jobs/delete-bulk", {"job_ids": [SID]}, "Failed to delete jobs"),
    ("POST", "/api/admin/jobs/restore", {"job_ids": [SID]}, "Failed to restore jobs"),
    ("POST", "/api/admin/jobs/export", {"job_ids": [SID]}, "Failed to export jobs"),
]
DIAGNOSE = [("GET", "/api/admin/jobs/diagnose/search-vs-db", None),
            ("GET", f"/api/admin/jobs/diagnose/{SID}", None)]
JOB_ROUTES = [route[:3] for route in CONVERTED] + DIAGNOSE


@pytest.fixture(scope="module")
def walk():
    return _run(FAILURES + _calls_source(JOB_ROUTES))


def test_no_job_route_reaches_a_network(walk):
    calls, _logs = walk
    assert calls["network attempts"]["status"] == 0, calls["network attempts"]["body"]


def test_no_response_or_log_line_quotes_the_fake_password(walk):
    calls, logs = walk
    leaking = [route for route, c in calls.items() if FRAGMENT in c["body"]]
    assert not leaking, f"responses quoting the fake database password: {leaking}"
    assert FRAGMENT not in logs, [line for line in logs.splitlines() if FRAGMENT in line][:5]


def test_failures_return_a_fixed_message_with_a_reference(walk):
    calls, _logs = walk
    for method, path, _body, message in CONVERTED:
        c = calls[f"{method} {path}"]
        request_id = c["request_id"]
        assert c["status"] == 500, (path, c["status"], c["body"][:300])
        assert re.fullmatch(r"[0-9a-f]{32}", request_id or ""), path
        assert json.loads(c["body"]) == {
            "detail": f"{message} (ref {request_id[:8]})", "request_id": request_id,
        }, path


def test_the_diagnose_routes_keep_their_shape_with_a_fixed_message(walk):
    calls, _logs = walk
    for method, path, _body in DIAGNOSE:
        c = calls[f"{method} {path}"]
        assert c["status"] == 200, (path, c["status"], c["body"][:300])
        assert json.loads(c["body"]) == {
            "status": "error", "error": f"Diagnosis failed (ref {c['request_id'][:8]})",
        }, path


def test_each_reference_leads_to_the_logged_cause(walk):
    calls, logs = walk
    causes = [line for line in logs.splitlines() if "OperationalError" in line]
    for method, path, _body in JOB_ROUTES:
        c = calls[f"{method} {path}"]
        assert any(line.startswith(f"[{c['request_id']}]") for line in causes), path


# In process ---------------------------------------------------------------------------------

def _flat(routes):
    for route in routes:
        if type(route).__name__ == "_IncludedRouter":
            yield from _flat(route.original_router.routes)
        else:
            yield route


def test_each_job_route_is_registered_once():
    from main import app

    seen = [(route.path, tuple(sorted(route.methods)))
            for route in _flat(app.routes)
            if getattr(route, "path", "").startswith("/api/admin/jobs/")]
    assert len(seen) == 7
    assert len(set(seen)) == 7, sorted(seen)


@pytest.fixture
def client(monkeypatch):
    from fastapi.testclient import TestClient

    from app import job_management
    from main import app

    app.dependency_overrides[job_management.admin_required] = lambda: "test-admin"
    try:
        yield TestClient(app, raise_server_exceptions=False, headers=session_headers(monkeypatch))
    finally:
        app.dependency_overrides.pop(job_management.admin_required, None)


def test_every_job_route_refuses_a_caller_without_a_session():
    from fastapi.testclient import TestClient

    from main import app

    anonymous = TestClient(app, raise_server_exceptions=False)
    for method, path, body in JOB_ROUTES:
        response = anonymous.request(method, path, json=body)
        assert response.status_code == 401, (path, response.status_code)


def test_not_configured_passes_through_instead_of_being_rewrapped(monkeypatch, client):
    from app import job_management

    monkeypatch.setattr(job_management.db_config, "get_connection_params", lambda: None)
    for method, path, body in JOB_ROUTES:
        response = client.request(method, path, json=body)
        assert response.status_code == 500, path
        assert response.json() == {"detail": "Database not configured"}, path


@pytest.mark.parametrize("body, detail", [
    ({}, "At least one filter is required: job_ids, org_name, or source_id"),
    ({"org_name": "   "}, "org_name cannot be empty"),
])
def test_bulk_delete_keeps_its_own_400s(monkeypatch, client, body, detail):
    _database(monkeypatch)
    response = client.post("/api/admin/jobs/delete-bulk", json=body)
    assert (response.status_code, response.json()) == (400, {"detail": detail})


def test_a_hard_delete_without_a_reason_keeps_its_400_and_deletes_nothing(monkeypatch, client):
    log = _database(monkeypatch)
    response = client.post("/api/admin/jobs/delete-bulk",
                           json={"job_ids": ["job-1"], "deletion_type": "hard"})
    assert (response.status_code, response.json()) == (
        400, {"detail": "Deletion reason is required for hard delete"})
    assert not [s for s, _p in log if s.startswith(("DELETE", "UPDATE"))]
    assert ["COMMIT", []] not in log


def test_missing_deletion_columns_keep_their_message_and_roll_back(monkeypatch, client, caplog):
    log = _database(monkeypatch, fail_on="UPDATE jobs", error=psycopg2.errors.UndefinedColumn(
        'column "deleted_at" does not exist ' + FRAGMENT))
    with caplog.at_level(logging.ERROR, logger="app.job_management"):
        response = client.post("/api/admin/jobs/delete-bulk", json={"job_ids": ["job-1"]})
    assert response.status_code == 500
    assert response.json()["detail"].startswith("Database schema error: Missing deletion columns.")
    assert ["ROLLBACK", []] in log and ["COMMIT", []] not in log
    assert any("Missing deletion columns" in r.getMessage() for r in caplog.records)
    assert FRAGMENT not in response.text


@pytest.mark.parametrize("error", [
    psycopg2.errors.SyntaxError("syntax error at or near " + FRAGMENT),
    psycopg2.errors.SyntaxError('column "deleted_at" does not exist ' + FRAGMENT),
    RuntimeError("password=" + FRAGMENT),
])
def test_any_other_delete_failure_is_a_fixed_message_and_rolls_back(monkeypatch, client, error):
    """Missing columns are recognised by the error's type: the same words in another error are
    an ordinary failure."""
    log = _database(monkeypatch, fail_on="UPDATE jobs", error=error)
    response = client.post("/api/admin/jobs/delete-bulk", json={"job_ids": ["job-1"]})
    request_id = response.headers["X-Request-ID"]
    assert (response.status_code, response.json()) == (500, {
        "detail": f"Failed to delete jobs (ref {request_id[:8]})", "request_id": request_id})
    assert ["ROLLBACK", []] in log and ["COMMIT", []] not in log


def test_a_failed_restore_rolls_back(monkeypatch, client):
    log = _database(monkeypatch, fail_on="UPDATE jobs", error=RuntimeError(FRAGMENT))
    response = client.post("/api/admin/jobs/restore", json={"job_ids": ["job-1"]})
    assert response.status_code == 500 and FRAGMENT not in response.text
    assert ["ROLLBACK", []] in log and ["COMMIT", []] not in log


def test_a_failed_rollback_does_not_hide_the_fixed_message(monkeypatch, client):
    _database(monkeypatch, fail_on="UPDATE jobs", error=RuntimeError(FRAGMENT),
              rollback_error=psycopg2.InterfaceError("connection already closed " + FRAGMENT))
    response = client.post("/api/admin/jobs/delete-bulk", json={"job_ids": ["job-1"]})
    assert response.status_code == 500
    assert response.json()["detail"].startswith("Failed to delete jobs (ref ")


# The diagnose fix ---------------------------------------------------------------------------

def _coded(name, code):
    return type(name, (getattr(psycopg2.errors, name),), {"pgcode": code})


@pytest.mark.parametrize("error, expected", [
    (_coded("InvalidTextRepresentation", "22P02")("invalid uuid " + FRAGMENT),
     "InvalidTextRepresentation (22P02)"),
    (psycopg2.OperationalError("server closed " + FRAGMENT), "OperationalError"),
    (RuntimeError("password=" + FRAGMENT), "RuntimeError"),
])
def test_a_failed_check_is_named_by_type_and_code_only(error, expected):
    from app.job_management import describe_check_failure

    assert describe_check_failure(error) == expected


CHECKS = [  # (check, a fragment of its query, in the route's order)
    ("uuid_direct", "WHERE id::uuid = %s"),
    ("text_direct", "SELECT id, id::text FROM jobs WHERE id::text = %s LIMIT 1"),
    ("text_array", "ANY(ARRAY[%s]::text[]) LIMIT 1"),
    ("text_ilike", "ILIKE %s LIMIT 1"),
    ("sample_ids", "pg_typeof(id)"),
    ("total_jobs", "SELECT COUNT(*) as total FROM jobs"),
    ("similar_ids", "id::text LIKE %s LIMIT 10"),
    ("including_deleted", "SELECT id::text, deleted_at, title FROM jobs WHERE id::text = %s"),
    ("search_endpoint_ids", "WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10"),
    ("all_db_ids_sample", "ORDER BY created_at DESC LIMIT 100"),
]


@pytest.mark.parametrize("failing", range(len(CHECKS)), ids=[name for name, _q in CHECKS])
def test_one_failed_check_no_longer_fails_every_later_one(monkeypatch, client, failing):
    name, query = CHECKS[failing]
    bad = _coded("InvalidTextRepresentation", "22P02")("invalid input " + FRAGMENT)
    log = _database(monkeypatch, fail_on=query, error=bad, abort=True)
    response = client.get("/api/admin/jobs/diagnose/not-a-uuid")
    body = response.json()
    assert response.status_code == 200 and body["status"] == "ok"
    tests = body["data"]["tests"]
    assert tests[name]["success"] is False
    assert tests[name]["error"] == "InvalidTextRepresentation (22P02)"
    for later, _q in CHECKS[failing + 1:]:
        assert tests[later]["success"] is True, (later, tests[later])
    assert ["ROLLBACK", []] in log
    assert FRAGMENT not in response.text


# The statement record -----------------------------------------------------------------------

class _Cursor:
    def __init__(self, conn):
        self.conn = conn
        self.last = ""
        self.params = []

    def execute(self, sql, params=None):
        self.last = " ".join(sql.split())
        self.params = [str(p) for p in (params or [])]
        self.conn.log.append([self.last, self.params])
        if self.conn.aborted:
            raise psycopg2.errors.InFailedSqlTransaction("current transaction is aborted")
        if self.conn.fail_on and self.conn.fail_on in self.last:
            self.conn.aborted = self.conn.abort
            raise self.conn.error

    def fetchone(self):
        return {"count": 2, "total": 2}

    def fetchall(self):
        if "FROM sources" in self.last:
            return [{"id": "source-1", "org_name": "Org", "careers_url": "https://org.example/",
                     "status": "active"}]
        ids = [p for p in self.params if p.startswith("job-")] or ["job-1", "job-2"]
        return [{"id": i, "title": f"Title {i}", "deleted_at": None, "status": "active",
                 "source_id": "source-1", "org_name": "Org"} for i in ids]

    def close(self):
        self.conn.log.append(["CURSOR CLOSE", []])


class _Connection:
    def __init__(self, fail_on=None, error=None, abort=False, rollback_error=None):
        self.log = []
        self.fail_on, self.error, self.abort = fail_on, error, abort
        self.aborted = False
        self.rollback_error = rollback_error

    def cursor(self, cursor_factory=None):
        return _Cursor(self)

    def commit(self):
        self.log.append(["COMMIT", []])

    def rollback(self):
        self.log.append(["ROLLBACK", []])
        if self.rollback_error is not None:
            raise self.rollback_error
        self.aborted = False

    def close(self):
        self.log.append(["CLOSE", []])


def _database(monkeypatch, **failure):
    from app import job_management

    conn = _Connection(**failure)
    monkeypatch.setattr(job_management.db_config, "get_connection_params",
                        lambda: {"host": "db.example"})
    monkeypatch.setattr(job_management.psycopg2, "connect", lambda **kwargs: conn)
    monkeypatch.delenv("MEILISEARCH_URL", raising=False)
    monkeypatch.delenv("MEILI_HOST", raising=False)
    return conn.log


def _cases(jm):
    search = dict(query=None, org_name=None, source_id=None, status=None, include_deleted=False,
                  date_from=None, date_to=None, quality_min=None, page=1, size=50, sort_by=None,
                  sort_order="desc", admin="test-admin")
    bulk = jm.BulkDeleteRequest
    yield "search, defaults", lambda: jm.search_jobs(**search)
    yield "search, every filter", lambda: jm.search_jobs(**{
        **search, "query": "engineer", "org_name": "Ox", "source_id": "source-1",
        "status": "active", "date_from": "2026-01-01", "date_to": "2026-12-31",
        "quality_min": 50, "page": 2, "size": 20, "sort_by": "title", "sort_order": "asc"})
    yield "search, deleted", lambda: jm.search_jobs(**{**search, "status": "deleted"})
    yield "impact, ids", lambda: jm.get_deletion_impact(
        bulk(job_ids=["job-1", "job-2"]), admin="test-admin")
    yield "impact, organisation", lambda: jm.get_deletion_impact(
        bulk(org_name="Oxfam"), admin="test-admin")
    yield "impact, source and dates", lambda: jm.get_deletion_impact(
        bulk(source_id="source-1", date_from="2026-01-01", date_to="2026-06-30"),
        admin="test-admin")
    yield "delete, ids, soft", lambda: jm.bulk_delete_jobs(
        bulk(job_ids=["job-1", "job-2"]), admin="test-admin")
    yield "delete, ids, hard", lambda: jm.bulk_delete_jobs(
        bulk(job_ids=["job-1"], deletion_type="hard", deletion_reason="duplicate"),
        admin="test-admin")
    yield "delete, ids, dry run", lambda: jm.bulk_delete_jobs(
        bulk(job_ids=["job-1", "job-2"], dry_run=True), admin="test-admin")
    yield "delete, organisation, export", lambda: jm.bulk_delete_jobs(
        bulk(org_name="Oxfam", export_data=True, deletion_reason="cleanup"), admin="test-admin")
    yield "delete, source and dates", lambda: jm.bulk_delete_jobs(
        bulk(source_id="source-1", date_from="2026-01-01", date_to="2026-06-30"),
        admin="test-admin")
    yield "restore", lambda: jm.restore_jobs(
        jm.RestoreRequest(job_ids=["job-1", "job-2"]), admin="test-admin")
    yield "export, ids, json", lambda: jm.export_jobs(
        jm.ExportRequest(job_ids=["job-1"]), admin="test-admin")
    yield "export, organisation, csv", lambda: jm.export_jobs(
        jm.ExportRequest(org_name="Oxfam", format="csv"), admin="test-admin")
    yield "diagnose, search against database", lambda: jm.diagnose_search_vs_db(admin="test-admin")
    yield "diagnose, one id", lambda: jm.diagnose_job_id("job-1", admin="test-admin")


def record_statements():
    """Every case's statements, commits and result; run on `main` to make the fixture."""
    from app import job_management as jm

    mp = pytest.MonkeyPatch()
    record = {}
    try:
        for name, call in _cases(jm):
            log = _database(mp)
            try:
                outcome = asyncio.run(call())
            except Exception as exc:
                outcome = {"raised": type(exc).__name__,
                           "status": getattr(exc, "status_code", None),
                           "detail": getattr(exc, "detail", None)}
            outcome = json.loads(json.dumps(outcome, default=str))
            record[name] = {"statements": log, "outcome": outcome}
    finally:
        mp.undo()
    return record


def test_every_job_route_sends_the_same_statements_as_before():
    expected = json.loads(STATEMENTS.read_text(encoding="utf-8"))
    actual = record_statements()
    assert sorted(actual) == sorted(expected)
    for name in expected:
        assert actual[name] == expected[name], name


def test_the_record_covers_both_kinds_of_delete():
    expected = json.loads(STATEMENTS.read_text(encoding="utf-8"))
    statements = [s for case in expected.values() for s, _p in case["statements"]]
    assert any(s.startswith("DELETE FROM jobs") for s in statements)
    assert any(s.startswith("UPDATE jobs SET deleted_at = NOW()") for s in statements)
    assert any(s.startswith("UPDATE jobs SET deleted_at = NULL") for s in statements)
    assert sum(s == "COMMIT" for s in statements) == 5
