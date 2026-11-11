"""The "Sites" career-site reader (ledger W-55): UNICEF's careers site since 11 November 2026.

The excerpts in fixtures/unicef_sites are verbatim from the two pages saved on 11 November 2026
(three job cards, the totals line and the pager each). The paging tests build pages from the same
card markup. No network and no database.
"""
import asyncio
from pathlib import Path

import pytest

from contracts.admission import admit_batch, too_thin
from crawler.plugins.sites_engine import SitesListingReader, closing_day, resized_url
from crawler_v2.simple_crawler import SimpleCrawler

_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "unicef_sites"
_SEARCH = "https://jobs.unicef.org/jobs/search"


def _excerpt(name):
    return (_FIXTURES / f"{name}.html").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# The reader on the saved pages.
# ---------------------------------------------------------------------------


def test_the_reader_reads_every_field_of_the_saved_cards():
    page = SitesListingReader().read_page(_excerpt("page1-default"), _SEARCH)
    assert page.is_sites
    assert page.total == 225
    assert page.next_url == f"{_SEARCH}?page=2"
    assert page.jobs[0] == {
        "title": "Consultancy for 2026 Country Office Annual Reporting, South Sudan "
                 "(Remote/Homebased), 3 months, International Candidates Only), #596923",
        "apply_url": "https://jobs.unicef.org/jobs/consultancy-for-2026-country-office-annual-"
                     "reporting-south-sudan-remote-homebased-3-months-international-candidates-"
                     "only-596923-south-sudan",
        "record_class": "reader_card",
        "location_raw": "South Sudan",
        "employment_type": "Consultant",
        "deadline": "2026-11-20",
    }
    assert [(job["location_raw"], job["employment_type"], job["deadline"])
            for job in page.jobs[1:]] == [
        ("Denmark", "Fixed Term Appointment", "2026-11-28"),
        ("Cote d'Ivoire", "Consultant", "2026-11-25"),
    ]


def test_the_resized_page_keeps_the_page_size_in_its_links():
    page = SitesListingReader().read_page(_excerpt("page1-per-page"), f"{_SEARCH}?per_page=100")
    assert page.total == 230
    assert len(page.jobs) == 3
    assert page.next_url == f"{_SEARCH}?page=2&per_page=100"
    assert page.jobs[1]["location_raw"] == "United States, New York"


def test_a_page_without_the_engines_pager_is_not_this_site():
    html = _excerpt("page1-default").replace('engine="Sites::Engine"', 'engine="Other"')
    page = SitesListingReader().read_page(html, _SEARCH)
    assert not page.is_sites
    assert page.jobs == []


def test_a_card_whose_link_leaves_the_site_or_holds_two_links_is_skipped():
    reader = SitesListingReader()
    html = _excerpt("page1-default")
    off_site = html.replace('href="https://jobs.unicef.org/jobs/consultancy-for-2026',
                            'href="https://elsewhere.example/jobs/consultancy-for-2026', 1)
    assert len(reader.read_page(off_site, _SEARCH).jobs) == 2
    first_title = off_site.find('<h3 class="card-title job-search-results-card-title">')
    doubled = (html[:first_title] + '<h3 class="card-title job-search-results-card-title">'
               '<a href="/jobs/a">A</a><a href="/jobs/b">B</a></h3>' + html[first_title:])
    jobs = reader.read_page(doubled, _SEARCH).jobs
    assert len(jobs) == 2 and all(job["title"] for job in jobs)


@pytest.mark.parametrize("text, day", [
    ("Closing at: 20 Nov 2026 - 23:55 EAT", "2026-11-20"),
    ("Closing at: 28 November 2026 - 23:55 CET", "2026-11-28"),
    ("Closing at: 1 Sept 2027", "2027-09-01"),
    ("Closing at: 31 Feb 2027", None),
    ("Closing at: 3 Smarch 2027", None),
    ("Closing at: 120 Nov 2026", None),
    ("Closing at: soon", None),
    ("", None),
])
def test_the_closing_day_is_the_day_the_site_writes(text, day):
    assert closing_day(text) == day


@pytest.mark.parametrize("url, resized", [
    (_SEARCH, f"{_SEARCH}?per_page=100"),
    (f"{_SEARCH}?page=3", f"{_SEARCH}?per_page=100"),
    (f"{_SEARCH}?sort=date", f"{_SEARCH}?sort=date&per_page=100"),
    (f"{_SEARCH}?per_page=50", None),
])
def test_page_one_at_the_readers_size(url, resized):
    assert resized_url(url) == resized


# ---------------------------------------------------------------------------
# Admission of the cards (crawler plan, C3, amendment of 11 November 2026).
# ---------------------------------------------------------------------------


def test_a_reader_card_with_its_fields_is_admitted_though_its_link_has_no_job_number():
    jobs = SitesListingReader().read_page(_excerpt("page1-default"), _SEARCH).jobs
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert len(admitted) == 3 and rejected == []
    as_html = [{k: v for k, v in job.items() if k != "record_class"} for job in jobs]
    admitted, rejected = admit_batch(as_html, "html")
    assert admitted == [], "the same links without the reader's mark are not vacancies"
    assert {reason for _job, reason in rejected} == {"no_qualifying_family"}


