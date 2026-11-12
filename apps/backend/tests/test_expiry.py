"""Expiry (W-06, growth plan, step 4.6, pull request 3): the rules' SQL, the writer's return on
sight, the run's returned jobs, the daily pass and the read-only preview. No database; the
database tests are in test_crawl_ownership.py."""
import asyncio
import importlib.util
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

import contracts.expiry as expiry
from contracts.identity import algorithm_a
from contracts.persist import LOAD_COLUMNS, observation_link, observe_known, persist_candidate
from crawler_v2.run_handle import RunHandle
from orchestrator import CrawlerOrchestrator

PREVIEW_PATH = Path(__file__).resolve().parents[1] / "scripts" / "expiry_preview.py"
_spec = importlib.util.spec_from_file_location("expiry_preview", PREVIEW_PATH)
expiry_preview = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(expiry_preview)

TITLE = "Programme Officer"
URL = "https://example.org/jobs/1"
WHEN = datetime(2026, 11, 12, 9, tzinfo=timezone.utc)
RETURN_SQL = " ".join(expiry.RETURN_ON_SIGHT_SQL.split())


class Cursor:
    """Returns the stored rows for the writer's read; the return statement returns a row when
    `returns` is set, as the database does when the job came back."""

    def __init__(self, rows=(), returns=False):
        self.rows = list(rows)
        self.returns = returns
        self.statements = []
        self.rowcount = -1
        self._last = ""

    def execute(self, sql, params=None):
        self._last = " ".join(sql.split())
        self.statements.append((self._last, params))

    def fetchall(self):
        return list(self.rows) if self._last.startswith("SELECT") else []

    def fetchone(self):
        if self._last == RETURN_SQL and self.returns:
            return (self.statements[-1][1]["id"],)
        return None


def _stored(**overrides):
    row = {name: None for name in LOAD_COLUMNS}
    row.update({
        "id": "row-1", "canonical_hash": algorithm_a(TITLE, URL), "title": TITLE,
        "apply_url": URL, "status": "active", "deleted_at": None, "source_id": "src-1",
    })
    row.update(overrides)
    return row


def _persist(stored, *, returns=False, **candidate):
    cursor, returned = Cursor([stored], returns=returns), []
    outcome = persist_candidate(
        cursor, {"title": TITLE, "apply_url": URL, "admitted": True, **candidate},
        observed_at=WHEN, heuristics=False, source_id="src-1", returned=returned,
    )
    return outcome, cursor.statements, returned


# --- The rules' text --------------------------------------------------------------------------


def test_the_absence_rule_needs_two_counting_runs_a_day_apart_of_open_jobs_not_hidden():
    rule = " ".join(expiry.ABSENCE_WHERE.split())
    for part in (
        "j.source_id = %(source_id)s",
        "j.status = 'active'",
        "j.deleted_at IS NULL",
        "(j.deadline IS NULL OR j.deadline >= CURRENT_DATE)",
        "COUNT(*) >= 2",
        "MAX(c.ran_at) - MIN(c.ran_at) >= INTERVAL '24 hours'",
        "c.source_id = j.source_id",
        "c.counted IS TRUE",
        "c.ran_at > COALESCE(j.last_seen_at, j.created_at) + INTERVAL '10 minutes'",
    ):
        assert part in rule
    assert expiry.ABSENCE_WHERE == expiry.absence_where()


def test_deadline_expiry_covers_every_row_hidden_or_not():
    assert expiry.DEADLINE_WHERE == (
        "status = 'active' AND deadline IS NOT NULL AND deadline < CURRENT_DATE"
    )
    assert "deleted_at" not in expiry.EXPIRE_BY_DEADLINE_SQL


def test_a_description_is_dropped_90_days_after_its_job_closed():
    assert expiry.DESCRIPTION_WHERE == (
        "description IS NOT NULL AND status = 'expired'"
        " AND LEAST(deadline, expired_at::date) <= CURRENT_DATE - 90"
    )
    assert "SET description = NULL" in expiry.DROP_DESCRIPTIONS_SQL


def test_expiry_writes_lifecycle_only():
    for sql in (expiry.EXPIRE_BY_ABSENCE_SQL, expiry.EXPIRE_BY_DEADLINE_SQL):
        assert "SET status = 'expired', expired_at = NOW()" in sql
    assert "SET status = 'active', expired_at = NULL" in expiry.RETURN_ON_SIGHT_SQL
    every = " ".join([
        expiry.EXPIRE_BY_ABSENCE_SQL, expiry.EXPIRE_BY_DEADLINE_SQL,
        expiry.DROP_DESCRIPTIONS_SQL, expiry.RETURN_ON_SIGHT_SQL,
    ])
    assert "DELETE" not in every.upper().replace("DELETED_AT IS NULL", "")
    assert "deleted_at =" not in every and "updated_at" not in every


