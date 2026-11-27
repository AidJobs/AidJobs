"""W-52: a live job always belongs to an existing source that is not deleted.

A source's status is set by an edit only to active or paused; a deleted source is not edited,
crawled by hand, or removed while any of its jobs is live; a job is not restored under a deleted
or removed source. The database is a stand-in that records every statement; nothing touches a
network. tests/test_source_lifecycle_db.py runs the same rules against PostgreSQL in CI.
"""
import asyncio

import psycopg2
import psycopg2.errors
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import crawler_admin, sources
from app.errors import InternalError, internal_error_handler

SID = "00000000-0000-0000-0000-000000000000"
DELETED = "This source is deleted. Add it again with the same careers URL to restore it."
PENDING_EDIT = sources.PENDING_EDIT
PENDING_CRAWL = sources.PENDING_CRAWL
PENDING_ADDED = sources.PENDING_ADDED
PENDING_RESTORED = sources.PENDING_RESTORED
ACTIVATE_REFUSED = sources.ACTIVATE_REFUSED
ACTIVATED = sources.ACTIVATED
WRITES = ("UPDATE", "DELETE", "INSERT")


class Recorder:
    """A connection and cursor in one. `answers` maps a SQL fragment to the rows it returns."""

    def __init__(self, answers, fail_on=None):
        self.answers = answers
        self.fail_on = fail_on or {}
        self.log = []
        self.last = ""
        self.rowcount = 0

    def cursor(self, cursor_factory=None):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.last = " ".join(sql.split())
        self.log.append(self.last)
        for fragment, error in self.fail_on.items():
            if fragment in self.last:
                raise error

    def _rows(self):
        for fragment, rows in self.answers.items():
            if fragment in self.last:
                return list(rows)
        return []

    def fetchone(self):
        rows = self._rows()
        return rows[0] if rows else None

    def fetchall(self):
        return self._rows()

    def commit(self):
        self.log.append("COMMIT")

    def rollback(self):
        self.log.append("ROLLBACK")

    def close(self):
        pass


def _writes(log):
    return [s for s in log if s.startswith(WRITES) or s == "COMMIT"]


@pytest.fixture
def database(monkeypatch):
    """Point the sources routes at a Recorder answering `answers`; returns its statement log."""
    def configure(answers=None, fail_on=None):
        recorder = Recorder(answers or {}, fail_on)
        monkeypatch.setattr(sources.db_config, "get_connection_params", lambda: {"host": "x"})
        monkeypatch.setattr(psycopg2, "connect", lambda *a, **k: recorder)
        return recorder.log
    return configure


def _sources_app():
    app = FastAPI()
    app.include_router(sources.router)
    app.dependency_overrides[sources.admin_required] = lambda: "test-admin"
    return TestClient(app)


# An edit -----------------------------------------------------------------------------------

@pytest.mark.parametrize("status, detail", [
    ("deleted", "Delete a source with the delete action, which also hides its jobs"),
    ("Deleted", "status must be active or paused"),
    ("paused ", "status must be active or paused"),
    (" active", "status must be active or paused"),
    ("ACTIVE", "status must be active or paused"),
    ("", "status must be active or paused"),
    ("pending_validation", "status must be active or paused"),
    ("archived", "status must be active or paused"),
])
def test_an_edit_sets_only_active_or_paused_and_is_refused_before_the_database(
        database, status, detail):
    log = database()
    response = _sources_app().patch(f"/api/admin/sources/{SID}",
                                    json={"status": status, "org_name": "Renamed"})
    assert (response.status_code, response.json()) == (400, {"detail": detail})
    assert log == []


@pytest.mark.parametrize("status", ["active", "paused"])
def test_an_edit_to_active_or_paused_goes_through(database, status):
    row = {"id": SID, "status": status}
    log = database({"UPDATE sources": [row]})
    response = _sources_app().patch(f"/api/admin/sources/{SID}", json={"status": status})
    assert response.status_code == 200 and response.json()["data"] == row
    assert log[-1] == "COMMIT"


def test_an_edit_never_updates_a_deleted_source(database):
    log = database({"UPDATE sources": [{"id": SID, "status": "paused"}]})
    _sources_app().patch(f"/api/admin/sources/{SID}", json={"status": "paused"})
    update = next(s for s in log if s.startswith("UPDATE sources"))
    assert "WHERE id::text = %s AND status IS DISTINCT FROM 'deleted'" in update


