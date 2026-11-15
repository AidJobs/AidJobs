"""W-35 pull request 3a: admin Simulate extraction through the crawl's HTML readers.

First page only; admission's verdict per row. No network and no database.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from crawler_v2.simple_crawler import SimpleCrawler
from crawler_v2.simulate import FIRST_PAGE_ONLY, simulate_html, summarise_jobs

_BACKEND = Path(__file__).resolve().parents[1]
_GENERAL = _BACKEND / "tests" / "fixtures" / "general_reader"
_SITES = _BACKEND / "tests" / "fixtures" / "unicef_sites"


def _crawler():
    return SimpleCrawler("postgresql://example")


def _load_general(name):
    html = (_GENERAL / f"{name}.html").read_bytes().decode("utf-8")
    record = json.loads((_GENERAL / f"{name}.json").read_text(encoding="utf-8"))
    return html, record


def _sites_excerpt(name):
    return (_SITES / f"{name}.html").read_text(encoding="utf-8")


def test_simulate_html_on_sites_names_the_sites_reader_and_admits_cards():
    html = _sites_excerpt("page1-default")
    # Page has a next link; first-page-only must refuse it and keep page-one cards.
    result = asyncio.run(
        simulate_html(_crawler(), html, "https://jobs.unicef.org/jobs/search")
    )
    assert result["ok"] is True
    assert result["reader"] == "sites-engine"
    assert result["strategy"] is None
    assert result["pages"] == 1
    assert result["complete"] is False
    assert result["stop"] and FIRST_PAGE_ONLY in result["stop"]
    assert result["count"] == 3
    assert result["admitted"] == 3
    assert result["rejected"] == 0
    assert result["rejected_by_reason"] == {}
    assert all(row["verdict"] == "admitted" for row in result["rows"])
    assert result["sample"] == result["rows"][:3]
    assert "apply_url" in result["rows"][0]


def test_simulate_html_does_not_fetch_later_pages(monkeypatch):
    crawler = _crawler()

    async def never(_url):
        raise AssertionError("the crawler's own fetch was used")

    crawler._fetch_listing_page = never
    html = _sites_excerpt("page1-default").replace(
        'class="next next_page disabled page-item"><a href="">',
        'class="next next_page page-item"><a rel="next" href="/jobs/search?page=2">',
        1,
    )
    result = asyncio.run(
        simulate_html(crawler, html, "https://jobs.unicef.org/jobs/search")
    )
    assert result["reader"] == "sites-engine"
    assert result["pages"] == 1
    assert FIRST_PAGE_ONLY in (result["stop"] or "")


@pytest.mark.parametrize("name, reader, strategy", [
    ("icrc-listing", "general", "selector-links"),
    ("oxfam-listing", "general", "selector-divs"),
])
def test_simulate_html_on_general_fixtures_matches_admission(name, reader, strategy):
    html, record = _load_general(name)
    result = asyncio.run(simulate_html(_crawler(), html, record["url"]))
    assert result["reader"] == reader
    assert result["strategy"] == strategy
    assert result["count"] == len(record["jobs"])
    assert result["admitted"] == 0
    assert result["rejected"] == result["count"]
    # Thin vacancy rows need their job page; other listing junk keeps its own reason.
    assert result["rejected_by_reason"].get("needs_job_page", 0) >= 1
    assert "needs_job_page" in {row["verdict"] for row in result["rows"]}
    assert all(row["verdict"] != "admitted" for row in result["rows"])


def test_summarise_jobs_maps_thin_and_junk():
    jobs = [
        {
            "title": "A",
            "apply_url": "https://careers.example.org/job/1",
            "location_raw": "Kenya",
            "deadline": "2026-12-01",
            "employment_type": "Fixed",
            "record_class": "reader_card",
        },
        {
            "title": "Thin",
            "apply_url": "https://careers.example.org/job/596923/thin-officer",
        },
        {
            "title": "Junk",
            "apply_url": "https://careers.example.org/about",
        },
    ]
    result = summarise_jobs(jobs, "html", reader="general")
    assert result["reader"] == "general"
    assert result["admitted"] == 1
    assert result["rows"][0]["verdict"] == "admitted"
    assert result["rows"][1]["verdict"] == "needs_job_page"
    assert result["rows"][2]["verdict"] != "admitted"
    assert result["rejected_by_reason"]["needs_job_page"] >= 1