def test_the_daily_pass_skips_rows_a_crawl_holds():
    assert "FOR UPDATE SKIP LOCKED" in expiry.EXPIRE_BY_DEADLINE_SQL
    assert "FOR UPDATE SKIP LOCKED" in expiry.DROP_DESCRIPTIONS_SQL


def test_the_preview_reads_the_rules_own_conditions():
    assert expiry_preview.ABSENCE_WHERE is expiry.ABSENCE_WHERE
    assert expiry_preview.DEADLINE_WHERE is expiry.DEADLINE_WHERE
    assert expiry_preview.DESCRIPTION_WHERE is expiry.DESCRIPTION_WHERE
    assert expiry.ABSENCE_WHERE in expiry_preview.ABSENT_SQL
    assert expiry.ABSENCE_WHERE in expiry.EXPIRE_BY_ABSENCE_SQL
    assert expiry.DEADLINE_WHERE in expiry_preview.DEADLINE_SQL
    assert expiry.DESCRIPTION_WHERE in expiry_preview.DESCRIPTIONS_SQL


# --- The helpers ------------------------------------------------------------------------------


def test_expire_absent_passes_its_source_and_returns_the_ids():
    cursor = Cursor()
    cursor.fetchall = lambda: [("a",), {"id": "b"}]
    assert expiry.expire_absent(cursor, 7) == ["a", "b"]
    assert cursor.statements == [(" ".join(expiry.EXPIRE_BY_ABSENCE_SQL.split()),
                                  {"source_id": "7"})]


@pytest.mark.parametrize("prior, sent", [
    (None, None),
    (date(2026, 11, 1), "2026-11-01"),
    (datetime(2026, 11, 1, 5, tzinfo=timezone.utc), "2026-11-01"),
    ("2026-11-01", "2026-11-01"),
    ("not a date", None),
])
def test_return_on_sight_sends_the_prior_deadline_as_a_day(prior, sent):
    cursor = Cursor(returns=True)
    assert expiry.return_on_sight(cursor, "job-1", prior) is True
    assert cursor.statements == [(RETURN_SQL, {"id": "job-1", "prior": sent})]
    assert expiry.return_on_sight(Cursor(returns=False), "job-1", prior) is False


def test_the_daily_pass_expires_then_drops_then_counts_what_is_left():
    cursor = Cursor()
    counts = iter([3, 2])

    def execute(sql, params=None):
        Cursor.execute(cursor, sql, params)
        cursor.rowcount = next(counts, -1)

    cursor.execute = execute
    cursor.fetchone = lambda: (4,)
    assert expiry.daily_pass(cursor) == {"expired": 3, "descriptions_dropped": 2, "left": 4}
    assert [sql for sql, _p in cursor.statements] == [
        " ".join(sql.split()) for sql in (
            expiry.EXPIRE_BY_DEADLINE_SQL, expiry.DROP_DESCRIPTIONS_SQL, expiry.PASS_LEFT_SQL,
        )
    ]


# --- The writer's return on sight -------------------------------------------------------------


def test_an_active_job_seen_again_sends_no_return():
    outcome, statements, returned = _persist(_stored(), returns=True)
    assert outcome == "unchanged"
    assert RETURN_SQL not in [sql for sql, _p in statements]
    assert returned == []


def test_an_expired_job_seen_unchanged_returns_after_its_sighting():
    outcome, statements, returned = _persist(
        _stored(status="expired", deadline=date(2026, 12, 1)), returns=True,
        deadline="2026-12-01",
    )
    assert outcome == "unchanged"
    sqls = [sql for sql, _p in statements]
    assert sqls[-2].startswith("UPDATE jobs SET last_seen_at")
    assert sqls[-1] == RETURN_SQL
    assert statements[-1][1] == {"id": "row-1", "prior": "2026-12-01"}
    assert returned == ["row-1"]


def test_an_expired_job_updated_returns_after_the_write_judged_on_its_prior_deadline():
    outcome, statements, returned = _persist(
        _stored(status="expired", deadline=date(2026, 11, 1)), returns=True,
        deadline="2026-12-31",
    )
    assert outcome == "updated"
    sqls = [sql for sql, _p in statements]
    write = next(i for i, sql in enumerate(sqls) if sql.startswith("UPDATE jobs SET")
                 and "deadline" in sql)
    assert sqls.index(RETURN_SQL) > write, "the new deadline is stored first"
    assert statements[-1][1]["prior"] == "2026-11-01"
    assert returned == ["row-1"]


