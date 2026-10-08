"""Gate 6 lifecycle. No expiry, and absence is not inferred."""
import inspect
from datetime import datetime, timezone
from pathlib import Path

from contracts.identity import algorithm_a
from contracts.lifecycle import jobs_not_rediscovered
from contracts.persist import LOAD_COLUMNS, persist_candidate
from orchestrator import CrawlerOrchestrator

ROOT = Path(__file__).resolve().parents[1]
TITLE = "Programme Officer"
URL = "https://example.org/jobs/1"
WHEN = datetime(2026, 10, 5, tzinfo=timezone.utc)


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.statements = []
        self._sql = ""

    def execute(self, sql, params=None):
        self.statements.append((sql, params))
        self._sql = sql

    def fetchall(self):
        if self._sql.lstrip().upper().startswith("SELECT"):
            return list(self.rows)
        return []


def _stored(**overrides):
    row = {name: None for name in LOAD_COLUMNS}
    row.update(
        {
            "id": "row-1",
            "canonical_hash": algorithm_a(TITLE, URL),
            "title": TITLE,
            "apply_url": URL,
            "status": "active",
            "deleted_at": None,
        }
    )
    row.update(overrides)
    return row


def _sql(cursor) -> str:
    return "\n".join(sql for sql, _params in cursor.statements)


def test_untrusted_crawl_identifies_no_absences():
    known = ["job-a", "job-b"]
    seen = ["job-a"]
    assert jobs_not_rediscovered(known, seen, trustworthy=False) == []
    assert known == ["job-a", "job-b"]
    assert seen == ["job-a"]


def test_trusted_flag_returns_ids_the_caller_did_not_see():
    missing = jobs_not_rediscovered(
        ["job-a", "job-b", "job-c"],
        ["job-c", "job-a"],
        trustworthy=True,
    )
    assert missing == ["job-b"]


def test_helper_does_not_touch_a_database():
    text = inspect.getsource(jobs_not_rediscovered)
    for forbidden in ("psycopg2", "connect(", "cursor", "execute(", "DELETE", "UPDATE"):
        assert forbidden not in text
    assert list(inspect.signature(jobs_not_rediscovered).parameters) == [
        "known_ids",
        "seen_ids",
        "trustworthy",
    ]


def test_production_paths_do_not_mark_a_crawl_trustworthy():
    paths = [
        ROOT / "orchestrator.py",
        ROOT / "app" / "crawler_admin.py",
        ROOT / "contracts" / "persist.py",
        ROOT / "crawler_v2" / "simple_crawler.py",
        ROOT / "crawler_v2" / "rss_crawler.py",
        ROOT / "crawler_v2" / "api_crawler.py",
    ]
    for path in paths:
        text = path.read_text(encoding="utf-8")
        assert "trustworthy = True" not in text
        assert "trustworthy=True" not in text


def test_finish_and_cleanup_do_not_expire_jobs():
    finish = inspect.getsource(CrawlerOrchestrator.finish_run)
    cleanup = inspect.getsource(CrawlerOrchestrator.cleanup_expired_jobs)
    for source in (finish, cleanup):
        collapsed = source.lower().replace(" ", "")
        assert "delete from jobs" not in collapsed
        assert "status='expired'" not in collapsed
        assert "deleted_at=null" not in collapsed


def test_persist_sql_does_not_expire_or_reactivate():
    created = FakeCursor([])
    persist_candidate(
        created,
        {"title": TITLE, "apply_url": URL, "admitted": True},
        observed_at=WHEN,
        heuristics=False,
    )
    suppressed = FakeCursor([_stored(deleted_at=WHEN, status="suppressed")])
    outcome = persist_candidate(
        suppressed,
        {"title": TITLE, "apply_url": URL, "city": "Mombasa", "admitted": True},
        observed_at=WHEN,
        heuristics=False,
    )
    assert outcome == "seen_again"
    for cursor in (created, suppressed):
        collapsed = _sql(cursor).lower().replace(" ", "")
        assert "deletefromjobs" not in collapsed
        assert "status='expired'" not in collapsed
        assert "deleted_at=null" not in collapsed
