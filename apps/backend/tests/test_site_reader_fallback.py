"""UNICEF listing reader and the no-AI fallback. Excerpts only; saved pages are optional."""
import asyncio
import re
from pathlib import Path

import pytest

from contracts.admission import admit_batch
from contracts.identity import both_keys
from crawler.plugins.base import PluginResult
from crawler.plugins.unicef import UNICEFPlugin
from crawler_v2.simple_crawler import (
    SimpleCrawler,
    _html_request_headers,
    _listing_outcome,
    _logged_headers,
    _response_excerpt,
)

_UNICEF_LISTING = "https://jobs.unicef.org/en-us/listing/"
_ICRC_LISTING = "https://careers.icrc.org/go/Global-Opportunities/8821501/"
_ROOT = Path(__file__).resolve().parents[3] / "raw-html"
_SAVED_UNICEF = (
    _ROOT
    / "jobs_unicef_org"
    / "d8fb4848-7019-416d-b862-947ac890b69f"
    / "20251206"
    / "7632169aa77f.html"
)
_SAVED_ICRC = _ROOT / "career-coverage" / "icrc.body"


def _card(job_id, title, teaser, location=None, close=None):
    place = ""
    if location:
        place = f'<p><b>Location:</b> <span class="location">{location}</span></p>'
    deadline = ""
    if close:
        deadline = f'<p><b>Deadline:</b> <span class="close-date"><time>{close}</time></span></p>'
    return f"""
    <div class="list-view--item"><div class="container"><div class="row-content">
      <div class="row-content--text-info">
        <div class="row--short-title"><h4>
          <a class="job-link" href="/en-us/job/{job_id}/slug-{job_id}">{title}</a>
        </h4></div>
        <div class="row--teaser"><p>{teaser}</p>{place}{deadline}</div>
      </div>
    </div></div></div>
    """


_CARDS = "".join(
    [
        _card(
            "588602",
            "Readvertisement: Programme Officer (Team Leader), NO-2, FT, Birao",
            "Leads the field team.",
            "Central African Republic",
            "16 Dec 2025 11:55 PM",
        ),
        _card(
            "588591",
            "Driver,  (GS-2), Georgetown,\n   Guyana #135346",
            "Supports the country programme with safe driving.",
            "Guyana",
            "11 Dec 2025 11:55 PM",
        ),
        _card(
            "588601",
            "Long Term Agreement for an individual consultant",
            "Remote work.",
            None,
            "13 Dec 2025",
        ),
    ]
)

_LISTING = f"""
<nav><a href="https://www.unicef.org/careers">Careers homepage</a>
<a href="https://www.unicef.org/careers/internships">Internship programme</a></nav>
<div id="search-results">
  <div class="tag-based-search-result">{_CARDS}</div>
  <div class="map-view">{_CARDS}</div>
  <div class="list-view--item">
    <a class="job-link" href="/en-us/job/1/a">Two links in one card</a>
    <a class="job-link" href="/en-us/job/2/b">Second link</a>
  </div>
</div>
"""


def _link(job_id):
    return f"https://jobs.unicef.org/en-us/job/{job_id}/slug-{job_id}"


def test_unicef_cards_read_title_link_location_and_deadline():
    jobs = UNICEFPlugin().extract(_LISTING, _UNICEF_LISTING).jobs
    assert [job["apply_url"] for job in jobs] == [
        _link("588602"),
        _link("588591"),
        _link("588601"),
    ]
    officer, driver, consultant = jobs
    assert officer["title"].startswith("Readvertisement: Programme Officer")
    assert officer["location_raw"] == "Central African Republic"
    assert officer["deadline"] == "2025-12-16"
    assert driver["title"] == "Driver, (GS-2), Georgetown, Guyana #135346"
    assert driver["location_raw"] == "Guyana"
    assert driver["deadline"] == "2025-12-11"
    assert "location_raw" not in consultant
    assert consultant["deadline"] == "2025-12-13"


