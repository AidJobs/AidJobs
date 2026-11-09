"""W-52 against real PostgreSQL: the source lifecycle rules, their locks, and the migration.

Runs where tests/test_crawl_ownership.py runs, in the same pytest process and with the same
guards, imported from it: only a local database whose name ends in _test, no production
variable, Python sockets to loopback only, and every psycopg2 connection checked. In CI the routes
connect as aidjobs_app with only the grants in infra/roles/02_grants.sql, as in production; the
migration runs as postgres, as the user runs it in Supabase's SQL editor.
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

# `db` and `schema` are its fixtures; pytest finds them by these names.
from tests.test_crawl_ownership import ADMIN_URL, TEST_URL, _add_source, _sql, db, schema  # noqa: F401

MIGRATIONS = Path(__file__).resolve().parents[3] / "infra" / "migrations"
MIGRATION = (MIGRATIONS / "w52_sources_status_check.sql").read_text(encoding="utf-8")
ROLLBACK = (MIGRATIONS / "w52_sources_status_check_rollback.sql").read_text(encoding="utf-8")
ALLOWED = ("active", "paused", "deleted", "pending_validation")
DEFINITION = ("CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'deleted'::text, "
              "'pending_validation'::text])))")


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


def _waits(thread, seconds=1.5):
    thread.join(seconds)
    return thread.is_alive()


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
        assert _waits(thread), "the restore did not wait for the lock on its source"
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
        assert _waits(thread), "the restore did not wait for the source being deleted"
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


@pytest.mark.parametrize("start, to", [("active", "paused"), ("paused", "active"),
                                       ("pending_validation", "active")])
def test_an_edit_pauses_and_resumes(routes, start, to):
    sources, _jm = routes
    source = _add_source("Example", status=start)
    sources.update_source(None, source["id"], sources.SourceUpdate(status=to), admin="test-admin")
    assert _sql("SELECT status FROM sources WHERE id = %s", (source["id"],))[0][0] == to


# The migration -----------------------------------------------------------------------------

@pytest.fixture
def migration(db):  # noqa: F811
    """Each test starts without the rule and ends without it."""
    _sql(ROLLBACK)
    yield
    _sql(ROLLBACK)


def _state():
    constraint = _sql(
        "SELECT convalidated, pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conrelid = 'public.sources'::regclass AND conname = 'sources_status_allowed'")
    nullable = _sql(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' "
        "AND table_name = 'sources' AND column_name = 'status'")[0][0]
    return (constraint[0] if constraint else None), nullable


def _run_file(text):
    """Run a migration file as the SQL editor does: one session, its own BEGIN and COMMIT."""
    conn = psycopg2.connect(ADMIN_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(text)
    finally:
        conn.close()


def test_without_the_migration_any_status_is_stored(migration):
    source = _add_source("Example")
    _sql("UPDATE sources SET status = 'Deleted' WHERE id = %s", (source["id"],))
    _sql("UPDATE sources SET status = NULL WHERE id = %s", (source["id"],))
    assert _state() == (None, "YES")


def test_the_migration_allows_only_the_four_statuses_and_never_none(migration):
    source = _add_source("Example")
    _run_file(MIGRATION)
    assert _state() == ((True, DEFINITION), "NO")
    for status in ALLOWED:
        _sql("UPDATE sources SET status = %s WHERE id = %s", (status, source["id"]))
    for status in ("Deleted", "paused ", " active", "ACTIVE", "", "archived"):
        with pytest.raises(psycopg2.errors.CheckViolation):
            _sql("UPDATE sources SET status = %s WHERE id = %s", (status, source["id"]))
    with pytest.raises(psycopg2.errors.NotNullViolation):
        _sql("UPDATE sources SET status = NULL WHERE id = %s", (source["id"],))
    with pytest.raises(psycopg2.errors.CheckViolation):
        _add_source("Other", status="Active")
    # A row added without a status takes production's default, which the rule allows.
    _sql("INSERT INTO sources (careers_url) VALUES ('https://default.example.org/jobs')")
    assert _sql("SELECT status FROM sources WHERE careers_url = "
                "'https://default.example.org/jobs'")[0][0] == "pending_validation"


def test_the_migration_runs_again_without_change(migration):
    _add_source("Example")
    _run_file(MIGRATION)
    _run_file(MIGRATION)
    assert _state() == ((True, DEFINITION), "NO")


@pytest.mark.parametrize("bad", ["Deleted", "paused ", None])
def test_the_migration_stops_and_changes_nothing_when_a_row_breaks_the_rule(migration, bad):
    source = _add_source("Example")
    _sql("UPDATE sources SET status = %s WHERE id = %s", (bad, source["id"]))
    with pytest.raises(psycopg2.errors.RaiseException, match="nothing was changed"):
        _run_file(MIGRATION)
    assert _state() == (None, "YES")
    assert _sql("SELECT status FROM sources WHERE id = %s", (source["id"],))[0][0] == bad


def test_the_migration_stops_when_the_name_has_another_rule(migration):
    _sql("ALTER TABLE sources ADD CONSTRAINT sources_status_allowed "
         "CHECK (status IN ('active', 'paused'))")
    with pytest.raises(psycopg2.errors.RaiseException, match="another definition"):
        _run_file(MIGRATION)
    constraint, nullable = _state()
    assert "pending_validation" not in constraint[1] and nullable == "YES"


def test_the_migration_stops_within_seconds_while_a_crawl_writes(migration):
    source = _add_source("Example")
    writer = _held("UPDATE sources SET last_crawl_status = 'ok' WHERE id = %s", (source["id"],))
    try:
        started = time.monotonic()
        with pytest.raises(psycopg2.errors.LockNotAvailable):
            _run_file(MIGRATION)
        assert time.monotonic() - started < 15
    finally:
        writer.rollback()
        writer.close()
    assert _state() == (None, "YES")


def test_the_rollback_undoes_the_migration_and_runs_again(migration):
    _add_source("Example")
    _run_file(MIGRATION)
    _run_file(ROLLBACK)
    _run_file(ROLLBACK)
    assert _state() == (None, "YES")
    _run_file(MIGRATION)
    assert _state() == ((True, DEFINITION), "NO")
