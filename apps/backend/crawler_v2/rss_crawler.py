"""
Simple RSS crawler - extracts jobs from RSS feeds.
"""

import asyncio
import logging
import re
from typing import Dict, List, Optional
from datetime import datetime, timezone
from urllib.parse import urlparse, urljoin
import httpx
import feedparser
import psycopg2

from contracts.admission import admit_batch, extraction_logger_for, log_admission_rejections
from contracts.outbound import FetchError, current_budget, fetch_url
from contracts.identity import heuristics_enabled
from contracts.persist import persist_candidate
from contracts.refusal import refusal
from contracts.run_ownership import OwnershipLost, confirm_running, save_failure_outcome
from app.log_safety import redact_exception, stored_text
from app.search_projection import commit_and_schedule

logger = logging.getLogger(__name__)


class SimpleRSSCrawler:
    """Simple RSS feed crawler"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.timeout = httpx.Timeout(30.0)
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url, connect_timeout=10)
    
    async def fetch_feed(self, url: str) -> feedparser.FeedParserDict:
        """Fetch and parse RSS feed"""
        try:
            result = await fetch_url(url, timeout=float(self.timeout.connect or 30.0))
            if result.status_code != 200 or refusal(result.status_code, result.headers, result.text):
                logger.error(f"RSS fetch failed: HTTP {result.status_code}")
                return None
            return feedparser.parse(result.text)
        except FetchError as exc:
            logger.error(f"Error fetching RSS feed {url}: {exc}")
            return None
        except Exception as e:
            logger.error(f"Error fetching RSS feed {url}: {e}")
            return None
    
    def extract_jobs_from_feed(self, feed: feedparser.FeedParserDict, base_url: str) -> List[Dict]:
        """Extract jobs from RSS feed using unified pipeline."""
        if not feed or not feed.entries:
            return []
        
        jobs = []
        
        # Use pipeline extractor for unified schema
        try:
            from pipeline.extractor import Extractor
            extractor = Extractor(enable_ai=False, enable_snapshots=False, shadow_mode=False)
        except ImportError:
            # Fallback to simple extraction if pipeline not available
            extractor = None
        
        for entry in feed.entries:
            # Build entry dict for pipeline
            entry_dict = {}
            if hasattr(entry, 'title'):
                entry_dict['title'] = entry.title.strip()
            if hasattr(entry, 'link'):
                entry_dict['link'] = entry.link
            if hasattr(entry, 'description'):
                entry_dict['description'] = entry.description
            elif hasattr(entry, 'summary'):
                entry_dict['description'] = entry.summary
            
            # Use pipeline if available
            if extractor:
                import asyncio
                try:
                    result = asyncio.run(extractor.extract_from_rss(entry_dict, entry_dict.get('link', base_url)))
                    result_dict = result.to_dict()
                    
                    # Convert to existing format
                    job = {}
                    if result_dict['fields']['title']['value']:
                        job['title'] = result_dict['fields']['title']['value']
                    if result_dict['fields']['application_url']['value']:
                        job['apply_url'] = result_dict['fields']['application_url']['value']
                    elif entry_dict.get('link'):
                        job['apply_url'] = entry_dict['link']
                    if result_dict['fields']['description']['value']:
                        job['description_snippet'] = result_dict['fields']['description']['value'][:500]
                    if result_dict['fields']['location']['value']:
                        job['location_raw'] = result_dict['fields']['location']['value']
                    if result_dict['fields']['deadline']['value']:
                        job['deadline'] = result_dict['fields']['deadline']['value']
                    
                    if job.get('title'):
                        jobs.append(job)
                    continue
                except Exception as e:
                    logger.debug(f"Pipeline extraction failed, using fallback: {e}")
            
            # Fallback to simple extraction
            job = {}
            
            # Title
            if hasattr(entry, 'title'):
                job['title'] = entry.title.strip()
            
            # Link
            if hasattr(entry, 'link'):
                job['apply_url'] = entry.link
            
            # Description/summary for location and deadline
            description = ""
            if hasattr(entry, 'description'):
                description = entry.description
            elif hasattr(entry, 'summary'):
                description = entry.summary
            
            # Try to extract location from description
            # Common patterns: "Location: Paris, France" or "Duty Station: Kabul"
            location_patterns = [
                r'[Ll]ocation[:\s]+([A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)?)',
                r'[Dd]uty\s+[Ss]tation[:\s]+([A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)?)',
            ]
            
            for pattern in location_patterns:
                match = re.search(pattern, description)
                if match:
                    job['location_raw'] = match.group(1).strip()
                    break
            
            # Try to extract deadline from description
            deadline_patterns = [
                r'[Dd]eadline[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
                r'[Cc]losing\s+[Dd]ate[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
                r'[Aa]pply\s+[Bb]y[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
            ]
            
            for pattern in deadline_patterns:
                match = re.search(pattern, description)
                if match:
                    job['deadline'] = match.group(1).strip()
                    break
            
            # Published date as fallback
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                try:
                    pub_date = datetime(*entry.published_parsed[:6])
                    job['published_at'] = pub_date
                except:
                    pass
            
            # Only add if we have title and URL
            if job.get('title') and job.get('apply_url'):
                jobs.append(job)
        
        logger.info(f"Extracted {len(jobs)} jobs from RSS feed")
        return jobs
    
    def save_jobs(
        self,
        jobs: List[Dict],
        source_id: str,
        org_name: str,
        base_url: Optional[str] = None,
        *,
        run_token: Optional[str] = None,
        loop=None,
    ) -> Dict:
        """Save jobs as the run that owns the source, one savepoint per job.

        Without a valid running run token nothing is written and OwnershipLost is raised.
        """
        if not run_token:
            raise OwnershipLost("save_jobs needs a run token")
        if not jobs:
            return {'inserted': 0, 'updated': 0, 'skipped': 0, 'failed': 0, 'validated': 0}
        
        # Ensure apply_url exists - use fallback if missing
        for job in jobs:
            if not job.get('apply_url'):
                if job.get('url'):
                    job['apply_url'] = job['url']
                elif job.get('detail_url'):
                    job['apply_url'] = job['detail_url']
                elif base_url:
                    job['apply_url'] = base_url
                    logger.debug(f"RSS job missing apply_url, using base_url as fallback: {job.get('title', '')[:50]}")
                else:
                    job['apply_url'] = f"https://placeholder.missing-url/{abs(hash(job.get('title', '')))}"
                    logger.warning(f"RSS job missing apply_url and no base_url, using placeholder: {job.get('title', '')[:50]}")
        
        conn = self._get_db_conn()
        inserted = 0
        updated = 0
        skipped = 0
        failed = 0
        validated = 0
        seen_active = []
        
        try:
            with conn.cursor() as cur:
                confirm_running(cur, run_token, source_id)
                recorded = []
                for job in jobs:
                    title = job.get('title', '').strip()
                    apply_url = job.get('apply_url', '').strip()

                    if not title or not apply_url:
                        skipped += 1
                        continue

                    candidate = {
                        "title": title,
                        "apply_url": apply_url,
                    }
                    if "location_raw" in job:
                        raw_location = job.get("location_raw") or ""
                        candidate["location_raw"] = (
                            raw_location.strip() if isinstance(raw_location, str) else raw_location
                        )
                    if job.get("admitted") is True:
                        candidate["admitted"] = True
                    observed_at = datetime.now(timezone.utc)
                    validated += 1
                    recorded_mark = len(recorded)
                    seen_mark = len(seen_active)
                    cur.execute("SAVEPOINT job_save")
                    try:
                        outcome = persist_candidate(
                            cur,
                            candidate,
                            observed_at=observed_at,
                            heuristics=heuristics_enabled(),
                            reference=job.get("reference"),
                            source_id=source_id,
                            org_name=org_name,
                            recorded=recorded,
                            seen=seen_active,
                        )
                        cur.execute("RELEASE SAVEPOINT job_save")
                    except Exception as exc:
                        # This job only: roll back to its savepoint and drop what it recorded.
                        cur.execute("ROLLBACK TO SAVEPOINT job_save")
                        del recorded[recorded_mark:]
                        del seen_active[seen_mark:]
                        failed += 1
                        logger.error("RSS job failed to save: %s", redact_exception(exc))
                        continue
                    if outcome == "created":
                        inserted += 1
                    elif outcome == "updated":
                        updated += 1
                    elif outcome == "unchanged":
                        logger.debug("RSS job unchanged, last_seen_at only: %s", title[:80])
                    else:
                        skipped += 1
                
                commit_and_schedule(conn, recorded, loop=loop)
        
        except Exception as e:
            logger.error(f"Error saving jobs: {redact_exception(e)}")
            conn.rollback()
            raise
        finally:
            conn.close()
        
        return {
            'inserted': inserted,
            'updated': updated,
            'skipped': skipped,
            'failed': failed,
            'validated': validated,
            'seen_active': seen_active,
        }
    
    async def crawl_source(self, source: Dict, run=None) -> Dict:
        """Crawl RSS source"""
        source_id = str(source['id'])
        org_name = source.get('org_name', 'Unknown')
        careers_url = source['careers_url']
        
        logger.info(f"Crawling RSS {org_name}: {careers_url}")
        
        try:
            # Fetch feed
            feed = await self.fetch_feed(careers_url)
            
            if not feed:
                budget = current_budget()
                return {
                    'status': 'failed',
                    'message': (f'Refused: {budget.refused}' if budget is not None
                                and budget.refused else 'Failed to fetch RSS feed'),
                    'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                }
            
            # Extract jobs
            jobs = self.extract_jobs_from_feed(feed, careers_url)
            
            # Save to database. Admission sees the finished list and does not fetch.
            admitted, rejected = admit_batch(jobs, "rss")
            await asyncio.to_thread(
                log_admission_rejections, extraction_logger_for(self.db_url), rejected, source_id
            )
            if run is None:
                raise OwnershipLost("crawl_source needs the run that owns the source")
            counts = await run.save(
                self.save_jobs, admitted, source_id, org_name, base_url=careers_url
            )
            status, message = save_failure_outcome(
                'ok' if jobs else 'warn',
                f'Found {len(jobs)} jobs' if jobs else 'No jobs found',
                counts,
            )
            
            return {
                'status': status,
                'message': message,
                'counts': {
                    'found': len(jobs),
                    'inserted': counts['inserted'],
                    'updated': counts['updated'],
                    'skipped': counts['skipped']
                }
            }
        
        except Exception as e:
            logger.error(f"Error crawling RSS {org_name}: {redact_exception(e)}", exc_info=True)
            return {
                'status': 'failed',
                'message': stored_text(e, 200),
                'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
            }

