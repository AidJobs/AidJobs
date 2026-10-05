"""Gate 3 contracts. The production crawler is not wired to this package."""
import inspect
from dataclasses import fields
from datetime import datetime, timezone
from pathlib import Path

import pytest

from contracts.extract import extract_candidates
from contracts.fetch import address_permitted, chain_permitted
from contracts.identity import algorithm_a, algorithm_b, both_keys, write_key
from contracts.models import (
    SOURCE_TYPES,
    ContractError,
    CrawlRun,
    Organisation,
    Source,
    assign_organisation,
    mark_partial,
    note_http_status,
    require_source_type,
)
from contracts.normalize import normalize_new_write
from contracts.upsert import UNCHANGED_ON_MATCH, VALIDATED_FIELDS, upsert
from contracts.validate import consider
from core.extraction_heuristics import get_canonical_hash, normalize_url

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
T1 = datetime(2026, 1, 2, tzinfo=timezone.utc)
TITLE = "Analyst"
URL = "https://example.com/jobs/1"
REFERENCE = "REF-1"


def _crawl() -> CrawlRun:
    return CrawlRun(source_id="src-1", started_at=T0)


def _row(**overrides) -> dict:
    row = {
        "id": "row-1",
        "canonical_hash": algorithm_a(TITLE, URL),
        "title": TITLE,
        "apply_url": URL,
        "description_snippet": "Do the work",
        "location_raw": "Nairobi",
        "country": "Kenya",
        "country_iso": "KE",
        "city": "Nairobi",
        "is_remote": False,
        "deadline": None,
        "source_id": "src-1",
        "org_name": "Example Org",
        "organisation_id": "org-1",
        "deleted_at": None,
        "deleted_by": None,
        "deletion_reason": None,
        "status": "active",
        "created_at": T0,
        "fetched_at": T0,
        "last_seen_at": T0,
        "updated_at": T0,
    }
    row.update(overrides)
    return row


def _candidate(row: dict, **overrides) -> dict:
    candidate = {name: row.get(name) for name in VALIDATED_FIELDS}
    candidate["source_id"] = row.get("source_id")
    candidate["org_name"] = row.get("org_name")
    candidate["organisation_id"] = row.get("organisation_id")
    candidate.update(overrides)
    return candidate


def test_validated_field_set_is_named():
    assert VALIDATED_FIELDS == (
        "title",
        "apply_url",
        "description_snippet",
        "location_raw",
        "country",
        "country_iso",
        "city",
        "is_remote",
        "deadline",
    )
    assert "canonical_hash" in UNCHANGED_ON_MATCH
    assert "deleted_at" in UNCHANGED_ON_MATCH


def test_write_path_keeps_todays_branch():
    raw = "https://EXAMPLE.com/jobs/1?utm_source=newsletter"
    assert write_key(TITLE, raw, REFERENCE, heuristics=False) == algorithm_a(TITLE, raw)
    assert write_key(TITLE, raw, REFERENCE, heuristics=True) == algorithm_b(
        TITLE, raw, REFERENCE
    )
    assert algorithm_b(TITLE, raw, REFERENCE) == get_canonical_hash(
        TITLE, normalize_url(raw), REFERENCE
    )
    assert algorithm_a(TITLE, raw) != algorithm_b(TITLE, raw, REFERENCE)


def test_case_a_advances_last_seen_and_keeps_the_stored_key():
    stored = algorithm_a(TITLE, URL)
    row = _row(canonical_hash=stored)
    catalog = [row]
    crawl = _crawl()
    result = upsert(
        catalog,
        _candidate(row),
        crawl,
        observed_at=T1,
        heuristics=True,
        reference=REFERENCE,
    )
    assert result == "unchanged"
    assert len(catalog) == 1
    assert row["id"] == "row-1"
    assert row["canonical_hash"] == stored
    assert row["canonical_hash"] != algorithm_b(TITLE, URL, REFERENCE)
    assert row["last_seen_at"] == T1
    assert row["updated_at"] == T0
    assert crawl.unchanged == 1
    assert crawl.updated == 0
    assert "canonical_key_version" not in row


def test_match_on_algorithm_b_does_not_replace_the_stored_key():
    stored = algorithm_b(TITLE, URL, REFERENCE)
    row = _row(canonical_hash=stored)
    catalog = [row]
    crawl = _crawl()
    result = upsert(
        catalog,
        _candidate(row),
        crawl,
        observed_at=T1,
        heuristics=False,
        reference=REFERENCE,
    )
    assert result == "unchanged"
    assert row["canonical_hash"] == stored
    assert row["canonical_hash"] != write_key(TITLE, URL, REFERENCE, heuristics=False)


