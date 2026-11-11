"""Career-site listing reader for the "Sites" engine (ledger W-55).

Chosen by what the listing page shows, never by its address: job cards
(`article.job-search-results-card-col`), each with one title link in
`.job-search-results-card-title`, on a page whose pager is marked `engine="Sites::Engine"`.
UNICEF's careers site moved to it on 11 November 2026. The crawler pages through the listing
(`crawler_v2/simple_crawler.py`).

Each card gives the title, the apply link, the location, the contract type and the closing date.
Rows are marked `record_class = "reader_card"`: admission takes a platform reader's card with one
of those fields as evidence, as it takes a structured posting (crawler plan, C3, amendment of
11 November 2026). A card whose link leaves the listing's own site is skipped.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

# The site honours per_page up to 50 (probe of 11 November 2026); asking 100 takes its most.
PAGE_SIZE = 100

_TOTAL = re.compile(r"of\s+([\d,]+)\s+in\s+total", re.I)
_DATE = re.compile(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b")
_MONTHS = {
    name: number
    for number, names in enumerate(
        (
            ("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"),
            ("may",), ("jun", "june"), ("jul", "july"), ("aug", "august"),
            ("sep", "sept", "september"), ("oct", "october"), ("nov", "november"),
            ("dec", "december"),
        ),
        start=1,
    )
    for name in names
}


@dataclass
class SitesPage:
    """One listing page as the reader sees it."""

    jobs: List[Dict] = field(default_factory=list)
    total: Optional[int] = None
    next_url: Optional[str] = None
    # A next-page link that leaves the site or the listing: found, but not to be followed.
    next_refused: bool = False
    is_sites: bool = False


def _text(node) -> str:
    return " ".join(node.get_text(" ").split()) if node is not None else ""


def closing_day(text: str) -> Optional[str]:
    """'Closing at: 20 Nov 2026 - 23:55 EAT' -> '2026-11-20': the day as the site writes it."""
    match = _DATE.search(text or "")
    if not match:
        return None
    day, month, year = match.groups()
    number = _MONTHS.get(month.lower())
    if not number:
        return None
    try:
        return datetime(int(year), number, int(day)).strftime("%Y-%m-%d")
    except ValueError:
        return None


def _same_site(url: str, base_url: str) -> bool:
    one, other = urlparse(url), urlparse(base_url)
    return one.scheme in ("http", "https") and one.netloc.lower() == other.netloc.lower()


def resized_url(page_url: str) -> Optional[str]:
    """Page one of the same listing at the reader's page size, or None when it already asks."""
    parts = urlparse(page_url)
    pairs = parse_qsl(parts.query, keep_blank_values=True)
    if any(name == "per_page" for name, _value in pairs):
        return None
    pairs = [(name, value) for name, value in pairs if name != "page"]
    pairs.append(("per_page", str(PAGE_SIZE)))
    return urlunparse(parts._replace(query=urlencode(pairs)))


class SitesListingReader:
    """Reads the job cards, the stated total and the next-page link of one listing page."""

    name = "sites-engine"

    def get_soup(self, html: str) -> BeautifulSoup:
        return BeautifulSoup(html, "lxml")

    def read_page(self, html: str, page_url: str) -> SitesPage:
        soup = self.get_soup(html)
        pager = soup.select_one('nav.pagination[engine="Sites::Engine"]')
        cards = soup.select("article.job-search-results-card-col")
        page = SitesPage(is_sites=bool(cards) and pager is not None)
        if not page.is_sites:
            return page
        seen = set()
        for card in cards:
            links = card.select(".job-search-results-card-title a[href]")
            if len(links) != 1:
                continue
            href = links[0].get("href", "")
            apply_url = urljoin(page_url, href)
            if apply_url in seen or not _same_site(apply_url, page_url):
                continue
            if urlparse(apply_url).path.rstrip("/") == urlparse(page_url).path.rstrip("/"):
                continue  # the listing itself, not a job

            title = _text(links[0])
            if not title:
                continue
            seen.add(apply_url)
            job = {"title": title, "apply_url": apply_url, "record_class": "reader_card"}
            location = _text(card.select_one(".job-component-location span"))
            if location:
                job["location_raw"] = location
            kind = _text(card.select_one(".job-component-employment-type span"))
            if kind:
                job["employment_type"] = kind
            deadline = closing_day(_text(card.select_one(".job-component-closing-at span")))
            if deadline:
                job["deadline"] = deadline
            page.jobs.append(job)
        counts = _text(soup.select_one(".table-counts"))
        found = _TOTAL.search(counts)
        if found:
            page.total = int(found.group(1).replace(",", ""))
        following = pager.select_one("li.next:not(.disabled) a[rel=next][href]")
        if following is not None:
            next_url = urljoin(page_url, following.get("href", ""))
            same_listing = urlparse(next_url).path == urlparse(page_url).path
            if _same_site(next_url, page_url) and same_listing:
                page.next_url = next_url
            else:
                page.next_refused = True
        return page