def test_a_job_the_database_does_not_return_is_not_reported():
    _outcome, statements, returned = _persist(_stored(status="expired"), returns=False)
    assert RETURN_SQL in [sql for sql, _p in statements]
    assert returned == []


def test_a_hidden_expired_job_seen_again_may_return_and_stays_hidden():
    outcome, statements, returned = _persist(
        _stored(status="expired", deleted_at=WHEN), returns=True,
    )
    assert outcome == "seen_again"
    assert returned == ["row-1"]
    assert not any("deleted_at" in sql and sql.startswith("UPDATE") for sql, _p in statements)


def test_a_conflict_or_a_rejected_row_returns_nothing():
    cursor = Cursor([_stored(status="expired")], returns=True)
    returned = []
    assert persist_candidate(
        cursor, {"title": TITLE, "apply_url": URL}, observed_at=WHEN, heuristics=False,
        returned=returned,
    ) == "rejected"
    assert returned == [] and cursor.statements == []


def test_the_observation_path_returns_a_job_expired_by_absence():
    saved = {"id": "job-1", "apply_url": URL, "status": "expired", "deadline": None,
             "deleted_at": None}
    cursor, returned = Cursor(returns=True), []
    outcome = observe_known(
        cursor, {"title": TITLE, "apply_url": URL}, {observation_link(URL): [saved]},
        observed_at=WHEN, source_id="src-1", open_on=WHEN.date(), returned=returned,
    )
    assert outcome == "observed"
    assert [sql for sql, _p in cursor.statements][-1] == RETURN_SQL
    assert returned == ["job-1"]


# --- The run's returned jobs ------------------------------------------------------------------


def test_the_run_handle_keeps_returned_jobs_across_saves_and_drops_a_failed_save():
    results = iter([
        {"inserted": 0, "returned_ids": ["a", "b"]},
        RuntimeError("save failed"),
        {"inserted": 0, "returned_ids": ["b", "c"]},
    ])

    def save_jobs(jobs, source_id, org_name, **kwargs):
        result = next(results)
        if isinstance(result, Exception):
            raise result
        return result

    async def scenario():
        run = RunHandle("run-1", "src-1")
        for _ in range(3):
            try:
                await run.save(save_jobs, [], "src-1", "Example")
            except RuntimeError:
                pass
        return run

    run = asyncio.run(scenario())
    assert run.returned == {"a", "b", "c"}


def test_closing_a_run_hands_the_finish_its_returned_count():
    orch = CrawlerOrchestrator("postgresql://example")
    seen = {}

    async def finish_run(source, run_id, result, *, mode):
        seen.update(result)
        return True

    orch.finish_run = finish_run

    async def scenario():
        run = RunHandle("run-1", "src-1")
        run.returned.update({"a", "b"})
        await orch._close_run({"id": "src-1", "org_name": "Example"}, run, {}, "normal")

    asyncio.run(scenario())
    assert seen["returned"] == 2


# --- The daily pass in the scheduler ----------------------------------------------------------


class PassCursor:
    def __init__(self, day, left=0, fail=False):
        self.day, self.left, self.fail = day, left, fail
        self.statements = []
        self.rowcount = 0
        self._last = ""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self._last = " ".join(sql.split())
        self.statements.append(self._last)
        if self.fail and self._last.startswith("UPDATE"):
            raise RuntimeError("lock timeout")
        self.rowcount = 1 if self._last.startswith("UPDATE") else -1

    def fetchone(self):
        if self._last == "SELECT CURRENT_DATE":
            return (self.day,)
        return (self.left,)


class PassConn:
    def __init__(self, cursor):
        self.cursor_obj, self.commits, self.rollbacks, self.closed = cursor, 0, 0, False

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


def _passing(orch, cursor):
    conn = PassConn(cursor)
    orch._get_db_conn = lambda: conn
    return conn


def test_the_daily_pass_runs_once_per_database_day():
    orch = CrawlerOrchestrator("postgresql://example")
    first = _passing(orch, PassCursor(date(2026, 11, 12)))
    assert orch._daily_pass_once() == {"expired": 1, "descriptions_dropped": 1, "left": 0}
    assert first.commits == 1 and first.closed
    again = _passing(orch, PassCursor(date(2026, 11, 12)))
    assert orch._daily_pass_once() is None
    assert again.commits == 0
    assert not any(sql.startswith("UPDATE") for sql in again.cursor_obj.statements)
    nextday = _passing(orch, PassCursor(date(2026, 11, 13)))
    assert orch._daily_pass_once()["expired"] == 1
    assert nextday.commits == 1


