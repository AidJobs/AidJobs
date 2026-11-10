"""W-52 and W-53 against real PostgreSQL: the source lifecycle rules, their locks, and the
two migrations on sources.

Runs where tests/test_crawl_ownership.py runs, in the same pytest process and with the same
guards, imported from it: only a local database whose name ends in _test, no production
variable, Python sockets to loopback only, and every psycopg2 connection checked. In CI the routes
connect as aidjobs_app with only the grants in infra/roles/02_grants.sql, as in production; the
migrations run as postgres, as the user runs them in Supabase's SQL editor.
"""
import asyncio
import threading
import time
import uuid
from pathlib import Path

import psycopg2
import psycopg2.errors
import psycopg2.extensions
import pytest
from fastapi import HTTPException

from contracts.run_ownership import SOURCE_DELETED_MESSAGE, SOURCE_LIVE_SQL, SourceDeleted

# `db` and `schema` are its fixtures; pytest finds them by these names.
from tests.test_crawl_ownership import (  # noqa: F401
    ADMIN_URL,
    TEST_URL,
    _add_source,
    _crawler,
    _orch,
    _sql,
    db,
    schema,
)
from tests.test_crawl_ownership import _job as _candidate

MIGRATIONS = Path(__file__).resolve().parents[3] / "infra" / "migrations"
class Rule:
    """One migration on sources: the column it limits, and values to test it with."""

    def __init__(self, stem, column, constraint, allowed, refused, broken, other_rule, default,
                 definition):
        self.migration = (MIGRATIONS / f"{stem}.sql").read_text(encoding="utf-8")
        self.rollback = (MIGRATIONS / f"{stem}_rollback.sql").read_text(encoding="utf-8")
        self.column, self.constraint = column, constraint
        self.allowed, self.refused, self.broken = allowed, refused, broken
        self.other_rule, self.default, self.definition = other_rule, default, definition


RULES = {
    "status (W-52)": Rule(
        "w52_sources_status_check", "status", "sources_status_allowed",
        allowed=("active", "paused", "deleted", "pending_validation"),
        refused=("Deleted", "paused ", " active", "ACTIVE", "", "archived"),
        broken=("Deleted", "paused ", None),
        other_rule="CHECK (status IN ('active', 'paused'))",
        default="pending_validation",
        definition="CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, "
                   "'deleted'::text, 'pending_validation'::text])))"),
    "type (W-53)": Rule(
        "w53_sources_type_check", "source_type", "sources_type_allowed",
        allowed=("html", "rss", "api"),
        refused=("json", "HTML", " html", "rss ", "", "xml", "browser"),
        broken=("json", "HTML", None),
        other_rule="CHECK (source_type IN ('html'))",
        default="html",
        definition="CHECK ((source_type = ANY (ARRAY['html'::text, 'rss'::text, "
                   "'api'::text])))"),
}


@pytest.fixture
def routes(db, monkeypatch):  # noqa: F811
    """The sources and job routes, connected to the test database as the code's own login."""
    from app import job_management, sources

    params = psycopg2.extensions.parse_dsn(TEST_URL)
    monkeypatch.setattr(sources, "_connection_params", lambda: dict(params))
    monkeypatch.setattr(job_management.db_config, "get_connection_params", lambda: dict(params))
    return sources, job_management


def _add_job(source_id, *, deleted=False):
    job_id = str(uuid.uuid4())
    _sql(
        """
        INSERT INTO jobs (id, source_id, title, canonical_hash, status, deleted_at)
        VALUES (%s, %s, 'Programme Officer', %s, 'active',
                CASE WHEN %s THEN NOW() ELSE NULL END)
        """,
        (job_id, source_id, f"hash-{job_id}", deleted),
    )
    return job_id


def _row(table, row_id):
    found = _sql(f"SELECT row_to_json(t)::text FROM {table} t WHERE id = %s", (row_id,))
    return found[0][0] if found else None


def _job(job_id):
    source_id, deleted_at = _sql("SELECT source_id, deleted_at FROM jobs WHERE id = %s",
                                 (job_id,))[0]
    return {"source_id": source_id and str(source_id), "deleted": deleted_at is not None}


def _restore(job_management, job_ids):
    request = job_management.RestoreRequest(job_ids=job_ids)
    return asyncio.run(job_management.restore_jobs(request, admin="test-admin"))["data"]


