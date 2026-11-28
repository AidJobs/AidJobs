"""The PageUp career-site reader (UNICEF's listing), its paging, and the general reader.
Excerpts only; saved pages are optional."""
import asyncio
import importlib
import inspect
import re
from pathlib import Path

import pytest

from contracts.admission import admit_batch
from contracts.identity import both_keys
from contracts.refusal import refusal
from crawler.plugins.pageup import PageUpListingReader
from crawler_v2 import readers as readers_module
from crawler_v2 import simple_crawler as simple_crawler_module
from crawler_v2.simple_crawler import (
    SimpleCrawler,
    _html_request_headers,
    _listing_outcome,
    _logged_headers,
    _resized_listing_page,
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
    jobs = PageUpListingReader().read_job_cards(_LISTING, _UNICEF_LISTING)
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
    jobs = PageUpListingReader().read_job_cards(_LISTING, _UNICEF_LISTING)
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
    assert PageUpListingReader().read_job_cards(html, _UNICEF_LISTING) == []


async def _no_sleep(_seconds):
    return None


def _no_network(crawler, monkeypatch):
    async def refuse(url, *_args, **_kwargs):
        raise AssertionError(f"unexpected fetch of {url}")

    monkeypatch.setattr(crawler, "fetch_html", refuse)
    monkeypatch.setattr(crawler, "_fetch_page", refuse)
    monkeypatch.setattr(crawler, "_fetch_listing_page", refuse)
    monkeypatch.setattr("crawler_v2.simple_crawler._sleep", _no_sleep)


def _crawler(monkeypatch, general=None):
    """A crawler whose general reader returns a sentinel and counts its calls."""
    crawler = SimpleCrawler("postgresql://example")
    sentinel = general if general is not None else [{"title": "general", "apply_url": "https://x/1"}]
    crawler.general_calls = 0

    def general_reader(html, url):
        crawler.general_calls += 1
        return list(sentinel)

    monkeypatch.setattr(crawler, "extract_jobs_from_html", general_reader)
    _no_network(crawler, monkeypatch)
    return crawler, sentinel


def _pageup_reader_returns(monkeypatch, outcome):
    def read_job_cards(self, html, base_url):
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    monkeypatch.setattr(
        "crawler.plugins.pageup.PageUpListingReader.read_job_cards", read_job_cards
    )


def test_unicef_uses_its_reader(monkeypatch):
    crawler, sentinel = _crawler(monkeypatch)
    jobs, _report = asyncio.run(crawler._listing_jobs(_LISTING, _UNICEF_LISTING))
    assert [job["apply_url"] for job in jobs] == [
        _link("588602"),
        _link("588591"),
        _link("588601"),
    ]
    assert jobs != sentinel
    assert crawler.general_calls == 0


def test_job_cards_choose_the_reader_wherever_the_listing_is(monkeypatch):
    elsewhere = "https://careers.example.org/en-gb/listing/"
    crawler, sentinel = _crawler(monkeypatch)
    jobs, report = asyncio.run(crawler._listing_jobs(_LISTING, elsewhere))
    assert [job["apply_url"] for job in jobs] == [
        f"https://careers.example.org/en-us/job/{job_id}/slug-{job_id}"
        for job_id in ("588602", "588591", "588601")
    ]
    assert report["complete"] is False
    assert report["stop"] == "expected total unknown"
    assert crawler.general_calls == 0


def test_a_page_without_job_cards_goes_to_the_general_reader_wherever_it_is(monkeypatch):
    without_cards = "<html><body><a href='/en-us/job/1/a'>Officer</a></body></html>"
    lookalike = "https://example.org/jobs?next=https://jobs.unicef.org/en-us/listing/"
    for url in (_UNICEF_LISTING, _ICRC_LISTING, lookalike):
        crawler, sentinel = _crawler(monkeypatch)
        jobs, report = asyncio.run(crawler._listing_jobs(without_cards, url))
        assert jobs == sentinel
        # General reader always reports (W-39); no stated total → incomplete.
        assert report == {
            "pages": 1,
            "expected": len(sentinel),
            "complete": False,
            "stop": "no stated total",
        }
        assert crawler.general_calls == 1


def test_the_address_check_is_gone():
    assert not hasattr(simple_crawler_module, "_is_unicef_listing")
    source = inspect.getsource(SimpleCrawler._listing_jobs)
    assert "unicef" not in source.lower()
    # The readers are chosen in crawler_v2/readers.py since W-35.
    assert "unicef" not in inspect.getsource(readers_module).lower()
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("crawler.plugins.unicef")


def test_the_crawler_calls_no_ai_service_even_with_a_key_set(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "set-but-unused")
    assert "use_ai" not in inspect.signature(SimpleCrawler.__init__).parameters
    crawler = SimpleCrawler("postgresql://example")
    for name in ("use_ai", "ai_extractor", "ai_normalizer"):
        assert not hasattr(crawler, name), name
    source = inspect.getsource(SimpleCrawler) + inspect.getsource(readers_module)
    for marker in ("ai_extractor", "ai_normalizer", "_ai_listing_jobs", "openrouter"):
        assert marker not in source.lower(), marker


def test_the_old_plugin_registry_is_gone():
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("crawler.plugins.registry")
    assert "get_plugin_registry" not in inspect.getsource(SimpleCrawler)


@pytest.mark.parametrize(
    "plugin_outcome",
    [
        pytest.param([], id="no-jobs"),
        pytest.param(RuntimeError("bad page"), id="error"),
    ],
)
def test_unicef_reader_failure_falls_back_to_the_general_reader(plugin_outcome, monkeypatch):
    _pageup_reader_returns(monkeypatch, plugin_outcome)
    crawler, sentinel = _crawler(monkeypatch)
    jobs, _report = asyncio.run(crawler._listing_jobs(_LISTING, _UNICEF_LISTING))
    assert jobs == sentinel
    assert crawler.general_calls == 1


def test_repeated_links_keep_the_first_row(monkeypatch):
    rows = [
        {"title": "First wording", "apply_url": _link("1"), "deadline": "2025-12-01"},
        {"title": "Second wording", "apply_url": _link("1"), "deadline": "2025-12-02"},
        {"title": "Other job", "apply_url": _link("2"), "deadline": "2025-12-03"},
    ]
    _pageup_reader_returns(monkeypatch, rows)
    crawler, _sentinel = _crawler(monkeypatch)
    jobs, _report = asyncio.run(crawler._listing_jobs(_LISTING, _UNICEF_LISTING))
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
    """Page one of the saved listing. Asking for it at 100 jobs a page fails."""
    if not _SAVED_UNICEF.is_file():
        pytest.skip("saved UNICEF listing is gitignored")
    html = _SAVED_UNICEF.read_bytes().decode("utf-8")
    crawler = SimpleCrawler("postgresql://example")
    asked = []

    async def unavailable(url, *_args, **_kwargs):
        asked.append(url)
        return 0, "", ""

    monkeypatch.setattr(crawler, "_fetch_listing_page", unavailable)
    monkeypatch.setattr("crawler_v2.simple_crawler._sleep", _no_sleep)
    jobs, _report = asyncio.run(crawler._listing_jobs(html, _UNICEF_LISTING))
    assert asked == ["https://jobs.unicef.org/en-us/listing/?page-items=100"]
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


def test_saved_icrc_listing_goes_to_the_successfactors_reader(monkeypatch):
    if not _SAVED_ICRC.is_file():
        pytest.skip("saved ICRC listing is gitignored")
    html = _SAVED_ICRC.read_bytes().decode("utf-8", errors="replace")
    assert PageUpListingReader().read_job_cards(html, _ICRC_LISTING) == []
    crawler = SimpleCrawler("postgresql://example")
    _no_network(crawler, monkeypatch)
    general = crawler.extract_jobs_from_html(html, _ICRC_LISTING)
    after, report = asyncio.run(crawler._listing_jobs(html, _ICRC_LISTING))
    # The page states 12 and shows 12 tiles: the SuccessFactors reader reads every one, and
    # each tile's own apply link is one the general reader also found, so the saved rows keep
    # their keys (growth plan step 6, pull request 1).
    assert report == {
        "pages": 1,
        "expected": 12,
        "complete": True,
        "stop": "all tiles read",
    }
    assert len(after) == 12
    assert {job["apply_url"] for job in after} <= {job["apply_url"] for job in general}
    admitted, rejected = admit_batch([dict(job) for job in after], "html")
    assert len(admitted) == 12 and rejected == []


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


def _paged_crawler(monkeypatch, pages, page_items=20):
    """Serve later listing pages from a map. A list answers successive requests in order.

    Unknown URLs fail the test. Sleeps are recorded on crawler.slept instead of waiting. Each
    answer is (status, html), judged for a refusal as `_fetch_listing_page` judges it. The
    reader asks for `page_items` jobs a page; at the listing's own 20 it never asks again.
    """
    monkeypatch.setattr("crawler_v2.simple_crawler._PAGEUP_PAGE_ITEMS", page_items)
    crawler = SimpleCrawler("postgresql://example")
    asked = []
    crawler.slept = []

    async def fetch(url, *_args, **_kwargs):
        asked.append(url)
        if url not in pages:
            raise AssertionError(f"unexpected fetch of {url}")
        answer = pages[url]
        status, html = answer.pop(0) if isinstance(answer, list) else answer
        return status, html, refusal(status, {}, html)

    async def record_sleep(seconds):
        crawler.slept.append(seconds)

    async def refuse(url, *_args, **_kwargs):
        raise AssertionError(f"listing pages must not use fetch_html: {url}")

    monkeypatch.setattr(crawler, "_fetch_listing_page", fetch)
    monkeypatch.setattr(crawler, "fetch_html", refuse)
    monkeypatch.setattr("crawler_v2.simple_crawler._sleep", record_sleep)
    return crawler, asked


def _read_listing(crawler, first_html):
    """Job ids read from the listing; the walk's report is kept on the test's crawler."""
    jobs, crawler.report = asyncio.run(crawler._listing_jobs(first_html, _UNICEF_LISTING))
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
    monkeypatch.setattr("crawler_v2.simple_crawler._PAGEUP_PAGE_CAP", 3)
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
    assert crawler.report["complete"] is False
    assert crawler.report["stop"] == f"More Jobs link not followed on {_UNICEF_LISTING}"


def test_a_later_page_whose_link_is_not_followed_is_partial(monkeypatch):
    first = _listing_page(["1"], _P2, 2)
    itself = _listing_page(["2"], "/en-us/listing/?page=2&page-items=20", 1)
    crawler, asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (200, itself)})
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_PAGE.format(2)]
    assert crawler.report["complete"] is False
    assert crawler.report["stop"] == f"More Jobs link not followed on {_PAGE.format(2)}"


