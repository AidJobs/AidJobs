"""The readers of a listing, in the order they are tried (ledger W-35, W-38).

HTML: chosen by what the fetched page shows, never by its address: the PageUp career-site
reader, then the "Sites" engine reader, then the general rule-based reader. A reader that fails
or reads no rows passes the page to the next; the general reader's own failure fails the crawl.

RSS and API (pull request 3b): one feed reader and one generic JSON reader. Each turns the first
response into field-contract candidates; completeness only when the listing states a total.

Public ATS feeds (W-38): Workable, Greenhouse, Teamtailor, Lever and Personio, recognised from
the source's board address via `first_request` (contract §10 amendment), before the generic JSON
reader. Teamtailor RSS and Personio XML are parsed here on the API path so board→feed rewrite
works (the RSS crawler does not call `resolve_feed_request`).

The HTML adapters call the crawler's own methods, looked up when they run, so the paging walks
stay where they are (contract §11) and a test that replaces one of those methods still reaches it.
"""
from __future__ import annotations

import asyncio
import contextvars
import json
import logging
from typing import Dict, List, Optional, Tuple

import feedparser

from contracts.reader import Fetch, ListingResult, Reader, Request, Response
from crawler_v2.ats_feeds import (
    greenhouse_job_url,
    greenhouse_list_url,
    greenhouse_token,
    jobs_from_greenhouse,
    jobs_from_lever,
    jobs_from_personio,
    jobs_from_teamtailor,
    jobs_from_workable,
    lever_feed_url,
    lever_site,
    looks_like_greenhouse,
    looks_like_lever,
    looks_like_personio,
    looks_like_teamtailor,
    looks_like_workable,
    merge_greenhouse_detail,
    personio_account,
    personio_feed_url,
    teamtailor_request_url,
    workable_account,
    workable_feed_url,
)
from crawler_v2.feed_fields import (
    job_from_json_item,
    job_from_rss_entry,
    jobs_array,
    json_listing_report,
)

logger = logging.getLogger(__name__)

# Cap on Greenhouse single-job GETs for first_published when the list omits it (W-38 plan).
GREENHOUSE_DETAIL_CAP = 10


def _rss_feed_jobs(body: str, careers_url: str) -> List[Dict]:
    feed = feedparser.parse(body)
    base = careers_url or ""
    jobs = []
    for entry in getattr(feed, "entries", None) or []:
        job = job_from_rss_entry(entry, base)
        if job:
            jobs.append(job)
    return jobs


def _json_api_jobs(body: str, careers_url: str):
    data = json.loads(body)
    base = careers_url or ""
    jobs = []
    for item in jobs_array(data):
        job = job_from_json_item(item, base)
        if job:
            jobs.append(job)
    return jobs, json_listing_report(jobs, data)


def _workable_feed_jobs(body: str, careers_url: str) -> Optional[List[Dict]]:
    data = json.loads(body)
    if not looks_like_workable(data):
        return None
    account = workable_account(careers_url) or "unknown"
    return jobs_from_workable(data, account)


def _greenhouse_list_jobs(body: str, token: str):
    data = json.loads(body)
    if not looks_like_greenhouse(data):
        return None, None
    return jobs_from_greenhouse(data, token)


def _greenhouse_merge_detail(job: Dict, body: str) -> None:
    try:
        detail = json.loads(body)
    except (TypeError, ValueError):
        return
    if not isinstance(detail, dict):
        return
    merge_greenhouse_detail(job, detail)


def _teamtailor_feed_jobs(body: str) -> List[Dict]:
    return jobs_from_teamtailor(body)


def _lever_feed_jobs(body: str) -> List[Dict]:
    data = json.loads(body)
    if not isinstance(data, list):
        return []
    if data and not looks_like_lever(data):
        return []
    return jobs_from_lever(data)


def _personio_feed_jobs(body: str, account: str, tld: str) -> List[Dict]:
    return jobs_from_personio(body, account, tld)


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
        # Clear before the worker runs so a second listing in the same task does not
        # keep the previous strategy if extract leaves it unset.
        LISTING_STRATEGY.set(None)
        jobs, strategy = await asyncio.to_thread(
            self._crawler._extract_jobs_sync, first.body, source["careers_url"]
        )
        LISTING_STRATEGY.set(strategy)
        return ListingResult(self.name, jobs, strategy=strategy)


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
        base = source.get("careers_url") or ""
        jobs = await asyncio.to_thread(_rss_feed_jobs, first.body, base)
        logger.info("RSS feed reader found %s jobs", len(jobs))
        return ListingResult(self.name, jobs)


