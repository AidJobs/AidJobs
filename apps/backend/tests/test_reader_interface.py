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


def test_a_walks_report_comes_back_unchanged():
    result = ListingResult.from_report("pageup", [], dict(_REPORT))
    assert result.report() == _REPORT
    assert list(result.report()) == ["pages", "expected", "complete", "stop"]


def test_a_report_whose_completeness_is_empty_is_still_a_report():
    report = {"pages": 1, "expected": None, "complete": None, "stop": "x"}
    assert ListingResult.from_report("pageup", [], report).report() == report


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
    jobs, report = asyncio.run(crawler._listing_jobs(_first().body, _source()["careers_url"]))
    assert jobs is general_rows and report is None
    assert LISTING_READER.get() == "unknown"  # set inside the run's own context only


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
    assert (jobs, report) == ([], None)


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
    ("general_reader", "icrc-listing", "general", "links"),
    ("general_reader", "oxfam-listing", "general", "divs"),
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
    assert result["message"] == "Found 32 jobs"
    assert (fields["reader"], fields["strategy"]) == ("general", "links")
    assert "listing_complete" not in fields


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
    assert (first["reader"], first["strategy"]) == ("general", "links")
    assert second["reader"] == "unknown" and "strategy" not in second
