"""
Simple, focused crawler system - rebuilt from scratch.

Design principles:
1. Simple and clear - easy to understand and debug
2. Works first, optimize later
3. Minimal dependencies - just what we need
4. Direct database operations - no complex abstractions
"""

import asyncio
import contextvars
import logging
import re
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx
import psycopg2
from bs4 import BeautifulSoup

from app.log_safety import redact_exception, stored_text
from app.search_projection import commit_and_schedule
from contracts.admission import admit_batch, log_admission_rejections, page_verdicts, too_thin
from contracts.canary import (
    append_message as canary_append_message,
)
from contracts.canary import (
    evaluate as canary_evaluate,
)
from contracts.canary import (
    previous_kept_from_logs,
    previous_reader_from_logs,
)
from contracts.captured import (
    clean_description,
    clean_locations,
    clean_short_text,
    posted_day,
)
from contracts.countries import read_location
from contracts.detail_reader import (
    apply_captured_fields,
    apply_detail_reading,
    posting_locations,
    read_detail_fields,
)
from contracts.outbound import (
    POLITENESS_STOPS,
    current_budget,
    fetch_message,
    fetch_url,
)
from contracts.persist import persist_candidate
from contracts.persist import created_ids, observable_jobs, observe_known
from contracts.reader import Response
from contracts.refusal import refusal
from contracts.run_ownership import OwnershipLost, confirm_running, save_failure_outcome
from crawler_v2.job_pages import SavedJob, choose_pages, link_key, saved_job
from crawler_v2.listing_fingerprint import (
    early_stop_details,
    listing_ids_fingerprint,
    previous_complete_listing_hash,
)
from crawler_v2.parse_lock import DATEPARSER_LOCK
from crawler_v2.readers import (
    LISTING_READER,
    LISTING_STRATEGY,
    general_vacancy_count,
    html_readers,
    read_listing,
)

logger = logging.getLogger(__name__)

# The crawl's source id for log lines. One crawler instance serves concurrent crawls, so this
# is task-local rather than an attribute.
_SOURCE_FOR_LOGS: contextvars.ContextVar = contextvars.ContextVar("crawl_source_id", default=None)
_DATEPARSER_LOCK = DATEPARSER_LOCK


def _first_row_per_link(jobs: List[Dict]) -> List[Dict]:
    """Keep the first row for each apply_url, compared exactly as built."""
    seen = set()
    kept = []
    for job in jobs:
        link = job.get('apply_url')
        if link in seen:
            continue
        seen.add(link)
        kept.append(job)
    return kept


def place_job(job: Dict) -> None:
    """Fill country, code, city and remote from the job's location, offline (no network call).

    A job without a location keeps whatever is stored. A country its reader supplied is kept.
    City is never read from text: it is the employer's published locality, only when the job
    has that one structured place and the place names the job's one country.
    """
    normalized = job.get('location_normalized')
    normalized = normalized if isinstance(normalized, dict) else {}
    raw = job.get('location_raw')
    reading = read_location(raw if isinstance(raw, str) and raw.strip() else normalized.get('label'))
    if reading is None:
        return
    if not (job.get('country') or job.get('country_iso')):
        for name in ('country', 'country_iso', 'city'):
            if not job.get(name):
                job[name] = reading[name]
    place = job.get('published_place')
    if isinstance(place, dict) and not job.get('city') and job.get('country_iso'):
        own = read_location(place.get('location'))
        locality = clean_short_text(place.get('locality'))
        if own is not None and own['country_iso'] == job['country_iso'] and locality:
            job['city'] = locality
    job['is_remote'] = (
        job.get('is_remote') is True or reading['is_remote'] or normalized.get('type') == 'remote'
    )


_ISO_DATE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$')


def _iso_calendar_date(text: str) -> Tuple[bool, Optional[str]]:
    """(True, 'YYYY-MM-DD') for an ISO date or datetime, as written; (True, None) if impossible.

    The calendar date is kept as written; a time or zone after it is ignored, not converted.
    """
    match = _ISO_DATE.match(text)
    if not match:
        return False, None
    try:
        day = datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return True, None
    return True, day.strftime('%Y-%m-%d')


# Without a language list, dateparser tries every locale it knows on every call, on the event
# loop: the first calls in a process took seconds each, later ones tens of milliseconds, and a
# UNDP listing makes about a hundred. The six UN official languages, plus Portuguese, German,
# and Italian; a month name in any other language no longer parses.
DEADLINE_LANGUAGES = ('en', 'fr', 'es', 'ar', 'ru', 'zh', 'pt', 'de', 'it')
_HAS_DIGIT = re.compile(r'\d')
# A time follows a date as "...2026T23:59"; the T in "UTC", "Tue", or "Thu" is not one.
_ISO_TIME = re.compile(r'(?<=\d)T(?=\d)')
_FOUR_DIGITS = re.compile(r'\d{4}')


_PAGEUP_PAGE_CAP = 30
# UNICEF's firewall has challenged the seventh request of every crawl since 19 October 2026, so a
# whole listing must fit in a few requests; its listing answers 100 jobs a page (7 November 2026).
_PAGEUP_PAGE_ITEMS = 100
_PAGEUP_RETRY_DELAY = 30.0
# A refusal or a challenge (202, 429) is never retried; a plain 503 once.
_PAGEUP_RETRY_STATUSES = frozenset({503})
_sleep = asyncio.sleep

# Only these response headers are logged. Cookies and authorization never are.
_LOGGED_RESPONSE_HEADERS = (
    'content-type',
    'content-length',
    'server',
    'retry-after',
    'cache-control',
    'x-amzn-waf-action',
    'x-amzn-requestid',
    'cf-ray',
    'cf-mitigated',
    'x-cache',
    'via',
)
_TOKEN_LIKE = re.compile(r'[A-Za-z0-9+/=_-]{24,}')


def _html_request_headers() -> Dict[str, str]:
    """What the crawler asks for. The fetch policy adds its identity; nothing imitates a browser."""
    return {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
    }


def _policy_stop(reason: Optional[str]) -> str:
    """A fetch-policy stop's fixed words, or '' for any other failure (reported as HTTP 0)."""
    return reason if reason in POLITENESS_STOPS else ''


def _budget_stop_text(budget) -> str:
    """Why the crawl's requests stopped, in fixed words: the refusal, or the spent budget."""
    if budget.refused:
        return f'refused: {budget.refused}'
    return budget.stopped()


def _stop_text(stop: str) -> str:
    """A refusal reads 'refused: HTTP 202 (AWS WAF challenge)'; a policy stop is its own words."""
    return f'refused: {stop}' if stop.startswith('HTTP ') else stop


def _logged_headers(headers: Dict[str, str]) -> Dict[str, str]:
    lowered = {str(name).lower(): str(value) for name, value in (headers or {}).items()}
    return {name: lowered[name][:200] for name in _LOGGED_RESPONSE_HEADERS if name in lowered}


def _response_excerpt(text: str, limit: int = 300) -> str:
    """Whitespace collapsed and token-like strings redacted, then cut to the limit."""
    collapsed = ' '.join((text or '').split())
    return _TOKEN_LIKE.sub('[redacted]', collapsed)[:limit]


def _plain_number(text: str) -> bool:
    """ASCII digits only: str.isdigit also accepts characters such as '²', which int() refuses."""
    return text.isascii() and text.isdigit()


def _page_number(query: str) -> Optional[int]:
    values = parse_qs(query).get('page') or []
    if len(values) != 1 or not _plain_number(values[0]):
        return None
    return int(values[0])


def _has_more_link(html: str) -> bool:
    return BeautifulSoup(html, 'html.parser').select_one('a.more-link') is not None


def _next_listing_page(html: str, page_url: str, careers_url: str) -> Optional[str]:
    """The More Jobs link, only when it stays on the listing path and asks for a later page."""
    link = BeautifulSoup(html, 'html.parser').select_one('a.more-link[href]')
    if link is None:
        return None
    target = urljoin(page_url, link['href'])
    start, here, there = urlparse(careers_url), urlparse(page_url), urlparse(target)
    if there.scheme not in ('http', 'https'):
        return None
    if (there.hostname or '').lower() != (start.hostname or '').lower():
        return None
    if there.path.rstrip('/').lower() != start.path.rstrip('/').lower():
        return None
    if 'subscribe' in parse_qs(there.query):
        return None
    wanted = _page_number(there.query)
    current = _page_number(here.query) or 1
    if wanted is None or wanted <= current:
        return None
    return target


def _resized_listing_page(html: str, careers_url: str) -> Optional[str]:
    """Page one at the reader's page size, built from the first page's own More Jobs link: its
    address without `page`, with `page-items` raised. None when there is no such link, it names
    no page size, or it already asks for as many jobs."""
    target = _next_listing_page(html, careers_url, careers_url)
    if target is None:
        return None
    parts = urlparse(target)
    pairs = parse_qsl(parts.query, keep_blank_values=True)
    sizes = [value for name, value in pairs if name == 'page-items']
    if len(sizes) != 1 or not _plain_number(sizes[0]) or int(sizes[0]) >= _PAGEUP_PAGE_ITEMS:
        return None
    query = urlencode([
        (name, str(_PAGEUP_PAGE_ITEMS) if name == 'page-items' else value)
        for name, value in pairs
        if name != 'page'
    ])
    return urlunparse(parts._replace(query=query))


_LISTING_COMPLETE_STOP = 'no More Jobs link'
_SITES_COMPLETE_STOP = 'no next-page link'
_SUCCESSFACTORS_COMPLETE_STOP = 'all tiles read'
# A SuccessFactors tile page shows 25 jobs (ICRC, 28 November 2026): 30 pages reach 750 jobs.
_SUCCESSFACTORS_PAGE_CAP = 30


# Stops that mean "cannot claim complete", not "we under-read the catalogue". Status stays ok so
# health/scheduling are not punished; listing_complete stays false so absence never counts (W-39).
_LISTING_UNKNOWN_STOPS = frozenset({
    "no stated total",
    "rss has no catalogue total",
})


def _listing_outcome(job_count: int, report: Optional[Dict]) -> Tuple[str, str]:
    """Crawl status and message. A shortfall is partial (warn); unknown completeness stays ok."""
    if not job_count:
        return 'warn', 'No jobs found'
    message = f'Found {job_count} jobs'
    if not report:
        return 'ok', message
    expected = report['expected'] if report['expected'] is not None else 'unknown'
    pages = f"{report['pages']} page{'' if report['pages'] == 1 else 's'}"
    if report['complete']:
        return 'ok', f"{message}; listing complete: {pages}, expected {expected}"
    stop = report.get('stop') or ''
    if stop in _LISTING_UNKNOWN_STOPS:
        return 'ok', f"{message}; listing not counted: {stop}"
    return 'warn', (
        f"{message}; listing partial: {pages}, expected {expected}, stopped: {stop}"
    )


def _more_jobs_remaining(html: str) -> Optional[int]:
    """Jobs after this page, from the More Jobs button text, such as 'More Jobs 177'."""
    link = BeautifulSoup(html, 'html.parser').select_one('a.more-link')
    if link is None:
        return None
    digits = re.findall(r'\d+', link.get_text(' '))
    return int(digits[-1]) if digits else None


def _pageup_first_page_sync(html: str, careers_url: str):
    from crawler.plugins.pageup import PageUpListingReader

    reader = PageUpListingReader()
    jobs = _first_row_per_link(reader.read_job_cards(html, careers_url))
    if not jobs:
        return [], None, None, None, False, False
    remaining = _more_jobs_remaining(html)
    expected = len(jobs) + remaining if remaining is not None else None
    ends = remaining == 0
    next_url = None if ends else _resized_listing_page(html, careers_url)
    resized = next_url is not None
    more_blocked = False
    if not resized and not ends:
        next_url = _next_listing_page(html, careers_url, careers_url)
        if next_url is None and _has_more_link(html):
            more_blocked = True
    return jobs, expected, next_url, resized, ends, more_blocked


def _pageup_follow_page_sync(html: str, page_url: str, careers_url: str):
    from crawler.plugins.pageup import PageUpListingReader

    reader = PageUpListingReader()
    page_jobs = _first_row_per_link(reader.read_job_cards(html, page_url))
    left = _more_jobs_remaining(html)
    ends = left == 0
    following = None if ends else _next_listing_page(html, page_url, careers_url)
    return page_jobs, left, ends, following, _has_more_link(html)


def _sites_page_sync(html: str, page_url: str):
    from crawler.plugins.sites_engine import SitesListingReader

    return SitesListingReader().read_page(html, page_url)


def _successfactors_page_sync(html: str, page_url: str):
    from crawler.plugins.successfactors import SuccessFactorsListingReader

    return SuccessFactorsListingReader().read_page(html, page_url)


