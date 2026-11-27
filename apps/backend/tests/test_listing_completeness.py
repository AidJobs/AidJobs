"""W-39 completeness reports for every reader (growth plan step 4.10)."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from contracts.admission import page_verdicts
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


def _label_page(total: int) -> str:
    """A listing with 'Showing 1 to N of N Jobs' and N job tiles, as ICRC's page shows."""
    tiles = "".join(
        f'<li class="job-tile"><a href="/job/Geneva-Role-{n}/{1000 + n}">Role {n}</a></li>'
        for n in range(total)
    )
    return (
        f'<p id="tile-search-results-label">Showing 1 to {total} of {total} Jobs</p>'
        f'<ul id="job-tile-list">{tiles}</ul>'
    )


def _vacancy_rows(total: int) -> list:
    base = "https://careers.icrc.org/job/Geneva-Role-"
    return [{"title": f"Role {n}", "apply_url": f"{base}{n}/{1000 + n}"} for n in range(total)]


def _navigation_rows(count: int) -> list:
    return [
        {"title": f"Category {n}", "apply_url": f"https://careers.icrc.org/go/Category-{n}/{n}"}
        for n in range(count)
    ]


def test_icrc_excerpt_reads_complete_with_its_twelve_vacancies():
    html = _html("icrc-listing.html")
    assert showing_range(html) == (1, 12, 12)
    assert result_row_count(html) == 12
    jobs = json.loads((_FIXTURES / "general_reader" / "icrc-listing.json").read_text())["jobs"]
    assert len(jobs) == 32
    # 32 extracted candidates, of which 12 are vacancy links. Only the vacancies are compared
    # with the stated total (ICRC, 28 November 2026).
    vacancies = len(page_verdicts(jobs, "html"))
    assert vacancies == 12
    assert general_html_report(html, jobs, vacancies=vacancies, page_cap=40) == {
        "pages": 1,
        "expected": 12,
        "complete": True,
        "stop": "showing range complete",
    }


def test_navigation_rows_do_not_count_against_a_complete_listing():
    html = _label_page(11)
    jobs = _vacancy_rows(11) + _navigation_rows(12)
    vacancies = len(page_verdicts(jobs, "html"))
    assert vacancies == 11
    report = general_html_report(html, jobs, vacancies=vacancies, page_cap=40)
    assert report["complete"] is True
    assert report["stop"] == "showing range complete"


def test_fewer_vacancies_than_the_stated_total_stay_incomplete():
    html = _label_page(11)
    jobs = _vacancy_rows(10) + _navigation_rows(12)
    vacancies = len(page_verdicts(jobs, "html"))
    report = general_html_report(html, jobs, vacancies=vacancies, page_cap=40)
    assert report["complete"] is False
    assert report["expected"] == 11
    assert "read 10 vacancies" in report["stop"]


def test_vacancies_above_the_page_cap_stay_incomplete():
    html = _label_page(41)
    jobs = _vacancy_rows(41)
    vacancies = len(page_verdicts(jobs, "html"))
    assert vacancies == 41
    report = general_html_report(html, jobs, vacancies=vacancies, page_cap=40)
    assert report["complete"] is False
    assert report["expected"] == 41
    assert "more than the 40 job pages" in report["stop"]


def test_showing_range_complete_when_vacancies_and_tiles_match():
    html = _html("icrc-complete-showing.html")
    assert showing_range(html) == (1, 2, 2)
    assert result_row_count(html) == 2
    # Decorative load-more must not block a matching stated total.
    assert has_unfollowed_pager(html)
    jobs = [
        {"title": "Role A", "apply_url": "https://careers.icrc.org/job/Geneva-Role-A/1"},
        {"title": "Role B", "apply_url": "https://careers.icrc.org/job/Geneva-Role-B/2"},
    ]
    assert general_html_report(html, jobs, vacancies=2, page_cap=40) == {
        "pages": 1,
        "expected": 2,
        "complete": True,
        "stop": "showing range complete",
    }
    # Fewer vacancies than the total: the reader under-reads, so it cannot complete.
    assert general_html_report(html, jobs[:1], vacancies=1, page_cap=40)["complete"] is False


def test_icrc_showing_1_to_12_of_40_is_incomplete():
    html = _html("icrc-partial-showing.html")
    assert showing_range(html) == (1, 12, 40)
    jobs = [{"title": "A"}, {"title": "B"}]
    report = general_html_report(html, jobs, vacancies=2, page_cap=40)
    assert report["complete"] is False
    assert report["expected"] == 40
    assert "pager not followed" in report["stop"]


def test_oxfam_teaser_with_no_total_is_incomplete():
    html = _html("oxfam-listing.html")
    jobs = json.loads((_FIXTURES / "general_reader" / "oxfam-listing.json").read_text())["jobs"]
    vacancies = len(page_verdicts(jobs, "html"))
    report = general_html_report(html, jobs, vacancies=vacancies, page_cap=40)
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
