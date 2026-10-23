"""W-22: callers never receive tracebacks or raw stored data, whatever AIDJOBS_ENV says."""
import asyncio
import inspect
import sys
import types

import pytest
from fastapi.testclient import TestClient

# data_quality_logs (imported by main) needs app.db, which is not in this repository.
if "app.db" not in sys.modules:
    _db_stub = types.ModuleType("app.db")
    _db_stub.get_db_conn = lambda: None
    sys.modules["app.db"] = _db_stub

import app.job_management as job_management
import app.search as search
from main import app

SECRET_DETAIL = "detail-that-must-not-leak"


def _boom():
    raise RuntimeError(SECRET_DETAIL)


if not any(getattr(r, "path", None) == "/__w22_boom" for r in app.routes):
    app.add_api_route("/__w22_boom", _boom, methods=["GET"])


@pytest.mark.parametrize("env", ["dev", "production", ""])
def test_unhandled_errors_return_a_generic_message(monkeypatch, env):
    monkeypatch.setenv("AIDJOBS_ENV", env)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/__w22_boom")
    assert response.status_code == 500
    body = response.json()
    assert body == {
        "status": "error",
        "error": "An internal error occurred. Please try again later.",
    }
    assert SECRET_DETAIL not in response.text
    assert "traceback" not in response.text.lower()


def test_admin_diagnostics_never_return_a_traceback():
    assert '"traceback"' not in inspect.getsource(job_management)


class _Cursor:
    def __init__(self, sql_log):
        self.sql_log = sql_log

    def execute(self, sql, params=None):
        self.sql_log.append(sql)

    def fetchone(self):
        return {"id": "job-1", "title": "Officer", "deadline": None, "last_seen_at": None}

    def close(self):
        pass


class _Conn:
    def __init__(self, sql_log):
        self.sql_log = sql_log

    def cursor(self, cursor_factory=None):
        return _Cursor(self.sql_log)

    def close(self):
        pass


@pytest.mark.parametrize("env", ["dev", "production"])
def test_single_job_lookup_never_reads_raw_metadata(monkeypatch, env):
    monkeypatch.setenv("AIDJOBS_ENV", env)
    sql_log: list[str] = []
    monkeypatch.setattr(search.psycopg2, "connect", lambda **kwargs: _Conn(sql_log))
    monkeypatch.setattr(search.db_config, "get_connection_params", lambda: {"host": "test"})
    service = search.SearchService.__new__(search.SearchService)
    service.db_enabled = True
    service.meili_enabled = False
    service.meili_client = None

    result = asyncio.run(service.get_job_by_id("job-1"))

    assert result["data"]["id"] == "job-1"
    assert len(sql_log) == 1
    assert "raw_metadata" not in sql_log[0]


@pytest.mark.parametrize("env", ["dev", "production"])
def test_single_job_from_meilisearch_drops_raw_and_internal_fields(monkeypatch, env):
    monkeypatch.setenv("AIDJOBS_ENV", env)

    class _Index:
        def get_document(self, job_id):
            return {
                "id": job_id,
                "title": "Officer",
                "raw_metadata": {"html": "x"},
                "_rankingScore": 1,
            }

    class _Client:
        def index(self, name):
            return _Index()

    service = search.SearchService.__new__(search.SearchService)
    service.db_enabled = False
    service.meili_enabled = True
    service.meili_client = _Client()
    service.meili_index_name = "jobs_index"

    result = asyncio.run(service.get_job_by_id("job-2"))

    assert result["data"] == {"id": "job-2", "title": "Officer"}