def test_unicef_cards_are_admitted_without_inventing_a_location():
    jobs = UNICEFPlugin().extract(_LISTING, _UNICEF_LISTING).jobs
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert rejected == []
    assert len(admitted) == 3
    consultant = next(job for job in admitted if job["apply_url"] == _link("588601"))
    assert "location_raw" not in consultant


def test_a_page_without_job_cards_produces_no_card_rows():
    html = """
    <article>
      <h3>Programme Officer, Nairobi, Kenya</h3>
      <a href="/en-us/job/7/officer">Programme Officer, Nairobi, Kenya</a>
      Location: Kenya Deadline: 12 Dec 2025
    </article>
    """
    plugin = UNICEFPlugin()
    assert plugin._extract_job_cards(plugin.get_soup(html), _UNICEF_LISTING) == []


class _FakeAI:
    def __init__(self, outcome):
        self.outcome = outcome

    async def extract_jobs_from_html(self, html, url, max_jobs=100):
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return self.outcome


async def _no_sleep(_seconds):
    return None


def _no_network(crawler, monkeypatch):
    async def refuse(url, *_args, **_kwargs):
        raise AssertionError(f"unexpected fetch of {url}")

    monkeypatch.setattr(crawler, "fetch_html", refuse)
    monkeypatch.setattr(crawler, "_fetch_listing_page", refuse)
    monkeypatch.setattr("crawler_v2.simple_crawler._sleep", _no_sleep)


def _crawler(outcome, monkeypatch, general=None):
    crawler = SimpleCrawler("postgresql://example")
    crawler.ai_extractor = _FakeAI(outcome)
    crawler.use_ai = True
    sentinel = general if general is not None else [{"title": "general", "apply_url": "https://x/1"}]
    monkeypatch.setattr(crawler, "extract_jobs_from_html", lambda html, url: list(sentinel))
    _no_network(crawler, monkeypatch)
    return crawler, sentinel