def _held(statement, params=()):
    """An open transaction on its own connection that has run `statement`; commit or roll back."""
    conn = psycopg2.connect(ADMIN_URL)
    cur = conn.cursor()
    cur.execute(statement, params)
    return conn


def _in_thread(call):
    outcome = {}

    def run():
        try:
            outcome["value"] = call()
        except BaseException as exc:  # noqa: BLE001 - reported to the test
            outcome["error"] = exc

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread, outcome


def _waits(thread, query_text, seconds=5.0):
    """True once the thread's statement containing `query_text` is waiting on a lock in
    PostgreSQL, and the thread has not finished; False when it finishes or never waits."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline and thread.is_alive():
        waiting = _sql(
            "SELECT count(*) FROM pg_stat_activity "
            "WHERE wait_event_type = 'Lock' AND position(%s in query) > 0",
            (query_text,),
        )[0][0]
        if waiting:
            return thread.is_alive()
        time.sleep(0.05)
    return False


# The routes --------------------------------------------------------------------------------

def test_a_permanent_delete_with_a_live_job_changes_nothing(routes):
    sources, _jm = routes
    source = _add_source("Gone", status="deleted")
    live, hidden = _add_job(source["id"]), _add_job(source["id"], deleted=True)
    before = [_row("sources", source["id"]), _row("jobs", live), _row("jobs", hidden)]
    with pytest.raises(HTTPException) as refused:
        sources.permanently_delete_source(None, source["id"], admin="test-admin")
    assert refused.value.status_code == 409
    assert [_row("sources", source["id"]), _row("jobs", live), _row("jobs", hidden)] == before


def test_a_permanent_delete_of_a_source_whose_jobs_are_all_deleted(routes):
    sources, _jm = routes
    source = _add_source("Gone", status="deleted")
    hidden = _add_job(source["id"], deleted=True)
    _sql("INSERT INTO crawl_logs (source_id, status) VALUES (%s, 'ok')", (source["id"],))
    answer = sources.permanently_delete_source(None, source["id"], admin="test-admin")
    assert answer["status"] == "ok"
    assert _row("sources", source["id"]) is None
    assert _sql("SELECT count(*) FROM crawl_logs WHERE source_id = %s", (source["id"],))[0][0] == 0
    # Production's ON DELETE SET NULL: the deleted job stays, deleted, without its source.
    assert _job(hidden) == {"source_id": None, "deleted": True}


def test_the_source_lock_holds_back_a_new_job_for_it(routes):
    source = _add_source("Locked", status="deleted")
    holder = _held("SELECT 1 FROM sources WHERE id = %s FOR UPDATE", (source["id"],))
    try:
        conn = psycopg2.connect(TEST_URL)
        try:
            with conn.cursor() as cur:
                cur.execute("SET lock_timeout = '1s'")
                with pytest.raises(psycopg2.errors.LockNotAvailable):
                    cur.execute(
                        "INSERT INTO jobs (source_id, title, canonical_hash) "
                        "VALUES (%s, 'New', 'hash-new')", (source["id"],))
        finally:
            conn.rollback()
            conn.close()
    finally:
        holder.rollback()
        holder.close()


def test_a_restore_waits_for_a_permanent_delete_and_brings_nothing_back(routes):
    _sources, jm = routes
    source = _add_source("Gone")
    hidden = _add_job(source["id"], deleted=True)
    holder = _held("SELECT 1 FROM sources WHERE id = %s FOR UPDATE", (source["id"],))
    thread, outcome = _in_thread(lambda: _restore(jm, [hidden]))
    try:
        assert _waits(thread, "FOR SHARE OF s"), "the restore did not wait for its source"
        holder.cursor().execute("DELETE FROM sources WHERE id = %s", (source["id"],))
        holder.commit()
    finally:
        holder.close()
    thread.join(10)
    assert "error" not in outcome, outcome.get("error")
    assert outcome["value"]["restored_count"] == 0
    assert _job(hidden) == {"source_id": None, "deleted": True}


def test_a_restore_waits_for_a_source_delete_and_brings_nothing_back(routes):
    _sources, jm = routes
    source = _add_source("Going")
    hidden = _add_job(source["id"], deleted=True)
    holder = _held("UPDATE sources SET status = 'deleted' WHERE id = %s", (source["id"],))
    thread, outcome = _in_thread(lambda: _restore(jm, [hidden]))
    try:
        assert _waits(thread, "FOR SHARE OF s"), "the restore did not wait for the delete"
        holder.commit()
    finally:
        holder.close()
    thread.join(10)
    assert "error" not in outcome, outcome.get("error")
    assert outcome["value"]["restored_count"] == 0
    assert outcome["value"]["not_restored_count"] == 1
    assert _job(hidden) == {"source_id": source["id"], "deleted": True}


def test_a_restore_brings_back_jobs_of_a_live_source_only(routes):
    _sources, jm = routes
    live_source, gone_source = _add_source("Live"), _add_source("Gone", status="deleted")
    paused_source = _add_source("Paused", status="paused")
    back = _add_job(live_source["id"], deleted=True)
    also_back = _add_job(paused_source["id"], deleted=True)
    kept = _add_job(gone_source["id"], deleted=True)
    data = _restore(jm, [back, also_back, kept])
    assert sorted(data["restored_ids"]) == sorted([back, also_back])
    assert data["not_restored_count"] == 1
    assert [_job(back)["deleted"], _job(also_back)["deleted"], _job(kept)["deleted"]] == [
        False, False, True]


def test_an_edit_of_a_deleted_source_changes_nothing(routes):
    sources, _jm = routes
    source = _add_source("Gone", status="deleted")
    before = _row("sources", source["id"])
    with pytest.raises(HTTPException) as refused:
        sources.update_source(None, source["id"], sources.SourceUpdate(status="active"),
                              admin="test-admin")
    assert refused.value.status_code == 409
    assert _row("sources", source["id"]) == before


def test_a_permanent_delete_waits_for_a_new_job_of_its_source_and_then_refuses(routes):
    sources, _jm = routes
    source = _add_source("Gone", status="deleted")
    holder = psycopg2.connect(ADMIN_URL)
    cur = holder.cursor()
    cur.execute("INSERT INTO jobs (source_id, title, canonical_hash) "
                "VALUES (%s, 'New', 'hash-new') RETURNING id", (source["id"],))
    job_id = str(cur.fetchone()[0])
    thread, outcome = _in_thread(
        lambda: sources.permanently_delete_source(None, source["id"], admin="test-admin"))
    try:
        assert _waits(thread, "id::text, status"), "the delete did not wait for the new job"
        holder.commit()
    finally:
        holder.close()
    thread.join(10)
    assert isinstance(outcome.get("error"), HTTPException), outcome
    assert outcome["error"].status_code == 409
    assert _row("sources", source["id"]) is not None
    assert _job(job_id) == {"source_id": source["id"], "deleted": False}


def test_a_permanent_delete_while_a_run_is_running_changes_nothing(routes):
    sources, _jm = routes
    source = _add_source("Gone", status="deleted")
    hidden = _add_job(source["id"], deleted=True)
    _sql("INSERT INTO crawl_logs (source_id, status) VALUES (%s, 'running')", (source["id"],))
    before = [_row("sources", source["id"]), _row("jobs", hidden),
              _sql("SELECT count(*) FROM crawl_logs WHERE source_id = %s", (source["id"],))]
    with pytest.raises(HTTPException) as refused:
        sources.permanently_delete_source(None, source["id"], admin="test-admin")
    assert refused.value.status_code == 409
    assert [_row("sources", source["id"]), _row("jobs", hidden),
            _sql("SELECT count(*) FROM crawl_logs WHERE source_id = %s",
                 (source["id"],))] == before


def test_a_restore_of_a_job_whose_source_was_deleted_permanently(routes):
    sources, jm = routes
    source = _add_source("Gone", status="deleted")
    hidden = _add_job(source["id"], deleted=True)
    sources.permanently_delete_source(None, source["id"], admin="test-admin")
    data = _restore(jm, [hidden])
    assert (data["restored_count"], data["not_restored_count"]) == (0, 1)
    assert data["message"] == ("Restored 0 jobs. 1 job cannot be restored: the source was "
                               "deleted permanently.")
    assert _job(hidden) == {"source_id": None, "deleted": True}


def test_a_restore_under_a_source_without_a_status_goes_through(routes):
    """Only a database without W-52's rule (a development copy) can hold such a source."""
    _sources, jm = routes
    _sql(RULES["status (W-52)"].rollback)
    try:
        source = _add_source("Old")
        _sql("UPDATE sources SET status = NULL WHERE id = %s", (source["id"],))
        hidden = _add_job(source["id"], deleted=True)
        assert _restore(jm, [hidden])["restored_count"] == 1
    finally:
        _as_production()


