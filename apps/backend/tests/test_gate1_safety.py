"""Gate 1: destructive and unauthenticated behaviours stay disabled."""
import asyncio
import inspect
import sys
import types
from pathlib import Path

from fastapi.testclient import TestClient
from starlette.requests import Request

# data_quality_logs imports app.db, which is not in this repository.
# The stub lets this test load the module and check its auth dependency.
if "app.db" not in sys.modules:
    _db_stub = types.ModuleType("app.db")
    _db_stub.get_db_conn = lambda: None
    sys.modules["app.db"] = _db_stub

import app.data_quality_logs as data_quality_logs
import security.admin_auth as admin_auth
from app.crawler_admin import get_status, run_deletion_migration
from main import app
from orchestrator import CrawlerOrchestrator
from security.admin_auth import (
    check_admin_configured,
    get_current_admin,
    verify_admin_password,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
FIND_EARN_SOURCE = (BACKEND_ROOT / "app" / "find_earn.py").read_text(encoding="utf-8")


def _request(headers: dict[str, str] | None = None) -> Request:
    raw_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": raw_headers,
            "client": ("127.0.0.1", 123),
            "server": ("test", 80),
        }
    )


def test_cleanup_expired_jobs_does_not_delete():
    source = inspect.getsource(CrawlerOrchestrator.cleanup_expired_jobs)
    scheduler = inspect.getsource(CrawlerOrchestrator.scheduler_loop)
    assert "DELETE FROM" not in source
    assert "cleanup_expired_jobs" not in scheduler

    orchestrator = CrawlerOrchestrator.__new__(CrawlerOrchestrator)
    result = asyncio.run(orchestrator.cleanup_expired_jobs())
    assert result["deleted"] == 0
    assert result["disabled"] is True


def test_dev_mode_without_password_rejects_login(monkeypatch):
    monkeypatch.setenv("AIDJOBS_ENV", "dev")
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    assert verify_admin_password("anything") is False
    assert verify_admin_password("") is False
    assert check_admin_configured() is False


def test_dev_bypass_header_does_not_authenticate(monkeypatch):
    monkeypatch.setenv("AIDJOBS_ENV", "dev")
    monkeypatch.delenv("COOKIE_SECRET", raising=False)
    monkeypatch.delenv("SESSION_SECRET", raising=False)
    assert get_current_admin(_request({"X-Dev-Bypass": "1"})) is None


def test_configured_password_still_matches(monkeypatch):
    monkeypatch.setenv("AIDJOBS_ENV", "production")
    monkeypatch.setenv("ADMIN_PASSWORD", "correct-horse")
    assert verify_admin_password("correct-horse") is True
    assert verify_admin_password("wrong") is False
    assert get_current_admin(_request({"X-Dev-Bypass": "1"})) is None


def test_data_quality_uses_canonical_admin_dependency():
    assert data_quality_logs.admin_required is admin_auth.admin_required


def test_find_earn_submit_does_not_fetch():
    assert "requests.head" not in FIND_EARN_SOURCE
    assert "requests.get" not in FIND_EARN_SOURCE
    assert "import requests" not in FIND_EARN_SOURCE
    assert "detect_jobs_count" not in FIND_EARN_SOURCE


def test_status_and_migration_do_not_change_schema():
    status_source = inspect.getsource(get_status)
    migration_source = inspect.getsource(run_deletion_migration)
    assert "CREATE TABLE" not in status_source
    assert "ALTER TABLE" not in status_source
    assert "CREATE TABLE" not in migration_source
    assert "ALTER TABLE" not in migration_source
    assert "CREATE INDEX" not in migration_source


def test_removed_and_disabled_routes(monkeypatch):
    monkeypatch.setenv("AIDJOBS_ENV", "dev")
    monkeypatch.setenv("COOKIE_SECRET", "gate1-test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "gate1-test-password")

    client = TestClient(app)

    env_response = client.get("/admin/config/env")
    config_response = client.get("/api/admin/config-check")
    assert env_response.status_code == 404
    assert config_response.status_code == 404
    for response in (env_response, config_response):
        body = response.text.lower()
        assert "password_length" not in body
        assert "cookie_secret_length" not in body
        assert "admin_password_length" not in body

    reindex = client.get("/admin/search/reindex")
    assert reindex.status_code == 405

    login = client.post("/api/admin/login", json={"password": "gate1-test-password"})
    assert login.status_code == 200
    migration = client.post("/api/admin/crawl/run-migration")
    assert migration.status_code == 410
