"""The reader interface (ledger W-35): its shapes, the HTML readers' order and fall-through, the
reader recorded for each crawl, and a new employer on a known system read with no code."""
import asyncio
import json
from pathlib import Path

import pytest

from contracts.outbound import FetchResult
from contracts.reader import (
    CANDIDATE_FIELDS,
    UNSAVED_FIELDS,
    ListingResult,
    Reader,
    Request,
    Response,
)
from crawler_v2 import simple_crawler
from crawler_v2.readers import (
    LISTING_READER,
    LISTING_STRATEGY,
    GeneralReader,
    PageUpReader,
    SitesReader,
    html_readers,
    read_listing,
)
from crawler_v2.simple_crawler import SimpleCrawler

_FIXTURES = Path(__file__).resolve().parent / "fixtures"
_REPORT = {"pages": 2, "expected": 3, "complete": True, "stop": "no More Jobs link"}


def _crawler():
    return SimpleCrawler("postgresql://unused")


def _fixture(folder, name):
    html = (_FIXTURES / folder / f"{name}.html").read_bytes().decode("utf-8")
    record_path = _FIXTURES / folder / f"{name}.json"
    record = json.loads(record_path.read_text(encoding="utf-8")) if record_path.exists() else {}
    return html, record


def _sites_page(host, numbers, total):
    cards = "".join(
        '<article class="col-12 job-search-results-card-col"><div class="card">'
        '<h3 class="card-title job-search-results-card-title">'
        f'<a href="{host}/jobs/officer-{n}">Officer {n}</a></h3>'
        '<li class="job-component-location"><span> Kenya </span></li>'
        '<li class="job-component-employment-type"><span> Consultancy </span></li>'
        '<li class="job-component-closing-at"><span> Closing at: 20 Dec 2026 - 23:55 EAT </span>'
        "</li></div></article>"
        for n in numbers
    )
    return (
        f"<html><body>{cards}"
        f'<div class="table-counts"><p> Displaying <b>1 - x</b> of <b>{total}</b> in total</p>'
        '</div><nav class="pagination" engine="Sites::Engine"><ul>'
        '<li class="next next_page disabled page-item"><a href="">›</a></li></ul></nav>'
        "</body></html>"
    )


# The shapes ---------------------------------------------------------------------------------

def test_a_result_without_a_report_gives_none():
    assert ListingResult("general", [{"title": "x"}]).report() is None


@pytest.mark.parametrize("report", [
    dict(_REPORT),
    {},
    {**_REPORT, "extra": 1},
    {"pages": 1},
    {"pages": 1, "expected": None, "complete": None, "stop": "x"},
    ["not", "a", "dict"],
])
def test_a_walks_report_is_handed_on_as_it_is(report):
    result = ListingResult.from_report("pageup", [{"title": "x"}], report)
    assert result.report() is report


def test_a_walks_report_fills_the_typed_fields():
    result = ListingResult.from_report("pageup", [], dict(_REPORT))
    assert (result.reported, result.complete, result.expected, result.pages, result.stop) == (
        True, True, 3, 2, "no More Jobs link"
    )
    assert ListingResult.from_report("pageup", [], {}).pages is None


def test_a_result_built_by_a_reader_gives_the_four_keys():
    result = ListingResult("feed", [], reported=True, complete=False, expected=9, pages=1,
                           stop="page cap")
    assert result.report() == {"pages": 1, "expected": 9, "complete": False, "stop": "page cap"}


@pytest.mark.parametrize("report", [{}, {**_REPORT, "extra": 1}, ["x"]])
def test_the_listing_step_returns_the_walks_own_report(report):
    crawler = _crawler()
    rows = [{"title": "Officer", "apply_url": "https://jobs.example/job/1"}]

    async def pageup(html, url):
        return rows, report

    crawler._pageup_listing_jobs = pageup
    jobs, got = asyncio.run(crawler._listing_jobs("<html></html>", "https://jobs.example/"))
    assert jobs is rows and got is report


def test_a_reader_by_default_is_chosen_by_the_page_and_opens_no_job_page():
    reader = Reader()
    assert reader.first_request({"careers_url": "https://jobs.example/"}) is None
    assert reader.marks("<html></html>") is False
    assert reader.read_job_page is None
    assert (reader.record_class, reader.budget_group) == ("html", None)
    assert reader.source_types == frozenset({"html"})
    with pytest.raises(NotImplementedError):
        asyncio.run(reader.read(Response(200, ""), {}))


def test_the_html_readers_in_todays_order():
    assert [reader.name for reader in html_readers(_crawler())] == [
        "pageup", "sites-engine", "general"
    ]
    assert [type(reader) for reader in html_readers(_crawler())] == [
        PageUpReader, SitesReader, GeneralReader
    ]