_HIDDEN_LAST = [
    pytest.param("/en-us/listing/?page=3&page-items=20", id="with-address"),
    pytest.param(None, id="without-address"),
]


def _last_page(job_ids, href):
    if href is None:
        return _listing_page(job_ids) + '<a class="more-link button">More Jobs 0</a>'
    return _listing_page(job_ids, href, 0)


@pytest.mark.parametrize("href", _HIDDEN_LAST)
def test_a_more_jobs_link_counting_zero_ends_the_listing(href, monkeypatch):
    first = _listing_page(["1", "2"], _P2, 1)
    crawler, asked = _paged_crawler(
        monkeypatch, {_PAGE.format(2): (200, _last_page(["3"], href))}
    )
    assert _read_listing(crawler, first) == ["1", "2", "3"]
    assert asked == [_PAGE.format(2)]
    assert crawler.report == {
        "pages": 2, "expected": 3, "complete": True, "stop": "no More Jobs link",
    }


@pytest.mark.parametrize("href", _HIDDEN_LAST)
def test_a_first_page_counting_zero_is_not_asked_again(href, monkeypatch):
    crawler, asked = _paged_crawler(monkeypatch, {}, page_items=100)
    assert _read_listing(crawler, _last_page(["1", "2"], href)) == ["1", "2"]
    assert asked == []
    assert crawler.report["complete"] is True
    assert crawler.report["expected"] == 2


