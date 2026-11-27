"""W-40 pull request 1: the admin probe reads a careers address once and writes nothing.

Every network call is replaced. The probe must refuse a bad address before any request, send one
listing request on either branch (feed or page), report refusals without echoing exception text,
and never open a database connection.
"""
import asyncio
from types import SimpleNamespace

import psycopg2
import pytest

from contracts.outbound import FetchError
from contracts.reader import Response
from crawler_v2 import probe

ADDRESS = "https://jobs.example.org/careers/"


class Page:
    def __init__(self, status_code=200, text="<html></html>", headers=None):
        self.status_code = status_code
        self.text = text
        self.headers = headers or {}


def _summary(**overrides):
    summary = {
        "ok": True, "count": 2, "reader": "general", "strategy": "selector-links",
        "expected": None, "pages": 1, "complete": False, "stop": "no next-page link",
        "admitted": 1, "rejected": 1, "rejected_by_reason": {"thin_vacancy": 1},
        "rows": [{"title": "Officer", "verdict": "admitted"}],
        "sample": [
            {
                "title": "Officer " * 40,
                "apply_url": "https://jobs.example.org/1",
                "verdict": "admitted",
            }
        ],
        "fill_rates": {"deadline": {"filled": 1, "total": 1, "rate": 100.0}},
    }
    summary.update(overrides)
    return summary


@pytest.fixture
def no_database(monkeypatch):
    """A probe that opens a database connection is a write path; fail loudly if one is tried."""
    def refuse(*args, **kwargs):
        raise AssertionError("the probe opened a database connection")
    monkeypatch.setattr(psycopg2, "connect", refuse)


@pytest.fixture
def no_request(monkeypatch):
    async def refuse(*args, **kwargs):
        raise AssertionError("the probe sent a request for a refused address")
    monkeypatch.setattr(probe, "fetch_url", refuse)


# Addresses refused before any request --------------------------------------------------------

@pytest.mark.parametrize("url", [
    "", "   ", "ftp://jobs.example.org/", "javascript:alert(1)", "file:///etc/passwd",
    "http://", "https:///careers", "jobs.example.org/careers",
    "https://jobs.example.org/" + "a" * 2100,
])
def test_a_bad_address_is_refused_before_any_request(no_database, no_request, url):
    result = asyncio.run(probe.probe_address(url))
    assert result["ok"] is False
    assert result["error_category"] == "validation"


def test_a_good_address_passes_the_early_check():
    assert probe.address_refusal(ADDRESS) is None
    assert probe.address_refusal("http://jobs.example.org") is None


# The page branch --------------------------------------------------------------------------

def test_a_page_is_read_with_one_request_and_no_database(monkeypatch, no_database):
    calls = []

    async def fetch(url, **kwargs):
        calls.append(url)
        return Page(text="<html>listing</html>")

    async def simulate(crawler, html, careers_url):
        assert html == "<html>listing</html>" and careers_url == ADDRESS
        return _summary()

    monkeypatch.setattr(probe, "fetch_url", fetch)
    monkeypatch.setattr(probe, "simulate_html", simulate)
    result = asyncio.run(probe.probe_address(ADDRESS))
    assert calls == [ADDRESS]
    assert result["ok"] is True
    assert result["suggested_source_type"] == "html"
    assert result["reader"] == "general"
    assert result["admitted"] == 1 and result["rejected_by_reason"] == {"thin_vacancy": 1}
    assert result["fill_basis"].startswith("Share of the admitted rows")


def test_sample_rows_are_capped_and_no_full_rows_or_body_are_returned(monkeypatch, no_database):
    async def fetch(url, **kwargs):
        return Page(text="<html>listing body that must not be echoed</html>")

    async def simulate(crawler, html, careers_url):
        return _summary(rows=[{"title": "x"}] * 9, sample=[{"title": "T" * 500}] * 9)

    monkeypatch.setattr(probe, "fetch_url", fetch)
    monkeypatch.setattr(probe, "simulate_html", simulate)
    result = asyncio.run(probe.probe_address(ADDRESS))
    assert len(result["sample"]) == probe.SAMPLE_ROWS
    assert all(len(row["title"]) <= probe.TEXT_MAX_LENGTH + 1 for row in result["sample"])
    assert "rows" not in result
    assert "listing body" not in repr(result)


@pytest.mark.parametrize("status", [403, 404, 500])
def test_a_page_that_does_not_answer_200_is_reported_not_read(monkeypatch, no_database, status):
    async def fetch(url, **kwargs):
        return Page(status_code=status, text="")

    monkeypatch.setattr(probe, "fetch_url", fetch)
    result = asyncio.run(probe.probe_address(ADDRESS))
    # A refusal (403 and the like) is worded "Refused: ...", as Simulate words it
    assert result["ok"] is False and result["error_category"] == "runtime"
    assert result["error"] in (f"HTTP {status}", f"Refused: HTTP {status}")


