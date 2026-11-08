"""W-49: the job routes refuse an empty, oversized or mixed job list before reaching the database,
and a Hard Delete by job IDs removes exactly the listed jobs or nothing.

The admin page sends only non-empty lists of visible job IDs (at most 50, its page size), and its
Export button one job list, one filter, or nothing; those requests are still accepted, and
test_admin_jobs_errors.py's statement record proves they send the same statements as before.
No database and no network.
"""
import pytest

from tests.signed_in import session_headers
from tests.test_admin_jobs_errors import _Connection, _Cursor, _database

IMPACT = "/api/admin/jobs/impact-analysis"
DELETE = "/api/admin/jobs/delete-bulk"
EXPORT = "/api/admin/jobs/export"
RESTORE = "/api/admin/jobs/restore"

TWO_HUNDRED = [f"job-{i}" for i in range(200)]

TARGETED = {  # route -> the rest of a body it accepts
    IMPACT: {},
    DELETE: {"deletion_type": "soft", "export_data": False, "dry_run": False},
    EXPORT: {"format": "json"},
}

EMPTY = "job_ids must not be empty"
MIXED = "job_ids cannot be combined with org_name or source_id"
TOO_MANY = "At most 200 job IDs at a time"

REFUSED = [  # (target, detail)
    ({"job_ids": []}, EMPTY),
    ({"job_ids": [], "org_name": "UN"}, EMPTY),
    ({"job_ids": [], "source_id": "source-1"}, EMPTY),
    ({"job_ids": ["job-1"], "org_name": "UN"}, MIXED),
    ({"job_ids": ["job-1"], "org_name": ""}, MIXED),
    ({"job_ids": ["job-1"], "source_id": "source-1"}, MIXED),
    ({"job_ids": [*TWO_HUNDRED, "job-200"]}, TOO_MANY),
    ({"org_name": "UN", "source_id": "source-1"}, "Send org_name or source_id, not both"),
]


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


def _writes(log):
    return [s for s, _p in log if s.startswith(("DELETE", "UPDATE")) or s == "COMMIT"]


@pytest.mark.parametrize("path", TARGETED)
@pytest.mark.parametrize("target, detail", REFUSED, ids=lambda v: str(v)[:40])
def test_a_bad_selection_is_refused_before_the_database(monkeypatch, client, path, target, detail):
    log = _database(monkeypatch)
    response = client.post(path, json={**TARGETED[path], **target})
    assert (response.status_code, response.json()) == (400, {"detail": detail})
    assert log == []


@pytest.mark.parametrize("ids, detail", [([], EMPTY), ([*TWO_HUNDRED, "job-200"], TOO_MANY)])
def test_restore_refuses_an_empty_or_oversized_list(monkeypatch, client, ids, detail):
    log = _database(monkeypatch)
    response = client.post(RESTORE, json={"job_ids": ids})
    assert (response.status_code, response.json()) == (400, {"detail": detail})
    assert log == []


@pytest.mark.parametrize("path", [*TARGETED, RESTORE])
def test_two_hundred_ids_are_accepted(monkeypatch, client, path):
    log = _database(monkeypatch)
    response = client.post(path, json={**TARGETED.get(path, {}), "job_ids": TWO_HUNDRED})
    assert response.status_code == 200, response.text
    assert log


PAGE_REQUESTS = [  # (route, body), exactly as lib/admin/bulkDelete.ts and the Jobs page send them
    (IMPACT, {"job_ids": ["job-1", "job-2"]}),
    (IMPACT, {"job_ids": ["job-1", "job-2"], "date_from": "2026-01-01", "date_to": "2026-12-31"}),
    (DELETE, {"job_ids": ["job-1", "job-2"], "deletion_type": "soft", "export_data": False,
              "dry_run": False}),
    (DELETE, {"job_ids": ["job-1", "job-2"], "deletion_type": "hard",
              "deletion_reason": "duplicates", "export_data": False, "dry_run": False,
              "date_from": "2026-01-01"}),
    (EXPORT, {"job_ids": ["job-1", "job-2"], "format": "json"}),
    (EXPORT, {"format": "json"}),
    (EXPORT, {"format": "json", "org_name": "Oxfam"}),
    (EXPORT, {"format": "json", "source_id": "source-1"}),
    (RESTORE, {"job_ids": ["job-1", "job-2"]}),
]