def test_page_numbers_are_ascii_digits_only():
    assert simple_crawler_module._page_number("page=%C2%B2") is None
    assert simple_crawler_module._page_number("page=7") == 7


def test_a_more_jobs_button_without_an_address_is_partial(monkeypatch):
    first = _listing_page(["1"]) + '<a class="more-link button">More Jobs 5</a>'
    crawler, asked = _paged_crawler(monkeypatch, {})
    assert _read_listing(crawler, first) == ["1"]
    assert asked == []
    assert crawler.report["stop"] == f"More Jobs link not followed on {_UNICEF_LISTING}"


def test_a_walk_that_read_fewer_jobs_than_the_site_counts_is_partial(monkeypatch):
    first = _listing_page(["1", "2"], _P2, 3)
    crawler, _asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (200, _listing_page(["3"]))})
    assert _read_listing(crawler, first) == ["1", "2", "3"]
    assert crawler.report["complete"] is False
    assert crawler.report["stop"] == "read 3 of 5 jobs"
    assert _listing_outcome(3, crawler.report) == (
        "warn", "Found 3 jobs; listing partial: 2 pages, expected 5, stopped: read 3 of 5 jobs",
    )


def test_the_signup_link_alone_is_not_pagination(monkeypatch):
    crawler, asked = _paged_crawler(monkeypatch, {})
    assert _read_listing(crawler, _listing_page(["1", "2"])) == ["1", "2"]
    assert asked == []