@pytest.mark.parametrize("folder, name", [
    ("general_reader", "icrc-listing"),
    ("general_reader", "oxfam-listing"),
    ("unicef_listing", "page1-items50"),
    ("unicef_sites", "page1-default"),
])
def test_every_reader_sets_only_the_documented_fields(folder, name):
    html, record = _fixture(folder, name)
    url = record.get("url", "https://jobs.unicef.org/jobs/search")

    async def no_page(_url):
        return 0, "", ""

    crawler = _crawler()
    crawler._fetch_listing_page = no_page
    jobs, _report = asyncio.run(crawler._listing_jobs(html, url))
    assert jobs
    assert {key for job in jobs for key in job} <= CANDIDATE_FIELDS | UNSAVED_FIELDS


# The order and the fall-through --------------------------------------------------------------

def _first():
    return Response(200, "<html><body>listing</body></html>")


def _source():
    return {"careers_url": "https://jobs.example/"}


def test_the_first_reader_with_rows_wins_and_the_others_are_not_asked():
    crawler = _crawler()
    rows = [{"title": "Officer", "apply_url": "https://jobs.example/job/1"}]
    asked = []

    async def pageup(html, url):
        asked.append("pageup")
        return rows, dict(_REPORT)

    async def sites(html, url):
        asked.append("sites")
        return [], None

    crawler._pageup_listing_jobs = pageup
    crawler._sites_listing_jobs = sites
    crawler.extract_jobs_from_html = lambda html, url: asked.append("general") or []
    result = asyncio.run(read_listing(html_readers(crawler), _first(), _source()))
    assert asked == ["pageup"]
    assert result.jobs is rows
    assert (result.reader, result.report()) == ("pageup", _REPORT)


def test_a_reader_that_fails_or_reads_nothing_passes_the_page_on():
    crawler = _crawler()
    general_rows = [{"title": "Officer", "apply_url": "https://jobs.example/job/1"}]

    async def pageup(html, url):
        raise ValueError("broken cards")

    async def sites(html, url):
        return [], {"pages": 1, "expected": 0, "complete": True, "stop": "x"}

    crawler._pageup_listing_jobs = pageup
    crawler._sites_listing_jobs = sites
    crawler.extract_jobs_from_html = lambda html, url: general_rows

    async def listing():
        jobs, report = await crawler._listing_jobs(_first().body, _source()["careers_url"])
        return jobs, report, LISTING_READER.get()

    jobs, report, reader = asyncio.run(listing())
    assert jobs is general_rows and reader == "general"
    assert report == {
        "pages": 1,
        "expected": 1,
        "complete": False,
        "stop": "no stated total",
    }


@pytest.mark.parametrize("stop", [asyncio.CancelledError, KeyboardInterrupt])
def test_a_cancelled_or_interrupted_reader_is_not_passed_on(stop):
    crawler = _crawler()

    async def pageup(html, url):
        raise stop()

    def general(html, url):
        raise AssertionError("the general reader was asked")

    crawler._pageup_listing_jobs = pageup
    crawler.extract_jobs_from_html = general
    with pytest.raises(stop):
        asyncio.run(crawler._listing_jobs("<html></html>", "https://jobs.example/"))


def test_the_fall_through_is_logged(caplog):
    crawler = _crawler()
    rows = [{"title": "Officer", "apply_url": "https://jobs.example/job/1"}]

    async def pageup(html, url):
        raise ValueError("broken cards")

    async def sites(html, url):
        return rows, None

    crawler._pageup_listing_jobs = pageup
    crawler._sites_listing_jobs = sites
    with caplog.at_level("INFO", logger="crawler_v2.readers"):
        asyncio.run(crawler._listing_jobs("<html></html>", "https://jobs.example/"))
    assert "PageUp career-site reader failed: broken cards, falling back to rule-based" \
        in caplog.text
    assert "Sites career-site reader found 1 jobs" in caplog.text


def test_the_general_readers_failure_fails_the_listing():
    crawler = _crawler()

    def broken(html, url):
        raise RuntimeError("the general reader broke")

    crawler.extract_jobs_from_html = broken
    with pytest.raises(RuntimeError, match="the general reader broke"):
        asyncio.run(crawler._listing_jobs("<html></html>", "https://jobs.example/"))