def test_a_pass_that_skipped_held_rows_is_tried_again():
    orch = CrawlerOrchestrator("postgresql://example")
    _passing(orch, PassCursor(date(2026, 11, 12), left=2))
    assert orch._daily_pass_once()["left"] == 2
    again = _passing(orch, PassCursor(date(2026, 11, 12)))
    assert orch._daily_pass_once() is not None
    assert again.commits == 1


def test_a_failed_pass_rolls_back_and_is_tried_again():
    orch = CrawlerOrchestrator("postgresql://example")
    failed = _passing(orch, PassCursor(date(2026, 11, 12), fail=True))
    with pytest.raises(RuntimeError):
        orch._daily_pass_once()
    assert failed.rollbacks == 1 and failed.commits == 0 and failed.closed
    _passing(orch, PassCursor(date(2026, 11, 12)))
    assert orch._daily_pass_once() is not None


def test_the_scheduler_still_crawls_when_the_daily_pass_fails(monkeypatch):
    orch = CrawlerOrchestrator("postgresql://example")
    calls = []

    async def failing_pass():
        calls.append("pass")
        raise RuntimeError("database down")

    async def crawls():
        calls.append("crawl")
        orch.running = False
        return {"queued": 0}

    async def no_sleep(_seconds):
        return None

    orch.daily_pass_once = failing_pass
    orch.run_due_sources_once = crawls
    monkeypatch.setattr("orchestrator.asyncio.sleep", no_sleep)
    orch.running = True
    asyncio.run(orch.scheduler_loop())
    assert calls == ["pass", "crawl"]


# --- The preview stays read-only ----------------------------------------------------------------


class PreviewCursor:
    def __init__(self, read_only="on", role="aidjobs_readonly"):
        self.read_only, self.role = read_only, role
        self.statements = []
        self._last = ""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self._last = " ".join(sql.split())
        self.statements.append(self._last)

    def fetchone(self):
        if self._last == "SHOW transaction_read_only":
            return (self.read_only,)
        if self._last == "SELECT current_user":
            return (self.role,)
        if self._last == "SELECT CURRENT_DATE":
            return (date(2026, 11, 12),)
        return (0,)

    def fetchall(self):
        if self._last.startswith("SELECT id, org_name, status FROM sources"):
            return [("src-1", "UNICEF", "active")]
        if "FROM crawl_logs" in self._last and "ORDER BY ran_at DESC" in self._last:
            return [(WHEN, "ok", True, 223, 0, 0, 302, 0, 0, False)]
        if "SELECT j.title, j.apply_url" in self._last:
            return [("Officer", "https://jobs.unicef.org/en-us/job/1", WHEN, None, WHEN)]
        return []


class PreviewConn:
    def __init__(self, cursor):
        self.cursor_obj, self.session, self.rolled_back = cursor, None, False

    def set_session(self, **kwargs):
        self.session = kwargs

    def cursor(self):
        return self.cursor_obj

    def rollback(self):
        self.rolled_back = True

    def close(self):
        pass


def _preview(cursor, environ=None):
    lines = []
    conn = PreviewConn(cursor)
    code = expiry_preview.main(
        environ={"AIDJOBS_READONLY_DB_URL": "postgresql://x"} if environ is None else environ,
        connect=lambda *args, **kwargs: conn,
        out=lines.append,
    )
    return code, lines, conn


def test_the_preview_only_reads():
    cursor = PreviewCursor()
    code, lines, conn = _preview(cursor)
    assert code == 0
    assert conn.session == {"readonly": True} and conn.rolled_back
    for sql in cursor.statements:
        assert sql.split()[0] in ("SELECT", "SHOW", "SET"), sql
        assert "UPDATE" not in sql and "DELETE" not in sql and "INSERT" not in sql
    assert "SET LOCAL statement_timeout = '20s'" in cursor.statements
    text = "\n".join(lines)
    assert "would expire by absence at the next counting run's finish: 1" in text
    assert "https://jobs.unicef.org/en-us/job/1" in text


@pytest.mark.parametrize("cursor, refusal", [
    (PreviewCursor(read_only="off"), "refused: the session is not read-only"),
    (PreviewCursor(role="postgres"), "refused: signed in as postgres, not aidjobs_readonly"),
])
def test_the_preview_refuses_a_session_that_could_write(cursor, refusal):
    code, lines, _conn = _preview(cursor)
    assert code == 1 and lines[-1] == refusal
    assert not any("FROM jobs" in sql for sql in cursor.statements)


def test_the_preview_needs_the_read_only_login():
    code, lines, _conn = _preview(PreviewCursor(), environ={})
    assert code == 2 and "with-readonly-db.ps1" in lines[0]
    source = PREVIEW_PATH.read_text(encoding="utf-8")
    assert "dotenv" not in source and ".env" not in source.replace("os.environ", "")