def test_a_listing_pages_only_through_its_own_address(monkeypatch):
    crawler, _sentinel = _crawler(monkeypatch)
    html = _listing_page(["1"], "/en-us/listing/?page=2&page-items=20", 5)
    jobs, report = asyncio.run(crawler._listing_jobs(html, _ICRC_LISTING))
    assert [job["apply_url"] for job in jobs] == [
        "https://careers.icrc.org/en-us/job/1/slug-1"
    ]
    assert report["pages"] == 1
    assert crawler.general_calls == 0


# The reader's page size ---------------------------------------------------------------------

_BIG = "https://jobs.unicef.org/en-us/listing/?page-items=100"
_BIG_PAGE = "https://jobs.unicef.org/en-us/listing/?page={}&page-items=100"


def _ids(first, last):
    return [str(n) for n in range(first, last + 1)]


def test_page_one_is_asked_again_at_one_hundred_jobs_a_page(monkeypatch):
    first = _listing_page(["1", "2"], _P2, 4)
    pages = {_BIG: (200, _listing_page(_ids(1, 6)))}
    crawler, asked = _paged_crawler(monkeypatch, pages, page_items=100)
    assert _read_listing(crawler, first) == _ids(1, 6)
    assert asked == [_BIG]
    assert crawler.report == {
        "pages": 2, "expected": 6, "complete": True, "stop": "no More Jobs link",
    }


def test_a_266_job_listing_takes_three_requests_after_page_one(monkeypatch):
    first = _listing_page(_ids(1, 20), _P2, 246)
    pages = {
        _BIG: (200, _listing_page(_ids(1, 100), "/en-us/listing/?page=2&page-items=100", 166)),
        _BIG_PAGE.format(2): (
            200, _listing_page(_ids(101, 200), "/en-us/listing/?page=3&page-items=100", 66),
        ),
        _BIG_PAGE.format(3): (200, _listing_page(_ids(201, 266))),
    }
    crawler, asked = _paged_crawler(monkeypatch, pages, page_items=100)
    assert _read_listing(crawler, first) == _ids(1, 266)
    assert asked == [_BIG, _BIG_PAGE.format(2), _BIG_PAGE.format(3)]
    assert _listing_outcome(266, crawler.report) == (
        "ok", "Found 266 jobs; listing complete: 4 pages, expected 266",
    )


def test_the_expected_total_comes_from_the_bigger_page(monkeypatch):
    first = _listing_page(["1"], _P2, 9)
    pages = {
        _BIG: (200, _listing_page(_ids(1, 4), "/en-us/listing/?page=2&page-items=100", 7)),
        _BIG_PAGE.format(2): (200, _listing_page(_ids(5, 11))),
    }
    crawler, _asked = _paged_crawler(monkeypatch, pages, page_items=100)
    assert _read_listing(crawler, first) == _ids(1, 11)
    assert crawler.report["expected"] == 11