def _readers_must_not_be_called(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("a site reader was consulted")

    monkeypatch.setattr("crawler.plugins.get_plugin_registry", refuse)
    monkeypatch.setattr("crawler.plugins.unicef.UNICEFPlugin.extract", refuse)


def _unicef_reader_returns(monkeypatch, outcome):
    def extract(self, html, base_url, config=None):
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    monkeypatch.setattr("crawler.plugins.unicef.UNICEFPlugin.extract", extract)


_AI_FAILURES = [
    pytest.param([], id="no-jobs"),
    pytest.param(asyncio.TimeoutError(), id="timeout"),
    pytest.param(RuntimeError("no credits"), id="error"),
]


@pytest.mark.parametrize("outcome", _AI_FAILURES)
def test_unicef_uses_its_reader_when_ai_produces_nothing(outcome, monkeypatch):
    crawler, sentinel = _crawler(outcome, monkeypatch)
    jobs = asyncio.run(crawler._ai_listing_jobs(_LISTING, _UNICEF_LISTING, "UNICEF"))
    assert [job["apply_url"] for job in jobs] == [
        _link("588602"),
        _link("588591"),
        _link("588601"),
    ]
    assert jobs != sentinel


@pytest.mark.parametrize("outcome", _AI_FAILURES)
def test_other_sources_never_reach_the_unicef_reader(outcome, monkeypatch):
    _readers_must_not_be_called(monkeypatch)
    lookalike = "https://example.org/jobs?next=https://jobs.unicef.org/en-us/listing/"
    for url in (_ICRC_LISTING, lookalike):
        crawler, sentinel = _crawler(outcome, monkeypatch)
        jobs = asyncio.run(crawler._ai_listing_jobs(_LISTING, url, "Other"))
        assert jobs == sentinel


@pytest.mark.parametrize("url", [_UNICEF_LISTING, _ICRC_LISTING])
def test_ai_jobs_are_used_without_any_reader(url, monkeypatch):
    _readers_must_not_be_called(monkeypatch)
    ai_jobs = [{"title": "From AI", "apply_url": "https://jobs.example/1"}]
    crawler, _sentinel = _crawler(ai_jobs, monkeypatch)
    jobs = asyncio.run(crawler._ai_listing_jobs(_LISTING, url, "Any"))
    assert jobs == ai_jobs


@pytest.mark.parametrize(
    "plugin_outcome",
    [
        pytest.param(PluginResult(jobs=[]), id="no-jobs"),
        pytest.param(RuntimeError("bad page"), id="error"),
    ],
)
def test_unicef_reader_failure_falls_back_to_the_general_reader(plugin_outcome, monkeypatch):
    _unicef_reader_returns(monkeypatch, plugin_outcome)
    crawler, sentinel = _crawler([], monkeypatch)
    jobs = asyncio.run(crawler._ai_listing_jobs(_LISTING, _UNICEF_LISTING, "UNICEF"))
    assert jobs == sentinel


def test_repeated_links_keep_the_first_row(monkeypatch):
    rows = [
        {"title": "First wording", "apply_url": _link("1"), "deadline": "2025-12-01"},
        {"title": "Second wording", "apply_url": _link("1"), "deadline": "2025-12-02"},
        {"title": "Other job", "apply_url": _link("2"), "deadline": "2025-12-03"},
    ]
    _unicef_reader_returns(monkeypatch, PluginResult(jobs=rows))
    crawler, _sentinel = _crawler([], monkeypatch)
    jobs = asyncio.run(crawler._ai_listing_jobs(_LISTING, _UNICEF_LISTING, "UNICEF"))
    assert [(job["title"], job["apply_url"]) for job in jobs] == [
        ("First wording", _link("1")),
        ("Other job", _link("2")),
    ]


# Titles stored for these links by the 6 December 2025 crawl of this same page.
_STORED_UNICEF = {
    "588602": (
        "Readvertisement: Programme Officer (Team Leader), NO-2, FT, #00132991, "
        "Birao - Central African Republic, WCAR"
    ),
    "588597": (
        "Consultancy for Quality Assurance Services, UNICEF Global Shared Services Centre, "
        "Budapest, Hungary (Home Based)"
    ),
    "585915": (
        "INTERNAL EXTERNAL ADV: Partnerships Specialist, NO-C, Jakarta, Indonesia, Post# 114085"
    ),
    "585274": (
        "INTERNAL EXTERNAL ADV: Partnerships Officer (High Value), NO-A, Jakarta, Indonesia, "
        "Post# 135008"
    ),
    "585309": (
        "INTERNAL EXTERNAL ADV: Digital Communication Officer (Campaign & User Experience), "
        "NO-A, Jakarta, Indonesia, Post# 114074"
    ),
    "585973": "Emergency Officer , (NO-1), Sokoto, Nigeria #134792 [Temp Appointment]",
    "586094": (
        "Social & Behavior Change Officer, (NO-2), Maiduguri, Nigeria #00134663 [Temp Appointment]"
    ),
    "588528": (
        "National Individual Consultant for Multisectoral Youth Engagement Programme, Maseru, "
        "Lesotho, 20 days per month for 6 months (120 days)"
    ),
    "588594": "Assistant Programme en appui à la section Education, GS5, Bangui, CAR, Post#135350",
    "585265": (
        "INTERNAL EXTERNAL ADV: Private Sector Fundraising - Digital Fundraising Lead, NO-B, "
        "Jakarta, Indonesia, Post# 135002"
    ),
    "588587": "Republication Interne/Externe Chauffeur, GS-2, FT, Man, Côte d'Ivoire #22074",
    "588611": (
        "National Consultant- ISDB Project Coordination, Monitoring, Evaluation and Learning, "
        "12 Months, Kaduna Nigeria"
    ),
    "588591": "Driver, (GS-2), Georgetown, Guyana #135346 (Temporary Appointment)",
    "588619": (
        "Consultant: Digital Learning Technical Advisor (01.01.2026 - 31.10.2026, "
        "123 working days) UNICEF RRO Poland, Warsaw."
    ),
    "588608": (
        "International Consultancy-Resource Mobilization Consultant, Home based, 6 months "
        "(For Non Ethiopian Nationals))"
    ),
    "588356": (
        "Health Officer (MHPSS), Temporary Appointment (364 days), NOB, Kyiv, Ukraine (#135177)"
    ),
}


def _saved_unicef_jobs(monkeypatch):
    """Page one of the saved listing. Its More Jobs link is answered with a failed fetch."""
    if not _SAVED_UNICEF.is_file():
        pytest.skip("saved UNICEF listing is gitignored")
    html = _SAVED_UNICEF.read_bytes().decode("utf-8")
    crawler = SimpleCrawler("postgresql://example")
    asked = []

    async def unavailable(url, *_args, **_kwargs):
        asked.append(url)
        return 0, ""

    monkeypatch.setattr(crawler, "_fetch_listing_page", unavailable)
    monkeypatch.setattr("crawler_v2.simple_crawler._sleep", _no_sleep)
    jobs = asyncio.run(crawler._listing_jobs_without_ai(html, _UNICEF_LISTING))
    assert asked == ["https://jobs.unicef.org/en-us/listing/?page=2&page-items=20"]
    return jobs


def test_saved_unicef_listing_yields_twenty_admitted_jobs(monkeypatch):
    jobs = _saved_unicef_jobs(monkeypatch)
    links = [job["apply_url"] for job in jobs]
    assert len(jobs) == 20
    assert len(set(links)) == 20
    assert all(re.search(r"/en-us/job/\d+/", link) for link in links)
    assert all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", job.get("deadline", "")) for job in jobs)
    assert sum(1 for job in jobs if job.get("location_raw")) == 19
    assert all(job.get("location_raw", "x").strip() for job in jobs)
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert rejected == []
    assert len(admitted) == 20


def test_saved_unicef_titles_match_the_stored_identities(monkeypatch):
    jobs = {
        re.search(r"/job/(\d+)/", job["apply_url"]).group(1): job
        for job in _saved_unicef_jobs(monkeypatch)
    }
    mismatched = []
    for job_id, stored_title in _STORED_UNICEF.items():
        job = jobs.get(job_id)
        if job is None:
            mismatched.append((job_id, "missing"))
            continue
        url = job["apply_url"]
        if not set(both_keys(job["title"], url, None)) & set(both_keys(stored_title, url, None)):
            mismatched.append((job_id, job["title"]))
    assert mismatched == []


def test_saved_icrc_listing_is_unchanged_by_the_fallback(monkeypatch):
    if not _SAVED_ICRC.is_file():
        pytest.skip("saved ICRC listing is gitignored")
    _readers_must_not_be_called(monkeypatch)
    html = _SAVED_ICRC.read_bytes().decode("utf-8", errors="replace")
    crawler = SimpleCrawler("postgresql://example")
    _no_network(crawler, monkeypatch)
    before = crawler.extract_jobs_from_html(html, _ICRC_LISTING)
    crawler.ai_extractor = _FakeAI(RuntimeError("no credits"))
    after = asyncio.run(crawler._ai_listing_jobs(html, _ICRC_LISTING, "ICRC"))
    assert after == before
    first = admit_batch([dict(job) for job in before], "html")
    second = admit_batch([dict(job) for job in after], "html")
    assert [job["apply_url"] for job in first[0]] == [job["apply_url"] for job in second[0]]
    assert [(job["apply_url"], reason) for job, reason in first[1]] == [
        (job["apply_url"], reason) for job, reason in second[1]
    ]


_PAGE = "https://jobs.unicef.org/en-us/listing/?page={}&page-items=20"
_SIGNUP = '<a href="/en-us/Listing/?page=2&page-items=20&subscribe=true">Send me jobs</a>'


def _listing_page(job_ids, more_href=None, remaining=None):
    cards = "".join(
        _card(job_id, f"Programme Officer {job_id}, Nairobi", "Text.", "Kenya", "21 Oct 2026")
        for job_id in job_ids
    )
    more = ""
    if more_href is not None:
        more = f'<a class="more-link button" href="{more_href}">More Jobs {remaining or 0}</a>'
    return f"{_SIGNUP}<div>{cards}{more}</div><div>{cards}{more}</div>"


def _paged_crawler(monkeypatch, pages):
    """Serve later listing pages from a map. A list answers successive requests in order.

    Unknown URLs fail the test. Sleeps are recorded on crawler.slept instead of waiting.
    """
    crawler = SimpleCrawler("postgresql://example")
    asked = []
    crawler.slept = []

    async def fetch(url, *_args, **_kwargs):
        asked.append(url)
        if url not in pages:
            raise AssertionError(f"unexpected fetch of {url}")
        answer = pages[url]
        return answer.pop(0) if isinstance(answer, list) else answer

    async def record_sleep(seconds):
        crawler.slept.append(seconds)

    async def refuse(url, *_args, **_kwargs):
        raise AssertionError(f"listing pages must not use fetch_html: {url}")

    monkeypatch.setattr(crawler, "_fetch_listing_page", fetch)
    monkeypatch.setattr(crawler, "fetch_html", refuse)
    monkeypatch.setattr("crawler_v2.simple_crawler._sleep", record_sleep)
    return crawler, asked


def _read_listing(crawler, first_html):
    jobs = asyncio.run(crawler._listing_jobs_without_ai(first_html, _UNICEF_LISTING))
    return [re.search(r"/job/(\d+)/", job["apply_url"]).group(1) for job in jobs]


def test_unicef_follows_more_jobs_pages_into_one_batch(monkeypatch):
    first = _listing_page(["1", "2"], "/en-us/listing/?page=2&page-items=20", 3)
    second = _listing_page(["2", "3"], "/en-us/listing/?page=3&page-items=20", 1)
    pages = {
        _PAGE.format(2): (200, second),
        _PAGE.format(3): (200, _listing_page(["4"])),
    }
    crawler, asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2", "3", "4"]
    assert asked == [_PAGE.format(2), _PAGE.format(3)]


def test_a_failed_later_page_keeps_the_jobs_already_read(monkeypatch):
    first = _listing_page(["1", "2"], "/en-us/listing/?page=2&page-items=20", 20)
    crawler, asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (0, "")})
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_PAGE.format(2)]