class JsonApiReader(Reader):
    """A generic JSON listing. Reports completeness only when the body states a total.

    Raises ValueError when the body is not JSON, so the crawl fails instead of treating
    HTML or plain text as an empty listing.
    """

    name = "json-api"
    source_types = frozenset({"api", "json"})
    record_class = "api"
    label = "JSON API reader"

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        del fetch
        if first.stop or first.status != 200 or not (first.body or "").strip():
            return ListingResult(self.name)
        try:
            jobs, report = await asyncio.to_thread(
                _json_api_jobs, first.body, source.get("careers_url") or ""
            )
        except (TypeError, ValueError) as exc:
            raise ValueError("API body is not JSON") from exc
        logger.info("JSON API reader found %s jobs", len(jobs))
        return ListingResult.from_report(self.name, jobs, report)


class WorkableFeedReader(Reader):
    """Workable public widget feed (GET, no key). Recognised from apply.workable.com/{account}."""

    name = "workable-feed"
    source_types = frozenset({"api", "json"})
    record_class = "api"
    budget_group = "workable"
    label = "Workable feed reader"

    def first_request(self, source: Dict) -> Optional[Request]:
        account = workable_account(source.get("careers_url") or "")
        if not account:
            return None
        return Request(workable_feed_url(account), accept="application/json")

    def marks(self, page: str) -> bool:
        # Weaker than acceptance: widget-shaped JSON or a Workable board host in the body.
        if not page:
            return False
        lower = page.lower()
        return (
            '"shortcode"' in lower
            or "apply.workable.com" in lower
            or ("\"jobs\"" in lower and "\"name\"" in lower and "workable" in lower)
        )

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        del fetch
        if first.stop or first.status != 200 or not (first.body or "").strip():
            return ListingResult(self.name)
        try:
            jobs = await asyncio.to_thread(
                _workable_feed_jobs, first.body, source.get("careers_url") or ""
            )
        except (TypeError, ValueError):
            return None
        if jobs is None:
            return None
        logger.info("Workable feed reader found %s jobs", len(jobs))
        # Widget has no catalogue total; multi-location rows inflate raw counts.
        return ListingResult(self.name, jobs)


class GreenhouseFeedReader(Reader):
    """Greenhouse Job Board API (GET, no key). Recognised from job-boards.greenhouse.io/{token}."""

    name = "greenhouse-feed"
    source_types = frozenset({"api", "json"})
    record_class = "api"
    budget_group = "greenhouse"
    label = "Greenhouse feed reader"

    def first_request(self, source: Dict) -> Optional[Request]:
        token = greenhouse_token(source.get("careers_url") or "")
        if not token:
            return None
        return Request(greenhouse_list_url(token), accept="application/json")

    def marks(self, page: str) -> bool:
        if not page:
            return False
        lower = page.lower()
        return (
            '"absolute_url"' in lower
            or "boards-api.greenhouse.io" in lower
            or "job-boards.greenhouse.io" in lower
            or ('"meta"' in lower and '"total"' in lower and '"jobs"' in lower)
        )

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        if first.stop or first.status != 200 or not (first.body or "").strip():
            return ListingResult(self.name)
        token = greenhouse_token(source.get("careers_url") or "") or "unknown"
        try:
            jobs, report = await asyncio.to_thread(_greenhouse_list_jobs, first.body, token)
        except (TypeError, ValueError):
            return None
        if jobs is None:
            return None
        if fetch is not None and token != "unknown":
            await _fill_greenhouse_posted_on(jobs, token, fetch)
        logger.info("Greenhouse feed reader found %s jobs", len(jobs))
        return ListingResult.from_report(self.name, jobs, report)


def _detail_refusal(answer: Response) -> bool:
    """True when further Greenhouse detail GETs must stop (refusals / challenges / budgets).

    A successful empty stop at HTTP 200 is not a refusal. Any other 2xx with a stop (including
    challenge pages named without the word "challenge", e.g. Akamai), and 401/403/429, stop the
    remainder of the detail cap.
    """
    if answer.status in (401, 403, 429):
        return True
    # Non-200 2xx answers are refusals under the fetch policy (e.g. HTTP 202).
    if 200 < answer.status < 300:
        return True
    stop = (answer.stop or "").strip()
    if answer.status == 200 and stop:
        return True
    if not stop:
        return False
    lower = stop.lower()
    return any(
        marker in lower
        for marker in (
            "challenge",
            "refused",
            "akamai",
            "shared host budget",
            "request budget",
            "time budget",
            "stopped after a refusal",
            "robots.txt",
            "host busy",
        )
    )


async def _fill_greenhouse_posted_on(
    jobs: List[Dict], token: str, fetch: Fetch
) -> None:
    """Fetch single-job bodies for first_published, capped; stop further fetches on refusal.

    A 404 or malformed body skips that job only; a refusal stops the remainder of the cap.
    """
    missing = [job for job in jobs if not job.get("posted_on") and job.get("reference")]
    for job in missing[:GREENHOUSE_DETAIL_CAP]:
        answer = await fetch(Request(greenhouse_job_url(token, job["reference"])))
        if _detail_refusal(answer):
            logger.info(
                "Greenhouse single-job fetch refused (%s); no further detail requests",
                answer.stop or answer.status,
            )
            return
        if answer.stop or answer.status != 200 or not (answer.body or "").strip():
            # Missing job or empty answer: skip this id, keep trying within the cap.
            continue
        await asyncio.to_thread(_greenhouse_merge_detail, job, answer.body)


