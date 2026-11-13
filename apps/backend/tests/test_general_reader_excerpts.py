"""The general reader on excerpts of ICRC's and Oxfam GB's saved listings (ledger W-35).

Each excerpt is the saved page with scripts, styles, images, form controls, comments, unused
attributes and colour classes removed, and, for Oxfam GB, every block whose removal left the rows
unchanged. The expected rows were recorded once from `main` (2a125b0, whose crawler code
`d62f97e` keeps) on these excerpts, before the reader interface (W-35). ICRC's
page keeps all twelve job tiles with their desktop, tablet and phone copies: with fewer tiles, or
without the copies, the strategy selector scores "divs" above "links" and reads other rows.
"""
import asyncio
import json
from collections import Counter
from pathlib import Path

import pytest

from contracts.admission import admit_batch
from core.strategy_selector import StrategySelector
from crawler_v2.simple_crawler import SimpleCrawler

_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "general_reader"
_PAGES = ["icrc-listing", "oxfam-listing"]


def _load(name):
    html = (_FIXTURES / f"{name}.html").read_bytes().decode("utf-8")
    record = json.loads((_FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return html, record


def _listing(html, url):
    return asyncio.run(SimpleCrawler("postgresql://example")._listing_jobs(html, url))


@pytest.mark.parametrize("name", _PAGES)
def test_the_listing_step_reads_exactly_the_recorded_rows(name):
    html, record = _load(name)
    jobs, report = _listing(html, record["url"])
    assert jobs == record["jobs"]
    assert report is None and record["report"] is None


@pytest.mark.parametrize("name", _PAGES)
def test_admission_gives_the_recorded_verdicts(name):
    html, record = _load(name)
    jobs, _report = _listing(html, record["url"])
    admitted, rejected = admit_batch([dict(job) for job in jobs], "html")
    assert admitted == []
    assert dict(Counter(reason for _job, reason in rejected)) == record["rejections"]


def test_icrc_is_read_by_the_links_strategy_by_a_narrow_margin():
    html, record = _load("icrc-listing")
    scores = StrategySelector().analyze_html_structure(html, record["url"])["scores"]
    assert scores["links"] == 21.5 and scores["divs"] == 20
    assert len(record["jobs"]) == 32


def test_oxfam_is_read_by_the_divs_strategy():
    html, record = _load("oxfam-listing")
    analysis = StrategySelector().analyze_html_structure(html, record["url"])
    assert analysis["recommended_strategy"] == "divs"
    assert len(record["jobs"]) == 6
