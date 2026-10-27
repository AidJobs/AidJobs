"""Gate 5 crawl-run control flow.

These tests show which branch the code takes. They do not prove PostgreSQL
concurrency or isolation; tests/test_crawl_ownership.py does that against PostgreSQL.
"""
import asyncio
import inspect
from datetime import datetime, timezone

import pytest

import orchestrator as orchestrator_module
from app.crawler_admin import run_due, run_source
from orchestrator import (
    GLOBAL_MAX_CONCURRENCY,
    MAX_SOURCES_PER_RUN,
    CrawlerOrchestrator,
    crawl_time_settings,
)

LOCKED_AT = datetime(2026, 10, 27, 9, 0, tzinfo=timezone.utc)


class LockStore:
    def __init__(self):
        self.lock_held = False
        self.lock_expired = False
        self.running_id = None
        self.due = True
        self.commits = 0
        self.rollbacks = 0


class FlowCursor:
    """Records statements and answers the acquire and lock-read queries from the store."""

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
        self._row = None
        if upper.startswith("SET "):
            return
        if "INSERT INTO CRAWL_LOCKS" in upper:
            if not self.store.lock_held:
                self.store.lock_held = True
                self._row = ("src-1",)
            return
        if "SELECT STATUS = 'ACTIVE'" in upper:
            self._row = (self.store.due,)
            return
        if "INSERT INTO CRAWL_LOGS" in upper:
            self.store.running_id = "run-1"
            self._row = ("run-1",)
            return
        if "FROM CRAWL_LOCKS L" in upper and self.store.lock_held:
            self._row = (LOCKED_AT, self.store.lock_expired, self.store.running_id)

    def fetchone(self):
        return self._row

    def fetchall(self):
        return []


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


def _source_row(status="active", failures=0, nochange=0, last_status="ok"):
    """sources columns read by the finish: status, frequency, org type, counters, last status."""
    return (status, 3, "ngo", failures, nochange, last_status)


class RecordingCursor:
    def __init__(self, source_row=None, owns_run=True):
        self.statements = []
        self.source_row = source_row if source_row is not None else _source_row()
        self.owns_run = owns_run
        self._row = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=None):
        compact = " ".join(sql.split())
        self.statements.append((compact, params))
        self._row = None
        if compact.startswith("UPDATE crawl_logs") and self.owns_run:
            self._row = (params[-1],)
        elif "FROM sources WHERE id = %s FOR NO KEY UPDATE" in compact:
            self._row = self.source_row

    def fetchone(self):
        return self._row


class RecordingConn:
    def __init__(self, cursor):
        self.cursor_obj = cursor
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

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
    orch.health_score = lambda source_id: None
    return orch


def _run_statements(statements):
    return [sql for sql in statements if not sql.upper().startswith("SET ")]


def test_first_begin_inserts_lock_then_running_row():
    store = LockStore()
    statements = []
    orch = _orchestrator(store, statements)
    run_id, started = asyncio.run(orch.begin_run(_source()))
    assert (run_id, started) == ("run-1", True)
    assert store.commits == 1
    assert store.rollbacks == 0
    steps = _run_statements(statements)
    assert "INSERT INTO crawl_locks" in steps[0]
    assert "ON CONFLICT (source_id) DO NOTHING RETURNING" in steps[0]
    assert "INSERT INTO crawl_logs" in steps[1]
    assert "running" in steps[1]
    assert len(steps) == 2


def test_every_run_step_sets_its_timeouts_first():
    store = LockStore()
    statements = []
    orch = _orchestrator(store, statements)
    asyncio.run(orch.begin_run(_source()))
    assert statements[0].startswith("SET LOCAL statement_timeout = '30s'")
    assert "idle_in_transaction_session_timeout = '60s'" in statements[0]


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
    assert store.rollbacks >= 1
    assert any("FROM crawl_locks l WHERE l.source_id" in sql for sql in statements)


