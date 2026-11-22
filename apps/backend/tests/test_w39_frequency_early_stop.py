"""W-39 pull request 2: decision-13 frequency, one-way health override, listing fingerprint."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from crawler_v2.listing_fingerprint import (
    early_stop_details,
    listing_ids_fingerprint,
    listing_url_keys,
    previous_complete_listing_hash,
)
from orchestrator import (
    DEFAULT_FREQ_DAYS,
    CrawlerOrchestrator,
    default_freq_days,
    resolve_base_freq_days,
)


def test_decision_13_defaults():
    assert DEFAULT_FREQ_DAYS["un"] == 0.5
    assert DEFAULT_FREQ_DAYS["ingo"] == 0.5
    assert DEFAULT_FREQ_DAYS["ngo"] == 1
    assert DEFAULT_FREQ_DAYS["academic"] == 7
    assert DEFAULT_FREQ_DAYS["private"] == 5
    assert default_freq_days("UN") == 0.5
    assert default_freq_days("Ingo") == 0.5
    assert default_freq_days(None) == 1.0
    assert default_freq_days("") == 1.0
    assert default_freq_days("gov") == 1.0


def test_legacy_three_uses_org_type_default():
    assert resolve_base_freq_days(3, "un") == 0.5
    assert resolve_base_freq_days(3, "ingo") == 0.5
    assert resolve_base_freq_days(3, None) == 1.0
    assert resolve_base_freq_days(None, "un") == 0.5
    assert resolve_base_freq_days(0, "ngo") == 1.0
    # Explicit non-legacy values still win.
    assert resolve_base_freq_days(2, "un") == 2.0
    assert resolve_base_freq_days(7, "ngo") == 7.0
    assert resolve_base_freq_days(1, "un") == 1.0


def test_health_recommended_only_shortens_base_before_backoff(monkeypatch):
    orch = CrawlerOrchestrator("postgresql://unused")
    monkeypatch.setattr("orchestrator.random.uniform", lambda a, b: 1.0)
    before = datetime.utcnow()
    # Recommended longer than base must not stretch (old |diff|>2 bug).
    next_run = orch.compute_next_run(
        3,
        "un",
        inserted=0,
        updated=0,
        consecutive_failures=0,
        consecutive_nochange=0,
        health={
            "score": 40,
            "components": {"activity": 10},
            "recommended_frequency_days": 5.0,
        },
    )
    # Soft low-health +1d on 0.5 base → 1.5; recommended 5 must not win.
    delta = next_run - before
    assert timedelta(days=1.4) <= delta <= timedelta(days=1.6)

    # Recommended shorter than base does shorten.
    next_short = orch.compute_next_run(
        3,
        "ngo",
        inserted=0,
        updated=0,
        consecutive_failures=0,
        consecutive_nochange=0,
        health={
            "score": 90,
            "components": {"activity": 90},
            "recommended_frequency_days": 0.5,
        },
    )
    assert timedelta(hours=10) <= (next_short - before) <= timedelta(hours=14)


def test_activity_floors_do_not_raise_a_health_shorten(monkeypatch):
    orch = CrawlerOrchestrator("postgresql://unused")
    monkeypatch.setattr("orchestrator.random.uniform", lambda a, b: 1.0)
    before = datetime.utcnow()
    # Health shortened UN base 0.5 → 0.25; 10 changes must not floor back up to 0.5.
    next_run = orch.compute_next_run(
        3,
        "un",
        inserted=10,
        updated=0,
        consecutive_failures=0,
        consecutive_nochange=0,
        health={
            "score": 90,
            "components": {"activity": 90},
            "recommended_frequency_days": 0.25,
        },
    )
    assert timedelta(hours=5) <= (next_run - before) <= timedelta(hours=7)
    # Without a health shorten, the 10-change band still floors at 0.5 (not 0.25).
    next_half = orch.compute_next_run(
        3,
        "ngo",
        inserted=10,
        updated=0,
        consecutive_failures=0,
        consecutive_nochange=0,
        health=None,
    )
    assert timedelta(hours=11) <= (next_half - before) <= timedelta(hours=13)


def test_failure_backoff_is_not_shortened_by_health(monkeypatch):
    orch = CrawlerOrchestrator("postgresql://unused")
    monkeypatch.setattr("orchestrator.random.uniform", lambda a, b: 1.0)
    before = datetime.utcnow()
    # 3 failures → backoff 6*2^3/24 = 2 days; recommended 0.25 must not pull forward.
    next_run = orch.compute_next_run(
        3,
        "un",
        inserted=0,
        updated=0,
        consecutive_failures=3,
        consecutive_nochange=0,
        health={
            "score": 90,
            "components": {"activity": 90},
            "recommended_frequency_days": 0.25,
        },
    )
    assert (next_run - before) >= timedelta(days=1.9)


def test_nochange_lengthens_after_health_shorten(monkeypatch):
    orch = CrawlerOrchestrator("postgresql://unused")
    monkeypatch.setattr("orchestrator.random.uniform", lambda a, b: 1.0)
    before = datetime.utcnow()
    next_run = orch.compute_next_run(
        3,
        "un",
        inserted=0,
        updated=0,
        consecutive_failures=0,
        consecutive_nochange=3,
        health={
            "score": 90,
            "components": {"activity": 90},
            "recommended_frequency_days": 0.25,
        },
    )
    # Base 0.5 → health to 0.25 → NC +1 → 1.25
    assert timedelta(days=1.2) <= (next_run - before) <= timedelta(days=1.3)


def test_fingerprint_uses_normalised_urls_not_reference():
    jobs = [
        {"apply_url": "https://Jobs.Example.org/a/1/", "reference": "same"},
        {"apply_url": "https://jobs.example.org/a/2", "reference": "same"},
        {"apply_url": "https://jobs.example.org/a/1", "reference": "other"},
    ]
    keys = listing_url_keys(jobs)
    assert len(keys) == 2
    digest, count = listing_ids_fingerprint(jobs)
    assert count == 2
    assert digest and len(digest) == 64
    again, _ = listing_ids_fingerprint(
        [
            {"apply_url": "https://jobs.example.org/a/2"},
            {"apply_url": "https://jobs.example.org/a/1/"},
        ]
    )
    assert again == digest


def test_fingerprint_ignores_reference_only_rows_without_url():
    digest, count = listing_ids_fingerprint([{"reference": "x", "apply_url": ""}])
    assert digest is None
    assert count == 0


@pytest.mark.parametrize(
    "complete, current, previous, expect",
    [
        (True, "abc", "abc", True),
        (True, "abc", "def", False),
        (True, "abc", None, False),
        (False, "abc", "abc", False),
        (None, "abc", "abc", False),
        (True, None, "abc", False),
    ],
)
def test_early_stop_gate(complete, current, previous, expect):
    assert (
        early_stop_details(
            listing_complete=complete,
            current_hash=current,
            previous_hash=previous,
        )
        is expect
    )


def test_newer_complete_null_hash_blocks_older_fingerprint():
    # Run A hashed H; run B complete with null; run C must not early-stop on H.
    assert previous_complete_listing_hash([("H",)]) == "H"
    assert previous_complete_listing_hash([(None,), ("H",)]) is None
    assert previous_complete_listing_hash([("",), ("H",)]) is None
    assert previous_complete_listing_hash([]) is None
    assert (
        early_stop_details(
            listing_complete=True,
            current_hash="H",
            previous_hash=previous_complete_listing_hash([(None,), ("H",)]),
        )
        is False
    )


def test_undp_open_all_is_disabled_when_early_stop():
    source = (
        __import__("pathlib").Path(__file__).resolve().parents[1]
        / "crawler_v2"
        / "simple_crawler.py"
    ).read_text(encoding="utf-8")
    assert "if early_stop and needs_enrichment:" in source
    assert "needs_enrichment = False" in source


def test_lifecycle_stores_hash_only_when_complete():
    class Cursor:
        def __init__(self):
            self.statements = []

        def execute(self, sql, params=None):
            self.statements.append((" ".join(sql.split()), params))

    orch = CrawlerOrchestrator("postgresql://unused")
    cur = Cursor()
    orch._record_lifecycle(
        cur,
        "run-1",
        {
            "listing": {"complete": True, "expected": 2, "stop": "ok"},
            "valid": 2,
            "counts": {},
            "listing_ids_hash": "a" * 64,
            "listing_id_count": 2,
        },
        active_at_start=0,
    )
    sql, params = cur.statements[0]
    assert "listing_ids_hash" in sql
    assert params[-3] == "a" * 64
    assert params[-2] == 2

    cur2 = Cursor()
    orch._record_lifecycle(
        cur2,
        "run-2",
        {
            "listing": {"complete": False, "expected": 2, "stop": "partial"},
            "valid": 1,
            "counts": {},
            "listing_ids_hash": "b" * 64,
            "listing_id_count": 1,
        },
        active_at_start=0,
    )
    assert cur2.statements[0][1][-3] is None
    assert cur2.statements[0][1][-2] is None


def test_recommend_frequency_uses_decision_13_base():
    from app.source_health import SourceHealthScorer

    scorer = SourceHealthScorer("postgresql://unused")
    assert scorer._recommend_frequency(90, 80, "un") == 0.25
    assert scorer._recommend_frequency(90, 80, "ngo") == 0.5  # base 1 − 1
    assert scorer._recommend_frequency(40, 20, "un") >= 2.0
    # Published recommendation keeps two decimals (0.25, not 0.2).
    assert round(scorer._recommend_frequency(90, 80, "un"), 2) == 0.25
