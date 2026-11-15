"""The readers of a listing, in the order they are tried (ledger W-35).

HTML: chosen by what the fetched page shows, never by its address: the PageUp career-site
reader, then the "Sites" engine reader, then the general rule-based reader. A reader that fails
or reads no rows passes the page to the next; the general reader's own failure fails the crawl.

RSS and API (pull request 3b): one feed reader and one generic JSON reader. Each turns the first
response into field-contract candidates; completeness only when the listing states a total.

The HTML adapters call the crawler's own methods, looked up when they run, so the paging walks
stay where they are (contract §11) and a test that replaces one of those methods still reaches it.
"""
from __future__ import annotations

import contextvars
import json
import logging
from typing import Dict, List, Optional

import feedparser

from contracts.reader import Fetch, ListingResult, Reader, Request, Response
from crawler_v2.feed_fields import (
    job_from_json_item,
    job_from_rss_entry,
    jobs_array,
    json_listing_report,
)

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

    def marks(self, page: str) -> bool:
        # Weaker than reading cards with exactly one a.job-link: any list-view card, or
        # PageUp's career-site files / "Powered by PageUp" (canary, W-35).
        if not page:
            return False
        lower = page.lower()
        return (
            "list-view--item" in lower
            or "careers-static.pageuppeople.com" in lower
            or "powered by pageup" in lower
        )


class SitesReader(_WalkReader):
    name = "sites-engine"
    walk = "_sites_listing_jobs"
    label = "Sites career-site reader"

    def marks(self, page: str) -> bool:
        # Weaker than acceptance (pager + cards): the Sites pager attribute alone.
        if not page:
            return False
        return (
            'engine="Sites::Engine"' in page
            or "engine='Sites::Engine'" in page
        )


class GeneralReader(Reader):
    """The rule-based reader: structured data, then the strategy selector's choice. It reports
    no completeness (W-39)."""

    name = "general"

    def __init__(self, crawler):
        self._crawler = crawler

    def marks(self, page: str) -> bool:
        # No weaker system mark: the general reader is the fall-through, not a recruitment
        # system. Its "none admitted" and half-drop checks still run (canary, W-35).
        del page
        return False

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        del fetch
        LISTING_STRATEGY.set(None)
        jobs = self._crawler.extract_jobs_from_html(first.body, source["careers_url"])
        return ListingResult(self.name, jobs, strategy=LISTING_STRATEGY.get())


def html_readers(crawler) -> List[Reader]:
    return [PageUpReader(crawler), SitesReader(crawler), GeneralReader(crawler)]


class RssFeedReader(Reader):
    """One RSS or Atom feed body as a listing. Reports no completeness: a truncated feed looks
    the same as a full one (growth plan, section 4.1; W-39 for stronger rules)."""

    name = "rss-feed"
    source_types = frozenset({"rss"})
    record_class = "rss"
    label = "RSS feed reader"

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        del fetch
        if first.stop or first.status != 200 or not (first.body or "").strip():
            return ListingResult(self.name)
        feed = feedparser.parse(first.body)
        base = source.get("careers_url") or ""
        jobs = []
        for entry in getattr(feed, "entries", None) or []:
            job = job_from_rss_entry(entry, base)
            if job:
                jobs.append(job)
        logger.info("RSS feed reader found %s jobs", len(jobs))
        return ListingResult(self.name, jobs)


class JsonApiReader(Reader):
    """A generic JSON listing. Reports completeness only when the body states a total."""

    name = "json-api"
    source_types = frozenset({"api", "json"})
    record_class = "api"
    label = "JSON API reader"

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        del fetch
        if first.stop or first.status != 200 or not (first.body or "").strip():
            return ListingResult(self.name)
        try:
            data = json.loads(first.body)
        except (TypeError, ValueError) as exc:
            logger.warning("JSON API reader: body is not JSON: %s", exc)
            return ListingResult(self.name)
        base = source.get("careers_url") or ""
        jobs = []
        for item in jobs_array(data):
            job = job_from_json_item(item, base)
            if job:
                jobs.append(job)
        logger.info("JSON API reader found %s jobs", len(jobs))
        return ListingResult.from_report(self.name, jobs, json_listing_report(jobs, data))


def rss_readers(_crawler=None) -> List[Reader]:
    return [RssFeedReader()]


def api_readers(_crawler=None) -> List[Reader]:
    return [JsonApiReader()]


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
