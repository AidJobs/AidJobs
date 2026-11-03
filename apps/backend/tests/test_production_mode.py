"""W-22: callers never receive tracebacks or raw stored data, whatever AIDJOBS_ENV says."""
import asyncio
import inspect

import pytest
from fastapi.testclient import TestClient

import app.job_management as job_management
import app.search as search
import main as main_module
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


DRIVER_ERROR = (
    'connection to server at "pooler.db.example.internal" (203.0.113.7), port 5432 failed: '
    "FATAL:  (ECIRCUITBREAKER) too many authentication failures"
)
LEAK_MARKERS = ["pooler.db.example.internal", "203.0.113.7", "5432", "FATAL", "ECIRCUITBREAKER"]


def _db_service():
    service = search.SearchService.__new__(search.SearchService)
    service.db_enabled = True
    service.meili_enabled = False
    service.meili_client = None
    return service


def _failing_connect(message):
    def connect(**kwargs):
        raise search.psycopg2.OperationalError(message)

    return connect


@pytest.mark.parametrize("env", ["dev", "production"])
def test_public_db_status_hides_driver_errors(monkeypatch, env):
    monkeypatch.setenv("AIDJOBS_ENV", env)
    monkeypatch.setattr(search.db_config, "get_connection_params", lambda: {"host": "test"})
    monkeypatch.setattr(search.psycopg2, "connect", _failing_connect(DRIVER_ERROR))
    monkeypatch.setattr(main_module, "search_service", _db_service())

    response = TestClient(app).get("/api/db/status")

    assert response.status_code == 200
    assert response.json() == {"ok": False, "error": "Database unavailable"}
    for marker in LEAK_MARKERS:
        assert marker not in response.text


def test_db_status_log_masks_connection_strings(monkeypatch, caplog):
    fake_password = "fake" + "-test-value"
    address = "postgresql" + "://user:" + fake_password + "@db.example.internal:5432/postgres"
    monkeypatch.setattr(search.db_config, "get_connection_params", lambda: {"host": "test"})
    monkeypatch.setattr(
        search.psycopg2,
        "connect",
        _failing_connect(f'invalid dsn: "{address}" password={fake_password}'),
    )

    with caplog.at_level("ERROR", logger=search.logger.name):
        result = asyncio.run(_db_service().get_db_status())

    assert result == {"ok": False, "error": "Database unavailable"}
    assert "Database status check failed: OperationalError" in caplog.text
    assert fake_password not in caplog.text
    assert "<redacted-url>" in caplog.text


class _StatusCursor:
    def __init__(self):
        self.counts = iter([{"count": 7}, {"count": 4}, {"count": 2}])

    def execute(self, sql, params=None):
        pass

    def fetchone(self):
        return next(self.counts)

    def fetchall(self):
        return [{"source_id": "s-1", "org_name": "Org", "job_count": 4}]

    def close(self):
        pass


class _StatusConn:
    def cursor(self, cursor_factory=None):
        return _StatusCursor()

    def close(self):
        pass


def test_db_status_success_is_unchanged(monkeypatch):
    monkeypatch.setattr(search.db_config, "get_connection_params", lambda: {"host": "test"})
    monkeypatch.setattr(search.psycopg2, "connect", lambda **kwargs: _StatusConn())

    result = asyncio.run(_db_service().get_db_status())

    assert result == {
        "ok": True,
        "row_counts": {"jobs": 7, "active_jobs": 4, "sources": 2},
        "source_breakdown": [{"source_id": "s-1", "org_name": "Org", "job_count": 4}],
    }


def _meili_service(**attrs):
    service = search.SearchService.__new__(search.SearchService)
    service.meili_index_name = "jobs_index"
    service.last_reindexed_at = None
    for name, value in attrs.items():
        setattr(service, name, value)
    return service


def test_search_status_keeps_not_configured_and_hides_meilisearch_errors(monkeypatch):
    not_configured = _meili_service(meili_enabled=False, meili_client=None, meili_error=None)
    assert asyncio.run(not_configured.get_search_status()) == {
        "enabled": False,
        "error": "Meilisearch not configured",
    }

    failed_init = _meili_service(
        meili_enabled=False,
        meili_client=None,
        meili_error=f"Connection refused: http://10.0.0.5:7700 {SECRET_DETAIL}",
    )
    monkeypatch.setattr(main_module, "search_service", failed_init)
    response = TestClient(app).get("/api/search/status")
    assert response.json() == {"enabled": False, "error": "Meilisearch unavailable"}
    assert SECRET_DETAIL not in response.text
    assert "10.0.0.5" not in response.text

    class _BrokenIndex:
        def get_stats(self):
            raise RuntimeError(SECRET_DETAIL)

    class _BrokenClient:
        def index(self, name):
            return _BrokenIndex()

    unreachable = _meili_service(meili_enabled=True, meili_client=_BrokenClient(), meili_error=None)
    unreachable._init_meilisearch = lambda: None
    result = asyncio.run(unreachable.get_search_status())
    assert result == {"enabled": False, "error": "Meilisearch unavailable"}


def test_search_parse_and_autocomplete_hide_exception_text(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError(SECRET_DETAIL)

    monkeypatch.setattr(main_module, "parse_query", boom)
    monkeypatch.setattr(main_module, "get_suggestions", boom)
    client = TestClient(app)

    parsed = client.post("/api/search/parse", json={"query": "officer"})
    assert parsed.json() == {"status": "error", "data": None, "error": "Failed to parse query"}
    assert SECRET_DETAIL not in parsed.text

    suggested = client.get("/api/search/autocomplete", params={"q": "offi"})
    assert suggested.json() == {"status": "error", "data": [], "error": "Failed to get suggestions"}
    assert SECRET_DETAIL not in suggested.text