def test_an_edit_of_a_deleted_source_is_409_and_commits_nothing(database):
    log = database({"SELECT status FROM sources": [{"status": "deleted"}]})
    response = _sources_app().patch(f"/api/admin/sources/{SID}", json={"status": "active"})
    assert (response.status_code, response.json()) == (409, {"detail": DELETED})
    assert "COMMIT" not in log


def test_an_edit_of_a_missing_source_is_still_404(database):
    database()
    response = _sources_app().patch(f"/api/admin/sources/{SID}", json={"org_name": "Renamed"})
    assert (response.status_code, response.json()) == (404, {"detail": "Source not found"})


# A source's type (W-53) --------------------------------------------------------------------

TYPE_REFUSED = "source_type must be html, rss or api"
BAD_TYPES = ["json", "HTML", "Api", " html", "rss ", "", "xml", "browser", "playwright"]


@pytest.mark.parametrize("source_type", BAD_TYPES)
@pytest.mark.parametrize("method, path", [
    ("POST", "/api/admin/sources"),
    ("POST", "/api/admin/sources/import"),
    ("PATCH", f"/api/admin/sources/{SID}"),
], ids=["create", "import", "edit"])
def test_a_type_outside_the_contract_is_refused_before_the_database(
        database, method, path, source_type):
    log = database()
    response = _sources_app().request(
        method, path, json={"careers_url": "https://example.org/jobs", "source_type": source_type})
    assert (response.status_code, response.json()) == (400, {"detail": TYPE_REFUSED})
    assert log == []


def test_the_types_are_the_contracts():
    from contracts.models import SOURCE_TYPES

    assert sources.SOURCE_TYPES is SOURCE_TYPES and SOURCE_TYPES == {"html", "rss", "api"}


@pytest.mark.parametrize("source_type", ["html", "rss", "api"])
def test_each_contract_type_is_accepted_on_create_and_edit(database, source_type):
    row = {"id": SID, "source_type": source_type}
    database({"INSERT INTO sources": [row], "UPDATE sources": [row]})
    client = _sources_app()
    created = client.post("/api/admin/sources",
                          json={"careers_url": "https://example.org/jobs",
                                "source_type": source_type})
    edited = client.patch(f"/api/admin/sources/{SID}", json={"source_type": source_type})
    assert created.status_code == 200 and edited.status_code == 200


def test_a_create_without_a_type_is_html(database):
    assert sources.SourceCreate(careers_url="https://example.org/jobs").source_type == "html"
    log = database({"INSERT INTO sources": [{"id": SID, "source_type": "html"}]})
    response = _sources_app().post("/api/admin/sources",
                                   json={"careers_url": "https://example.org/jobs"})
    assert response.status_code == 200
    assert any(s.startswith("INSERT INTO sources") for s in log)


def test_the_development_seed_uses_only_contract_types():
    from pathlib import Path

    seed = (Path(__file__).resolve().parents[3] / "infra" / "seed.sql").read_text(encoding="utf-8")
    sources_insert = seed.split("INSERT INTO sources", 1)[1].split(";", 1)[0]
    rows = [line for line in sources_insert.splitlines() if line.strip().startswith("('")]
    assert rows
    for row in rows:
        source_type = row.split("', '")[2]
        assert source_type in {"html", "rss", "api"}, row


def test_an_edit_without_a_type_leaves_it_unchanged(database):
    log = database({"UPDATE sources": [{"id": SID}]})
    response = _sources_app().patch(f"/api/admin/sources/{SID}", json={"org_name": "Renamed"})
    assert response.status_code == 200
    update = next(s for s in log if s.startswith("UPDATE sources"))
    assert "source_type" not in update.split(" WHERE")[0].split("RETURNING")[0]


# A permanent delete ------------------------------------------------------------------------

def _deleted_source(live, running=False):
    return {"FOR UPDATE": [{"id": SID, "status": "deleted"}],
            "status = 'running'": [{"?column?": 1}] if running else [],
            "deleted_at IS NULL": [{"live": live}]}


def test_a_permanent_delete_while_a_run_is_running_deletes_nothing(database):
    log = database(_deleted_source(0, running=True))
    response = _sources_app().delete(f"/api/admin/sources/{SID}/permanent")
    assert (response.status_code, response.json()) == (
        409, {"detail": "A crawl of this source is still running. Try again after it ends."})
    assert _writes(log) == []
    assert log[-1] == "ROLLBACK"