def test_a_site_that_keeps_its_own_page_size_is_still_read_whole(monkeypatch):
    first = _listing_page(["1", "2"], _P2, 1)
    pages = {
        _BIG: (200, _listing_page(["1", "2"], _P2, 1)),
        _PAGE.format(2): (200, _listing_page(["3"])),
    }
    crawler, asked = _paged_crawler(monkeypatch, pages, page_items=100)
    assert _read_listing(crawler, first) == ["1", "2", "3"]
    assert asked == [_BIG, _PAGE.format(2)]
    assert crawler.report["complete"] is True


@pytest.mark.parametrize("answer", [
    pytest.param(_listing_page(["1", "2"]), id="same-jobs-no-link"),
    pytest.param("<html><body>no cards</body></html>", id="no-cards"),
    pytest.param("<html><body>no cards<a class='more-link' "
                 "href='/en-us/listing/?page=2&page-items=20'>More Jobs 5</a></body></html>",
                 id="no-cards-with-link"),
])
def test_a_bigger_page_that_adds_no_jobs_and_ends_the_walk_is_partial(answer, monkeypatch):
    first = _listing_page(["1", "2"], _P2, 5)
    crawler, asked = _paged_crawler(monkeypatch, {_BIG: (200, answer)}, page_items=100)
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_BIG]
    assert crawler.report["complete"] is False
    assert crawler.report["stop"] == "page 2 added no new jobs"
    assert crawler.report["expected"] == 7


def test_a_refused_bigger_page_keeps_page_one_and_is_partial(monkeypatch):
    first = _listing_page(["1", "2"], _P2, 5)
    crawler, asked = _paged_crawler(monkeypatch, {_BIG: [(202, "challenge")]}, page_items=100)
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_BIG]
    assert crawler.slept == []
    assert crawler.report == {
        "pages": 1, "expected": 7, "complete": False, "stop": f"refused: HTTP 202 on {_BIG}",
    }


def test_a_plain_503_on_the_bigger_page_is_the_crawls_one_retry(monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    pages = {_BIG: [(503, "busy"), (200, _listing_page(["1", "2"]))]}
    crawler, asked = _paged_crawler(monkeypatch, pages, page_items=100)
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_BIG, _BIG]
    assert crawler.slept == [30.0]


@pytest.mark.parametrize("href", [
    pytest.param("/en-us/listing/?page=2&page-items=100", id="already-100"),
    pytest.param("/en-us/listing/?page=2&page-items=250", id="larger"),
    pytest.param("/en-us/listing/?page=2", id="no-page-size"),
    pytest.param("/en-us/listing/?page=2&page-items=abc", id="not-a-number"),
    pytest.param("/en-us/listing/?page=2&page-items=20&page-items=50", id="two-sizes"),
    pytest.param("/en-us/listing/?page=2&page-items=\u00b2", id="not-an-ascii-number"),
])
def test_a_link_that_names_no_smaller_page_size_is_followed_as_it_is(href, monkeypatch):
    target = "https://jobs.unicef.org" + href
    crawler, asked = _paged_crawler(
        monkeypatch, {target: (200, _listing_page(["2"]))}, page_items=100
    )
    assert _read_listing(crawler, _listing_page(["1"], href, 1)) == ["1", "2"]
    assert asked == [target]


def test_a_single_page_listing_is_not_asked_again_and_is_not_complete(monkeypatch):
    crawler, asked = _paged_crawler(monkeypatch, {}, page_items=100)
    assert _read_listing(crawler, _listing_page(["1", "2"])) == ["1", "2"]
    assert asked == []
    assert crawler.report["complete"] is False
    assert crawler.report["stop"] == "expected total unknown"


def test_a_site_that_ignores_the_size_but_keeps_it_in_its_links_is_partial(monkeypatch):
    first = _listing_page(["1", "2"], _P2, 4)
    pages = {
        _BIG: (200, _listing_page(["1", "2"], "/en-us/listing/?page=2&page-items=100", 4)),
        _BIG_PAGE.format(2): (200, _listing_page(["5", "6"])),
    }
    crawler, asked = _paged_crawler(monkeypatch, pages, page_items=100)
    assert _read_listing(crawler, first) == ["1", "2", "5", "6"]
    assert asked == [_BIG, _BIG_PAGE.format(2)]
    assert crawler.report["complete"] is False
    assert crawler.report["stop"] == "read 4 of 6 jobs"


