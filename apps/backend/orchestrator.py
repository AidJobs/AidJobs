"""
Autonomous crawler orchestrator with adaptive scheduling
"""
import os
import logging
import asyncio
import random
import time
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor

from crawler.html_fetch import HTMLCrawler
from crawler.rss_fetch import RSSCrawler
from crawler.api_fetch import APICrawler

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


class CrawlerOrchestrator:
    """Manages autonomous crawling with adaptive scheduling"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.html_crawler = HTMLCrawler(db_url)
        self.rss_crawler = RSSCrawler(db_url)
        self.api_crawler = APICrawler(db_url)
        self.running = False
        self.semaphore = asyncio.Semaphore(GLOBAL_MAX_CONCURRENCY)
    
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
                logger.warning(f"[orchestrator] Could not resolve {hostname} to IPv4: {e}")
            
            # Always try original URL as fallback
            connection_urls.append(self.db_url)
        
        # Try each connection URL with retries
        last_error = None
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
                    last_error = e
                    error_msg = str(e)
                    
                    # Check if it's an IPv6/unreachable error
                    if "Network is unreachable" in error_msg or "2406:" in error_msg or "::" in error_msg:
                        if url == connection_urls[-1] and attempt == retries - 1:
                            # Last URL and last attempt - this is the final failure
                            logger.error(f"[orchestrator] Database connection failed (IPv6 unreachable). Tried {len(connection_urls)} URL(s) with {retries} attempt(s) each.")
                            logger.error(f"[orchestrator] Error: {e}")
                            logger.error(f"[orchestrator] Suggestion: Use Supabase connection pooler URL or ensure IPv4 connectivity.")
                        elif attempt < retries - 1:
                            wait_time = (attempt + 1) * 2
                            logger.warning(f"[orchestrator] Connection attempt {attempt + 1}/{retries} failed (IPv6 issue): {e}. Retrying in {wait_time}s...")
                            time.sleep(wait_time)
                        continue
                    else:
                        # Different error, log and continue
                        if attempt < retries - 1:
                            wait_time = (attempt + 1) * 2
                            logger.warning(f"[orchestrator] Connection attempt {attempt + 1}/{retries} failed: {e}. Retrying in {wait_time}s...")
                            time.sleep(wait_time)
                        else:
                            logger.error(f"[orchestrator] Database connection failed after {retries} attempts: {e}")
                except Exception as e:
                    last_error = e
                    logger.error(f"[orchestrator] Unexpected database connection error: {e}")
                    break
            
            # If we successfully connected, break out of URL loop
            if last_error and "Network is unreachable" not in str(last_error):
                continue
        
        # If we get here, all connection attempts failed
        if last_error:
            raise last_error
        else:
            raise Exception("Database connection failed: Unknown error")
    
    def compute_next_run(
        self,
        base_freq_days: int,
        org_type: Optional[str],
        inserted: int,
        updated: int,
        consecutive_failures: int,
        consecutive_nochange: int,
        source_id: Optional[str] = None
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
        if source_id:
            try:
                from app.source_health import SourceHealthScorer
                scorer = SourceHealthScorer(self.db_url)
                health = scorer.calculate_health_score(source_id)
                
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
                        overdue_hours = (datetime.utcnow() - source['next_run_at']).total_seconds() / 3600
                        priority_score += min(50, overdue_hours / 24)  # Max 50 point boost
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
    
    async def acquire_lock(self, source_id: str) -> bool:
        """Try to acquire lock for a source"""
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                try:
                    cur.execute("""
                        INSERT INTO crawl_locks (source_id, locked_at)
                        VALUES (%s, NOW())
                    """, (source_id,))
                    conn.commit()
                    return True
                except psycopg2.IntegrityError:
                    # Lock already held
                    conn.rollback()
                    return False
        finally:
            conn.close()
    
    async def release_lock(self, source_id: str):
        """Release lock for a source"""
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM crawl_locks WHERE source_id = %s
                """, (source_id,))
                conn.commit()
        finally:
            conn.close()
    
    async def crawl_source(self, source: Dict) -> Dict:
        """
        Crawl a single source.
        
        Returns:
            {'status': 'ok'|'warn'|'fail', 'message': str, 'counts': dict, 'duration_ms': int}
        """
        start_time = time.time()
        source_id = source['id']
        url = source['careers_url']
        source_type = source['source_type']
        
        logger.info(f"[orchestrator] Starting crawl: {source['org_name']} ({url})")
        
        try:
            # Fetch based on type
            if source_type == 'rss':
                raw_jobs = await self.rss_crawler.fetch_feed(url)
                # Normalize using RSS crawler
                normalized_jobs = [
                    self.rss_crawler.normalize_job(job, source.get('org_name'))
                    for job in raw_jobs
                ]
            elif source_type == 'api':
                # Get last_success_at for incremental fetching
                last_success_at = None
                if source.get('last_crawled_at'):
                    try:
                        last_success_at = source['last_crawled_at']
                        if isinstance(last_success_at, str):
                            from dateutil import parser as date_parser
                            last_success_at = date_parser.parse(last_success_at)
                    except Exception as e:
                        logger.warning(f"[orchestrator] Failed to parse last_crawled_at: {e}")
                
                raw_jobs = await self.api_crawler.fetch_api(
                    url,
                    source.get('parser_hint'),
                    last_success_at
                )
                # Normalize using HTML crawler (API jobs are similar to HTML)
                normalized_jobs = [
                    self.html_crawler.normalize_job(job, source.get('org_name'))
                    for job in raw_jobs
                ]
            else:  # html (default)
                status, headers, html, size = await self.html_crawler.fetch_html(url)
                
                if status == 304:
                    # Not modified
                    return {
                        'status': 'ok',
                        'message': 'Not modified (304)',
                        'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0},
                        'duration_ms': int((time.time() - start_time) * 1000)
                    }
                
                if status == 403:
                    # Robots disallow
                    return {
                        'status': 'fail',
                        'message': 'Blocked by robots.txt',
                        'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0},
                        'duration_ms': int((time.time() - start_time) * 1000)
                    }
                
                if status != 200:
                    return {
                        'status': 'fail',
                        'message': f'HTTP {status}',
                        'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0},
                        'duration_ms': int((time.time() - start_time) * 1000)
                    }
                
                raw_jobs = self.html_crawler.extract_jobs(html, url, source.get('parser_hint'))
                # Normalize using HTML crawler
                normalized_jobs = [
                    self.html_crawler.normalize_job(job, source.get('org_name'))
                    for job in raw_jobs
                ]
            
            # Upsert to database
            counts = await self.html_crawler.upsert_jobs(normalized_jobs, source_id)
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Determine status
            if counts['inserted'] > 0 or counts['updated'] > 0:
                status_result = 'ok'
                message = f"Found {counts['found']}, inserted {counts['inserted']}, updated {counts['updated']}"
            elif counts['found'] == 0:
                status_result = 'warn'
                message = "No jobs found"
            else:
                status_result = 'ok'
                message = "No changes"
            
            return {
                'status': status_result,
                'message': message,
                'counts': counts,
                'duration_ms': duration_ms
            }
        
        except Exception as e:
            logger.error(f"[orchestrator] Error crawling {url}: {e}")
            duration_ms = int((time.time() - start_time) * 1000)
            return {
                'status': 'fail',
                'message': str(e)[:500],
                'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0},
                'duration_ms': duration_ms
            }
    
    async def update_source_after_crawl(self, source: Dict, result: Dict):
        """Update source record after crawl"""
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                counts = result['counts']
                
                # Update consecutive counters
                if result['status'] == 'fail':
                    consecutive_failures = source['consecutive_failures'] + 1
                    consecutive_nochange = 0
                else:
                    consecutive_failures = 0
                    if counts['inserted'] == 0 and counts['updated'] == 0:
                        consecutive_nochange = source['consecutive_nochange'] + 1
                    else:
                        consecutive_nochange = 0
                
                # Compute next run (with source_id for health-based scheduling)
                next_run_at = self.compute_next_run(
                    source['crawl_frequency_days'],
                    source.get('org_type'),
                    counts['inserted'],
                    counts['updated'],
                    consecutive_failures,
                    consecutive_nochange,
                    source_id=str(source['id'])
                )
                
                # Check circuit breaker
                new_status = source.get('status', 'active')
                if consecutive_failures >= 5:
                    new_status = 'paused'
                    result['message'] += ' (auto-paused after 5 failures)'
                
                # Update source
                cur.execute("""
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
                """, (
                    result['status'],
                    result['message'],
                    consecutive_failures,
                    consecutive_nochange,
                    next_run_at,
                    new_status,
                    source['id']
                ))
                
                # Write crawl log
                cur.execute("""
                    INSERT INTO crawl_logs (
                        source_id, ran_at, duration_ms, found, inserted,
                        updated, skipped, status, message
                    ) VALUES (%s, NOW(), %s, %s, %s, %s, %s, %s, %s)
                """, (
                    source['id'],
                    result['duration_ms'],
                    counts['found'],
                    counts['inserted'],
                    counts['updated'],
                    counts['skipped'],
                    result['status'],
                    result['message']
                ))
                
                conn.commit()
                
                logger.info(
                    f"[orchestrator] Updated source {source['org_name']}: "
                    f"next_run={next_run_at.isoformat()}, "
                    f"failures={consecutive_failures}, nochange={consecutive_nochange}"
                )
        
        except Exception as e:
            logger.error(f"[orchestrator] Error updating source {source['id']}: {e}")
            conn.rollback()
        finally:
            conn.close()
    
    async def run_source_with_lock(self, source: Dict):
        """Run a source with locking and semaphore"""
        async with self.semaphore:
            # Try to acquire lock
            if not await self.acquire_lock(source['id']):
                logger.debug(f"[orchestrator] Source {source['org_name']} already locked, skipping")
                return
            
            try:
                # Crawl the source
                result = await self.crawl_source(source)
                
                # Update source and log
                await self.update_source_after_crawl(source, result)
            
            finally:
                # Always release lock
                await self.release_lock(source['id'])
    
    async def cleanup_expired_jobs(self) -> Dict:
        """
        Delete jobs that have passed their application deadline.
        
        Returns:
            {'deleted': int, 'message': str}
        """
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                # Delete jobs where deadline < CURRENT_DATE
                cur.execute("""
                    DELETE FROM jobs
                    WHERE deadline IS NOT NULL
                    AND deadline < CURRENT_DATE
                """)
                deleted_count = cur.rowcount
                conn.commit()
                
                if deleted_count > 0:
                    logger.info(f"[orchestrator] Cleaned up {deleted_count} expired job(s)")
                
                return {
                    'deleted': deleted_count,
                    'message': f'Deleted {deleted_count} expired job(s)'
                }
        except Exception as e:
            logger.error(f"[orchestrator] Error cleaning up expired jobs: {e}")
            conn.rollback()
            return {
                'deleted': 0,
                'message': f'Error: {str(e)}'
            }
        finally:
            conn.close()
    
    async def run_due_sources_once(self) -> Dict:
        """Run all due sources once (for manual trigger)"""
        sources = await self.get_due_sources()
        
        if not sources:
            logger.info("[orchestrator] No due sources found")
            return {'queued': 0}
        
        logger.info(f"[orchestrator] Running {len(sources)} due sources")
        
        # Run all sources in parallel (bounded by semaphore)
        tasks = [self.run_source_with_lock(source) for source in sources]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        return {'queued': len(sources)}
    
    async def scheduler_loop(self):
        """Background scheduler loop with resilient error handling"""
        logger.info("[orchestrator] Scheduler started")
        
        consecutive_errors = 0
        max_consecutive_errors = 5
        last_cleanup_time = None
        cleanup_interval_hours = 24  # Run cleanup once per day
        
        while self.running:
            try:
                # Run cleanup for expired jobs once per day
                now = datetime.utcnow()
                should_cleanup = False
                if last_cleanup_time is None:
                    should_cleanup = True
                else:
                    hours_since_cleanup = (now - last_cleanup_time).total_seconds() / 3600
                    if hours_since_cleanup >= cleanup_interval_hours:
                        should_cleanup = True
                
                if should_cleanup:
                    try:
                        cleanup_result = await self.cleanup_expired_jobs()
                        logger.info(f"[orchestrator] Cleanup result: {cleanup_result['message']}")
                        last_cleanup_time = now
                    except Exception as cleanup_error:
                        logger.error(f"[orchestrator] Cleanup error: {cleanup_error}")
                
                await self.run_due_sources_once()
                consecutive_errors = 0  # Reset error counter on success
            except psycopg2.OperationalError as e:
                consecutive_errors += 1
                error_msg = str(e)
                if "Network is unreachable" in error_msg or "connection" in error_msg.lower():
                    logger.error(f"[orchestrator] Database connection error (attempt {consecutive_errors}/{max_consecutive_errors}): {e}")
                    if consecutive_errors >= max_consecutive_errors:
                        logger.error(f"[orchestrator] Too many consecutive database errors. Scheduler will continue but may not function properly.")
                        logger.error(f"[orchestrator] Check SUPABASE_DB_URL environment variable and network connectivity.")
                        # Reset counter to prevent log spam, but continue trying
                        consecutive_errors = 0
                        # Wait longer before retrying after many errors
                        await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS * 2)
                        continue
                else:
                    logger.error(f"[orchestrator] Database operational error: {e}")
            except Exception as e:
                consecutive_errors += 1
                logger.error(f"[orchestrator] Scheduler error: {e}", exc_info=True)
                if consecutive_errors >= max_consecutive_errors:
                    logger.error(f"[orchestrator] Too many consecutive errors. Scheduler will continue but may not function properly.")
                    consecutive_errors = 0
                    await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS * 2)
                    continue
            
            # Wait for next interval
            await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS)
        
        logger.info("[orchestrator] Scheduler stopped")
    
    async def start(self):
        """Start the scheduler"""
        if os.getenv("AIDJOBS_DISABLE_SCHEDULER", "").lower() == "true":
            logger.info("[orchestrator] Scheduler disabled by AIDJOBS_DISABLE_SCHEDULER")
            return
        
        self.running = True
        asyncio.create_task(self.scheduler_loop())
        logger.info("[orchestrator] Scheduler task created")
    
    async def stop(self):
        """Stop the scheduler"""
        self.running = False
        logger.info("[orchestrator] Scheduler stopping...")


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
