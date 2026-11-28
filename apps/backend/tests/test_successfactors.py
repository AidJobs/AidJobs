"""The SuccessFactors tile reader (growth plan, step 6, pull request 1).

The verbatim page is the saved ICRC listing in fixtures/general_reader (twelve tiles, with the
desktop, tablet and phone copies of each, and one tile with only its phone copy). Cases that the
saved page does not show (a Switzerland tile, the paging script, a second page) are built from
the same tile markup, and are labelled as such. No network and no database.
"""
import asyncio
import json
import threading
from pathlib import Path

import pytest

from contracts.admission import admit_batch
from contracts.identity import algorithm_b
from contracts.outbound import FetchResult
from contracts.reader import CANDIDATE_FIELDS, Response
from crawler.plugins.successfactors import (
    SuccessFactorsListingReader,
    _place,
    parse_day,
    tile_endpoint_url,
)
from crawler_v2 import simple_crawler
from crawler_v2.readers import SuccessFactorsReader, html_readers, read_listing
from crawler_v2.simple_crawler import SimpleCrawler, place_job
from crawler_v2.simulate import FIRST_PAGE_ONLY, simulate_html

_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "general_reader"
_ICRC = "https://careers.icrc.org/go/Global-Opportunities/8821501/"
_ENDPOINT = "tile-search-results/category/8821501"
_ENDPOINT_URL = "https://careers.icrc.org/go/Global-Opportunities/8821501/" + _ENDPOINT
_OTHER = "https://careers.example.org/go/Global-Opportunities/8821501/"


def _crawler():
    return SimpleCrawler("postgresql://unused")


def _verbatim():
    html = (_FIXTURES / "icrc-listing.html").read_bytes().decode("utf-8")
    record = json.loads((_FIXTURES / "icrc-listing.json").read_text(encoding="utf-8"))
    return html, record


# ---------------------------------------------------------------------------------------------
# The saved ICRC page (verbatim).
# ---------------------------------------------------------------------------------------------

# title, location_raw, employment_type, deadline, read from the saved page, in page order.
_ICRC_TILES = [
    ("Pashto Interpreter", "Geneva (GVA), Afghanistan", "Max term contract", "2027-12-31"),
    ("First Aid and Pre-Hospital Emergency Care Delegate", "Global Deployment Option",
     "Max term contract", "2026-11-06"),
    ("Burmese Interpreter", "Global Deployment Option", "Fixed term contract", "2027-07-07"),
    ("Russian Interpreter", "Global Deployment Option", "Fixed term contract", "2027-07-09"),
    ("Kurdish Interpreter", "Global Deployment Option", "Fixed term contract", "2027-07-09"),
    ("Health Delegate", "Global Deployment Option", "Max term contract", "2026-10-25"),
    ("Hausa Interpreter", "Geneva (GVA), Nigeria", "Max term contract", "2027-12-31"),
    ("Kinyarwanda Interpreter", "Geneva (GVA), Democratic Republic of the Congo",
     "Max term contract", "2027-12-31"),
    ("Amharic, Oromo & Tigrinya Interpreter", "Geneva (GVA), Ethiopia", "Max term contract",
     "2027-12-31"),
    ("Fula / Fulani / Peul Interpreter", "Global Deployment Option", "Open-ended contract",
     "2027-12-31"),
    ("Arabic Interpreter", "Global Deployment Option", "Max term contract", "2027-12-31"),
    ("Somali Interpreter", "Geneva (GVA), Somalia", "Max term contract", "2027-12-31"),
]


def test_the_saved_icrc_page_gives_its_twelve_tiles_with_the_fields_the_page_shows():
    html, _record = _verbatim()
    page = SuccessFactorsListingReader().read_page(html, _ICRC)
    assert page.is_tiles and page.tiles == 12
    assert (page.total, page.shown, page.total_conflict) == (12, (1, 12, 12), False)
    assert page.endpoint is None and page.next_url is None and not page.next_refused
    assert [
        (job["title"], job["location_raw"], job["employment_type"], job["deadline"])
        for job in page.jobs
    ] == _ICRC_TILES