@pytest.mark.parametrize("href, expected", [
    pytest.param(
        "/en-us/listing/?page=2&page-items=20",
        "https://jobs.unicef.org/en-us/listing/?page-items=100",
        id="unicef",
    ),
    pytest.param(
        "/en-us/listing/?location=Kenya&page=2&page-items=20&lang=fr",
        "https://jobs.unicef.org/en-us/listing/?location=Kenya&page-items=100&lang=fr",
        id="other-parameters-kept",
    ),
    pytest.param("https://evil.example/en-us/listing/?page=2&page-items=20", None, id="other-host"),
    pytest.param("/en-us/search/?page=2&page-items=20", None, id="other-path"),
    pytest.param("/en-us/listing/?page=2&page-items=20&subscribe=true", None, id="signup"),
    pytest.param("/en-us/listing/?page=1&page-items=20", None, id="not-a-later-page"),
])
def test_the_bigger_page_is_built_only_from_a_later_listing_page(href, expected, monkeypatch):
    monkeypatch.setattr("crawler_v2.simple_crawler._PAGEUP_PAGE_ITEMS", 100)
    html = _listing_page(["1"], href, 5)
    assert _resized_listing_page(html, _UNICEF_LISTING) == expected


def test_a_walk_that_runs_out_of_links_is_complete(monkeypatch):
    first = _listing_page(["1", "2"], "/en-us/listing/?page=2&page-items=20", 3)
    second = _listing_page(["3"], "/en-us/listing/?page=3&page-items=20", 2)
    pages = {
        _PAGE.format(2): (200, second),
        _PAGE.format(3): (200, _listing_page(["4", "5"])),
    }
    crawler, _asked = _paged_crawler(monkeypatch, pages)
    _read_listing(crawler, first)
    assert crawler.report == {
        "pages": 3,
        "expected": 5,
        "complete": True,
        "stop": "no More Jobs link",
    }
    assert _listing_outcome(5, crawler.report) == (
        "ok",
        "Found 5 jobs; listing complete: 3 pages, expected 5",
    )


def test_a_failed_page_makes_the_crawl_partial(monkeypatch):
    first = _listing_page(["1", "2"], "/en-us/listing/?page=2&page-items=20", 3)
    second = _listing_page(["3"], "/en-us/listing/?page=3&page-items=20", 2)
    pages = {_PAGE.format(2): (200, second), _PAGE.format(3): (0, "")}
    crawler, _asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2", "3"]
    report = crawler.report
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
    monkeypatch.setattr("crawler_v2.simple_crawler._PAGEUP_PAGE_CAP", 2)
    first = _listing_page(["1"], "/en-us/listing/?page=2&page-items=20", 9)
    endless = _listing_page(["2"], "/en-us/listing/?page=3&page-items=20", 8)
    crawler, _asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (200, endless)})
    _read_listing(crawler, first)
    assert crawler.report["complete"] is False
    assert crawler.report["stop"] == "page cap 2"

    repeat = _listing_page(["1"], "/en-us/listing/?page=3&page-items=20", 8)
    crawler, _asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (200, repeat)})
    _read_listing(crawler, first)
    assert crawler.report["complete"] is False
    assert crawler.report["stop"] == "page 2 added no new jobs"


def test_sources_without_a_paged_listing_keep_the_plain_message(monkeypatch):
    crawler, _sentinel = _crawler(monkeypatch)
    _jobs, report = asyncio.run(crawler._listing_jobs("<html></html>", _ICRC_LISTING))
    assert report == {
        "pages": 1,
        "expected": len(_sentinel) if _sentinel else None,
        "complete": False,
        "stop": "no stated total",
    }
    assert _listing_outcome(14, None) == ("ok", "Found 14 jobs")
    assert _listing_outcome(0, None) == ("warn", "No jobs found")
    # Unknown-completeness stops stay ok; shortfalls stay warn (W-39).
    unknown = {
        "pages": 1,
        "expected": 6,
        "complete": False,
        "stop": "no stated total",
    }
    assert _listing_outcome(6, unknown) == (
        "ok",
        "Found 6 jobs; listing not counted: no stated total",
    )
    shortfall = {
        "pages": 1,
        "expected": 12,
        "complete": False,
        "stop": "showing 1 to 12 of 12, read 32 rows, 12 on-page",
    }
    assert _listing_outcome(32, shortfall)[0] == "warn"


