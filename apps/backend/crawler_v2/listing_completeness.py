"""Listing completeness reports for every reader (W-39 / growth plan step 4.10).

Only `listing_complete is True` can make a crawl count as absence evidence (contract §6).
A finished read always reports true or false for the readers that use these helpers; a refused
or unparsed first response still leaves the report unset (null on the crawl run).

General HTML is complete only on positive full-catalogue evidence (a stated total that matches
the on-page results, or an exhausted pager with the same bar as Sites/PageUp). A teaser with
no total stays incomplete. Named unpaginated ATS catalogues may be complete without a vendor
total; generic RSS and JSON without a total stay incomplete.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional, Sequence

from bs4 import BeautifulSoup

_SHOWING = re.compile(
    r"Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)\s+Jobs?\b",
    re.IGNORECASE,
)
# Load-more / infinite-scroll / next controls that the general reader does not follow.
_LOAD_MORE_TEXT = re.compile(
    r"loading\s+more\s+jobs|load\s+more\s+jobs|show\s+more\s+jobs|more\s+jobs",
    re.IGNORECASE,
)
_PAGER_HREF = re.compile(
    r"(?:[?&](?:page|p|start|offset)=|/page/\d+|pagination|next)",
    re.IGNORECASE,
)
_JSON_NEXT_KEYS = frozenset({
    "hasMore",
    "has_more",
    "next",
    "nextPage",
    "next_page",
    "nextUrl",
    "next_url",
    "cursor",
    "next_cursor",
    "pageToken",
    "page_token",
})


def _report(
    *,
    complete: bool,
    expected: Optional[int],
    stop: Optional[str],
    pages: int = 1,
) -> Dict[str, Any]:
    return {
        "pages": pages,
        "expected": expected,
        "complete": complete,
        "stop": stop,
    }


def incomplete(stop: str, expected: Optional[int] = None, pages: int = 1) -> Dict[str, Any]:
    """A finished read that must not count as absence evidence."""
    return _report(complete=False, expected=expected, stop=stop, pages=pages)


def complete_catalogue(expected: int, pages: int = 1, stop: Optional[str] = None) -> Dict[str, Any]:
    """A finished read of a full catalogue."""
    return _report(complete=True, expected=expected, stop=stop, pages=pages)


def showing_range(html: str) -> Optional[tuple]:
    """(start, end, total) from 'Showing 1 to 12 of 12 Jobs', or None."""
    if not html:
        return None
    match = _SHOWING.search(html)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def result_row_count(html: str) -> Optional[int]:
    """On-page result rows in a labeled job list, when the page has one."""
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    for selector in ("#job-tile-list > li.job-tile", "ul.job-list > li.job-tile", "li.job-tile"):
        rows = soup.select(selector)
        if rows:
            return len(rows)
    return None


def has_unfollowed_pager(html: str) -> bool:
    """True when the page shows a next/load-more control the general reader did not follow."""
    if not html:
        return False
    if _LOAD_MORE_TEXT.search(html):
        return True
    soup = BeautifulSoup(html, "html.parser")
    for link in soup.find_all("a", href=True):
        href = str(link.get("href") or "")
        text = link.get_text(" ", strip=True).lower()
        rel = " ".join(link.get("rel") or []).lower()
        if rel == "next" or text in {"next", "next page", "›", "»"}:
            return True
        if _PAGER_HREF.search(href) and ("next" in text or "page" in text or "more" in text):
            return True
    return False


def general_html_report(
    html: str,
    jobs: Sequence[Dict],
    *,
    vacancies: int,
    page_cap: int,
) -> Dict[str, Any]:
    """Completeness for the general HTML reader (always a bool report on a finished extract).

    vacancies: the rows admission reads as job links (admitted, or too thin and so opened on
    their job page). Navigation and category links are not vacancies and are not counted, which
    is why `jobs` (every extracted candidate) no longer decides the stated-total comparison
    (ICRC, 28 November 2026). page_cap: the job pages a crawl reads for new rows; a listing with
    more vacancies than that cannot be read in full, so it stays incomplete.
    """
    found = len(jobs)
    stated = showing_range(html)
    rows = result_row_count(html)
    pager = has_unfollowed_pager(html)

    if stated is not None:
        start, end, total = stated
        # Full range on this page: a matching stated total wins over a decorative load-more.
        # Vacancies and on-page rows (when present) must each equal the stated total: a tile
        # count alone must not complete while the reader under- or over-reads (W-39 review).
        if start == 1 and end == total:
            if vacancies > page_cap:
                return incomplete(
                    f"{vacancies} vacancies, more than the {page_cap} job pages read in a crawl",
                    expected=total,
                )
            if vacancies == total and (rows is None or rows == total):
                return complete_catalogue(total, stop="showing range complete")
            return incomplete(
                f"showing {start} to {end} of {total}, read {vacancies} vacancies"
                + (f", {rows} on-page" if rows is not None else ""),
                expected=total,
            )
        # More results claimed than this page shows — general reader does not page.
        return incomplete(
            f"showing {start} to {end} of {total}, pager not followed",
            expected=total,
        )

    if pager:
        return incomplete("pager not followed", expected=found if found else None)

    # Teaser / single page with no total: never invent complete (Oxfam home cards).
    return incomplete("no stated total", expected=found if found else None)


def json_has_paging(data: Any) -> bool:
    """True when the JSON body signals another page or cursor the reader did not follow."""
    if not isinstance(data, dict):
        return False
    for key in _JSON_NEXT_KEYS:
        value = data.get(key)
        if value in (None, "", False, 0):
            continue
        if value is True:
            return True
        if isinstance(value, (str, dict, list)) and value:
            return True
    for nest_key in ("meta", "pagination", "paging", "links"):
        nested = data.get(nest_key)
        if not isinstance(nested, dict):
            continue
        for key in _JSON_NEXT_KEYS | {"next"}:
            value = nested.get(key)
            if value in (None, "", False, 0):
                continue
            if value is True or (isinstance(value, (str, dict, list)) and value):
                return True
    return False


def closed_catalogue_report(
    jobs: Sequence[Dict],
    *,
    data: Any = None,
    raw_item_count: Optional[int] = None,
    truncated: bool = False,
    allow_dedupe: bool = False,
) -> Dict[str, Any]:
    """Completeness for a named unpaginated ATS catalogue (Workable, Lever, Personio, Greenhouse).

    Complete when the body looks like the full board in one response: no paging signal, not cut
    by a size cap, and every raw item kept (or merged by a documented dedupe when allow_dedupe).
    """
    found = len(jobs)
    if truncated:
        return incomplete("response truncated", expected=found if found else None)
    if data is not None and json_has_paging(data):
        return incomplete("paging not followed", expected=found if found else None)
    if raw_item_count is not None and raw_item_count < 0:
        return incomplete("unparsed items", expected=found if found else None)
    if raw_item_count is not None and found > raw_item_count:
        # Dedupe must not invent rows; more candidates than raw items is a parse bug.
        return incomplete("more candidates than raw items", expected=raw_item_count)
    if raw_item_count is not None and found < raw_item_count and not allow_dedupe:
        # Dropped rows (missing URL/title) mean the board was not fully retained.
        return incomplete(
            f"kept {found} of {raw_item_count} raw items",
            expected=raw_item_count,
        )
    # Workable groups locations: found < raw_item_count with allow_dedupe.
    return complete_catalogue(found)


def rss_incomplete_report(jobs: Sequence[Dict]) -> Dict[str, Any]:
    """Generic RSS / Teamtailor RSS: truncation is invisible, so never complete."""
    found = len(jobs)
    return incomplete("rss has no catalogue total", expected=found if found else None)
