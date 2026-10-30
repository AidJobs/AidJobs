"""The UNICEF reader on verbatim card excerpts from saved listing pages (18 and 19 October 2026).

The reader parses with lxml. The expected rows were recorded once from these excerpts, so a
change of lxml or of the libxml2 it bundles must leave every row identical.
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