def test_the_saved_icrc_tiles_keep_the_keys_the_general_reader_stored():
    # Contract §7: an existing ICRC row is found by its canonical key. Each tile's key is one the
    # general reader recorded on this page, so the walk finds the saved rows and makes no duplicate.
    html, record = _verbatim()
    jobs, report = asyncio.run(_crawler()._successfactors_listing_jobs(html, _ICRC))
    recorded_keys = {algorithm_b(job["title"], job["apply_url"], None) for job in record["jobs"]}
    tile_keys = {algorithm_b(job["title"], job["apply_url"], None) for job in jobs}
    assert len(jobs) == 12 and len(tile_keys) == 12
    assert tile_keys <= recorded_keys
    assert report == {"pages": 1, "expected": 12, "complete": True, "stop": "all tiles read"}


def test_the_reader_sets_only_candidate_fields_and_never_a_reference():
    html, _record = _verbatim()
    jobs, _report = asyncio.run(_crawler()._successfactors_listing_jobs(html, _ICRC))
    for job in jobs:
        assert set(job) <= CANDIDATE_FIELDS
        assert "reference" not in job and "locations" not in job
        assert job["record_class"] == "reader_card"


def test_admission_takes_every_saved_tile_from_the_listing_alone():
    html, _record = _verbatim()
    jobs, _report = asyncio.run(_crawler()._successfactors_listing_jobs(html, _ICRC))
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert len(admitted) == 12 and rejected == []


def test_a_saved_tile_location_resolves_its_country_offline():
    html, _record = _verbatim()
    jobs, _report = asyncio.run(_crawler()._successfactors_listing_jobs(html, _ICRC))
    first = dict(jobs[0])
    place_job(first)
    assert (first.get("country"), first.get("country_iso")) == ("Afghanistan", "AF")


def test_the_listing_step_reads_the_tiles_and_names_the_reader():
    html, _record = _verbatim()
    readers = html_readers(_crawler())
    assert isinstance(readers[2], SuccessFactorsReader)
    result = asyncio.run(
        read_listing(readers, Response(200, html), {"careers_url": _ICRC})
    )
    assert result.reader == "successfactors"
    assert result.strategy is None
    assert len(result.jobs) == 12


# ---------------------------------------------------------------------------------------------
# Tiles: copies, links, fields (by label, never by class), places, deadlines (synthetic).
# ---------------------------------------------------------------------------------------------


def _field(classes, label, value):
    head = f'<span class="section-label">{label}</span>' if label is not None else ""
    return f'<div class="section-field {classes}">{head}<div>{value}</div></div>'


def _section(css, href, title, fields):
    return (
        f'<div class="col-md-12 sub-section {css}"><div class="oneline"><div class="tiletitle">'
        '<span class="col-md-12 section-title title" role="heading">'
        f'<a class="jobTitle-link" href="{href}">{title}</a></span></div></div>'
        f'<div class="oneline">{"".join(fields)}</div></div>'
    )


def _tile(job_id, href, title, fields, copies=("sub-section-desktop",)):
    sections = "".join(_section(css, href, title, fields) for css in copies)
    return (
        f'<li class="job-tile job-id-{job_id}"><div class="job-tile-cell">'
        f'<div class="row job job-row">{sections}</div></div></li>'
    )


def _job_tile(n, location="Kenya", deadline="20/12/2026"):
    return _tile(
        n,
        f"/job/Nairobi-Role-{n}/{n}/",
        f"Role {n}",
        [
            _field("dept", "Country", "Kenya"),
            _field("customfield4", "Location", location),
            _field("shifttype", "Contract type", "Fixed term contract"),
            _field("travel", "Application deadline", deadline),
        ],
    )