def test_each_reader_is_looked_up_when_it_runs():
    crawler = _crawler()
    readers = html_readers(crawler)
    rows = [{"title": "Officer", "apply_url": "https://jobs.example/job/1"}]

    async def pageup(html, url):
        return rows, None

    crawler._pageup_listing_jobs = pageup
    result = asyncio.run(read_listing(readers, _first(), _source()))
    assert result.jobs is rows and result.reader == "pageup"


def test_a_general_reader_reading_nothing_gives_an_empty_listing():
    crawler = _crawler()
    crawler.extract_jobs_from_html = lambda html, url: []
    jobs, report = asyncio.run(crawler._listing_jobs("<html></html>", "https://jobs.example/"))
    assert jobs == []
    assert report == {
        "pages": 1,
        "expected": None,
        "complete": False,
        "stop": "no stated total",
    }


# The fetch handed in ------------------------------------------------------------------------

def test_a_fetch_handed_in_answers_the_walks_later_pages():
    crawler = _crawler()

    async def never(_url):
        raise AssertionError("the crawler's own fetch was used")

    crawler._fetch_listing_page = never
    asked = []

    async def fetch(request):
        asked.append(request)
        return Response(0, "", stop="")

    first = _sites_page("https://careers.example.org", [1], 2).replace(
        'class="next next_page disabled page-item"><a href="">',
        'class="next next_page page-item"><a rel="next" href="/jobs/search?page=2">',
    )
    source = {"careers_url": "https://careers.example.org/jobs/search"}
    result = asyncio.run(read_listing(html_readers(crawler), Response(200, first), source, fetch))
    assert asked == [Request("https://careers.example.org/jobs/search?per_page=100")]
    assert result.reader == "sites-engine"
    assert result.complete is False


# The reader recorded for each crawl ---------------------------------------------------------

@pytest.mark.parametrize("folder, name, reader, strategy", [
    ("general_reader", "icrc-listing", "general", "selector-links"),
    ("general_reader", "oxfam-listing", "general", "selector-divs"),
    ("unicef_listing", "page1-items50", "pageup", None),
])
def test_the_listing_step_names_its_reader_and_strategy(folder, name, reader, strategy):
    html, record = _fixture(folder, name)
    crawler = _crawler()

    async def no_page(_url):
        return 0, "", ""

    crawler._fetch_listing_page = no_page

    async def listing():
        await crawler._listing_jobs(html, record["url"])
        return LISTING_READER.get(), LISTING_STRATEGY.get()

    assert asyncio.run(listing()) == (reader, strategy)


def test_structured_data_found_first_is_named():
    html = (
        '<html><head><script type="application/ld+json">'
        '{"@type": "JobPosting", "title": "Programme Officer",'
        ' "url": "https://jobs.example/job/1", "jobLocation": {"name": "Nairobi"}}'
        "</script></head><body></body></html>"
    )
    crawler = _crawler()

    async def listing():
        jobs, _ = await crawler._listing_jobs(html, "https://jobs.example/")
        return len(jobs), LISTING_READER.get(), LISTING_STRATEGY.get()

    assert asyncio.run(listing()) == (1, "general", "structured-first")


def test_a_second_listing_in_one_crawl_starts_with_no_strategy():
    icrc_html, icrc_record = _fixture("general_reader", "icrc-listing")
    crawler = _crawler()

    async def two_listings():
        await crawler._listing_jobs(icrc_html, icrc_record["url"])
        first = LISTING_STRATEGY.get()
        crawler.extract_jobs_from_html = lambda html, url: []
        await crawler._listing_jobs("<html></html>", icrc_record["url"])
        return first, LISTING_STRATEGY.get()

    assert asyncio.run(two_listings()) == ("selector-links", None)


def test_concurrent_crawls_keep_their_own_reader():
    pageup_html, pageup_record = _fixture("unicef_listing", "page1-items50")
    icrc_html, icrc_record = _fixture("general_reader", "icrc-listing")
    crawler = _crawler()

    async def no_page(_url):
        await asyncio.sleep(0.01)
        return 0, "", ""

    crawler._fetch_listing_page = no_page

    async def one(html, url):
        await crawler._listing_jobs(html, url)
        await asyncio.sleep(0.02)
        return LISTING_READER.get()

    async def both():
        return await asyncio.gather(
            asyncio.create_task(one(pageup_html, pageup_record["url"])),
            asyncio.create_task(one(icrc_html, icrc_record["url"])),
        )

    assert asyncio.run(both()) == ["pageup", "general"]


class _Logger:
    def __init__(self):
        self.extractions = []

    def log_extraction(self, **kwargs):
        self.extractions.append(kwargs)

    def log_failed_insert(self, **_kwargs):
        pass


