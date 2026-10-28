"""Deadline parsing skips text that cannot be a deadline and reads every date it read before.

The UNDP listing passed a column heading ("Agency") to dateparser for every job; with every locale
enabled each call took about a second on the event loop, and the server stopped answering.
"""
import asyncio
import os
import re
import socket
import time
from pathlib import Path

import dateparser
import pytest

import crawler_v2.simple_crawler as sc
from crawler_v2.simple_crawler import SimpleCrawler

SAVED_PAGES = Path(__file__).resolve().parents[3] / "raw-html"
LOOPBACK = {"127.0.0.1", "::1", "localhost"}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Listing code may fetch further pages (UNICEF does); these tests read saved HTML only."""

    async def blocked_fetch(*args, **kwargs):
        raise sc.FetchError("network blocked in tests")

    real_connect = socket.socket.connect

    def loopback_only(sock, address):
        host = address[0] if isinstance(address, tuple) else address
        if host not in LOOPBACK:
            raise OSError("network blocked in tests")
        return real_connect(sock, address)

    monkeypatch.setattr(sc, "fetch_url", blocked_fetch)
    monkeypatch.setattr(socket.socket, "connect", loopback_only)


@pytest.fixture
def crawler():
    return SimpleCrawler("postgresql://example")


@pytest.fixture
def previous_behaviour(monkeypatch):
    """Parsing as before this change: every text reaches dateparser, with every locale."""

    def apply():
        monkeypatch.setattr(sc, "_HAS_DIGIT", re.compile(""))
        monkeypatch.setattr(sc, "DEADLINE_LANGUAGES", None)

    return apply


DATED = [
    ("2026-11-13", "2026-11-13"),
    ("2026-10-29T23:59:00Z", "2026-10-29"),
    ("2026-10-29 23:59", "2026-10-29"),
    ("Closing date: 2026-10-31", "2026-10-31"),
    ("06/11/2026", "2026-11-06"),
    ("13 November 2026", "2026-11-13"),
    ("12-DEC-2025", "2025-12-12"),
    ("December 10, 2025", "2025-12-10"),
    ("10 December 2025", "2025-12-10"),
    ("30.11.2026", "2026-11-30"),
    ("Nov 30, 2026 11:59 PM", "2026-11-30"),
    ("Deadline: 15 January 2027", "2027-01-15"),
    ("Apply by: 3 March 2027", "2027-03-03"),
    ("3/4/2027", "2027-04-03"),
    ("15-01-2027", "2027-01-15"),
    ("30 Nov 2026 (Midnight New York, USA)", "2026-11-30"),
    ("Closing Date: 05-Nov-2026", "2026-11-05"),
    ("1 février 2027", "2027-02-01"),
    ("13 novembre 2026", "2026-11-13"),
    ("15 janvier 2027", "2027-01-15"),
    ("15 de enero de 2027", "2027-01-15"),
    ("13 de noviembre de 2026", "2026-11-13"),
    ("15 dezembro 2026", "2026-12-15"),
    ("15 Dezember 2026", "2026-12-15"),
    ("15 dicembre 2026", "2026-12-15"),
    ("15 декабря 2026", "2026-12-15"),
    ("15 ديسمبر 2026", "2026-12-15"),
]
UNDATED = [
    "Agency", "Location", "date", "Open until filled", "Rolling",
    "today", "tomorrow", "December", " ",
]


@pytest.mark.parametrize(("raw", "expected"), DATED)
def test_dates_are_read(crawler, raw, expected):
    assert crawler._parse_deadline(raw) == expected


@pytest.mark.parametrize("raw", [raw for raw, _ in DATED] + ["31 Dec", "2026", "Ref 12345"])
def test_the_language_list_reads_what_every_locale_reads(crawler, previous_behaviour, raw):
    restricted = crawler._parse_deadline(raw)
    previous_behaviour()
    assert crawler._parse_deadline(raw) == restricted


@pytest.fixture
def dateparser_calls(monkeypatch):
    """Every call to dateparser.parse, recorded.

    A stub that raises would prove nothing: _parse_deadline catches the error and returns None.
    """
    calls = []
    real_parse = dateparser.parse

    def recording(*args, **kwargs):
        calls.append((args, kwargs))
        return real_parse(*args, **kwargs)

    monkeypatch.setattr(dateparser, "parse", recording)
    return calls


@pytest.mark.parametrize("raw", UNDATED)
def test_text_without_a_digit_is_not_a_deadline_and_skips_dateparser(
    crawler, dateparser_calls, raw
):
    assert crawler._parse_deadline(raw) is None
    assert dateparser_calls == []


def test_dateparser_receives_the_configured_languages(crawler, dateparser_calls):
    assert crawler._parse_deadline("13 November 2026") == "2026-11-13"
    assert len(dateparser_calls) == 1
    _, kwargs = dateparser_calls[0]
    assert kwargs["languages"] == list(sc.DEADLINE_LANGUAGES)


def test_a_month_name_outside_the_list_is_not_read(crawler, previous_behaviour):
    """One example of the accepted trade-off (Polish); other unlisted languages are not tested here.

    Every locale read it as a date; the configured list does not.
    """
    assert crawler._parse_deadline("15 grudnia 2026") is None
    previous_behaviour()
    assert crawler._parse_deadline("15 grudnia 2026") == "2026-12-15"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # ICRC's microdata validThrough; before, the cut at the T of "UTC" left no date.
        ("Fri Nov 06 23:00:00 UTC 2026", "2026-11-06"),
        ("Wed Jul 07 22:00:00 UTC 2027", "2027-07-07"),
        ("Fri Dec 31 23:00:00 UTC 2027", "2027-12-31"),
        # Before, a leading "Tue"/"Thu" left an empty string.
        ("Tue Nov 10 23:00:00 UTC 2026", "2026-11-10"),
        ("Thu Dec 31 23:00:00 UTC 2026", "2026-12-31"),
        ("Tuesday, 10 November 2026", "2026-11-10"),
        # A time joined to a date is still removed.
        ("31/12/2026T23:59:00Z", "2026-12-31"),
        # Upper-case month names contain a T too; before, these gave no date or a wrong one.
        ("31 OCT 2026", "2026-10-31"),
        ("15-OCT-2025", "2025-10-15"),
        ("31 AUGUST 2026", "2026-08-31"),
        ("SEPTEMBER 30, 2026", "2026-09-30"),
    ],
)
def test_a_capital_t_cuts_only_an_iso_time(crawler, raw, expected):
    assert crawler._parse_deadline(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Dec-6-25", "2025-12-06"),
        ("06-Dec-25", "2025-12-06"),
        ("6/12/25", "2025-12-06"),
        ("06.12.25", "2025-12-06"),
        ("6 December 25", "2025-12-06"),
        ("31 Jan 27", "2027-01-31"),
        # A four-digit year is kept as written, however far ahead.
        ("31 December 2125", "2125-12-31"),
        ("06-Dec-2025", "2025-12-06"),
    ],
)
def test_a_two_digit_year_is_this_century(crawler, raw, expected):
    assert crawler._parse_deadline(raw) == expected


def test_headings_are_rejected_quickly(crawler):
    started = time.perf_counter()
    for _ in range(100):
        assert crawler._parse_deadline("Agency") is None
        assert crawler._parse_deadline("Location") is None
    assert time.perf_counter() - started < 0.5


JOB_BASE = "https://careers.example.org/CandidateExperience/en/sites/CX_1/requisitions/job"


def _undp_style_listing(rows):
    """UNDP's table shape: a header row, then one link per job, each link's parent the table."""
    header = "\n".join(
        f'<div class="vacanciesTable__cell nowrap">{h}</div>'
        for h in ["Job title", "Post level", "Apply by", "Agency", "Location"]
    )
    body = "\n".join(
        f'<a href="{JOB_BASE}/{4100 + n}" '
        f'class="vacanciesTableLink vacanciesTable__row">\n'
        f'<div class="vacanciesTable__cell">Programme Analyst, Climate Resilience {n}</div>\n'
        f'<div class="vacanciesTable__cell">NOB</div>\n'
        f'<div class="vacanciesTable__cell">{10 + n % 18} Dec 2026</div>\n'
        f'<div class="vacanciesTable__cell">UNDP</div>\n'
        f'<div class="vacanciesTable__cell">Nairobi, Kenya</div>\n</a>'
        for n in range(rows)
    )
    return (
        "<html><head><title>Jobs</title></head><body><h1>Vacancies</h1>"
        '<div class="vacanciesTable">\n'
        f'<div class="vacanciesTable__header">\n{header}\n</div>\n{body}\n</div>'
        "</body></html>"
    )


async def _extract_with_stall(crawler, html, url):
    gaps, stop = [], asyncio.Event()

    async def heartbeat():
        last = time.perf_counter()
        while not stop.is_set():
            await asyncio.sleep(0.02)
            now = time.perf_counter()
            gaps.append(now - last - 0.02)
            last = now

    beat = asyncio.create_task(heartbeat())
    await asyncio.sleep(0.05)
    jobs, _report = await crawler._listing_jobs(html, url)
    stop.set()
    await beat
    return jobs, max(gaps, default=0.0)


def _summary(jobs):
    return [(j.get("title"), j.get("apply_url"), j.get("deadline")) for j in jobs]


def test_undp_style_listing_extracts_the_same_jobs_without_calling_dateparser(
    crawler, previous_behaviour, monkeypatch
):
    html = _undp_style_listing(20)
    url = "https://careers.example.org/vacancies"
    calls = []
    real_parse = dateparser.parse

    def counting(*args, **kwargs):
        calls.append(args[0] if args else kwargs.get("date_string"))
        return real_parse(*args, **kwargs)

    monkeypatch.setattr(dateparser, "parse", counting)
    jobs, worst_stall = asyncio.run(_extract_with_stall(crawler, html, url))
    assert jobs, "the fixture should yield jobs"
    assert calls == []
    assert worst_stall < 1.0, f"event loop stalled {worst_stall:.2f}s"

    previous_behaviour()
    calls.clear()
    before, _report = asyncio.run(crawler._listing_jobs(html, url))
    assert calls, "the previous behaviour sent the heading to dateparser"
    assert _summary(jobs) == _summary(before)


SAVED = {
    "jobs_undp_org/0656e003-33d1-443d-8c20-fde5f2d66bd7/20251206/6195a6073887.html": "https://jobs.undp.org/cj_view_jobs.cfm",
    "jobs_undp_org/bdbba55a-b9cb-4fd5-99f1-6d9446b0c658/20251206/39f06a80bc73.html": "https://jobs.undp.org/cj_view_jobs.cfm",
    "unicef-pagination/page1-items50.body": "https://jobs.unicef.org/en-us/listing/",
    "career-coverage/icrc.body": "https://careers.icrc.org/go/Global-Opportunities/8821501/",
}


@pytest.mark.skipif(
    not os.getenv("AIDJOBS_SAVED_PAGES"), reason="opt-in: needs the git-ignored raw-html pages"
)
@pytest.mark.parametrize("relative", list(SAVED))
def test_saved_pages_extract_the_same_jobs(crawler, previous_behaviour, relative):
    path = SAVED_PAGES / relative
    if not path.exists():
        pytest.skip(f"{relative} is not saved here")
    html = path.read_text(encoding="utf-8", errors="replace")
    jobs, worst_stall = asyncio.run(_extract_with_stall(crawler, html, SAVED[relative]))
    previous_behaviour()
    before, _report = asyncio.run(crawler._listing_jobs(html, SAVED[relative]))
    assert _summary(jobs) == _summary(before)
    print(f"{relative}: {len(jobs)} jobs, worst event-loop stall {worst_stall:.2f}s")
