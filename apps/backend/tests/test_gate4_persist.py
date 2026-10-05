"""Gate 4 persistence. A fake cursor, no database connection."""
from datetime import date, datetime, timezone
from pathlib import Path

from contracts.identity import algorithm_a, algorithm_b, write_key
from contracts.persist import LOAD_COLUMNS, persist_candidate

ROOT = Path(__file__).resolve().parents[1]
TITLE = "Programme Officer"
URL = "https://example.org/jobs/1?utm_source=newsletter"
REFERENCE = "REF-1"
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
            "description_snippet": "Keep me",
            "status": "active",
            "source_id": "src-1",
            "org_name": "Example",
        }
    )
    row.update(overrides)
    return row


def _writes(cursor):
    return [
        (sql, params)
        for sql, params in cursor.statements
        if not sql.lstrip().upper().startswith("SELECT")
    ]


def _sql(cursor) -> str:
    return "\n".join(sql for sql, _ in cursor.statements)


def _candidate(**overrides):
    payload = {"title": TITLE, "apply_url": URL}
    payload.update(overrides)
    return payload


def test_stored_under_a_matches_when_current_flag_would_write_b():
    stored_hash = algorithm_a(TITLE, URL)
    assert stored_hash != algorithm_b(TITLE, URL, REFERENCE)
    cursor = FakeCursor([_stored(canonical_hash=stored_hash)])
    outcome = persist_candidate(
        cursor,
        _candidate(latitude=1.25, quality_score=0.9),
        observed_at=WHEN,
        heuristics=True,
        reference=REFERENCE,
    )
    assert outcome == "unchanged"
    writes = _writes(cursor)
    assert len(writes) == 1
    sql, params = writes[0]
    assert sql == "UPDATE jobs SET last_seen_at = %s WHERE id = %s"
    assert "canonical_hash" not in sql
    assert "latitude" not in sql
    assert "quality" not in sql
    assert algorithm_b(TITLE, URL, REFERENCE) not in params
    assert stored_hash not in params
    assert "deleted_at = NULL" not in _sql(cursor)
    assert "jobs_side" not in _sql(cursor)


def test_stored_under_b_matches_when_current_flag_would_write_a():
    stored_hash = algorithm_b(TITLE, URL, REFERENCE)
    assert stored_hash != algorithm_a(TITLE, URL)
    cursor = FakeCursor([_stored(canonical_hash=stored_hash)])
    outcome = persist_candidate(
        cursor,
        _candidate(),
        observed_at=WHEN,
        heuristics=False,
        reference=REFERENCE,
    )
    assert outcome == "unchanged"
    sql, params = _writes(cursor)[0]
    assert "canonical_hash" not in sql
    assert write_key(TITLE, URL, REFERENCE, heuristics=False) not in params
    assert stored_hash not in params


def test_apply_url_change_does_not_replace_stored_hash():
    clean = "https://example.org/jobs/1"
    stored_hash = algorithm_b(TITLE, URL, REFERENCE)
    assert stored_hash == algorithm_b(TITLE, clean, REFERENCE)
    assert stored_hash != algorithm_a(TITLE, clean)
    cursor = FakeCursor([_stored(canonical_hash=stored_hash, apply_url=URL)])
    outcome = persist_candidate(
        cursor,
        _candidate(apply_url=clean),
        observed_at=WHEN,
        heuristics=False,
        reference=REFERENCE,
    )
    assert outcome == "updated"
    sql, params = _writes(cursor)[0]
    assert "apply_url = %s" in sql
    assert "canonical_hash" not in sql
    assert stored_hash not in params
    assert algorithm_a(TITLE, clean) not in params
    assert "deleted_at" not in sql


def test_suppressed_row_is_not_reactivated():
    cursor = FakeCursor([_stored(deleted_at=WHEN, status="suppressed", city="Nairobi")])
    outcome = persist_candidate(
        cursor,
        _candidate(city="Mombasa", latitude=9.0),
        observed_at=WHEN,
        heuristics=True,
        reference=REFERENCE,
    )
    assert outcome == "seen_again"
    sql, _params = _writes(cursor)[0]
    assert sql == "UPDATE jobs SET last_seen_at = %s WHERE id = %s"
    assert "status" not in sql
    assert "deleted_at" not in sql
    assert "NULL" not in sql
    assert "latitude" not in sql


def test_identity_conflict_writes_nothing():
    first = _stored(id="row-1", canonical_hash=algorithm_a(TITLE, URL))
    second = _stored(id="row-2", canonical_hash=algorithm_b(TITLE, URL, REFERENCE))
    cursor = FakeCursor([first, second])
    outcome = persist_candidate(
        cursor,
        _candidate(),
        observed_at=WHEN,
        heuristics=True,
        reference=REFERENCE,
    )
    assert outcome == "identity_conflict"
    assert _writes(cursor) == []


def test_placeholder_is_rejected_without_insert():
    cursor = FakeCursor([])
    outcome = persist_candidate(
        cursor,
        _candidate(apply_url="https://placeholder.missing-url/abc"),
        observed_at=WHEN,
        heuristics=True,
        reference=REFERENCE,
    )
    assert outcome == "rejected"
    assert cursor.statements == []


