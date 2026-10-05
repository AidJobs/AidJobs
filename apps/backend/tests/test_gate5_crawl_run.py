"""Gate 5 crawl-run control flow.

These tests show which branch the code takes. They do not prove PostgreSQL
concurrency or isolation.
"""
import asyncio
import inspect
from datetime import datetime

import psycopg2
import pytest

from app.crawler_admin import run_source
from orchestrator import (
    GLOBAL_MAX_CONCURRENCY,
    MAX_SOURCES_PER_RUN,
    CrawlerOrchestrator,
)


class LockStore:
    def __init__(self):
        self.lock_held = False
        self.running_id = None
        self.commits = 0
        self.rollbacks = 0


class FlowCursor:
    """Records statements. The second lock insert raises IntegrityError."""

    def __init__(self, store: LockStore, statements: list):
        self.store = store
        self.statements = statements
        self._row = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=None):
        compact = " ".join(sql.split())
        self.statements.append(compact)
        upper = compact.upper()
        if "INSERT INTO CRAWL_LOCKS" in upper:
            if self.store.lock_held:
                raise psycopg2.IntegrityError("duplicate key")
            self.store.lock_held = True
            self._row = None
            return
        if "INSERT INTO CRAWL_LOGS" in upper:
            self.store.running_id = "run-1"
            self._row = ("run-1",)
            return
        if upper.startswith("SELECT"):
            if self.store.running_id is None:
                self._row = None
            else:
                self._row = (self.store.running_id,)
            return
        self._row = None

    def fetchone(self):
        return self._row


class FlowConn:
    def __init__(self, store: LockStore, statements: list):
        self.store = store
        self.statements = statements

    def cursor(self):
        return FlowCursor(self.store, self.statements)

    def commit(self):
        self.store.commits += 1

    def rollback(self):
        self.store.rollbacks += 1

    def close(self):
        return None


class RecordingCursor:
    def __init__(self):
        self.statements = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=None):
        self.statements.append((" ".join(sql.split()), params))


class RecordingConn:
    def __init__(self, cursor):
        self.cursor_obj = cursor

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        return None


def _source():
    return {
        "id": "src-1",
        "org_name": "Example",
        "crawl_frequency_days": 3,
        "org_type": "ngo",
        "consecutive_failures": 0,
        "consecutive_nochange": 0,
        "status": "active",
    }


def _orchestrator(store, statements):
    orch = CrawlerOrchestrator("postgresql://example")

    def connect():
        return FlowConn(store, statements)

    orch._get_db_conn = connect
    return orch


def test_first_begin_inserts_lock_then_running_row():
    store = LockStore()
    statements = []
    orch = _orchestrator(store, statements)
    run_id, started = asyncio.run(orch.begin_run(_source()))
    assert (run_id, started) == ("run-1", True)
    assert store.commits == 1
    assert store.rollbacks == 0
    assert "INSERT INTO crawl_locks" in statements[0]
    assert "INSERT INTO crawl_logs" in statements[1]
    assert not statements[0].upper().startswith("SELECT")
    assert "running" in statements[1]


def test_second_begin_returns_the_open_id_and_does_not_insert_another_run():
    store = LockStore()
    statements = []
    orch = _orchestrator(store, statements)
    first_id, first_started = asyncio.run(orch.begin_run(_source()))
    second_id, second_started = asyncio.run(orch.begin_run(_source()))
    log_inserts = [sql for sql in statements if "INSERT INTO crawl_logs" in sql]
    assert first_started is True
    assert second_started is False
    assert first_id == second_id == "run-1"
    assert len(log_inserts) == 1
    assert store.commits == 1
    assert store.rollbacks == 1
    assert any(sql.upper().startswith("SELECT ID FROM CRAWL_LOGS") for sql in statements)


def test_stale_lock_without_a_running_row_does_not_start():
    store = LockStore()
    store.lock_held = True
    statements = []
    orch = _orchestrator(store, statements)
    run_id, started = asyncio.run(orch.begin_run(_source()))
    assert (run_id, started) == (None, False)
    assert store.commits == 0
    assert not any("INSERT INTO crawl_logs" in sql for sql in statements)


def test_manual_start_schedules_one_crawl_and_the_duplicate_does_not():
    store = LockStore()
    statements = []

    async def scenario():
        orch = _orchestrator(store, statements)
        scheduled = []

        async def execute(source, run_id):
            scheduled.append(run_id)
            await asyncio.Event().wait()

        orch.execute_run = execute
        first_id, first_started = await orch.start_manual_run(_source())
        await asyncio.sleep(0)
        second_id, second_started = await orch.start_manual_run(_source())
        await asyncio.sleep(0)
        current = asyncio.current_task()
        for task in asyncio.all_tasks():
            if task is not current:
                task.cancel()
        await asyncio.sleep(0)
        return first_id, first_started, second_id, second_started, scheduled

    first_id, first_started, second_id, second_started, scheduled = asyncio.run(scenario())
    assert first_started is True
    assert second_started is False
    assert first_id == second_id == "run-1"
    assert scheduled == ["run-1"]