def _listing(tiles, label=None, script="", next_link=None):
    label_html = f'<span id="tile-search-results-label">{label}</span>' if label else ""
    following = f'<a rel="next" href="{next_link}">Next</a>' if next_link else ""
    return (
        '<html><body class="coreCSB"><div class="job-tile-result-container">'
        f'{label_html}<ul class="container job-list" id="job-tile-list">{"".join(tiles)}</ul>'
        f"</div>{following}{script}</body></html>"
    )


def _fragment(tiles):
    return f'<ul class="container job-list">{"".join(tiles)}</ul>'


def _script(endpoint, found, per_page=25):
    return (
        '<script>j2w.SearchResults.init({ '
        f'apiEndpoint: "{endpoint}", searchQuery: "", searchResults: "", '
        'tileSearchResultsText: "Showing {0} to {1} of {2} Jobs", '
        f'jobRecordsPerPage: parseInt("{per_page}"), jobRecordsFound: parseInt("{found}") '
        "});</script>"
    )


def _read(html, url=_OTHER):
    return SuccessFactorsListingReader().read_page(html, url)


def test_a_copy_is_read_once_and_a_phone_only_tile_is_read():
    tile = _tile(
        1, "/job/Role-1/1/", "Role 1",
        [_field("", "Location", "Nairobi"), _field("", "Application deadline", "20/12/2026")],
        copies=("sub-section-desktop", "sub-section-tablet", "sub-section-mobile"),
    )
    phone = _tile(
        2, "/job/Role-2/2/", "Role 2",
        [_field("", "Location", "Lima")],
        copies=("sub-section-mobile",),
    )
    page = _read(_listing([tile, phone], label="Showing 1 to 2 of 2 Jobs"))
    assert [job["title"] for job in page.jobs] == ["Role 1", "Role 2"]
    assert page.tiles == 2


def test_links_that_are_not_this_sites_jobs_are_skipped():
    html = _listing([
        _tile(1, "https://elsewhere.example/job/1/", "Off site", [_field("", "Location", "X")]),
        _tile(2, "#", "Anchor", [_field("", "Location", "X")]),
        _tile(3, "javascript:void(0)", "Script", [_field("", "Location", "X")]),
        _tile(4, "/go/Global-Opportunities/8821501/", "The listing", [_field("", "Location", "X")]),
        _tile(5, "/job/Role-5/5/", "Role 5", [_field("", "Location", "Nairobi")]),
    ])
    page = _read(html, _OTHER)
    assert [job["title"] for job in page.jobs] == ["Role 5"]


def test_a_tile_with_two_title_links_is_skipped_and_a_repeated_link_counts_once():
    doubled = _tile(1, "/job/Role-1/1/", "Role 1", [_field("", "Location", "Nairobi")])
    doubled = doubled.replace(
        "</a></span>", '</a><a class="jobTitle-link" href="/job/Role-1b/1b/">B</a></span>', 1
    )
    first = _tile(2, "/job/Role-2/2/", "Role 2", [_field("", "Location", "Nairobi")])
    repeated = _tile(3, "/job/Role-2/2/", "Role 2 again", [_field("", "Location", "Nairobi")])
    page = _read(_listing([doubled, first, repeated, _job_tile(4)]))
    assert [job["title"] for job in page.jobs] == ["Role 2", "Role 4"]


def test_a_tile_without_a_title_is_skipped():
    empty = _tile(1, "/job/Role-1/1/", "   ", [_field("", "Location", "Nairobi")])
    assert _read(_listing([empty])).jobs == []


def test_a_listing_read_on_any_host_is_read_by_its_markup_not_its_name():
    page = _read(_listing([_job_tile(1)]), "https://jobs.example.net/go/Any/1/")
    assert [job["apply_url"] for job in page.jobs] == ["https://jobs.example.net/job/Nairobi-Role-1/1"]


