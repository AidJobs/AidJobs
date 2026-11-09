"""W-52: a live job always belongs to an existing source that is not deleted.

A source's status is set by an edit only to active or paused; a deleted source is not edited,
crawled by hand, or removed while any of its jobs is live; a job is not restored under a deleted
or removed source. The database is a stand-in that records every statement; nothing touches a
network. tests/test_source_lifecycle_db.py runs the same rules against PostgreSQL in CI.
"""
import asyncio

import psycopg2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import crawler_admin, sources
from app.errors import InternalError, internal_error_handler

SID = "00000000-0000-0000-0000-000000000000"
DELETED = "This source is deleted. Add it again with the same careers URL to restore it."
WRITES = ("UPDATE", "DELETE", "INSERT")


class Recorder:
    """A connection and cursor in one. `answers` maps a SQL fragment to the rows it returns."""

    def __init__(self, answers):
        self.answers = answers
        self.log = []
        self.last = ""

    def cursor(self, cursor_factory=None):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.last = " ".join(sql.split())
        self.log.append(self.last)

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
    def configure(answers=None):
        recorder = Recorder(answers or {})
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
    log = database({"SELECT 1 FROM sources": [{"?column?": 1}]})
    response = _sources_app().patch(f"/api/admin/sources/{SID}", json={"status": "active"})
    assert (response.status_code, response.json()) == (409, {"detail": DELETED})
    assert "COMMIT" not in log


def test_an_edit_of_a_missing_source_is_still_404(database):
    database()
    response = _sources_app().patch(f"/api/admin/sources/{SID}", json={"org_name": "Renamed"})
    assert (response.status_code, response.json()) == (404, {"detail": "Source not found"})


# A permanent delete ------------------------------------------------------------------------

def _deleted_source(live):
    return {"FOR UPDATE": [{"id": SID, "status": "deleted"}],
            "deleted_at IS NULL": [{"live": live}]}


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
    assert log[1] == ("SELECT COUNT(*) AS live FROM jobs WHERE source_id::text = %s "
                      "AND deleted_at IS NULL")
    assert [s.split(" WHERE")[0] for s in _writes(log)] == [
        "DELETE FROM crawl_logs", "DELETE FROM crawl_locks", "DELETE FROM sources", "COMMIT"]


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


@pytest.mark.parametrize("status", ["active", "paused", "pending_validation"])
def test_any_other_source_may_be_crawled_by_hand(monkeypatch, status):
    response, started = _run(monkeypatch, status)
    assert response.status_code == 200 and started == [SID]


# A job restore -----------------------------------------------------------------------------

def _restore(monkeypatch, restored, still_deleted):
    from app import job_management as jm

    recorder = Recorder({"RETURNING id::text": [{"id": i} for i in restored],
                         "SELECT COUNT(*) as count": [{"count": still_deleted}]})
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


@pytest.mark.parametrize("restored, still_deleted, message", [
    (["job-1"], 1, "Restored 1 job. 1 job was not restored: the source is deleted or gone. "
                   "Add the source again, then restore its jobs."),
    ([], 2, "Restored 0 jobs. 2 jobs were not restored: the source is deleted or gone. "
            "Add the source again, then restore its jobs."),
])
def test_a_restore_says_how_many_jobs_it_left_deleted(monkeypatch, restored, still_deleted,
                                                      message):
    data, _log = _restore(monkeypatch, restored, still_deleted)
    assert data["restored_count"] == len(restored)
    assert data["not_restored_count"] == still_deleted
    assert data["message"] == message


def test_a_full_restore_keeps_its_message(monkeypatch):
    data, log = _restore(monkeypatch, ["job-1", "job-2"], 0)
    assert data["not_restored_count"] == 0
    assert data["message"] == "Successfully restored 2 jobs"
    assert log[-1] == "COMMIT"
