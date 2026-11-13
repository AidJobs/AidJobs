"""The readers of an HTML listing, in the order they are tried (ledger W-35).

Each is chosen by what the fetched page shows, never by its address: the PageUp career-site
reader, then the "Sites" engine reader, then the general rule-based reader. A reader that fails
or reads no rows passes the page to the next; the general reader's own failure fails the crawl.

The adapters call the crawler's own methods, looked up when they run, so the paging walks stay
where they are (contract §11) and a test that replaces one of those methods still reaches it.
"""
from __future__ import annotations

import contextvars
import logging
from typing import Dict, List, Optional

from contracts.reader import Fetch, ListingResult, Reader, Request, Response

logger = logging.getLogger(__name__)

# The reader and the general reader's strategy for the current crawl, recorded on its extraction
# log. Task-local: one crawler instance serves concurrent crawls.
LISTING_READER: contextvars.ContextVar = contextvars.ContextVar("listing_reader", default="unknown")
LISTING_STRATEGY: contextvars.ContextVar = contextvars.ContextVar("listing_strategy", default=None)


def _page_fetch(fetch: Fetch):
    """A reader's fetch in the shape the paging walks call: url -> (status, html, stop)."""

    async def page(url: str):
        answer = await fetch(Request(url))
        return answer.status, answer.body, answer.stop

    return page


class _WalkReader(Reader):
    """A reader whose paging walk is a crawler method returning (jobs, report)."""

    walk = ""
    label = ""

    def __init__(self, crawler):
        self._crawler = crawler

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        walk = getattr(self._crawler, self.walk)
        careers_url = source["careers_url"]
        if fetch is None:
            jobs, report = await walk(first.body, careers_url)
        else:
            jobs, report = await walk(first.body, careers_url, fetch=_page_fetch(fetch))
        if not jobs and report is None:
            return None  # not this reader's page
        return ListingResult.from_report(self.name, jobs, report)


class PageUpReader(_WalkReader):
    name = "pageup"
    walk = "_pageup_listing_jobs"
    label = "PageUp career-site reader"


class SitesReader(_WalkReader):
    name = "sites-engine"
    walk = "_sites_listing_jobs"
    label = "Sites career-site reader"


class GeneralReader(Reader):
    """The rule-based reader: structured data, then the strategy selector's choice. It reports
    no completeness (W-39)."""

    name = "general"

    def __init__(self, crawler):
        self._crawler = crawler

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        del fetch
        LISTING_STRATEGY.set(None)
        jobs = self._crawler.extract_jobs_from_html(first.body, source["careers_url"])
        return ListingResult(self.name, jobs, strategy=LISTING_STRATEGY.get())


def html_readers(crawler) -> List[Reader]:
    return [PageUpReader(crawler), SitesReader(crawler), GeneralReader(crawler)]


async def read_listing(
    readers: List[Reader], first: Response, source: Dict, fetch: Optional[Fetch] = None
) -> ListingResult:
    """The first reader's result with rows; the last reader's whatever it reads."""
    *tried, last = readers
    for reader in tried:
        label = getattr(reader, "label", reader.name)
        try:
            result = await reader.read(first, source, fetch)
        except Exception as e:
            logger.warning(f"{label} failed: {e}, falling back to rule-based")
            continue
        if result is not None and result.jobs:
            logger.info(f"{label} found {len(result.jobs)} jobs")
            return result
    result = await last.read(first, source, fetch)
    return result if result is not None else ListingResult(last.name)