# A crawl and a source delete ---------------------------------------------------------------

def test_a_crawl_saves_nothing_once_its_source_is_deleted_and_is_not_counted(routes):
    sources, _jm = routes
    source = _add_source("Example", failures=4)
    orch = _orch()
    run_id, started = orch._begin(source["id"], False)
    assert started
    sources.delete_source(None, source["id"], admin="test-admin")
    with pytest.raises(SourceDeleted, match=SOURCE_DELETED_MESSAGE):
        _crawler().save_jobs([_candidate(1)], source["id"], "Example", run_token=run_id)
    assert _sql("SELECT count(*) FROM jobs WHERE source_id = %s", (source["id"],))[0][0] == 0
    failed = {"status": "failed", "message": SOURCE_DELETED_MESSAGE, "counts": {}}
    assert orch._finish(source["id"], run_id, failed, mode="normal", health=None) is True
    assert _sql("SELECT status, consecutive_failures, last_crawl_status FROM sources "
                "WHERE id = %s", (source["id"],))[0] == ("deleted", 4, "failed")
    assert _sql("SELECT status FROM crawl_logs WHERE id = %s", (run_id,))[0][0] == "failed"


def test_a_source_delete_gives_up_on_a_long_save_and_changes_nothing(routes, monkeypatch):
    sources, _jm = routes
    monkeypatch.setattr(sources, "DELETE_LOCK_TIMEOUT", "1s")
    source = _add_source("Example")
    live = _add_job(source["id"])
    before = [_row("sources", source["id"]), _row("jobs", live)]
    holder = psycopg2.connect(TEST_URL)
    holder.cursor().execute(SOURCE_LIVE_SQL, (source["id"],))
    try:
        delete, outcome = _in_thread(
            lambda: sources.delete_source(None, source["id"], admin="test-admin"))
        delete.join(10)
        assert not delete.is_alive(), "the source delete did not give up on the save"
    finally:
        holder.rollback()
        holder.close()
    assert isinstance(outcome.get("error"), HTTPException), outcome
    assert outcome["error"].status_code == 409
    assert [_row("sources", source["id"]), _row("jobs", live)] == before