def test_case_b_updates_apply_url_without_replacing_the_key():
    raw = "https://example.com/jobs/1?utm_source=newsletter"
    clean = "https://example.com/jobs/1"
    stored = algorithm_b(TITLE, raw, REFERENCE)
    row = _row(canonical_hash=stored, apply_url=raw)
    catalog = [row]
    crawl = _crawl()
    result = upsert(
        catalog,
        _candidate(row, apply_url=clean),
        crawl,
        observed_at=T1,
        heuristics=False,
        reference=REFERENCE,
    )
    assert result == "updated"
    assert row["id"] == "row-1"
    assert row["apply_url"] == clean
    assert row["canonical_hash"] == stored
    assert row["canonical_hash"] != algorithm_a(TITLE, clean)
    assert row["deleted_at"] is None
    assert row["status"] == "active"
    assert row["last_seen_at"] == T1
    assert row["updated_at"] == T1
    assert crawl.updated == 1
    assert len(catalog) == 1


def test_case_c_rediscovery_stays_suppressed():
    row = _row(
        deleted_at=T0,
        deleted_by="admin",
        deletion_reason="duplicate",
        status="active",
    )
    catalog = [row]
    crawl = _crawl()
    result = upsert(
        catalog,
        _candidate(row, description_snippet="Changed copy"),
        crawl,
        observed_at=T1,
        heuristics=False,
    )
    assert result == "seen_again"
    assert row["description_snippet"] == "Do the work"
    assert row["deleted_at"] == T0
    assert row["deleted_by"] == "admin"
    assert row["deletion_reason"] == "duplicate"
    assert row["status"] == "active"
    assert row["canonical_hash"] == algorithm_a(TITLE, URL)
    assert row["last_seen_at"] == T1
    assert row["updated_at"] == T0
    assert crawl.seen_again == 1
    assert crawl.updated == 0
    assert len(catalog) == 1


def test_case_d_inserts_one_row_and_a_repeat_does_not():
    catalog = []
    crawl = _crawl()
    candidate = _candidate(_row())
    assert (
        upsert(catalog, candidate, crawl, observed_at=T0, heuristics=True, reference=REFERENCE)
        == "created"
    )
    assert len(catalog) == 1
    created = catalog[0]
    assert created["canonical_hash"] == algorithm_b(TITLE, URL, REFERENCE)
    assert created["canonical_hash"] != algorithm_a(TITLE, URL)
    assert created["status"] == "active"
    assert created["deleted_at"] is None
    assert "canonical_key_version" not in created
    assert (
        upsert(catalog, candidate, crawl, observed_at=T1, heuristics=True, reference=REFERENCE)
        == "unchanged"
    )
    assert len(catalog) == 1
    assert created["last_seen_at"] == T1
    assert created["updated_at"] == T0
    assert crawl.created == 1
    assert crawl.unchanged == 1


def test_both_keys_hitting_different_rows_writes_nothing():
    key_a, key_b = both_keys(TITLE, URL, REFERENCE)
    assert key_a != key_b
    first = _row(id="row-a", canonical_hash=key_a)
    second = _row(id="row-b", canonical_hash=key_b)
    before = (dict(first), dict(second))
    catalog = [first, second]
    crawl = _crawl()
    result = upsert(
        catalog,
        _candidate(first),
        crawl,
        observed_at=T1,
        heuristics=True,
        reference=REFERENCE,
    )
    assert result == "identity_conflict"
    assert catalog == [first, second]
    assert first == before[0]
    assert second == before[1]
    assert crawl.identity_conflict == 1
    assert crawl.created == 0
    assert crawl.updated == 0


def test_organisations_are_not_merged_by_name():
    shared = dict(
        slug="acme",
        type="ngo",
        website_url="https://acme.example",
        status="active",
        created_at=T0,
        updated_at=T0,
    )
    first = Organisation(id="org-1", name="Acme Relief", **shared)
    second = Organisation(id="org-2", name="Acme Relief", **shared)
    assert first.id != second.id
    assert {first.id, second.id} == {"org-1", "org-2"}


