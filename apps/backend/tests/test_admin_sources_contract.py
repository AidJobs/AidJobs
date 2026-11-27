"""The sources admin routes keep their contract: authentication, 4xx answers, shapes.

Security stage 3, phase 2 changes only what an unexpected failure says. These checks pass on the
code before and after that change. The database is a fake; nothing touches a network.

W-35 3a: the presets routes and the v1 API schema checks are gone.
"""
import psycopg2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import sources
from crawler_v2.probe import ADDRESS_REFUSED

SID = "00000000-0000-0000-0000-000000000000"
ROUTES = [
    ("GET", "/api/admin/sources", None),
    ("GET", "/api/admin/organisations", None),
    ("GET", f"/api/admin/sources/{SID}", None),
    ("POST", "/api/admin/sources", {"careers_url": "https://example.org/jobs"}),
    ("PATCH", f"/api/admin/sources/{SID}", {"org_name": "Renamed"}),
    ("DELETE", f"/api/admin/sources/{SID}", None),
    ("DELETE", f"/api/admin/sources/{SID}/permanent", None),
    ("GET", f"/api/admin/sources/{SID}/export", None),
    ("POST", "/api/admin/sources/import", {"careers_url": "https://example.org/jobs"}),
    ("POST", f"/api/admin/sources/{SID}/test", None),
    ("POST", f"/api/admin/sources/{SID}/simulate_extract", None),
    ("POST", "/api/admin/sources/probe", {"careers_url": "https://example.org/jobs"}),
    ("POST", f"/api/admin/sources/{SID}/activate", None),
]


class FakeCursor:
    """Answers each fetchone from `rows` in order; raises `fail_on` for SQL containing its key."""

    def __init__(self, rows, fail_on):
        self.rows = list(rows)
        self.fail_on = fail_on
        self.rowcount = 0

    def execute(self, sql, params=None):
        for fragment, error in self.fail_on.items():
            if fragment in sql:
                raise error

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None

    def fetchall(self):
        return []

    def close(self):
        pass


class FakeConnection:
    def __init__(self, rows, fail_on):
        self._cursor = FakeCursor(rows, fail_on)

    def cursor(self, cursor_factory=None):
        return self._cursor

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


def _app(signed_in=True):
    app = FastAPI()
    app.include_router(sources.router)
    if signed_in:
        app.dependency_overrides[sources.admin_required] = lambda: "test-admin"
    return TestClient(app)


@pytest.fixture
def database(monkeypatch):
    """Configure a fake database; call with the rows to return and any SQL to fail."""
    def configure(*rows, fail_on=None):
        monkeypatch.setattr(sources.db_config, "get_connection_params", lambda: {"host": "x"})
        monkeypatch.setattr(psycopg2, "connect",
                            lambda **kwargs: FakeConnection(rows, fail_on or {}))
    return configure


@pytest.mark.parametrize("method, path, body", ROUTES)
def test_every_route_still_requires_a_session(method, path, body):
    response = _app(signed_in=False).request(method, path, json=body)
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}


def test_a_missing_source_is_still_404(database):
    database(None)
    response = _app().get(f"/api/admin/sources/{SID}")
    assert response.status_code == 404 and response.json() == {"detail": "Source not found"}


def test_a_found_source_keeps_its_shape(database):
    row = {"id": SID, "org_name": "Example", "careers_url": "https://example.org/jobs"}
    database(row)
    response = _app().get(f"/api/admin/sources/{SID}")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "data": row, "error": None}


def test_an_update_without_fields_is_still_400(database):
    database()
    response = _app().patch(f"/api/admin/sources/{SID}", json={})
    assert response.status_code == 400 and response.json() == {"detail": "No fields to update"}


def test_an_update_of_a_missing_source_is_still_404(database):
    database(None)
    response = _app().patch(f"/api/admin/sources/{SID}", json={"org_name": "Renamed"})
    assert response.status_code == 404 and response.json() == {"detail": "Source not found"}


def test_creating_an_existing_active_source_is_still_409(database):
    database({"id": SID, "status": "active"})
    response = _app().post("/api/admin/sources", json={"careers_url": "https://example.org/jobs"})
    assert response.status_code == 409
    assert response.json() == {"detail": "Source with this URL already exists"}


def test_a_duplicate_url_on_insert_is_still_409(database):
    database(None, fail_on={"INSERT INTO sources": psycopg2.IntegrityError("duplicate key")})
    response = _app().post("/api/admin/sources", json={"careers_url": "https://example.org/jobs"})
    assert response.status_code == 409
    assert response.json() == {"detail": "Source with this URL already exists"}


def test_permanent_deletion_of_an_active_source_is_still_400(database):
    database({"id": SID, "status": "active"})
    response = _app().delete(f"/api/admin/sources/{SID}/permanent")
    assert response.status_code == 400
    assert response.json()["detail"].startswith("Source must be deleted before permanent deletion")


def test_import_rejects_an_unknown_source_type(database):
    database()
    response = _app().post("/api/admin/sources/import", json={
        "careers_url": "https://example.org/x", "source_type": "xml"})
    assert response.status_code == 400
    assert response.json() == {"detail": "source_type must be html, rss or api"}


def test_a_probe_of_a_refused_address_answers_without_reading_anything():
    # The address is refused before any request or database use (W-40 probe, pull request 1).
    response = _app().post(
        "/api/admin/sources/probe", json={"careers_url": "ftp://example.org/jobs"}
    )
    assert response.status_code == 200
    assert response.json() == {
        "ok": False,
        "error": ADDRESS_REFUSED,
        "error_category": "validation",
    }


def test_presets_routes_are_gone():
    client = _app()
    assert client.get("/api/admin/presets/sources").status_code == 404
    assert client.get("/api/admin/presets/sources/ReliefWeb%20Jobs").status_code == 404