def test_a_reader_card_without_location_deadline_or_contract_type_is_too_thin():
    card = {"title": "Officer", "apply_url": "https://jobs.unicef.org/jobs/officer",
            "record_class": "reader_card"}
    admitted, rejected = admit_batch([card], "html")
    assert admitted == []
    (job, reason), = rejected
    assert reason == "no_qualifying_structured_evidence"
    assert too_thin(job, reason)


# ---------------------------------------------------------------------------
# Paging (crawler_v2/simple_crawler.py, _sites_listing_jobs).
# ---------------------------------------------------------------------------

_CARD = (
    '<article class="col-12 job-search-results-card-col"><div class="card">'
    '<h3 class="card-title job-search-results-card-title">'
    '<a href="https://jobs.unicef.org/jobs/officer-{n}">Officer {n}</a></h3>'
    '<li class="job-component-icon-and-text job-component-location"><span> Kenya </span></li>'
    '<li class="job-component-icon-and-text job-component-closing-at">'
    '<span> Closing at: 20 Dec 2026 - 23:55 EAT </span></li></div></article>'
)


def _page(numbers, total, next_href=None):
    following = (
        f'<li class="next next_page page-item"><a rel="next" href="{next_href}">›</a></li>'
        if next_href else
        '<li class="next next_page disabled page-item"><a href="">›</a></li>'
    )
    total_text = f"<b>{total}</b>" if total is not None else "<b>?</b>"
    return (
        "<html><body>" + "".join(_CARD.format(n=n) for n in numbers)
        + f'<div class="table-counts"><p> Displaying <b>1 - x</b> of {total_text} in total'
        "</p></div>"
        f'<nav class="pagination" engine="Sites::Engine"><ul>{following}</ul></nav>'
        "</body></html>"
    )


def _walk(first_html, answers):
    crawler = SimpleCrawler("postgresql://unused")
    asked = []

    async def fetch(url):
        asked.append(url)
        return answers.get(url, (404, "", ""))

    crawler._fetch_listing_page = fetch
    jobs, report = asyncio.run(crawler._sites_listing_jobs(first_html, _SEARCH))
    return jobs, report, asked


def test_a_complete_walk_reads_page_one_again_at_50_then_follows_the_sites_links():
    first = _page([1, 2, 3], 7, "/jobs/search?page=2")
    answers = {
        f"{_SEARCH}?per_page=100": (200, _page([1, 2, 3, 4, 5], 7,
                                               "/jobs/search?page=2&per_page=100"), ""),
        f"{_SEARCH}?page=2&per_page=100": (200, _page([6, 7], 7), ""),
    }
    jobs, report, asked = _walk(first, answers)
    assert asked == [f"{_SEARCH}?per_page=100", f"{_SEARCH}?page=2&per_page=100"]
    assert [job["title"] for job in jobs] == [f"Officer {n}" for n in range(1, 8)]
    assert report == {"pages": 3, "expected": 7, "complete": True, "stop": "no next-page link"}


def test_a_single_page_listing_makes_no_request():
    jobs, report, asked = _walk(_page([1, 2], 2), {})
    assert asked == []
    assert len(jobs) == 2 and report["complete"] is True


@pytest.mark.parametrize("answer, stop", [
    ((503, "", ""), f"HTTP 503 on {_SEARCH}?page=2&per_page=100"),
    ((0, "", "HTTP 202 (AWS WAF challenge)"),
     f"refused: HTTP 202 (AWS WAF challenge) on {_SEARCH}?page=2&per_page=100"),
])
def test_a_failed_or_refused_page_keeps_what_was_read_and_is_partial(answer, stop):
    first = _page([1, 2, 3], 7, "/jobs/search?page=2")
    answers = {
        f"{_SEARCH}?per_page=100": (200, _page([1, 2, 3, 4, 5], 7,
                                               "/jobs/search?page=2&per_page=100"), ""),
        f"{_SEARCH}?page=2&per_page=100": answer,
    }
    jobs, report, _asked = _walk(first, answers)
    assert len(jobs) == 5
    assert report["complete"] is False
    assert report["stop"] == stop


def test_a_walk_that_ends_short_of_the_stated_total_is_partial():
    jobs, report, _asked = _walk(_page([1, 2, 3], 4), {})
    assert report == {"pages": 1, "expected": 4, "complete": False, "stop": "read 3 of 4 jobs"}


def test_a_walk_without_a_stated_total_is_partial():
    _jobs, report, _asked = _walk(_page([1, 2], None), {})
    assert report["complete"] is False
    assert report["stop"] == "expected total unknown"