def test_job_organisation_comes_from_its_source():
    source = Source(
        id="src-1",
        organisation_id="org-1",
        url="https://example.org/careers",
        source_type="html",
    )
    original = {"org_name": "Example Org", "organisation_id": None}
    assigned = assign_organisation(original, source)
    assert assigned["organisation_id"] == "org-1"
    assert assigned["org_name"] == "Example Org"
    assert original["organisation_id"] is None
    with pytest.raises(ContractError):
        assign_organisation({"organisation_id": "org-9", "org_name": "Other"}, source)


def test_browser_rendering_is_not_a_source_type():
    assert SOURCE_TYPES == frozenset({"html", "rss", "api"})
    assert require_source_type("rss") == "rss"
    with pytest.raises(ContractError):
        require_source_type("browser")


def test_crawl_run_http_200_and_partial_are_not_trusted_catalogues():
    crawl = _crawl()
    note_http_status(crawl, 200)
    assert crawl.http_status == 200
    assert crawl.trustworthy is False
    mark_partial(crawl)
    assert crawl.status == "partial"
    assert crawl.trustworthy is False
    names = {item.name for item in fields(CrawlRun)}
    assert "expired" not in names
    assert not any("archiv" in name for name in names)


def test_fetch_rejects_private_addresses_and_fails_closed():
    assert address_permitted("8.8.8.8") is True
    for blocked in (
        "127.0.0.1",
        "10.1.1.1",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "::1",
        "fe80::1",
    ):
        assert address_permitted(blocked) is False
    assert chain_permitted(["1.1.1.1"]) is True
    assert chain_permitted(["8.8.8.8", "10.0.0.1"]) is False
    assert chain_permitted(["8.8.8.8", None]) is False
    assert chain_permitted([]) is False


def test_extract_takes_content_and_returns_candidates():
    signature = inspect.signature(extract_candidates)
    assert list(signature.parameters) == ["content", "extractor"]

    def stub(content: str) -> list[dict]:
        assert content == "<html>"
        return [{"title": "Role"}]

    assert extract_candidates("<html>", stub) == [{"title": "Role"}]


def test_normalize_collapses_title_whitespace_and_does_not_invent_a_deadline():
    stored = {"title": "  Hello   World ", "deadline": None}
    result = normalize_new_write(stored)
    assert result["title"] == "Hello World"
    assert result["deadline"] is None
    assert stored["title"] == "  Hello   World "
    missing = {"title": "Role"}
    assert "deadline" not in normalize_new_write(missing)


def test_validate_rejections_are_recorded_on_the_crawl():
    crawl = _crawl()
    cases = {
        "missing_title": {"title": "  ", "apply_url": URL},
        "missing_apply_url": {"title": TITLE, "apply_url": ""},
        "mailto": {"title": TITLE, "apply_url": "mailto:jobs@example.org"},
        "placeholder": {
            "title": TITLE,
            "apply_url": "https://placeholder.missing-url/abc",
        },
        "search_or_pagination": {"title": TITLE, "apply_url": f"{URL}?page=2"},
        "root_careers_page": {"title": TITLE, "apply_url": "https://example.org/careers"},
        "quality_score_too_low": {"title": TITLE, "apply_url": URL, "quality_score": 0.24},
    }
    for reason, job in cases.items():
        assert consider(job, crawl) == reason
    assert crawl.rejected == len(cases)
    accepted = {"title": TITLE, "apply_url": f"{URL}/analyst", "quality_score": 0.25}
    assert consider(accepted, crawl) is None
    assert crawl.rejected == len(cases)


def test_crawlers_persist_through_the_single_helper():
    """Gate 4 wires the three savers. The orchestrators still only dispatch."""
    root = Path(__file__).resolve().parents[1]
    for name in ("simple_crawler.py", "rss_crawler.py", "api_crawler.py"):
        text = (root / "crawler_v2" / name).read_text(encoding="utf-8")
        assert "from contracts.persist import persist_candidate" in text
        assert "from contracts.upsert" not in text
        assert "from contracts.validate" not in text
    for name in ("crawler_v2/orchestrator.py", "orchestrator.py"):
        text = (root / name).read_text(encoding="utf-8")
        assert "from contracts" not in text
        assert "import contracts" not in text


def test_package_does_not_mention_a_key_version():
    package = Path(__file__).resolve().parents[1] / "contracts"
    for path in package.glob("*.py"):
        assert "canonical_key_version" not in path.read_text(encoding="utf-8")
