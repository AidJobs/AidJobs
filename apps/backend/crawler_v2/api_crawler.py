"""
Simple API crawler - extracts jobs from JSON APIs.
"""

import logging
import json
from typing import Dict, List, Optional
import httpx
import psycopg2

logger = logging.getLogger(__name__)


class SimpleAPICrawler:
    """Simple JSON API crawler"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.timeout = httpx.Timeout(30.0)
        self.user_agent = "Mozilla/5.0 (compatible; AidJobs/1.0; +https://aidjobs.app)"
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    async def fetch_api(self, url: str, headers: Optional[Dict] = None) -> Optional[Dict]:
        """Fetch JSON from API"""
        try:
            request_headers = {"User-Agent": self.user_agent}
            if headers:
                request_headers.update(headers)
            
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(url, headers=request_headers)
                
                if response.status_code != 200:
                    logger.error(f"API fetch failed: HTTP {response.status_code}")
                    return None
                
                return response.json()
        except Exception as e:
            logger.error(f"Error fetching API {url}: {e}")
            return None
    
    def extract_jobs_from_json(self, data: Dict, base_url: str) -> List[Dict]:
        """
        Extract jobs from JSON API response.
        
        Tries common patterns:
        - data.jobs[]
        - data.results[]
        - data.items[]
        - data[]
        - jobs[]
        - results[]
        """
        jobs = []
        
        # Try to find job array
        job_array = None
        
        if isinstance(data, dict):
            # Common patterns
            for key in ['jobs', 'results', 'items', 'data', 'positions', 'vacancies']:
                if key in data and isinstance(data[key], list):
                    job_array = data[key]
                    break
            
            # If no key found, check if data itself is a list
            if not job_array and isinstance(data.get('data'), list):
                job_array = data['data']
        elif isinstance(data, list):
            job_array = data
        
        if not job_array:
            logger.warning("Could not find job array in JSON response")
            return []
        
        # Use pipeline extractor for unified schema
        try:
            from pipeline.extractor import Extractor
            extractor = Extractor(enable_ai=False, enable_snapshots=False, shadow_mode=True)
        except ImportError:
            extractor = None
        
        # Extract jobs from array
        for item in job_array:
            if not isinstance(item, dict):
                continue
            
            # Use pipeline if available
            if extractor:
                import asyncio
                try:
                    result = asyncio.run(extractor.extract_from_json(item, base_url))
                    result_dict = result.to_dict()
                    
                    # Convert to existing format
                    job = {}
                    if result_dict['fields']['title']['value']:
                        job['title'] = result_dict['fields']['title']['value']
                    if result_dict['fields']['application_url']['value']:
                        job['apply_url'] = result_dict['fields']['application_url']['value']
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
            
            # Common field names
            title_fields = ['title', 'name', 'position', 'job_title', 'position_title']
            url_fields = ['url', 'link', 'apply_url', 'application_url', 'job_url', 'href']
            location_fields = ['location', 'duty_station', 'city', 'country', 'place']
            deadline_fields = ['deadline', 'closing_date', 'application_deadline', 'due_date']
            
            # Extract title
            for field in title_fields:
                if field in item and item[field]:
                    job['title'] = str(item[field]).strip()
                    break
            
            # Extract URL
            for field in url_fields:
                if field in item and item[field]:
                    url = str(item[field]).strip()
                    if url and not url.startswith('#') and not url.startswith('javascript:'):
                        job['apply_url'] = url
                        break
            
            # If no direct URL, try to construct from ID
            if 'apply_url' not in job:
                for id_field in ['id', 'job_id', 'position_id']:
                    if id_field in item:
                        job_id = str(item[id_field])
                        # Try common URL patterns
                        if base_url:
                            job['apply_url'] = f"{base_url.rstrip('/')}/{job_id}"
                            break
            
            # Extract location
            for field in location_fields:
                if field in item and item[field]:
                    job['location_raw'] = str(item[field]).strip()
                    break
            
            # Extract deadline
            for field in deadline_fields:
                if field in item and item[field]:
                    job['deadline'] = str(item[field]).strip()
                    break
            
            # Only add if we have title and URL
            if job.get('title') and job.get('apply_url'):
                jobs.append(job)
        
        logger.info(f"Extracted {len(jobs)} jobs from JSON API")
        return jobs
    
    def save_jobs(self, jobs: List[Dict], source_id: str, org_name: str) -> Dict:
        """Save jobs to database (same logic as HTML crawler)"""
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
        """Crawl API source"""
        source_id = str(source['id'])
        org_name = source.get('org_name', 'Unknown')
        careers_url = source['careers_url']
        
        logger.info(f"Crawling API {org_name}: {careers_url}")
        
        try:
            # Fetch JSON
            data = await self.fetch_api(careers_url)
            
            if not data:
                return {
                    'status': 'failed',
                    'message': 'Failed to fetch API',
                    'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                }
            
            # Extract jobs
            jobs = self.extract_jobs_from_json(data, careers_url)
            
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
            logger.error(f"Error crawling API {org_name}: {e}", exc_info=True)
            return {
                'status': 'failed',
                'message': str(e)[:200],
                'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
            }