def test_a_later_page_that_adds_no_jobs_ends_the_walk():
    first = _page([1, 2, 3], 9, "/jobs/search?page=2")
    answers = {
        f"{_SEARCH}?per_page=100": (200, _page([1, 2, 3, 4], 9,
                                               "/jobs/search?page=2&per_page=100"), ""),
        f"{_SEARCH}?page=2&per_page=100": (200, _page([3, 4], 9,
                                                      "/jobs/search?page=3&per_page=100"), ""),
    }
    jobs, report, asked = _walk(first, answers)
    assert len(jobs) == 4 and len(asked) == 2
    assert report["stop"] == f"{_SEARCH}?page=2&per_page=100 added no new jobs"


def test_a_job_closing_during_the_walk_makes_it_partial_not_complete():
    # 7 jobs; job 2 closes after page one at 50 is read, so page 2 starts one job later and
    # job 6 falls between pages. The site now says 6: the walk must not call itself complete.
    first = _page([1, 2, 3], 7, "/jobs/search?page=2")
    answers = {
        f"{_SEARCH}?per_page=100": (200, _page([1, 2, 3, 4, 5], 7,
                                               "/jobs/search?page=2&per_page=100"), ""),
        f"{_SEARCH}?page=2&per_page=100": (200, _page([7], 6), ""),
    }
    jobs, report, _asked = _walk(first, answers)
    assert "Officer 6" not in [job["title"] for job in jobs]
    assert report["complete"] is False
    assert report["expected"] == 7
    assert report["stop"] == f"total changed from 7 to 6 on {_SEARCH}?page=2&per_page=100"


def test_more_jobs_than_the_stated_total_is_partial():
    _jobs, report, _asked = _walk(_page([1, 2, 3], 2), {})
    assert report["complete"] is False
    assert report["stop"] == "read 3 jobs, more than the stated 2"


@pytest.mark.parametrize("href", ["https://elsewhere.example/jobs/search?page=2",
                                  "/careers/other?page=2"])
def test_a_next_link_found_but_not_followed_is_partial(href):
    page = SitesListingReader().read_page(_page([1, 2], 4, href), _SEARCH)
    assert page.next_url is None and page.next_refused is True
    jobs, report, asked = _walk(_page([1, 2], 4, href), {})
    assert asked == []
    assert report["complete"] is False
    assert report["stop"] == f"next-page link not followed on {_SEARCH}"


def test_a_site_that_ignores_the_page_size_is_still_read_page_by_page():
    first = _page([1, 2, 3], 7, "/jobs/search?page=2")
    answers = {
        f"{_SEARCH}?per_page=100": (200, _page([1, 2, 3], 7,
                                               "/jobs/search?page=2&per_page=100"), ""),
        f"{_SEARCH}?page=2&per_page=100": (200, _page([4, 5, 6], 7,
                                                      "/jobs/search?page=3&per_page=100"), ""),
        f"{_SEARCH}?page=3&per_page=100": (200, _page([7], 7), ""),
    }
    jobs, report, asked = _walk(first, answers)
    assert len(asked) == 3
    assert len(jobs) == 7 and report["complete"] is True


def test_the_resized_page_one_may_add_nothing_only_while_it_links_on():
    first = _page([1, 2, 3], 7, "/jobs/search?page=2")
    answers = {f"{_SEARCH}?per_page=100": (200, _page([1, 2, 3], 7), "")}
    _jobs, report, _asked = _walk(first, answers)
    assert report["stop"] == f"{_SEARCH}?per_page=100 added no new jobs"


def test_the_walk_stops_at_the_page_cap(monkeypatch):
    from crawler_v2 import simple_crawler

    monkeypatch.setattr(simple_crawler, "_PAGEUP_PAGE_CAP", 2)
    first = _page([1, 2, 3], 9, "/jobs/search?page=2")
    answers = {
        f"{_SEARCH}?per_page=100": (200, _page([1, 2, 3, 4], 9,
                                               "/jobs/search?page=2&per_page=100"), ""),
    }
    _jobs, report, asked = _walk(first, answers)
    assert len(asked) == 1
    assert report["stop"] == "page cap 2" and report["complete"] is False


def test_a_stated_total_with_a_thousands_separator_is_read():
    html = _page([1], None).replace("<b>?</b>", "<b>1,230</b>")
    assert SitesListingReader().read_page(html, _SEARCH).total == 1230


def test_a_card_linking_to_the_listing_itself_is_skipped():
    html = _page([1, 2], 2).replace("https://jobs.unicef.org/jobs/officer-1",
                                    "https://jobs.unicef.org/jobs/search?per_page=100")
    jobs = SitesListingReader().read_page(html, _SEARCH).jobs
    assert [job["title"] for job in jobs] == ["Officer 2"]


def test_the_crawl_chooses_this_reader_by_the_page_not_the_address():
    crawler = SimpleCrawler("postgresql://unused")

    async def fetch(url):
        return 404, "", ""

    crawler._fetch_listing_page = fetch
    html = _page([1, 2], 2).replace("https://jobs.unicef.org", "https://careers.example.org")
    jobs, report = asyncio.run(crawler._listing_jobs(html, "https://careers.example.org/"))
    assert [job["record_class"] for job in jobs] == ["reader_card", "reader_card"]
    assert report["complete"] is True