def test_a_page_with_no_new_jobs_stops_the_walk(monkeypatch):
    first = _listing_page(["1", "2"], "/en-us/listing/?page=2&page-items=20", 20)
    repeat = _listing_page(["1", "2"], "/en-us/listing/?page=3&page-items=20", 20)
    crawler, asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (200, repeat)})
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_PAGE.format(2)]


def test_the_page_cap_stops_an_endless_listing(monkeypatch):
    monkeypatch.setattr("crawler_v2.simple_crawler._UNICEF_PAGE_CAP", 3)
    pages = {
        _PAGE.format(n): (
            200,
            _listing_page([str(n)], f"/en-us/listing/?page={n + 1}&page-items=20", 99),
        )
        for n in range(2, 10)
    }
    first = _listing_page(["1"], "/en-us/listing/?page=2&page-items=20", 99)
    crawler, asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2", "3"]
    assert asked == [_PAGE.format(2), _PAGE.format(3)]


@pytest.mark.parametrize(
    "href",
    [
        pytest.param("https://evil.example/en-us/listing/?page=2&page-items=20", id="other-host"),
        pytest.param("/en-us/search/?page=2", id="other-path"),
        pytest.param("/en-us/listing/?page=1&page-items=20", id="same-page"),
        pytest.param("/en-us/listing/?page-items=20", id="no-page-number"),
        pytest.param("/en-us/listing/?page=2&page-items=20&subscribe=true", id="signup"),
        pytest.param("javascript:void(0)", id="script"),
    ],
)
def test_links_that_do_not_lead_to_a_later_listing_page_are_not_followed(href, monkeypatch):
    crawler, asked = _paged_crawler(monkeypatch, {})
    assert _read_listing(crawler, _listing_page(["1"], href, 5)) == ["1"]
    assert asked == []