def test_a_permanent_delete_goes_ahead_while_another_source_is_crawled(routes):
    sources, _jm = routes
    other = _add_source("Other")
    _sql("INSERT INTO crawl_logs (source_id, status) VALUES (%s, 'running')", (other["id"],))
    source = _add_source("Gone", status="deleted")
    _add_job(source["id"], deleted=True)
    answer = sources.permanently_delete_source(None, source["id"], admin="test-admin")
    assert answer["status"] == "ok" and _row("sources", source["id"]) is None


def test_a_finish_is_not_held_back_by_a_waiting_save_and_a_queued_source_delete(routes):
    """The finish holds the run row; the save holds the source FOR KEY SHARE and waits for the
    run row; the source delete queues FOR UPDATE behind the save. The finish's FOR NO KEY UPDATE
    on the source must still be granted at once, or the three would deadlock."""
    from contracts.run_ownership import OwnershipLost

    sources, _jm = routes
    source = _add_source("Example")
    run_id, _started = _orch()._begin(source["id"], False)
    finisher = _held("UPDATE crawl_logs SET message = 'finishing' WHERE id = %s", (run_id,))
    save, saved = _in_thread(lambda: _crawler().save_jobs(
        [_candidate(1)], source["id"], "Example", run_token=run_id))
    delete = None
    try:
        assert _waits(save, "FROM crawl_logs"), "the save did not wait for the run row"
        delete, deleted = _in_thread(
            lambda: sources.delete_source(None, source["id"], admin="test-admin"))
        assert _waits(delete, "id::text, org_name"), "the source delete did not wait for the save"
        cur = finisher.cursor()
        cur.execute("SET LOCAL lock_timeout = '3s'")
        _orch()._update_source(cur, source["id"], outcome="success", run_status="ok",
                               message="Found 1 jobs", counts={}, health=None)
        cur.execute("UPDATE crawl_logs SET status = 'ok' WHERE id = %s", (run_id,))
        finisher.commit()
    finally:
        finisher.close()
    save.join(30)
    delete.join(30)
    assert isinstance(saved.get("error"), OwnershipLost), saved
    assert "error" not in deleted, deleted.get("error")
    assert _sql("SELECT count(*) FROM jobs WHERE source_id = %s AND deleted_at IS NULL",
                (source["id"],))[0][0] == 0
    assert _sql("SELECT status FROM sources WHERE id = %s", (source["id"],))[0][0] == "deleted"


