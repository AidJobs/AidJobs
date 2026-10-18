"""UNICEF listing reader and the no-AI fallback. Excerpts only; saved pages are optional."""
import asyncio
import re
from pathlib import Path

import pytest

from contracts.admission import admit_batch
from contracts.identity import both_keys
from crawler.plugins.base import PluginResult
from crawler.plugins.unicef import UNICEFPlugin
from crawler_v2.simple_crawler import SimpleCrawler

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


def _crawler(outcome, monkeypatch, general=None):
    crawler = SimpleCrawler("postgresql://example")
    crawler.ai_extractor = _FakeAI(outcome)
    crawler.use_ai = True
    sentinel = general if general is not None else [{"title": "general", "apply_url": "https://x/1"}]
    monkeypatch.setattr(crawler, "extract_jobs_from_html", lambda html, url: list(sentinel))
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


def _saved_unicef_jobs():
    if not _SAVED_UNICEF.is_file():
        pytest.skip("saved UNICEF listing is gitignored")
    html = _SAVED_UNICEF.read_bytes().decode("utf-8")
    return SimpleCrawler("postgresql://example")._listing_jobs_without_ai(html, _UNICEF_LISTING)


def test_saved_unicef_listing_yields_twenty_admitted_jobs():
    jobs = _saved_unicef_jobs()
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


def test_saved_unicef_titles_match_the_stored_identities():
    jobs = {
        re.search(r"/job/(\d+)/", job["apply_url"]).group(1): job for job in _saved_unicef_jobs()
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