class TeamtailorFeedReader(Reader):
    """Teamtailor public jobs.rss (GET, no key). Recognised from *.teamtailor.com boards."""

    name = "teamtailor-feed"
    source_types = frozenset({"api", "json"})
    record_class = "api"
    budget_group = "teamtailor"
    label = "Teamtailor feed reader"

    def first_request(self, source: Dict) -> Optional[Request]:
        feed = teamtailor_request_url(source.get("careers_url") or "")
        if not feed:
            return None
        return Request(feed, accept="application/rss+xml")

    def marks(self, page: str) -> bool:
        if not page:
            return False
        lower = page.lower()
        return (
            "teamtailor.com" in lower
            or "<rss" in lower and "jobs.rss" in lower
            or "remotestatus" in lower
        )

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        del fetch
        recognised = self.first_request(source) is not None
        if not recognised:
            return None
        if first.stop or first.status != 200 or not (first.body or "").strip():
            return ListingResult(self.name)
        if not looks_like_teamtailor(first.body):
            return ListingResult(self.name)
        jobs = await asyncio.to_thread(_teamtailor_feed_jobs, first.body)
        logger.info("Teamtailor feed reader found %s jobs", len(jobs))
        return ListingResult(self.name, jobs)


class LeverFeedReader(Reader):
    """Lever public Postings API (GET, no key). Recognised from jobs.lever.co/{site}."""

    name = "lever-feed"
    source_types = frozenset({"api", "json"})
    record_class = "api"
    budget_group = "lever"
    label = "Lever feed reader"

    def first_request(self, source: Dict) -> Optional[Request]:
        parsed = lever_site(source.get("careers_url") or "")
        if not parsed:
            return None
        site, api_host = parsed
        return Request(lever_feed_url(site, api_host), accept="application/json")

    def marks(self, page: str) -> bool:
        if not page:
            return False
        lower = page.lower()
        return (
            "hostedurl" in lower
            or "api.lever.co" in lower
            or "jobs.lever.co" in lower
        )

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        del fetch
        recognised = self.first_request(source) is not None
        if not recognised:
            return None
        if first.stop or first.status != 200 or not (first.body or "").strip():
            return ListingResult(self.name)
        try:
            jobs = await asyncio.to_thread(_lever_feed_jobs, first.body)
        except (TypeError, ValueError):
            return ListingResult(self.name)
        logger.info("Lever feed reader found %s jobs", len(jobs))
        return ListingResult(self.name, jobs)


class PersonioFeedReader(Reader):
    """Personio public XML feed (GET, no key). Recognised from *.jobs.personio.{com|de}."""

    name = "personio-feed"
    source_types = frozenset({"api", "json"})
    record_class = "api"
    budget_group = "personio"
    label = "Personio feed reader"

    def first_request(self, source: Dict) -> Optional[Request]:
        parsed = personio_account(source.get("careers_url") or "")
        if not parsed:
            return None
        account, tld = parsed
        return Request(personio_feed_url(account, tld), accept="application/xml")

    def marks(self, page: str) -> bool:
        if not page:
            return False
        lower = page.lower()
        return "workzag-jobs" in lower or "jobs.personio." in lower

    async def read(self, first: Response, source: Dict, fetch: Optional[Fetch] = None):
        del fetch
        recognised = self.first_request(source) is not None
        if not recognised:
            return None
        if first.stop or first.status != 200 or not (first.body or "").strip():
            return ListingResult(self.name)
        if not looks_like_personio(first.body):
            return ListingResult(self.name)
        parsed = personio_account(source.get("careers_url") or "")
        if not parsed:
            return ListingResult(self.name)
        account, tld = parsed
        jobs = await asyncio.to_thread(_personio_feed_jobs, first.body, account, tld)
        logger.info("Personio feed reader found %s jobs", len(jobs))
        return ListingResult(self.name, jobs)


def rss_readers(_crawler=None) -> List[Reader]:
    return [RssFeedReader()]


def api_readers(_crawler=None) -> List[Reader]:
    return [
        WorkableFeedReader(),
        GreenhouseFeedReader(),
        TeamtailorFeedReader(),
        LeverFeedReader(),
        PersonioFeedReader(),
        JsonApiReader(),
    ]


def resolve_feed_request(
    readers: List[Reader], source: Dict
) -> Tuple[Optional[Reader], Optional[Request]]:
    """The first reader that recognises this source's address, and its first request."""
    for reader in readers:
        request = reader.first_request(source)
        if request is not None:
            return reader, request
    return None, None


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
        if result is not None and result.jobs == [] and reader.first_request(source) is not None:
            # Recognised feed that listed zero jobs — do not fall through.
            return result
    result = await last.read(first, source, fetch)
    return result if result is not None else ListingResult(last.name)
