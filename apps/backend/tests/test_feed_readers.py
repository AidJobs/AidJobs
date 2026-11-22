"""W-35 pull request 3b: RSS feed and JSON API readers, shared save fields, Simulate."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from contracts.admission import admit_batch
from contracts.reader import CANDIDATE_FIELDS, UNSAVED_FIELDS, Response
from crawler_v2.api_crawler import SimpleAPICrawler
from crawler_v2.feed_fields import iso_day, job_from_json_item
from crawler_v2.readers import (
    JsonApiReader,
    RssFeedReader,
    api_readers,
    read_listing,
    rss_readers,
)
from crawler_v2.rss_crawler import SimpleRSSCrawler
from crawler_v2.simple_crawler import SimpleCrawler
from crawler_v2.simulate import simulate_api, simulate_rss

_FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _rss_body():
    return (_FIXTURES / "rss_feed" / "sample.xml").read_text(encoding="utf-8")


def _rss_record():
    return json.loads((_FIXTURES / "rss_feed" / "sample.json").read_text(encoding="utf-8"))


def _json_body(name):
    return (_FIXTURES / "json_api" / f"{name}.json").read_text(encoding="utf-8")


def _json_record(name):
    return json.loads(
        (_FIXTURES / "json_api" / f"{name}.jobs.json").read_text(encoding="utf-8")
    )


def test_rss_reader_matches_recorded_fixture():
    record = _rss_record()
    result = asyncio.run(
        read_listing(
            rss_readers(),
            Response(200, _rss_body()),
            {"careers_url": record["url"]},
        )
    )
    assert result.reader == "rss-feed"
    assert result.report() == record["report"]
    assert result.complete is False
    assert result.jobs == record["jobs"]
    for job in result.jobs:
        assert set(job) <= (CANDIDATE_FIELDS | UNSAVED_FIELDS | {"record_class"})


def test_json_reader_reports_completeness_when_total_stated():
    record = _json_record("sample")
    result = asyncio.run(
        read_listing(
            api_readers(),
            Response(200, _json_body("sample")),
            {"careers_url": record["url"]},
        )
    )
    assert result.reader == "json-api"
    assert result.report() == record["report"]
    assert result.complete is True
    assert result.expected == 2
    assert result.jobs == record["jobs"]


def test_json_reader_without_total_reports_incomplete():
    record = _json_record("no_total")
    result = asyncio.run(
        read_listing(
            api_readers(),
            Response(200, _json_body("no_total")),
            {"careers_url": record["url"]},
        )
    )
    assert result.reader == "json-api"
    assert result.report() == record["report"]
    assert result.complete is False
    assert result.jobs == record["jobs"]


def test_rss_and_api_reader_source_types():
    assert RssFeedReader.source_types == frozenset({"rss"})
    assert RssFeedReader.record_class == "rss"
    assert JsonApiReader.source_types == frozenset({"api", "json"})
    assert JsonApiReader.record_class == "api"
    # ATS feeds sit ahead of the generic JSON reader (W-38).
    assert [r.name for r in api_readers()] == [
        "workable-feed",
        "greenhouse-feed",
        "teamtailor-feed",
        "lever-feed",
        "personio-feed",
        "json-api",
    ]


def test_iso_day_keeps_calendar_dates_and_rejects_blank():
    assert iso_day("2026-12-15") == "2026-12-15"
    assert iso_day("2026-12-15T23:59:59Z") == "2026-12-15"
    assert iso_day("15/12/2026") == "2026-12-15"
    assert iso_day("") is None
    assert iso_day("Location") is None


def test_feed_dates_are_iso_before_save():
    job = job_from_json_item(
        {
            "title": "Officer",
            "url": "https://example.org/j/1",
            "deadline": "15/12/2026",
            "published_at": "2026-11-01T08:00:00Z",
        },
        "https://example.org/",
    )
    assert job["deadline"] == "2026-12-15"
    assert job["posted_on"] == "2026-11-01"


def test_rss_admission_keeps_deadline_on_admitted_row():
    # One row alone (not a numeric-id family): RSS admission still needs the deadline.
    jobs = [dict(_rss_record()["jobs"][0])]
    admitted, rejected = admit_batch(jobs, "rss")
    assert rejected == []
    assert admitted[0]["deadline"] == "2026-12-15"
    thin = [dict(_rss_record()["jobs"][1])]
    admitted_thin, rejected_thin = admit_batch(thin, "rss")
    assert admitted_thin == []
    assert rejected_thin and rejected_thin[0][1]


def test_simulate_rss_names_feed_reader():
    result = asyncio.run(simulate_rss(_rss_body(), _rss_record()["url"]))
    assert result["ok"] is True
    assert result["reader"] == "rss-feed"
    assert result["count"] == 2
    assert result["admitted"] >= 1
    assert result["complete"] is False
    assert result["sample"][0]["title"] == "Programme Officer"


def test_simulate_api_names_json_reader_and_completeness():
    result = asyncio.run(simulate_api(_json_body("sample"), _json_record("sample")["url"]))
    assert result["ok"] is True
    assert result["reader"] == "json-api"
    assert result["count"] == 2
    assert result["complete"] is True
    assert result["expected"] == 2
    assert result["admitted"] >= 1


def test_rss_and_api_save_jobs_delegate_to_html_save(monkeypatch):
    """Private RSS/API saves are gone; both call the one SimpleCrawler.save_jobs."""
    calls = []

    def fake_save(
        self, jobs, source_id, org_name, base_url=None, *, run_token=None, loop=None,
        thin=None,
    ):
        calls.append(
            {
                "jobs": jobs,
                "thin": thin,
                "deadline": jobs[0].get("deadline") if jobs else None,
                "description": jobs[0].get("description") if jobs else None,
                "posted_on": jobs[0].get("posted_on") if jobs else None,
            }
        )
        return {
            "inserted": 1,
            "updated": 0,
            "skipped": 0,
            "failed": 0,
            "validated": 1,
            "unrecorded": 0,
            "observed": 0,
            "seen_active": [],
            "not_open_ids": [],
            "created_ids": [],
            "returned_ids": [],
        }

    monkeypatch.setattr(SimpleCrawler, "save_jobs", fake_save)
    row = {
        "title": "Officer",
        "apply_url": "https://example.org/j/1",
        "deadline": "2026-12-15",
        "description": "Full text",
        "posted_on": "2026-11-10",
        "location_raw": "Kenya",
        "admitted": True,
    }
    for cls in (SimpleRSSCrawler, SimpleAPICrawler):
        calls.clear()
        counts = cls("postgresql://unused").save_jobs(
            [dict(row)], "src", "Org", base_url="https://example.org/", run_token="tok"
        )
        assert counts["inserted"] == 1
        assert len(calls) == 1
        assert calls[0]["deadline"] == "2026-12-15"
        assert calls[0]["description"] == "Full text"
        assert calls[0]["posted_on"] == "2026-11-10"


def test_rss_save_forwards_thin_to_shared_save(monkeypatch):
    seen = {}

    def fake_save(
        self, jobs, source_id, org_name, base_url=None, *, run_token=None, loop=None,
        thin=None,
    ):
        seen["thin"] = thin
        return {
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "failed": 0,
            "validated": 0,
            "unrecorded": 0,
            "observed": 1,
            "seen_active": [],
            "not_open_ids": [],
            "created_ids": [],
            "returned_ids": [],
        }

    monkeypatch.setattr(SimpleCrawler, "save_jobs", fake_save)
    thin = [{"title": "Thin", "apply_url": "https://example.org/j/2"}]
    SimpleRSSCrawler("postgresql://unused").save_jobs(
        [], "src", "Org", run_token="tok", thin=thin
    )
    assert seen["thin"] == thin


def test_rss_reader_empty_when_fetch_stopped():
    result = asyncio.run(
        RssFeedReader().read(
            Response(0, "", stop="fetch failed"),
            {"careers_url": "https://careers.example.org/jobfeed"},
        )
    )
    assert result.reader == "rss-feed"
    assert result.jobs == []


def test_json_reader_rejects_non_json_body():
    with pytest.raises(ValueError, match="not JSON"):
        asyncio.run(
            JsonApiReader().read(
                Response(200, "<html>not json</html>"),
                {"careers_url": "https://boards.example.org/api/jobs"},
            )
        )


def test_bare_count_is_not_a_listing_total():
    from crawler_v2.feed_fields import json_listing_report, stated_total

    data = {"count": 2, "jobs": [{"title": "A"}, {"title": "B"}]}
    assert stated_total(data) is None
    report = json_listing_report([], data)
    assert report["complete"] is False
    assert report["stop"] == "no stated total"
    assert stated_total({"total": 10, "jobs": []}) == 10