def test_live_lock_without_a_running_row_does_not_start():
    store = LockStore()
    store.lock_held = True
    statements = []
    orch = _orchestrator(store, statements)
    taken_over = []
    orch._take_over = lambda source_id, health: taken_over.append(source_id) or True
    run_id, started = asyncio.run(orch.begin_run(_source()))
    assert (run_id, started) == (None, False)
    assert store.commits == 0
    assert taken_over == []
    assert not any("INSERT INTO crawl_logs" in sql for sql in statements)


def test_expired_lock_without_a_running_row_is_taken_over_and_starts():
    """Approved Gate 5 change: a held lock with no running run starts again after its lifetime."""
    store = LockStore()
    store.lock_held = True
    store.lock_expired = True
    statements = []
    orch = _orchestrator(store, statements)
    taken_over = []

    def take_over(source_id, health):
        taken_over.append(source_id)
        store.lock_held = False
        store.lock_expired = False
        return True

    orch._take_over = take_over
    run_id, started = asyncio.run(orch.begin_run(_source()))
    assert (run_id, started) == ("run-1", True)
    assert taken_over == ["src-1"]


def test_scheduled_begin_skips_a_source_no_longer_due():
    store = LockStore()
    store.due = False
    statements = []
    orch = _orchestrator(store, statements)
    run_id, started = asyncio.run(orch.begin_run(_source(), scheduled=True))
    assert (run_id, started) == (None, False)
    assert store.commits == 0
    assert not any("INSERT INTO crawl_logs" in sql for sql in statements)


def test_manual_start_schedules_one_crawl_and_the_duplicate_does_not():
    store = LockStore()
    statements = []

    async def scenario():
        orch = _orchestrator(store, statements)
        scheduled = []

        async def execute(source, run_id, **kwargs):
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


def test_execute_run_finishes_through_the_owner_when_the_crawl_raises():
    async def scenario():
        orch = CrawlerOrchestrator("postgresql://example")
        seen = []

        async def crawl(source, run):
            seen.append(("crawl", run.token))
            raise RuntimeError("boom")

        async def finish(source, run_id, result, *, mode="normal"):
            seen.append(("finish", run_id, result["status"], mode))

        orch.crawl_source = crawl
        orch.finish_run = finish
        await orch.execute_run(_source(), "run-1")
        return seen

    assert asyncio.run(scenario()) == [
        ("crawl", "run-1"),
        ("finish", "run-1", "fail", "normal"),
    ]
    assert not hasattr(CrawlerOrchestrator, "release_lock")


def test_when_finishing_fails_only_the_owner_releases_the_lock():
    """Approved Gate 5 change: no separate release; the lock waits for its lifetime and recovery."""

    async def scenario():
        orch = CrawlerOrchestrator("postgresql://example")
        seen = []

        def no_database():
            raise AssertionError("nothing may touch the database after a failed finish")

        async def crawl(source, run):
            return {
                "status": "ok",
                "message": "Found 1 jobs",
                "counts": {"found": 1, "inserted": 1, "updated": 0, "skipped": 0},
                "duration_ms": 5,
            }

        async def finish(source, run_id, result, *, mode="normal"):
            seen.append("finish")
            raise RuntimeError("db down")

        orch._get_db_conn = no_database
        orch.crawl_source = crawl
        orch.finish_run = finish
        await orch.execute_run(_source(), "run-1")
        return seen

    assert asyncio.run(scenario()) == ["finish"]


def test_finish_run_retries_once_then_gives_up():
    orch = CrawlerOrchestrator("postgresql://example")
    orch.health_score = lambda source_id: None
    calls = []

    def flaky(source_id, run_id, result, *, mode, health):
        calls.append(run_id)
        if len(calls) == 1:
            raise RuntimeError("lock timeout")
        return True

    orch._finish = flaky
    assert asyncio.run(orch.finish_run(_source(), "run-1", {"status": "ok"})) is True
    assert calls == ["run-1", "run-1"]

    def broken(source_id, run_id, result, *, mode, health):
        calls.append(run_id)
        raise RuntimeError("db down")

    calls.clear()
    orch._finish = broken
    with pytest.raises(RuntimeError, match="db down"):
        asyncio.run(orch.finish_run(_source(), "run-1", {"status": "ok"}))
    assert len(calls) == 2


