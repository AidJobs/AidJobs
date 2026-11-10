"""
Autonomous crawler orchestrator with adaptive scheduling
"""
import os
import logging
import asyncio
import random
import time
from typing import Dict, List, Optional
from datetime import datetime, timedelta, timezone
import psycopg2
import psycopg2.errors
from psycopg2.extras import RealDictCursor

from app.log_safety import REQUEST_ID, redact_exception, redact_text, stored_text
from contracts.lifecycle import run_lifecycle
from crawler_v2.run_handle import RunHandle, crawl_budget
from crawler_v2.simple_crawler import SimpleCrawler
from crawler_v2.rss_crawler import SimpleRSSCrawler
from crawler_v2.api_crawler import SimpleAPICrawler

logger = logging.getLogger(__name__)

# Defaults by org type
DEFAULT_FREQ_DAYS = {
    'un': 1,
    'ingo': 2,
    'ngo': 3,
    'academic': 7,
    'private': 5,
}

GLOBAL_MAX_CONCURRENCY = 3
SCHEDULER_INTERVAL_SECONDS = 300  # 5 minutes
MAX_SOURCES_PER_RUN = 20
# After a refusal or a challenge, the next scheduled crawl waits at least this long (W-34).
REFUSAL_WAIT = timedelta(hours=24)

RECOVERY_INTERVAL_SECONDS = 300
ORPHAN_RUN_AGE = timedelta(minutes=2)
# A manual run that gets a slot with less than this left of its limit does not start.
MANUAL_MIN_REMAINING = timedelta(minutes=5)
SHUTDOWN_DEADLINE_SECONDS = 20
# Finishing plus one recovery interval: the lock must outlive the limit by more than this.
_LIFETIME_MARGIN = timedelta(minutes=6)

EXPIRED_MESSAGE = "Lock expired, cause unknown"
ORPHAN_MESSAGE = "Interrupted: run had no lock"
SHUTDOWN_MESSAGE = "Interrupted: the server shut down"
NO_SLOT_MESSAGE = "Interrupted: no free crawl slot"

# Set at the start of every run step, so a stuck database cannot hold run, lock, or source rows
# indefinitely.
_STEP_TIMEOUTS_SQL = (
    "SET LOCAL statement_timeout = '30s'; "
    "SET LOCAL idle_in_transaction_session_timeout = '60s'"
)


def _minutes_setting(name: str, default: int) -> timedelta:
    raw = os.getenv(name, "").strip()
    return timedelta(minutes=float(raw) if raw else default)


def crawl_time_settings() -> tuple:
    """(time limit, lock lifetime) from the environment; refuses a lifetime that is too short."""
    limit = _minutes_setting("CRAWL_TIME_LIMIT_MINUTES", 15)
    lifetime = _minutes_setting("CRAWL_LOCK_TTL_MINUTES", 25)
    if limit <= timedelta(0) or lifetime <= limit + _LIFETIME_MARGIN:
        raise ValueError(
            "CRAWL_LOCK_TTL_MINUTES must be longer than CRAWL_TIME_LIMIT_MINUTES plus 6 minutes"
        )
    return limit, lifetime


def _row_id(row):
    """First column, or the id field when the cursor returns a mapping."""
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get("id")
    return row[0]


def _ipv6_unreachable(error: BaseException) -> bool:
    text = str(error)
    return "Network is unreachable" in text or "2406:" in text or "::" in text


def overdue_hours(next_run_at, *, now=None):
    """Hours since a TIMESTAMPTZ next_run_at. The database value is timezone-aware."""
    if now is None:
        now = datetime.now(timezone.utc)
    return (now - next_run_at).total_seconds() / 3600


