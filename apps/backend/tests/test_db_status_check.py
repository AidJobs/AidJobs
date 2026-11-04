"""Security stage 7: the public database status is a quick yes or no; the detail is admin-only.

Every test goes through the app's routes. The database is a fake connection; nothing touches a
network. The slow and hanging checks are fake connections that wait on an event.
"""
import asyncio
import itertools
import threading
import time

import httpx
import psycopg2
import pytest
from fastapi.testclient import TestClient

import app.db_health as db_health
import main as main_module
from app.db_config import db_config
from app.db_health import DatabaseCheck
from main import app
from tests.signed_in import session_headers

UNAVAILABLE = {"ok": False, "error": "Database unavailable"}
DRIVER_ERROR = (
    'connection to server at "pooler.db.example.internal" (203.0.113.7), port 5432 failed: '
    "FATAL:  (ECIRCUITBREAKER) too many authentication failures"
)
LEAK_MARKERS = ["pooler.db.example.internal", "203.0.113.7", "5432", "FATAL", "ECIRCUITBREAKER"]
BREAKDOWN = [{"source_id": "s-1", "org_name": "Org", "job_count": 4}]
KEEPALIVES = {"keepalives": 1, "keepalives_idle": 5, "keepalives_interval": 2,
              "keepalives_count": 2, "tcp_user_timeout": 5000}


class _Row:
    """A row read both ways: row[0] (the quick check) and row["count"] (the admin's counts)."""

    def __init__(self, value):
        self.value = value

    def __getitem__(self, key):
        return self.value


class _Cursor:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=None):
        self.conn.sql.append(sql)

    def fetchone(self):
        return _Row(next(self.conn.values))

    def fetchall(self):
        return list(BREAKDOWN)

    def close(self):
        pass


class _Conn:
    def __init__(self, values=None):
        self.values = iter(values) if values is not None else itertools.repeat(1)
        self.sql = []

    def cursor(self, cursor_factory=None):
        return _Cursor(self)

    def close(self):
        pass


class _Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture
def clock():
    return _Clock()


@pytest.fixture
def check(monkeypatch, clock):
    """A fresh check with a fake clock, and a database that looks configured."""
    fresh = DatabaseCheck(clock=clock)
    monkeypatch.setattr(main_module, "db_check", fresh, raising=False)
    monkeypatch.setattr(db_config, "supabase_db_url", "postgresql://probe@127.0.0.1:1/postgres")
    monkeypatch.setattr(db_config, "get_connection_params", lambda: {"host": "test"})
    return fresh


def _recording_connect(monkeypatch, conns, delay=0.0, values=None):
    def connect(**kwargs):
        if delay:
            time.sleep(delay)
        conn = _Conn(values)
        conn.kwargs = kwargs
        conns.append(conn)
        return conn

    monkeypatch.setattr(psycopg2, "connect", connect)