def test_fields_are_read_by_their_visible_label_not_their_slot_class():
    tile = _tile(1, "/job/Role-1/1/", "Role 1", [
        _field("dept", "Job category", "Health"),
        _field("facility", "Country", "Kenya"),
        _field("travel", "Start date", "01/01/2027"),
        _field("customfield4", "Application deadline", "20/12/2026"),
    ])
    job = _read(_listing([tile])).jobs[0]
    assert job["location_raw"] == "Kenya"
    assert job["deadline"] == "2026-12-20"
    assert "posted_on" not in job and "employment_type" not in job


def test_a_field_with_no_label_takes_its_semantic_class_only():
    tile = _tile(1, "/job/Role-1/1/", "Role 1", [
        _field("location", None, "Lima"),
        _field("dept", None, "Health"),
    ])
    job = _read(_listing([tile])).jobs[0]
    assert job["location_raw"] == "Lima"


def test_the_posting_date_is_read_as_posted_on():
    tile = _tile(1, "/job/Role-1/1/", "Role 1", [
        _field("", "Posting date", "20 Nov 2026"),
        _field("", "Employment type", "Consultancy"),
    ])
    job = _read(_listing([tile])).jobs[0]
    assert job["posted_on"] == "2026-11-20"
    assert job["employment_type"] == "Consultancy"


@pytest.mark.parametrize("parts, expected", [
    ({"location": "Geneva (GVA)", "country": "Afghanistan"}, "Geneva (GVA), Afghanistan"),
    ({"location": "Global Deployment Option", "country": "Global Deployment Option"},
     "Global Deployment Option"),
    ({"city": "Geneva", "location": "Geneva (GVA)"}, "Geneva (GVA)"),
    ({"location": "Global Deployment Option", "country": "Switzerland"},
     "Global Deployment Option, Switzerland"),
    ({"location": "US", "country": "Russia"}, "US, Russia"),
    # "Lima" sits inside "Lima Region" (a whole word), so the city is not repeated.
    ({"city": "Lima", "state": "Lima Region", "country": "Peru"}, "Lima Region, Peru"),
    ({"city": "Lima", "location": "Lima Centro", "country": "Peru"}, "Lima Centro, Peru"),
    ({}, ""),
])
def test_the_place_keeps_each_part_once(parts, expected):
    assert _place(parts) == expected


@pytest.mark.parametrize("text, day", [
    ("2027-12-31", "2027-12-31"),
    ("31/12/2027", "2027-12-31"),
    ("06/11/2026", "2026-11-06"),
    ("31/12/2027 23:55", "2027-12-31"),
    ("12/25/2026", "2026-12-25"),
    ("20.11.2026", "2026-11-20"),
    ("20-11-2026", "2026-11-20"),
    ("20 Nov 2026", "2026-11-20"),
    ("20-Nov-2026", "2026-11-20"),
    ("20 November 2026", "2026-11-20"),
    ("Nov 20, 2026", "2026-11-20"),
    ("Dec 20, 2026 11:55 PM", "2026-12-20"),
    ("31 Feb 2027", None),
    ("31/02/2027", None),
    ("13/13/2026", None),
    ("soon", None),
    ("", None),
    (None, None),
])
def test_the_deadline_reader_takes_only_days_that_exist(text, day):
    assert parse_day(text) == day


def test_a_tile_whose_title_link_leaves_the_listing_by_a_scheme_is_not_read():
    html = _listing([_tile(1, "mailto:jobs@example.org", "Mail", [_field("", "Location", "X")])])
    assert _read(html).jobs == []


# ---------------------------------------------------------------------------------------------
# Recognition: a page is this reader's only when it shows job tiles.
# ---------------------------------------------------------------------------------------------


def test_a_page_without_tiles_is_not_this_readers_page():
    html = "<html><body><p>x</p></body></html>"
    assert asyncio.run(_crawler()._successfactors_listing_jobs(html, _OTHER)) == ([], None)


def test_markers_without_a_tile_with_a_title_link_are_not_read():
    html = (
        '<html><body class="coreCSB"><li class="job-tile"><a href="/x">no class</a></li>'
        "</body></html>"
    )
    assert asyncio.run(_crawler()._successfactors_listing_jobs(html, _OTHER)) == ([], None)