def _finish(status, *, source_row=None, counts=None, mode="normal", owns_run=True):
    cursor = RecordingCursor(source_row=source_row, owns_run=owns_run)
    conn = RecordingConn(cursor)
    orch = CrawlerOrchestrator("postgresql://example")
    orch._get_db_conn = lambda: conn
    orch.health_score = lambda source_id: None
    orch.compute_next_run = lambda *args, **kwargs: datetime(2026, 10, 6)
    result = {
        "status": status,
        "message": "nope",
        "counts": counts or {"found": 0, "inserted": 0, "updated": 0, "skipped": 0},
        "duration_ms": 4,
    }
    finished = asyncio.run(orch.finish_run(_source(), "run-9", result, mode=mode))
    return finished, cursor.statements, conn


def _source_update(statements):
    return next(item for item in statements if item[0].startswith("UPDATE sources"))


def _log_update(statements):
    return next(item for item in statements if item[0].startswith("UPDATE crawl_logs"))


def test_finish_run_updates_the_same_row_and_keeps_ok():
    finished, statements, conn = _finish(
        "ok", counts={"found": 1, "inserted": 1, "updated": 0, "skipped": 0}
    )
    assert finished is True
    assert conn.commits == 1
    sql_text = "\n".join(sql for sql, _params in statements)
    assert "INSERT INTO crawl_logs" not in sql_text
    assert "DELETE FROM jobs" not in sql_text
    assert "jobs_side" not in sql_text
    assert "deleted_at" not in sql_text.lower()
    log_sql, log_params = _log_update(statements)
    assert "WHERE id = %s AND status = 'running' RETURNING id" in log_sql
    assert log_params[5] == "ok"
    assert log_params[7] == "run-9"
    assert "canonical_hash" not in log_sql
    order = [
        next(i for i, (sql, _p) in enumerate(statements) if sql.startswith(prefix))
        for prefix in (
            "UPDATE crawl_logs",
            "DELETE FROM crawl_locks",
            "SELECT status, crawl_frequency_days",
            "UPDATE sources",
        )
    ]
    assert order == sorted(order)


def test_a_finish_that_no_longer_owns_its_run_writes_nothing():
    finished, statements, conn = _finish("ok", owns_run=False)
    assert finished is False
    assert conn.commits == 0
    assert conn.rollbacks == 1
    sql_text = "\n".join(sql for sql, _params in statements)
    assert "DELETE FROM crawl_locks" not in sql_text
    assert "sources" not in sql_text


def test_failed_and_fail_both_increment_failures():
    for status in ("failed", "fail"):
        _finished, statements, _conn = _finish(status)
        _sql, params = _source_update(statements)
        assert params[2] == 1


def test_ok_and_warn_clear_consecutive_failures():
    for status in ("ok", "warn"):
        _finished, statements, _conn = _finish(status, source_row=_source_row(failures=2))
        _sql, params = _source_update(statements)
        assert params[2] == 0


def test_failed_resets_consecutive_nochange_and_keeps_status_string():
    _finished, statements, _conn = _finish("failed", source_row=_source_row(nochange=3))
    _sql, params = _source_update(statements)
    _log_sql, log_params = _log_update(statements)
    assert params[0] == "failed"
    assert params[3] == 0
    assert log_params[5] == "failed"


def test_fifth_failure_pauses_when_status_is_failed():
    _finished, statements, _conn = _finish("failed", source_row=_source_row(failures=4))
    _sql, params = _source_update(statements)
    _log_sql, log_params = _log_update(statements)
    assert params[2] == 5
    assert params[5] == "paused"
    assert log_params[5] == "failed"


def test_the_finish_reads_the_fresh_source_row_not_the_callers_copy():
    _finished, statements, _conn = _finish("fail", source_row=_source_row(failures=3))
    _sql, params = _source_update(statements)
    assert params[2] == 4


@pytest.mark.parametrize("status", ["paused", "deleted", "pending_validation"])
@pytest.mark.parametrize("outcome", ["ok", "fail"])
def test_only_active_becomes_paused_and_no_other_status_changes(status, outcome):
    _finished, statements, _conn = _finish(outcome, source_row=_source_row(status, failures=4))
    _sql, params = _source_update(statements)
    assert params[5] == status


