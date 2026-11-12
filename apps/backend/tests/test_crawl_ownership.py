"""Crawl-run ownership against real PostgreSQL (security plan stage 2, PR B, part F).

Runs in its own pytest process, never with the rest of the suite:

    TEST_DATABASE_URL=postgresql://postgres@localhost:5432/aidjobs_test \
        python -m pytest tests/test_crawl_ownership.py -q

Without TEST_DATABASE_URL the file skips before changing anything (in CI that is an
error). With it: only a local database whose name ends in _test is accepted, with no URL
options; SUPABASE_DB_URL, DATABASE_URL, PGHOST, PGHOSTADDR and PGSERVICE must be unset;
every psycopg2 connection is checked against the test database (host, port, name, and no
hostaddr, service or second host); and Python sockets may connect only to loopback.
libpq's own sockets are not intercepted, which is why the connection check exists.
Concurrent steps run on their own connections and threads; events and barriers force
each interleaving.

With TEST_ADMIN_DATABASE_URL as well (CI, security plan stage 6), the schema and the test's
own rows go through that login, and the code under test connects through TEST_DATABASE_URL
as aidjobs_app with only the grants in infra/roles/02_grants.sql, so a missing grant fails
here. TEST_EXPECTED_ROLE names the role the code must be connected as.
"""
import asyncio
import os
import socket
import sys
import threading
import time
import uuid
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

import pytest

_ALLOWED_HOSTS = frozenset({"localhost", "127.0.0.1"})
_PRODUCTION_VARIABLES = ("SUPABASE_DB_URL", "DATABASE_URL", "PGHOST", "PGHOSTADDR", "PGSERVICE")
_REFUSED_PARAMETERS = ("hostaddr", "service")


def check_test_url(url):
    """(host, port, database) of a local *_test database. Anything else is refused."""
    parsed = urlparse(url or "")
    database = parsed.path.lstrip("/")
    if (
        parsed.scheme not in ("postgresql", "postgres")
        or parsed.query
        or parsed.fragment
        or "," in parsed.netloc
        or parsed.hostname not in _ALLOWED_HOSTS
        or not database.endswith("_test")
    ):
        raise RuntimeError(
            "TEST_DATABASE_URL must be a local database whose name ends in _test, with no options"
        )
    return parsed.hostname, parsed.port or 5432, database


TEST_URL = os.getenv("TEST_DATABASE_URL", "")
if not TEST_URL:
    if os.getenv("CI") == "true":
        raise RuntimeError("TEST_DATABASE_URL is required in CI")
    pytest.skip("TEST_DATABASE_URL is not set", allow_module_level=True)
for _name in _PRODUCTION_VARIABLES:
    if os.getenv(_name):
        raise RuntimeError(f"{_name} must be unset when the ownership tests run")
_TARGET = check_test_url(TEST_URL)
ADMIN_URL = os.getenv("TEST_ADMIN_DATABASE_URL", "") or TEST_URL
if check_test_url(ADMIN_URL) != _TARGET:
    raise RuntimeError("TEST_ADMIN_DATABASE_URL must name the same local test database")
EXPECTED_ROLE = os.getenv("TEST_EXPECTED_ROLE", "")

import dotenv  # noqa: E402
import psycopg2  # noqa: E402
import psycopg2.errors  # noqa: E402
import psycopg2.extensions  # noqa: E402

_real_connect = psycopg2.connect


def _guarded_connect(dsn=None, connection_factory=None, cursor_factory=None, **kwargs):
    params = psycopg2.extensions.parse_dsn(dsn) if dsn else {}
    params.update(kwargs)
    if (
        any(name in params for name in _REFUSED_PARAMETERS)
        or "," in str(params.get("host", ""))
        or "," in str(params.get("port", ""))
        or params.get("host") not in _ALLOWED_HOSTS
        or int(params.get("port") or 5432) != _TARGET[1]
        or params.get("dbname") != _TARGET[2]
    ):
        raise RuntimeError("refused: only the local test database may be used here")
    return _real_connect(
        dsn, connection_factory=connection_factory, cursor_factory=cursor_factory, **kwargs
    )


psycopg2.connect = _guarded_connect

_real_socket_connect = socket.socket.connect
_real_socket_connect_ex = socket.socket.connect_ex


def _loopback(address):
    host = address[0] if isinstance(address, tuple) else address
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise RuntimeError("network access is closed in the ownership tests")


def _loopback_connect(self, address):
    _loopback(address)
    return _real_socket_connect(self, address)


def _loopback_connect_ex(self, address):
    _loopback(address)
    return _real_socket_connect_ex(self, address)


socket.socket.connect = _loopback_connect
socket.socket.connect_ex = _loopback_connect_ex
dotenv.load_dotenv = lambda *args, **kwargs: False

import crawler_v2.simple_crawler as simple_crawler_module  # noqa: E402
from contracts.identity import algorithm_a, algorithm_b  # noqa: E402
from contracts.persist import LOAD_COLUMNS, SUPPLEMENTARY_FIELDS  # noqa: E402
from contracts.run_ownership import OwnershipLost, save_failure_outcome  # noqa: E402
from contracts.upsert import VALIDATED_FIELDS  # noqa: E402
from crawler_v2.api_crawler import SimpleAPICrawler  # noqa: E402
from crawler_v2.rss_crawler import SimpleRSSCrawler  # noqa: E402
from crawler_v2.run_handle import RunHandle  # noqa: E402
from crawler_v2.simple_crawler import SimpleCrawler  # noqa: E402
from orchestrator import (  # noqa: E402
    EXPIRED_MESSAGE,
    MANUAL_MIN_REMAINING,
    NO_SLOT_MESSAGE,
    ORPHAN_MESSAGE,
    SHUTDOWN_MESSAGE,
    CrawlerOrchestrator,
    crawl_time_settings,
)
from tests.role_grants import statements_for_tables  # noqa: E402

SCHEMA = Path(__file__).parent / "sql" / "crawl_schema.sql"
STEP_SECONDS = 20
LIFECYCLE_COLUMNS = (
    "active_at_start", "listing_complete", "listing_expected", "listing_stop", "valid_count",
    "failed_saves", "unrecorded", "matched_active", "counted",
)


# ---------------------------------------------------------------------------
# Database helpers. Each call uses its own autocommit connection.
# ---------------------------------------------------------------------------