# ---------------------------------------------------------------------------------------------
# The walk: GET only, one page at a time, complete only when the stated total is read.
# ---------------------------------------------------------------------------------------------


def _walk(first_html, answers, careers_url=_ICRC):
    crawler = _crawler()
    asked = []

    async def fetch(url):
        asked.append(url)
        return answers.get(url, (404, "", ""))

    crawler._fetch_listing_page = fetch
    jobs, report = asyncio.run(crawler._successfactors_listing_jobs(first_html, careers_url))
    return jobs, report, asked


def test_a_single_page_listing_makes_no_request():
    html = _listing([_job_tile(1), _job_tile(2)], label="Showing 1 to 2 of 2 Jobs")
    jobs, report, asked = _walk(html, {})
    assert asked == []
    assert len(jobs) == 2
    assert report == {"pages": 1, "expected": 2, "complete": True, "stop": "all tiles read"}


def test_the_tile_endpoint_walk_reads_every_tile_at_each_start_row():
    first = _listing(
        [_job_tile(1), _job_tile(2)],
        label="Showing 1 to 2 of 5 Jobs",
        script=_script(_ENDPOINT, 5, per_page=2),
    )
    answers = {
        f"{_ENDPOINT_URL}?startrow=2": (200, _fragment([_job_tile(3), _job_tile(4)]), ""),
        f"{_ENDPOINT_URL}?startrow=4": (200, _fragment([_job_tile(5)]), ""),
    }
    jobs, report, asked = _walk(first, answers)
    assert asked == [f"{_ENDPOINT_URL}?startrow=2", f"{_ENDPOINT_URL}?startrow=4"]
    assert [job["title"] for job in jobs] == [f"Role {n}" for n in range(1, 6)]
    assert report == {"pages": 3, "expected": 5, "complete": True, "stop": "all tiles read"}


def test_an_explicit_next_page_link_is_followed_when_the_listing_needs_more():
    first = _listing(
        [_job_tile(1), _job_tile(2)],
        label="Showing 1 to 2 of 4 Jobs",
        next_link="/go/Global-Opportunities/8821501/?startrow=2",
    )
    second = _listing([_job_tile(3), _job_tile(4)], label="Showing 3 to 4 of 4 Jobs")
    answers = {f"{_ICRC}?startrow=2": (200, second, "")}
    jobs, report, asked = _walk(first, answers)
    assert asked == [f"{_ICRC}?startrow=2"]
    assert len(jobs) == 4
    assert report == {"pages": 2, "expected": 4, "complete": True, "stop": "all tiles read"}


def test_a_next_page_link_that_leaves_the_site_is_not_followed():
    first = _listing(
        [_job_tile(1)],
        label="Showing 1 to 1 of 2 Jobs",
        next_link="https://elsewhere.example/go/?startrow=1",
    )
    jobs, report, asked = _walk(first, {})
    assert asked == []
    assert report == {
        "pages": 1,
        "expected": 2,
        "complete": False,
        "stop": f"next-page link not followed on {_ICRC}",
    }


def test_an_off_site_next_link_does_not_matter_once_every_tile_is_read():
    html = _listing(
        [_job_tile(1), _job_tile(2)],
        label="Showing 1 to 2 of 2 Jobs",
        next_link="https://elsewhere.example/go/?startrow=2",
    )
    jobs, report, asked = _walk(html, {})
    assert asked == []
    assert len(jobs) == 2
    assert report == {"pages": 1, "expected": 2, "complete": True, "stop": "all tiles read"}