def test_a_save_waits_for_a_source_delete_in_progress_and_saves_nothing(routes):
    source = _add_source("Example")
    run_id, _started = _orch()._begin(source["id"], False)
    holder = _held("SELECT 1 FROM sources WHERE id = %s FOR UPDATE", (source["id"],))
    holder.cursor().execute("UPDATE sources SET status = 'deleted' WHERE id = %s",
                            (source["id"],))
    thread, outcome = _in_thread(
        lambda: _crawler().save_jobs([_candidate(1)], source["id"], "Example", run_token=run_id))
    try:
        assert _waits(thread, "FOR KEY SHARE"), "the save did not wait for the source delete"
        holder.commit()
    finally:
        holder.close()
    thread.join(30)
    assert isinstance(outcome.get("error"), SourceDeleted), outcome
    assert _sql("SELECT count(*) FROM jobs WHERE source_id = %s", (source["id"],))[0][0] == 0


def test_a_source_delete_waits_for_a_save_in_progress_and_hides_its_jobs(routes):
    sources, _jm = routes
    source = _add_source("Example")
    holder = psycopg2.connect(TEST_URL)
    cur = holder.cursor()
    cur.execute(SOURCE_LIVE_SQL, (source["id"],))
    cur.execute("INSERT INTO jobs (source_id, title, canonical_hash) "
                "VALUES (%s, 'Saved', 'hash-saved') RETURNING id", (source["id"],))
    job_id = str(cur.fetchone()[0])
    thread, outcome = _in_thread(
        lambda: sources.delete_source(None, source["id"], admin="test-admin"))
    try:
        assert _waits(thread, "id::text, org_name"), "the delete did not wait for the save"
        holder.commit()
    finally:
        holder.close()
    thread.join(10)
    assert "error" not in outcome, outcome.get("error")
    assert _job(job_id) == {"source_id": source["id"], "deleted": True}


def test_a_save_lock_does_not_hold_back_a_finish_or_a_takeover(routes):
    source = _add_source("Example")
    holder = psycopg2.connect(TEST_URL)
    holder.cursor().execute(SOURCE_LIVE_SQL, (source["id"],))
    try:
        conn = psycopg2.connect(ADMIN_URL)
        try:
            with conn.cursor() as cur:
                cur.execute("SET lock_timeout = '1s'")
                _orch()._update_source(cur, source["id"], outcome="fail", run_status="fail",
                                       message="Timed out", counts={}, health=None)
        finally:
            conn.rollback()
            conn.close()
    finally:
        holder.rollback()
        holder.close()


@pytest.mark.parametrize("start, to", [("active", "paused"), ("paused", "active"),
                                       ("pending_validation", "active")])
def test_an_edit_pauses_and_resumes(routes, start, to):
    sources, _jm = routes
    source = _add_source("Example", status=start)
    sources.update_source(None, source["id"], sources.SourceUpdate(status=to), admin="test-admin")
    assert _sql("SELECT status FROM sources WHERE id = %s", (source["id"],))[0][0] == to


# The migrations ----------------------------------------------------------------------------

def _undo_all():
    for each in RULES.values():
        _sql(each.rollback)


def _as_production():
    """Both rules back, as in production since 10 November 2026 (tests/sql/crawl_schema.sql)."""
    _sql("TRUNCATE jobs, crawl_logs, crawl_locks, sources CASCADE")
    _undo_all()
    for each in RULES.values():
        _run_file(each.migration)


@pytest.fixture(params=list(RULES), ids=list(RULES))
def rule(request, db):  # noqa: F811
    """Each test starts without either rule; production's rules are back afterwards."""
    _undo_all()
    yield RULES[request.param]
    _as_production()


def test_the_test_schema_has_productions_rules(db):  # noqa: F811
    for each in RULES.values():
        assert _state(each) == ((True, each.definition), "NO")


def _state(rule):
    constraint = _sql(
        "SELECT convalidated, pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conrelid = 'public.sources'::regclass AND conname = %s", (rule.constraint,))
    nullable = _sql(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' "
        "AND table_name = 'sources' AND column_name = %s", (rule.column,))[0][0]
    return (constraint[0] if constraint else None), nullable