@pytest.mark.parametrize("path, body", PAGE_REQUESTS, ids=lambda v: str(v)[:60])
def test_what_the_page_sends_is_still_accepted(monkeypatch, client, path, body):
    _database(monkeypatch)
    response = client.post(path, json=body)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ok"


def test_the_delete_routes_own_export_is_refused_before_anything_is_deleted(monkeypatch, client):
    log = _database(monkeypatch)
    response = client.post(DELETE, json={"job_ids": ["job-1"], "export_data": True})
    assert response.status_code == 400
    assert response.json() == {"detail": "export_data is no longer supported: save a copy with "
                                         "/api/admin/jobs/export before deleting"}
    assert log == []


def test_a_delete_reads_no_copy_of_the_jobs(monkeypatch, client):
    log = _database(monkeypatch)
    response = client.post(DELETE, json={"org_name": "Oxfam", "deletion_reason": "cleanup"})
    assert response.status_code == 200 and response.json()["data"]["exported_data"] is None
    assert not [s for s, _p in log if "LIMIT 10000" in s]


# A Hard Delete by job IDs ------------------------------------------------------------------

def _jobs(monkeypatch, present, deletable=None):
    """A database holding `present`; its DELETE removes only `deletable`, as when another change
    removed a job between the check and the delete."""
    from app import job_management

    class Cursor(_Cursor):
        def fetchall(self):
            deleting = deletable is not None and self.last.startswith("DELETE")
            held = deletable if deleting else present
            return [{"id": p, "title": p, "deleted_at": None, "status": "active"}
                    for p in dict.fromkeys(self.params) if p in held]

    class Connection(_Connection):
        def cursor(self, cursor_factory=None):
            return Cursor(self)

    conn = Connection()
    monkeypatch.setattr(job_management.db_config, "get_connection_params",
                        lambda: {"host": "db.example"})
    monkeypatch.setattr(job_management.psycopg2, "connect", lambda **kwargs: conn)
    return conn.log


def _hard(ids):
    return {"job_ids": ids, "deletion_type": "hard", "deletion_reason": "duplicates",
            "export_data": False, "dry_run": False}


@pytest.mark.parametrize("present, detail", [
    ({"job-1"}, "1 of the 2 listed jobs were not found. Nothing was deleted."),
    (set(), "2 of the 2 listed jobs were not found. Nothing was deleted."),
])
def test_a_hard_delete_missing_a_listed_job_deletes_nothing(monkeypatch, client, present,
                                                            detail):
    log = _jobs(monkeypatch, present)
    response = client.post(DELETE, json=_hard(["job-1", "job-2"]))
    assert (response.status_code, response.json()) == (409, {"detail": detail})
    assert _writes(log) == []


def test_a_hard_delete_that_removes_fewer_than_listed_is_rolled_back(monkeypatch, client):
    log = _jobs(monkeypatch, {"job-1", "job-2"}, deletable={"job-1"})
    response = client.post(DELETE, json=_hard(["job-1", "job-2"]))
    assert (response.status_code, response.json()) == (409, {
        "detail": "Only 1 of the 2 listed jobs could be deleted. Nothing was deleted."})
    assert [s for s, _p in log if s.startswith("DELETE")]
    assert ["ROLLBACK", []] in log and ["COMMIT", []] not in log


def test_a_hard_delete_of_every_listed_job_goes_ahead(monkeypatch, client):
    log = _jobs(monkeypatch, {"job-1", "job-2"})
    response = client.post(DELETE, json=_hard(["job-1", "job-2", "job-1"]))
    assert response.status_code == 200
    assert response.json()["data"]["deleted_count"] == 2
    assert ["COMMIT", []] in log


def test_a_soft_delete_still_skips_a_missing_job(monkeypatch, client):
    log = _jobs(monkeypatch, {"job-1"})
    response = client.post(DELETE, json={"job_ids": ["job-1", "job-2"], "deletion_type": "soft"})
    assert response.status_code == 200
    assert response.json()["data"]["deleted_count"] == 1
    assert ["COMMIT", []] in log