def test_create_omits_deleted_at_and_writes_supplementary_once():
    cursor = FakeCursor([])
    outcome = persist_candidate(
        cursor,
        _candidate(latitude=1.5, quality_score=0.8),
        observed_at=WHEN,
        heuristics=False,
        reference=REFERENCE,
    )
    assert outcome == "created"
    sql, params = _writes(cursor)[0]
    assert sql.startswith("INSERT INTO jobs ")
    assert "deleted_at" not in sql
    assert "organisation_id" not in sql
    assert "jobs_side" not in sql
    assert "latitude" in sql
    assert algorithm_a(TITLE, URL) in params
    assert algorithm_b(TITLE, URL, REFERENCE) not in params


def test_real_update_stores_supplementary_and_not_the_hash():
    cursor = FakeCursor([_stored(city="Nairobi")])
    outcome = persist_candidate(
        cursor,
        _candidate(city="Mombasa", latitude=-1.2),
        observed_at=WHEN,
        heuristics=True,
        reference=REFERENCE,
    )
    assert outcome == "updated"
    sql, params = _writes(cursor)[0]
    assert "city = %s" in sql
    assert "latitude = %s" in sql
    assert "canonical_hash" not in sql
    assert "Mombasa" in params
    assert -1.2 in params


def test_missing_validated_key_is_not_a_change():
    cursor = FakeCursor([_stored(description_snippet="Keep me")])
    outcome = persist_candidate(
        cursor,
        _candidate(),
        observed_at=WHEN,
        heuristics=True,
        reference=REFERENCE,
    )
    assert outcome == "unchanged"
    assert "description_snippet" not in _writes(cursor)[0][0]


def test_explicit_none_is_a_change():
    cursor = FakeCursor([_stored(description_snippet="Keep me")])
    outcome = persist_candidate(
        cursor,
        _candidate(description_snippet=None),
        observed_at=WHEN,
        heuristics=True,
        reference=REFERENCE,
    )
    assert outcome == "updated"
    sql, params = _writes(cursor)[0]
    assert "description_snippet = %s" in sql
    assert None in params
    assert "canonical_hash" not in sql


def test_postgres_date_matches_the_same_calendar_text():
    cursor = FakeCursor([_stored(deadline=date(2026, 6, 1))])
    outcome = persist_candidate(
        cursor,
        _candidate(deadline="2026-06-01", latitude=4.0, quality_grade="A"),
        observed_at=WHEN,
        heuristics=True,
        reference=REFERENCE,
    )
    assert outcome == "unchanged"
    sql, _params = _writes(cursor)[0]
    assert "deadline" not in sql
    assert "latitude" not in sql
    assert "quality_grade" not in sql


def test_tuple_row_matches_without_rewriting_hash():
    stored = _stored()
    cursor = FakeCursor([tuple(stored[name] for name in LOAD_COLUMNS)])
    outcome = persist_candidate(
        cursor,
        _candidate(),
        observed_at=WHEN,
        heuristics=True,
        reference=REFERENCE,
    )
    assert outcome == "unchanged"
    assert "canonical_hash" not in _writes(cursor)[0][0]


def test_persist_source_has_no_second_writer():
    text = (ROOT / "contracts" / "persist.py").read_text(encoding="utf-8")
    assert "jobs_side" not in text
    assert "FOR UPDATE" not in text
    assert ".commit(" not in text
    assert ".rollback(" not in text
    assert "deleted_at = NULL" not in text
    assert "deleted_at=NULL" not in text.replace(" ", "")


def test_three_crawlers_use_one_helper_and_do_not_reactivate():
    for name in ("simple_crawler.py", "rss_crawler.py", "api_crawler.py"):
        text = (ROOT / "crawler_v2" / name).read_text(encoding="utf-8")
        assert "persist_candidate" in text
        assert "jobs_side" not in text
        collapsed = text.lower().replace(" ", "")
        assert "deleted_at=null" not in collapsed
        assert "hashlib" not in text


def test_manual_crawl_still_uses_the_single_orchestrator():
    admin = (ROOT / "app" / "crawler_admin.py").read_text(encoding="utf-8")
    assert "get_orchestrator" in admin
    assert "SimpleOrchestrator" not in admin
    orchestrator = (ROOT / "orchestrator.py").read_text(encoding="utf-8")
    assert "self.rss_crawler.crawl_source" in orchestrator
    assert "self.api_crawler.crawl_source" in orchestrator
    assert "self.html_crawler.crawl_source" in orchestrator


def test_production_extractor_does_not_insert():
    html = (ROOT / "crawler_v2" / "simple_crawler.py").read_text(encoding="utf-8")
    assert "enable_storage=False" in html
    assert "shadow_mode=False" in html
    extractor = (ROOT / "pipeline" / "extractor.py").read_text(encoding="utf-8")
    guard = "if db_url and (enable_storage is None or enable_storage):"
    assert guard in extractor
    db_url = "postgresql://example"
    enable_storage = False
    assert not (db_url and (enable_storage is None or enable_storage))
    for name in ("rss_crawler.py", "api_crawler.py"):
        text = (ROOT / "crawler_v2" / name).read_text(encoding="utf-8")
        assert "Extractor(enable_ai=False, enable_snapshots=False, shadow_mode=False)" in text
        assert "db_insert" not in text
