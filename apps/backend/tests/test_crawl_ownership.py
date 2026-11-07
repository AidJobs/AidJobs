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
from datetime import timedelta
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
    for name in ("extraction_logger", "html_storage", "geocoder", "quality_scorer"):
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


class _HeldGeocoder:
    def __init__(self, gate):
        self.gate = gate

    async def geocode(self, location, use_google=False):
        await self.gate.wait()
        return None


def test_two_html_crawls_at_once_keep_their_own_listing_reports(db):
    unicef = _add_source("UNICEF", url="https://jobs.unicef.org/en-us/listing/")
    icrc = _add_source("ICRC", url="https://careers.icrc.org/go/Global-Opportunities/8821501/")
    report = {"pages": 3, "expected": 3, "complete": True, "stop": "no more pages"}

    async def scenario():
        orch = _orch()
        crawler = orch.html_crawler
        listing_gate, geocode_gate = asyncio.Event(), asyncio.Event()
        logger = _RecordingLogger()
        crawler.extraction_logger = logger
        crawler.html_storage = None
        crawler.quality_scorer = None
        crawler.geocoder = _HeldGeocoder(geocode_gate)

        async def fetch_page(url):
            return 200, "<html><body>listing</body></html>", ""

        async def unicef_reader(html, url):
            await listing_gate.wait()
            return [_job(1)], report

        async def detail_page(job, base_url):
            return job

        crawler._fetch_page = fetch_page
        crawler._unicef_listing_jobs = unicef_reader
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
        geocode_gate.set()
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