def test_a_refusal_from_the_page_is_reported_with_its_words(monkeypatch, no_database):
    async def fetch(url, **kwargs):
        return Page(status_code=200, text="<html>challenge</html>")

    monkeypatch.setattr(probe, "fetch_url", fetch)
    monkeypatch.setattr(probe, "refusal", lambda status, headers, text: "challenge page")
    result = asyncio.run(probe.probe_address(ADDRESS))
    assert result["ok"] is False and result["error"] == "Refused: challenge page"


def test_an_empty_page_is_reported_as_empty(monkeypatch, no_database):
    async def fetch(url, **kwargs):
        return Page(status_code=200, text="")

    monkeypatch.setattr(probe, "fetch_url", fetch)
    result = asyncio.run(probe.probe_address(ADDRESS))
    assert result == {"ok": False, "error": "The page was empty.", "error_category": "runtime"}


def test_a_fetch_error_never_echoes_its_text(monkeypatch, no_database):
    """The policy's error text can name an internal address; the probe answers in its own words."""
    async def fetch(url, **kwargs):
        raise FetchError("destination 10.0.0.5 internal-admin.local is not permitted")

    monkeypatch.setattr(probe, "fetch_url", fetch)
    result = asyncio.run(probe.probe_address(ADDRESS))
    assert result["ok"] is False
    assert "10.0.0.5" not in repr(result) and "internal-admin" not in repr(result)
    assert result["error"] == "Refused: fetch failed"


def test_an_unexpected_error_is_a_plain_failure(monkeypatch, no_database):
    async def fetch(url, **kwargs):
        raise RuntimeError("socket details that must not leak")

    monkeypatch.setattr(probe, "fetch_url", fetch)
    result = asyncio.run(probe.probe_address(ADDRESS))
    assert result == {"ok": False, "error": "Refused: fetch failed", "error_category": "runtime"}


# The feed branch: one feed request, no detail pages --------------------------------------

def test_a_recognised_system_is_read_from_its_feed_with_one_request(monkeypatch, no_database):
    feed_url = "https://apply.workable.com/api/v1/widget/accounts/example"
    seen = {}

    async def feed(self, url, headers=None, budget_group=None):
        seen["url"] = url
        return Response(200, '{"jobs": []}', content_type="application/json")

    async def simulate(body, careers_url, fetch=None):
        seen["fetch"] = fetch
        return _summary(reader="workable-feed", strategy="feed")

    async def page(*args, **kwargs):
        raise AssertionError("a recognised system must not be read as a page")

    reader = SimpleNamespace(budget_group=None)
    request = SimpleNamespace(url=feed_url, accept=None)
    monkeypatch.setattr(probe, "resolve_feed_request", lambda readers, source: (reader, request))
    from crawler_v2.api_crawler import SimpleAPICrawler
    monkeypatch.setattr(SimpleAPICrawler, "fetch_api_response", feed)
    monkeypatch.setattr(probe, "simulate_api", simulate)
    monkeypatch.setattr(probe, "fetch_url", page)

    result = asyncio.run(probe.probe_address("https://apply.workable.com/example"))
    assert seen == {"url": feed_url, "fetch": None}
    assert result["ok"] is True
    assert result["suggested_source_type"] == "api"
    assert result["reader"] == "workable-feed"


def test_a_feed_that_does_not_answer_200_is_reported(monkeypatch, no_database):
    reader = SimpleNamespace(budget_group=None)
    request = SimpleNamespace(url="https://boards-api.greenhouse.io/v1/boards/x/jobs", accept=None)

    async def feed(self, url, headers=None, budget_group=None):
        return Response(503, "", stop="HTTP 503")

    monkeypatch.setattr(probe, "resolve_feed_request", lambda readers, source: (reader, request))
    from crawler_v2.api_crawler import SimpleAPICrawler
    monkeypatch.setattr(SimpleAPICrawler, "fetch_api_response", feed)
    result = asyncio.run(probe.probe_address("https://job-boards.greenhouse.io/x"))
    assert result == {"ok": False, "error": "Refused: HTTP 503", "error_category": "runtime"}


def _feed_setup(monkeypatch, feed, simulate=None):
    reader = SimpleNamespace(budget_group=None)
    request = SimpleNamespace(
        url="https://apply.workable.com/api/v1/widget/accounts/x", accept=None
    )
    from crawler_v2.api_crawler import SimpleAPICrawler
    monkeypatch.setattr(probe, "resolve_feed_request", lambda readers, source: (reader, request))
    monkeypatch.setattr(SimpleAPICrawler, "fetch_api_response", feed)
    if simulate is not None:
        monkeypatch.setattr(probe, "simulate_api", simulate)