def test_the_signup_link_alone_is_not_pagination(monkeypatch):
    crawler, asked = _paged_crawler(monkeypatch, {})
    assert _read_listing(crawler, _listing_page(["1", "2"])) == ["1", "2"]
    assert asked == []


def test_ai_off_unicef_uses_the_unicef_pages_and_skips_the_registry(monkeypatch):
    def refuse():
        raise AssertionError("the plugin registry was consulted")

    monkeypatch.setattr("crawler.plugins.get_plugin_registry", refuse)
    first = _listing_page(["1"], "/en-us/listing/?page=2&page-items=20", 1)
    crawler, asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (200, _listing_page(["2"]))})
    crawler.use_ai = False
    jobs = asyncio.run(crawler._listing_jobs(first, _UNICEF_LISTING, "UNICEF"))
    assert [job["apply_url"] for job in jobs] == [_link("1"), _link("2")]
    assert asked == [_PAGE.format(2)]


def test_ai_off_other_sources_keep_the_registry_path(monkeypatch):
    class _Registry:
        def extract(self, html, base_url, config=None, preferred_plugin=None):
            return PluginResult(jobs=[{"title": "From plugin", "apply_url": "https://x/9"}])

    monkeypatch.setattr("crawler.plugins.get_plugin_registry", lambda: _Registry())
    crawler, _sentinel = _crawler([], monkeypatch)
    crawler.use_ai = False
    jobs = asyncio.run(crawler._listing_jobs("<html></html>", _ICRC_LISTING, "ICRC"))
    assert jobs == [{"title": "From plugin", "apply_url": "https://x/9"}]