@pytest.mark.parametrize("live, detail", [
    (1, "1 job of this source is not deleted. Delete them on the Jobs page, then delete the "
        "source permanently."),
    (37, "37 jobs of this source are not deleted. Delete them on the Jobs page, then delete the "
         "source permanently."),
])
def test_a_permanent_delete_with_a_live_job_deletes_nothing(database, live, detail):
    log = database(_deleted_source(live))
    response = _sources_app().delete(f"/api/admin/sources/{SID}/permanent")
    assert (response.status_code, response.json()) == (409, {"detail": detail})
    assert _writes(log) == []
    assert log[-1] == "ROLLBACK"


def test_a_permanent_delete_locks_the_source_then_counts_then_deletes(database):
    log = database(_deleted_source(0))
    response = _sources_app().delete(f"/api/admin/sources/{SID}/permanent")
    assert response.status_code == 200
    assert log[0].startswith("SELECT id::text, status FROM sources WHERE id::text = %s FOR UPDATE")
    assert log[1] == ("SELECT 1 FROM crawl_logs WHERE source_id::text = %s "
                      "AND status = 'running' LIMIT 1")
    assert log[2] == ("SELECT COUNT(*) AS live FROM jobs WHERE source_id::text = %s "
                      "AND deleted_at IS NULL")
    assert [s.split(" WHERE")[0] for s in _writes(log)] == [
        "DELETE FROM crawl_logs", "DELETE FROM crawl_locks", "DELETE FROM sources", "COMMIT"]


def test_a_source_delete_locks_the_source_before_hiding_its_jobs(database):
    log = database({"FROM sources": [{"id": SID, "org_name": "Example"}],
                    "RETURNING id::text": [{"id": SID}]})
    response = _sources_app().delete(f"/api/admin/sources/{SID}")
    assert response.status_code == 200
    assert log[0] == "SET LOCAL lock_timeout = %s"
    assert log[1] == "SELECT id::text, org_name FROM sources WHERE id::text = %s FOR UPDATE"
    assert [s.split(" SET")[0] for s in _writes(log)] == [
        "UPDATE sources", "UPDATE jobs", "COMMIT"]


def test_a_source_delete_that_waits_too_long_for_a_save_deletes_nothing(database):
    log = database(fail_on={"FOR UPDATE": psycopg2.errors.LockNotAvailable("lock timeout")})
    response = _sources_app().delete(f"/api/admin/sources/{SID}")
    assert (response.status_code, response.json()) == (409, {
        "detail": "This source or its jobs are being changed (a crawl may be saving jobs). "
                  "Nothing was deleted; try again in a minute."})
    assert _writes(log) == [] and log[-1] == "ROLLBACK"


# A crawl by hand ---------------------------------------------------------------------------

class _Orchestrator:
    def __init__(self):
        self.started = []

    async def start_manual_run(self, source):
        self.started.append(source["id"])
        return "run-1", True


def _run(monkeypatch, status):
    orchestrator = _Orchestrator()
    row = {"id": SID, "org_name": "Example", "careers_url": "https://example.org/jobs",
           "source_type": "html", "status": status}
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    monkeypatch.setattr(crawler_admin.psycopg2, "connect",
                        lambda *a, **k: Recorder({"FROM sources": [row]}))
    monkeypatch.setattr(crawler_admin, "get_orchestrator", lambda url: orchestrator)
    app = FastAPI()
    app.include_router(crawler_admin.router)
    app.add_exception_handler(InternalError, internal_error_handler)
    app.dependency_overrides[crawler_admin.admin_required] = lambda: "test-admin"
    response = TestClient(app, raise_server_exceptions=False).post(
        "/api/admin/crawl/run", json={"source_id": SID})
    return response, orchestrator.started


def test_a_deleted_source_is_not_crawled_by_hand(monkeypatch):
    response, started = _run(monkeypatch, "deleted")
    assert (response.status_code, response.json()) == (409, {"detail": DELETED})
    assert started == []


@pytest.mark.parametrize("status", ["active", "paused"])
def test_any_other_source_may_be_crawled_by_hand(monkeypatch, status):
    response, started = _run(monkeypatch, status)
    assert response.status_code == 200 and started == [SID]


def test_a_pending_source_is_not_crawled_by_hand_until_it_is_activated(monkeypatch):
    """W-40: a source added by the probe flow is crawled only after its Activate action."""
    response, started = _run(monkeypatch, "pending_validation")
    assert (response.status_code, response.json()) == (409, {"detail": PENDING_CRAWL})
    assert started == []