def _set(rule, source_id, value):
    _sql(f"UPDATE sources SET {rule.column} = %s WHERE id = %s", (value, source_id))


def _value(rule, source_id):
    return _sql(f"SELECT {rule.column} FROM sources WHERE id = %s", (source_id,))[0][0]


def _run_file(text):
    """Run a migration file as the SQL editor does: one session, its own BEGIN and COMMIT."""
    conn = psycopg2.connect(ADMIN_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(text)
    finally:
        conn.close()


def test_without_the_migration_any_value_is_stored(rule):
    source = _add_source("Example")
    _set(rule, source["id"], rule.broken[0])
    _set(rule, source["id"], None)
    assert _state(rule) == (None, "YES")


def test_the_migration_allows_only_its_values_and_never_none(rule):
    source = _add_source("Example")
    _run_file(rule.migration)
    assert _state(rule) == ((True, rule.definition), "NO")
    for value in rule.allowed:
        _set(rule, source["id"], value)
    for value in rule.refused:
        with pytest.raises(psycopg2.errors.CheckViolation):
            _set(rule, source["id"], value)
    with pytest.raises(psycopg2.errors.NotNullViolation):
        _set(rule, source["id"], None)
    with pytest.raises(psycopg2.errors.CheckViolation):
        _sql(f"INSERT INTO sources (careers_url, {rule.column}) VALUES (%s, %s)",
             ("https://other.example.org/jobs", rule.refused[0]))
    # A row added without a value takes production's default, which the rule allows.
    _sql("INSERT INTO sources (careers_url) VALUES ('https://default.example.org/jobs')")
    assert _sql(f"SELECT {rule.column} FROM sources WHERE careers_url = "
                "'https://default.example.org/jobs'")[0][0] == rule.default


def test_the_migration_runs_again_without_change(rule):
    _add_source("Example")
    _run_file(rule.migration)
    _run_file(rule.migration)
    assert _state(rule) == ((True, rule.definition), "NO")


@pytest.mark.parametrize("which", [0, 1, 2], ids=["first", "second", "none"])
def test_the_migration_stops_and_changes_nothing_when_a_row_breaks_the_rule(rule, which):
    bad = rule.broken[which]
    source = _add_source("Example")
    _set(rule, source["id"], bad)
    with pytest.raises(psycopg2.errors.RaiseException, match="nothing was changed"):
        _run_file(rule.migration)
    assert _state(rule) == (None, "YES")
    assert _value(rule, source["id"]) == bad


def test_the_migration_stops_when_the_name_has_another_rule(rule):
    _sql(f"ALTER TABLE sources ADD CONSTRAINT {rule.constraint} {rule.other_rule}")
    with pytest.raises(psycopg2.errors.RaiseException, match="another definition"):
        _run_file(rule.migration)
    constraint, nullable = _state(rule)
    assert constraint[1] != rule.definition and nullable == "YES"


def test_the_migration_stops_within_seconds_while_a_crawl_writes(rule):
    source = _add_source("Example")
    writer = _held("UPDATE sources SET last_crawl_status = 'ok' WHERE id = %s", (source["id"],))
    try:
        started = time.monotonic()
        with pytest.raises(psycopg2.errors.LockNotAvailable):
            _run_file(rule.migration)
        assert time.monotonic() - started < 15
    finally:
        writer.rollback()
        writer.close()
    assert _state(rule) == (None, "YES")


def test_the_rollback_undoes_the_migration_and_runs_again(rule):
    _add_source("Example")
    _run_file(rule.migration)
    _run_file(rule.rollback)
    _run_file(rule.rollback)
    assert _state(rule) == (None, "YES")
    _run_file(rule.migration)
    assert _state(rule) == ((True, rule.definition), "NO")


@pytest.mark.parametrize("order", [["status (W-52)", "type (W-53)"],
                                   ["type (W-53)", "status (W-52)"]], ids=["52-53", "53-52"])
def test_the_two_migrations_apply_in_either_order(db, order):  # noqa: F811
    _undo_all()
    try:
        _add_source("Example")
        for name in order:
            _run_file(RULES[name].migration)
        for each in RULES.values():
            assert _state(each) == ((True, each.definition), "NO")
    finally:
        _as_production()