def test_icrc_never_paginates(monkeypatch):
    crawler, _sentinel = _crawler(RuntimeError("no credits"), monkeypatch)
    html = _listing_page(["1"], "/en-us/listing/?page=2&page-items=20", 5)
    jobs = asyncio.run(crawler._ai_listing_jobs(html, _ICRC_LISTING, "ICRC"))
    assert jobs == _sentinel


def test_a_walk_that_runs_out_of_links_is_complete(monkeypatch):
    first = _listing_page(["1", "2"], "/en-us/listing/?page=2&page-items=20", 3)
    second = _listing_page(["3"], "/en-us/listing/?page=3&page-items=20", 2)
    pages = {
        _PAGE.format(2): (200, second),
        _PAGE.format(3): (200, _listing_page(["4", "5"])),
    }
    crawler, _asked = _paged_crawler(monkeypatch, pages)
    _read_listing(crawler, first)
    assert crawler._listing_report == {
        "pages": 3,
        "expected": 5,
        "complete": True,
        "stop": "no More Jobs link",
    }
    assert _listing_outcome(5, crawler._listing_report) == (
        "ok",
        "Found 5 jobs; listing complete: 3 pages, expected 5",
    )


def test_a_failed_page_makes_the_crawl_partial(monkeypatch):
    first = _listing_page(["1", "2"], "/en-us/listing/?page=2&page-items=20", 3)
    second = _listing_page(["3"], "/en-us/listing/?page=3&page-items=20", 2)
    pages = {_PAGE.format(2): (200, second), _PAGE.format(3): (0, "")}
    crawler, _asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2", "3"]
    report = crawler._listing_report
    assert report["complete"] is False
    assert report["pages"] == 2
    assert report["stop"] == f"HTTP 0 on {_PAGE.format(3)}"
    status, message = _listing_outcome(3, report)
    assert status == "warn"
    assert message == (
        "Found 3 jobs; listing partial: 2 pages, expected 5, "
        f"stopped: HTTP 0 on {_PAGE.format(3)}"
    )


def test_the_page_cap_and_a_repeated_page_are_partial(monkeypatch):
    monkeypatch.setattr("crawler_v2.simple_crawler._UNICEF_PAGE_CAP", 2)
    first = _listing_page(["1"], "/en-us/listing/?page=2&page-items=20", 9)
    endless = _listing_page(["2"], "/en-us/listing/?page=3&page-items=20", 8)
    crawler, _asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (200, endless)})
    _read_listing(crawler, first)
    assert crawler._listing_report["complete"] is False
    assert crawler._listing_report["stop"] == "page cap 2"

    repeat = _listing_page(["1"], "/en-us/listing/?page=3&page-items=20", 8)
    crawler, _asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (200, repeat)})
    _read_listing(crawler, first)
    assert crawler._listing_report["complete"] is False
    assert crawler._listing_report["stop"] == "page 2 added no new jobs"