# W-40: a pending source -------------------------------------------------------------------

def test_an_edit_cannot_move_a_pending_source_to_active_or_paused(database):
    log = database(
        {"UPDATE sources": [], "SELECT status FROM sources": [{"status": "pending_validation"}]}
    )
    for status in ("active", "paused"):
        response = _sources_app().patch(f"/api/admin/sources/{SID}", json={"status": status})
        assert (response.status_code, response.json()) == (409, {"detail": PENDING_EDIT})
    assert "COMMIT" not in log
    update = next(s for s in log if s.startswith("UPDATE sources"))
    assert "AND status IS DISTINCT FROM 'pending_validation'" in update


def test_an_edit_of_a_pending_source_without_a_status_goes_through(database):
    row = {"id": SID, "status": "pending_validation", "org_name": "Renamed"}
    log = database({"UPDATE sources": [row]})
    response = _sources_app().patch(f"/api/admin/sources/{SID}", json={"org_name": "Renamed"})
    assert response.status_code == 200 and response.json()["data"] == row
    update = next(s for s in log if s.startswith("UPDATE sources"))
    assert "pending_validation" not in update


def test_a_new_source_is_added_pending_with_no_crawl_queued(database):
    log = database({"INSERT INTO sources": [{"id": SID, "status": "pending_validation"}]})
    response = _sources_app().post("/api/admin/sources", json={
        "careers_url": "https://jobs.example.org/", "source_type": "html"})
    assert response.status_code == 200
    assert response.json()["message"] == PENDING_ADDED
    insert = next(s for s in log if s.startswith("INSERT INTO sources"))
    assert "'pending_validation', NULL" in insert
    assert "'active'" not in insert and "NOW()" not in insert


def test_a_restored_source_is_pending_with_no_crawl_queued(database):
    log = database({
        "SELECT id::text, status FROM sources": [{"id": SID, "status": "deleted"}],
        "UPDATE sources": [{"id": SID, "status": "pending_validation"}],
    })
    response = _sources_app().post("/api/admin/sources", json={
        "careers_url": "https://jobs.example.org/", "source_type": "html"})
    assert response.status_code == 200
    assert response.json()["message"] == PENDING_RESTORED
    update = next(s for s in log if s.startswith("UPDATE sources"))
    assert "status = 'pending_validation'" in update and "next_run_at = NULL" in update
    assert "next_run_at = NOW()" not in update


def test_activate_moves_only_a_pending_source_and_queues_its_crawl(database):
    log = database({"UPDATE sources": [{"id": SID, "status": "active"}]})
    response = _sources_app().post(f"/api/admin/sources/{SID}/activate")
    assert response.status_code == 200 and response.json()["message"] == ACTIVATED
    update = next(s for s in log if s.startswith("UPDATE sources"))
    assert "SET status = 'active', next_run_at = NOW()" in update
    assert "AND status = %s" in update
    assert log[-1] == "COMMIT"


@pytest.mark.parametrize("found, detail, code", [
    ([{"status": "active"}], ACTIVATE_REFUSED, 409),
    ([{"status": "paused"}], ACTIVATE_REFUSED, 409),
    ([{"status": "deleted"}], DELETED, 409),
    ([], "Source not found", 404),
])
def test_activate_refuses_any_source_that_is_not_pending(database, found, detail, code):
    log = database({"SELECT status FROM sources": found})
    response = _sources_app().post(f"/api/admin/sources/{SID}/activate")
    assert (response.status_code, response.json()) == (code, {"detail": detail})
    assert "COMMIT" not in log


# A job restore -----------------------------------------------------------------------------

def _restore(monkeypatch, restored, still_deleted, removed=0):
    from app import job_management as jm

    recorder = Recorder({"RETURNING id::text": [{"id": i} for i in restored],
                         "SELECT COUNT(*) as count": [{"count": still_deleted,
                                                       "removed": removed}]})
    monkeypatch.setattr(jm.db_config, "get_connection_params", lambda: {"host": "x"})
    monkeypatch.setattr(jm.psycopg2, "connect", lambda *a, **k: recorder)
    outcome = asyncio.run(jm.restore_jobs(jm.RestoreRequest(job_ids=["job-1", "job-2"]),
                                          admin="test-admin"))
    return outcome["data"], recorder.log