def test_unknown_expected_total_is_reported_as_unknown():
    report = {"pages": 1, "expected": None, "complete": True, "stop": "no More Jobs link"}
    assert _listing_outcome(20, report) == (
        "ok",
        "Found 20 jobs; listing complete: 1 page, expected unknown",
    )


def test_crawl_source_reports_the_listing_outcome():
    import inspect

    source = inspect.getsource(SimpleCrawler.crawl_source)
    assert "_listing_outcome(found_count, listing_report)" in source
    assert "self._listing_report" not in inspect.getsource(SimpleCrawler)
    assert "extracted_fields['listing_complete']" in source


_P2 = "/en-us/listing/?page=2&page-items=20"
_P3 = "/en-us/listing/?page=3&page-items=20"


def test_the_reader_leaves_the_spacing_to_the_fetch_policy(monkeypatch):
    first = _listing_page(["1"], _P2, 2)
    pages = {
        _PAGE.format(2): (200, _listing_page(["2"], _P3, 1)),
        _PAGE.format(3): (200, _listing_page(["3"])),
    }
    crawler, _asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2", "3"]
    assert crawler.slept == []


def test_a_plain_503_is_retried_once_after_thirty_seconds(monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    pages = {_PAGE.format(2): [(503, "busy"), (200, _listing_page(["2"]))]}
    crawler, asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_PAGE.format(2), _PAGE.format(2)]
    assert crawler.slept == [30.0]
    assert crawler.report["complete"] is True