def _real_feed_setup(monkeypatch, fetch):
    """The feed's own fetch_api_response runs; only the policy's fetch_url is replaced."""
    reader = SimpleNamespace(budget_group=None)
    request = SimpleNamespace(
        url="https://apply.workable.com/api/v1/widget/accounts/x", accept=None
    )
    monkeypatch.setattr(probe, "resolve_feed_request", lambda readers, source: (reader, request))
    monkeypatch.setattr("crawler_v2.api_crawler.fetch_url", fetch)


def test_a_feed_error_with_raw_text_is_not_echoed(monkeypatch, no_database):
    async def fetch(url, **kwargs):
        raise FetchError("connect to 10.0.0.5 failed for jobs.internal")

    _real_feed_setup(monkeypatch, fetch)
    result = asyncio.run(probe.probe_address("https://apply.workable.com/example"))
    assert result == {"ok": False, "error": "Refused: fetch failed", "error_category": "runtime"}
    assert "10.0.0.5" not in str(result)


def test_a_feed_challenge_keeps_its_name(monkeypatch, no_database):
    async def fetch(url, **kwargs):
        return Page(status_code=200, text="<title>Just a moment...</title>")

    _real_feed_setup(monkeypatch, fetch)
    result = asyncio.run(probe.probe_address("https://apply.workable.com/example"))
    assert result == {
        "ok": False,
        "error": "Refused: HTTP 200 (Cloudflare challenge)",
        "error_category": "runtime",
    }


def test_the_page_branch_writes_no_html_storage(monkeypatch, no_database):
    seen = {}

    async def fetch(url, **kwargs):
        return Page(text="<html>listing</html>")

    async def simulate(crawler, html, careers_url):
        seen["storage"] = crawler.html_storage
        return _summary()

    monkeypatch.setattr(probe, "fetch_url", fetch)
    monkeypatch.setattr(probe, "simulate_html", simulate)
    result = asyncio.run(probe.probe_address(ADDRESS))
    assert result["ok"] is True
    assert seen == {"storage": None}


def test_a_feed_body_that_is_not_json_is_reported_not_raised(monkeypatch, no_database):
    async def feed(self, url, headers=None, budget_group=None):
        return Response(200, "<html>maintenance</html>", content_type="text/html")

    async def simulate(body, careers_url, fetch=None):
        raise ValueError("API body is not JSON")

    _feed_setup(monkeypatch, feed, simulate)
    result = asyncio.run(probe.probe_address("https://apply.workable.com/example"))
    assert result == {"ok": False, "error": probe.UNREADABLE, "error_category": "runtime"}


def test_a_page_that_cannot_be_parsed_is_reported_not_raised(monkeypatch, no_database):
    async def fetch(url, **kwargs):
        return Page(text="<html>listing</html>")

    async def simulate(crawler, html, careers_url):
        raise ValueError("cannot parse")

    monkeypatch.setattr(probe, "fetch_url", fetch)
    monkeypatch.setattr(probe, "simulate_html", simulate)
    result = asyncio.run(probe.probe_address(ADDRESS))
    assert result == {"ok": False, "error": probe.UNREADABLE, "error_category": "runtime"}


# Time ------------------------------------------------------------------------------------

def test_a_probe_that_takes_too_long_stops_with_a_plain_answer(monkeypatch, no_database):
    async def slow(url, **kwargs):
        await asyncio.sleep(5)
        return Page()

    monkeypatch.setattr(probe, "fetch_url", slow)
    monkeypatch.setattr(probe, "PROBE_SECONDS", 0.05)
    result = asyncio.run(probe.probe_address(ADDRESS))
    assert result == {"ok": False, "error": probe.NO_ANSWER, "error_category": "runtime"}


# The fill rates ----------------------------------------------------------------------------

def test_fill_rates_use_the_capture_field_names_and_leave_country_and_city_unmeasured():
    from app.data_quality import CAPTURE_FILL_FIELDS
    from crawler_v2.simulate import listing_fill_rates

    jobs = [
        {"deadline": "2026-12-01", "employment_type": "Full time", "location_raw": "Geneva"},
        {"deadline": None, "salary_raw": "CHF 1000", "location_raw": ""},
    ]
    rates = listing_fill_rates(jobs)
    assert set(rates) == {name for name, _column in CAPTURE_FILL_FIELDS}
    assert rates["deadline"] == {"filled": 1, "total": 2, "rate": 50.0}
    assert rates["contract_type"] == {"filled": 1, "total": 2, "rate": 50.0}
    assert rates["salary_range_text"] == {"filled": 1, "total": 2, "rate": 50.0}
    assert rates["location_raw"] == {"filled": 1, "total": 2, "rate": 50.0}
    assert rates["country"] == {"filled": None, "total": 2, "rate": None}
    assert rates["city"] == {"filled": None, "total": 2, "rate": None}


def test_fill_rates_of_no_admitted_rows_have_no_rate():
    from crawler_v2.simulate import listing_fill_rates
    rates = listing_fill_rates([])
    assert rates["deadline"] == {"filled": 0, "total": 0, "rate": None}