def test_sources_without_a_paged_listing_keep_the_plain_message(monkeypatch):
    crawler, _sentinel = _crawler(RuntimeError("no credits"), monkeypatch)
    asyncio.run(crawler._listing_jobs("<html></html>", _ICRC_LISTING, "ICRC"))
    assert crawler._listing_report is None
    assert _listing_outcome(14, None) == ("ok", "Found 14 jobs")
    assert _listing_outcome(0, None) == ("warn", "No jobs found")


def test_unknown_expected_total_is_reported_as_unknown():
    report = {"pages": 1, "expected": None, "complete": True, "stop": "no More Jobs link"}
    assert _listing_outcome(20, report) == (
        "ok",
        "Found 20 jobs; listing complete: 1 page, expected unknown",
    )


def test_crawl_source_reports_the_listing_outcome():
    import inspect

    source = inspect.getsource(SimpleCrawler.crawl_source)
    assert "_listing_outcome(len(jobs), self._listing_report)" in source
    assert "extracted_fields['listing_complete']" in source


_P2 = "/en-us/listing/?page=2&page-items=20"
_P3 = "/en-us/listing/?page=3&page-items=20"


def test_pages_are_five_seconds_apart(monkeypatch):
    first = _listing_page(["1"], _P2, 2)
    pages = {
        _PAGE.format(2): (200, _listing_page(["2"], _P3, 1)),
        _PAGE.format(3): (200, _listing_page(["3"])),
    }
    crawler, _asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2", "3"]
    assert crawler.slept == [5.0, 5.0]


@pytest.mark.parametrize("status", [202, 429, 503])
def test_a_retryable_status_is_retried_once_after_thirty_seconds(status, monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    pages = {_PAGE.format(2): [(status, "challenge"), (200, _listing_page(["2"]))]}
    crawler, asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_PAGE.format(2), _PAGE.format(2)]
    assert crawler.slept == [5.0, 30.0]
    assert crawler._listing_report["complete"] is True


def test_a_failed_retry_stops_the_walk_as_partial(monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    pages = {_PAGE.format(2): [(202, "challenge"), (202, "challenge")]}
    crawler, asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1"]
    assert asked == [_PAGE.format(2), _PAGE.format(2)]
    assert crawler.slept == [5.0, 30.0]
    report = crawler._listing_report
    assert report["complete"] is False
    assert report["stop"] == f"HTTP 202 on {_PAGE.format(2)} after one retry"
    assert _listing_outcome(1, report)[0] == "warn"


def test_only_one_retry_is_allowed_in_a_crawl(monkeypatch):
    first = _listing_page(["1"], _P2, 2)
    pages = {
        _PAGE.format(2): [(202, "challenge"), (200, _listing_page(["2"], _P3, 1))],
        _PAGE.format(3): (503, "busy"),
    }
    crawler, asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_PAGE.format(2), _PAGE.format(2), _PAGE.format(3)]
    assert crawler.slept == [5.0, 30.0, 5.0]
    assert crawler._listing_report["stop"] == f"HTTP 503 on {_PAGE.format(3)}"


@pytest.mark.parametrize("status", [0, 403, 404, 500])
def test_other_failures_are_not_retried(status, monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    crawler, asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (status, "")})
    assert _read_listing(crawler, first) == ["1"]
    assert asked == [_PAGE.format(2)]
    assert crawler.slept == [5.0]
    assert crawler._listing_report["stop"] == f"HTTP {status} on {_PAGE.format(2)}"


def test_only_allowlisted_response_headers_are_logged():
    headers = {
        "Set-Cookie": "session=secret",
        "Authorization": "Bearer secret",
        "Cookie": "a=b",
        "X-Internal": "nope",
        "Server": "awselb/2.0",
        "X-Amzn-Waf-Action": "challenge",
        "Retry-After": "30",
        "Content-Type": "text/html",
    }
    assert _logged_headers(headers) == {
        "content-type": "text/html",
        "server": "awselb/2.0",
        "retry-after": "30",
        "x-amzn-waf-action": "challenge",
    }