def test_execute_run_finishes_and_releases_when_the_crawl_raises():
    async def scenario():
        orch = CrawlerOrchestrator("postgresql://example")
        seen = []

        async def crawl(source):
            raise RuntimeError("boom")

        async def finish(source, run_id, result):
            seen.append(("finish", run_id, result["status"]))

        async def release(source_id):
            seen.append(("release", source_id))

        orch.crawl_source = crawl
        orch.finish_run = finish
        orch.release_lock = release
        await orch.execute_run(_source(), "run-1")
        return seen

    assert asyncio.run(scenario()) == [
        ("finish", "run-1", "fail"),
        ("release", "src-1"),
    ]


def test_execute_run_releases_the_lock_when_finish_raises():
    async def scenario():
        orch = CrawlerOrchestrator("postgresql://example")
        seen = []

        async def crawl(source):
            return {
                "status": "ok",
                "message": "Found 1 jobs",
                "counts": {"found": 1, "inserted": 1, "updated": 0, "skipped": 0},
                "duration_ms": 5,
            }

        async def finish(source, run_id, result):
            seen.append("finish")
            raise RuntimeError("db down")

        async def release(source_id):
            seen.append("release")

        orch.crawl_source = crawl
        orch.finish_run = finish
        orch.release_lock = release
        with pytest.raises(RuntimeError, match="db down"):
            await orch.execute_run(_source(), "run-1")
        return seen

    assert asyncio.run(scenario()) == ["finish", "release"]


def test_finish_run_updates_the_same_row_and_keeps_ok():
    cursor = RecordingCursor()
    orch = CrawlerOrchestrator("postgresql://example")
    orch._get_db_conn = lambda: RecordingConn(cursor)
    orch.compute_next_run = lambda *args, **kwargs: datetime(2026, 10, 6)
    result = {
        "status": "ok",
        "message": "Found 1 jobs",
        "counts": {"found": 1, "inserted": 1, "updated": 0, "skipped": 0},
        "duration_ms": 10,
    }
    asyncio.run(orch.finish_run(_source(), "run-1", result))
    sql_text = "\n".join(sql for sql, _params in cursor.statements)
    assert "UPDATE crawl_logs" in sql_text
    assert "INSERT INTO crawl_logs" not in sql_text
    assert "DELETE FROM jobs" not in sql_text
    assert "jobs_side" not in sql_text
    assert "deleted_at" not in sql_text.lower()
    log_sql, log_params = next(
        item for item in cursor.statements if "UPDATE crawl_logs" in item[0]
    )
    assert "ok" == log_params[5]
    assert log_params[7] == "run-1"
    assert "canonical_hash" not in log_sql


def test_crawler_failed_does_not_increment_failures_but_fail_does():
    def failures_for(status):
        cursor = RecordingCursor()
        orch = CrawlerOrchestrator("postgresql://example")
        orch._get_db_conn = lambda: RecordingConn(cursor)
        orch.compute_next_run = lambda *args, **kwargs: datetime(2026, 10, 6)
        result = {
            "status": status,
            "message": "nope",
            "counts": {"found": 0, "inserted": 0, "updated": 0, "skipped": 0},
            "duration_ms": 4,
        }
        asyncio.run(orch.finish_run(_source(), "run-9", result))
        _sql, params = next(
            item for item in cursor.statements if item[0].startswith("UPDATE sources")
        )
        return params[2]

    assert failures_for("failed") == 0
    assert failures_for("fail") == 1


def test_scheduler_uses_the_shared_runner_and_caps_stay():
    due = inspect.getsource(CrawlerOrchestrator.run_due_sources_once)
    loop = inspect.getsource(CrawlerOrchestrator.scheduler_loop)
    locked = inspect.getsource(CrawlerOrchestrator.run_source_with_lock)
    assert "run_source_with_lock" in due
    assert "run_due_sources_once" in loop
    assert "begin_run" in locked
    assert "execute_run" in locked
    assert GLOBAL_MAX_CONCURRENCY == 3
    assert MAX_SOURCES_PER_RUN == 20


def test_manual_route_returns_without_awaiting_the_locked_runner():
    text = inspect.getsource(run_source)
    assert "start_manual_run" in text
    assert "run_source_with_lock" not in text
    admin = inspect.getsource(inspect.getmodule(run_source))
    assert "get_orchestrator" in admin
    assert "SimpleOrchestrator" not in admin