def _sql(query, params=None, url=None):
    conn = psycopg2.connect(url or ADMIN_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall() if cur.description else None
    finally:
        conn.close()


@pytest.fixture(scope="module")
def schema():
    _sql(SCHEMA.read_text(encoding="utf-8"))
    if ADMIN_URL != TEST_URL:
        # Production's grants, for the tables this database has; and, as in production since
        # 24 October 2026, no EXECUTE on the search trigger's function for PUBLIC.
        tables = _sql("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        existing = {r[0] for r in tables}
        for statement in statements_for_tables(existing):
            _sql(statement)
        _sql("REVOKE EXECUTE ON FUNCTION public.jobs_tsv_update() FROM PUBLIC")
    yield


@pytest.fixture
def db(schema):
    _sql("TRUNCATE jobs, crawl_logs, crawl_locks, sources CASCADE")
    yield


def _add_source(name="Example", *, status="active", failures=0, last_status=None, due=True,
                url=None):
    url = url or f"https://{name.lower().replace(' ', '-')}.example.org/careers"
    row = _sql(
        """
        INSERT INTO sources (org_name, careers_url, source_type, status, org_type,
                             crawl_frequency_days, consecutive_failures, last_crawl_status,
                             next_run_at)
        VALUES (%s, %s, 'html', %s, 'ngo', 3, %s, %s,
                CASE WHEN %s THEN NOW() - interval '1 hour' ELSE NOW() + interval '1 day' END)
        RETURNING id
        """,
        (name, url, status, failures, last_status, due),
    )
    return {
        "id": str(row[0][0]),
        "org_name": name,
        "careers_url": url,
        "source_type": "html",
        "org_type": "ngo",
        "crawl_frequency_days": 3,
        "consecutive_failures": failures,
        "consecutive_nochange": 0,
        "status": status,
    }


def _source_row(source_id):
    """The whole source row as text, to show that nothing was written."""
    return _sql("SELECT row_to_json(s)::text FROM sources s WHERE id = %s", (source_id,))[0][0]


def _source_fields(source_id):
    row = _sql(
        """
        SELECT status, consecutive_failures, last_crawl_status, next_run_at
        FROM sources WHERE id = %s
        """,
        (source_id,),
    )[0]
    return {"status": row[0], "failures": row[1], "last_status": row[2], "next_run_at": row[3]}


def _runs(source_id):
    return [
        (str(r[0]), r[1], r[2])
        for r in _sql(
            "SELECT id, status, message FROM crawl_logs WHERE source_id = %s ORDER BY ran_at, id",
            (source_id,),
        )
    ]


def _lock(source_id):
    rows = _sql("SELECT locked_at FROM crawl_locks WHERE source_id = %s", (source_id,))
    return rows[0][0] if rows else None


def _jobs_snapshot():
    return [r[0] for r in _sql("SELECT row_to_json(j)::text FROM jobs j ORDER BY id")]


def _job_count():
    return _sql("SELECT count(*) FROM jobs")[0][0]


def _age(source_id, seconds):
    """Move a source's lock, and the run that owns it, back in time together."""
    _sql(
        """
        UPDATE crawl_logs r SET ran_at = r.ran_at - make_interval(secs => %s)
        FROM crawl_locks l
        WHERE l.source_id = r.source_id AND r.ran_at = l.locked_at
          AND r.status = 'running' AND r.source_id = %s
        """,
        (seconds, source_id),
    )
    _sql(
        "UPDATE crawl_locks SET locked_at = locked_at - make_interval(secs => %s)"
        " WHERE source_id = %s",
        (seconds, source_id),
    )


# ---------------------------------------------------------------------------
# Orchestrator, crawler, job and thread helpers.
# ---------------------------------------------------------------------------


def _orch():
    orch = CrawlerOrchestrator(TEST_URL)
    orch.health_score = lambda source_id: None
    return orch


def _crawler(cls=SimpleCrawler):
    crawler = cls(TEST_URL)
    for name in ("extraction_logger", "html_storage", "quality_scorer"):
        if hasattr(crawler, name):
            setattr(crawler, name, None)
    return crawler


def _job(n, title=None):
    return {
        "title": title or f"Programme Officer {n}",
        "apply_url": f"https://example.org/jobs/{n}",
        "location_raw": "Nairobi, Kenya",
        "admitted": True,
    }


def _ok(found=0, inserted=0):
    return {
        "status": "ok",
        "message": f"Found {found} jobs",
        "counts": {"found": found, "inserted": inserted, "updated": 0, "skipped": 0},
        "duration_ms": 5,
    }


def _fail():
    return {
        "status": "fail",
        "message": "boom",
        "counts": {"found": 0, "inserted": 0, "updated": 0, "skipped": 0},
        "duration_ms": 5,
    }


class _Step(threading.Thread):
    def __init__(self, fn, *args, **kwargs):
        super().__init__(daemon=True)
        self.fn, self.args, self.kwargs = fn, args, kwargs
        self.result = None
        self.error = None

    def run(self):
        try:
            self.result = self.fn(*self.args, **self.kwargs)
        except BaseException as exc:  # recorded for the test to inspect
            self.error = exc


def _start(fn, *args, **kwargs):
    step = _Step(fn, *args, **kwargs)
    step.start()
    return step


def _join(step):
    step.join(STEP_SECONDS)
    assert not step.is_alive(), "a step did not finish: deadlock or hang"
    return step


def _pause_saves_after(monkeypatch, module, count, reached, release):
    """Hold the save's transaction open after its count-th job, until release is set."""
    real = module.persist_candidate
    seen = []

    def paused(*args, **kwargs):
        outcome = real(*args, **kwargs)
        seen.append(outcome)
        if len(seen) == count:
            reached.set()
            release.wait(STEP_SECONDS)
        return outcome

    monkeypatch.setattr(module, "persist_candidate", paused)


# ---------------------------------------------------------------------------
# The guard and the schema.
# ---------------------------------------------------------------------------


def test_the_guard_refuses_anything_but_the_local_test_database(db):
    for url in (
        "postgresql://postgres@db.example.supabase.co:5432/postgres",
        "postgresql://postgres@localhost:5432/postgres",
        "postgresql://postgres@10.0.0.5:5432/aidjobs_test",
        "postgresql://postgres@localhost:5432/aidjobs_test?hostaddr=10.0.0.5",
        "postgresql://postgres@localhost,db.example.org:5432/aidjobs_test",
        "mysql://localhost/aidjobs_test",
        "",
    ):
        with pytest.raises(RuntimeError):
            check_test_url(url)
    local = {"host": "localhost", "port": _TARGET[1], "dbname": _TARGET[2]}
    for refused in (
        "postgresql://postgres@db.example.org:5432/aidjobs_test",
        f"postgresql://postgres@localhost:{_TARGET[1]}/{_TARGET[2]}?hostaddr=10.0.0.5",
        f"postgresql://postgres@localhost:{_TARGET[1]}/{_TARGET[2]}?service=production",
    ):
        with pytest.raises(RuntimeError, match="refused"):
            psycopg2.connect(refused)
    for overrides in ({"dbname": "postgres"}, {"hostaddr": "10.0.0.5"}, {"host": "localhost,x"}):
        with pytest.raises(RuntimeError, match="refused"):
            psycopg2.connect(**{**local, **overrides})
    with pytest.raises(RuntimeError, match="network"):
        socket.create_connection(("93.184.216.34", 443), timeout=1)
    for name in _PRODUCTION_VARIABLES:
        assert not os.getenv(name)
    assert "main" not in sys.modules
    assert _sql("SHOW server_version_num")[0][0] >= "170000"


def test_the_crawl_runs_as_the_application_role_without_schema_changes(db):
    if not EXPECTED_ROLE:
        pytest.skip("TEST_EXPECTED_ROLE is not set")
    assert _sql("SELECT current_user", url=TEST_URL)[0][0] == EXPECTED_ROLE
    assert _sql("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
                url=TEST_URL)[0] == (False, True)
    for statement in ("CREATE TABLE public.not_allowed ()", "TRUNCATE jobs",
                      "ALTER TABLE jobs ADD COLUMN not_allowed text",
                      "DROP TRIGGER jobs_tsv_trigger ON jobs"):
        with pytest.raises(psycopg2.errors.InsufficientPrivilege):
            _sql(statement, url=TEST_URL)
    assert not _sql("SELECT has_function_privilege('public.jobs_tsv_update()', 'EXECUTE')",
                    url=TEST_URL)[0][0]


def test_the_schema_has_every_column_the_crawl_writes(db):
    def columns(table):
        return {
            r[0]
            for r in _sql(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_schema = 'public' AND table_name = %s",
                (table,),
            )
        }

    writer = set(LOAD_COLUMNS) | set(VALIDATED_FIELDS) | set(SUPPLEMENTARY_FIELDS)
    writer |= {"id", "canonical_hash", "source_id", "org_name", "status", "created_at",
               "fetched_at", "last_seen_at", "updated_at", "search_tsv"}
    assert writer <= columns("jobs")
    assert {"status", "crawl_frequency_days", "org_type", "consecutive_failures",
            "consecutive_nochange", "last_crawl_status", "last_crawl_message",
            "last_crawled_at", "next_run_at", "updated_at"} <= columns("sources")
    assert {"id", "source_id", "ran_at", "status", "message", "duration_ms", "found",
            "inserted", "updated", "skipped"} <= columns("crawl_logs")
    assert set(LIFECYCLE_COLUMNS) | {"observed", "expired", "returned"} <= columns("crawl_logs")
    assert "expired_at" in columns("jobs")
    assert columns("crawl_locks") == {"source_id", "locked_at"}


def test_the_lock_lifetime_must_exceed_the_limit_plus_six_minutes(monkeypatch):
    monkeypatch.setenv("CRAWL_TIME_LIMIT_MINUTES", "15")
    monkeypatch.setenv("CRAWL_LOCK_TTL_MINUTES", "21")
    with pytest.raises(ValueError):
        crawl_time_settings()
    monkeypatch.setenv("CRAWL_LOCK_TTL_MINUTES", "25")
    assert crawl_time_settings() == (timedelta(minutes=15), timedelta(minutes=25))


# ---------------------------------------------------------------------------
# Acquire and ownership.
# ---------------------------------------------------------------------------


def test_two_acquisitions_at_once_give_one_token(db):
    source = _add_source()
    barrier = threading.Barrier(2)

    def acquire(orch):
        barrier.wait()
        return orch._begin(source["id"], False)

    first, second = _start(acquire, _orch()), _start(acquire, _orch())
    results = [_join(first).result, _join(second).result]
    assert first.error is None and second.error is None
    started = [r for r in results if r[1]]
    joined = [r for r in results if not r[1]]
    assert len(started) == 1 and len(joined) == 1
    assert joined[0][0] == started[0][0]
    assert [status for _id, status, _m in _runs(source["id"])] == ["running"]


def test_the_owning_runs_ran_at_equals_its_locks_locked_at(db):
    source = _add_source()
    run_id, started = _orch()._begin(source["id"], False)
    assert started
    rows = _sql(
        """
        SELECT r.ran_at = l.locked_at FROM crawl_logs r
        JOIN crawl_locks l ON l.source_id = r.source_id WHERE r.id = %s
        """,
        (run_id,),
    )
    assert rows == [(True,)]


@pytest.mark.parametrize("cls", [SimpleCrawler, SimpleRSSCrawler, SimpleAPICrawler])
def test_a_save_without_a_token_or_with_a_foreign_one_writes_nothing(db, cls):
    orch = _orch()
    mine = _add_source("Mine")
    other = _add_source("Other")
    my_run, _ = orch._begin(mine["id"], False)
    other_run, _ = orch._begin(other["id"], False)
    crawler = _crawler(cls)
    for token in (None, other_run, str(uuid.uuid4())):
        with pytest.raises(OwnershipLost):
            crawler.save_jobs([_job(1)], mine["id"], "Mine", run_token=token)
    assert orch._finish(mine["id"], my_run, _ok(), mode="normal", health=None) is True
    with pytest.raises(OwnershipLost):
        crawler.save_jobs([_job(1)], mine["id"], "Mine", run_token=my_run)
    assert _job_count() == 0


def test_a_save_racing_a_takeover_completes_and_the_stale_workers_next_save_is_refused(
    db, monkeypatch
):
    source = _add_source()
    old = _orch()
    run_id, _ = old._begin(source["id"], False)
    _age(source["id"], old.lock_lifetime.total_seconds() + 60)
    reached, release = threading.Event(), threading.Event()
    _pause_saves_after(monkeypatch, simple_crawler_module, 1, reached, release)
    crawler = _crawler()

    save = _start(crawler.save_jobs, [_job(1), _job(2)], source["id"], "Example",
                  run_token=run_id)
    assert reached.wait(STEP_SECONDS)
    takeover = _start(_orch()._take_over, source["id"], None)
    time.sleep(0.5)
    assert takeover.is_alive(), "the takeover must wait for the save in progress"
    release.set()

    assert _join(save).error is None
    assert save.result["inserted"] == 2
    assert _join(takeover).result is True
    assert _runs(source["id"]) == [(run_id, "fail", EXPIRED_MESSAGE)]
    assert _source_fields(source["id"])["failures"] == 1
    with pytest.raises(OwnershipLost):
        crawler.save_jobs([_job(3)], source["id"], "Example", run_token=run_id)
    assert _job_count() == 2


def test_a_stale_workers_save_finish_and_release_change_nothing(db):
    source = _add_source()
    old = _orch()
    stale_run, _ = old._begin(source["id"], False)
    _age(source["id"], old.lock_lifetime.total_seconds() + 60)
    new = _orch()
    new_run, started = new._begin(source["id"], False)
    assert started and new_run != stale_run
    before = (_source_row(source["id"]), _lock(source["id"]), _runs(source["id"]))

    with pytest.raises(OwnershipLost):
        _crawler().save_jobs([_job(1)], source["id"], "Example", run_token=stale_run)
    assert old._finish(source["id"], stale_run, _ok(), mode="normal", health=None) is False
    assert old._finish(
        source["id"], stale_run, _fail(), mode="interrupted", health=None
    ) is False

    assert (_source_row(source["id"]), _lock(source["id"]), _runs(source["id"])) == before
    assert (new_run, "running", "queued") in before[2]
    assert _job_count() == 0


# ---------------------------------------------------------------------------
# Counting: exactly one failure per lost run.
# ---------------------------------------------------------------------------


def test_a_timeout_then_recovery_counts_one_failure(db):
    source = _add_source()

    async def scenario():
        orch = _orch()
        orch.time_limit = timedelta(seconds=0.3)

        async def crawl(src, run):
            await asyncio.sleep(10)

        orch.crawl_source = crawl
        run_id, _ = await orch.begin_run(source)
        await orch.execute_run(source, run_id)
        return run_id

    run_id = asyncio.run(scenario())
    (only,) = _runs(source["id"])
    assert only[0] == run_id and only[1] == "fail" and only[2].startswith("Timed out")
    assert _lock(source["id"]) is None
    assert _orch()._recover_once() == {"expired_locks": 0, "orphaned_runs": 0}
    assert _source_fields(source["id"])["failures"] == 1


def test_a_lock_expiry_then_a_late_finish_counts_one_failure(db):
    source = _add_source()
    owner = _orch()
    run_id, _ = owner._begin(source["id"], False)
    _age(source["id"], owner.lock_lifetime.total_seconds() + 60)
    assert _orch()._recover_once() == {"expired_locks": 1, "orphaned_runs": 0}
    assert owner._finish(source["id"], run_id, _ok(), mode="normal", health=None) is False
    assert _runs(source["id"]) == [(run_id, "fail", EXPIRED_MESSAGE)]
    assert _source_fields(source["id"])["failures"] == 1
    assert _lock(source["id"]) is None


def test_two_recoveries_at_once_count_one_failure(db):
    source = _add_source()
    owner = _orch()
    run_id, _ = owner._begin(source["id"], False)
    _age(source["id"], owner.lock_lifetime.total_seconds() + 60)
    barrier = threading.Barrier(2)

    def recover(orch):
        barrier.wait()
        return orch._recover_once()

    first, second = _start(recover, _orch()), _start(recover, _orch())
    totals = [_join(first).result, _join(second).result]
    assert first.error is None and second.error is None
    assert sum(t["expired_locks"] for t in totals) == 1
    assert _runs(source["id"]) == [(run_id, "fail", EXPIRED_MESSAGE)]
    assert _source_fields(source["id"])["failures"] == 1


def test_a_hard_kill_is_recovered_after_a_shortened_lifetime_and_counted_once(db):
    source = _add_source()
    killed = _orch()
    run_id, _ = killed._begin(source["id"], False)
    rescuer = _orch()
    rescuer.lock_lifetime = timedelta(seconds=1)
    assert rescuer._recover_once()["expired_locks"] == 0
    time.sleep(1.5)
    assert rescuer._recover_once()["expired_locks"] == 1
    assert rescuer._recover_once()["expired_locks"] == 0
    assert _runs(source["id"]) == [(run_id, "fail", EXPIRED_MESSAGE)]
    assert _source_fields(source["id"])["failures"] == 1
    assert _lock(source["id"]) is None


# ---------------------------------------------------------------------------
# Recovery leaves live crawls alone.
# ---------------------------------------------------------------------------


def test_recovery_leaves_a_live_lock_alone_including_an_overlapping_instance(db):
    source = _add_source()
    old_instance = _orch()
    run_id, _ = old_instance._begin(source["id"], False)
    before = (_source_row(source["id"]), _lock(source["id"]), _runs(source["id"]))
    new_instance = _orch()
    assert new_instance._recover_once() == {"expired_locks": 0, "orphaned_runs": 0}
    assert new_instance._begin(source["id"], False) == (run_id, False)
    assert (_source_row(source["id"]), _lock(source["id"]), _runs(source["id"])) == before


def test_a_slow_but_live_crawl_keeps_its_ownership_up_to_the_limit(db):
    source = _add_source()
    orch = _orch()
    run_id, _ = orch._begin(source["id"], False)
    _age(source["id"], (orch.time_limit + timedelta(minutes=5)).total_seconds())
    assert _orch()._recover_once() == {"expired_locks": 0, "orphaned_runs": 0}
    assert _orch()._begin(source["id"], False) == (run_id, False)
    counts = _crawler().save_jobs([_job(1)], source["id"], "Example", run_token=run_id)
    assert counts["inserted"] == 1
    assert orch._finish(source["id"], run_id, _ok(1, 1), mode="normal", health=None) is True


def test_an_orphaned_running_row_beside_a_live_run_is_marked_interrupted(db):
    source = _add_source()
    orch = _orch()
    run_id, _ = orch._begin(source["id"], False)
    old_orphan = _sql(
        """
        INSERT INTO crawl_logs (source_id, ran_at, status, message)
        VALUES (%s, NOW() - interval '10 minutes', 'running', 'queued') RETURNING id
        """,
        (source["id"],),
    )[0][0]
    young_orphan = _sql(
        """
        INSERT INTO crawl_logs (source_id, ran_at, status, message)
        VALUES (%s, NOW() - interval '30 seconds', 'running', 'queued') RETURNING id
        """,
        (source["id"],),
    )[0][0]
    source_before, lock_before = _source_row(source["id"]), _lock(source["id"])

    assert orch._recover_once() == {"expired_locks": 0, "orphaned_runs": 1}
    runs = {run[0]: run[1:] for run in _runs(source["id"])}
    assert runs[str(old_orphan)] == ("interrupted", ORPHAN_MESSAGE)
    assert runs[str(young_orphan)] == ("running", "queued")
    assert runs[run_id] == ("running", "queued")
    assert (_source_row(source["id"]), _lock(source["id"])) == (source_before, lock_before)


# ---------------------------------------------------------------------------
# Time limit, shutdown, and the manual run's slot.
# ---------------------------------------------------------------------------


def test_a_timed_out_run_waits_for_its_save_then_records_fail_once(db, monkeypatch):
    source = _add_source()
    reached, release = threading.Event(), threading.Event()
    _pause_saves_after(monkeypatch, simple_crawler_module, 1, reached, release)

    def release_later():
        reached.wait(STEP_SECONDS)
        time.sleep(1.2)
        release.set()

    _start(release_later)
    crawler = _crawler()
    save_done = threading.Event()
    finish_saw_save_done = []

    def save_then_mark(*args, **kwargs):
        try:
            return crawler.save_jobs(*args, **kwargs)
        finally:
            save_done.set()

    async def scenario():
        orch = _orch()
        orch.time_limit = timedelta(seconds=0.5)
        real_finish = orch._finish

        def finish(*args, **kwargs):
            finish_saw_save_done.append(save_done.is_set())
            return real_finish(*args, **kwargs)

        orch._finish = finish

        async def crawl(src, run):
            return await run.save(save_then_mark, [_job(1), _job(2)], src["id"], "Example")

        orch.crawl_source = crawl
        run_id, _ = await orch.begin_run(source)
        await orch.execute_run(source, run_id)
        return run_id

    run_id = asyncio.run(scenario())
    assert reached.is_set()
    assert finish_saw_save_done == [True], "the finish must start only after the save ended"
    (only,) = _runs(source["id"])
    assert only[0] == run_id and only[1] == "fail" and only[2].startswith("Timed out")
    recorded = _sql("SELECT inserted, duration_ms FROM crawl_logs WHERE id = %s", (run_id,))[0]
    assert recorded[0] == 2, "a timed-out run records what it saved"
    assert recorded[1] >= 500
    assert _job_count() == 2
    assert _source_fields(source["id"])["failures"] == 1
    assert _lock(source["id"]) is None


def test_a_timeout_whose_finish_fails_twice_is_counted_once_by_recovery(db):
    source = _add_source()

    async def scenario():
        orch = _orch()
        orch.time_limit = timedelta(seconds=0.2)
        attempts = []

        def broken(*args, **kwargs):
            attempts.append(1)
            raise RuntimeError("database unreachable")

        async def crawl(src, run):
            await asyncio.sleep(10)

        orch._finish = broken
        orch.crawl_source = crawl
        run_id, _ = await orch.begin_run(source)
        await orch.execute_run(source, run_id)
        return orch, run_id, len(attempts)

    orch, run_id, attempts = asyncio.run(scenario())
    assert attempts == 2
    assert _runs(source["id"]) == [(run_id, "running", "queued")]
    assert _lock(source["id"]) is not None
    _age(source["id"], orch.lock_lifetime.total_seconds() + 60)
    assert _orch()._recover_once()["expired_locks"] == 1
    assert _orch()._recover_once()["expired_locks"] == 0
    assert _runs(source["id"]) == [(run_id, "fail", EXPIRED_MESSAGE)]
    assert _source_fields(source["id"])["failures"] == 1


def test_a_shutdown_during_the_lock_acquire_closes_the_run_and_writes_nothing(db):
    source = _add_source()
    before = _source_row(source["id"])
    committed, release = threading.Event(), threading.Event()

    async def scenario():
        orch = _orch()
        real_acquire = orch._acquire

        def slow_acquire(*args, **kwargs):
            result = real_acquire(*args, **kwargs)
            committed.set()
            release.wait(STEP_SECONDS)
            return result

        async def crawl(src, run):
            raise AssertionError("no crawl may start")

        orch._acquire = slow_acquire
        orch.crawl_source = crawl
        orch._track(orch.run_source_with_lock(source))
        await asyncio.to_thread(committed.wait, STEP_SECONDS)
        assert _lock(source["id"]) is not None
        threading.Timer(0.3, release.set).start()
        await orch.stop()

    asyncio.run(scenario())
    (only,) = _runs(source["id"])
    assert only[1:] == ("interrupted", SHUTDOWN_MESSAGE)
    assert _lock(source["id"]) is None
    assert _source_row(source["id"]) == before


def test_a_shutdown_while_a_scheduled_run_waits_for_a_slot_writes_nothing(db):
    source = _add_source()
    before = _source_row(source["id"])

    async def scenario():
        orch = _orch()
        orch.semaphore = asyncio.Semaphore(0)
        orch._track(orch.run_source_with_lock(source))
        await asyncio.sleep(0.2)
        await orch.stop()

    asyncio.run(scenario())
    assert _runs(source["id"]) == []
    assert _lock(source["id"]) is None
    assert _source_row(source["id"]) == before


def test_the_run_due_route_returns_at_once_with_data_queued(db, monkeypatch):
    from app import crawler_admin

    sources = [_add_source(f"Route {n}") for n in range(2)]

    async def scenario():
        orch = _orch()
        gate = asyncio.Event()

        async def crawl(src, run):
            await gate.wait()
            return _ok()

        orch.crawl_source = crawl
        monkeypatch.setattr(crawler_admin, "get_db_url", lambda: TEST_URL)
        monkeypatch.setattr(crawler_admin, "get_orchestrator", lambda url: orch)
        response = await asyncio.wait_for(crawler_admin.run_due(admin=None), 5)
        gate.set()
        await asyncio.wait_for(asyncio.gather(*list(orch._tasks)), STEP_SECONDS)
        return response

    response = asyncio.run(scenario())
    assert response == {"status": "ok", "data": {"queued": 2}}
    for source in sources:
        assert [r[1] for r in _runs(source["id"])] == ["ok"]


def _shutdown_during_a_crawl(source):
    async def scenario():
        orch = _orch()
        crawling = asyncio.Event()

        async def crawl(src, run):
            crawling.set()
            await asyncio.sleep(60)

        orch.crawl_source = crawl
        run_id, started = await orch.start_manual_run(source)
        assert started
        await asyncio.wait_for(crawling.wait(), STEP_SECONDS)
        stopping = time.monotonic()
        await orch.stop()
        # Recorded by stop() itself, before asyncio.run's teardown could cancel anything.
        assert time.monotonic() - stopping < 5, "stop() must not wait out its deadline"
        runs = await asyncio.to_thread(_runs, source["id"])
        assert (run_id, "interrupted", SHUTDOWN_MESSAGE) in runs
        assert await asyncio.to_thread(_lock, source["id"]) is None
        assert not orch._tasks and not orch._closing
        return run_id

    return asyncio.run(scenario())


def test_a_shutdown_records_interrupted_uncounted_first_and_counted_second(db):
    source = _add_source(failures=1, last_status="fail")
    before = _source_fields(source["id"])

    first = _shutdown_during_a_crawl(source)
    after_first = _source_fields(source["id"])
    assert (first, "interrupted", SHUTDOWN_MESSAGE) in _runs(source["id"])
    assert after_first["last_status"] == "interrupted"
    assert after_first["failures"] == before["failures"]
    assert after_first["next_run_at"] == before["next_run_at"]
    assert _lock(source["id"]) is None

    second = _shutdown_during_a_crawl(source)
    after_second = _source_fields(source["id"])
    assert (second, "interrupted", SHUTDOWN_MESSAGE) in _runs(source["id"])
    assert after_second["failures"] == before["failures"] + 1
    assert after_second["next_run_at"] != before["next_run_at"]


@pytest.mark.parametrize("case", ["no slot in time", "under five minutes left"])
def test_a_manual_run_without_a_usable_slot_ends_interrupted_and_writes_nothing(db, case):
    source = _add_source()
    before = _source_row(source["id"])
    crawled = []

    async def scenario():
        orch = _orch()
        if case == "no slot in time":
            orch.time_limit = MANUAL_MIN_REMAINING + timedelta(seconds=0.5)
            orch.semaphore = asyncio.Semaphore(0)
        else:
            orch.time_limit = MANUAL_MIN_REMAINING - timedelta(minutes=1)

        async def crawl(src, run):
            crawled.append(src["id"])
            return _ok()

        orch.crawl_source = crawl
        run_id, started = await orch.start_manual_run(source)
        assert started
        await asyncio.wait_for(asyncio.gather(*list(orch._tasks)), STEP_SECONDS)
        return run_id

    run_id = asyncio.run(scenario())
    assert crawled == []
    assert _runs(source["id"]) == [(run_id, "interrupted", NO_SLOT_MESSAGE)]
    assert _lock(source["id"]) is None
    assert _source_row(source["id"]) == before


# ---------------------------------------------------------------------------
# Forced interleavings.
# ---------------------------------------------------------------------------


def test_a_takeover_waiting_on_a_finish_in_progress_changes_nothing(db):
    source = _add_source()
    owner = _orch()
    run_id, _ = owner._begin(source["id"], False)
    reached, release = threading.Event(), threading.Event()
    real_update = owner._update_source

    def held(cur, source_id, **kwargs):
        reached.set()
        release.wait(STEP_SECONDS)
        return real_update(cur, source_id, **kwargs)

    owner._update_source = held
    finish = _start(owner._finish, source["id"], run_id, _ok(), mode="normal", health=None)
    assert reached.wait(STEP_SECONDS)
    other = _orch()
    other.lock_lifetime = timedelta(0)
    takeover = _start(other._take_over, source["id"], None)
    time.sleep(0.5)
    release.set()
    assert _join(finish).result is True
    assert _join(takeover).result is False
    assert _runs(source["id"]) == [(run_id, "ok", "Found 0 jobs")]
    assert _source_fields(source["id"])["failures"] == 0
    assert _lock(source["id"]) is None


def test_a_finish_waiting_on_a_takeover_in_progress_writes_nothing(db):
    source = _add_source()
    owner = _orch()
    run_id, _ = owner._begin(source["id"], False)
    _age(source["id"], owner.lock_lifetime.total_seconds() + 60)
    rescuer = _orch()
    reached, release = threading.Event(), threading.Event()
    real_update = rescuer._update_source

    def held(cur, source_id, **kwargs):
        reached.set()
        release.wait(STEP_SECONDS)
        return real_update(cur, source_id, **kwargs)

    rescuer._update_source = held
    takeover = _start(rescuer._take_over, source["id"], None)
    assert reached.wait(STEP_SECONDS)
    finish = _start(owner._finish, source["id"], run_id, _ok(), mode="normal", health=None)
    time.sleep(0.5)
    release.set()
    assert _join(takeover).result is True
    assert _join(finish).result is False
    assert _runs(source["id"]) == [(run_id, "fail", EXPIRED_MESSAGE)]
    assert _source_fields(source["id"])["failures"] == 1


def test_a_save_deadlocked_with_an_admin_soft_delete_loses_only_that_job(db, monkeypatch):
    source = _add_source()
    orch = _orch()
    crawler = _crawler()
    first_run, _ = orch._begin(source["id"], False)
    crawler.save_jobs([_job(1), _job(2)], source["id"], "Example", run_token=first_run)
    orch._finish(source["id"], first_run, _ok(2, 2), mode="normal", health=None)
    ids = {
        title: str(job_id)
        for job_id, title in _sql("SELECT id, title FROM jobs ORDER BY title")
    }
    first_id, second_id = ids["Programme Officer 1"], ids["Programme Officer 2"]

    admin = psycopg2.connect(ADMIN_URL)  # deadlock_timeout is a superuser's setting
    admin_cur = admin.cursor()
    # The save's deadlock check fires first, so the save is the transaction PostgreSQL ends.
    admin_cur.execute("SET deadlock_timeout = '10s'")
    admin_cur.execute("UPDATE jobs SET deleted_at = NOW() WHERE id = %s", (second_id,))

    reached, release = threading.Event(), threading.Event()
    _pause_saves_after(monkeypatch, simple_crawler_module, 1, reached, release)
    run_id, _ = orch._begin(source["id"], False)
    save = _start(crawler.save_jobs, [_job(1), _job(2)], source["id"], "Example",
                  run_token=run_id)
    assert reached.wait(STEP_SECONDS)

    def admin_second_write():
        admin_cur.execute("UPDATE jobs SET deleted_at = NOW() WHERE id = %s", (first_id,))
        admin.commit()

    admin_step = _start(admin_second_write)
    time.sleep(0.3)
    release.set()
    _join(save)
    _join(admin_step)
    admin.close()

    assert save.error is None and admin_step.error is None
    assert save.result["failed"] == 1
    assert save_failure_outcome("ok", "Found 2 jobs", save.result)[0] == "warn"
    deleted = _sql("SELECT count(*) FROM jobs WHERE deleted_at IS NOT NULL")[0][0]
    assert deleted == 2


def test_job_rows_stay_identical_on_every_failure_path(db, monkeypatch):
    source = _add_source()
    orch = _orch()
    crawler = _crawler()
    run_id, _ = orch._begin(source["id"], False)
    crawler.save_jobs([_job(1), _job(2)], source["id"], "Example", run_token=run_id)
    snapshot = _jobs_snapshot()
    assert len(snapshot) == 2

    _age(source["id"], orch.lock_lifetime.total_seconds() + 60)
    assert _orch()._recover_once()["expired_locks"] == 1
    assert _jobs_snapshot() == snapshot
    with pytest.raises(OwnershipLost):
        crawler.save_jobs([_job(1, "Changed title")], source["id"], "Example", run_token=run_id)
    assert orch._finish(source["id"], run_id, _ok(), mode="normal", health=None) is False
    assert _jobs_snapshot() == snapshot

    stuck, _ = orch._begin(source["id"], False)
    _age(source["id"], orch.lock_lifetime.total_seconds() + 60)
    assert _orch()._begin(source["id"], False)[1] is True
    assert _jobs_snapshot() == snapshot

    async def no_slot():
        manual = _orch()
        manual.time_limit = MANUAL_MIN_REMAINING - timedelta(minutes=1)
        await manual.finish_run(source, _lock_owner(source["id"]), _ok())
        await manual.start_manual_run(source)
        await asyncio.gather(*list(manual._tasks))

    asyncio.run(no_slot())
    assert _jobs_snapshot() == snapshot
    _shutdown_during_a_crawl(source)
    assert _jobs_snapshot() == snapshot
    assert stuck in [run[0] for run in _runs(source["id"])]


def _lock_owner(source_id):
    rows = _sql(
        """
        SELECT r.id FROM crawl_logs r JOIN crawl_locks l ON l.source_id = r.source_id
        WHERE r.source_id = %s AND r.status = 'running' AND r.ran_at = l.locked_at
        """,
        (source_id,),
    )
    return str(rows[0][0])


# ---------------------------------------------------------------------------
# Issue #5: a database error on one job.
# ---------------------------------------------------------------------------


@pytest.fixture
def failing_titles(db):
    _sql(
        """
        CREATE OR REPLACE FUNCTION test_reject_broken() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.title LIKE 'Broken%' THEN
                RAISE EXCEPTION 'test failure for %', NEW.title;
            END IF;
            RETURN NEW;
        END $$
        """
    )
    _sql(
        "CREATE TRIGGER test_reject_broken BEFORE INSERT OR UPDATE ON jobs"
        " FOR EACH ROW EXECUTE FUNCTION test_reject_broken()"
    )
    yield
    _sql("DROP TRIGGER IF EXISTS test_reject_broken ON jobs")
    _sql("DROP FUNCTION IF EXISTS test_reject_broken()")


@pytest.mark.parametrize("cls", [SimpleCrawler, SimpleRSSCrawler, SimpleAPICrawler])
def test_one_failing_job_rolls_back_only_itself(failing_titles, cls):
    source = _add_source()
    run_id, _ = _orch()._begin(source["id"], False)
    jobs = [_job(1), _job(2, "Broken Officer"), _job(3)]
    counts = _crawler(cls).save_jobs(jobs, source["id"], "Example", run_token=run_id)
    assert counts["inserted"] == 2
    assert counts["failed"] == 1
    assert counts["validated"] == 3
    titles = sorted(r[0] for r in _sql("SELECT title FROM jobs"))
    assert titles == ["Programme Officer 1", "Programme Officer 3"]
    status, message = save_failure_outcome("ok", "Found 3 jobs", counts)
    assert status == "warn"
    assert "1 of 3 jobs failed to save" in message


@pytest.mark.parametrize("cls", [SimpleCrawler, SimpleRSSCrawler, SimpleAPICrawler])
def test_a_save_where_every_job_fails_is_a_failure(failing_titles, cls):
    source = _add_source()
    run_id, _ = _orch()._begin(source["id"], False)
    jobs = [_job(1, "Broken One"), _job(2, "Broken Two")]
    counts = _crawler(cls).save_jobs(jobs, source["id"], "Example", run_token=run_id)
    assert counts["failed"] == 2
    assert _job_count() == 0
    assert save_failure_outcome("ok", "Found 2 jobs", counts)[0] == "fail"


# ---------------------------------------------------------------------------
# Source status is respected.
# ---------------------------------------------------------------------------


def _manual_run(source, crawl):
    async def scenario():
        orch = _orch()
        orch.crawl_source = crawl
        run_id, started = await orch.start_manual_run(source)
        assert started
        await asyncio.wait_for(asyncio.gather(*list(orch._tasks)), STEP_SECONDS)
        return run_id

    return asyncio.run(scenario())


def test_a_manual_run_of_a_paused_source_leaves_it_paused(db):
    source = _add_source(status="paused", failures=4)

    async def failing(src, run):
        return _fail()

    _manual_run(source, failing)
    fields = _source_fields(source["id"])
    assert fields["status"] == "paused"
    assert fields["failures"] == 5

    async def succeeding(src, run):
        return _ok()

    _manual_run(source, succeeding)
    assert _source_fields(source["id"])["status"] == "paused"


def test_a_source_soft_deleted_mid_crawl_stays_deleted(db):
    source = _add_source()

    async def deleted_during(src, run):
        await asyncio.to_thread(
            _sql, "UPDATE sources SET status = 'deleted' WHERE id = %s", (src["id"],)
        )
        return _ok()

    run_id = _manual_run(source, deleted_during)
    assert _source_fields(source["id"])["status"] == "deleted"
    assert _runs(source["id"]) == [(run_id, "ok", "Found 0 jobs")]


# ---------------------------------------------------------------------------
# Scheduling: slots, the queued set, and run_due.
# ---------------------------------------------------------------------------


def test_scheduled_crawls_share_three_slots_and_no_queued_run_is_taken_over(db):
    sources = [_add_source(f"Due {n}") for n in range(5)]

    async def scenario():
        orch = _orch()
        gate = asyncio.Event()
        active, peak, crawled = 0, 0, []

        async def crawl(src, run):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            crawled.append(src["id"])
            await gate.wait()
            await asyncio.sleep(0.1)
            active -= 1
            return _ok()

        orch.crawl_source = crawl
        started = time.monotonic()
        queued = await orch.run_due_sources_once(wait=False)
        returned_after = time.monotonic() - started
        round_result = await orch.run_due_sources_once(wait=False)
        await asyncio.sleep(0.5)
        gate.set()
        await asyncio.wait_for(asyncio.gather(*list(orch._tasks)), STEP_SECONDS)
        return queued, round_result, returned_after, peak, crawled

    queued, round_result, returned_after, peak, crawled = asyncio.run(scenario())
    assert queued == {"queued": 5}
    assert round_result == {"queued": 0}
    assert returned_after < 2
    assert peak == 3
    assert sorted(crawled) == sorted(s["id"] for s in sources)
    for source in sources:
        assert [r[1] for r in _runs(source["id"])] == ["ok"]
        assert _lock(source["id"]) is None


def test_a_manual_run_while_queued_and_a_pause_while_queued(db):
    blocker = _add_source("Blocker", due=False)
    wanted = _add_source("Wanted")
    paused = _add_source("Paused")

    async def scenario():
        orch = _orch()
        orch.semaphore = asyncio.Semaphore(1)
        gate = asyncio.Event()
        crawled = []

        async def crawl(src, run):
            crawled.append(src["org_name"])
            if src["org_name"] == "Blocker":
                await gate.wait()
            return _ok()

        orch.crawl_source = crawl
        await orch.start_manual_run(blocker)
        await asyncio.sleep(0.2)
        assert await orch.run_due_sources_once(wait=False) == {"queued": 2}
        manual_id, started = await orch.start_manual_run(wanted)
        assert started
        await asyncio.to_thread(
            _sql, "UPDATE sources SET status = 'paused' WHERE id = %s", (paused["id"],)
        )
        gate.set()
        await asyncio.wait_for(asyncio.gather(*list(orch._tasks)), STEP_SECONDS)
        return manual_id, crawled

    manual_id, crawled = asyncio.run(scenario())
    assert crawled == ["Blocker", "Wanted"]
    assert _runs(wanted["id"]) == [(manual_id, "ok", "Found 0 jobs")]
    assert _runs(paused["id"]) == []
    assert _source_fields(paused["id"])["status"] == "paused"


# ---------------------------------------------------------------------------
# One crawler instance, two crawls at once.
# ---------------------------------------------------------------------------


class _RecordingLogger:
    def __init__(self):
        self.extractions = {}

    def log_extraction(self, *, url, source_id, extracted_fields=None, **kwargs):
        self.extractions[source_id] = extracted_fields or {}

    def log_failed_insert(self, **kwargs):
        return None


def test_two_html_crawls_at_once_keep_their_own_listing_reports(db):
    unicef = _add_source("UNICEF", url="https://jobs.unicef.org/en-us/listing/")
    icrc = _add_source("ICRC", url="https://careers.icrc.org/go/Global-Opportunities/8821501/")
    report = {"pages": 3, "expected": 3, "complete": True, "stop": "no more pages"}

    async def scenario():
        orch = _orch()
        crawler = orch.html_crawler
        listing_gate, detail_gate = asyncio.Event(), asyncio.Event()
        logger = _RecordingLogger()
        crawler.extraction_logger = logger
        crawler.html_storage = None
        crawler.quality_scorer = None

        async def fetch_page(url):
            return 200, "<html><body>listing</body></html>", ""

        async def pageup_reader(html, url):
            if "unicef" not in url:
                return [], None
            await listing_gate.wait()
            return [_job(1)], report

        async def detail_page(job, base_url):
            await detail_gate.wait()
            return job

        crawler._fetch_page = fetch_page
        crawler._pageup_listing_jobs = pageup_reader
        crawler.extract_jobs_from_html = lambda html, url: [_job(2)]
        crawler.enrich_job_from_detail_page = detail_page

        unicef_run, _ = await orch.begin_run(unicef)
        icrc_run, _ = await orch.begin_run(icrc)
        unicef_task = asyncio.ensure_future(
            crawler.crawl_source(unicef, RunHandle(unicef_run, unicef["id"]))
        )
        icrc_task = asyncio.ensure_future(
            crawler.crawl_source(icrc, RunHandle(icrc_run, icrc["id"]))
        )
        await asyncio.sleep(0.2)
        listing_gate.set()
        await asyncio.sleep(0.2)
        detail_gate.set()
        results = await asyncio.wait_for(asyncio.gather(unicef_task, icrc_task), STEP_SECONDS)
        return results, logger.extractions

    (unicef_result, icrc_result), extractions = asyncio.run(scenario())
    assert "listing complete: 3 pages" in unicef_result["message"]
    assert icrc_result["message"] == "Found 1 jobs"
    assert extractions[unicef["id"]]["listing_pages"] == 3
    assert "listing_pages" not in extractions[icrc["id"]]


# ---------------------------------------------------------------------------
# Guards named by the final review as having no test of their own.
# ---------------------------------------------------------------------------


def test_a_takeover_based_on_an_old_reading_leaves_a_newer_live_run_alone(db):
    """A saw the lock expired; B took it over and started a new run; A's takeover must refuse."""
    source = _add_source()
    first, second = _orch(), _orch()
    first._begin(source["id"], False)
    _age(source["id"], first.lock_lifetime.total_seconds() + 60)
    assert first._read_lock(source["id"])[1] is True
    new_run, started = second._begin(source["id"], False)
    assert started
    before = (_source_row(source["id"]), _lock(source["id"]), _runs(source["id"]))

    assert first._take_over(source["id"], None) is False
    assert (_source_row(source["id"]), _lock(source["id"]), _runs(source["id"])) == before
    assert (new_run, "running", "queued") in before[2]


def test_an_expired_lock_with_no_owning_run_is_removed_without_counting(db):
    source = _add_source()
    _sql(
        "INSERT INTO crawl_locks (source_id, locked_at) VALUES (%s, NOW() - interval '1 day')",
        (source["id"],),
    )
    before = _source_row(source["id"])
    assert _orch()._recover_once() == {"expired_locks": 1, "orphaned_runs": 0}
    assert _lock(source["id"]) is None
    assert _source_row(source["id"]) == before
    run_id, started = _orch()._begin(source["id"], False)
    assert started and run_id


def test_an_orphans_finish_never_deletes_the_live_runs_lock(db):
    source = _add_source()
    orch = _orch()
    live_run, _ = orch._begin(source["id"], False)
    orphan = str(_sql(
        """
        INSERT INTO crawl_logs (source_id, ran_at, status, message)
        VALUES (%s, NOW() - interval '1 minute', 'running', 'queued') RETURNING id
        """,
        (source["id"],),
    )[0][0])
    lock_before = _lock(source["id"])
    orch._finish(source["id"], orphan, _ok(), mode="no_slot", health=None)
    assert _lock(source["id"]) == lock_before
    assert (live_run, "running", "queued") in _runs(source["id"])
    assert orch._finish(source["id"], live_run, _ok(), mode="normal", health=None) is True
    assert _lock(source["id"]) is None


def test_a_takeover_fails_only_the_owner_and_interrupts_the_orphans(db):
    source = _add_source()
    orch = _orch()
    owner, _ = orch._begin(source["id"], False)
    orphans = [
        str(_sql(
            """
            INSERT INTO crawl_logs (source_id, ran_at, status, message)
            VALUES (%s, NOW() - interval '1 minute', 'running', 'queued') RETURNING id
            """,
            (source["id"],),
        )[0][0])
        for _ in range(3)
    ]
    _age(source["id"], orch.lock_lifetime.total_seconds() + 60)
    assert _orch()._take_over(source["id"], None) is True
    runs = {run[0]: run[1:] for run in _runs(source["id"])}
    assert runs[owner] == ("fail", EXPIRED_MESSAGE)
    assert all(runs[o] == ("interrupted", ORPHAN_MESSAGE) for o in orphans)
    assert _source_fields(source["id"])["failures"] == 1
    assert _lock(source["id"]) is None


def test_recovery_continues_past_one_sources_error(db):
    sources = [_add_source("First"), _add_source("Second")]
    orch = _orch()
    for source in sources:
        orch._begin(source["id"], False)
        _age(source["id"], orch.lock_lifetime.total_seconds() + 60)
    rescuer = _orch()
    real_take_over = rescuer._take_over
    calls = []

    def first_one_fails(source_id, health):
        calls.append(source_id)
        if len(calls) == 1:
            raise RuntimeError("connection dropped")
        return real_take_over(source_id, health)

    rescuer._take_over = first_one_fails
    assert rescuer._recover_once() == {"expired_locks": 1, "orphaned_runs": 0}
    assert len(calls) == 2
    assert sum(_lock(s["id"]) is None for s in sources) == 1
    assert rescuer._recover_once() == {"expired_locks": 1, "orphaned_runs": 0}
    assert all(_lock(s["id"]) is None for s in sources)


def test_the_real_scheduler_and_recovery_loops_run_and_stop(db, monkeypatch):
    import orchestrator as orchestrator_module

    due = _add_source("Due")
    stuck = _add_source("Stuck", due=False)
    _sql(
        "INSERT INTO crawl_locks (source_id, locked_at) VALUES (%s, NOW() - interval '1 day')",
        (stuck["id"],),
    )
    monkeypatch.delenv("AIDJOBS_DISABLE_SCHEDULER", raising=False)
    monkeypatch.setattr(orchestrator_module, "SCHEDULER_INTERVAL_SECONDS", 0.2)
    monkeypatch.setattr(orchestrator_module, "RECOVERY_INTERVAL_SECONDS", 0.2)

    async def scenario():
        orch = _orch()
        crawled = []

        async def crawl(src, run):
            crawled.append(src["org_name"])
            return _ok()

        orch.crawl_source = crawl
        await orch.start()
        assert orch.running
        give_up = time.monotonic() + STEP_SECONDS
        while time.monotonic() < give_up:
            runs = await asyncio.to_thread(_runs, due["id"])
            lock = await asyncio.to_thread(_lock, stuck["id"])
            if runs and runs[-1][1] == "ok" and lock is None:
                break
            await asyncio.sleep(0.1)
        await orch.stop()
        assert not orch.running
        assert orch._scheduler_task.cancelled() or orch._scheduler_task.cancelling()
        assert orch._recovery_task.cancelled() or orch._recovery_task.cancelling()
        assert not orch._tasks and not orch._closing
        return crawled

    crawled = asyncio.run(scenario())
    assert crawled == ["Due"], "one scheduled crawl, through scheduler_loop"
    assert [r[1] for r in _runs(due["id"])] == ["ok"]
    assert _lock(stuck["id"]) is None, "recovery_loop removed the expired lock"
    assert _lock(due["id"]) is None


def test_the_run_route_starts_a_crawl_returns_the_open_run_and_refuses_an_unknown_source(
    db, monkeypatch
):
    from fastapi import HTTPException

    from app import crawler_admin

    source = _add_source()

    async def scenario():
        orch = _orch()
        gate = asyncio.Event()

        async def crawl(src, run):
            await gate.wait()
            return _ok()

        orch.crawl_source = crawl
        monkeypatch.setattr(crawler_admin, "get_db_url", lambda: TEST_URL)
        monkeypatch.setattr(crawler_admin, "get_orchestrator", lambda url: orch)
        request = crawler_admin.RunSourceRequest
        first = await crawler_admin.run_source(request(source_id=source["id"]), admin=None)
        second = await crawler_admin.run_source(request(source_id=source["id"]), admin=None)
        with pytest.raises(HTTPException) as unknown:
            await crawler_admin.run_source(request(source_id=str(uuid.uuid4())), admin=None)
        gate.set()
        await asyncio.wait_for(asyncio.gather(*list(orch._tasks)), STEP_SECONDS)
        return first, second, unknown.value.status_code

    first, second, unknown_status = asyncio.run(scenario())
    run_id = first["data"]["crawl_run_id"]
    assert first == {
        "status": "ok",
        "message": "Crawl started for Example",
        "data": {"crawl_run_id": run_id, "started": True},
    }
    assert second == {
        "status": "ok",
        "message": "Crawl already running for Example",
        "data": {"crawl_run_id": run_id, "started": False},
    }
    assert unknown_status == 404
    assert _runs(source["id"]) == [(run_id, "ok", "Found 0 jobs")]


# ---------------------------------------------------------------------------
# The run's lifecycle record (W-06): completeness and whether the crawl counts as evidence of
# absence, written by the run's ownership-checked finish. Nothing is expired.
# ---------------------------------------------------------------------------

COMPLETE = {"pages": 2, "expected": 3, "complete": True, "stop": "no More Jobs link"}


def _store_job(source_id, n, *, status="active", hidden=False, deadline=None):
    title, url = f"Programme Officer {n}", f"https://example.org/jobs/{n}"
    _sql(
        """
        INSERT INTO jobs (source_id, org_name, title, apply_url, canonical_hash, status,
                          deleted_at, deadline)
        VALUES (%s, 'Example', %s, %s, %s, %s, CASE WHEN %s THEN NOW() END, %s)
        """,
        (source_id, title, url, algorithm_a(title, url), status, hidden, deadline),
    )


def _lifecycle(run_id):
    row = _sql(
        f"SELECT {', '.join(LIFECYCLE_COLUMNS)} FROM crawl_logs WHERE id = %s", (run_id,)
    )[0]
    return dict(zip(LIFECYCLE_COLUMNS, row))


def _listing_crawl(numbers, report, *, titles=None, cls=SimpleCrawler):
    """A crawl that saves these jobs through the real writer and reports this listing."""
    titles = titles or {}

    async def crawl(src, run):
        jobs = [_job(n, titles.get(n)) for n in numbers]
        counts = await run.save(_crawler(cls).save_jobs, jobs, src["id"], src["org_name"])
        return {
            "status": "ok",
            "message": f"Found {len(jobs)} jobs",
            "counts": {"found": len(jobs), **counts},
            "listing": report,
            "valid": len(jobs),
        }

    return crawl


def _jobs_rows():
    return _sql("SELECT id, status, deleted_at, last_seen_at IS NOT NULL FROM jobs ORDER BY id")


def test_a_run_records_its_sources_open_jobs_that_are_not_hidden_at_its_start(db):
    source, other = _add_source(), _add_source("Other")
    for n in (1, 2, 3):
        _store_job(source["id"], n)
    _store_job(source["id"], 4, hidden=True)
    _store_job(source["id"], 5, status="expired")
    _store_job(other["id"], 6)
    _store_job(source["id"], 7, deadline="2000-01-01")
    _store_job(source["id"], 8, deadline="2999-12-31")
    _sql(
        "UPDATE jobs SET deadline = CURRENT_DATE WHERE title = 'Programme Officer 3'"
    )
    run_id, started = _orch()._begin(source["id"], False)
    assert started
    record = _lifecycle(run_id)
    assert record["active_at_start"] == 4, "1, 2, 3 (deadline today) and 8; not 7, passed"
    assert record["counted"] is None, "not decided until the run's finish"


def test_a_complete_crawl_that_matched_its_catalogue_counts_and_expires_nothing(db):
    source = _add_source()
    for n in (1, 2, 3):
        _store_job(source["id"], n)
    _store_job(source["id"], 9)
    before = {r[0]: r[1:3] for r in _jobs_rows()}
    run_id = _manual_run(source, _listing_crawl([1, 2, 3, 4], COMPLETE))
    assert _lifecycle(run_id) == {
        "active_at_start": 4,
        "listing_complete": True,
        "listing_expected": 3,
        "listing_stop": "no More Jobs link",
        "valid_count": 4,
        "failed_saves": 0,
        "unrecorded": 0,
        "matched_active": 3,
        "counted": True,
    }
    after = {r[0]: r[1:3] for r in _jobs_rows()}
    for job_id, state in before.items():
        assert after[job_id] == state, "no status or hiding changes on any stored job"
    assert len(after) == 5


@pytest.mark.parametrize("stored, listed, counted", [(4, [1, 2], True), (3, [1], False)])
def test_fewer_than_half_of_the_open_jobs_matched_does_not_count(db, stored, listed, counted):
    source = _add_source()
    for n in range(1, stored + 1):
        _store_job(source["id"], n)
    run_id = _manual_run(source, _listing_crawl(listed, COMPLETE))
    record = _lifecycle(run_id)
    assert (record["active_at_start"], record["matched_active"]) == (stored, len(listed))
    assert record["counted"] is counted


def test_jobs_whose_deadline_passed_are_neither_counted_at_the_start_nor_matched(db):
    source = _add_source()
    for n in (1, 2, 3, 4):
        _store_job(source["id"], n)
    for n in (5, 6, 7):
        _store_job(source["id"], n, deadline="2000-01-01")
    run_id = _manual_run(source, _listing_crawl([1, 2, 5], COMPLETE))
    record = _lifecycle(run_id)
    assert (record["active_at_start"], record["matched_active"]) == (4, 2)
    assert record["counted"] is True, "2 of the 4 open jobs; the passed deadlines are not open"


def _crawl_rows(rows):
    async def crawl(src, run):
        counts = await run.save(_crawler().save_jobs, rows, src["id"], src["org_name"])
        return {"status": "ok", "message": f"Found {len(rows)} jobs",
                "counts": {"found": len(rows), **counts}, "listing": COMPLETE,
                "valid": len(rows)}

    return crawl


def test_a_job_whose_passed_deadline_a_row_extends_is_not_a_match_when_listed_again(db):
    source = _add_source()
    for n in (1, 2, 3, 4):
        _store_job(source["id"], n)
    _store_job(source["id"], 5, deadline="2000-01-01")
    extended = {**_job(5), "deadline": "2999-12-31"}
    run_id = _manual_run(source, _crawl_rows([_job(1), dict(extended), dict(extended)]))
    record = _lifecycle(run_id)
    assert (record["active_at_start"], record["matched_active"]) == (4, 1)
    assert record["counted"] is False
    assert str(_sql("SELECT deadline FROM jobs WHERE title = 'Programme Officer 5'")[0][0]) == (
        "2999-12-31"
    ), "the new reading is still saved"


@pytest.mark.parametrize("cls", [SimpleCrawler, SimpleRSSCrawler, SimpleAPICrawler])
def test_the_start_count_and_the_matches_read_the_same_calendar_in_any_time_zone(
    db, monkeypatch, cls
):
    # A database day always one off the UTC day, so the UTC clock and the database disagree.
    # Not within two minutes of 00:00 or 12:00 UTC, so the choice below holds for the whole test.
    to_boundary = _sql(
        "SELECT 43200 - EXTRACT(EPOCH FROM NOW() AT TIME ZONE 'UTC')::bigint % 43200"
    )[0][0]
    if to_boundary < 120:
        time.sleep(float(to_boundary) + 5)
    utc_hour = _sql("SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'UTC')")[0][0]
    ahead = utc_hour >= 12
    monkeypatch.setenv("PGTZ", "Etc/GMT-12" if ahead else "Etc/GMT+12")
    db_day, utc_day = _sql("SELECT CURRENT_DATE, (NOW() AT TIME ZONE 'UTC')::date")[0]
    assert db_day != utc_day
    source = _add_source()
    _store_job(source["id"], 1)
    _store_job(source["id"], 2)
    # Passed by the database's day but not by UTC's when the database is ahead; the other way
    # round, open by the database's day but passed by UTC's.
    _store_job(source["id"], 3, deadline=utc_day if ahead else db_day)
    run_id = _manual_run(source, _listing_crawl([1, 2, 3], COMPLETE, cls=cls))
    record = _lifecycle(run_id)
    assert record["active_at_start"] == (2 if ahead else 3)
    assert record["matched_active"] == record["active_at_start"]
    assert record["counted"] is True


def test_a_hidden_job_seen_again_is_not_a_match(db):
    source = _add_source()
    for n in (1, 2):
        _store_job(source["id"], n)
    _store_job(source["id"], 3, hidden=True)
    run_id = _manual_run(source, _listing_crawl([1, 2, 3], COMPLETE))
    record = _lifecycle(run_id)
    assert (record["active_at_start"], record["matched_active"]) == (2, 2)
    assert record["counted"] is True
    assert _sql("SELECT count(*) FROM jobs WHERE deleted_at IS NOT NULL")[0][0] == 1


def test_another_sources_job_with_the_same_identity_is_not_a_match(db):
    source, other = _add_source(), _add_source("Other")
    for n in (1, 2, 3, 4):
        _store_job(source["id"], n)
    for n in (5, 6):
        _store_job(other["id"], n)
    run_id = _manual_run(source, _listing_crawl([1, 5, 6], COMPLETE))
    record = _lifecycle(run_id)
    assert (record["active_at_start"], record["matched_active"]) == (4, 1)
    assert record["counted"] is False
    owners = _sql("SELECT count(*) FROM jobs WHERE source_id = %s", (other["id"],))[0][0]
    assert owners == 2, "the other source's jobs are not taken over"


def test_a_listed_row_whose_sighting_is_not_recorded_stops_the_crawl_counting(db):
    source = _add_source()
    for n in (1, 2, 3):
        _store_job(source["id"], n)
    # Job 1 listed with a tracking parameter: its first key matches a second stored copy, its
    # second (the normalised link) the first copy. An identity conflict: neither is recorded.
    title, tracked = "Programme Officer 1", "https://example.org/jobs/1?utm_source=newsletter"
    assert algorithm_a(title, tracked) != algorithm_b(title, tracked, None)
    _sql(
        """
        INSERT INTO jobs (source_id, org_name, title, apply_url, canonical_hash, status)
        VALUES (%s, 'Example', %s, %s, %s, 'active')
        """,
        (source["id"], title, tracked, algorithm_a(title, tracked)),
    )

    async def crawl(src, run):
        jobs = [{**_job(1), "apply_url": tracked}, _job(2), _job(3)]
        counts = await run.save(_crawler().save_jobs, jobs, src["id"], src["org_name"])
        return {"status": "ok", "message": "Found 3 jobs", "counts": {"found": 3, **counts},
                "listing": COMPLETE, "valid": 3}

    run_id = _manual_run(source, crawl)
    record = _lifecycle(run_id)
    assert (record["active_at_start"], record["matched_active"]) == (4, 2)
    assert record["unrecorded"] == 1
    assert record["failed_saves"] == 0
    assert record["counted"] is False, "half matched, but a listed job's sighting is missing"


def test_a_new_job_listed_twice_is_not_a_match_of_the_catalogue(db):
    source = _add_source()
    for n in (1, 2, 3, 4):
        _store_job(source["id"], n)
    run_id = _manual_run(source, _listing_crawl([1, 7, 7], COMPLETE))
    record = _lifecycle(run_id)
    assert (record["active_at_start"], record["matched_active"]) == (4, 1)
    assert record["counted"] is False


@pytest.fixture
def failing_updates(db):
    _sql(
        """
        CREATE OR REPLACE FUNCTION test_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'test update failure';
        END $$
        """
    )
    _sql(
        "CREATE TRIGGER test_reject_update BEFORE UPDATE ON jobs FOR EACH ROW"
        " WHEN (NEW.location_raw = 'Reject me') EXECUTE FUNCTION test_reject_update()"
    )
    yield
    _sql("DROP TRIGGER IF EXISTS test_reject_update ON jobs")
    _sql("DROP FUNCTION IF EXISTS test_reject_update()")


@pytest.mark.parametrize("cls", [SimpleCrawler, SimpleRSSCrawler, SimpleAPICrawler])
def test_a_match_whose_update_rolls_back_is_not_reported(failing_updates, cls):
    source = _add_source()
    _store_job(source["id"], 1)
    _store_job(source["id"], 2)
    _store_job(source["id"], 3, deadline="2000-01-01")
    _store_job(source["id"], 4, deadline="2000-01-01")
    run_id, _ = _orch()._begin(source["id"], False)
    failing_open = {**_job(1), "location_raw": "Reject me"}
    failing_passed = {**_job(3), "location_raw": "Reject me"}
    rows = [failing_open, _job(2), failing_passed, _job(4)]
    counts = _crawler(cls).save_jobs(rows, source["id"], "Example", run_token=run_id)
    assert counts["failed"] == 2
    stored = {r[0]: str(r[1]) for r in _sql("SELECT title, id FROM jobs")}
    assert counts["seen_active"] == [stored["Programme Officer 2"]]
    assert counts["not_open_ids"] == [stored["Programme Officer 4"]]
    assert counts["created_ids"] == []


@pytest.mark.parametrize("cls", [SimpleCrawler, SimpleRSSCrawler, SimpleAPICrawler])
def test_every_save_step_reports_open_and_not_open_matches_apart(db, cls):
    source, other = _add_source(), _add_source("Other")
    _store_job(source["id"], 1)
    _store_job(source["id"], 2, deadline="2000-01-01")
    _store_job(source["id"], 3, status="expired")
    _store_job(source["id"], 4, hidden=True)
    _store_job(other["id"], 5)
    run_id, _ = _orch()._begin(source["id"], False)
    rows = [_job(n) for n in (1, 2, 3, 4, 5, 6)]
    counts = _crawler(cls).save_jobs(rows, source["id"], "Example", run_token=run_id)
    stored = {r[0]: str(r[1]) for r in _sql("SELECT title, id FROM jobs")}
    assert counts["seen_active"] == [stored["Programme Officer 1"]]
    assert sorted(counts["not_open_ids"]) == sorted(
        stored[f"Programme Officer {n}"] for n in (2, 3, 4)
    )
    assert counts["created_ids"] == [stored["Programme Officer 6"]]


# ---------------------------------------------------------------------------
# The observation path and job pages for new jobs only (W-36, W-09).
# ---------------------------------------------------------------------------


def _thin(n):
    """A listing row with a job link and nothing else: admission rejects it as too thin."""
    return {"title": f"Programme Officer {n}", "apply_url": f"https://example.org/jobs/{n}"}


def _job_state():
    """Every stored column of every job but last_seen_at, to show what an observation leaves."""
    return {
        r[0]: r[1]
        for r in _sql(
            "SELECT title, (to_jsonb(j) - 'last_seen_at')::text FROM jobs j ORDER BY title"
        )
    }


def _observing_crawl(thin_rows, admitted_rows=()):
    async def crawl(src, run):
        counts = await run.save(_crawler().save_jobs, list(admitted_rows), src["id"],
                                src["org_name"], thin=list(thin_rows))
        return {"status": "ok", "message": "Found jobs", "listing": COMPLETE,
                "counts": {"found": len(thin_rows) + len(admitted_rows), **counts},
                "valid": len(admitted_rows)}

    return crawl


def test_a_thin_row_of_a_saved_job_records_only_its_sighting(db):
    source = _add_source()
    for n in (1, 2, 3):
        _store_job(source["id"], n)
    _sql("UPDATE jobs SET last_seen_at = '2026-01-01', location_raw = 'Geneva'")
    before = _job_state()
    run_id = _manual_run(source, _observing_crawl([_thin(1), _thin(2), _thin(9)]))
    record = _lifecycle(run_id)
    assert (record["valid_count"], record["matched_active"], record["unrecorded"]) == (0, 2, 0)
    assert _sql("SELECT observed FROM crawl_logs WHERE id = %s", (run_id,))[0][0] == 2
    assert record["counted"] is True, "2 of 3 open jobs seen through their thin rows"
    assert _job_state() == before, "nothing but last_seen_at changes; the unknown row adds none"
    seen = {r[0]: r[1] for r in _sql(
        "SELECT title, last_seen_at > '2026-01-02' FROM jobs ORDER BY title")}
    assert seen == {"Programme Officer 1": True, "Programme Officer 2": True,
                    "Programme Officer 3": False}


def test_two_saved_jobs_with_the_same_link_observe_neither_and_stop_the_crawl_counting(db):
    source = _add_source()
    _store_job(source["id"], 1)
    _store_job(source["id"], 2)
    title, slashed = "Programme Officer 1 copy", "https://example.org/jobs/1/"
    _sql(
        "INSERT INTO jobs (source_id, org_name, title, apply_url, canonical_hash, status)"
        " VALUES (%s, 'Example', %s, %s, %s, 'active')",
        (source["id"], title, slashed, algorithm_a(title, slashed)),
    )
    _sql("UPDATE jobs SET last_seen_at = '2026-01-01'")
    run_id = _manual_run(source, _observing_crawl([_thin(1), _thin(2)]))
    record = _lifecycle(run_id)
    assert record["unrecorded"] == 1
    assert record["counted"] is False
    stale = _sql("SELECT count(*) FROM jobs WHERE last_seen_at < '2026-01-02'")[0][0]
    assert stale == 2, "both copies of job 1 untouched"


def test_hidden_and_passed_jobs_are_not_observed(db):
    source = _add_source()
    _store_job(source["id"], 1, hidden=True)
    _store_job(source["id"], 2, deadline="2000-01-01")
    _store_job(source["id"], 3)
    _sql("UPDATE jobs SET last_seen_at = '2026-01-01'")
    run_id = _manual_run(source, _observing_crawl([_thin(1), _thin(2), _thin(3)]))
    assert _sql("SELECT observed FROM crawl_logs WHERE id = %s", (run_id,))[0][0] == 1
    fresh = [r[0] for r in _sql(
        "SELECT title FROM jobs WHERE last_seen_at > '2026-01-02' ORDER BY title")]
    assert fresh == ["Programme Officer 3"]


class _RejectionLog:
    def __init__(self):
        self.errors = []

    def log_extraction(self, **kwargs):
        return None

    def log_failed_insert(self, *, source_url, error, **kwargs):
        self.errors.append((error, source_url))


def _html_crawl(source, rows, monkeypatch, *, page_fields=None, page_fails=False, log=None,
                saved_jobs=None):
    """The real HTML crawl through the orchestrator, with the listing and job pages served here.

    saved_jobs, when given, replaces the crawl's read of the saved jobs for its page plan.
    """
    import crawler_v2.job_pages as job_pages

    monkeypatch.setattr(job_pages, "rotation_bucket", lambda job_id: -1)
    opened = []

    async def scenario():
        orch = _orch()
        crawler = orch.html_crawler
        crawler.extraction_logger = log
        crawler.html_storage = None
        crawler.quality_scorer = None
        if saved_jobs is not None:
            crawler._saved_jobs_for_pages = saved_jobs

        async def fetch_page(url):
            return 200, "<html><body>listing</body></html>", ""

        async def listing(html, url):
            return [dict(row) for row in rows], dict(COMPLETE)

        async def detail_page(job, base_url):
            opened.append(job["apply_url"])
            if page_fails:
                return job
            fields = page_fields or {"location_raw": "Nairobi, Kenya"}
            return {**job, **fields, "page_read": True}

        crawler._fetch_page = fetch_page
        crawler._listing_jobs = listing
        crawler.enrich_job_from_detail_page = detail_page
        run_id, started = await orch.start_manual_run(source)
        assert started
        await asyncio.wait_for(asyncio.gather(*list(orch._tasks)), STEP_SECONDS)
        return run_id

    return asyncio.run(scenario()), opened


def test_only_new_vacancies_pages_are_opened_and_saved_jobs_are_observed(db, monkeypatch):
    source = _add_source()
    for n in (1, 2, 3):
        _store_job(source["id"], n)
    rows = [_thin(n) for n in (1, 2, 3, 4, 5)]
    rows.append({"title": "About us", "apply_url": "https://example.org/about"})
    run_id, opened = _html_crawl(source, rows, monkeypatch)
    assert opened == ["https://example.org/jobs/4", "https://example.org/jobs/5"]
    record = _lifecycle(run_id)
    observed = _sql("SELECT observed, inserted FROM crawl_logs WHERE id = %s", (run_id,))[0]
    assert tuple(observed) == (3, 2), "the saved three seen; the two new ones read and saved"
    assert (record["active_at_start"], record["matched_active"]) == (3, 3)
    assert record["counted"] is True
    assert _job_count() == 5


def test_new_vacancies_over_the_cap_are_held_back_not_saved(db, monkeypatch):
    import crawler_v2.job_pages as job_pages

    monkeypatch.setattr(job_pages, "NEW_PAGE_CAP", 1)
    source = _add_source()
    log = _RejectionLog()
    run_id, opened = _html_crawl(source, [_thin(4), _thin(5), _job(6)], monkeypatch, log=log)
    assert len(opened) == 1
    titles = sorted(r[0] for r in _sql("SELECT title FROM jobs"))
    read = "Programme Officer " + opened[0].rsplit("/", 1)[-1]
    assert titles == sorted([read, "Programme Officer 6"]), (
        "the other thin one is over the cap: read by a later crawl; 6 the listing admits"
    )
    held = [url for error, url in log.errors if error == "detail_unconfirmed"]
    assert len(held) == 1 and held[0] not in opened and held[0] != _job(6)["apply_url"]


def test_without_the_saved_jobs_every_vacancy_is_new_and_saved_ones_are_still_seen(
    db, monkeypatch
):
    import crawler_v2.job_pages as job_pages

    monkeypatch.setattr(job_pages, "NEW_PAGE_CAP", 1)
    source = _add_source()
    for n in (1, 2, 3):
        _store_job(source["id"], n)

    def unreadable(source_id, run_token):
        raise RuntimeError("the read timed out")

    run_id, opened = _html_crawl(source, [_thin(n) for n in (1, 2, 3)], monkeypatch,
                                 saved_jobs=unreadable)
    assert len(opened) == 1, "every vacancy treated as new, within the cap"
    record = _lifecycle(run_id)
    observed = _sql("SELECT observed FROM crawl_logs WHERE id = %s", (run_id,))[0][0]
    assert observed == 2, "the two held back over the cap are seen through their rows"
    assert record["matched_active"] == 3
    assert _job_count() == 3


def test_the_deadline_window_is_read_on_the_runs_day(db, monkeypatch, caplog):
    import logging

    from crawler_v2.job_pages import link_key, saved_job

    source = _add_source()
    _store_job(source["id"], 1, deadline="2999-01-11")
    stored_id = str(_sql("SELECT id FROM jobs")[0][0])

    def on_a_far_day(source_id, run_token):
        saved = {link_key(_thin(1)["apply_url"]): [saved_job(stored_id, "2999-01-11", False)]}
        return saved, 3, date(2999, 1, 10)

    with caplog.at_level(logging.WARNING, logger="crawler_v2.simple_crawler"):
        _run_id, opened = _html_crawl(source, [_thin(1)], monkeypatch, saved_jobs=on_a_far_day)
    assert "Saved jobs not read" not in caplog.text, "the plan used the saved jobs given"
    assert opened == [_thin(1)["apply_url"]], "a day before its deadline on the run's day"


def test_a_saved_jobs_page_that_fails_clears_nothing_from_its_listing_row(db, monkeypatch):
    source = _add_source()
    _store_job(source["id"], 1)
    _sql("UPDATE jobs SET deadline = CURRENT_DATE + 1, is_remote = true,"
         " location_raw = 'Home based', locations = ARRAY['Home based', 'Geneva']")
    row = {**_thin(1), "location_raw": "Nairobi, Kenya", "deadline": ""}
    run_id, opened = _html_crawl(source, [row], monkeypatch, page_fails=True)
    assert opened == [_thin(1)["apply_url"]], "near its deadline: chosen, but not read"
    stored = _sql("SELECT deadline = CURRENT_DATE + 1, is_remote, location_raw, locations"
                  " FROM jobs")[0]
    assert tuple(stored) == (True, True, "Nairobi, Kenya", ["Home based", "Geneva"]), (
        "the listing's empty deadline and 'not remote' clear nothing, nor does its one location"
        " replace the page's list; its location text is a reading"
    )


def test_a_failed_observation_read_keeps_the_admitted_rows(db, monkeypatch):
    source = _add_source()
    _store_job(source["id"], 1)
    run_id, _ = _orch()._begin(source["id"], False)

    def unreadable(cursor, source_id):
        cursor.execute("SELECT * FROM no_such_table")

    monkeypatch.setattr(simple_crawler_module, "observable_jobs", unreadable)
    counts = _crawler().save_jobs([_job(2)], source["id"], "Example", run_token=run_id,
                                  thin=[_thin(1), _thin(9)])
    assert counts["inserted"] == 1, "the admitted row stands"
    assert (counts["observed"], counts["unrecorded"]) == (0, 2)
    assert _job_count() == 2


def test_a_saved_jobs_listing_row_never_clears_what_its_page_gave(db, monkeypatch):
    source = _add_source()
    _store_job(source["id"], 1)
    _sql("UPDATE jobs SET location_raw = 'Geneva', country = 'Switzerland',"
         " country_iso = 'CH', deadline = '2999-01-31'")
    row = {**_thin(1), "location_raw": "", "deadline": "2999-02-28"}
    run_id, opened = _html_crawl(source, [row], monkeypatch)
    assert opened == [], "a saved job far from its deadline and not in rotation"
    stored = _sql("SELECT location_raw, country, country_iso, deadline::text FROM jobs")[0]
    assert tuple(stored) == ("Geneva", "Switzerland", "CH", "2999-02-28"), (
        "the listing's new deadline is saved; its blank location clears nothing"
    )


TRACKED = "https://example.org/jobs/1?utm_source=newsletter"


def _store_conflict(source_id):
    """Job 1 stored twice, so a row listing it with TRACKED matches both: an identity conflict."""
    _store_job(source_id, 1)
    title = "Programme Officer 1"
    _sql(
        """
        INSERT INTO jobs (source_id, org_name, title, apply_url, canonical_hash, status)
        VALUES (%s, 'Example', %s, %s, %s, 'active')
        """,
        (source_id, title, TRACKED, algorithm_a(title, TRACKED)),
    )


def test_every_html_row_whose_sighting_is_not_recorded_is_counted(db):
    source = _add_source()
    _store_conflict(source["id"])
    _store_job(source["id"], 10, hidden=True)
    run_id, _ = _orch()._begin(source["id"], False)
    rows = [
        {**_job(21), "title": ""},  # basic validation: no title
        {**_job(22), "title": "   "},  # no title once trimmed
        {**_job(23), "title": "  AB "},  # too short once trimmed
        {**_job(24), "apply_url": "#apply"},  # not a link
        {**_job(25), "admitted": False},  # refused by the writer
        {**_job(1), "apply_url": TRACKED},  # identity conflict
        _job(10),  # a hidden job seen again: recorded
        _job(2),  # new: recorded
    ]
    counts = _crawler().save_jobs(rows, source["id"], "Example", run_token=run_id)
    assert counts["unrecorded"] == 6
    assert counts["inserted"] == 1
    assert counts["failed"] == 0

    only_invalid = _crawler().save_jobs(
        [{**_job(26), "title": ""}], source["id"], "Example", run_token=run_id
    )
    assert only_invalid["unrecorded"] == 1


@pytest.mark.parametrize("cls", [SimpleRSSCrawler, SimpleAPICrawler])
def test_every_feed_row_whose_sighting_is_not_recorded_is_counted(db, cls):
    source = _add_source()
    _store_conflict(source["id"])
    _store_job(source["id"], 10, hidden=True)
    run_id, _ = _orch()._begin(source["id"], False)
    rows = [
        {**_job(21), "title": ""},  # no title
        {**_job(22), "apply_url": "  "},  # no link once trimmed
        {**_job(25), "admitted": False},  # refused by the writer
        {**_job(1), "apply_url": TRACKED},  # identity conflict
        _job(10),  # a hidden job seen again: recorded
        _job(2),  # new: recorded
    ]
    counts = _crawler(cls).save_jobs(rows, source["id"], "Example", run_token=run_id)
    assert counts["unrecorded"] == 4
    assert counts["inserted"] == 1
    assert counts["failed"] == 0


def test_the_html_crawl_hands_its_listing_and_admitted_rows_to_the_finish(db):
    source = _add_source("UNICEF", url="https://jobs.unicef.org/en-us/listing/")
    report = {"pages": 1, "expected": 2, "complete": True, "stop": "no More Jobs link"}

    async def scenario(rows):
        orch = _orch()
        crawler = orch.html_crawler
        crawler.extraction_logger = None
        crawler.html_storage = None
        crawler.quality_scorer = None

        async def fetch_page(url):
            return 200, "<html><body>listing</body></html>", ""

        async def pageup_reader(html, url):
            return rows, dict(report)

        crawler._fetch_page = fetch_page
        crawler._pageup_listing_jobs = pageup_reader
        run_id, _ = await orch.begin_run(source)
        result = await crawler.crawl_source(source, RunHandle(run_id, source["id"]))
        await orch.finish_run(source, run_id, result)
        return run_id, result

    junk = {"title": "Careers home", "apply_url": "https://jobs.unicef.org/"}
    run_id, result = asyncio.run(scenario([_job(1), junk]))
    assert result["listing"] == report
    assert result["valid"] == 1
    assert _lifecycle(run_id)["listing_complete"] is True

    run_id, result = asyncio.run(scenario([junk]))
    assert result["listing"] == report
    assert result["valid"] == 0
    assert _lifecycle(run_id)["valid_count"] == 0
    assert _lifecycle(run_id)["counted"] is False


def test_a_partial_listing_is_recorded_and_does_not_count(db):
    source = _add_source()
    _store_job(source["id"], 1)
    partial = {"pages": 6, "expected": 270, "complete": False, "stop": "refused: HTTP 202"}
    run_id = _manual_run(source, _listing_crawl([1], partial))
    record = _lifecycle(run_id)
    assert record["listing_complete"] is False
    assert record["listing_expected"] == 270
    assert record["listing_stop"] == "refused: HTTP 202"
    assert record["counted"] is False


def test_a_reader_without_a_completeness_report_never_counts(db):
    source = _add_source()
    _store_job(source["id"], 1)
    run_id = _manual_run(source, _listing_crawl([1], None))
    record = _lifecycle(run_id)
    assert record["listing_complete"] is None
    assert record["matched_active"] == 1
    assert record["counted"] is False


def test_a_complete_crawl_where_a_job_failed_to_save_does_not_count(failing_titles):
    source = _add_source()
    _store_job(source["id"], 1)
    crawl = _listing_crawl([1, 2], COMPLETE, titles={2: "Broken Officer"})
    run_id = _manual_run(source, crawl)
    record = _lifecycle(run_id)
    assert record["failed_saves"] == 1
    assert record["matched_active"] == 1
    assert record["counted"] is False
    assert [r[1] for r in _runs(source["id"])] == ["ok"]


def test_a_failed_run_records_no_completeness(db):
    source = _add_source()
    _store_job(source["id"], 1)

    async def failing(src, run):
        return _fail()

    run_id = _manual_run(source, failing)
    record = _lifecycle(run_id)
    assert record["listing_complete"] is None
    assert record["counted"] is False
    assert record["active_at_start"] == 1


def test_a_stale_finish_writes_no_lifecycle_record(db):
    source = _add_source()
    _store_job(source["id"], 1)
    old = _orch()
    stale_run, _ = old._begin(source["id"], False)
    _age(source["id"], old.lock_lifetime.total_seconds() + 60)
    new_run, started = _orch()._begin(source["id"], False)
    assert started
    complete = {**_ok(found=1), "listing": COMPLETE, "valid": 1}
    assert old._finish(source["id"], stale_run, complete, mode="normal", health=None) is False
    assert _lifecycle(stale_run)["counted"] is None
    assert _lifecycle(stale_run)["listing_complete"] is None
    assert _lifecycle(new_run)["counted"] is None


# ---------------------------------------------------------------------------
# Expiry (W-06, step 4.6, pull request 3): by absence in a counting run's finish, the return on
# sight in the writer, and the daily pass. Expiry changes status and expired_at only.
# ---------------------------------------------------------------------------

PARTIAL = {"pages": 1, "expected": 9, "complete": False, "stop": "HTTP 202 on page 2"}


def _seen_long_ago():
    _sql("UPDATE jobs SET last_seen_at = NOW() - interval '5 days',"
         " created_at = NOW() - interval '5 days'")


def _back_in_time(run_id, hours):
    """Move a finished run, and the sightings it recorded, back by `hours`."""
    _sql(
        """
        UPDATE jobs SET last_seen_at = last_seen_at - make_interval(hours => %s)
        WHERE last_seen_at >= (SELECT ran_at FROM crawl_logs WHERE id = %s)
        """,
        (hours, run_id),
    )
    _sql("UPDATE crawl_logs SET ran_at = ran_at - make_interval(hours => %s) WHERE id = %s",
         (hours, run_id))


def _lifecycle_states():
    return {
        r[0]: (r[1], r[2], r[3])
        for r in _sql(
            "SELECT title, status, expired_at IS NOT NULL, deleted_at IS NOT NULL FROM jobs"
        )
    }


def _expiry_record(run_id):
    return tuple(_sql("SELECT expired, returned FROM crawl_logs WHERE id = %s", (run_id,))[0])


def _all_but_lifecycle():
    return {
        r[0]: r[1]
        for r in _sql(
            "SELECT title, (to_jsonb(j) - 'status' - 'expired_at' - 'last_seen_at')::text"
            " FROM jobs j"
        )
    }


def _two_counting_runs(source, listed, *, hours=25):
    first = _manual_run(source, _listing_crawl(listed, COMPLETE))
    assert _lifecycle(first)["counted"] is True
    _back_in_time(first, hours)
    second = _manual_run(source, _listing_crawl(listed, COMPLETE))
    assert _lifecycle(second)["counted"] is True
    return first, second


def test_a_job_missing_from_two_counting_runs_a_day_apart_expires_and_nothing_else_changes(db):
    source, other = _add_source(), _add_source("Other")
    for n in (1, 2, 3, 4):
        _store_job(source["id"], n)
    _store_job(source["id"], 5, hidden=True)
    _store_job(source["id"], 6, deadline="2000-01-01")
    _store_job(other["id"], 7)
    _seen_long_ago()
    first = _manual_run(source, _listing_crawl([1, 2, 3], COMPLETE))
    assert _lifecycle(first)["counted"] is True
    assert _expiry_record(first) == (0, 0), "one counting run is not enough"
    assert _lifecycle_states()["Programme Officer 4"] == ("active", False, False)
    _back_in_time(first, 25)
    before = _all_but_lifecycle()
    second = _manual_run(source, _listing_crawl([1, 2, 3], COMPLETE))
    assert _lifecycle(second)["counted"] is True
    assert _expiry_record(second) == (1, 0)
    states = _lifecycle_states()
    assert states.pop("Programme Officer 4") == ("expired", True, False)
    assert states == {
        "Programme Officer 1": ("active", False, False),
        "Programme Officer 2": ("active", False, False),
        "Programme Officer 3": ("active", False, False),
        "Programme Officer 5": ("active", False, True),
        "Programme Officer 6": ("active", False, False),
        "Programme Officer 7": ("active", False, False),
    }, "hidden, passed (left to the daily pass) and another source's jobs untouched"
    assert _all_but_lifecycle() == before, "expiry writes only status and expired_at"


def test_two_counting_runs_less_than_24_hours_apart_expire_nothing(db):
    source = _add_source()
    for n in (1, 2, 3, 4):
        _store_job(source["id"], n)
    _seen_long_ago()
    _first, second = _two_counting_runs(source, [1, 2, 3], hours=23)
    assert _expiry_record(second) == (0, 0)
    assert _lifecycle_states()["Programme Officer 4"] == ("active", False, False)


def _zero_jobs(src, run):
    return {"status": "ok", "message": "Found 0 jobs", "listing": COMPLETE, "valid": 0,
            "counts": {"found": 0, "inserted": 0, "updated": 0, "skipped": 0}}


async def _failing(src, run):
    return _fail()


@pytest.mark.parametrize("second", [
    pytest.param(lambda: _listing_crawl([1, 2, 3], PARTIAL), id="partial"),
    pytest.param(lambda: _zero_jobs, id="zero-jobs"),
    pytest.param(lambda: _listing_crawl([1], COMPLETE), id="fewer-than-half-matched"),
    pytest.param(lambda: _failing, id="failed"),
])
def test_a_run_that_does_not_count_expires_nothing(db, second):
    source = _add_source()
    for n in (1, 2, 3, 4):
        _store_job(source["id"], n)
    _seen_long_ago()
    first = _manual_run(source, _listing_crawl([1, 2, 3], COMPLETE))
    _back_in_time(first, 25)
    run_id = _manual_run(source, second())
    assert _lifecycle(run_id)["counted"] is False
    assert _expiry_record(run_id) == (0, 0)
    assert {state[0] for state in _lifecycle_states().values()} == {"active"}


def test_a_job_seen_by_any_crawl_since_is_not_expired(db):
    source = _add_source()
    for n in (1, 2, 3, 4):
        _store_job(source["id"], n)
    _seen_long_ago()
    first = _manual_run(source, _listing_crawl([1, 2, 3], COMPLETE))
    _back_in_time(first, 25)
    partial = _manual_run(source, _listing_crawl([4], PARTIAL))
    assert _lifecycle(partial)["counted"] is False
    second = _manual_run(source, _listing_crawl([1, 2, 3], COMPLETE))
    assert _lifecycle(second)["counted"] is True
    assert _expiry_record(second) == (0, 0), "seen by the partial crawl after the first run"
    assert _lifecycle_states()["Programme Officer 4"] == ("active", False, False)


@pytest.mark.parametrize("minutes, expires", [(5, False), (15, True)])
def test_a_run_started_just_after_a_sighting_is_not_taken_to_have_missed_it(db, minutes, expires):
    source = _add_source()
    for n in (1, 2, 3, 4):
        _store_job(source["id"], n)
    _seen_long_ago()
    first, _ = _two_counting_runs(source, [1, 2, 3])
    _sql("UPDATE jobs SET status = 'active', expired_at = NULL")
    # Job 4 seen `minutes` before the first run started, as if the app's clock ran behind.
    _sql(
        "UPDATE jobs SET last_seen_at = (SELECT ran_at FROM crawl_logs WHERE id = %s)"
        " - make_interval(mins => %s) WHERE title = 'Programme Officer 4'",
        (first, minutes),
    )
    third = _manual_run(source, _listing_crawl([1, 2, 3], COMPLETE))
    states = _lifecycle_states()
    assert (states["Programme Officer 4"][0] == "expired") is expires
    assert _expiry_record(third)[0] == (1 if expires else 0)


def _expire(title, *, deadline=None, days_ago=1):
    _sql(
        "UPDATE jobs SET status = 'expired', deadline = %s,"
        " expired_at = NOW() - make_interval(days => %s) WHERE title = %s",
        (deadline, days_ago, title),
    )


def test_an_expired_job_seen_by_any_crawl_returns_unless_its_deadline_has_passed(db):
    source = _add_source()
    for n in (1, 2, 3, 4, 5):
        _store_job(source["id"], n)
    _expire("Programme Officer 1")
    _expire("Programme Officer 2", deadline="2000-01-01")
    _expire("Programme Officer 3", deadline="2000-01-01")
    _expire("Programme Officer 4", deadline="2999-12-31")
    rows = [
        _job(1),
        _job(2),
        {**_job(3), "deadline": "2999-12-31"},
        {**_job(4), "deadline": "2000-01-01"},
        _job(5),
    ]
    run_id = _manual_run(source, _crawl_rows(rows))
    states = _lifecycle_states()
    assert states == {
        "Programme Officer 1": ("active", False, False),
        "Programme Officer 2": ("expired", True, False),
        "Programme Officer 3": ("active", False, False),
        "Programme Officer 4": ("expired", True, False),
        "Programme Officer 5": ("active", False, False),
    }, "1 expired by absence; 2 by its deadline; 3 a new deadline; 4 now passed"
    assert _expiry_record(run_id)[1] == 2
    assert _lifecycle(run_id)["matched_active"] == 1, "a returned job was not open at the start"


def test_a_reading_without_a_deadline_returns_only_a_job_expired_by_absence(db):
    source = _add_source()
    for n in (1, 2):
        _store_job(source["id"], n)
    _expire("Programme Officer 1", deadline="2999-12-31")
    _expire("Programme Officer 2", deadline="2000-01-01")
    run_id = _manual_run(source, _crawl_rows([{**_job(n), "deadline": ""} for n in (1, 2)]))
    assert [r[0] for r in _sql("SELECT deadline FROM jobs")] == [None, None], "both cleared"
    states = _lifecycle_states()
    assert states["Programme Officer 1"] == ("active", False, False)
    assert states["Programme Officer 2"] == ("expired", True, False), (
        "expired by its deadline: only a reading with a deadline on or after today brings it back"
    )
    assert _expiry_record(run_id)[1] == 1


def test_a_partial_crawl_returns_a_job_too(db):
    source = _add_source()
    _store_job(source["id"], 1)
    _expire("Programme Officer 1")
    run_id = _manual_run(source, _listing_crawl([1], PARTIAL))
    assert _lifecycle(run_id)["counted"] is False
    assert _lifecycle_states()["Programme Officer 1"] == ("active", False, False)
    assert _expiry_record(run_id) == (0, 1)


def test_a_hidden_job_expired_by_absence_returns_and_stays_hidden(db):
    source = _add_source()
    _store_job(source["id"], 1, hidden=True)
    _expire("Programme Officer 1")
    _manual_run(source, _listing_crawl([1], PARTIAL))
    assert _lifecycle_states()["Programme Officer 1"] == ("active", False, True)


def test_the_observation_path_returns_a_job_expired_by_absence(db):
    source = _add_source()
    for n in (1, 2):
        _store_job(source["id"], n)
    _expire("Programme Officer 1")
    _expire("Programme Officer 2", deadline="2000-01-01")
    before = _all_but_lifecycle()
    run_id = _manual_run(source, _observing_crawl([_thin(1), _thin(2)]))
    assert _sql("SELECT observed FROM crawl_logs WHERE id = %s", (run_id,))[0][0] == 1
    assert _expiry_record(run_id) == (0, 1)
    assert _lifecycle_states() == {
        "Programme Officer 1": ("active", False, False),
        "Programme Officer 2": ("expired", True, False),
    }
    assert _all_but_lifecycle() == before


@pytest.mark.parametrize("cls", [SimpleCrawler, SimpleRSSCrawler, SimpleAPICrawler])
def test_every_save_step_reports_returned_jobs_and_drops_a_rolled_back_one(failing_updates, cls):
    source = _add_source()
    for n in (1, 2):
        _store_job(source["id"], n)
    _expire("Programme Officer 1")
    _expire("Programme Officer 2")
    run_id, _ = _orch()._begin(source["id"], False)
    rows = [{**_job(1), "location_raw": "Reject me"}, _job(2)]
    counts = _crawler(cls).save_jobs(rows, source["id"], "Example", run_token=run_id)
    assert counts["failed"] == 1
    stored = {r[0]: str(r[1]) for r in _sql("SELECT title, id FROM jobs")}
    assert counts["returned_ids"] == [stored["Programme Officer 2"]]
    states = _lifecycle_states()
    assert states["Programme Officer 1"] == ("expired", True, False), "its save rolled back"
    assert states["Programme Officer 2"] == ("active", False, False)


def _job_fields(title):
    return _sql(
        "SELECT status, expired_at IS NOT NULL, deleted_at IS NOT NULL, description IS NOT NULL"
        " FROM jobs WHERE title = %s",
        (title,),
    )[0]


def _daily_pass_jobs(source_id):
    """One job per case of the daily pass, by number."""
    for n in range(1, 10):
        _store_job(source_id, n, hidden=(n == 2))
    _sql("UPDATE jobs SET description = 'The full advert'")
    cases = {
        1: "deadline = CURRENT_DATE - 1",
        2: "deadline = CURRENT_DATE - 1",
        3: "deadline = CURRENT_DATE",
        4: "deadline = NULL",
        5: "deadline = CURRENT_DATE - 91",
        6: "deadline = CURRENT_DATE - 89",
        7: "status = 'expired', expired_at = NOW() - interval '91 days'",
        8: "status = 'expired', expired_at = NOW() - interval '89 days'",
        9: "status = 'expired', deadline = CURRENT_DATE - 95, expired_at = NOW()",
    }
    for n, assignment in cases.items():
        _sql(f"UPDATE jobs SET {assignment} WHERE title = %s", (f"Programme Officer {n}",))


def test_the_daily_pass_expires_every_passed_deadline_and_drops_descriptions_after_90_days(db):
    source = _add_source()
    _daily_pass_jobs(source["id"])
    before = _all_but_lifecycle()
    orch = _orch()
    assert orch._daily_pass_once() == {"expired": 4, "descriptions_dropped": 3, "left": 0}
    expected = {
        1: ("expired", True, False, True),
        2: ("expired", True, True, True),
        3: ("active", False, False, True),
        4: ("active", False, False, True),
        5: ("expired", True, False, False),
        6: ("expired", True, False, True),
        7: ("expired", True, False, False),
        8: ("expired", True, False, True),
        9: ("expired", True, False, False),
    }
    for n, fields in expected.items():
        assert _job_fields(f"Programme Officer {n}") == fields, n
    after = _all_but_lifecycle()
    for title, text in before.items():
        if '"description"' in text and after[title] != text:
            assert after[title] == text.replace('"description": "The full advert"',
                                                '"description": null'), title
    assert orch._daily_pass_once() is None, "once per database day"


def test_the_daily_pass_skips_a_row_a_crawl_holds_and_finishes_it_on_the_next_round(db):
    source = _add_source()
    for n in (1, 2):
        _store_job(source["id"], n, deadline="2000-01-01")
    holder = psycopg2.connect(ADMIN_URL)
    try:
        with holder.cursor() as cur:
            cur.execute("SELECT id FROM jobs WHERE title = 'Programme Officer 1' FOR UPDATE")
        orch = _orch()
        started = time.monotonic()
        assert orch._daily_pass_once() == {"expired": 1, "descriptions_dropped": 0, "left": 1}
        assert time.monotonic() - started < 5, "it does not wait for the crawl's lock"
        assert _job_fields("Programme Officer 1")[0] == "active"
    finally:
        holder.rollback()
        holder.close()
    assert orch._daily_pass_once() == {"expired": 1, "descriptions_dropped": 0, "left": 0}
    assert _job_fields("Programme Officer 1")[0] == "expired"
    assert orch._daily_pass_once() is None


def test_the_preview_selects_exactly_what_the_finish_would_expire(db):
    from contracts.expiry import EXPIRE_BY_ABSENCE_SQL
    from tests.test_expiry import expiry_preview

    source = _add_source()
    for n in (1, 2, 3, 4, 5, 6):
        _store_job(source["id"], n)
    _store_job(source["id"], 7, hidden=True)
    _store_job(source["id"], 8, deadline="2000-01-01")
    _seen_long_ago()
    for hours in (50, 25):
        _sql(
            "INSERT INTO crawl_logs (source_id, ran_at, found, inserted, updated, skipped,"
            " status, message, counted) VALUES (%s, NOW() - make_interval(hours => %s),"
            " 0, 0, 0, 0, 'ok', 'Found jobs', TRUE)",
            (source["id"], hours),
        )
    _sql("UPDATE jobs SET last_seen_at = NOW() - interval '1 hour'"
         " WHERE title IN ('Programme Officer 1', 'Programme Officer 2')")
    _sql("UPDATE jobs SET last_seen_at = NOW() - interval '30 hours'"
         " WHERE title = 'Programme Officer 3'")
    params = {"source_id": source["id"]}
    conn = psycopg2.connect(ADMIN_URL)
    try:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute(expiry_preview.ABSENT_SQL, params)
            previewed = sorted(r[0] for r in cur.fetchall())
            lines = []
            expiry_preview.preview(cur, lines.append)
        conn.rollback()
        conn.set_session(readonly=False)
        with conn.cursor() as cur:
            cur.execute(EXPIRE_BY_ABSENCE_SQL, params)
            expired_ids = [r[0] for r in cur.fetchall()]
            cur.execute("SELECT title FROM jobs WHERE id = ANY(%s::uuid[])",
                        ([str(i) for i in expired_ids],))
            expired = sorted(r[0] for r in cur.fetchall())
        conn.rollback()
    finally:
        conn.close()
    assert previewed == expired == [f"Programme Officer {n}" for n in (4, 5, 6)]
    text = "\n".join(lines)
    assert "missed by at least one counting run since last seen: 4" in text, "3 missed one"
    assert "would expire by absence at the next counting run's finish: 3" in text
    assert "would expire by absence, all sources: 3" in text
    assert "Example: 1 (0)" in text, "job 8's passed deadline, for the daily pass"
    assert {state[0] for state in _lifecycle_states().values()} == {"active"}
