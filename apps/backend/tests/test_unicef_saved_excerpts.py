"""The UNICEF reader on job cards from saved listing pages, verbatim with line endings normalised.

The reader parses with lxml. The expected rows were recorded once from these excerpts, so a
change of lxml or of the libxml2 it bundles must leave every row identical. Titles with a raw
or escaped ampersand get their own excerpt, because character references are where HTML
tokenizers differ.
"""
import json
from pathlib import Path

import pytest

from contracts.admission import admit_batch
from crawler.plugins.unicef import UNICEFPlugin

_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "unicef_listing"
_PAGES = ["page1-items50", "page2", "page7"]


def _load(name):
    html = (_FIXTURES / f"{name}.html").read_bytes().decode("utf-8")
    record = json.loads((_FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return html, record["url"], record["jobs"]


def test_the_reader_parses_with_lxml():
    assert UNICEFPlugin().get_soup("<p>x</p>").builder.NAME == "lxml"


@pytest.mark.parametrize("name", _PAGES)
def test_cards_read_exactly_the_recorded_rows(name):
    html, url, expected = _load(name)
    assert UNICEFPlugin().read_job_cards(html, url) == expected


@pytest.mark.parametrize("name", _PAGES)
def test_extract_returns_the_same_rows(name):
    html, url, expected = _load(name)
    assert UNICEFPlugin().extract(html, url).jobs == expected


@pytest.mark.parametrize("name", _PAGES)
def test_the_repeated_card_is_read_once(name):
    html, url, expected = _load(name)
    jobs = UNICEFPlugin().read_job_cards(html, url)
    assert html.count('class="list-view--item') == len(expected) + 1
    assert len({job["apply_url"] for job in jobs}) == len(jobs) == len(expected)


@pytest.mark.parametrize("name", _PAGES)
def test_every_recorded_row_is_admitted(name):
    html, url, expected = _load(name)
    jobs = UNICEFPlugin().read_job_cards(html, url)
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert rejected == []
    assert len(admitted) == len(expected) == 6
    assert all(job.get("location_raw") and job.get("deadline") for job in jobs)


def test_titles_with_ampersands_read_exactly_the_recorded_rows():
    html, url, expected = _load("ampersands")
    jobs = UNICEFPlugin().read_job_cards(html, url)
    assert jobs == expected
    assert UNICEFPlugin().extract(html, url).jobs == expected
    assert len(jobs) == 10
    assert all("&" in job["title"] for job in jobs)
    assert "&amp;" in html and "Gender& Education" in html
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert rejected == []
    assert len(admitted) == 10