def test_a_restore_brings_back_only_jobs_of_a_source_that_is_not_deleted(monkeypatch):
    _data, log = _restore(monkeypatch, ["job-1"], 0)
    update = log[0]
    assert update.startswith("UPDATE jobs SET deleted_at = NULL")
    assert ("AND source_id IN ( SELECT s.id FROM sources s JOIN jobs j ON j.source_id = s.id "
            "WHERE j.id::text IN (%s,%s) AND s.status IS DISTINCT FROM 'deleted' FOR SHARE OF s )"
            ) in update


@pytest.mark.parametrize("restored, still_deleted, removed, message", [
    (["job-1"], 1, 0, "Restored 1 job. 1 job not restored: the source is deleted. "
                      "Add the source again, then restore its jobs."),
    ([], 2, 2, "Restored 0 jobs. 2 jobs cannot be restored: the source was deleted "
               "permanently."),
    (["job-1"], 3, 1, "Restored 1 job. 2 jobs not restored: the source is deleted. Add the "
                      "source again, then restore its jobs. 1 job cannot be restored: the "
                      "source was deleted permanently."),
])
def test_a_restore_says_how_many_jobs_it_left_deleted(monkeypatch, restored, still_deleted,
                                                      removed, message):
    data, _log = _restore(monkeypatch, restored, still_deleted, removed)
    assert data["restored_count"] == len(restored)
    assert data["not_restored_count"] == still_deleted
    assert data["message"] == message


def test_a_full_restore_keeps_its_message(monkeypatch):
    data, log = _restore(monkeypatch, ["job-1", "job-2"], 0)
    assert data["not_restored_count"] == 0
    assert data["message"] == "Successfully restored 2 jobs"
    assert log[-1] == "COMMIT"


# A crawl's job save ------------------------------------------------------------------------

class _SaveCursor:
    def __init__(self, source_row, run_row=(1,)):
        self.rows = {"FROM sources": source_row, "FROM crawl_logs": run_row}
        self.log = []

    def execute(self, sql, params=None):
        self.log.append(" ".join(sql.split()))

    def fetchone(self):
        last = self.log[-1]
        return next((row for key, row in self.rows.items() if key in last), None)


@pytest.mark.parametrize("source_row", [("deleted",), None], ids=["deleted", "removed"])
def test_a_save_refuses_a_deleted_or_removed_source_before_the_run_row(source_row):
    from contracts.run_ownership import SOURCE_DELETED_MESSAGE, SourceDeleted, confirm_running

    cursor = _SaveCursor(source_row)
    with pytest.raises(SourceDeleted, match=SOURCE_DELETED_MESSAGE):
        confirm_running(cursor, "run-1", SID)
    assert not [s for s in cursor.log if "crawl_logs" in s]


@pytest.mark.parametrize("status", ["active", "paused", "pending_validation"])
def test_a_save_locks_its_source_with_key_share_then_its_run_row(status):
    from contracts.run_ownership import confirm_running

    cursor = _SaveCursor((status,))
    confirm_running(cursor, "run-1", SID)
    assert cursor.log[1] == "SELECT status FROM sources WHERE id = %s FOR KEY SHARE"
    assert cursor.log[2] == ("SELECT ran_at::date FROM crawl_logs WHERE id = %s AND source_id = %s "
                             "AND status = 'running' FOR SHARE")


def test_a_refused_save_is_still_lost_ownership_for_its_callers():
    from contracts.run_ownership import OwnershipLost, SourceDeleted

    assert issubclass(SourceDeleted, OwnershipLost)


# The migration file ------------------------------------------------------------------------

@pytest.mark.parametrize("name", ["w52_sources_status_check.sql",
                                  "w52_sources_status_check_rollback.sql",
                                  "w53_sources_type_check.sql",
                                  "w53_sources_type_check_rollback.sql"])
def test_each_migration_file_is_one_transaction_with_its_timeouts(name):
    from pathlib import Path

    text = (Path(__file__).resolve().parents[3] / "infra" / "migrations" / name).read_text(
        encoding="utf-8")
    statements = [line for line in text.splitlines() if line and not line.startswith("--")]
    assert statements[0] == "BEGIN;"
    assert statements[1:3] == ["SET LOCAL lock_timeout = '5s';",
                               "SET LOCAL statement_timeout = '60s';"]
    assert statements[-1] == "COMMIT;"
    assert text.count("BEGIN;") == 1 and text.count("COMMIT;") == 1