@pytest.mark.parametrize("answer, stop", [
    ((0, "", "HTTP 202 (AWS WAF challenge)"),
     f"refused: HTTP 202 (AWS WAF challenge) on {_ENDPOINT_URL}?startrow=2"),
    ((503, "", ""), f"HTTP 503 on {_ENDPOINT_URL}?startrow=2"),
])
def test_a_refused_or_failed_page_keeps_what_was_read_and_is_partial(answer, stop):
    first = _listing([_job_tile(1), _job_tile(2)], label="Showing 1 to 2 of 5 Jobs",
                     script=_script(_ENDPOINT, 5))
    jobs, report, _asked = _walk(first, {f"{_ENDPOINT_URL}?startrow=2": answer})
    assert len(jobs) == 2
    assert report == {"pages": 1, "expected": 5, "complete": False, "stop": stop}


def test_a_page_that_adds_no_new_tiles_stops_the_walk():
    first = _listing([_job_tile(1), _job_tile(2)], label="Showing 1 to 2 of 5 Jobs",
                     script=_script(_ENDPOINT, 5))
    again = _fragment([_job_tile(1), _job_tile(2)])
    jobs, report, _asked = _walk(first, {f"{_ENDPOINT_URL}?startrow=2": (200, again, "")})
    assert len(jobs) == 2
    assert report["complete"] is False
    assert report["stop"] == f"{_ENDPOINT_URL}?startrow=2 added no new jobs"


def test_a_later_page_that_states_another_total_stops_the_walk():
    first = _listing([_job_tile(1), _job_tile(2)], label="Showing 1 to 2 of 5 Jobs",
                     script=_script(_ENDPOINT, 5))
    changed = _listing([_job_tile(3)], label="Showing 3 to 3 of 9 Jobs")
    jobs, report, _asked = _walk(first, {f"{_ENDPOINT_URL}?startrow=2": (200, changed, "")})
    assert len(jobs) == 2
    # The changed page was asked for and read, so it counts as a page; its rows are not kept.
    assert report == {
        "pages": 2,
        "expected": 5,
        "complete": False,
        "stop": f"total changed from 5 to 9 on {_ENDPOINT_URL}?startrow=2",
    }


def test_a_page_that_is_not_tiles_stops_the_walk():
    first = _listing([_job_tile(1)], label="Showing 1 to 1 of 2 Jobs", script=_script(_ENDPOINT, 2))
    jobs, report, _asked = _walk(
        first, {f"{_ENDPOINT_URL}?startrow=1": (200, "<html>Service unavailable</html>", "")}
    )
    assert len(jobs) == 1
    assert report["stop"] == f"{_ENDPOINT_URL}?startrow=1 shows no job tiles"
    assert report["complete"] is False


def test_totals_that_disagree_on_one_page_are_partial_and_asked_for_nothing():
    first = _listing([_job_tile(1)], label="Showing 1 to 1 of 5 Jobs", script=_script(_ENDPOINT, 6))
    jobs, report, asked = _walk(first, {})
    assert asked == []
    assert report == {
        "pages": 1,
        "expected": 5,
        "complete": False,
        "stop": f"stated totals disagree on {_ICRC}",
    }


def test_a_listing_with_no_stated_total_is_partial_and_asked_for_nothing():
    first = _listing([_job_tile(1)])
    jobs, report, asked = _walk(first, {})
    assert asked == []
    assert report["complete"] is False and report["expected"] is None
    assert report["stop"] == "expected total unknown"


def test_no_safe_endpoint_or_next_link_leaves_the_walk_partial():
    first = _listing([_job_tile(1)], label="Showing 1 to 1 of 3 Jobs")
    jobs, report, asked = _walk(first, {})
    assert asked == []
    assert report["stop"] == f"no next-page address on {_ICRC}"


@pytest.mark.parametrize("endpoint", ["../secret/list", "https://evil.example/tile", "/abs/path"])
def test_an_unsafe_endpoint_is_never_requested(endpoint):
    first = _listing([_job_tile(1)], label="Showing 1 to 1 of 3 Jobs", script=_script(endpoint, 3))
    jobs, report, asked = _walk(first, {})
    assert asked == []
    assert report["complete"] is False