class _Run:
    token = "run-1"

    def __init__(self):
        self.saved = []

    async def save(self, save_jobs, jobs, source_id, org_name, **_kwargs):
        self.saved.append([dict(job) for job in jobs])
        return {"inserted": len(jobs), "updated": 0, "skipped": 0, "failed": 0}


def _crawl(monkeypatch, html, url, listing=None):
    async def fake_fetch_url(_url, **_kwargs):
        return FetchResult(200, {}, html.encode("utf-8"), url)

    async def no_page(_url):
        return 0, "", ""

    async def same(job, _base_url):
        return job

    monkeypatch.setattr(simple_crawler, "fetch_url", fake_fetch_url)
    crawler = _crawler()
    crawler.html_storage = None
    crawler.quality_scorer = None
    crawler.extraction_logger = _Logger()
    crawler._saved_jobs_for_pages = lambda source_id, run_token: ({}, 0, None)
    crawler._fetch_listing_page = no_page
    crawler.enrich_job_from_detail_page = same
    if listing is not None:
        crawler._listing_jobs = listing
    run = _Run()
    source = {"id": "src-1", "org_name": "Example", "careers_url": url, "source_type": "html"}
    result = asyncio.run(crawler.crawl_source(source, run))
    return result, run, crawler.extraction_logger.extractions[-1]["extracted_fields"]


def test_a_new_employer_on_a_known_system_is_read_with_no_code(monkeypatch):
    url = "https://careers.example.org/jobs/search"
    html = _sites_page("https://careers.example.org", [1, 2, 3], 3)
    result, run, fields = _crawl(monkeypatch, html, url)
    assert result["status"] == "ok"
    assert result["counts"]["found"] == 3
    assert result["message"] == "Found 3 jobs; listing complete: 1 page, expected 3"
    assert result["listing"] == {"pages": 1, "expected": 3, "complete": True,
                                 "stop": "no next-page link"}
    assert result["valid"] == 3
    assert [job["title"] for job in run.saved[0]] == ["Officer 1", "Officer 2", "Officer 3"]
    assert all(job["admitted"] and job["deadline"] == "2026-12-20" for job in run.saved[0])
    assert fields["reader"] == "sites-engine" and "strategy" not in fields
    assert fields["listing_complete"] is True


def test_the_general_readers_crawl_records_its_strategy(monkeypatch):
    html, record = _fixture("general_reader", "icrc-listing")
    result, _run, fields = _crawl(monkeypatch, html, record["url"])
    # The page's stated total (12) matches its 12 vacancy links, so the listing reads complete
    # and reports 12 vacancies as found (navigation links excluded, matching listing_expected).
    # Thin listing rows are not admitted without job pages, so the canary notes that (W-35)
    # using the full extracted row count (32); extraction_logs still records job_count=32.
    assert result["status"] == "ok"
    assert result["counts"]["found"] == 12
    assert result["message"].startswith("Found 12 jobs; listing complete: 1 page, expected 12")
    assert "canary: rows read but none admitted or observed" in result["message"]
    assert (fields["reader"], fields["strategy"]) == ("general", "selector-links")
    assert fields["job_count"] == 32
    assert fields.get("canary") == ["rows read but none admitted or observed"]
    assert fields["listing_complete"] is True
    assert fields["listing_expected"] == 12


def test_canary_warnings_do_not_change_status_or_valid(monkeypatch):
    # A canary note must not flip status or zero the admitted count (review mutation E/F).
    monkeypatch.setattr(
        simple_crawler, "canary_evaluate", lambda **_kwargs: ["probe warning"]
    )
    url = "https://careers.example.org/jobs/search"
    html = _sites_page("https://careers.example.org", [1, 2, 3], 3)
    result, _run, fields = _crawl(monkeypatch, html, url)
    assert result["status"] == "ok"
    assert result["valid"] == 3
    assert result["counts"]["found"] == 3
    assert "canary: probe warning" in result["message"]
    assert fields.get("canary") == ["probe warning"]


def test_a_replaced_listing_step_is_recorded_as_unknown(monkeypatch):
    async def listing(html, url):
        return [{"title": "Officer", "apply_url": "https://jobs.example/job/1/x"}], None

    _result, _run, fields = _crawl(monkeypatch, "<html></html>", "https://jobs.example/", listing)
    assert fields["reader"] == "unknown" and "strategy" not in fields


