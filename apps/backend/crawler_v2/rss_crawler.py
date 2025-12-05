"""
Simple RSS crawler - extracts jobs from RSS feeds.
"""

import logging
import re
from typing import Dict, List, Optional
from datetime import datetime
from urllib.parse import urlparse, urljoin
import httpx
import feedparser
import psycopg2

logger = logging.getLogger(__name__)


class SimpleRSSCrawler:
    """Simple RSS feed crawler"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.timeout = httpx.Timeout(30.0)
        self.user_agent = "Mozilla/5.0 (compatible; AidJobs/1.0; +https://aidjobs.app)"
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    async def fetch_feed(self, url: str) -> feedparser.FeedParserDict:
        """Fetch and parse RSS feed"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(
                    url,
                    headers={"User-Agent": self.user_agent}
                )
                
                if response.status_code != 200:
                    logger.error(f"RSS fetch failed: HTTP {response.status_code}")
                    return None
                
                # Parse feed
                feed = feedparser.parse(response.text)
                return feed
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
            extractor = Extractor(enable_ai=False, enable_snapshots=False, shadow_mode=True)
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
    
    def save_jobs(self, jobs: List[Dict], source_id: str, org_name: str, base_url: Optional[str] = None) -> Dict:
        """Save jobs to database (same logic as HTML crawler)"""
        if not jobs:
            return {'inserted': 0, 'updated': 0, 'skipped': 0}
        
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
        
        try:
            with conn.cursor() as cur:
                for job in jobs:
                    title = job.get('title', '').strip()
                    apply_url = job.get('apply_url', '').strip()
                    location = job.get('location_raw', '').strip()
                    
                    if not title or not apply_url:
                        skipped += 1
                        continue
                    
                    # Create canonical hash
                    import hashlib
                    canonical_text = f"{title}|{apply_url}".lower()
                    canonical_hash = hashlib.md5(canonical_text.encode()).hexdigest()
                    
                    # Check if exists
                    cur.execute("""
                        SELECT id FROM jobs WHERE canonical_hash = %s
                    """, (canonical_hash,))
                    
                    existing = cur.fetchone()
                    
                    if existing:
                        # Update
                        cur.execute("""
                            UPDATE jobs
                            SET title = %s,
                                apply_url = %s,
                                location_raw = %s,
                                last_seen_at = NOW(),
                                updated_at = NOW()
                            WHERE canonical_hash = %s
                        """, (title, apply_url, location, canonical_hash))
                        updated += 1
                    else:
                        # Insert
                        cur.execute("""
                            INSERT INTO jobs (
                                source_id, org_name, title, apply_url,
                                location_raw, canonical_hash,
                                status, fetched_at, last_seen_at
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, 'active', NOW(), NOW())
                        """, (source_id, org_name, title, apply_url, location, canonical_hash))
                        inserted += 1
                
                conn.commit()
        
        except Exception as e:
            logger.error(f"Error saving jobs: {e}")
            conn.rollback()
        finally:
            conn.close()
        
        return {'inserted': inserted, 'updated': updated, 'skipped': skipped}
    
    async def crawl_source(self, source: Dict) -> Dict:
        """Crawl RSS source"""
        source_id = str(source['id'])
        org_name = source.get('org_name', 'Unknown')
        careers_url = source['careers_url']
        
        logger.info(f"Crawling RSS {org_name}: {careers_url}")
        
        try:
            # Fetch feed
            feed = await self.fetch_feed(careers_url)
            
            if not feed:
                return {
                    'status': 'failed',
                    'message': 'Failed to fetch RSS feed',
                    'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                }
            
            # Extract jobs
            jobs = self.extract_jobs_from_feed(feed, careers_url)
            
            # Save to database
            counts = self.save_jobs(jobs, source_id, org_name, base_url=careers_url)
            
            return {
                'status': 'ok' if jobs else 'warn',
                'message': f'Found {len(jobs)} jobs' if jobs else 'No jobs found',
                'counts': {
                    'found': len(jobs),
                    'inserted': counts['inserted'],
                    'updated': counts['updated'],
                    'skipped': counts['skipped']
                }
            }
        
        except Exception as e:
            logger.error(f"Error crawling RSS {org_name}: {e}", exc_info=True)
            return {
                'status': 'failed',
                'message': str(e)[:200],
                'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
            }