class SimpleCrawler:
    """
    Simple crawler that fetches HTML, extracts jobs, and saves to database.
    No complex validation, no repair system - just extract and save.

    Extraction is rule-based: structured data, visible labels, the PageUp career-site reader,
    and the general reader. No AI service is called.
    """
    
    def __init__(self, db_url: str, shadow_mode: bool = False, store_html: bool = True):
        # store_html=False (the admin probe): no HTML storage folder is created or written.
        self.db_url = db_url
        self.timeout = httpx.Timeout(30.0)
        self.shadow_mode = shadow_mode
        
        # Check if global heuristics are enabled
        import os
        self.use_global_heuristics = os.getenv('EXTRACTION_GLOBAL_HEURISTICS', 'true').lower() == 'true'
        
        if self.use_global_heuristics:
            try:
                from core.domain_config import get_domain_config
                from core.extraction_heuristics import (
                    filter_and_score_job_links,
                    get_canonical_hash,
                    is_mailto_link,
                    normalize_url,
                )
                self._filter_and_score_job_links = filter_and_score_job_links
                self._normalize_url = normalize_url
                self._get_canonical_hash = get_canonical_hash
                self._get_domain_config = get_domain_config
                self._is_mailto_link = is_mailto_link
                logger.info("Global extraction heuristics enabled")
            except ImportError as e:
                logger.warning(f"Global heuristics not available: {e}")
                self.use_global_heuristics = False
        
        self.strategy_selector = None
        try:
            from core.strategy_selector import StrategySelector
            self.strategy_selector = StrategySelector()
            logger.info("Strategy selector initialized")
        except Exception as e:
            logger.warning(f"Strategy selector not available: {e}")
        
        # Initialize HTML storage (Phase 2)
        self.html_storage = None
        if store_html:
            try:
                from core.html_storage import get_html_storage
                self.html_storage = get_html_storage()
                logger.info("HTML storage initialized")
            except Exception as e:
                logger.warning(f"HTML storage not available: {e}")
        
        # Initialize extraction logger (Phase 2)
        self.extraction_logger = None
        try:
            from core.extraction_logger import ExtractionLogger
            self.extraction_logger = ExtractionLogger(db_url)
            logger.info("Extraction logger initialized")
        except Exception as e:
            logger.warning(f"Extraction logger not available: {e}")
        
        # Initialize quality scorer (Phase 4)
        self.quality_scorer = None
        try:
            from core.data_quality import get_quality_scorer
            self.quality_scorer = get_quality_scorer()
            logger.info("Quality scorer initialized")
        except Exception as e:
            logger.warning(f"Quality scorer not available: {e}")
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url, connect_timeout=10)

    def _previous_kept_row(self, source_id: str):
        """(valid_count, observed) of the latest finished crawl for the source, or None."""
        if not self.db_url:
            return None
        try:
            # Short timeout: a miss must not slow the crawl or offline tests.
            conn = psycopg2.connect(self.db_url, connect_timeout=2)
        except Exception:
            return None
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT valid_count, observed
                    FROM crawl_logs
                    WHERE source_id = %s
                      AND status IS DISTINCT FROM 'running'
                    ORDER BY ran_at DESC NULLS LAST, id DESC
                    LIMIT 1
                    """,
                    (source_id,),
                )
                return cur.fetchone()
        except Exception:
            return None
        finally:
            conn.close()

    def _previous_reader_name(self, source_id: str):
        """The latest extraction_logs reader for the source, or None."""
        if not self.db_url:
            return None
        try:
            conn = psycopg2.connect(self.db_url, connect_timeout=2)
        except Exception:
            return None
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT extracted_fields->>'reader'
                    FROM extraction_logs
                    WHERE source_id = %s
                      AND extracted_fields ? 'reader'
                    ORDER BY created_at DESC NULLS LAST, id DESC
                    LIMIT 1
                    """,
                    (source_id,),
                )
                row = cur.fetchone()
                return row[0] if row else None
        except Exception:
            return None
        finally:
            conn.close()

    async def _fetch_page(self, url: str) -> Tuple[int, str, str]:
        """(status, html, stop). `stop` is why the source stops here, in fixed words: a refusal
        or challenge, or a fetch-policy stop (robots.txt, budget); '' otherwise. One request: a
        refusal is never retried under another identity."""
        try:
            result = await fetch_url(
                url, headers=_html_request_headers(), timeout=float(self.timeout.connect or 30.0)
            )
        except Exception as exc:
            reason = fetch_message(exc)
            stop = _policy_stop(reason)
            if stop:
                logger.warning("Not fetched %s: %s", url, stop)
            else:
                logger.error("Error fetching %s: %s", url, exc)
            return 0, "", stop
        return result.status_code, result.text, refusal(
            result.status_code, result.headers, result.text
        )

    async def fetch_html(self, url: str, retry_count: int = 0, use_browser: bool = False) -> Tuple[int, str]:
        """Fetch HTML. Browser rendering is not used; the HTTP result is returned."""
        del retry_count, use_browser
        status, html, _ = await self._fetch_page(url)
        return status, html

    async def _fetch_listing_page(self, url: str) -> Tuple[int, str, str]:
        """One request for a later listing page: (status, html, stop), as `_fetch_page`.
        A non-200 logs allowlisted headers and an excerpt."""
        try:
            result = await fetch_url(
                url,
                headers=_html_request_headers(),
                timeout=float(self.timeout.connect or 30.0),
            )
        except Exception as exc:
            logger.warning("Listing page %s failed: %s", url, exc)
            reason = fetch_message(exc)
            return 0, "", _policy_stop(reason)
        if result.status_code != 200:
            logger.warning(
                "Listing page %s returned HTTP %s; headers=%s; body=%r",
                url,
                result.status_code,
                _logged_headers(result.headers),
                _response_excerpt(result.text),
            )
        return result.status_code, result.text, refusal(
            result.status_code, result.headers, result.text
        )
    
    def extract_jobs_from_html(self, html: str, base_url: str) -> List[Dict]:
        """
        Extract jobs from HTML using rule-based strategy selection.
        
        Uses intelligent strategy selection that:
        1. Tries JSON-LD structured data FIRST (most reliable)
        2. Analyzes HTML structure to choose the best strategy
        3. Tries recommended strategy
        4. Falls back to other strategies if needed
        5. Validates and normalizes results for consistency
        6. Maintains quality across all sources
        """
        soup = BeautifulSoup(html, 'html.parser')
        
        # PRIORITY 1: Try JSON-LD structured data FIRST (most reliable source)
        logger.info("Trying JSON-LD structured data extraction (priority)...")
        jobs = self._extract_from_structured_data(soup, base_url)
        if jobs:
            logger.info(f"JSON-LD extraction found {len(jobs)} jobs")
            LISTING_STRATEGY.set('structured-first')
            return jobs
        
        if self.strategy_selector:
            try:
                # Prepare strategy functions
                strategies = {
                    'tables': lambda h, b: self._extract_from_tables(BeautifulSoup(h, 'html.parser'), b),
                    'divs': lambda h, b: self._extract_from_divs_lists(BeautifulSoup(h, 'html.parser'), b),
                    'links': lambda h, b: self._extract_from_links(BeautifulSoup(h, 'html.parser'), b),
                    'structured': lambda h, b: self._extract_from_structured_data(BeautifulSoup(h, 'html.parser'), b),
                    'generic': lambda h, b: self._extract_generic_fallback(BeautifulSoup(h, 'html.parser'), b)
                }
                
                # Use strategy selector (now sync method)
                jobs, metadata = self.strategy_selector.select_and_validate(html, base_url, strategies)
                
                logger.info(f"Strategy selector: {metadata.get('strategy_used', 'unknown')} "
                          f"extracted {len(jobs)} jobs (validated from {metadata.get('original_count', 0)})")
                
                if metadata.get('warnings'):
                    logger.warning(f"Validation warnings: {len(metadata['warnings'])} warnings")
                
                LISTING_STRATEGY.set(f"selector-{metadata.get('strategy_used') or 'none'}")
                return jobs
            except Exception as e:
                logger.warning(f"Strategy selector failed, falling back to sequential: {e}")
                # Fall through to sequential strategy
        
        # Fallback: Sequential strategy selection (original behavior)
        jobs = []
        
        # Strategy 1: Table-based extraction (for UNESCO-style sites)
        logger.info("Trying table-based extraction...")
        jobs = self._extract_from_tables(soup, base_url)
        if jobs:
            logger.info(f"Strategy 1 (tables) found {len(jobs)} jobs")
            LISTING_STRATEGY.set('sequential-tables')
            return jobs
        
        # Strategy 2: Div/list-based extraction (for UNDP-style sites)
        logger.info("Trying div/list-based extraction...")
        jobs = self._extract_from_divs_lists(soup, base_url)
        if jobs:
            logger.info(f"Strategy 2 (divs/lists) found {len(jobs)} jobs")
            LISTING_STRATEGY.set('sequential-divs')
            return jobs
        
        # Strategy 3: Link-based extraction (for MSF-style sites)
        logger.info("Trying link-based extraction...")
        jobs = self._extract_from_links(soup, base_url)
        if jobs:
            logger.info(f"Strategy 3 (links) found {len(jobs)} jobs")
            LISTING_STRATEGY.set('sequential-links')
            return jobs
        
        # Strategy 4: Structured data (JSON-LD, microdata)
        logger.info("Trying structured data extraction...")
        jobs = self._extract_from_structured_data(soup, base_url)
        if jobs:
            logger.info(f"Strategy 4 (structured data) found {len(jobs)} jobs")
            LISTING_STRATEGY.set('sequential-structured')
            return jobs
        
        # Strategy 5: Generic fallback - extract any substantial links from main content
        logger.info("Trying generic fallback extraction...")
        jobs = self._extract_generic_fallback(soup, base_url)
        if jobs:
            logger.info(f"Strategy 5 (generic fallback) found {len(jobs)} jobs")
            LISTING_STRATEGY.set('sequential-generic')
            return jobs
        
        logger.warning("No extraction strategy found jobs")
        LISTING_STRATEGY.set('none')
        return []

    def _extract_jobs_sync(self, html: str, base_url: str) -> Tuple[List[Dict], Optional[str]]:
        # Worker ContextVar is a copy; clear so a stub extract cannot return a prior strategy.
        LISTING_STRATEGY.set(None)
        jobs = self.extract_jobs_from_html(html, base_url)
        return jobs, LISTING_STRATEGY.get()
    
    def _extract_from_tables(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """Extract jobs from HTML tables (UNESCO-style)"""
        jobs = []
        tables = soup.find_all('table')
        logger.info(f"Found {len(tables)} tables")
        
        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:
                continue
            
            # Find header row
            header_row = None
            header_map = {}
            
            for row in rows[:5]:
                cells = row.find_all(['th', 'td'])
                if not cells:
                    continue
                
                cell_texts = [c.get_text().strip().lower() for c in cells]
                header_keywords = ['title', 'position', 'location', 'deadline', 'closing', 'apply', 'date', 'grade', 'type']
                keyword_count = sum(1 for text in cell_texts for kw in header_keywords if kw in text)
                
                # Also check if row has mostly <th> tags (strong indicator of header)
                th_count = len(row.find_all('th'))
                td_count = len(row.find_all('td'))
                is_likely_header = th_count > td_count or keyword_count >= 2
                
                if is_likely_header:
                    header_row = row
                    for idx, cell in enumerate(cells):
                        text = cell.get_text().strip().lower()
                        # More flexible matching
                        if 'title' in text or 'position' in text or 'job' in text:
                            header_map[idx] = 'title'
                        elif 'location' in text or 'duty' in text or 'station' in text:
                            header_map[idx] = 'location'
                        elif 'deadline' in text or 'closing' in text or 'apply by' in text or ('date' in text and ('closing' in text or 'apply' in text)):
                            header_map[idx] = 'deadline'
                    break
            
            if not header_map:
                continue
            
            # Extract data rows
            for row in rows:
                if row == header_row:
                    continue
                
                cells = row.find_all(['td', 'th'])
                if len(cells) < 1:  # At least 1 cell (more lenient)
                    continue
                
                job = {}
                
                # Extract title from link (preferred)
                link = row.find('a', href=True)
                if link:
                    link_text = link.get_text().strip()
                    if link_text and len(link_text) >= 5:
                        job['title'] = link_text
                        href = link.get('href', '')
                        if href and not href.startswith('#') and not href.startswith('javascript:'):
                            job['apply_url'] = urljoin(base_url, href)
                
                # Extract from cells using header map
                for idx, cell in enumerate(cells):
                    if idx in header_map:
                        field = header_map[idx]
                        text = cell.get_text().strip()
                        
                        if field == 'title' and 'title' not in job:
                            if text and len(text) >= 5:
                                # Clean text - remove "Job Title" prefix if present
                                text = re.sub(r'^Job Title\s*', '', text, flags=re.IGNORECASE).strip()
                                # Remove "Apply by" and "Location" if they got mixed in
                                text = re.sub(r'\s*Apply by.*$', '', text, flags=re.IGNORECASE).strip()
                                text = re.sub(r'\s*Location.*$', '', text, flags=re.IGNORECASE).strip()
                                if text and len(text) >= 5:
                                    job['title'] = text
                                # If no link found, try to find link in this cell
                                if 'apply_url' not in job:
                                    cell_link = cell.find('a', href=True)
                                    if cell_link:
                                        href = cell_link.get('href', '')
                                        if href and not href.startswith('#') and not href.startswith('javascript:'):
                                            job['apply_url'] = urljoin(base_url, href)
                        elif field == 'location':
                            if text and len(text) >= 3:
                                # Clean location - remove "Location" prefix if present
                                text = re.sub(r'^Location\s*', '', text, flags=re.IGNORECASE).strip()
                                if text and len(text) >= 3:
                                    job['location_raw'] = text
                        elif field == 'deadline':
                            if text and len(text) >= 3:
                                # Clean deadline - remove "Apply by" prefix if present
                                text = re.sub(r'^Apply by\s*', '', text, flags=re.IGNORECASE).strip()
                                deadline_cleaned = self._parse_deadline(text)
                                if deadline_cleaned:
                                    job['deadline'] = deadline_cleaned
                
                # If header map exists but title not found, try to extract from first cell
                if 'title' not in job and header_map and len(cells) > 0:
                    # Try first cell as title if no header map matched
                    first_cell = cells[0]
                    first_text = first_cell.get_text().strip()
                    # Clean and check if it looks like a title
                    first_text = re.sub(r'^Job Title\s*', '', first_text, flags=re.IGNORECASE).strip()
                    if first_text and len(first_text) >= 10:
                        # Check if it contains deadline/location info (shouldn't be in title)
                        if not re.search(r'Apply by|Location|Deadline', first_text, re.IGNORECASE):
                            job['title'] = first_text
                            # Try to find link in first cell
                            first_link = first_cell.find('a', href=True)
                            if first_link:
                                href = first_link.get('href', '')
                                if href and not href.startswith('#') and not href.startswith('javascript:'):
                                    job['apply_url'] = urljoin(base_url, href)
                
                # Also try to extract from row text if header map didn't work (last resort)
                if 'title' not in job:
                    row_text = row.get_text().strip()
                    # Look for substantial text that might be a title
                    if len(row_text) >= 10:
                        # Split by newlines and find the first substantial line that doesn't contain metadata
                        lines = [line.strip() for line in row_text.split('\n') if line.strip()]
                        for line in lines:
                            # Skip lines that are clearly metadata
                            if re.search(r'^(Job Title|Apply by|Location|Deadline):?\s*', line, re.IGNORECASE):
                                continue
                            if len(line) >= 10 and not any(nav in line.lower() for nav in ['home', 'about', 'contact', 'login']):
                                # Check if line contains deadline/location (shouldn't be in title)
                                if not re.search(r'Apply by|Location|Deadline', line, re.IGNORECASE):
                                    job['title'] = line
                                    break
                
                # If we have a title but no URL, try to construct URL from title link or row link
                if job.get('title') and 'apply_url' not in job:
                    # Try to find any link in the row
                    row_link = row.find('a', href=True)
                    if row_link:
                        href = row_link.get('href', '')
                        if href and not href.startswith('#') and not href.startswith('javascript:'):
                            job['apply_url'] = urljoin(base_url, href)
                
                # Only add if we have title (apply_url will be set by fallback in save_jobs if still missing)
                if job.get('title'):
                    jobs.append(job)
                    if len(jobs) >= 100:
                        break
            
            if jobs:
                break
        
        return jobs
    
    def _extract_from_divs_lists(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """Extract jobs from div/list structures (UNDP-style)"""
        jobs = []
        
        # Look for common job container patterns
        job_containers = []
        
        # Try common class patterns
        for selector in [
            'div[class*="job"]', 'div[class*="position"]', 'div[class*="vacancy"]',
            'li[class*="job"]', 'li[class*="position"]', 'article[class*="job"]',
            'div[class*="listing"]', 'div[class*="item"]', 'div[class*="card"]',
            'div[class*="post"]', 'div[class*="entry"]', 'div[class*="result"]'
        ]:
            containers = soup.select(selector)
            if containers:
                job_containers.extend(containers[:50])  # Limit to first 50
                break
        
        # If no specific containers, look for sections with job-like content
        if not job_containers:
            # Look for sections with multiple links that might be jobs
            sections = soup.find_all(['section', 'div'], class_=lambda x: x and any(
                kw in x.lower() for kw in ['job', 'position', 'vacancy', 'career', 'opportunity']
            ))
            for section in sections:
                links = section.find_all('a', href=True)
                if len(links) >= 3:  # Likely a job listing section
                    job_containers.append(section)
        
        # Fallback: Look for any container with multiple substantial links (likely job listings)
        if not job_containers:
            # Find main content areas
            main_content = soup.find('main') or soup.find('div', id=lambda x: x and ('content' in x.lower() or 'main' in x.lower()))
            if main_content:
                # Look for containers with multiple links (likely job listings)
                for container in main_content.find_all(['div', 'li', 'article'], recursive=True):
                    links = container.find_all('a', href=True)
                    # Filter out navigation/menu links (short text, common nav words)
                    substantial_links = [
                        link for link in links 
                        if len(link.get_text().strip()) >= 8  # More lenient for BRAC (was 10)
                        and not any(nav_word in link.get_text().lower() for nav_word in ['home', 'about', 'contact', 'login', 'register', 'search', 'skip'])
                    ]
                    if len(substantial_links) >= 1:  # More lenient: at least 1 substantial link (was 2)
                        job_containers.append(container)
                        if len(job_containers) >= 30:  # Increased limit for BRAC (was 20)
                            break
        
        logger.info(f"Found {len(job_containers)} potential job containers")
        
        for container in job_containers:
            job = {}
            
            # Extract title from link (most reliable)
            link = container.find('a', href=True)
            if link:
                link_text = link.get_text().strip()
                # More lenient: accept 5+ chars (was already 5, but ensure it's not too strict)
                if link_text and len(link_text) >= 5:
                    job['title'] = link_text
                    href = link.get('href', '')
                    if href and not href.startswith('#') and not href.startswith('javascript:'):
                        job['apply_url'] = urljoin(base_url, href)
            
            # If no link found, try to extract from text (for BRAC-style sites)
            if not job.get('title') and not job.get('apply_url'):
                container_text = container.get_text().strip()
                # Look for first substantial line as title
                lines = [line.strip() for line in container_text.split('\n') if line.strip()]
                for line in lines[:3]:  # Check first 3 lines
                    if len(line) >= 10 and not any(nav in line.lower() for nav in ['home', 'about', 'contact', 'login']):
                        # Check if line contains a link pattern or looks like a title
                        if not line.startswith('Location') and not line.startswith('Deadline'):
                            job['title'] = line[:200]  # Limit length
                            # Try to find a link in the container
                            all_links = container.find_all('a', href=True)
                            if all_links:
                                href = all_links[0].get('href', '')
                                if href and not href.startswith('#') and not href.startswith('javascript:'):
                                    job['apply_url'] = urljoin(base_url, href)
                            break
            
            # Extract location and deadline from text
            container_text = container.get_text()
            
            # Look for location patterns
            location_patterns = [
                r'Location[:\s]+([^\n\r]+)',
                r'Duty Station[:\s]+([^\n\r]+)',
                r'Location[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
            ]
            for pattern in location_patterns:
                match = re.search(pattern, container_text, re.IGNORECASE)
                if match:
                    location = match.group(1).strip()
                    if len(location) >= 3 and len(location) < 100:
                        job['location_raw'] = location
                        break
            
            # Look for deadline patterns
            deadline_patterns = [
                r'Apply by[:\s]+([^\n\r]+)',
                r'Deadline[:\s]+([^\n\r]+)',
                r'Closing[:\s]+([^\n\r]+)',
                r'Due[:\s]+([^\n\r]+)',
            ]
            for pattern in deadline_patterns:
                match = re.search(pattern, container_text, re.IGNORECASE)
                if match:
                    deadline_text = match.group(1).strip()
                    deadline_cleaned = self._parse_deadline(deadline_text)
                    if deadline_cleaned:
                        job['deadline'] = deadline_cleaned
                        break
            
            # Only add if we have title (apply_url will be set by fallback in save_jobs if still missing)
            if job.get('title'):
                jobs.append(job)
                if len(jobs) >= 100:
                    break
        
        return jobs
    
    def _extract_from_links(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """Extract jobs from links with job-like patterns (MSF-style)"""
        jobs = []
        
        # Use global heuristics if enabled
        if self.use_global_heuristics:
            # Get domain config for max_links
            domain_config = self._get_domain_config(base_url)
            max_links = domain_config.get('max_links_per_page', 500)
            
            # Filter and score links using heuristics
            source_id = _SOURCE_FOR_LOGS.get()
            scored_links = self._filter_and_score_job_links(soup, base_url, max_links=max_links, source_id=source_id)
            logger.info(f"Found {len(scored_links)} scored job links (using global heuristics)")
            
            # Process scored links (sorted by score descending)
            for link, score, metadata in scored_links:
                link_text = link.get_text().strip()
                href = link.get('href', '').strip()
                
                # Double-check: reject mailto links even if they passed scoring
                if hasattr(self, '_is_mailto_link') and self._is_mailto_link(href):
                    logger.info(f"HEURISTICS: rejected a mailto link in post-processing for source {source_id or 'unknown'}")
                    continue
                
                # Normalize URL
                full_url = urljoin(base_url, href)
                normalized_url = self._normalize_url(full_url)
                
                job = {
                    'title': link_text,
                    'apply_url': normalized_url,
                    'extraction_score': score,
                    'extraction_metadata': metadata
                }
                
                # Try to extract location/deadline from nearby text
                parent = link.parent
                if parent:
                    parent_text = parent.get_text()
                    next_sibling = parent.find_next_sibling()
                    if next_sibling:
                        parent_text += " " + next_sibling.get_text()
                    
                    # Look for location
                    location_patterns = [
                        r'Location[:\s]+([^\n\r<]+)',
                        r'Duty Station[:\s]+([^\n\r<]+)',
                        r'Based in[:\s]+([^\n\r<]+)',
                    ]
                    for pattern in location_patterns:
                        location_match = re.search(pattern, parent_text, re.IGNORECASE)
                        if location_match:
                            location = location_match.group(1).strip()
                            location = re.sub(r'<[^>]+>', '', location)
                            if 3 <= len(location) < 100:
                                job['location_raw'] = location
                                break
                    
                    # Look for deadline
                    deadline_patterns = [
                        r'Apply by[:\s]+([^\n\r<]+)',
                        r'Deadline[:\s]+([^\n\r<]+)',
                        r'Closing[:\s]+([^\n\r<]+)',
                    ]
                    for pattern in deadline_patterns:
                        deadline_match = re.search(pattern, parent_text, re.IGNORECASE)
                        if deadline_match:
                            deadline_text = deadline_match.group(1).strip()
                            deadline_text = re.sub(r'<[^>]+>', '', deadline_text)
                            deadline_cleaned = self._parse_deadline(deadline_text)
                            if deadline_cleaned:
                                job['deadline'] = deadline_cleaned
                                break
                
                jobs.append(job)
            
            return jobs
        
        # Fallback to original logic if heuristics disabled
        # Find all links
        all_links = soup.find_all('a', href=True)
        
        # Filter for job-like links - more flexible approach
        job_keywords = [
            'position', 'job', 'vacancy', 'career', 'opening', 'opportunity',
            'recruitment', 'hiring', 'apply', 'application', 'posting',
            'consultant', 'specialist', 'officer', 'manager', 'coordinator',
            'analyst', 'advisor', 'assistant', 'director', 'engineer', 'expert'
        ]
        
        # Navigation/menu keywords to exclude
        nav_keywords = ['home', 'about', 'contact', 'login', 'register', 'search', 'menu', 'skip']
        
        job_links = []
        for link in all_links:
            link_text = link.get_text().strip()
            href = link.get('href', '').strip()
            
            # Skip navigation/menu links
            if not link_text or len(link_text) < 5:
                continue
            
            link_text_lower = link_text.lower()
            href_lower = href.lower()
            
            # Skip if it's clearly navigation
            if any(nav in link_text_lower for nav in nav_keywords) and len(link_text) < 20:
                continue
            
            # Skip anchors and javascript
            if href.startswith('#') or href.startswith('javascript:'):
                continue
            
            # Strategy 1: Link text or URL contains job keywords
            has_job_keyword = any(kw in link_text_lower for kw in job_keywords) or any(kw in href_lower for kw in job_keywords)
            
            # Strategy 2: Link is substantial (long text, likely a job title)
            is_substantial = len(link_text) >= 15 and not any(nav in link_text_lower for nav in nav_keywords)
            
            # Strategy 3: Link is in a job-related section
            parent = link.parent
            is_in_job_section = False
            if parent:
                parent_class = parent.get('class', [])
                parent_id = parent.get('id', '')
                parent_text = parent.get_text().lower()
                section_indicators = ['job', 'position', 'vacancy', 'career', 'opportunity', 'listing']
                is_in_job_section = any(
                    ind in str(parent_class).lower() or 
                    ind in str(parent_id).lower() or 
                    ind in parent_text[:200]  # Check first 200 chars
                    for ind in section_indicators
                )
            
            if has_job_keyword or (is_substantial and is_in_job_section) or (is_substantial and len(link_text) >= 25):
                job_links.append(link)
        
        logger.info(f"Found {len(job_links)} job-like links")
        
        # Get domain config for max_links
        if self.use_global_heuristics:
            domain_config = self._get_domain_config(base_url)
            max_links = domain_config.get('max_links_per_page', 500)
        else:
            max_links = 150  # Original default
        
        for link in job_links[:max_links]:
            link_text = link.get_text().strip()
            href = link.get('href', '').strip()
            
            if href.startswith('#') or href.startswith('javascript:'):
                continue
            
            job = {
                'title': link_text,
                'apply_url': urljoin(base_url, href)
            }
            
            # Try to extract location/deadline from nearby text (parent, siblings, nearby elements)
            parent = link.parent
            if parent:
                # Check parent and siblings
                parent_text = parent.get_text()
                
                # Also check next sibling
                next_sibling = parent.find_next_sibling()
                if next_sibling:
                    parent_text += " " + next_sibling.get_text()
                
                # Look for location
                location_patterns = [
                    r'Location[:\s]+([^\n\r<]+)',
                    r'Duty Station[:\s]+([^\n\r<]+)',
                    r'Based in[:\s]+([^\n\r<]+)',
                    r'Location[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
                ]
                for pattern in location_patterns:
                    location_match = re.search(pattern, parent_text, re.IGNORECASE)
                    if location_match:
                        location = location_match.group(1).strip()
                        # Clean up HTML tags if any
                        location = re.sub(r'<[^>]+>', '', location)
                        if 3 <= len(location) < 100:
                            job['location_raw'] = location
                            break
                
                # Look for deadline
                deadline_patterns = [
                    r'Apply by[:\s]+([^\n\r<]+)',
                    r'Deadline[:\s]+([^\n\r<]+)',
                    r'Closing[:\s]+([^\n\r<]+)',
                    r'Due[:\s]+([^\n\r<]+)',
                    r'Application deadline[:\s]+([^\n\r<]+)',
                ]
                for pattern in deadline_patterns:
                    deadline_match = re.search(pattern, parent_text, re.IGNORECASE)
                    if deadline_match:
                        deadline_text = deadline_match.group(1).strip()
                        deadline_text = re.sub(r'<[^>]+>', '', deadline_text)  # Clean HTML
                        deadline_cleaned = self._parse_deadline(deadline_text)
                        if deadline_cleaned:
                            job['deadline'] = deadline_cleaned
                            break
            
            jobs.append(job)
        
        return jobs
    
    def _extract_from_structured_data(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """Extract jobs from structured data (JSON-LD, microdata)"""
        jobs = []
        
        # Try JSON-LD
        json_ld_scripts = soup.find_all('script', type='application/ld+json')
        for script in json_ld_scripts:
            try:
                import json
                data = json.loads(script.string)
                
                # Handle different JSON-LD structures
                items_to_check = []
                
                if isinstance(data, dict):
                    # Check if it's a JobPosting directly
                    if data.get('@type') == 'JobPosting' or 'JobPosting' in str(data.get('@type', '')):
                        items_to_check.append(data)
                    # Check if it has @graph (common in structured data)
                    elif '@graph' in data and isinstance(data['@graph'], list):
                        items_to_check.extend([item for item in data['@graph'] if isinstance(item, dict)])
                    # Check if it has itemListElement (for job listings)
                    elif 'itemListElement' in data and isinstance(data['itemListElement'], list):
                        items_to_check.extend([item.get('item', {}) for item in data['itemListElement'] if isinstance(item.get('item'), dict)])
                elif isinstance(data, list):
                    items_to_check = [item for item in data if isinstance(item, dict)]
                
                # Process all potential job postings
                for item in items_to_check:
                    if isinstance(item, dict):
                        # Check for JobPosting type (various formats)
                        item_type = item.get('@type', '')
                        if item_type == 'JobPosting' or 'JobPosting' in str(item_type):
                            job = self._parse_job_posting(item, base_url)
                            if job:
                                jobs.append(job)
            except Exception as e:
                logger.debug(f"Error parsing JSON-LD: {e}")
                pass
        
        # Try microdata
        microdata_jobs = soup.find_all(attrs={'itemtype': lambda x: x and 'JobPosting' in x})
        for item in microdata_jobs:
            job = {}
            
            # Extract title
            title_elem = item.find(attrs={'itemprop': 'title'})
            if title_elem:
                job['title'] = title_elem.get_text().strip()
            
            # Extract URL
            url_elem = item.find(attrs={'itemprop': 'url'}) or item.find('a', href=True)
            if url_elem:
                href = url_elem.get('href') or url_elem.get('content')
                if href:
                    job['apply_url'] = urljoin(base_url, href)
            
            # Extract location
            location_elem = item.find(attrs={'itemprop': 'jobLocation'})
            if location_elem:
                job['location_raw'] = location_elem.get_text().strip()
            
            # Extract deadline
            deadline_elem = item.find(attrs={'itemprop': 'validThrough'})
            if deadline_elem:
                deadline_text = deadline_elem.get_text().strip()
                deadline_cleaned = self._parse_deadline(deadline_text)
                if deadline_cleaned:
                    job['deadline'] = deadline_cleaned
            
            if job.get('title') and job.get('apply_url'):
                jobs.append(job)
        
        return jobs
    
    def _parse_job_posting(self, data: Dict, base_url: str) -> Optional[Dict]:
        """Parse a JobPosting structured data object with comprehensive field extraction"""
        job = {}
        
        # Extract title
        if 'title' in data:
            job['title'] = str(data['title']).strip()
        
        # Extract URL (try multiple fields)
        url_fields = ['url', 'applicationUrl', 'applicationURL', 'applyUrl', 'applyURL', 'jobUrl']
        for field in url_fields:
            if field in data:
                url = str(data[field])
                if url:
                    job['apply_url'] = urljoin(base_url, url)
                    break
        
        # Extract location (comprehensive handling)
        if 'jobLocation' in data:
            location = data['jobLocation']
            if isinstance(location, dict):
                # Handle structured location
                if 'address' in location:
                    address = location['address']
                    if isinstance(address, dict):
                        # Build location string from address components
                        parts = []
                        if address.get('addressLocality'):
                            parts.append(address['addressLocality'])
                        if address.get('addressRegion'):
                            parts.append(address['addressRegion'])
                        if address.get('addressCountry'):
                            parts.append(address['addressCountry'])
                        if parts:
                            job['location_raw'] = ', '.join(parts)
                        elif address.get('streetAddress'):
                            job['location_raw'] = str(address['streetAddress'])
                    else:
                        job['location_raw'] = str(address)
                elif 'name' in location:
                    job['location_raw'] = str(location['name'])
                else:
                    job['location_raw'] = str(location)
            elif isinstance(location, list):
                # Multiple locations
                locations = [str(loc.get('name', loc) if isinstance(loc, dict) else loc) for loc in location]
                job['location_raw'] = '; '.join(locations)
            else:
                job['location_raw'] = str(location)
            published = posting_locations(location)
            if published:
                job['locations'] = published
        
        # Extract deadline (try multiple fields)
        deadline_fields = ['validThrough', 'applicationDeadline', 'deadline', 'closingDate', 'expires']
        for field in deadline_fields:
            if field in data:
                deadline_text = str(data[field])
                deadline_cleaned = self._parse_deadline(deadline_text)
                if deadline_cleaned:
                    job['deadline'] = deadline_cleaned
                    break
        
        # Extract salary (if available)
        if 'baseSalary' in data:
            salary = data['baseSalary']
            if isinstance(salary, dict):
                if 'value' in salary:
                    value = salary['value']
                    if isinstance(value, dict):
                        amount = value.get('value', '')
                        currency = value.get('currency', '')
                        if amount:
                            job['salary_raw'] = f"{currency} {amount}".strip()
                    elif isinstance(value, (str, int, float)) and not isinstance(value, bool):
                        job['salary_raw'] = str(value)
                elif 'minValue' in salary and 'maxValue' in salary:
                    job['salary_raw'] = f"{salary['minValue']} - {salary['maxValue']}"
        
        # Extract description (if available)
        if isinstance(data.get('description'), str):
            job['description'] = data['description'].strip()
        
        # Extract employment type
        if 'employmentType' in data:
            kinds = data['employmentType']
            if isinstance(kinds, list):
                kinds = ', '.join(str(kind).strip() for kind in kinds if str(kind).strip())
            job['employment_type'] = str(kinds)
        
        # Extract hiring organization
        if 'hiringOrganization' in data:
            org = data['hiringOrganization']
            if isinstance(org, dict) and 'name' in org:
                job['employer'] = str(org['name']).strip()
        
        # Validate required fields
        if job.get('title') and job.get('apply_url'):
            job['record_class'] = 'job_posting'
            return job
        
        return None
    
    def _extract_generic_fallback(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """
        Generic fallback: Extract any substantial links from main content area.
        This is a last resort that tries to find job-like links even without clear patterns.
        """
        jobs = []
        
        # Find main content area (skip header, footer, nav)
        main_content = soup.find('main')
        if not main_content:
            # Try common content selectors
            for selector in ['#content', '#main', '.content', '.main', '[role="main"]']:
                main_content = soup.select_one(selector)
                if main_content:
                    break
        
        if not main_content:
            # Fallback: use body but exclude nav, header, footer
            main_content = soup.find('body')
            if main_content:
                # Remove navigation elements
                for nav in main_content.find_all(['nav', 'header', 'footer']):
                    nav.decompose()
        
        if not main_content:
            return jobs
        
        # Find all links in main content
        all_links = main_content.find_all('a', href=True)
        
        # Filter for substantial links (likely job titles)
        nav_keywords = ['home', 'about', 'contact', 'login', 'register', 'search', 'menu', 'skip', 'privacy', 'terms']
        
        for link in all_links:
            link_text = link.get_text().strip()
            href = link.get('href', '').strip()
            
            # Skip if too short or navigation - more lenient for BRAC
            if len(link_text) < 8:  # Lowered from 10
                continue
            
            if any(nav in link_text.lower() for nav in nav_keywords) and len(link_text) < 20:  # Lowered from 25
                continue
            
            # Skip anchors and javascript
            if href.startswith('#') or href.startswith('javascript:'):
                continue
            
            # Skip external links to social media, etc.
            if any(domain in href.lower() for domain in ['facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com', 'youtube.com', 'pinterest.com']):
                continue
            
            # More lenient: Accept links with 10+ chars (was 15) OR links with job keywords (8+ chars)
            has_job_keyword = any(kw in link_text.lower() for kw in ['position', 'job', 'vacancy', 'career', 'opening', 'opportunity', 'recruitment', 'hiring'])
            is_substantial = len(link_text) >= 10  # Lowered from 15
            
            if is_substantial or (has_job_keyword and len(link_text) >= 8):
                job = {
                    'title': link_text,
                    'apply_url': urljoin(base_url, href)
                }
                
                # Try to extract location/deadline from nearby context
                parent = link.parent
                if parent:
                    context_text = parent.get_text()
                    
                    # Look for location
                    location_match = re.search(r'Location[:\s]+([^\n\r<]+)', context_text, re.IGNORECASE)
                    if location_match:
                        location = location_match.group(1).strip()
                        location = re.sub(r'<[^>]+>', '', location)
                        if 3 <= len(location) < 100:
                            job['location_raw'] = location
                    
                    # Look for deadline
                    deadline_match = re.search(r'(?:Apply by|Deadline|Closing|Due)[:\s]+([^\n\r<]+)', context_text, re.IGNORECASE)
                    if deadline_match:
                        deadline_text = deadline_match.group(1).strip()
                        deadline_text = re.sub(r'<[^>]+>', '', deadline_text)
                        deadline_cleaned = self._parse_deadline(deadline_text)
                        if deadline_cleaned:
                            job['deadline'] = deadline_cleaned
                
                jobs.append(job)
                
                if len(jobs) >= 100:  # Limit to 100 jobs
                    break
        
        return jobs
    
    def _parse_deadline(self, text: str) -> Optional[str]:
        """
        Parse deadline text into YYYY-MM-DD format using dateparser.
        
        Handles formats like:
        - "12-DEC-2025"
        - "10/12/2025"
        - "December 10, 2025"
        - "10 December 2025"
        - "31 Dec" (assumes current year if year missing)
        - ISO 8601 formats
        """
        if not text:
            return None
        
        text = text.strip()
        
        # Remove common prefixes
        prefixes = ['closing date:', 'deadline:', 'apply by:', 'due:', 'by:', 'valid through:', 'expires:']
        for prefix in prefixes:
            if text.lower().startswith(prefix):
                text = text[len(prefix):].strip()

        # ISO first: dateparser with DATE_ORDER DMY misreads 2026-10-29 as 2029-10-26.
        is_iso, iso_date = _iso_calendar_date(text)
        if is_iso:
            return iso_date

        # A deadline names a day, so it contains a digit. Labels and column headings
        # ("Agency", "Location"), relative words ("today"), and a bare month ("December")
        # are not deadlines.
        if not _HAS_DIGIT.search(text):
            return None

        # Remove a time joined to the date (e.g., "31/12/2025T23:59:59Z" -> "31/12/2025")
        text = _ISO_TIME.split(text, maxsplit=1)[0]
        
        # Try dateparser first (handles many formats automatically)
        try:
            from datetime import datetime

            import dateparser
            
            # Parse with dateparser (handles many locales and formats). Saves run in worker
            # threads, and dateparser's thread safety is not established.
            with _DATEPARSER_LOCK:
                parsed_date = dateparser.parse(
                    text,
                    languages=list(DEADLINE_LANGUAGES) if DEADLINE_LANGUAGES else None,
                    settings={
                        'PREFER_DAY_OF_MONTH': 'first',
                        'RELATIVE_BASE': datetime.now(),
                        'DATE_ORDER': 'DMY',  # Day-Month-Year (common in international formats)
                        'PREFER_DATES_FROM': 'future'  # Prefer future dates for deadlines
                    }
                )
            
            if parsed_date:
                # PREFER_DATES_FROM future puts a two-digit year in the next century:
                # "Dec-6-25" would be 2125-12-06. A page writing "25" means 2025.
                if parsed_date.year >= 2100 and not _FOUR_DIGITS.search(text):
                    parsed_date = parsed_date.replace(year=parsed_date.year - 100)
                return parsed_date.strftime('%Y-%m-%d')
        except ImportError:
            logger.warning("dateparser not available, falling back to regex parsing")
        except Exception as e:
            logger.debug(f"dateparser failed for '{text}': {e}")
        
        # Fallback: Try regex patterns for common formats
        import re
        from datetime import datetime
        
        # Format: DD-MMM-YYYY or DD/MMM/YYYY (e.g., "12-DEC-2025")
        mmm_pattern = r'(\d{1,2})[-/]([A-Z]{3,})[-/](\d{2,4})'
        match = re.search(mmm_pattern, text.upper())
        if match:
            day, month_str, year = match.groups()
            month_map = {
                'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
                'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
            }
            if month_str in month_map:
                try:
                    year_int = int(year)
                    if year_int < 100:
                        year_int += 2000 if year_int < 50 else 1900
                    date_obj = datetime(year_int, month_map[month_str], int(day))
                    return date_obj.strftime('%Y-%m-%d')
                except:
                    pass
        
        # Format: DD/MM/YYYY or DD-MM-YYYY
        numeric_pattern = r'(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})'
        match = re.search(numeric_pattern, text)
        if match:
            day, month, year = match.groups()
            try:
                year_int = int(year)
                if year_int < 100:
                    year_int += 2000 if year_int < 50 else 1900
                date_obj = datetime(year_int, int(month), int(day))
                return date_obj.strftime('%Y-%m-%d')
            except:
                pass
        
        # Format: DD Month YYYY (e.g., "10 December 2025")
        month_names = [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december'
        ]
        month_abbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        
        for i, month_name in enumerate(month_names + month_abbrevs, 1):
            pattern = rf'(\d{{1,2}})\s+{month_name}\s+(\d{{2,4}})'
            match = re.search(pattern, text.lower())
            if match:
                day, year = match.groups()
                try:
                    year_int = int(year)
                    if year_int < 100:
                        year_int += 2000 if year_int < 50 else 1900
                    month_num = (i - 1) % 12 + 1
                    date_obj = datetime(year_int, month_num, int(day))
                    return date_obj.strftime('%Y-%m-%d')
                except:
                    pass
        
        # If already in YYYY-MM-DD format, return as-is
        if re.match(r'^\d{4}-\d{2}-\d{2}$', text):
            return text
        
        # If we can't parse it, return None (don't save unparseable dates)
        logger.debug(f"Could not parse deadline: {text}")
        return None
    
    def _validate_sql_construction(self, fields: List[str], values: List, placeholders: List[str], sql_values: List, operation: str = "INSERT") -> None:
        """
        Validate SQL construction to catch bugs like duplicate fields or mismatched counts.
        
        Raises ValueError if validation fails.
        """
        # Check for duplicate fields
        field_set = set(fields)
        if len(field_set) != len(fields):
            duplicates = [f for f in fields if fields.count(f) > 1]
            raise ValueError(f"{operation} has duplicate fields: {set(duplicates)}")
        
        # Check field/placeholder count match
        if len(fields) != len(placeholders):
            raise ValueError(f"{operation} field/placeholder mismatch: {len(fields)} fields, {len(placeholders)} placeholders")
        
        # Check placeholder/value count match (accounting for NOW() placeholders)
        now_count = sum(1 for p in placeholders if p == "NOW()")
        expected_sql_values = len(values) - now_count
        if len(sql_values) != expected_sql_values:
            raise ValueError(f"{operation} placeholder/value mismatch: {len(placeholders)} placeholders ({now_count} NOW()), {len(values)} total values, {len(sql_values)} SQL values (expected {expected_sql_values})")
        
        # Check that NOW() placeholders align with "NOW()" values
        for i, (val, placeholder) in enumerate(zip(values, placeholders)):
            if val == "NOW()" and placeholder != "NOW()":
                raise ValueError(f"{operation} NOW() value at index {i} doesn't match placeholder '{placeholder}'")
            if placeholder == "NOW()" and val != "NOW()":
                raise ValueError(f"{operation} NOW() placeholder at index {i} doesn't match value '{val}'")
    
    def save_jobs(
        self,
        jobs: List[Dict],
        source_id: str,
        org_name: str,
        base_url: Optional[str] = None,
        *,
        run_token: Optional[str] = None,
        loop=None,
        thin: Optional[List[Dict]] = None,
    ) -> Dict:
        """
        Save jobs as the run that owns the source, one savepoint per job.

        Without a token, or with one that is not a running run of this source, nothing is
        written and OwnershipLost is raised. A database error on one job rolls back that job
        only and counts it as failed. loop, when given, is the event loop that schedules the
        search projection (this method runs in a worker thread). thin: the listing rows
        admission rejected as too thin; each that is a saved job of the source is observed
        (W-36), in the same transaction, after the admitted rows.

        Returns:
            Dict with counts: {inserted, updated, skipped, failed, validated, observed, ...}
        """
        if not run_token:
            raise OwnershipLost("save_jobs needs a run token")
        thin = list(thin or [])
        logger.info(f"save_jobs called: {len(jobs)} jobs, source_id={source_id}, org_name={org_name}")
        
        # DEBUG: Log extracted jobs before validation
        logger.info(f"DEBUG: Extracted {len(jobs)} jobs before validation: {[j.get('title', '<no title>')[:80] for j in jobs[:5]]}")
        
        if not jobs and not thin:
            logger.warning("save_jobs called with empty jobs list")
            return {'inserted': 0, 'updated': 0, 'skipped': 0, 'failed': 0, 'validated': 0}
        
        # TEMPORARY: Skip validation entirely - just do basic checks
        validation_skipped = 0
        valid_jobs = []
        for job in jobs:
            # Ensure apply_url exists - use fallback if missing
            if not job.get('apply_url'):
                # Try to find URL in job data
                if job.get('url'):
                    job['apply_url'] = job['url']
                elif job.get('detail_url'):
                    job['apply_url'] = job['detail_url']
                elif job.get('source_url'):
                    job['apply_url'] = job['source_url']
                else:
                    # Last resort: use base_url if provided, otherwise placeholder
                    if base_url:
                        job['apply_url'] = base_url
                        logger.debug(f"Job missing apply_url, using base_url as fallback: {job.get('title', '')[:50]}")
                    else:
                        # Ultimate fallback: placeholder
                        job['apply_url'] = f"https://placeholder.missing-url/{abs(hash(job.get('title', '')))}"
                        logger.warning(f"Job missing apply_url and no base_url provided, using placeholder: {job.get('title', '')[:50]}")
            
            # Validation: relaxed in shadow mode
            min_title_len = 1 if self.shadow_mode else 3
            if job.get('title') and job.get('apply_url') and len(job.get('title', '')) >= min_title_len:
                valid_jobs.append(job)
            else:
                validation_skipped += 1
                logger.warning(f"Skipping job: title_missing={not bool(job.get('title'))}, apply_url_missing={not bool(job.get('apply_url'))}, title_len={len(job.get('title', ''))}")
        
        jobs = valid_jobs
        
        if validation_skipped > 0:
            logger.warning(f"Basic validation: {validation_skipped} jobs skipped, {len(jobs)} valid")
        
        if not jobs and not thin:
            logger.warning(f"No valid jobs to save after validation (had {len(jobs) + validation_skipped} total)")
            return {
                'inserted': 0, 
                'updated': 0, 
                'skipped': validation_skipped, 
                'failed': 0,
                'validated': 0,
                'unrecorded': validation_skipped,
            }
        
        inserted = 0
        observed = 0
        updated = 0
        skipped = validation_skipped
        # Rows handed in whose sighting was not recorded: a crawl with any does not count
        # (contract §6). A hidden job seen again is recorded, so it is not one of them.
        unrecorded = validation_skipped
        failed = 0
        attempted = 0  # jobs that reached their write, or failed on the way to it
        seen_active = []  # ids of open jobs matched, for the run's lifecycle record
        not_open = []
        returned = []  # ids of expired jobs this save made open again (contract §6)
        recorded = []
        failed_inserts = []  # Track failed inserts for logging
        
        logger.info(f"Saving {len(jobs)} jobs to database for source {source_id} ({org_name})")
        
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                open_on = confirm_running(cur, run_token, source_id)
                for job in jobs:
                    in_savepoint = False
                    recorded_mark = len(recorded)
                    seen_mark = len(seen_active)
                    not_open_mark = len(not_open)
                    returned_mark = len(returned)
                    try:
                        title = job.get('title', '').strip()
                        apply_url = job.get('apply_url', '').strip()
                        location = job.get('location_raw', '').strip()
                        deadline_str = job.get('deadline', '').strip()
                        
                        # Geocoding fields (Phase 4)
                        latitude = job.get('latitude')
                        longitude = job.get('longitude')
                        geocoding_source = job.get('geocoding_source')
                        is_remote = job.get('is_remote', False)
                        country = (job.get('country') or '').strip() or None
                        country_iso = (job.get('country_iso') or '').strip() or None
                        city = (job.get('city') or '').strip() or None
                        
                        # Quality scoring fields (Phase 4)
                        quality_score = job.get('quality_score')
                        quality_grade = job.get('quality_grade')
                        quality_factors = job.get('quality_factors')
                        quality_issues = job.get('quality_issues', [])
                        needs_review = job.get('needs_review', False)
                        
                        if not title or not apply_url:
                            reason = f"Missing title or URL (title: {title[:50] if title else 'None'}, url: {apply_url[:50] if apply_url else 'None'})"
                            logger.warning(f"Skipping job: {reason}")
                            skipped += 1
                            unrecorded += 1
                            failed_inserts.append({
                                'title': title[:100] if title else None,
                                'apply_url': apply_url[:200] if apply_url else None,
                                'error': reason,
                                'payload': {k: str(v)[:200] for k, v in job.items()}
                            })
                            continue
                        
                        # Additional validation before insertion
                        # Check if title is too short or looks invalid (relaxed in shadow mode)
                        min_title_len = 1 if self.shadow_mode else 3
                        if len(title) < min_title_len:
                            reason = f"Title too short: {title[:50]}"
                            logger.warning(f"Skipping job: {reason}")
                            skipped += 1
                            unrecorded += 1
                            failed_inserts.append({
                                'title': title[:100],
                                'apply_url': apply_url[:200],
                                'error': reason,
                                'payload': {k: str(v)[:200] for k, v in job.items()}
                            })
                            continue
                        
                        # Check for invalid URL patterns
                        if apply_url.startswith('#') or apply_url.startswith('javascript:'):
                            reason = f"Invalid URL: {apply_url[:50]}"
                            logger.debug(f"Skipping job: {reason}")
                            skipped += 1
                            unrecorded += 1
                            failed_inserts.append({
                                'title': title[:100],
                                'apply_url': apply_url[:200],
                                'error': reason,
                                'rejected_reason': 'invalid_url_pattern',
                                'payload': {k: str(v)[:200] for k, v in job.items()}
                            })
                            continue
                        
                        # Parse deadline if present
                        deadline_date = None
                        if deadline_str:
                            # If already in YYYY-MM-DD format, use it
                            if re.match(r'^\d{4}-\d{2}-\d{2}$', deadline_str):
                                deadline_date = deadline_str
                            else:
                                # Try to parse it
                                deadline_date = self._parse_deadline(deadline_str)
                                # Only use if it's in YYYY-MM-DD format
                                if deadline_date and not re.match(r'^\d{4}-\d{2}-\d{2}$', deadline_date):
                                    deadline_date = None  # Don't save unparseable dates
                        
                        observed_at = datetime.now(timezone.utc)
                        candidate = {
                            "title": title,
                            "apply_url": apply_url,
                            "source_id": source_id,
                            "org_name": org_name,
                        }
                        if "location_raw" in job:
                            candidate["location_raw"] = location
                        if "description_snippet" in job:
                            candidate["description_snippet"] = job.get("description_snippet")
                        if deadline_date:
                            candidate["deadline"] = deadline_date
                        elif "deadline" in job and not deadline_str:
                            candidate["deadline"] = None
                        if "country" in job:
                            candidate["country"] = country
                        if "country_iso" in job:
                            candidate["country_iso"] = country_iso
                        if "city" in job:
                            candidate["city"] = city
                        if "is_remote" in job:
                            candidate["is_remote"] = is_remote
                        # Captured fields (W-37): added only when published, so a job page
                        # that was not opened never clears what is stored.
                        description = clean_description(job.get("description"))
                        if description:
                            candidate["description"] = description
                        posted_on = posted_day(job.get("posted_on"), observed_at.date())
                        if posted_on:
                            candidate["posted_on"] = posted_on
                        locations = clean_locations(job.get("locations"))
                        if locations is None and location and not job.get("page_not_read"):
                            locations = clean_locations([location])
                        if locations:
                            candidate["locations"] = locations
                        for field_name, published in (
                            ("contract_type", job.get("employment_type")),
                            ("salary_range_text", job.get("salary_range_text") or job.get("salary_raw")),
                            ("advert_language", job.get("advert_language")),
                        ):
                            text = clean_short_text(published)
                            if text:
                                candidate[field_name] = text
                        for field_name in (
                            "latitude",
                            "longitude",
                            "geocoding_source",
                            "quality_score",
                            "quality_grade",
                            "quality_factors",
                            "quality_issues",
                            "needs_review",
                        ):
                            if field_name in job and job[field_name] is not None:
                                candidate[field_name] = job[field_name]
                        if any(name in candidate for name in ("latitude", "longitude", "geocoding_source")):
                            candidate["geocoded_at"] = observed_at
                        if any(
                            name in candidate
                            for name in (
                                "quality_score",
                                "quality_grade",
                                "quality_factors",
                                "quality_issues",
                                "needs_review",
                            )
                        ):
                            candidate["quality_scored_at"] = observed_at
                        if job.get("page_not_read"):
                            # A saved job whose page this crawl did not read: its listing row
                            # never clears what the page gave (crawler plan, C3 and C4
                            # amendment), and a listing's "not remote" is no reading at all.
                            candidate = {
                                name: value for name, value in candidate.items()
                                if value not in (None, "", [])
                                and not (name == "is_remote" and value is not True)
                            }
                        if job.get("admitted") is True:
                            candidate["admitted"] = True
                        cur.execute("SAVEPOINT job_save")
                        in_savepoint = True
                        attempted += 1
                        outcome = persist_candidate(
                            cur,
                            candidate,
                            observed_at=observed_at,
                            heuristics=self.use_global_heuristics,
                            reference=job.get("reference"),
                            source_id=source_id,
                            org_name=org_name,
                            recorded=recorded,
                            seen=seen_active,
                            not_open=not_open,
                            open_on=open_on,
                            returned=returned,
                        )
                        cur.execute("RELEASE SAVEPOINT job_save")
                        in_savepoint = False
                        if outcome == "created":
                            inserted += 1
                        elif outcome == "updated":
                            updated += 1
                        elif outcome == "unchanged":
                            logger.debug("Job unchanged, last_seen_at only: %s", title[:80])
                        else:
                            skipped += 1
                            if outcome != "seen_again":
                                unrecorded += 1
                            failed_inserts.append({
                                "title": title[:100],
                                "apply_url": apply_url[:200],
                                "error": outcome,
                                "payload": {k: str(v)[:200] for k, v in job.items()},
                                "operation": outcome,
                            })

                    except Exception as e:
                        # This job only: roll back to its savepoint and drop what it recorded.
                        if in_savepoint:
                            cur.execute("ROLLBACK TO SAVEPOINT job_save")
                            del recorded[recorded_mark:]
                            del seen_active[seen_mark:]
                            del not_open[not_open_mark:]
                            del returned[returned_mark:]
                        else:
                            attempted += 1
                        error_msg = f"Unexpected error processing job: {stored_text(e)}"
                        logger.error(f"Error processing job: {error_msg}")
                        failed += 1
                        failed_inserts.append({
                            'title': job.get('title', 'Unknown')[:100],
                            'apply_url': job.get('apply_url', 'Unknown')[:200],
                            'error': error_msg,
                            'payload': {k: str(v)[:200] for k, v in job.items()},
                            'operation': 'process'
                        })

                # The observation path (W-36): read after the admitted rows, so what they saved
                # is what the thin rows are matched against. If that read fails, the admitted
                # rows stand and no thin row is recorded as seen.
                by_link = {}
                if thin:
                    cur.execute("SAVEPOINT job_observe_read")
                    try:
                        by_link = observable_jobs(cur, source_id)
                        cur.execute("RELEASE SAVEPOINT job_observe_read")
                    except Exception as e:
                        cur.execute("ROLLBACK TO SAVEPOINT job_observe_read")
                        logger.error("Saved jobs not read for observation: %s", redact_exception(e))
                        unrecorded += len(thin)
                        thin = []
                for row in thin:
                    seen_mark = len(seen_active)
                    not_open_mark = len(not_open)
                    returned_mark = len(returned)
                    cur.execute("SAVEPOINT job_observe")
                    attempted += 1
                    try:
                        outcome = observe_known(
                            cur,
                            row,
                            by_link,
                            observed_at=datetime.now(timezone.utc),
                            source_id=source_id,
                            open_on=open_on,
                            seen=seen_active,
                            not_open=not_open,
                            returned=returned,
                        )
                        cur.execute("RELEASE SAVEPOINT job_observe")
                    except Exception as e:
                        cur.execute("ROLLBACK TO SAVEPOINT job_observe")
                        del seen_active[seen_mark:]
                        del not_open[not_open_mark:]
                        del returned[returned_mark:]
                        failed += 1
                        logger.error("Error observing a known job: %s", redact_exception(e))
                        continue
                    if outcome == "observed":
                        observed += 1
                    elif outcome == "ambiguous":
                        # A saved job was listed, but which one cannot be told: not recorded.
                        unrecorded += 1
                
                commit_and_schedule(conn, recorded, loop=loop)
                logger.info(f"Successfully saved jobs: {inserted} inserted, {updated} updated, {observed} observed, {skipped} skipped, {failed} failed")
        
        except Exception as e:
            logger.error(f"Error saving jobs (batch): {redact_exception(e)}", exc_info=True)
            if conn:
                conn.rollback()
            # Re-raise to see the actual error
            raise
        finally:
            if conn:
                conn.close()
        
        # Log failed inserts summary and to database (Phase 2)
        if failed_inserts:
            logger.warning(f"Failed to save {len(failed_inserts)} jobs for {org_name} (source_id: {source_id})")
            # Log first 5 failures in detail
            for i, failed_job in enumerate(failed_inserts[:5]):
                logger.warning(f"  Failed job {i+1}: {failed_job.get('title', 'Unknown')} - {failed_job.get('error', 'Unknown error')}")
            if len(failed_inserts) > 5:
                logger.warning(f"  ... and {len(failed_inserts) - 5} more failures")
            
            # Log to database via extraction_logger
            if self.extraction_logger:
                for failed_job in failed_inserts:
                    self.extraction_logger.log_failed_insert(
                        source_url=failed_job.get('apply_url', ''),
                        error=failed_job.get('error', 'Unknown error'),
                        source_id=source_id,
                        payload=failed_job.get('payload'),
                        operation=failed_job.get('operation', 'insert')
                    )
        
        # Update metrics for monitoring
        try:
            from metrics import incr_failed, incr_inserted, incr_skipped, incr_updated
            incr_inserted(inserted)
            incr_updated(updated)
            incr_skipped(skipped)
            incr_failed(failed)
        except Exception as e:
            logger.warning(f"Failed to update metrics: {e}")
        
        return {
            'inserted': inserted, 
            'updated': updated, 
            'skipped': skipped, 
            'failed': failed,
            'validated': len(jobs) if 'jobs' in locals() else 0,
            'attempted': attempted,
            'unrecorded': unrecorded,
            'observed': observed,
            'seen_active': seen_active,
            'not_open_ids': not_open,
            'created_ids': created_ids(recorded),
            'returned_ids': returned,
        }
    
    def _saved_jobs_for_pages(self, source_id: str, run_token) -> Tuple[Dict, int, Any]:
        """For choosing job pages, read only: the source's saved jobs by normalised link, its
        crawl count (the rotation's turn), and the day the run started on as the database dates
        it. Run in a worker thread."""
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout = '30s'")
                cur.execute(
                    "SELECT id, apply_url, deadline, deleted_at FROM jobs WHERE source_id = %s",
                    (str(source_id),),
                )
                saved: Dict[str, List[SavedJob]] = {}
                for job_id, apply_url, deadline, deleted_at in cur.fetchall():
                    saved.setdefault(link_key(apply_url), []).append(
                        saved_job(job_id, deadline, hidden=deleted_at is not None)
                    )
                cur.execute(
                    "SELECT COUNT(*), (SELECT ran_at::date FROM crawl_logs WHERE id = %s)"
                    " FROM crawl_logs WHERE source_id = %s",
                    (str(run_token), str(source_id)),
                )
                run_number, run_day = cur.fetchone()
            conn.rollback()
            return saved, int(run_number or 0), run_day
        finally:
            conn.close()

    def _previous_listing_ids_hash(self, source_id: str) -> Optional[str]:
        """Hash from the latest finished complete crawl, or None when that row has none.

        The latest complete run wins even if its hash is null (empty URL set / pre-migration):
        skipping null rows would early-stop against an older fingerprint (W-39 D8).
        Connection failures return None (no early-stop); they must not fail the crawl.
        """
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout = '30s'")
                cur.execute(
                    """
                    SELECT listing_ids_hash
                    FROM crawl_logs
                    WHERE source_id = %s
                      AND listing_complete IS TRUE
                      AND status IS DISTINCT FROM 'running'
                    ORDER BY ran_at DESC
                    LIMIT 1
                    """,
                    (str(source_id),),
                )
                rows = cur.fetchall()
            conn.rollback()
            return previous_complete_listing_hash(rows)
        except Exception as e:
            logger.debug("Previous listing hash not read: %s", redact_exception(e))
            return None
        finally:
            if conn is not None:
                conn.close()

    def _enrich_job_from_detail_sync(self, job: Dict, html: str) -> Dict:
        """Parse a fetched detail page (worker thread)."""
        job['page_read'] = True

        soup = BeautifulSoup(html, 'html.parser')
        
        # UNICEF-specific extraction patterns
        if 'unicef.org' in job['apply_url'].lower():
            # Extract from detail page structure
            # Look for structured fields: Job no, Contract type, Duty Station, Level, Location, Categories
            
            # Extract Location (preferred: Duty Station, fallback: Location)
            location_found = False
            
            # Approach 1: Look for "Duty Station:" (preferred)
            duty_station_elem = soup.find(string=re.compile(r'Duty Station[:\s]*', re.IGNORECASE))
            if duty_station_elem:
                parent = duty_station_elem.parent
                # Get next sibling or parent text
                if parent:
                    next_sibling = parent.find_next_sibling()
                    if next_sibling:
                        location_text = next_sibling.get_text().strip()
                    else:
                        # Try to find the value in the same parent
                        location_text = parent.get_text().replace('Duty Station:', '').replace('Duty Station', '').strip()
                    
                    if location_text and len(location_text) >= 3 and len(location_text) < 100:
                        # Clean up
                        location_text = re.sub(r'<[^>]+>', '', location_text).strip()
                        location_text = re.sub(r'\s+', ' ', location_text)
                        if location_text.lower() not in ['n/a', 'na', 'tbd']:
                            job['location_raw'] = location_text
                            location_found = True
            
            # Approach 2: Look for "Location:" field
            if not location_found:
                location_elem = soup.find(string=re.compile(r'^Location[:\s]*', re.IGNORECASE))
                if location_elem:
                    parent = location_elem.parent
                    if parent:
                        next_sibling = parent.find_next_sibling()
                        if next_sibling:
                            location_text = next_sibling.get_text().strip()
                        else:
                            location_text = parent.get_text().replace('Location:', '').replace('Location', '').strip()
                        
                        if location_text and len(location_text) >= 3 and len(location_text) < 100:
                            location_text = re.sub(r'<[^>]+>', '', location_text).strip()
                            location_text = re.sub(r'\s+', ' ', location_text)
                            if location_text.lower() not in ['n/a', 'na', 'tbd']:
                                job['location_raw'] = location_text
                                location_found = True
            
            # Extract Deadline
            deadline_found = False
            
            # Look for "Deadline:" in detail page
            deadline_elem = soup.find(string=re.compile(r'Deadline[:\s]*', re.IGNORECASE))
            if deadline_elem:
                parent = deadline_elem.parent
                if parent:
                    # Get deadline text
                    deadline_text = parent.get_text()
                    # Extract date pattern: "10 Dec 2025 11:55 PM" or "10 Dec 2025"
                    deadline_match = re.search(r'(\d{1,2}\s+\w{3}\s+\d{4})', deadline_text, re.IGNORECASE)
                    if deadline_match:
                        deadline_cleaned = self._parse_deadline(deadline_match.group(1))
                        if deadline_cleaned:
                            job['deadline'] = deadline_cleaned
                            deadline_found = True
            
            # Also check for deadline in structured data fields
            if not deadline_found:
                # Look for "Closing date" or similar
                closing_elem = soup.find(string=re.compile(r'Closing[:\s]*|Apply by[:\s]*', re.IGNORECASE))
                if closing_elem:
                    parent = closing_elem.parent
                    if parent:
                        deadline_text = parent.get_text()
                        deadline_match = re.search(r'(\d{1,2}\s+\w{3}\s+\d{4})', deadline_text, re.IGNORECASE)
                        if deadline_match:
                            deadline_cleaned = self._parse_deadline(deadline_match.group(1))
                            if deadline_cleaned:
                                job['deadline'] = deadline_cleaned
                                deadline_found = True
        
        # UNDP-specific extraction patterns
        elif 'undp.org' in job['apply_url'].lower():
            # Pattern 1: Consultancies page structure
            # Look for "DEADLINE:" label - try multiple approaches
            deadline_found = False
            
            # Approach 1: Find text node with "DEADLINE:"
            deadline_elem = soup.find(string=re.compile(r'DEADLINE:', re.IGNORECASE))
            if deadline_elem:
                parent = deadline_elem.parent
                # Try to find next sibling or parent's next sibling
                next_sibling = parent.find_next_sibling() if parent else None
                if next_sibling:
                    deadline_text = next_sibling.get_text()
                else:
                    deadline_text = parent.get_text() if parent else ''
                
                # Extract date part (e.g., "03-Dec-25" or "03-Dec-25 @ 03:00 PM")
                deadline_match = re.search(r'(\d{1,2}[-/]\w{3}[-/]\d{2,4})', deadline_text, re.IGNORECASE)
                if deadline_match:
                    deadline_cleaned = self._parse_deadline(deadline_match.group(1))
                    if deadline_cleaned:
                        job['deadline'] = deadline_cleaned
                        deadline_found = True
            
            # Approach 2: Look for "Apply Before:" (regular jobs)
            if not deadline_found:
                apply_before = soup.find(string=re.compile(r'Apply Before:', re.IGNORECASE))
                if apply_before:
                    parent = apply_before.parent
                    if parent:
                        deadline_text = parent.get_text()
                        # Extract date (e.g., "12/04/2025")
                        deadline_match = re.search(r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})', deadline_text)
                        if deadline_match:
                            deadline_cleaned = self._parse_deadline(deadline_match.group(1))
                            if deadline_cleaned:
                                job['deadline'] = deadline_cleaned
                                deadline_found = True
            
            # Location extraction
            location_found = False
            
            # Approach 1: Look for "OFFICE:" (consultancies)
            office_elem = soup.find(string=re.compile(r'OFFICE:', re.IGNORECASE))
            if office_elem:
                parent = office_elem.parent
                next_sibling = parent.find_next_sibling() if parent else None
                if next_sibling:
                    office_text = next_sibling.get_text()
                else:
                    office_text = parent.get_text() if parent else ''
                
                # Extract location (e.g., "UNDP-COL - COLOMBIA" -> "COLOMBIA")
                # Try pattern: "UNDP-XXX - COUNTRY" or just "COUNTRY"
                location_match = re.search(r'OFFICE:\s*[^-]*-?\s*([A-Z][A-Z\s]+)', office_text, re.IGNORECASE)
                if location_match:
                    location = location_match.group(1).strip()
                    if location and len(location) >= 3:
                        job['location_raw'] = location
                        location_found = True
            
            # Approach 2: Look for "Locations:" (regular jobs)
            if not location_found:
                locations_elem = soup.find(string=re.compile(r'Locations?:', re.IGNORECASE))
                if locations_elem:
                    parent = locations_elem.parent
                    next_sibling = parent.find_next_sibling() if parent else None
                    if next_sibling:
                        location_text = next_sibling.get_text()
                    else:
                        location_text = parent.get_text() if parent else ''
                    
                    # Extract location (e.g., "Kyiv, Ukraine")
                    location_match = re.search(r'Locations?:\s*([^\n\r<]+)', location_text, re.IGNORECASE)
                    if location_match:
                        location = location_match.group(1).strip()
                        # Clean up any HTML or extra text
                        location = re.sub(r'<[^>]+>', '', location).strip()
                        if location and len(location) >= 3 and len(location) < 100:
                            job['location_raw'] = location
                            location_found = True
            
            # Approach 3: Look for location in title area (e.g., "DS - Kyiv")
            if not location_found and job.get('title'):
                title_location_match = re.search(r'DS\s*-\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)', job['title'], re.IGNORECASE)
                if title_location_match:
                    job['location_raw'] = title_location_match.group(1).strip()
                    location_found = True
            
            # Look for "Grade:" (e.g., "NPSA-9")
            grade_elem = soup.find(string=re.compile(r'Grade:', re.IGNORECASE))
            if grade_elem:
                parent = grade_elem.parent
                next_sibling = parent.find_next_sibling() if parent else None
                if next_sibling:
                    grade_text = next_sibling.get_text()
                else:
                    grade_text = parent.get_text() if parent else ''
                grade_match = re.search(r'Grade:\s*([^\n\r<]+)', grade_text, re.IGNORECASE)
                if grade_match:
                    grade = grade_match.group(1).strip()
                    if grade:
                        job['grade'] = grade
        
        else:
            try:
                listing_deadline = job.get('deadline')
                results, captured = read_detail_fields(html)
                job = apply_captured_fields(apply_detail_reading(job, results), captured)
                read_deadline = job.get('deadline')
                # Day-first, the order the save step uses for every deadline.
                if read_deadline and read_deadline != listing_deadline:
                    parsed_deadline = self._parse_deadline(read_deadline)
                    if parsed_deadline:
                        job['deadline'] = parsed_deadline
            except Exception as reader_error:
                logger.warning(
                    "Detail reader left %s unchanged: %s",
                    job.get("apply_url"),
                    reader_error,
                )
        
        return job

    async def enrich_job_from_detail_page(self, job: Dict, base_url: str) -> Dict:
        """
        Enrich job data by fetching and parsing the detail page.
        
        This extracts rich metadata like deadline, location, grade, etc.
        that's only available on the individual job detail pages.
        """
        if not job.get('apply_url'):
            return job

        try:
            status, html, stop = await self._fetch_page(job['apply_url'])
            if stop or status != 200:
                logger.warning(
                    "Detail page not read: %s (%s)", job['apply_url'], stop or f"HTTP {status}"
                )
                return job
            return await asyncio.to_thread(self._enrich_job_from_detail_sync, job, html)
        except Exception as e:
            logger.warning(f"Error enriching job from detail page {job.get('apply_url')}: {e}")
        
        return job
    
    async def _listing_jobs(
        self, html: str, careers_url: str
    ) -> Tuple[List[Dict], Optional[Dict]]:
        """(jobs, listing report), from the first of the HTML readers (crawler_v2/readers.py)
        that reads rows: PageUp's job cards and the Sites engine's, page by page, each with a
        report; any other page goes to the rule-based reader, which always reports (W-39).
        The reader is chosen by what the page shows, never by its address.

        The report is returned, never stored on the crawler: one instance serves concurrent
        crawls. The reader's name and strategy go to this crawl's own context.
        """
        result = await read_listing(
            html_readers(self), Response(200, html), {"careers_url": careers_url}
        )
        LISTING_READER.set(result.reader)
        LISTING_STRATEGY.set(result.strategy)
        return result.jobs, result.report()

    async def _sites_listing_jobs(
        self, first_html: str, careers_url: str, fetch=None
    ) -> Tuple[List[Dict], Optional[Dict]]:
        """A "Sites" engine career site (W-55): page one's cards, then page one again at the
        reader's page size, then the site's own next-page links, one request at a time. All
        pages form one batch. ([], None) when the page is not such a site; no request then.

        A failed or refused page keeps the jobs already read and ends the walk as partial. The
        total is page one's: if a later page states another, the listing changed during the walk
        (a job closed or opened, and the pages shifted), so the walk is partial. Only a walk
        that ran out of next-page links, followed every one it found, and read exactly the
        stated total is complete; no stated total is partial. Later pages come from `fetch`
        (url -> (status, html, stop)), or this crawler's `_fetch_listing_page` when None.
        """
        from crawler.plugins.sites_engine import resized_url
        fetch_page = fetch or self._fetch_listing_page
        first = await asyncio.to_thread(_sites_page_sync, first_html, careers_url)
        if not first.is_sites or not first.jobs:
            return [], None
        jobs = _first_row_per_link(first.jobs)
        seen = {job.get('apply_url') for job in jobs}
        expected = first.total
        pages = 1
        stop = _SITES_COMPLETE_STOP
        if first.next_refused:
            stop = f'next-page link not followed on {careers_url}'
        next_url = resized_url(careers_url) if first.next_url else None
        resized = next_url is not None
        if next_url is None:
            next_url = first.next_url
        while next_url is not None and stop == _SITES_COMPLETE_STOP:
            if pages >= _PAGEUP_PAGE_CAP:
                stop = f'page cap {_PAGEUP_PAGE_CAP}'
                break
            status, page_html, page_stop = await fetch_page(next_url)
            if page_stop:
                stop = f'{_stop_text(page_stop)} on {next_url}'
                break
            if status != 200 or not page_html:
                stop = f'HTTP {status} on {next_url}'
                break
            pages += 1
            page = await asyncio.to_thread(_sites_page_sync, page_html, next_url)
            new_jobs = [job for job in _first_row_per_link(page.jobs)
                        if job.get('apply_url') not in seen]
            if not new_jobs and not (resized and page.jobs and page.next_url):
                stop = f'{next_url} added no new jobs'
                break
            seen.update(job.get('apply_url') for job in new_jobs)
            jobs.extend(new_jobs)
            if page.total is not None and expected is not None and page.total != expected:
                stop = f'total changed from {expected} to {page.total} on {next_url}'
                break
            if page.next_refused:
                stop = f'next-page link not followed on {next_url}'
                break
            next_url, resized = page.next_url, False
        if stop == _SITES_COMPLETE_STOP:
            if expected is None:
                stop = 'expected total unknown'
            elif len(jobs) < expected:
                stop = f'read {len(jobs)} of {expected} jobs'
            elif len(jobs) > expected:
                stop = f'read {len(jobs)} jobs, more than the stated {expected}'
        logger.info(
            "Sites listing: %s pages, %s jobs, expected %s, stopped: %s",
            pages, len(jobs), expected if expected is not None else 'unknown', stop,
        )
        report = {
            'pages': pages,
            'expected': expected,
            'complete': stop == _SITES_COMPLETE_STOP,
            'stop': stop,
        }
        return jobs, report

    async def _pageup_listing_jobs(
        self, first_html: str, careers_url: str, fetch=None
    ) -> Tuple[List[Dict], Optional[Dict]]:
        """Read page one's job cards, ask for page one again at the reader's page size, then
        follow the More Jobs links page by page. All pages form one batch. ([], None) when the
        page shows no job cards; no request is made then.

        A failed later page keeps the jobs already read. Every later page must add new jobs,
        except the resized page one when it shows jobs and links on (the site kept its own
        page size). A More Jobs link that is not followed ends the walk as partial, unless it
        counts 0 jobs left, which ends the listing.
        Returns the jobs and the walk's report. Only a walk that ran out of links and read at
        least the site's own total is complete: a site that ignores the page size but keeps it
        in its links skips jobs while still running out of links. Later pages come from `fetch`
        (url -> (status, html, stop)), or this crawler's `_fetch_listing_page` when None.
        """
        fetch_page = fetch or self._fetch_listing_page
        (
            jobs,
            expected,
            next_url,
            resized,
            ends,
            more_blocked,
        ) = await asyncio.to_thread(_pageup_first_page_sync, first_html, careers_url)
        if not jobs:
            return [], None
        seen = {job.get('apply_url') for job in jobs}
        pages = 1
        stop = _LISTING_COMPLETE_STOP
        retry_used = False
        if more_blocked:
            stop = f'More Jobs link not followed on {careers_url}'
        while next_url is not None:
            if pages >= _PAGEUP_PAGE_CAP:
                stop = f'page cap {_PAGEUP_PAGE_CAP}'
                break
            status, page_html, page_stop = await fetch_page(next_url)
            retried_here = False
            if status in _PAGEUP_RETRY_STATUSES and not page_stop and not retry_used:
                # At most one retry in the whole crawl.
                retry_used = retried_here = True
                logger.info(
                    "PageUp listing: HTTP %s on %s, retrying once in %ss",
                    status, next_url, _PAGEUP_RETRY_DELAY,
                )
                await _sleep(_PAGEUP_RETRY_DELAY)
                status, page_html, page_stop = await fetch_page(next_url)
            if page_stop:
                stop = f'{_stop_text(page_stop)} on {next_url}'
                if retried_here:
                    stop += ' after one retry'
                break
            if status != 200 or not page_html:
                stop = f'HTTP {status} on {next_url}'
                if retried_here:
                    stop += ' after one retry'
                break
            pages += 1
            page_jobs, left, ends, following, has_more = await asyncio.to_thread(
                _pageup_follow_page_sync, page_html, next_url, careers_url
            )
            new_jobs = [job for job in page_jobs if job.get('apply_url') not in seen]
            if resized:
                if left is not None and page_jobs:
                    expected = len(page_jobs) + left
            if not new_jobs and not (resized and page_jobs and following):
                stop = f'page {pages} added no new jobs'
                break
            seen.update(job.get('apply_url') for job in new_jobs)
            jobs.extend(new_jobs)
            if following is None and not ends and has_more:
                stop = f'More Jobs link not followed on {next_url}'
                break
            next_url, resized = following, False
        if stop == _LISTING_COMPLETE_STOP:
            if expected is None:
                stop = 'expected total unknown'
            elif len(jobs) < expected:
                stop = f'read {len(jobs)} of {expected} jobs'
        logger.info(
            "PageUp listing: %s pages, %s jobs, expected %s, stopped: %s",
            pages, len(jobs), expected if expected is not None else 'unknown', stop,
        )
        report = {
            'pages': pages,
            'expected': expected,
            'complete': stop == _LISTING_COMPLETE_STOP,
            'stop': stop,
        }
        return jobs, report

    async def _successfactors_listing_jobs(
        self, first_html: str, careers_url: str, fetch=None
    ) -> Tuple[List[Dict], Optional[Dict]]:
        """A SuccessFactors career site's job tiles (growth plan, step 6): page one's tiles, then
        the site's own next-page link, or else its tile endpoint at the next start row, one GET at
        a time. ([], None) when the page shows no job tiles; no request is made then.

        A failed or refused page keeps the jobs already read and ends the walk as partial. A later
        page must state the same total (or none), and must add new jobs. Only a walk that reads
        exactly the stated total is complete; no stated total is partial. Later pages come from
        `fetch` (url -> (status, html, stop)), or this crawler's `_fetch_listing_page` when None.
        """
        from crawler.plugins.successfactors import tile_endpoint_url

        fetch_page = fetch or self._fetch_listing_page
        first = await asyncio.to_thread(_successfactors_page_sync, first_html, careers_url)
        if not first.is_tiles or not first.jobs:
            return [], None
        jobs = _first_row_per_link(first.jobs)
        seen = {job.get('apply_url') for job in jobs}
        expected = first.total
        page, endpoint = first, first.endpoint
        rows_read = first.tiles
        pages = 1
        stop = _SUCCESSFACTORS_COMPLETE_STOP
        if first.total_conflict:
            stop = f'stated totals disagree on {careers_url}'
        elif first.next_refused and expected is not None and len(jobs) < expected:
            # A link off the site matters only when more tiles are needed to reach the total.
            stop = f'next-page link not followed on {careers_url}'
        while (
            stop == _SUCCESSFACTORS_COMPLETE_STOP
            and expected is not None
            and len(jobs) < expected
        ):
            if page.next_url is not None:
                target = page.next_url
            else:
                target = tile_endpoint_url(endpoint, careers_url, rows_read)
                if target is None:
                    stop = f'no next-page address on {careers_url}'
                    break
            if pages >= _SUCCESSFACTORS_PAGE_CAP:
                stop = f'page cap {_SUCCESSFACTORS_PAGE_CAP}'
                break
            status, page_html, page_stop = await fetch_page(target)
            if page_stop:
                stop = f'{_stop_text(page_stop)} on {target}'
                break
            if status != 200 or not page_html:
                stop = f'HTTP {status} on {target}'
                break
            pages += 1
            page = await asyncio.to_thread(_successfactors_page_sync, page_html, target)
            if not page.is_tiles:
                stop = f'{target} shows no job tiles'
                break
            if page.total_conflict:
                stop = f'stated totals disagree on {target}'
                break
            if page.total is not None and page.total != expected:
                stop = f'total changed from {expected} to {page.total} on {target}'
                break
            new_jobs = [job for job in _first_row_per_link(page.jobs)
                        if job.get('apply_url') not in seen]
            if not new_jobs:
                stop = f'{target} added no new jobs'
                break
            seen.update(job.get('apply_url') for job in new_jobs)
            jobs.extend(new_jobs)
            rows_read += page.tiles
            endpoint = page.endpoint or endpoint
            if page.next_refused and len(jobs) < expected:
                stop = f'next-page link not followed on {target}'
        if stop == _SUCCESSFACTORS_COMPLETE_STOP:
            if expected is None:
                stop = 'expected total unknown'
            elif len(jobs) < expected:
                stop = f'read {len(jobs)} of {expected} jobs'
            elif len(jobs) > expected:
                stop = f'read {len(jobs)} jobs, more than the stated {expected}'
        logger.info(
            "SuccessFactors listing: %s pages, %s jobs, expected %s, stopped: %s",
            pages, len(jobs), expected if expected is not None else 'unknown', stop,
        )
        report = {
            'pages': pages,
            'expected': expected,
            'complete': stop == _SUCCESSFACTORS_COMPLETE_STOP,
            'stop': stop,
        }
        return jobs, report

    def _record_raw_page(self, careers_url: str, status: int, html: str, source_id: str):
        """Store the fetched page and its raw_pages row. Runs in a worker thread."""
        try:
            storage_path = self.html_storage.store(careers_url, html, source_id)
        except Exception as e:
            logger.warning(f"Error storing HTML: {e}")
            return None
        if not storage_path:
            return None
        try:
            conn = self._get_db_conn()
        except Exception as e:
            logger.warning(f"Error saving raw_page record: {redact_exception(e)}")
            return None
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO raw_pages (
                        url, status, storage_path, content_length, source_id, fetched_at
                    )
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    RETURNING id
                """, (careers_url, status, storage_path, len(html), source_id))
                raw_page_id = str(cur.fetchone()[0])
            conn.commit()
            return raw_page_id
        except Exception as e:
            logger.warning(f"Error saving raw_page record: {redact_exception(e)}")
            conn.rollback()
            return None
        finally:
            conn.close()

    async def crawl_source(self, source: Dict, run=None) -> Dict:
        """
        Crawl a single source as the given run (contracts.run_ownership.RunHandle).
        
        Args:
            source: Dict with id, org_name, careers_url, source_type
            run: the run that owns the source; saving without one is refused
        
        Returns:
            Dict with status, message, counts
        """
        source_id = str(source['id'])
        org_name = source.get('org_name', 'Unknown')
        careers_url = source['careers_url']
        source_type = source.get('source_type', 'html')
        _SOURCE_FOR_LOGS.set(source_id)
        LISTING_READER.set("unknown")
        LISTING_STRATEGY.set(None)
        listing_report = None
        detail_stop = ''
        
        logger.info(f"Crawling {org_name} ({source_type}): {careers_url}")
        
        try:
            if source_type == 'html':
                status, html, stop = await self._fetch_page(careers_url)
                
                # Store raw HTML (Phase 2)
                raw_page_id = None
                if self.html_storage and html:
                    raw_page_id = await asyncio.to_thread(
                        self._record_raw_page, careers_url, status, html, source_id
                    )
                
                # Only a 200 that is not a challenge is a listing (B4 record, rule 2). Any other
                # 2xx, a 401, 403 or 429, or a challenge is a refusal: the source stops.
                if stop or status != 200:
                    if stop.startswith('HTTP '):
                        message = f'Refused: {stop}'
                    elif stop:
                        message = f'Not fetched: {stop}'
                    else:
                        message = f'HTTP {status}'
                    if self.extraction_logger:
                        await asyncio.to_thread(
                            self.extraction_logger.log_extraction,
                            url=careers_url,
                            status='EMPTY',
                            source_id=source_id,
                            raw_page_id=raw_page_id,
                            reason=message,
                            job_count=0
                        )
                    return {
                        'status': 'failed',
                        'message': message,
                        'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0, 'failed': 0}
                    }
                
                # Extract jobs from listing page
                # Check if we should use new pipeline extractor (rollout)
                jobs = []
                logger.info(f"Starting job extraction for {org_name} (HTML length: {len(html)} chars)")
                
                # Check rollout config for new extractor
                use_new_extractor = False
                try:
                    from core.rollout_config import get_rollout_config
                    rollout_config = get_rollout_config()
                    use_new_extractor = rollout_config.should_use_new_extractor(careers_url)
                    if use_new_extractor:
                        logger.info(f"Using NEW pipeline extractor for {org_name} (domain in allowlist, rollout={rollout_config.rollout_percent}%)")
                except Exception as e:
                    logger.warning(f"Error checking rollout config: {e}, using default extraction")
                
                if use_new_extractor:
                    # Dormant rollout path (W-23). A2 does not offload its BeautifulSoup/
                    # classifier work; when this path is live again, wrap it like _listing_jobs.
                    try:
                        from pipeline.integration import PipelineAdapter
                        pipeline_adapter = PipelineAdapter(
                            db_url=self.db_url,
                            enable_ai=False,
                            shadow_mode=False,
                            enable_storage=False,
                        )
                        jobs = await pipeline_adapter.extract_jobs_from_html(html, careers_url)
                        logger.info(f"New pipeline extractor found {len(jobs)} jobs for {org_name}")
                    except Exception as e:
                        logger.error(f"New pipeline extractor failed: {e}, falling back to default", exc_info=True)
                        use_new_extractor = False  # Fall through to default
                
                if not use_new_extractor:
                    jobs, listing_report = await self._listing_jobs(html, careers_url)

                # Listing size before job-page caps hold rows back (canary rows_read, W-35).
                listing_row_count = len(jobs)
                # General HTML extracts navigation links alongside vacancies; count distinct
                # vacancies before choose_pages holds unconfirmed rows back so found and the
                # crawl message agree with listing_expected (W-39).
                general_vacancies = (
                    general_vacancy_count(jobs)
                    if LISTING_READER.get() == "general"
                    else None
                )
                listing_hash, listing_id_count = listing_ids_fingerprint(jobs)
                listing_complete = bool(
                    listing_report and listing_report.get("complete") is True
                )
                previous_hash = None
                if listing_complete and listing_hash and source_id:
                    previous_hash = await asyncio.to_thread(
                        self._previous_listing_ids_hash, source_id
                    )
                early_stop = early_stop_details(
                    listing_complete=listing_complete,
                    current_hash=listing_hash,
                    previous_hash=previous_hash,
                )
                
                logger.info(f"Job extraction complete: {len(jobs)} jobs extracted from listing page")
                
                if jobs:
                    logger.info(f"Sample job titles: {[j.get('title', 'No title')[:50] for j in jobs[:3]]}")
                else:
                    logger.warning(f"No jobs extracted from listing page for {org_name}")
                
                # Enrich jobs from detail pages (for UNDP, UNICEF, and other sites)
                # TEMPORARY: Skip enrichment for UNICEF due to 403 errors - save jobs from listing page only
                # Only enrich if we have a reasonable number of jobs (avoid timeout)
                # Skip enrichment for UNICEF since they're blocking with 403
                needs_enrichment = any('undp.org' in job.get('apply_url', '').lower() for job in jobs)
                skip_enrichment = any('unicef.org' in job.get('apply_url', '').lower() for job in jobs)
                # Early-stop (W-39): when the complete listing's URL set matches the previous
                # complete run, never open every page (including UNDP's open-all path); use the
                # normal new/deadline/rotation plan so sightings and counting stay honest.
                if early_stop and needs_enrichment:
                    logger.info(
                        "Early-stop: listing ids unchanged; UNDP open-all deferred to page plan"
                    )
                    needs_enrichment = False
                
                unconfirmed = []
                if skip_enrichment:
                    logger.info(f"Skipping detail page enrichment for {len(jobs)} UNICEF jobs (403 errors - will save from listing page only)")
                elif jobs:
                    if needs_enrichment:
                        logger.info(f"Enriching {len(jobs)} jobs from detail pages (UNDP requires detail page data)...")
                        to_open = {id(job) for job in jobs}
                    else:
                        # New vacancies' pages, within a cap; saved jobs' pages near their
                        # deadline or in rotation; the others read from the listing alone.
                        if run is None:
                            raise OwnershipLost("crawl_source needs the run that owns the source")
                        try:
                            saved, run_number, run_day = await asyncio.to_thread(
                                self._saved_jobs_for_pages, source_id, run.token
                            )
                        except Exception as e:
                            # Opening a page never writes; without the saved jobs every
                            # vacancy is treated as new, as before this plan.
                            logger.warning(
                                "Saved jobs not read for the job pages: %s", redact_exception(e)
                            )
                            saved, run_number, run_day = {}, 0, None
                        plan = choose_pages(
                            jobs,
                            page_verdicts(jobs, "html"),
                            saved,
                            today=run_day if isinstance(run_day, date) else date.today(),
                            run_number=run_number,
                        )
                        to_open = {id(jobs[index]) for index in plan.open}
                        # A saved job's listing row clears nothing its page gave, unless this
                        # crawl reads that page; the mark is lifted only once it has.
                        for index in plan.saved:
                            jobs[index]['page_not_read'] = True
                        unconfirmed = [jobs[index] for index in sorted(plan.unconfirmed)]
                        jobs = [job for index, job in enumerate(jobs) if index not in plan.unconfirmed]
                        if early_stop:
                            logger.info(
                                "Early-stop: listing ids unchanged; "
                                "%s to open (new/deadline/rotation), %s listing alone, %s held back",
                                len(to_open), len(plan.listing_only), len(unconfirmed),
                            )
                        else:
                            logger.info(
                                "Job pages: %s to open, %s read from the listing alone, %s held back",
                                len(to_open), len(plan.listing_only), len(unconfirmed),
                            )
                    
                    # The fetch policy spaces requests to one host; a refusal or a spent budget
                    # ends the job pages, and the rows not opened keep their listing fields.
                    budget = current_budget()
                    enriched_jobs = []
                    for i, job in enumerate(jobs):
                        if id(job) not in to_open:
                            enriched_jobs.append(job)
                            continue
                        stopped = budget.stopped() if budget is not None else ''
                        if stopped:
                            logger.warning(
                                "Job pages stopped (%s); %s rows keep their listing fields",
                                stopped, len(jobs) - i,
                            )
                            detail_stop = _budget_stop_text(budget)
                            enriched_jobs.extend(jobs[i:])
                            break
                        if job.get('apply_url'):
                            try:
                                enriched_job = await self.enrich_job_from_detail_page(job, careers_url)
                                if enriched_job.pop('page_read', False):
                                    enriched_job.pop('page_not_read', None)
                                enriched_jobs.append(enriched_job)
                            except Exception as e:
                                logger.warning(f"Error enriching job {job.get('title', 'unknown')}: {e}")
                                enriched_jobs.append(job)  # Use original job if enrichment fails
                        else:
                            enriched_jobs.append(job)
                    jobs = enriched_jobs
                    if not detail_stop and budget is not None and budget.refused:
                        detail_stop = _budget_stop_text(budget)
                if unconfirmed:
                    # New vacancies over the cap that the listing leaves too thin: not saved,
                    # read by a later crawl (crawler plan, C4).
                    await asyncio.to_thread(
                        log_admission_rejections,
                        self.extraction_logger,
                        [(job, "detail_unconfirmed") for job in unconfirmed],
                        source_id,
                    )
                
                for job in jobs:
                    place_job(job)
                
                # Score data quality (Phase 4)
                if self.quality_scorer and jobs:
                    scored_count = 0
                    for job in jobs:
                        try:
                            quality_result = self.quality_scorer.score_job(job)
                            job['quality_score'] = quality_result['score']
                            job['quality_grade'] = quality_result['grade']
                            job['quality_factors'] = quality_result['factors']
                            job['quality_issues'] = quality_result['issues']
                            job['needs_review'] = quality_result['needs_review']
                            scored_count += 1
                        except Exception as e:
                            logger.debug(f"Error scoring job {job.get('title', 'unknown')[:50]}: {e}")
                    
                    if scored_count > 0:
                        logger.info(f"Scored quality for {scored_count} job(s)")
                
                # Save to database. Admission sees the finished list and does not fetch.
                admitted, rejected = admit_batch(jobs, "html")
                await asyncio.to_thread(
                    log_admission_rejections, self.extraction_logger, rejected, source_id
                )
                if run is None:
                    raise OwnershipLost("crawl_source needs the run that owns the source")
                # Too-thin rows, and the rows held back over the cap, may be saved jobs seen.
                thin = [job for job, reason in rejected if too_thin(job, reason)] + unconfirmed
                counts = await run.save(
                    self.save_jobs, admitted, source_id, org_name, base_url=careers_url,
                    thin=thin,
                )
                
                # Canary (W-35): notes only; status and lifecycle unchanged.
                reader_name = LISTING_READER.get() or "unknown"
                readers = html_readers(self)
                previous_kept = previous_kept_from_logs(
                    lambda: self._previous_kept_row(source_id)
                )
                previous_reader = previous_reader_from_logs(
                    lambda: self._previous_reader_name(source_id)
                )
                canary_warnings = canary_evaluate(
                    page=html or "",
                    readers=readers,
                    reader_name=reader_name,
                    rows_read=listing_row_count,
                    admitted=len(admitted),
                    observed=int(counts.get("observed") or 0),
                    previous_kept=previous_kept,
                    previous_reader=previous_reader,
                )

                # Log extraction result (Phase 2)
                if self.extraction_logger:
                    extraction_status = 'OK'
                    reason = None
                    if len(jobs) == 0:
                        extraction_status = 'EMPTY'
                        reason = 'No jobs found'
                    elif counts.get('failed', 0) > 0:
                        extraction_status = 'DB_FAIL'
                        reason = f"{counts.get('failed', 0)} jobs failed to insert"
                    elif counts.get('skipped', 0) > len(jobs) * 0.5:
                        extraction_status = 'PARTIAL'
                        reason = f"{counts.get('skipped', 0)} jobs skipped (>{len(jobs)*0.5:.0f}%)"
                    
                    # Create summary of extracted fields for logging
                    extracted_fields = {
                        'job_count': len(jobs),
                        'inserted': counts.get('inserted', 0),
                        'updated': counts.get('updated', 0),
                        'skipped': counts.get('skipped', 0),
                        'failed': counts.get('failed', 0)
                    }
                    if jobs:
                        # Sample first job's fields
                        sample_job = jobs[0]
                        extracted_fields['sample_title'] = sample_job.get('title', '')[:100]
                        extracted_fields['has_location'] = bool(sample_job.get('location_raw'))
                        extracted_fields['has_deadline'] = bool(sample_job.get('deadline'))
                    if listing_report:
                        extracted_fields['listing_pages'] = listing_report['pages']
                        extracted_fields['listing_expected'] = listing_report['expected']
                        extracted_fields['listing_complete'] = listing_report['complete']
                        extracted_fields['listing_stop'] = listing_report['stop']
                    # Which reader read the listing (W-35): a diagnostic, never lifecycle evidence.
                    extracted_fields['reader'] = reader_name
                    if LISTING_STRATEGY.get():
                        extracted_fields['strategy'] = LISTING_STRATEGY.get()
                    if canary_warnings:
                        extracted_fields['canary'] = list(canary_warnings)
                    if early_stop:
                        extracted_fields['early_stop'] = True
                    
                    await asyncio.to_thread(
                        self.extraction_logger.log_extraction,
                        url=careers_url,
                        status=extraction_status,
                        source_id=source_id,
                        raw_page_id=raw_page_id,
                        reason=reason,
                        extracted_fields=extracted_fields,
                        job_count=len(jobs)
                    )
                
                found_count = (
                    general_vacancies if general_vacancies is not None else len(jobs)
                )
                crawl_status, crawl_message = _listing_outcome(found_count, listing_report)
                if detail_stop:
                    # Rows whose job page was not opened may have been rejected as too thin.
                    crawl_status = 'warn'
                    crawl_message = f'{crawl_message}; job pages stopped: {detail_stop}'
                crawl_status, crawl_message = save_failure_outcome(
                    crawl_status, crawl_message, counts
                )
                crawl_message = canary_append_message(crawl_message, canary_warnings)
                if early_stop:
                    crawl_message = f'{crawl_message}; early-stop: listing ids unchanged'
                return {
                    'status': crawl_status,
                    'message': crawl_message,
                    # Read by the run's finish for its lifecycle record (contract §6).
                    'listing': dict(listing_report) if listing_report else None,
                    'listing_ids_hash': listing_hash,
                    'listing_id_count': listing_id_count,
                    'valid': len(admitted),
                    'validation_info': {
                        'total_extracted': len(jobs),
                        'validated': counts.get('validated', 0),
                        'skipped': counts.get('skipped', 0),
                        'inserted': counts.get('inserted', 0),
                        'updated': counts.get('updated', 0)
                    } if jobs else None,
                    'counts': {
                        'found': found_count,
                        'inserted': counts['inserted'],
                        'updated': counts['updated'],
                        'skipped': counts['skipped'],
                        'failed': counts.get('failed', 0),
                        'unrecorded': counts.get('unrecorded', 0),
                        'observed': counts.get('observed', 0),
                    }
                }
            
            elif source_type == 'rss':
                # TODO: Implement RSS
                return {
                    'status': 'warn',
                    'message': 'RSS not yet implemented',
                    'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                }
            
            elif source_type in ['api', 'json']:
                # TODO: Implement API
                return {
                    'status': 'warn',
                    'message': 'API not yet implemented',
                    'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                }
            
            else:
                return {
                    'status': 'failed',
                    'message': f'Unknown source type: {source_type}',
                    'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                }
        
        except Exception as e:
            logger.error(f"Error crawling {org_name}: {redact_exception(e)}", exc_info=True)
            return {
                'status': 'failed',
                'message': stored_text(e, 200),
                'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
            }

