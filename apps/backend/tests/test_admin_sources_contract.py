"""The sources and presets admin routes keep their contract: authentication, 4xx answers, shapes.

Security stage 3, phase 2 changes only what an unexpected failure says. These checks pass on the
code before and after that change. The database is a fake; nothing touches a network.
"""
import json

import psycopg2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import presets, sources

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
    ("GET", "/api/admin/presets/sources", None),
    ("GET", "/api/admin/presets/sources/ReliefWeb Jobs", None),
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
    app.include_router(presets.router)
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


@pytest.mark.parametrize("payload, detail", [
    # W-53: the same refusal as the create and edit routes, without repeating the value.
    ({"careers_url": "https://example.org/x", "source_type": "xml"},
     "source_type must be html, rss or api"),
    ({"careers_url": "https://example.org/x", "source_type": "api", "parser_hint": "{not json"},
     "Invalid JSON in parser_hint"),
])
def test_import_validation_is_still_400(database, payload, detail):
    database()
    response = _app().post("/api/admin/sources/import", json=payload)
    assert response.status_code == 400 and response.json() == {"detail": detail}


def test_presets_keep_their_shape_and_404():
    client = _app()
    listed = client.get("/api/admin/presets/sources")
    assert listed.status_code == 200
    body = listed.json()
    assert body["status"] == "ok" and body["error"] is None
    assert all(isinstance(p["parser_hint"], str) for p in body["data"])
    json.loads(body["data"][0]["parser_hint"])
    missing = client.get("/api/admin/presets/sources/nope")
    assert missing.status_code == 404 and missing.json() == {"detail": "Preset 'nope' not found"}