class CrawlerOrchestrator:
    """Manages autonomous crawling with adaptive scheduling"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.html_crawler = SimpleCrawler(db_url)
        self.rss_crawler = SimpleRSSCrawler(db_url)
        self.api_crawler = SimpleAPICrawler(db_url)
        self.running = False
        self.semaphore = asyncio.Semaphore(GLOBAL_MAX_CONCURRENCY)
        self.time_limit, self.lock_lifetime = crawl_time_settings()
        self._queued: set = set()
        self._tasks: set = set()
        self._closing: set = set()
        self._scheduler_task: Optional[asyncio.Task] = None
        self._recovery_task: Optional[asyncio.Task] = None
    
    def _get_db_conn(self, retries=3, timeout=10):
        """Get database connection with retry logic and IPv4 preference"""
        import socket
        from urllib.parse import urlparse, urlunparse
        
        # Parse the connection URL
        parsed = urlparse(self.db_url)
        hostname = parsed.hostname
        
        # Skip IPv6 resolution if hostname is already an IP address or in brackets
        if not hostname or hostname.startswith('[') or (hostname.replace('.', '').replace(':', '').isdigit() and ':' not in hostname.split('@')[-1]):
            # Already an IPv4 address or IPv6 in brackets, use as-is
            connection_urls = [self.db_url]
        else:
            # Try to resolve to IPv4
            connection_urls = []
            
            # First, try to get IPv4 address
            try:
                # Force IPv4 resolution
                addr_info = socket.getaddrinfo(
                    hostname, 
                    parsed.port or 5432, 
                    socket.AF_INET,  # Force IPv4
                    socket.SOCK_STREAM
                )
                
                if addr_info:
                    ipv4_addr = addr_info[0][4][0]
                    # Build new URL with IPv4 address
                    # Build netloc with IPv4 address
                    if parsed.username and parsed.password:
                        from urllib.parse import quote_plus
                        # URL-encode password to handle special characters
                        encoded_password = quote_plus(parsed.password)
                        new_netloc = f"{parsed.username}:{encoded_password}@{ipv4_addr}"
                    elif parsed.username:
                        new_netloc = f"{parsed.username}@{ipv4_addr}"
                    else:
                        new_netloc = ipv4_addr
                    
                    # Add port if specified
                    if parsed.port:
                        new_netloc += f":{parsed.port}"
                    
                    ipv4_url = urlunparse((
                        parsed.scheme,
                        new_netloc,
                        parsed.path,
                        parsed.params,
                        parsed.query,
                        parsed.fragment
                    ))
                    connection_urls.append(ipv4_url)
                    logger.info(f"[orchestrator] Resolved {hostname} to IPv4: {ipv4_addr}")
            except (socket.gaierror, ValueError, OSError) as e:
                logger.warning(f"[orchestrator] Could not resolve {hostname} to IPv4: {redact_exception(e)}")
            
            # Always try original URL as fallback
            connection_urls.append(self.db_url)
        
        # Try each connection URL with retries. The last exception is kept to be raised, never
        # stored or shown as text.
        failure = None
        for url in connection_urls:
            for attempt in range(retries):
                try:
                    # Use psycopg2 connection parameters to force IPv4
                    conn_params = {
                        'dsn': url,
                        'connect_timeout': timeout,
                    }
                    conn = psycopg2.connect(**conn_params)
                    logger.debug(f"[orchestrator] Successfully connected to database (attempt {attempt + 1})")
                    return conn
                except psycopg2.OperationalError as e:
                    failure = e
                    
                    # Check if it's an IPv6/unreachable error
                    if _ipv6_unreachable(e):
                        if url == connection_urls[-1] and attempt == retries - 1:
                            # Last URL and last attempt - this is the final failure
                            logger.error(f"[orchestrator] Database connection failed (IPv6 unreachable). Tried {len(connection_urls)} URL(s) with {retries} attempt(s) each.")
                            logger.error(f"[orchestrator] Error: {redact_exception(e)}")
                            logger.error(f"[orchestrator] Suggestion: Use Supabase connection pooler URL or ensure IPv4 connectivity.")
                        elif attempt < retries - 1:
                            wait_time = (attempt + 1) * 2
                            logger.warning(f"[orchestrator] Connection attempt {attempt + 1}/{retries} failed (IPv6 issue): {redact_exception(e)}. Retrying in {wait_time}s...")
                            time.sleep(wait_time)
                        continue
                    else:
                        # Different error, log and continue
                        if attempt < retries - 1:
                            wait_time = (attempt + 1) * 2
                            logger.warning(f"[orchestrator] Connection attempt {attempt + 1}/{retries} failed: {redact_exception(e)}. Retrying in {wait_time}s...")
                            time.sleep(wait_time)
                        else:
                            logger.error(f"[orchestrator] Database connection failed after {retries} attempts: {redact_exception(e)}")
                except Exception as e:
                    failure = e
                    logger.error(f"[orchestrator] Unexpected database connection error: {redact_exception(e)}")
                    break
            
            # If we successfully connected, break out of URL loop
            if failure and "Network is unreachable" not in str(failure):
                continue
        
        # If we get here, all connection attempts failed
        if failure:
            raise failure
        else:
            raise Exception("Database connection failed: Unknown error")
    
    def health_score(self, source_id: str) -> Optional[Dict]:
        """The source's health score, read on its own connection; None when it cannot be read."""
        try:
            from app.source_health import SourceHealthScorer
            return SourceHealthScorer(self.db_url).calculate_health_score(str(source_id))
        except Exception as e:
            logger.debug(f"[orchestrator] Could not calculate health score: {e}")
            return None

    def compute_next_run(
        self,
        base_freq_days: int,
        org_type: Optional[str],
        inserted: int,
        updated: int,
        consecutive_failures: int,
        consecutive_nochange: int,
        source_id: Optional[str] = None,
        health: Optional[Dict] = None,
    ) -> datetime:
        """
        Compute next run time with enhanced adaptive scheduling.
        
        Rules:
        - If many changes (inserted + updated >= 10): decrease frequency
        - If no changes for 3+ runs: increase frequency
        - On failures: exponential backoff
        - Consider source health score for frequency adjustment
        - Add jitter ±15%
        """
        # Start with base frequency (or default from org type)
        if base_freq_days is None or base_freq_days <= 0:
            base_freq_days = DEFAULT_FREQ_DAYS.get(org_type, 3)
        
        freq_days = base_freq_days
        
        # Adjust based on activity (more sophisticated)
        changes = inserted + updated
        
        if changes >= 20:
            # Very high activity -> crawl much more frequently
            freq_days = max(0.25, freq_days - 2)
            logger.debug(f"[orchestrator] Very high activity ({changes} changes) -> freq={freq_days} days")
        elif changes >= 10:
            # High activity -> crawl more frequently
            freq_days = max(0.5, freq_days - 1)
            logger.debug(f"[orchestrator] High activity ({changes} changes) -> freq={freq_days} days")
        elif changes >= 5:
            # Moderate activity -> slight increase
            freq_days = max(0.5, freq_days - 0.5)
            logger.debug(f"[orchestrator] Moderate activity ({changes} changes) -> freq={freq_days} days")
        elif changes == 0:
            # No changes
            if consecutive_nochange >= 5:
                # Many consecutive no-changes -> crawl much less frequently
                freq_days = min(21, freq_days + 3)
                logger.debug(f"[orchestrator] {consecutive_nochange} consecutive no-changes -> freq={freq_days} days")
            elif consecutive_nochange >= 3:
                # Some consecutive no-changes -> crawl less frequently
                freq_days = min(14, freq_days + 1)
                logger.debug(f"[orchestrator] {consecutive_nochange} consecutive no-changes -> freq={freq_days} days")
        
        # Apply failure backoff (enhanced exponential backoff)
        if consecutive_failures > 0:
            # Exponential backoff: 6h * 2^failures, capped at 7 days
            backoff_hours = 6 * (2 ** min(consecutive_failures, 4))  # Cap at 4 for calculation
            backoff_days = min(7, backoff_hours / 24.0)
            freq_days = max(freq_days, backoff_days)
            logger.debug(f"[orchestrator] {consecutive_failures} failures -> backoff={backoff_days} days")
        
        # Consider source health score if available
        if health is None and source_id:
            health = self.health_score(source_id)
        if health:
            try:
                
                # Adjust frequency based on health
                if health['score'] >= 80:
                    # High health -> can crawl more frequently if activity is high
                    if health['components']['activity'] >= 70:
                        freq_days = max(0.5, freq_days - 0.5)
                elif health['score'] < 50:
                    # Low health -> crawl less frequently to avoid wasting resources
                    freq_days = min(14, freq_days + 1)
                
                # Use recommended frequency if it's significantly different
                recommended = health['recommended_frequency_days']
                if abs(recommended - freq_days) > 2:
                    freq_days = recommended
                    logger.debug(f"[orchestrator] Using health-based recommended frequency: {freq_days} days")
            except Exception as e:
                logger.debug(f"[orchestrator] Could not calculate health score: {e}")
        
        # Add jitter ±15% to spread out crawls
        jitter_factor = random.uniform(0.85, 1.15)
        freq_days *= jitter_factor
        
        # Calculate next run
        next_run = datetime.utcnow() + timedelta(days=freq_days)
        
        return next_run
    
    async def get_due_sources(self, limit: int = MAX_SOURCES_PER_RUN) -> List[Dict]:
        """Due sources, prioritised; read off the event loop."""
        return await asyncio.to_thread(self._due_sources, limit)

    def _due_sources(self, limit: int) -> List[Dict]:
        """
        Get sources that are due for crawling, prioritized by health score.
        
        Priority order:
        1. Sources with highest priority (health score)
        2. Sources that are most overdue
        3. Sources with highest activity
        """
        conn = self._get_db_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Get all due sources
                cur.execute("""
                    SELECT id, org_name, careers_url, source_type, org_type,
                           parser_hint, crawl_frequency_days, consecutive_failures,
                           consecutive_nochange, last_crawled_at, next_run_at,
                           status, last_crawl_status
                    FROM sources
                    WHERE status = 'active'
                    AND (next_run_at IS NULL OR next_run_at <= NOW())
                """)
                
                all_due = cur.fetchall()
                
                if not all_due:
                    return []
                
                # Calculate health scores and priorities
                from app.source_health import SourceHealthScorer
                scorer = SourceHealthScorer(self.db_url)
                
                sources_with_priority = []
                for source in all_due:
                    health = scorer.calculate_health_score(str(source['id']), dict(source))
                    
                    # Calculate priority score for sorting
                    # Higher = should be crawled first
                    priority_score = health['priority'] * 100
                    
                    # Boost priority for overdue sources
                    if source.get('next_run_at'):
                        priority_score += min(50, overdue_hours(source['next_run_at']) / 24)  # Max 50 point boost
                    else:
                        priority_score += 100  # Never crawled = highest priority
                    
                    # Boost priority for high activity
                    priority_score += health['components']['activity'] * 0.1
                    
                    sources_with_priority.append({
                        **dict(source),
                        'health_score': health['score'],
                        'priority': health['priority'],
                        'priority_score': priority_score
                    })
                
                # Sort by priority score (highest first)
                sources_with_priority.sort(key=lambda x: x['priority_score'], reverse=True)
                
                # Apply time-of-day optimization (avoid peak hours if possible)
                optimized_sources = self._optimize_time_of_day(sources_with_priority)
                
                return optimized_sources[:limit]
        finally:
            conn.close()
    
    def _optimize_time_of_day(self, sources: List[Dict]) -> List[Dict]:
        """
        Optimize crawl order to avoid peak hours.
        
        Peak hours: 9 AM - 5 PM UTC (typical business hours)
        Prefer crawling during off-peak hours for non-critical sources.
        """
        current_hour = datetime.utcnow().hour
        is_peak_hours = 9 <= current_hour < 17
        
        if not is_peak_hours:
            # Off-peak: crawl in priority order
            return sources
        
        # Peak hours: prioritize high-priority sources, defer low-priority
        high_priority = [s for s in sources if s['priority'] >= 7]
        medium_priority = [s for s in sources if 4 <= s['priority'] < 7]
        low_priority = [s for s in sources if s['priority'] < 4]
        
        # During peak hours, prioritize high-priority sources
        # Low-priority sources can wait until off-peak
        return high_priority + medium_priority + low_priority

    # ------------------------------------------------------------------
    # Crawl runs. Rows are always locked in one order: run rows (crawl_logs), then the lock
    # row (crawl_locks), then the source row, then job rows. Acquire is the one exception:
    # its new run row cannot be contended, because no other transaction knows it exists.
    # A job save first holds the source row FOR KEY SHARE (W-52), which conflicts only with a
    # source delete's FOR UPDATE, never with the FOR NO KEY UPDATE taken here, so that earlier
    # lock adds no deadlock (contracts/run_ownership.py).
    # Ownership of a run is checked on its crawl_logs row, never assumed from the lock.
    # ------------------------------------------------------------------

    async def crawl_source(self, source: Dict, run: Optional[RunHandle] = None) -> Dict:
        """
        Crawl a single source as the given run.

        Returns:
            {'status': 'ok'|'warn'|'fail'|'failed', 'message': str, 'counts': dict,
             'duration_ms': int}
        """
        start_time = time.time()
        url = source['careers_url']
        source_type = source['source_type']

        logger.info(f"[orchestrator] Starting crawl: {source['org_name']} ({url})")

        # Every request of the crawl spends this budget; a refusal recorded in it stops the rest.
        with crawl_budget() as budget:
            try:
                if source_type == 'rss':
                    result = await self.rss_crawler.crawl_source(source, run)
                elif source_type in ['api', 'json']:
                    result = await self.api_crawler.crawl_source(source, run)
                else:  # html (default)
                    result = await self.html_crawler.crawl_source(source, run)
                result['duration_ms'] = int((time.time() - start_time) * 1000)
            except Exception as e:
                logger.error(f"[orchestrator] Error crawling {url}: {redact_exception(e)}")
                result = {
                    'status': 'fail',
                    'message': stored_text(e, 500),
                    'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0},
                    'duration_ms': int((time.time() - start_time) * 1000),
                }
            if budget.refused:
                result['refused'] = True
                logger.warning(
                    "[orchestrator] %s refused the crawl (%s); next run not before 24 hours",
                    source['org_name'], budget.refused,
                )
            return result

    def _lifetime_sql(self) -> str:
        return f"{int(self.lock_lifetime.total_seconds())} seconds"

    def _acquire(self, source_id: str, scheduled: bool):
        """Take the lock and open a running row. (run_id, True), or (None, False, reason)."""
        conn = self._get_db_conn()
        try:
            try:
                with conn.cursor() as cur:
                    cur.execute(_STEP_TIMEOUTS_SQL)
                    cur.execute(
                        """
                        INSERT INTO crawl_locks (source_id, locked_at)
                        VALUES (%s, NOW())
                        ON CONFLICT (source_id) DO NOTHING
                        RETURNING source_id
                        """,
                        (source_id,),
                    )
                    if cur.fetchone() is None:
                        conn.rollback()
                        return None, False, "locked"
                    if scheduled:
                        cur.execute(
                            """
                            SELECT status = 'active'
                                   AND (next_run_at IS NULL OR next_run_at <= NOW())
                            FROM sources WHERE id = %s
                            """,
                            (source_id,),
                        )
                        row = cur.fetchone()
                        if not row or not row[0]:
                            conn.rollback()
                            return None, False, "not due"
                    # The source's open jobs that are not hidden as the run starts: what the
                    # crawl's matches are measured against (contract §6).
                    cur.execute(
                        """
                        INSERT INTO crawl_logs (
                            source_id, ran_at, found, inserted, updated,
                            skipped, status, message, active_at_start
                        ) VALUES (
                            %s, NOW(), 0, 0, 0, 0, 'running', 'queued',
                            (SELECT COUNT(*) FROM jobs
                             WHERE source_id = %s AND status = 'active' AND deleted_at IS NULL)
                        )
                        RETURNING id
                        """,
                        (source_id, source_id),
                    )
                    run_id = _row_id(cur.fetchone())
                conn.commit()
                return run_id, True, None
            except Exception:
                conn.rollback()
                raise
        finally:
            conn.close()

    def _read_lock(self, source_id: str):
        """(lock time, expired, owning running run id), locking nothing; None if unlocked."""
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(_STEP_TIMEOUTS_SQL)
                cur.execute(
                    """
                    SELECT l.locked_at, l.locked_at < NOW() - %s::interval,
                           (SELECT r.id FROM crawl_logs r
                            WHERE r.source_id = l.source_id AND r.status = 'running'
                              AND r.ran_at = l.locked_at
                            LIMIT 1)
                    FROM crawl_locks l WHERE l.source_id = %s
                    """,
                    (self._lifetime_sql(), source_id),
                )
                row = cur.fetchone()
            conn.rollback()
            if row is None:
                return None
            return row[0], bool(row[1]), row[2]
        finally:
            conn.close()

    def _take_over(self, source_id: str, health: Optional[Dict]) -> bool:
        """End an expired lock: owner run fail (counted once), orphans interrupted, lock deleted.

        False when the lock is no longer expired, is gone, or its rows are busy (skip, try later).
        """
        conn = self._get_db_conn()
        try:
            try:
                with conn.cursor() as cur:
                    cur.execute(_STEP_TIMEOUTS_SQL)
                    cur.execute("SET LOCAL lock_timeout = '5s'")
                    cur.execute(
                        """
                        SELECT id, ran_at FROM crawl_logs
                        WHERE source_id = %s AND status = 'running'
                        ORDER BY id FOR UPDATE
                        """,
                        (source_id,),
                    )
                    running = cur.fetchall()
                    cur.execute(
                        """
                        SELECT locked_at FROM crawl_locks
                        WHERE source_id = %s AND locked_at < NOW() - %s::interval
                        FOR UPDATE
                        """,
                        (source_id, self._lifetime_sql()),
                    )
                    lock = cur.fetchone()
                    if lock is None:
                        conn.rollback()
                        return False
                    locked_at = lock[0]
                    owner = [row[0] for row in running if row[1] == locked_at]
                    orphans = [row[0] for row in running if row[1] != locked_at]
                    if owner:
                        cur.execute(
                            "UPDATE crawl_logs SET status = 'fail', message = %s WHERE id = %s",
                            (EXPIRED_MESSAGE, owner[0]),
                        )
                    for orphan in orphans:
                        cur.execute(
                            "UPDATE crawl_logs SET status = 'interrupted', message = %s"
                            " WHERE id = %s",
                            (ORPHAN_MESSAGE, orphan),
                        )
                    cur.execute(
                        "DELETE FROM crawl_locks WHERE source_id = %s AND locked_at = %s",
                        (source_id, locked_at),
                    )
                    if owner:
                        self._update_source(
                            cur, source_id, outcome="fail", run_status="fail",
                            message=EXPIRED_MESSAGE, counts={}, health=health,
                        )
                conn.commit()
                logger.warning(
                    "[orchestrator] Took over an expired lock for source %s (%d running rows)",
                    source_id, len(running),
                )
                return True
            except psycopg2.errors.LockNotAvailable:
                conn.rollback()
                return False
            except Exception:
                conn.rollback()
                raise
        finally:
            conn.close()

    def _begin(self, source_id: str, scheduled: bool):
        """Acquire, resolving a conflict: the live run's id, or a takeover of an expired lock."""
        for _attempt in range(3):
            run_id, started, reason = self._acquire(source_id, scheduled)
            if started or reason == "not due":
                return run_id, started
            lock = self._read_lock(source_id)
            if lock is None:
                continue
            _locked_at, expired, live_run = lock
            if not expired:
                return live_run, False
            # Taken over: acquire again. Not taken over: the lock is live again or busy; re-read.
            self._take_over(source_id, self.health_score(source_id))
        return None, False

    async def begin_run(self, source: Dict, *, scheduled: bool = False):
        """Lock the source and insert the running row. A live lock returns its open run's id."""
        return await asyncio.to_thread(self._begin, source["id"], scheduled)

    def _update_source(
        self, cur, source_id, *, outcome, run_status, message, counts, health, refused=False
    ):
        """Update the source from its fresh row, under that row's lock. Inside the caller's tx.

        outcome: 'success', 'fail', or 'interrupted'. An interruption is counted only when the
        source's previous run was interrupted too. refused: the source refused or challenged the
        crawl, so its next scheduled run is at least REFUSAL_WAIT away, whatever else applies.
        """
        cur.execute(
            """
            SELECT status, crawl_frequency_days, org_type, consecutive_failures,
                   consecutive_nochange, last_crawl_status
            FROM sources WHERE id = %s FOR NO KEY UPDATE
            """,
            (source_id,),
        )
        row = cur.fetchone()
        if row is None:
            return
        status, freq_days, org_type, failures, nochange, last_status = row
        failures = failures or 0
        nochange = nochange or 0
        inserted = counts.get("inserted", 0) or 0
        updated = counts.get("updated", 0) or 0

        # A deleted source is not crawled again (W-52): its last run is recorded, but not as a
        # failure, so a source added again keeps the counts it had when it was deleted.
        if (outcome == "interrupted" and last_status != "interrupted") or status == "deleted":
            cur.execute(
                """
                UPDATE sources SET last_crawl_status = %s, last_crawl_message = %s,
                       updated_at = NOW()
                WHERE id = %s
                """,
                (run_status, message, source_id),
            )
            return

        if outcome == "success":
            failures = 0
            nochange = nochange + 1 if inserted == 0 and updated == 0 else 0
        else:
            failures += 1
            nochange = 0
        next_run_at = self.compute_next_run(
            freq_days, org_type, inserted, updated, failures, nochange, health=health,
        )
        if refused:
            next_run_at = max(next_run_at, datetime.utcnow() + REFUSAL_WAIT)
        new_status = status
        if failures >= 5 and status == "active":
            new_status = "paused"
            message = f"{message} (auto-paused after 5 failures)"
        cur.execute(
            """
            UPDATE sources SET
                last_crawled_at = NOW(),
                last_crawl_status = %s,
                last_crawl_message = %s,
                consecutive_failures = %s,
                consecutive_nochange = %s,
                next_run_at = %s,
                status = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (run_status, message, failures, nochange, next_run_at, new_status, source_id),
        )

    def _record_lifecycle(self, cur, run_id, result: Dict, *, active_at_start) -> None:
        """Store the run's completeness and whether it counts, inside its ownership-checked finish.

        Nothing is expired here: whether the crawl counts as evidence of absence is recorded on
        the run itself, never read from extraction_logs (contract §6, B4 record).
        """
        record = run_lifecycle(
            result,
            active_at_start=active_at_start,
            matched_active=result.get("matched_active") or 0,
        )
        stop = record["listing_stop"]
        if stop is not None:
            stop = redact_text(stop)[:300]
        cur.execute(
            """
            UPDATE crawl_logs SET
                listing_complete = %s,
                listing_expected = %s,
                listing_stop = %s,
                valid_count = %s,
                failed_saves = %s,
                matched_active = %s,
                counted = %s
            WHERE id = %s
            """,
            (
                record["listing_complete"],
                record["listing_expected"],
                stop,
                record["valid_count"],
                record["failed_saves"],
                record["matched_active"],
                record["counted"],
                run_id,
            ),
        )

    def _finish(self, source_id, run_id, result: Dict, *, mode: str, health) -> bool:
        """Close the run if it is still ours. False, with nothing written, when it is not.

        mode: 'normal', 'interrupted' (shutdown), or 'no_slot' (a manual run that never started).
        """
        counts = result.get("counts", {}) or {}
        terminal_status = result.get("status", "unknown")
        message = result.get("message") or "Crawl completed"
        conn = self._get_db_conn()
        try:
            try:
                with conn.cursor() as cur:
                    cur.execute(_STEP_TIMEOUTS_SQL)
                    cur.execute("SET LOCAL lock_timeout = '30s'")
                    cur.execute(
                        """
                        UPDATE crawl_logs SET
                            duration_ms = %s,
                            found = %s,
                            inserted = %s,
                            updated = %s,
                            skipped = %s,
                            status = %s,
                            message = %s
                        WHERE id = %s AND status = 'running'
                        RETURNING id, active_at_start
                        """,
                        (
                            result.get("duration_ms", 0) or 0,
                            counts.get("found", 0),
                            counts.get("inserted", 0),
                            counts.get("updated", 0),
                            counts.get("skipped", 0),
                            terminal_status,
                            message,
                            run_id,
                        ),
                    )
                    owned = cur.fetchone()
                    if owned is None:
                        conn.rollback()
                        logger.warning(
                            "[orchestrator] Run %s no longer owns source %s; nothing written",
                            run_id, source_id,
                        )
                        return False
                    self._record_lifecycle(cur, run_id, result, active_at_start=owned[1])
                    # Only this run's own lock: the one taken in the same transaction as its row.
                    cur.execute(
                        """
                        DELETE FROM crawl_locks
                        WHERE source_id = %s
                          AND locked_at = (SELECT ran_at FROM crawl_logs WHERE id = %s)
                        """,
                        (source_id, run_id),
                    )
                    if mode != "no_slot":
                        if mode == "interrupted":
                            outcome = "interrupted"
                        elif terminal_status in {"fail", "failed"}:
                            outcome = "fail"
                        else:
                            outcome = "success"
                        self._update_source(
                            cur, source_id, outcome=outcome, run_status=terminal_status,
                            message=message, counts=counts, health=health,
                            refused=bool(result.get("refused")),
                        )
                conn.commit()
                return True
            except Exception:
                conn.rollback()
                raise
        finally:
            conn.close()

    async def finish_run(self, source: Dict, run_id, result: Dict, *, mode: str = "normal"):
        """Ownership-checked finish, off the event loop. Retried once; then left to recovery."""
        source_id = source["id"]
        health = None
        if mode == "normal":
            health = await asyncio.to_thread(self.health_score, source_id)
        for attempt in (1, 2):
            try:
                return await asyncio.to_thread(
                    self._finish, source_id, run_id, result, mode=mode, health=health
                )
            except Exception:
                logger.error(
                    "[orchestrator] Error finishing crawl for %s (attempt %d)",
                    source.get("org_name"), attempt, exc_info=True,
                )
                if attempt == 2:
                    raise

    async def _close_run(self, source: Dict, run: RunHandle, result: Dict, mode: str):
        await run.wait_for_saves()
        counts = result.setdefault("counts", {})
        for name, value in run.saved.items():
            if not counts.get(name):
                counts[name] = value
        result["matched_active"] = len(run.seen_active)
        try:
            await self.finish_run(source, run.token, result, mode=mode)
        except Exception:
            logger.error(
                "[orchestrator] Run %s for %s left to recovery", run.token, source.get("org_name")
            )

    async def execute_run(self, source: Dict, run_id, *, deadline: Optional[float] = None):
        """Crawl as the owner of run_id, within its time limit, then finish it.

        deadline is a loop.time() value measured from when the lock was taken. A cancellation
        (shutdown) records the run as interrupted through a shielded finish.
        """
        loop = asyncio.get_running_loop()
        if deadline is None:
            deadline = loop.time() + self.time_limit.total_seconds()
        run = RunHandle(run_id, source["id"])
        # A crawl's log lines carry its run ID, not the ID of the admin request that started it.
        # This task runs in its own copy of the context, so the request's ID is untouched.
        REQUEST_ID.set(f"run-{run_id}")
        mode = "normal"
        started = loop.time()
        result = _failed_result("Crawl ended without a result")
        try:
            async with asyncio.timeout_at(deadline):
                result = await self.crawl_source(source, run)
        except TimeoutError:
            minutes = int(self.time_limit.total_seconds() // 60)
            result = _failed_result(f"Timed out after {minutes} minutes")
        except asyncio.CancelledError:
            mode = "interrupted"
            result = _interrupted_result(SHUTDOWN_MESSAGE)
            raise
        except Exception as exc:
            logger.error(
                "[orchestrator] Crawl failed for %s: %s", source.get("org_name"),
                redact_exception(exc), exc_info=True,
            )
            result = _failed_result(stored_text(exc, 500))
        finally:
            if not result.get("duration_ms"):
                result["duration_ms"] = int((loop.time() - started) * 1000)
            closing = asyncio.ensure_future(self._close_run(source, run, result, mode))
            self._closing.add(closing)
            closing.add_done_callback(self._closing.discard)
            await asyncio.shield(closing)

    def _track(self, coro) -> asyncio.Task:
        task = asyncio.ensure_future(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    def _keep_closing(self, coro) -> asyncio.Future:
        closing = asyncio.ensure_future(coro)
        self._closing.add(closing)
        closing.add_done_callback(self._closing.discard)
        return closing

    async def _begin_owned(self, source: Dict, *, scheduled: bool):
        """begin_run that survives cancellation: the acquire's thread commits regardless, so a
        cancelled caller (shutdown) closes a run it started, writing nothing to the source.
        """
        acquiring = asyncio.ensure_future(self.begin_run(source, scheduled=scheduled))
        try:
            return await asyncio.shield(acquiring)
        except asyncio.CancelledError:
            self._keep_closing(self._close_unstarted(source, acquiring))
            raise

    async def _close_unstarted(self, source: Dict, acquiring: asyncio.Future):
        try:
            run_id, started = await acquiring
            if started:
                await self.finish_run(
                    source, run_id, _interrupted_result(SHUTDOWN_MESSAGE), mode="no_slot"
                )
        except Exception:
            logger.error(
                "[orchestrator] Run for %s begun during shutdown left to recovery",
                source.get("org_name"), exc_info=True,
            )

    async def start_manual_run(self, source: Dict):
        """Take the lock now and return its run id; the crawl waits for a slot in the background.

        A duplicate request returns the open run. If no slot frees in time, the run ends
        interrupted and writes nothing to the source.
        """
        loop = asyncio.get_running_loop()
        run_id, started = await self._begin_owned(source, scheduled=False)
        if started:
            deadline = loop.time() + self.time_limit.total_seconds()
            self._track(self._manual_run(source, run_id, deadline))
        return run_id, started

    async def _manual_run(self, source: Dict, run_id, deadline: float):
        loop = asyncio.get_running_loop()
        wait = deadline - loop.time() - MANUAL_MIN_REMAINING.total_seconds()
        try:
            if wait <= 0:
                raise TimeoutError
            async with asyncio.timeout(wait):
                await self.semaphore.acquire()
        except (TimeoutError, asyncio.CancelledError) as exc:
            cancelled = isinstance(exc, asyncio.CancelledError)
            message = SHUTDOWN_MESSAGE if cancelled else NO_SLOT_MESSAGE
            closing = self._keep_closing(
                self.finish_run(source, run_id, _interrupted_result(message), mode="no_slot")
            )
            await asyncio.shield(closing)
            if cancelled:
                raise
            return
        try:
            await self.execute_run(source, run_id, deadline=deadline)
        finally:
            self.semaphore.release()

    async def run_source_with_lock(self, source: Dict):
        """Scheduler path: wait for a slot, then take the lock (if still active and due)."""
        loop = asyncio.get_running_loop()
        async with self.semaphore:
            run_id, started = await self._begin_owned(source, scheduled=True)
            if not started:
                if run_id is None:
                    return {
                        "status": "warn",
                        "message": "Source already locked or no longer due",
                        "counts": {"found": 0, "inserted": 0, "updated": 0, "skipped": 0},
                        "crawl_run_id": None,
                        "started": False,
                    }
                return {
                    "status": "ok",
                    "message": "Open crawl run",
                    "crawl_run_id": run_id,
                    "started": False,
                }
            deadline = loop.time() + self.time_limit.total_seconds()
            await self.execute_run(source, run_id, deadline=deadline)
            return {"status": "ok", "crawl_run_id": run_id, "started": True}

    async def cleanup_expired_jobs(self) -> Dict:
        """
        Deadline hard deletion is disabled.

        A past application deadline does not remove the job row.
        """
        return {
            'deleted': 0,
            'disabled': True,
            'message': 'Hard deletion of jobs past their deadline is disabled',
        }

    async def run_due_sources_once(self, wait: bool = True) -> Dict:
        """Queue every due source not already queued in this process.

        The scheduler waits for its round; the admin route returns at once.
        """
        sources = await self.get_due_sources()
        fresh = [s for s in sources if s["id"] not in self._queued]
        if not fresh:
            logger.info("[orchestrator] No due sources found")
            return {'queued': 0}

        logger.info(f"[orchestrator] Running {len(fresh)} due sources")
        tasks = []
        for source in fresh:
            source_id = source["id"]
            self._queued.add(source_id)
            task = self._track(self.run_source_with_lock(source))
            task.add_done_callback(lambda _t, sid=source_id: self._queued.discard(sid))
            tasks.append(task)
        if wait:
            await asyncio.gather(*tasks, return_exceptions=True)
        return {'queued': len(fresh)}

    def _recover_once(self) -> Dict:
        """Expired locks taken over (counted once); runs without their lock marked interrupted."""
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(_STEP_TIMEOUTS_SQL)
                cur.execute(
                    "SELECT source_id FROM crawl_locks WHERE locked_at < NOW() - %s::interval",
                    (self._lifetime_sql(),),
                )
                expired = [row[0] for row in cur.fetchall()]
                cur.execute(
                    """
                    SELECT r.id, r.source_id FROM crawl_logs r
                    WHERE r.status = 'running' AND r.ran_at < NOW() - %s::interval
                      AND NOT EXISTS (
                          SELECT 1 FROM crawl_locks l
                          WHERE l.source_id = r.source_id AND l.locked_at = r.ran_at)
                    """,
                    (f"{int(ORPHAN_RUN_AGE.total_seconds())} seconds",),
                )
                orphans = cur.fetchall()
            conn.rollback()
        finally:
            conn.close()

        # One source's error (a timeout, a dropped connection) must not stop the others.
        taken = 0
        for source_id in expired:
            try:
                if self._take_over(str(source_id), self.health_score(str(source_id))):
                    taken += 1
            except Exception:
                logger.error(
                    "[orchestrator] Recovery of source %s failed; retried next round",
                    source_id, exc_info=True,
                )
        marked = 0
        for run_id, source_id in orphans:
            try:
                if self._mark_orphan(str(run_id), str(source_id)):
                    marked += 1
            except Exception:
                logger.error(
                    "[orchestrator] Marking run %s failed; retried next round",
                    run_id, exc_info=True,
                )
        if taken or marked:
            logger.warning(
                "[orchestrator] Recovery: %d expired lock(s) taken over, %d orphaned run(s)",
                taken, marked,
            )
        return {"expired_locks": taken, "orphaned_runs": marked}

    def _mark_orphan(self, run_id: str, source_id: str) -> bool:
        conn = self._get_db_conn()
        try:
            try:
                with conn.cursor() as cur:
                    cur.execute(_STEP_TIMEOUTS_SQL)
                    cur.execute("SET LOCAL lock_timeout = '5s'")
                    cur.execute(
                        "SELECT ran_at FROM crawl_logs WHERE id = %s AND status = 'running'"
                        " FOR UPDATE",
                        (run_id,),
                    )
                    row = cur.fetchone()
                    if row is None:
                        conn.rollback()
                        return False
                    cur.execute(
                        "SELECT 1 FROM crawl_locks WHERE source_id = %s AND locked_at = %s",
                        (source_id, row[0]),
                    )
                    if cur.fetchone() is not None:
                        conn.rollback()
                        return False
                    cur.execute(
                        "UPDATE crawl_logs SET status = 'interrupted', message = %s WHERE id = %s",
                        (ORPHAN_MESSAGE, run_id),
                    )
                conn.commit()
                return True
            except psycopg2.errors.LockNotAvailable:
                conn.rollback()
                return False
            except Exception:
                conn.rollback()
                raise
        finally:
            conn.close()

    async def recover_once(self) -> Dict:
        return await asyncio.to_thread(self._recover_once)

    async def recovery_loop(self):
        while self.running:
            try:
                await self.recover_once()
            except Exception as e:
                logger.error(f"[orchestrator] Recovery error: {redact_exception(e)}", exc_info=True)
            await asyncio.sleep(RECOVERY_INTERVAL_SECONDS)

    async def scheduler_loop(self):
        """Background scheduler loop with resilient error handling"""
        logger.info("[orchestrator] Scheduler started")

        consecutive_errors = 0
        max_consecutive_errors = 5

        while self.running:
            try:
                await self.run_due_sources_once()
                consecutive_errors = 0
            except psycopg2.OperationalError as e:
                consecutive_errors += 1
                logger.error(
                    f"[orchestrator] Database error (attempt {consecutive_errors}"
                    f"/{max_consecutive_errors}): {redact_exception(e)}"
                )
                if consecutive_errors >= max_consecutive_errors:
                    consecutive_errors = 0
                    await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS * 2)
                    continue
            except Exception as e:
                consecutive_errors += 1
                logger.error(f"[orchestrator] Scheduler error: {redact_exception(e)}", exc_info=True)
                if consecutive_errors >= max_consecutive_errors:
                    consecutive_errors = 0
                    await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS * 2)
                    continue

            await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS)

        logger.info("[orchestrator] Scheduler stopped")

    async def start(self):
        """Start the recovery timer and the scheduler, side by side; both are safe concurrently."""
        if os.getenv("AIDJOBS_DISABLE_SCHEDULER", "").lower() == "true":
            logger.info("[orchestrator] Scheduler disabled by AIDJOBS_DISABLE_SCHEDULER")
            return

        self.running = True
        self._recovery_task = asyncio.ensure_future(self.recovery_loop())
        self._scheduler_task = asyncio.ensure_future(self.scheduler_loop())
        logger.info("[orchestrator] Scheduler task created")

    async def stop(self):
        """Stop new crawls; cancel running ones, which record interrupted; wait up to a deadline."""
        self.running = False
        logger.info("[orchestrator] Scheduler stopping...")
        loop = asyncio.get_running_loop()
        deadline = loop.time() + SHUTDOWN_DEADLINE_SECONDS
        for task in (self._scheduler_task, self._recovery_task):
            if task is not None:
                task.cancel()
        for task in list(self._tasks):
            task.cancel()
        pending = set(self._tasks) | set(self._closing)
        while pending:
            remaining = deadline - loop.time()
            if remaining <= 0:
                logger.warning(
                    "[orchestrator] %d crawl(s) not closed by the shutdown deadline;"
                    " left to recovery", len(pending),
                )
                break
            _done, pending = await asyncio.wait(pending, timeout=remaining)
            pending |= set(self._closing)


def _failed_result(message: str) -> Dict:
    return {
        "status": "fail",
        "message": message,
        "counts": {"found": 0, "inserted": 0, "updated": 0, "skipped": 0},
        "duration_ms": 0,
    }


def _interrupted_result(message: str) -> Dict:
    return {
        "status": "interrupted",
        "message": message,
        "counts": {"found": 0, "inserted": 0, "updated": 0, "skipped": 0},
        "duration_ms": 0,
    }


# Global instance
_orchestrator: Optional[CrawlerOrchestrator] = None


def get_orchestrator(db_url: str) -> CrawlerOrchestrator:
    """Get or create orchestrator instance"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = CrawlerOrchestrator(db_url)
    return _orchestrator


async def start_scheduler(db_url: str):
    """Start the crawler scheduler (call from FastAPI startup)"""
    orchestrator = get_orchestrator(db_url)
    await orchestrator.start()


async def stop_scheduler():
    """Stop the crawler scheduler (call from FastAPI shutdown)"""
    global _orchestrator
    if _orchestrator:
        await _orchestrator.stop()