async def _healthz_while(path, headers, started, release):
    """Start `path`; once its database call has begun, time /api/healthz from the start."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        began = time.monotonic()
        slow = asyncio.create_task(client.get(path, headers=headers))
        for _ in range(300):
            if started.is_set():
                break
            await asyncio.sleep(0.01)
        health = await client.get("/api/healthz")
        health_after = time.monotonic() - began
        release.set()
        return health, health_after, await slow


def _slow_connect(monkeypatch, started, release, values=None, conns=None):
    def connect(**kwargs):
        started.set()
        release.wait(3)
        conn = _Conn(values)
        conn.kwargs = kwargs
        if conns is not None:
            conns.append(conn)
        return conn

    monkeypatch.setattr(psycopg2, "connect", connect)


def test_the_public_answer_is_exactly_ok(check, monkeypatch):
    conns = []
    _recording_connect(monkeypatch, conns)
    response = TestClient(app).get("/api/db/status")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    for word in ("row_counts", "source_breakdown", "source_id", "org_name", "s-1"):
        assert word not in response.text
    assert conns[0].kwargs["connect_timeout"] == 3
    assert conns[0].sql == ["SET LOCAL statement_timeout = 2000", "SELECT 1"]
    assert {k: conns[0].kwargs.get(k) for k in KEEPALIVES} == KEEPALIVES


def test_the_keepalive_options_are_ones_libpq_accepts():
    dsn = " ".join(f"{name}={value}" for name, value in db_health.KEEPALIVES.items())
    assert psycopg2.extensions.parse_dsn(dsn) == {k: str(v) for k, v in KEEPALIVES.items()}


def test_the_public_answer_is_never_stored(check, monkeypatch, clock):
    _recording_connect(monkeypatch, [])
    client = TestClient(app)
    assert client.get("/api/db/status").headers["cache-control"] == "no-store"

    def refuse(**kwargs):
        raise psycopg2.OperationalError("refused")

    monkeypatch.setattr(psycopg2, "connect", refuse)
    clock.now += 31
    failed = client.get("/api/db/status")
    assert failed.json() == UNAVAILABLE
    assert failed.headers["cache-control"] == "no-store"


def test_a_hung_worker_is_not_joined_by_another(check, monkeypatch, clock, caplog):
    """A check stuck past its limit keeps its thread; later checks fail fast, not pile up."""
    monkeypatch.setattr(db_health, "OVERALL_TIMEOUT_SECONDS", 0.2)
    release = threading.Event()
    calls = []

    def hang():
        calls.append(1)
        release.wait(5)
        return {"ok": True}

    monkeypatch.setattr(db_health, "_select_one", hang)

    async def scenario():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            answers = [await client.get("/api/db/status")]
            for _ in range(3):
                clock.now += 31
                answers.append(await client.get("/api/db/status"))
            release.set()
            return answers

    try:
        with caplog.at_level("ERROR"):
            answers = asyncio.run(scenario())
    finally:
        release.set()
    assert [a.json() for a in answers] == [UNAVAILABLE] * 4
    assert len(calls) == 1
    assert "still running" in caplog.text


def test_healthz_answers_while_a_slow_database_check_runs(check, monkeypatch):
    started, release = threading.Event(), threading.Event()
    _slow_connect(monkeypatch, started, release)
    health, health_after, status = asyncio.run(
        _healthz_while("/api/db/status", {}, started, release))
    assert started.is_set()
    assert health.status_code == 200
    assert health_after < 1.0, f"/api/healthz took {health_after:.2f} s"
    assert status.json() == {"ok": True}


def test_one_check_serves_every_call_for_30_seconds(check, monkeypatch, clock):
    conns = []
    _recording_connect(monkeypatch, conns)
    client = TestClient(app)
    for _ in range(5):
        assert client.get("/api/db/status").json() == {"ok": True}
    assert len(conns) == 1
    clock.now += 29.9
    assert client.get("/api/db/status").json() == {"ok": True}
    assert len(conns) == 1
    clock.now += 0.2
    assert client.get("/api/db/status").json() == {"ok": True}
    assert len(conns) == 2


def test_callers_during_a_check_share_it(check, monkeypatch):
    conns = []
    _recording_connect(monkeypatch, conns, delay=0.3)

    async def many():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await asyncio.gather(*(client.get("/api/db/status") for _ in range(10)))

    answers = asyncio.run(many())
    assert [a.json() for a in answers] == [{"ok": True}] * 10
    assert len(conns) == 1


def test_a_failure_is_kept_too_and_logged_without_its_text(check, monkeypatch, clock, caplog):
    monkeypatch.setenv("AIDJOBS_ENV", "production")
    attempts = []

    def refuse(**kwargs):
        attempts.append(1)
        raise psycopg2.OperationalError(DRIVER_ERROR)

    monkeypatch.setattr(psycopg2, "connect", refuse)
    client = TestClient(app)
    with caplog.at_level("ERROR"):
        for _ in range(3):
            response = client.get("/api/db/status")
            assert response.status_code == 200
            assert response.json() == UNAVAILABLE
            for marker in LEAK_MARKERS:
                assert marker not in response.text
    assert len(attempts) == 1
    assert "Database check failed: OperationalError" in caplog.text
    for marker in LEAK_MARKERS:
        assert marker not in caplog.text
    clock.now += 30
    assert client.get("/api/db/status").json() == UNAVAILABLE
    assert len(attempts) == 2


def test_a_hanging_check_answers_the_failure_within_the_limit(check, monkeypatch, caplog):
    assert db_health.OVERALL_TIMEOUT_SECONDS == 5.0
    monkeypatch.setattr(db_health, "OVERALL_TIMEOUT_SECONDS", 0.3)
    started, release = threading.Event(), threading.Event()
    _slow_connect(monkeypatch, started, release)

    # Timed inside one event loop: TestClient's own loop would wait for the worker thread on exit.
    async def timed():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            began = time.monotonic()
            answer = await client.get("/api/db/status")
            took = time.monotonic() - began
            release.set()
            return answer, took

    with caplog.at_level("ERROR"):
        response, took = asyncio.run(timed())
    assert response.status_code == 200
    assert response.json() == UNAVAILABLE
    assert took < 1.5, f"the hanging check took {took:.2f} s"
    assert "Database check timed out" in caplog.text


def _admin_service():
    import app.search as search

    service = search.SearchService.__new__(search.SearchService)
    service.db_enabled = True
    service.meili_enabled = False
    service.meili_client = None
    return service


def test_the_admin_detail_needs_a_session_and_does_not_stall_the_server(check, monkeypatch):
    monkeypatch.setattr(main_module, "search_service", _admin_service())
    started, release = threading.Event(), threading.Event()
    conns = []
    _slow_connect(monkeypatch, started, release, values=[7, 4, 2], conns=conns)

    refused = TestClient(app).get("/api/admin/db/status")
    assert refused.status_code == 401
    assert refused.json() == {"detail": "Authentication required"}
    assert not started.is_set()

    health, health_after, detail = asyncio.run(
        _healthz_while("/api/admin/db/status", session_headers(monkeypatch), started, release))
    assert health.status_code == 200
    assert health_after < 1.0, f"/api/healthz took {health_after:.2f} s"
    assert detail.status_code == 200
    assert detail.json() == {
        "ok": True,
        "row_counts": {"jobs": 7, "active_jobs": 4, "sources": 2},
        "source_breakdown": BREAKDOWN,
    }
    (conn,) = conns
    assert conn.kwargs["connect_timeout"] == 5
    assert {k: conn.kwargs.get(k) for k in KEEPALIVES} == KEEPALIVES
    assert conn.sql[0] == "SET LOCAL statement_timeout = 10000"
    assert len(conn.sql) == 5