@pytest.mark.parametrize("status, body, stop", [
    (202, "challenge", "refused: HTTP 202"),
    (429, "", "refused: HTTP 429"),
    (403, "", "refused: HTTP 403"),
    (503, "<title>Just a moment...</title>", "refused: HTTP 503 (Cloudflare challenge)"),
])
def test_a_refusal_or_a_challenge_is_never_retried(status, body, stop, monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    crawler, asked = _paged_crawler(monkeypatch, {_PAGE.format(2): [(status, body)]})
    assert _read_listing(crawler, first) == ["1"]
    assert asked == [_PAGE.format(2)]
    assert crawler.slept == []
    report = crawler.report
    assert report["complete"] is False
    assert report["stop"] == f"{stop} on {_PAGE.format(2)}"
    assert _listing_outcome(1, report)[0] == "warn"


def test_a_failed_retry_stops_the_walk_as_partial(monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    pages = {_PAGE.format(2): [(503, "busy"), (503, "busy")]}
    crawler, asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1"]
    assert asked == [_PAGE.format(2), _PAGE.format(2)]
    assert crawler.slept == [30.0]
    report = crawler.report
    assert report["complete"] is False
    assert report["stop"] == f"HTTP 503 on {_PAGE.format(2)} after one retry"
    assert _listing_outcome(1, report)[0] == "warn"


def test_a_retry_answered_with_a_challenge_stops_as_refused(monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    pages = {_PAGE.format(2): [(503, "busy"), (202, "challenge")]}
    crawler, asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1"]
    assert asked == [_PAGE.format(2), _PAGE.format(2)]
    assert crawler.report["stop"] == f"refused: HTTP 202 on {_PAGE.format(2)} after one retry"


def test_only_one_retry_is_allowed_in_a_crawl(monkeypatch):
    first = _listing_page(["1"], _P2, 2)
    pages = {
        _PAGE.format(2): [(503, "busy"), (200, _listing_page(["2"], _P3, 1))],
        _PAGE.format(3): (503, "busy"),
    }
    crawler, asked = _paged_crawler(monkeypatch, pages)
    assert _read_listing(crawler, first) == ["1", "2"]
    assert asked == [_PAGE.format(2), _PAGE.format(2), _PAGE.format(3)]
    assert crawler.slept == [30.0]
    assert crawler.report["stop"] == f"HTTP 503 on {_PAGE.format(3)}"


@pytest.mark.parametrize("status", [0, 404, 500])
def test_other_failures_are_not_retried(status, monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    crawler, asked = _paged_crawler(monkeypatch, {_PAGE.format(2): (status, "")})
    assert _read_listing(crawler, first) == ["1"]
    assert asked == [_PAGE.format(2)]
    assert crawler.slept == []
    assert crawler.report["stop"] == f"HTTP {status} on {_PAGE.format(2)}"


def test_a_policy_stop_ends_the_walk_in_its_own_words(monkeypatch):
    first = _listing_page(["1"], _P2, 1)
    crawler, asked = _paged_crawler(monkeypatch, {})

    async def forbidden(url, *_args, **_kwargs):
        asked.append(url)
        return 0, "", "robots.txt forbids this address"

    monkeypatch.setattr(crawler, "_fetch_listing_page", forbidden)
    assert _read_listing(crawler, first) == ["1"]
    assert crawler.report["stop"] == f"robots.txt forbids this address on {_PAGE.format(2)}"


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
        status, text, stop = asyncio.run(crawler._fetch_listing_page(_PAGE.format(7)))
    assert status == 202
    assert "challenge" in text
    assert stop == "HTTP 202 (AWS WAF challenge)"
    assert sent == [_html_request_headers()]
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
    assert asyncio.run(crawler._fetch_listing_page(_PAGE.format(2))) == (0, "", "")


def test_a_403_is_answered_once_and_never_retried_under_another_name(monkeypatch):
    from contracts.outbound import FetchResult

    sent = []

    async def fake_fetch_url(url, *, headers=None, timeout=None, **_kwargs):
        sent.append(dict(headers))
        status = 403 if len(sent) == 1 else 200
        return FetchResult(status_code=status, headers={}, body=b"<html></html>", url=url)

    monkeypatch.setattr("crawler_v2.simple_crawler.fetch_url", fake_fetch_url)
    crawler = SimpleCrawler("postgresql://example")
    assert asyncio.run(crawler.fetch_html("https://jobs.example/")) == (403, "<html></html>")
    assert asyncio.run(crawler._fetch_page("https://jobs.example/")) == (
        200, "<html></html>", ""
    )
    assert len(sent) == 2
    assert sent[0] == _html_request_headers()
    assert not {"user-agent", "from"} & {name.lower() for name in sent[0]}


def test_the_crawler_asks_like_a_crawler_not_a_browser():
    headers = {name.lower() for name in _html_request_headers()}
    assert headers == {"accept", "accept-language", "accept-encoding"}
    source = Path(simple_crawler_module.__file__).read_text(encoding="utf-8")
    for imitation in ("Mozilla/", "Chrome/", "Sec-Fetch", "Upgrade-Insecure-Requests"):
        assert imitation not in source


_SAVED_PAGE2 = _ROOT / "unicef-pagination" / "page2.body"


def test_saved_live_page_two_reads_twenty_admitted_jobs():
    if not _SAVED_PAGE2.is_file():
        pytest.skip("saved UNICEF page two is gitignored")
    html = _SAVED_PAGE2.read_bytes().decode("utf-8")
    jobs = PageUpListingReader().read_job_cards(html, _PAGE.format(2))
    assert len(jobs) == 20
    assert len({job["apply_url"] for job in jobs}) == 20
    assert all(job.get("location_raw") for job in jobs)
    assert all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", job.get("deadline", "")) for job in jobs)
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert rejected == []
    assert len(admitted) == 20


_SAVED_ITEMS100 = _ROOT / "unicef-pagination" / "page1-items100.body"


def test_saved_live_page_at_one_hundred_reads_a_hundred_admitted_jobs_and_links_on(monkeypatch):
    if not _SAVED_ITEMS100.is_file():
        pytest.skip("saved UNICEF page at 100 jobs is gitignored")
    html = _SAVED_ITEMS100.read_bytes().decode("utf-8")
    jobs = PageUpListingReader().read_job_cards(html, _BIG)
    assert len({job["apply_url"] for job in jobs}) == len(jobs) == 100
    assert all(job.get("location_raw") and job.get("deadline") for job in jobs)
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert rejected == []
    assert len(admitted) == 100
    first = _listing_page(["1"], _P2, 272)
    crawler, asked = _paged_crawler(
        monkeypatch, {_BIG: (200, html), _BIG_PAGE.format(2): (0, "")}, page_items=100
    )
    _read_listing(crawler, first)
    assert asked == [_BIG, _BIG_PAGE.format(2)]
    assert crawler.report["expected"] == 100 + 173
