"""The crawler admin routes keep their contract: authentication, 4xx answers, shapes.

Security stage 3, phase 2, PR 2 changes what an unexpected failure says, routes link validation
through the outbound policy and limits its request size. The database and the validator are fakes;
nothing touches a network.
"""
import psycopg2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import crawler_admin
from app.errors import InternalError, internal_error_handler
from tests.test_admin_crawler_errors import ALL_ROUTES, CONVERTED, SID

NO_DB_URL = "No PostgreSQL database URL configured. Set SUPABASE_DB_URL or DATABASE_URL."


class FakeCursor:
    def __init__(self, row=None):
        self.row = row

    def execute(self, sql, params=None):
        pass

    def fetchone(self):
        return self.row

    def fetchall(self):
        return []

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeConnection:
    def __init__(self, row=None):
        self.row = row

    def cursor(self, cursor_factory=None):
        return FakeCursor(self.row)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


def _app(signed_in=True):
    app = FastAPI()
    for router in (crawler_admin.router, crawler_admin.robots_router,
                   crawler_admin.policies_router, crawler_admin.quality_router,
                   crawler_admin.link_validation_router, crawler_admin.meilisearch_router,
                   crawler_admin.observability_router):
        app.include_router(router)
    app.add_exception_handler(InternalError, internal_error_handler)
    if signed_in:
        app.dependency_overrides[crawler_admin.admin_required] = lambda: "test-admin"
    return TestClient(app, raise_server_exceptions=False)


def _send(client, method, path, body):
    return client.request(method, path, json=body) if body is not None else client.request(
        method, path)


