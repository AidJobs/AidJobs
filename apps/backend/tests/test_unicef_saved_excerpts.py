"""The PageUp career-site reader on job cards from saved UNICEF listing pages, verbatim with line
endings normalised.

The reader parses with lxml. The expected rows were recorded once from these excerpts, so a
change of lxml or of the libxml2 it bundles must leave every row identical. Titles with a raw
or escaped ampersand get their own excerpt, because character references are where HTML
tokenizers differ.
"""
import asyncio
import json
from pathlib import Path

import pytest

from contracts.admission import admit_batch
from contracts.refusal import refusal
from crawler.plugins.pageup import PageUpListingReader
from crawler_v2.simple_crawler import SimpleCrawler

_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "unicef_listing"
_PAGES = ["page1-items50", "page1-items100", "page2", "page7"]
_LISTING = "https://jobs.unicef.org/en-us/listing/"


def _load(name):
    html = (_FIXTURES / f"{name}.html").read_bytes().decode("utf-8")
    record = json.loads((_FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return html, record["url"], record["jobs"]


def test_the_reader_parses_with_lxml():
    assert PageUpListingReader().get_soup("<p>x</p>").builder.NAME == "lxml"


@pytest.mark.parametrize("name", _PAGES)
def test_cards_read_exactly_the_recorded_rows(name):
    html, url, expected = _load(name)
    assert PageUpListingReader().read_job_cards(html, url) == expected


@pytest.mark.parametrize("name", _PAGES)
def test_the_repeated_card_is_read_once(name):
    html, url, expected = _load(name)
    jobs = PageUpListingReader().read_job_cards(html, url)
    assert html.count('class="list-view--item') == len(expected) + 1
    assert len({job["apply_url"] for job in jobs}) == len(jobs) == len(expected)


@pytest.mark.parametrize("name", _PAGES)
def test_every_recorded_row_is_admitted(name):
    html, url, expected = _load(name)
    jobs = PageUpListingReader().read_job_cards(html, url)
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert rejected == []
    assert len(admitted) == len(expected) == 6
    assert all(job.get("location_raw") and job.get("deadline") for job in jobs)


def test_titles_with_ampersands_read_exactly_the_recorded_rows():
    html, url, expected = _load("ampersands")
    jobs = PageUpListingReader().read_job_cards(html, url)
    assert jobs == expected
    assert len(jobs) == 10
    assert all("&" in job["title"] for job in jobs)
    assert "&amp;" in html and "Gender& Education" in html
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert rejected == []
    assert len(admitted) == 10


def _walk(first_html, pages):
    """The crawler's listing step on `first_html`, later pages answered from `pages`."""
    crawler = SimpleCrawler("postgresql://example")
    asked = []

    async def fetch(url, *_args, **_kwargs):
        asked.append(url)
        status, html = pages[url]
        return status, html, refusal(status, {}, html)

    crawler._fetch_listing_page = fetch
    jobs, report = asyncio.run(crawler._listing_jobs(first_html, _LISTING))
    return jobs, report, asked


def test_a_saved_page_one_asks_for_one_hundred_jobs_a_page():
    first, _url, first_rows = _load("page1-items50")
    resized, resized_url, resized_rows = _load("page1-items100")
    assert resized_url == "https://jobs.unicef.org/en-us/listing/?page-items=100"
    next_page = "https://jobs.unicef.org/en-us/listing/?page=2&page-items=100"
    jobs, report, asked = _walk(first, {resized_url: (200, resized), next_page: (0, "")})
    assert asked == [resized_url, next_page]
    assert jobs == first_rows + resized_rows
    assert report["expected"] == 6 + 173
    assert report["complete"] is False
    assert report["stop"] == f"HTTP 0 on {next_page}"