def test_the_page_cap_ends_the_walk_as_partial(monkeypatch):
    monkeypatch.setattr(simple_crawler, "_SUCCESSFACTORS_PAGE_CAP", 2)
    first = _listing([_job_tile(1)], label="Showing 1 to 1 of 5 Jobs", script=_script(_ENDPOINT, 5))
    answers = {
        f"{_ENDPOINT_URL}?startrow=1": (200, _fragment([_job_tile(2)]), ""),
        f"{_ENDPOINT_URL}?startrow=2": (200, _fragment([_job_tile(3)]), ""),
    }
    jobs, report, asked = _walk(first, answers)
    assert asked == [f"{_ENDPOINT_URL}?startrow=1"]
    assert len(jobs) == 2
    assert report == {"pages": 2, "expected": 5, "complete": False, "stop": "page cap 2"}


def test_the_walk_runs_its_page_parse_in_a_worker_thread(monkeypatch):
    seen = []
    real = simple_crawler._successfactors_page_sync

    def recording(html, page_url):
        seen.append(threading.current_thread() is threading.main_thread())
        return real(html, page_url)

    monkeypatch.setattr(simple_crawler, "_successfactors_page_sync", recording)
    _walk(_listing([_job_tile(1)], label="Showing 1 to 1 of 1 Jobs"), {})
    assert seen == [False]


# ---------------------------------------------------------------------------------------------
# The endpoint address: GET, on the listing's own host, keeping only search and filter values.
# ---------------------------------------------------------------------------------------------


def test_the_tile_request_keeps_the_search_and_filters_and_sets_the_start_row():
    url = tile_endpoint_url(
        _ENDPOINT,
        "https://careers.example.org/go/x/?q=nurse&page=3&startrow=9"
        "&optionsFacetsDD_location=Kenya&utm_source=mail",
        25,
    )
    assert url == (
        "https://careers.example.org/go/x/tile-search-results/category/8821501"
        "?q=nurse&optionsFacetsDD_location=Kenya&startrow=25"
    )


@pytest.mark.parametrize("endpoint", [None, "", "/abs/path", "https://evil.example/x",
                                       "a/../b", "x y", "//evil.example/x"])
def test_an_endpoint_that_is_not_a_plain_path_on_the_site_gives_no_address(endpoint):
    assert tile_endpoint_url(endpoint, _ICRC, 0) is None


# ---------------------------------------------------------------------------------------------
# Simulate (first page only), and the crawl's record (synthetic page, markup as the saved one).
# ---------------------------------------------------------------------------------------------


def test_simulate_reads_the_first_page_only_and_names_the_reader():
    first = _listing(
        [_job_tile(1), _job_tile(2)],
        label="Showing 1 to 2 of 9 Jobs",
        script=_script(_ENDPOINT, 9),
        next_link="/go/Global-Opportunities/8821501/?startrow=2",
    )
    result = asyncio.run(simulate_html(_crawler(), first, _ICRC))
    assert result["reader"] == "successfactors"
    assert result["pages"] == 1
    assert FIRST_PAGE_ONLY in (result["stop"] or "")
    assert result["count"] == 2 and result["admitted"] == 2


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


def test_a_crawl_of_a_tile_listing_records_the_reader_and_a_complete_listing(monkeypatch):
    html, _record = _verbatim()

    async def fake_fetch_url(_url, **_kwargs):
        return FetchResult(200, {}, html.encode("utf-8"), _ICRC)

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
    run = _Run()
    source = {"id": "src-icrc", "org_name": "ICRC", "careers_url": _ICRC, "source_type": "html"}
    result = asyncio.run(crawler.crawl_source(source, run))
    fields = crawler.extraction_logger.extractions[-1]["extracted_fields"]
    assert result["status"] == "ok"
    assert result["counts"]["found"] == 12
    assert result["message"] == "Found 12 jobs; listing complete: 1 page, expected 12"
    assert (fields["reader"], fields["listing_complete"], fields["listing_expected"]) == (
        "successfactors", True, 12
    )
    assert "strategy" not in fields
    assert len(run.saved[0]) == 12
    assert all(job["admitted"] for job in run.saved[0])