@pytest.fixture
def no_database_url(monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    for name in ("MEILISEARCH_URL", "MEILI_HOST", "MEILISEARCH_KEY", "MEILI_API_KEY",
                 "MEILI_MASTER_KEY"):
        monkeypatch.delenv(name, raising=False)


@pytest.mark.parametrize("method, path, body", ALL_ROUTES)
def test_every_route_requires_a_session(method, path, body):
    response = _send(_app(signed_in=False), method, path, body)
    assert response.status_code == 401, (path, response.text)


@pytest.mark.parametrize("method, path, body, _message",
                         [r for r in CONVERTED if "meilisearch" not in r[1]])
def test_a_missing_database_url_keeps_its_own_500(no_database_url, method, path, body, _message):
    """Not re-wrapped: before this change, observability answered "Failed to …: 500: No …"."""
    response = _send(_app(), method, path, body)
    assert response.status_code == 500, (path, response.text)
    assert response.json() == {"detail": NO_DB_URL}, path


def test_meilisearch_not_configured_stays_400(no_database_url):
    response = _app().post("/api/admin/meilisearch/sync")
    assert response.status_code == 400
    assert response.json() == {"detail": "Meilisearch not configured"}


def test_the_migration_route_stays_disabled():
    response = _app().post("/api/admin/crawl/run-migration")
    assert response.status_code == 410
    assert response.json() == {"detail": "Runtime schema migration is disabled"}


@pytest.mark.parametrize("method, path, detail", [
    ("GET", f"/api/admin/crawl/analytics/source/{SID}", "Source not found"),
    ("POST", f"/api/admin/link-validation/validate-job/{SID}", "Job not found"),
])
def test_not_found_answers_are_unchanged(monkeypatch, method, path, detail):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    monkeypatch.setattr(crawler_admin.psycopg2, "connect", lambda url: FakeConnection(None))
    response = _app().request(method, path)
    assert response.status_code == 404
    assert response.json() == {"detail": detail}


class FakeValidator:
    def __init__(self):
        self.seen = None

    async def validate_batch(self, urls, use_cache=True, max_concurrent=10):
        self.seen = list(urls)
        return {url: {"valid": i == 0, "status_code": 200 if i == 0 else 404, "final_url": url,
                      "redirect_count": 0, "error": None if i == 0 else "Invalid status code: 404",
                      "cached": False, "validated_at": None}
                for i, url in enumerate(urls)}


def test_link_validation_keeps_its_response_shape(monkeypatch):
    from core import link_validator

    fake = FakeValidator()
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    monkeypatch.setattr(link_validator, "get_link_validator", lambda db_url: fake)
    urls = ["https://jobs.example/a", "https://jobs.example/b"]
    response = _app().post("/api/admin/link-validation/validate", json={"urls": urls})
    body = response.json()
    assert response.status_code == 200
    assert set(body) == {"status", "total", "valid", "invalid", "results"}
    assert (body["status"], body["total"], body["valid"], body["invalid"]) == ("ok", 2, 1, 1)
    assert fake.seen == urls


def test_no_urls_still_answers_ok(monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    response = _app().post("/api/admin/link-validation/validate", json={})
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "No URLs to validate", "results": {}}


@pytest.mark.parametrize("body", [
    {"urls": ["https://jobs.example/" + str(i) for i in range(101)]},
    {"job_ids": [SID] * 101},
    {"urls": ["https://jobs.example/" + "a" * 2049]},
    {"job_ids": ["j" * 65]},
])
def test_oversized_requests_are_refused_before_any_work(monkeypatch, body):
    from core import link_validator

    def fail(db_url):
        raise AssertionError("the validator must not be reached")

    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    monkeypatch.setattr(link_validator, "get_link_validator", fail)
    response = _app().post("/api/admin/link-validation/validate", json=body)
    assert response.status_code == 422


def test_the_limits_accept_their_maximum():
    model = crawler_admin.ValidateLinksRequest(
        urls=["https://jobs.example/" + "a" * (2048 - 21)] * 100, job_ids=["j" * 64] * 100)
    assert len(model.urls) == 100 and len(model.urls[0]) == 2048
    assert len(model.job_ids) == 100 and len(model.job_ids[0]) == 64
    with pytest.raises(ValidationError):
        crawler_admin.ValidateLinksRequest(urls=["x"] * 101)


class StatsValidator:
    def __init__(self):
        self.seen = "not called"

    def get_validation_stats(self, job_ids):
        self.seen = job_ids
        return {"total": 0}


@pytest.mark.parametrize("job_ids, detail", [
    (",".join([SID] * 101), "At most 100 job IDs"),
    ("j" * 65, "Each job ID is at most 64 characters"),
])
def test_stats_refuses_too_many_or_too_long_job_ids(monkeypatch, job_ids, detail):
    from core import link_validator

    fake = StatsValidator()
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    monkeypatch.setattr(link_validator, "get_link_validator", lambda db_url: fake)
    response = _app().get("/api/admin/link-validation/stats", params={"job_ids": job_ids})
    assert response.status_code == 422
    assert response.json() == {"detail": detail}
    assert fake.seen == "not called"


def test_stats_refuses_an_oversized_query_before_splitting_it(monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    response = _app().get("/api/admin/link-validation/stats",
                          params={"job_ids": "j" * (100 * 65 + 1)})
    assert response.status_code == 422


def test_stats_accepts_its_maximum(monkeypatch):
    from core import link_validator

    fake = StatsValidator()
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    monkeypatch.setattr(link_validator, "get_link_validator", lambda db_url: fake)
    ids = ["j" * 64] * 100
    response = _app().get("/api/admin/link-validation/stats", params={"job_ids": ",".join(ids)})
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "data": {"total": 0}}
    assert fake.seen == ids


class BrokenConnection(FakeConnection):
    """Fails its statement, then fails its rollback too (a dropped connection does both)."""

    def cursor(self, cursor_factory=None):
        cursor = FakeCursor()

        def fail(sql, params=None):
            raise psycopg2.OperationalError("server closed the connection")

        cursor.execute = fail
        return cursor

    def rollback(self):
        raise psycopg2.InterfaceError("connection already closed")


def test_a_failed_rollback_still_answers_the_fixed_message(monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    monkeypatch.setattr(crawler_admin.psycopg2, "connect", lambda url: BrokenConnection())
    response = _app().post("/api/admin/crawl/delete-jobs-by-org", params={"org_name": "Probe"})
    assert response.status_code == 500
    request_id = response.json()["request_id"]
    assert response.json() == {"detail": f"Failed to delete jobs (ref {request_id[:8]})",
                               "request_id": request_id}