def test_a_first_interruption_is_recorded_but_not_counted():
    _finished, statements, _conn = _finish(
        "interrupted", mode="interrupted", source_row=_source_row(failures=2, last_status="ok")
    )
    sql, params = _source_update(statements)
    assert params == ("interrupted", "nope", "src-1")
    assert "consecutive_failures" not in sql
    assert "next_run_at" not in sql


def test_a_second_interruption_in_a_row_is_counted():
    _finished, statements, _conn = _finish(
        "interrupted",
        mode="interrupted",
        source_row=_source_row(failures=2, last_status="interrupted"),
    )
    _sql, params = _source_update(statements)
    assert params[0] == "interrupted"
    assert params[2] == 3


def test_a_manual_run_without_a_slot_writes_nothing_to_the_source():
    finished, statements, _conn = _finish("interrupted", mode="no_slot")
    assert finished is True
    sql_text = "\n".join(sql for sql, _params in statements)
    assert "DELETE FROM crawl_locks" in sql_text
    assert "sources" not in sql_text


@pytest.mark.parametrize(
    ("limit", "lifetime", "accepted"),
    [("15", "25", True), ("15", "21", False), ("15", "21.5", True), ("0", "25", False)],
)
def test_the_lock_lifetime_must_exceed_the_limit_plus_six_minutes(
    monkeypatch, limit, lifetime, accepted
):
    monkeypatch.setenv("CRAWL_TIME_LIMIT_MINUTES", limit)
    monkeypatch.setenv("CRAWL_LOCK_TTL_MINUTES", lifetime)
    if accepted:
        crawl_time_settings()
    else:
        with pytest.raises(ValueError):
            crawl_time_settings()


def test_run_due_returns_at_once_and_does_not_queue_a_source_twice():
    async def scenario():
        orch = CrawlerOrchestrator("postgresql://example")
        started = []
        release = asyncio.Event()

        async def due(limit=MAX_SOURCES_PER_RUN):
            return [{"id": "a"}, {"id": "b"}]

        async def run(source):
            started.append(source["id"])
            await release.wait()

        orch.get_due_sources = due
        orch.run_source_with_lock = run
        first = await asyncio.wait_for(orch.run_due_sources_once(wait=False), timeout=1)
        second = await asyncio.wait_for(orch.run_due_sources_once(wait=False), timeout=1)
        await asyncio.sleep(0)
        release.set()
        await asyncio.gather(*list(orch._tasks))
        third = await orch.run_due_sources_once(wait=False)
        release.set()
        await asyncio.gather(*list(orch._tasks))
        return first, second, third, started

    first, second, third, started = asyncio.run(scenario())
    assert first == {"queued": 2}
    assert second == {"queued": 0}
    assert third == {"queued": 2}
    assert started == ["a", "b", "a", "b"]


def test_scheduler_uses_the_shared_runner_and_caps_stay():
    due = inspect.getsource(CrawlerOrchestrator.run_due_sources_once)
    loop = inspect.getsource(CrawlerOrchestrator.scheduler_loop)
    locked = inspect.getsource(CrawlerOrchestrator.run_source_with_lock)
    assert "run_source_with_lock" in due
    assert "run_due_sources_once" in loop
    owned = inspect.getsource(CrawlerOrchestrator._begin_owned)
    assert "_begin_owned" in locked
    assert "self.begin_run" in owned
    assert "execute_run" in locked
    assert locked.index("self.semaphore") < locked.index("_begin_owned")
    assert GLOBAL_MAX_CONCURRENCY == 3
    assert MAX_SOURCES_PER_RUN == 20
    assert orchestrator_module.SCHEDULER_INTERVAL_SECONDS == 300


def test_manual_route_returns_without_awaiting_the_locked_runner():
    text = inspect.getsource(run_source)
    assert "start_manual_run" in text
    assert "run_source_with_lock" not in text
    admin = inspect.getsource(inspect.getmodule(run_source))
    assert "get_orchestrator" in admin
    assert "SimpleOrchestrator" not in admin
    assert "run_due_sources_once(wait=False)" in inspect.getsource(run_due)
