"""
Simple, focused crawler system - rebuilt from scratch.

Design principles:
1. Simple and clear - easy to understand and debug
2. Works first, optimize later
3. Minimal dependencies - just what we need
4. Direct database operations - no complex abstractions
"""

import logging
import asyncio
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from urllib.parse import urlparse, urljoin
import httpx
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


class SimpleCrawler:
    """
    Simple crawler that fetches HTML, extracts jobs, and saves to database.
    No complex validation, no repair system - just extract and save.
    """
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.timeout = httpx.Timeout(30.0)
        self.user_agent = "Mozilla/5.0 (compatible; AidJobs/1.0; +https://aidjobs.app)"
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    async def fetch_html(self, url: str) -> Tuple[int, str]:
        """
        Fetch HTML from URL.
        
        Returns:
            (status_code, html_content)
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(
                    url,
                    headers={"User-Agent": self.user_agent}
                )
                return response.status_code, response.text
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return 0, ""
    
    def extract_jobs_from_html(self, html: str, base_url: str) -> List[Dict]:
        """
        Extract jobs from HTML using simple table-based extraction.
        
        Strategy:
        1. Find all tables
        2. Look for header row (Title, Location, Deadline, etc.)
        3. Extract data rows
        4. Build job objects
        """
        soup = BeautifulSoup(html, 'html.parser')
        jobs = []
        
        # Find all tables
        tables = soup.find_all('table')
        logger.info(f"Found {len(tables)} tables")
        
        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:  # Need at least header + 1 data row
                continue
            
            # Find header row
            header_row = None
            header_map = {}  # column_index -> field_name
            
            for row in rows[:5]:  # Check first 5 rows for header
                cells = row.find_all(['th', 'td'])
                if not cells:
                    continue
                
                # Check if this looks like a header
                cell_texts = [c.get_text().strip().lower() for c in cells]
                header_keywords = ['title', 'position', 'location', 'deadline', 'closing', 'apply']
                
                keyword_count = sum(1 for text in cell_texts for kw in header_keywords if kw in text)
                
                if keyword_count >= 2:  # Has at least 2 header keywords
                    header_row = row
                    # Map columns
                    for idx, cell in enumerate(cells):
                        text = cell.get_text().strip().lower()
                        if 'title' in text or 'position' in text:
                            header_map[idx] = 'title'
                        elif 'location' in text or 'duty' in text:
                            header_map[idx] = 'location'
                        elif 'deadline' in text or 'closing' in text:
                            header_map[idx] = 'deadline'
                    break
            
            if not header_map:
                continue
            
            logger.info(f"Found header with {len(header_map)} mapped columns")
            
            # Extract data rows
            for row in rows:
                # Skip header row
                if row == header_row:
                    continue
                
                cells = row.find_all(['td', 'th'])
                if len(cells) < 2:
                    continue
                
                # Extract fields using header map
                job = {}
                
                # Extract title from link (most reliable)
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
                                job['title'] = text
                        elif field == 'location':
                            if text and len(text) >= 3:
                                job['location_raw'] = text
                        elif field == 'deadline':
                            if text and len(text) >= 3:
                                job['deadline'] = text
                
                # Only add if we have title and apply_url
                if job.get('title') and job.get('apply_url'):
                    jobs.append(job)
                    if len(jobs) >= 100:  # Limit to 100 jobs per table
                        break
            
            if jobs:
                break  # Found jobs, stop looking at other tables
        
        logger.info(f"Extracted {len(jobs)} jobs from HTML")
        return jobs
    
    def save_jobs(self, jobs: List[Dict], source_id: str, org_name: str) -> Dict:
        """
        Save jobs to database.
        
        Returns:
            Dict with counts: {inserted, updated, skipped}
        """
        if not jobs:
            return {'inserted': 0, 'updated': 0, 'skipped': 0}
        
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
                    deadline_str = job.get('deadline', '').strip()
                    
                    if not title or not apply_url:
                        skipped += 1
                        continue
                    
                    # Create canonical hash (simple hash of title + URL)
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
        """
        Crawl a single source.
        
        Args:
            source: Dict with id, org_name, careers_url, source_type
        
        Returns:
            Dict with status, message, counts
        """
        source_id = str(source['id'])
        org_name = source.get('org_name', 'Unknown')
        careers_url = source['careers_url']
        source_type = source.get('source_type', 'html')
        
        logger.info(f"Crawling {org_name} ({source_type}): {careers_url}")
        
        try:
            if source_type == 'html':
                # Fetch HTML
                status, html = await self.fetch_html(careers_url)
                
                if status != 200:
                    return {
                        'status': 'failed',
                        'message': f'HTTP {status}',
                        'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                    }
                
                # Extract jobs
                jobs = self.extract_jobs_from_html(html, careers_url)
                
                # Save to database
                counts = self.save_jobs(jobs, source_id, org_name)
                
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
            logger.error(f"Error crawling {org_name}: {e}", exc_info=True)
            return {
                'status': 'failed',
                'message': str(e)[:200],
                'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
            }