def test_the_body_excerpt_is_collapsed_redacted_and_short():
    token = "AbCdEf0123456789AbCdEf0123456789+/="
    body = f"<html>\n  <script>  window.gokuProps = {{key: '{token}'}}  </script>\n" + "x " * 400
    excerpt = _response_excerpt(body)
    assert token not in excerpt
    assert "[redacted]" in excerpt
    assert "\n" not in excerpt and "  " not in excerpt
    assert len(excerpt) == 300


def test_a_listing_page_failure_logs_safe_diagnostics(monkeypatch, caplog):
    from contracts.outbound import FetchResult

    sent = []
    token = "Zx9" * 12

    async def fake_fetch_url(url, *, headers=None, timeout=None, **_kwargs):
        sent.append(headers)
        return FetchResult(
            status_code=202,
            headers={
                "Set-Cookie": "aws-waf-token=secret-cookie",
                "x-amzn-waf-action": "challenge",
                "Server": "awselb/2.0",
            },
            body=f"<html> challenge {token} </html>".encode(),
            url=url,
        )

    monkeypatch.setattr("crawler_v2.simple_crawler.fetch_url", fake_fetch_url)
    crawler = SimpleCrawler("postgresql://example")
    with caplog.at_level("WARNING", logger="crawler_v2.simple_crawler"):
        status, text = asyncio.run(crawler._fetch_listing_page(_PAGE.format(7)))
    assert status == 202
    assert "challenge" in text
    assert sent == [_html_request_headers(crawler.user_agent)]
    logged = caplog.text
    assert "HTTP 202" in logged
    assert "x-amzn-waf-action" in logged and "awselb/2.0" in logged
    assert "secret-cookie" not in logged and "set-cookie" not in logged.lower()
    assert token not in logged and "[redacted]" in logged


def test_a_listing_page_exception_is_a_failed_page(monkeypatch):
    async def broken(url, **_kwargs):
        raise RuntimeError("connection reset")

    monkeypatch.setattr("crawler_v2.simple_crawler.fetch_url", broken)
    crawler = SimpleCrawler("postgresql://example")
    assert asyncio.run(crawler._fetch_listing_page(_PAGE.format(2))) == (0, "")


def test_fetch_html_still_sends_the_same_headers_and_switches_agent_on_403(monkeypatch):
    from contracts.outbound import FetchResult

    sent = []

    async def fake_fetch_url(url, *, headers=None, timeout=None, **_kwargs):
        sent.append(dict(headers))
        status = 403 if len(sent) == 1 else 200
        return FetchResult(status_code=status, headers={}, body=b"<html></html>", url=url)

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr("crawler_v2.simple_crawler.fetch_url", fake_fetch_url)
    monkeypatch.setattr("crawler_v2.simple_crawler.asyncio.sleep", no_wait)
    crawler = SimpleCrawler("postgresql://example")
    assert asyncio.run(crawler.fetch_html("https://jobs.example/")) == (200, "<html></html>")
    assert sent[0] == _html_request_headers(crawler.user_agent, 0)
    assert sent[0]["User-Agent"] == crawler.user_agent
    assert sent[1]["User-Agent"].startswith("Mozilla/5.0 (Windows NT 10.0")
    assert {k: v for k, v in sent[1].items() if k != "User-Agent"} == {
        k: v for k, v in sent[0].items() if k != "User-Agent"
    }


_SAVED_PAGE2 = _ROOT / "unicef-pagination" / "page2.body"


def test_saved_live_page_two_reads_twenty_admitted_jobs():
    if not _SAVED_PAGE2.is_file():
        pytest.skip("saved UNICEF page two is gitignored")
    html = _SAVED_PAGE2.read_bytes().decode("utf-8")
    jobs = UNICEFPlugin().read_job_cards(html, _PAGE.format(2))
    assert len(jobs) == 20
    assert len({job["apply_url"] for job in jobs}) == 20
    assert all(job.get("location_raw") for job in jobs)
    assert all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", job.get("deadline", "")) for job in jobs)
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert rejected == []
    assert len(admitted) == 20