def test_each_crawl_starts_with_no_reader_named(monkeypatch):
    html, record = _fixture("general_reader", "icrc-listing")

    async def listing(html, url):
        return [{"title": "Officer", "apply_url": "https://jobs.example/job/1/x"}], None

    async def two_crawls():
        crawler = _crawler()
        crawler.html_storage = None
        crawler.quality_scorer = None
        crawler.extraction_logger = _Logger()
        crawler._saved_jobs_for_pages = lambda source_id, run_token: ({}, 0, None)

        async def same(job, _base_url):
            return job

        crawler.enrich_job_from_detail_page = same
        source = {"id": "s", "org_name": "E", "careers_url": record["url"], "source_type": "html"}
        await crawler.crawl_source(dict(source), _Run())
        crawler._listing_jobs = listing
        await crawler.crawl_source(dict(source), _Run())
        return [entry["extracted_fields"] for entry in crawler.extraction_logger.extractions]

    async def fake_fetch_url(_url, **_kwargs):
        return FetchResult(200, {}, html.encode("utf-8"), record["url"])

    monkeypatch.setattr(simple_crawler, "fetch_url", fake_fetch_url)
    first, second = asyncio.run(two_crawls())
    assert (first["reader"], first["strategy"]) == ("general", "selector-links")
    assert second["reader"] == "unknown" and "strategy" not in second


def test_general_html_with_only_navigation_rows_reports_zero_found(monkeypatch):
    nav_rows = [
        {"title": f"Category {n}", "apply_url": f"https://careers.example.org/go/Cat-{n}/{n}"}
        for n in range(4)
    ]
    crawler = _crawler()
    crawler.html_storage = None
    crawler.quality_scorer = None
    crawler.extraction_logger = _Logger()
    crawler._saved_jobs_for_pages = lambda source_id, run_token: ({}, 0, None)
    crawler._extract_jobs_sync = lambda body, url: (list(nav_rows), "selector-links")

    async def fake_fetch_url(_url, **_kwargs):
        return FetchResult(200, {}, b"<html><body><p>nav only</p></body></html>", _url)

    monkeypatch.setattr(simple_crawler, "fetch_url", fake_fetch_url)
    source = {
        "id": "src-nav",
        "org_name": "Example",
        "careers_url": "https://careers.example.org/go/Global/1/",
        "source_type": "html",
    }
    result = asyncio.run(crawler.crawl_source(source, _Run()))
    fields = crawler.extraction_logger.extractions[-1]["extracted_fields"]
    assert result["counts"]["found"] == 0
    assert result["status"] == "warn"
    assert result["message"].startswith("No jobs found")
    assert "canary: rows read but none admitted or observed" in result["message"]
    assert fields["reader"] == "general"
    assert fields["job_count"] == 4


def test_general_html_found_counts_all_vacancies_before_page_cap_holdback(monkeypatch):
    from crawler_v2 import job_pages

    monkeypatch.setattr(job_pages, "NEW_PAGE_CAP", 3)
    base = "https://careers.icrc.org/job/Geneva-Role-"
    vacancies = [
        {"title": f"Role {n}", "apply_url": f"{base}{n}/{1000 + n}"}
        for n in range(5)
    ]
    nav_rows = [
        {"title": f"Category {n}", "apply_url": f"https://careers.icrc.org/go/Category-{n}/{n}"}
        for n in range(4)
    ]
    tiles = "".join(
        f'<li class="job-tile"><a href="/job/Geneva-Role-{n}/{1000 + n}">Role {n}</a></li>'
        for n in range(5)
    )
    html = (
        '<p id="tile-search-results-label">Showing 1 to 5 of 5 Jobs</p>'
        f'<ul id="job-tile-list">{tiles}</ul>'
    )

    crawler = _crawler()
    crawler.html_storage = None
    crawler.quality_scorer = None
    crawler.extraction_logger = _Logger()
    crawler._saved_jobs_for_pages = lambda source_id, run_token: ({}, 0, None)
    crawler._extract_jobs_sync = lambda body, url: (list(vacancies + nav_rows), "selector-links")

    async def same(job, _base_url):
        return job

    async def fake_fetch_url(_url, **_kwargs):
        return FetchResult(200, {}, html.encode("utf-8"), _url)

    crawler.enrich_job_from_detail_page = same
    monkeypatch.setattr(simple_crawler, "fetch_url", fake_fetch_url)
    source = {
        "id": "src-cap",
        "org_name": "ICRC",
        "careers_url": "https://careers.icrc.org/go/Global/1/",
        "source_type": "html",
    }
    result = asyncio.run(crawler.crawl_source(source, _Run()))
    assert result["counts"]["found"] == 5
    assert result["status"] == "warn"
    assert result["listing"]["complete"] is False
    assert result["listing"]["expected"] == 5
    assert result["message"].startswith(
        "Found 5 jobs; listing partial: 1 page, expected 5, "
        "stopped: 5 vacancies, more than the 3 job pages read in a crawl"
    )
