"""W-39 completeness reports for every reader (growth plan step 4.10)."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from contracts.reader import Response
from crawler_v2.ats_feeds import jobs_from_greenhouse
from crawler_v2.feed_fields import json_listing_report, stated_total
from crawler_v2.listing_completeness import (
    general_html_report,
    has_unfollowed_pager,
    result_row_count,
    showing_range,
)
from crawler_v2.readers import (
    GeneralReader,
    RssFeedReader,
    WorkableFeedReader,
    api_readers,
    read_listing,
)
from crawler_v2.simple_crawler import SimpleCrawler

_FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _html(name: str) -> str:
    return (_FIXTURES / "general_reader" / name).read_text(encoding="utf-8")


def _body(system: str) -> str:
    folder = _FIXTURES / system
    for candidate in ("sample.json", "sample.xml"):
        path = folder / candidate
        if path.is_file():
            return path.read_text(encoding="utf-8")
    raise FileNotFoundError(system)


def _record(system: str) -> dict:
    return json.loads((_FIXTURES / system / "sample.jobs.json").read_text(encoding="utf-8"))


def test_icrc_excerpt_with_noisy_extract_stays_incomplete():
    html = _html("icrc-listing.html")
    assert showing_range(html) == (1, 12, 12)
    assert result_row_count(html) == 12
    jobs = json.loads((_FIXTURES / "general_reader" / "icrc-listing.json").read_text())["jobs"]
    report = general_html_report(html, jobs)
    # 32 extracted rows vs 12 tiles/total — must not invent complete (W-39 review).
    assert report["complete"] is False
    assert report["expected"] == 12
    assert "read 32 rows" in report["stop"]


def test_showing_range_complete_when_candidates_and_tiles_match():
    html = _html("icrc-complete-showing.html")
    assert showing_range(html) == (1, 2, 2)
    assert result_row_count(html) == 2
    # Decorative load-more must not block a matching stated total.
    assert has_unfollowed_pager(html)
    jobs = [
        {"title": "Role A", "apply_url": "https://careers.icrc.org/job/Geneva-Role-A/1"},
        {"title": "Role B", "apply_url": "https://careers.icrc.org/job/Geneva-Role-B/2"},
    ]
    assert general_html_report(html, jobs) == {
        "pages": 1,
        "expected": 2,
        "complete": True,
        "stop": "showing range complete",
    }
    # Tile count alone must not complete when the reader under-reads.
    assert general_html_report(html, jobs[:1])["complete"] is False


def test_icrc_showing_1_to_12_of_40_is_incomplete():
    html = _html("icrc-partial-showing.html")
    assert showing_range(html) == (1, 12, 40)
    report = general_html_report(html, [{"title": "A"}, {"title": "B"}])
    assert report["complete"] is False
    assert report["expected"] == 40
    assert "pager not followed" in report["stop"]


def test_oxfam_teaser_with_no_total_is_incomplete():
    html = _html("oxfam-listing.html")
    jobs = json.loads((_FIXTURES / "general_reader" / "oxfam-listing.json").read_text())["jobs"]
    report = general_html_report(html, jobs)
    assert report == {
        "pages": 1,
        "expected": 6,
        "complete": False,
        "stop": "no stated total",
    }


def test_general_reader_always_reports_on_finished_extract():
    html, record = (
        _html("oxfam-listing.html"),
        json.loads((_FIXTURES / "general_reader" / "oxfam-listing.json").read_text()),
    )
    crawler = SimpleCrawler("postgresql://example")
    result = asyncio.run(
        GeneralReader(crawler).read(
            Response(200, html),
            {"careers_url": record["url"]},
        )
    )
    assert result.reported is True
    assert result.report() == record["report"]
    assert result.complete is False


def test_named_ats_catalogues_report_complete_without_vendor_total():
    for system, reader_name in (
        ("workable", "workable-feed"),
        ("lever", "lever-feed"),
        ("personio", "personio-feed"),
    ):
        record = _record(system)
        result = asyncio.run(
            read_listing(
                api_readers(),
                Response(200, _body(system)),
                {"careers_url": record["url"]},
            )
        )
        assert result.reader == reader_name
        assert result.report() == record["report"]
        assert result.complete is True


def test_greenhouse_meta_total_shortfall_is_incomplete():
    data = json.loads(_body("greenhouse"))
    data["meta"] = {"total": 5}
    _jobs, report = jobs_from_greenhouse(data, "exampleaid")
    assert report == {
        "pages": 1,
        "expected": 5,
        "complete": False,
        "stop": "fewer rows than stated",
    }


def test_greenhouse_without_meta_total_is_closed_catalogue():
    data = json.loads(_body("greenhouse"))
    del data["meta"]
    jobs, report = jobs_from_greenhouse(data, "exampleaid")
    assert report == {
        "pages": 1,
        "expected": len(jobs),
        "complete": True,
        "stop": None,
    }


def test_generic_rss_and_teamtailor_stay_incomplete():
    rss_record = json.loads((_FIXTURES / "rss_feed" / "sample.json").read_text(encoding="utf-8"))
    rss = asyncio.run(
        RssFeedReader().read(
            Response(200, (_FIXTURES / "rss_feed" / "sample.xml").read_text(encoding="utf-8")),
            {"careers_url": rss_record["url"]},
        )
    )
    assert rss.report() == rss_record["report"]
    assert rss.complete is False

    record = _record("teamtailor")
    tt = asyncio.run(
        read_listing(
            api_readers(),
            Response(200, _body("teamtailor")),
            {"careers_url": record["url"]},
        )
    )
    assert tt.reader == "teamtailor-feed"
    assert tt.report() == record["report"]
    assert tt.complete is False


def test_json_without_total_reports_incomplete_not_null():
    data = {"jobs": [{"title": "A", "url": "https://example.org/a"}]}
    assert stated_total(data) is None
    report = json_listing_report([], data)
    assert report["complete"] is False
    assert report["stop"] == "no stated total"


def test_json_stated_total_with_paging_stays_incomplete():
    data = {
        "total": 1,
        "hasMore": True,
        "jobs": [{"title": "A", "url": "https://example.org/a"}],
    }
    jobs, report = _json_api_jobs_safe(data)
    assert len(jobs) >= 1
    assert report["complete"] is False
    assert report["stop"] == "paging not followed"


def test_closed_catalogue_dropped_row_without_dedupe_is_incomplete():
    from crawler_v2.listing_completeness import closed_catalogue_report

    jobs = [{"title": "A", "apply_url": "https://example.org/a"}]
    assert closed_catalogue_report(jobs, raw_item_count=2)["complete"] is False
    assert closed_catalogue_report(
        jobs, raw_item_count=2, allow_dedupe=True
    )["complete"] is True


def test_lever_non_list_body_is_incomplete():
    from crawler_v2.readers import _lever_feed_jobs

    jobs, report = _lever_feed_jobs('{"not": "a list"}')
    assert jobs == []
    assert report["complete"] is False
    assert report["stop"] == "not a lever postings list"


def _json_api_jobs_safe(data: dict):
    from crawler_v2.feed_fields import job_from_json_item, jobs_array, json_listing_report

    jobs = []
    for item in jobs_array(data):
        job = job_from_json_item(item, "https://example.org/")
        if job:
            jobs.append(job)
    return jobs, json_listing_report(jobs, data)


def test_workable_paging_signal_makes_catalogue_incomplete():
    data = json.loads(_body("workable"))
    data["hasMore"] = True
    result = asyncio.run(
        WorkableFeedReader().read(
            Response(200, json.dumps(data)),
            {"careers_url": "https://apply.workable.com/example-aid/"},
        )
    )
    assert result.complete is False
    assert result.report()["stop"] == "paging not followed"


def test_refused_first_response_still_leaves_report_unset():
    result = asyncio.run(
        RssFeedReader().read(
            Response(0, "", stop="fetch failed"),
            {"careers_url": "https://careers.example.org/jobfeed"},
        )
    )
    assert result.report() is None
    assert result.reported is False
