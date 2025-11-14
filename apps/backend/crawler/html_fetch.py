"""
HTML crawler: fetch, extract, normalize, and upsert jobs
"""
import hashlib
import logging
import re
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import RealDictCursor
from dateutil import parser as date_parser

from core.net import HTTPClient
from core.robots import RobotsChecker
from core.domain_limits import DomainLimiter

logger = logging.getLogger(__name__)

# Common job listing selectors (heuristics)
JOB_SELECTORS = [
    '.job-listing', '.job-item', '.career-item', '.position',
    'article.job', 'div.vacancy', 'tr.job-row', 'li.job',
    # Additional common patterns
    '[class*="job"]', '[class*="position"]', '[class*="vacancy"]', '[class*="career"]',
    '[class*="opening"]', '[id*="job"]', '[id*="position"]', '[id*="vacancy"]',
    'article[class*="job"]', 'div[class*="job"]', 'li[class*="job"]',
    'tr[class*="job"]', 'section[class*="job"]', 'div[class*="position"]',
    # Table-based listings
    'tbody tr', 'table tr[data-job]', 'table tr[data-position]',
    # List-based listings
    'ul.jobs li', 'ol.jobs li', 'ul.positions li', 'ul.vacancies li',
    # Card-based listings
    '.card[class*="job"]', '.card[class*="position"]', '[role="article"]'
]

# Location patterns for parsing
LOCATION_PATTERNS = [
    r'(?P<city>[A-Z][a-zA-Z\s]+),\s*(?P<country>[A-Z][a-zA-Z\s]+)',
    r'(?P<country>[A-Z][a-zA-Z\s]+)'
]

# Seniority level keywords
LEVEL_KEYWORDS = {
    'intern': ['intern', 'internship', 'trainee', 'graduate'],
    'junior': ['junior', 'entry', 'assistant', 'associate', 'coordinator'],
    'mid': ['mid', 'specialist', 'analyst', 'officer'],
    'senior': ['senior', 'lead', 'principal', 'manager', 'chief', 'head', 'director'],
}


class HTMLCrawler:
    """HTML job page crawler"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.http_client = HTTPClient()
        self.robots_checker = RobotsChecker(db_url)
        self.domain_limiter = DomainLimiter(db_url)
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    async def fetch_html(
        self,
        url: str,
        max_size_kb: int = 1024,
        etag: Optional[str] = None,
        last_modified: Optional[str] = None
    ) -> Tuple[int, Dict[str, str], str, int]:
        """
        Fetch HTML page.
        
        Returns:
            (status_code, headers, html_content, size_bytes)
        """
        parsed = urlparse(url)
        host = parsed.netloc
        
        # Check robots.txt
        robots_info = await self.robots_checker.get_robots_info(url)
        if not robots_info['allowed']:
            logger.warning(f"[html_fetch] Robots.txt disallows {url}")
            return (403, {}, "", 0)
        
        # Wait for rate limit
        await self.domain_limiter.wait_for_slot(host, robots_info.get('crawl_delay_ms'))
        
        # Fetch page
        status, headers, body, size = await self.http_client.fetch(
            url,
            etag=etag,
            last_modified=last_modified,
            max_size_kb=max_size_kb
        )
        
        html = body.decode('utf-8', errors='ignore')
        return (status, headers, html, size)
    
    def extract_jobs(
        self,
        html: str,
        base_url: str,
        parser_hint: Optional[str] = None
    ) -> List[Dict]:
        """
        Extract job listings from HTML.
        
        Returns:
            List of raw job dicts with keys:
                title, org_name, location_raw, apply_url, description_snippet, deadline
        """
        soup = BeautifulSoup(html, 'lxml')
        jobs = []
        
        # Try to find job containers
        job_elements = []
        
        # Use parser hint if provided (CSS selector)
        if parser_hint:
            job_elements = soup.select(parser_hint)
        
        # Fallback to common selectors
        if not job_elements:
            for selector in JOB_SELECTORS:
                job_elements = soup.select(selector)
                if job_elements:
                    logger.debug(f"[html_fetch] Found {len(job_elements)} jobs using selector: {selector}")
                    break
        
        # If still no elements, try finding links with job-related keywords
        if not job_elements:
            all_links = soup.find_all('a', href=True)
            job_links = [
                link for link in all_links
                if any(keyword in link.get_text().lower() for keyword in [
                    'position', 'job', 'vacancy', 'career', 'opening', 'opportunity',
                    'recruitment', 'hiring', 'apply', 'application', 'posting'
                ]) or any(keyword in link.get('href', '').lower() for keyword in [
                    '/job', '/position', '/vacancy', '/career', '/opening', '/opportunity',
                    '/recruitment', '/hiring', '/apply', '/application', '/posting'
                ])
            ]
            if job_links:
                logger.debug(f"[html_fetch] Found {len(job_links)} job links")
                job_elements = job_links[:50]  # Limit to first 50
        
        # Last resort: try finding structured data (JSON-LD, microdata)
        if not job_elements:
            # Look for JSON-LD structured data
            json_ld_scripts = soup.find_all('script', type='application/ld+json')
            for script in json_ld_scripts:
                try:
                    import json
                    data = json.loads(script.string)
                    if isinstance(data, dict) and data.get('@type') == 'JobPosting':
                        # Create a synthetic element for this job
                        job_elements.append(data)
                    elif isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict) and item.get('@type') == 'JobPosting':
                                job_elements.append(item)
                except:
                    pass
            
            # Look for microdata
            microdata_jobs = soup.find_all(attrs={'itemtype': lambda x: x and 'JobPosting' in x})
            if microdata_jobs:
                logger.debug(f"[html_fetch] Found {len(microdata_jobs)} jobs via microdata")
                job_elements = microdata_jobs[:50]
        
        # Extract data from each element
        for elem in job_elements:
            job = self._extract_job_from_element(elem, base_url)
            if job and job.get('title'):
                jobs.append(job)
        
        logger.info(f"[html_fetch] Extracted {len(jobs)} jobs from {base_url}")
        return jobs
    
    def _extract_job_from_element(self, elem, base_url: str) -> Optional[Dict]:
        """Extract job data from a single HTML element or JSON-LD dict"""
        job = {}
        
        # Handle JSON-LD structured data (dict)
        if isinstance(elem, dict):
            job['title'] = elem.get('title') or elem.get('name') or ''
            if not job['title']:
                return None
            
            # Apply URL from structured data
            if 'url' in elem:
                job['apply_url'] = elem['url']
            elif 'applicationUrl' in elem:
                job['apply_url'] = elem['applicationUrl']
            elif 'identifier' in elem and isinstance(elem['identifier'], dict):
                job['apply_url'] = elem['identifier'].get('value', base_url)
            else:
                job['apply_url'] = base_url
            
            # Location from structured data
            if 'jobLocation' in elem:
                location = elem['jobLocation']
                if isinstance(location, dict):
                    if 'address' in location:
                        addr = location['address']
                        if isinstance(addr, dict):
                            parts = []
                            if 'addressLocality' in addr:
                                parts.append(addr['addressLocality'])
                            if 'addressCountry' in addr:
                                parts.append(addr['addressCountry'])
                            job['location_raw'] = ', '.join(parts) if parts else None
                    elif 'name' in location:
                        job['location_raw'] = location['name']
            
            # Description from structured data
            if 'description' in elem:
                job['description_snippet'] = elem['description'][:500] if elem['description'] else None
            
            # Deadline from structured data
            if 'validThrough' in elem:
                try:
                    from dateutil import parser as date_parser
                    job['deadline'] = date_parser.parse(elem['validThrough']).date()
                except:
                    pass
            
            return job
        
        # Handle HTML elements
        # Title
        title_elem = elem.find(['h1', 'h2', 'h3', 'h4', 'a'])
        if title_elem:
            job['title'] = title_elem.get_text().strip()
        else:
            job['title'] = elem.get_text().strip()[:200]
        
        if not job['title']:
            return None
        
        # Apply URL
        link = elem.find('a', href=True)
        if link:
            job['apply_url'] = urljoin(base_url, link['href'])
        else:
            job['apply_url'] = base_url
        
        # Location
        location_elem = elem.find(class_=re.compile(r'location|place|city'))
        if location_elem:
            job['location_raw'] = location_elem.get_text().strip()
        else:
            # Try to find location in text
            text = elem.get_text()
            for pattern in LOCATION_PATTERNS:
                match = re.search(pattern, text)
                if match:
                    job['location_raw'] = match.group(0)
                    break
        
        # Description snippet
        desc_elem = elem.find(['p', 'div'], class_=re.compile(r'description|summary|excerpt'))
        if desc_elem:
            job['description_snippet'] = desc_elem.get_text().strip()[:500]
        else:
            job['description_snippet'] = elem.get_text().strip()[:500]
        
        # Deadline
        deadline_elem = elem.find(class_=re.compile(r'deadline|closing|expire'))
        if deadline_elem:
            try:
                job['deadline'] = date_parser.parse(deadline_elem.get_text(), fuzzy=True).date()
            except:
                pass
        
        # Org name (try to extract from page)
        job['org_name'] = None
        
        return job
    
    def normalize_job(self, raw_job: Dict, source_org_name: Optional[str] = None) -> Dict:
        """
        Normalize a raw job dict to canonical fields.
        
        Returns job dict with:
            - All raw fields
            - normalized fields (level_norm, career_type, work_modality, etc.)
            - canonical_hash
        """
        job = raw_job.copy()
        
        # Use source org_name if not present
        if not job.get('org_name') and source_org_name:
            job['org_name'] = source_org_name
        
        # Normalize title
        title_lower = job.get('title', '').lower()
        
        # Determine level_norm
        job['level_norm'] = None
        for level, keywords in LEVEL_KEYWORDS.items():
            if any(kw in title_lower for kw in keywords):
                job['level_norm'] = level.capitalize()
                break
        
        # Determine career_type (consultancy, fellowship, staff, internship)
        job['career_type'] = None
        if any(kw in title_lower for kw in ['consult', 'consultant']):
            job['career_type'] = 'consultancy'
        elif any(kw in title_lower for kw in ['fellow', 'fellowship']):
            job['career_type'] = 'fellowship'
        elif any(kw in title_lower for kw in ['intern', 'internship']):
            job['career_type'] = 'internship'
        else:
            job['career_type'] = 'staff'
        
        # Determine work_modality (remote, hybrid, onsite)
        job['work_modality'] = 'onsite'  # default
        if any(kw in title_lower for kw in ['remote', 'telework', 'work from home']):
            job['work_modality'] = 'remote'
        elif any(kw in title_lower for kw in ['hybrid']):
            job['work_modality'] = 'hybrid'
        
        # Parse location -> country_iso
        location_raw = job.get('location_raw', '')
        job['country_iso'] = self._parse_country_iso(location_raw)
        job['country_name'] = None
        
        # Mission tags (basic keyword extraction)
        job['mission_tags'] = self._extract_mission_tags(job.get('description_snippet', ''))
        
        # International eligible (heuristic: remote or multiple countries)
        job['international_eligible'] = (
            job['work_modality'] == 'remote' or
            'international' in title_lower or
            'global' in title_lower
        )
        
        # Generate canonical hash
        job['canonical_hash'] = self._generate_canonical_hash(job)
        
        return job
    
    def _parse_country_iso(self, location: str) -> Optional[str]:
        """Parse country ISO code from location string"""
        # Simple mapping for common countries
        country_map = {
            'afghanistan': 'AF', 'bangladesh': 'BD', 'congo': 'CD',
            'ethiopia': 'ET', 'india': 'IN', 'kenya': 'KE',
            'nigeria': 'NG', 'pakistan': 'PK', 'sudan': 'SD',
            'somalia': 'SO', 'syria': 'SY', 'united states': 'US',
            'yemen': 'YE', 'switzerland': 'CH', 'france': 'FR',
            'uk': 'GB', 'united kingdom': 'GB'
        }
        
        location_lower = location.lower()
        for country, iso in country_map.items():
            if country in location_lower:
                return iso
        
        return None
    
    def _extract_mission_tags(self, text: str) -> List[str]:
        """Extract mission tags from text using keyword matching"""
        text_lower = text.lower()
        tags = []
        
        keywords_map = {
            'health': ['health', 'medical', 'healthcare', 'clinic'],
            'education': ['education', 'school', 'learning', 'training'],
            'wash': ['wash', 'water', 'sanitation', 'hygiene'],
            'climate': ['climate', 'environment', 'sustainability'],
            'gender': ['gender', 'women', 'equality', 'empowerment'],
            'protection': ['protection', 'safeguarding', 'child protection'],
            'nutrition': ['nutrition', 'food security', 'hunger'],
            'livelihoods': ['livelihood', 'economic', 'employment'],
            'shelter': ['shelter', 'housing', 'settlement'],
        }
        
        for tag, keywords in keywords_map.items():
            if any(kw in text_lower for kw in keywords):
                tags.append(tag)
        
        return tags[:3]  # Limit to 3 tags
    
    def _generate_canonical_hash(self, job: Dict) -> str:
        """Generate canonical hash for deduplication"""
        # Combine key fields for hash
        canonical_str = f"{job.get('title', '')}|{job.get('org_name', '')}|{job.get('location_raw', '')}"
        return hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()[:16]
    
    async def upsert_jobs(
        self,
        jobs: List[Dict],
        source_id: str
    ) -> Dict[str, int]:
        """
        Upsert jobs to database.
        
        Returns:
            {'found': n, 'inserted': n, 'updated': n, 'skipped': n}
        """
        counts = {'found': len(jobs), 'inserted': 0, 'updated': 0, 'skipped': 0}
        
        if not jobs:
            return counts
        
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                for job in jobs:
                    # Check if exists
                    cur.execute("""
                        SELECT id, last_seen_at FROM jobs WHERE canonical_hash = %s
                    """, (job['canonical_hash'],))
                    
                    existing = cur.fetchone()
                    
                    if existing:
                        # Update last_seen_at
                        cur.execute("""
                            UPDATE jobs SET last_seen_at = NOW()
                            WHERE canonical_hash = %s
                        """, (job['canonical_hash'],))
                        counts['updated'] += 1
                    else:
                        # Insert new job
                        cur.execute("""
                            INSERT INTO jobs (
                                source_id, org_name, title, location_raw, country_iso,
                                level_norm, career_type, work_modality, mission_tags,
                                international_eligible, deadline, apply_url,
                                description_snippet, canonical_hash, status
                            ) VALUES (
                                %s, %s, %s, %s, %s,
                                %s, %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, 'active'
                            )
                        """, (
                            source_id, job.get('org_name'), job.get('title'),
                            job.get('location_raw'), job.get('country_iso'),
                            job.get('level_norm'), job.get('career_type'),
                            job.get('work_modality'), job.get('mission_tags', []),
                            job.get('international_eligible', False),
                            job.get('deadline'), job.get('apply_url'),
                            job.get('description_snippet'), job['canonical_hash']
                        ))
                        counts['inserted'] += 1
                
                conn.commit()
        
        except Exception as e:
            logger.error(f"[html_fetch] Error upserting jobs: {e}")
            conn.rollback()
            raise
        finally:
            conn.close()
        
        logger.info(f"[html_fetch] Upsert complete: {counts}")
        return counts


# Backwards-compatible function wrappers for old code
def fetch_html(url: str) -> Optional[str]:
    """Backwards-compatible sync wrapper (stub - use HTMLCrawler for full functionality)"""
    logger.warning("fetch_html() is deprecated - use HTMLCrawler class")
    return None


def extract_jobs(html: str, base_url: str, parser_hint: Optional[str] = None) -> List[Dict]:
    """Backwards-compatible extraction function"""
    import os
    # Only use PostgreSQL connection strings
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        return []
    
    crawler = HTMLCrawler(db_url)
    return crawler.extract_jobs(html, base_url, parser_hint)


async def upsert_jobs(jobs: List[Dict], source_id: str) -> Dict[str, int]:
    """Backwards-compatible upsert function"""
    import os
    # Only use PostgreSQL connection strings
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        return {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
    
    crawler = HTMLCrawler(db_url)
    return await crawler.upsert_jobs(jobs, source_id)


async def fetch_html_jobs(
    url: str,
    org_name: str,
    org_type: Optional[str] = None,
    parser_hint: Optional[str] = None,
    conn_params: Optional[Dict] = None
) -> List[Dict]:
    """
    Fetch and normalize HTML jobs (wrapper for simulate_extract).
    
    Returns:
        List of normalized job dicts ready for display or upsert
    """
    import os
    
    # Get DB URL
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        logger.warning("[html_fetch] No database URL available")
        return []
    
    # Create crawler
    crawler = HTMLCrawler(db_url)
    
    # Fetch HTML
    status, headers, html, size = await crawler.fetch_html(url)
    
    if status != 200:
        logger.warning(f"[html_fetch] Non-200 status for {url}: {status}")
        return []
    
    # Extract jobs
    raw_jobs = crawler.extract_jobs(html, url, parser_hint)
    
    if not raw_jobs:
        return []
    
    # Normalize jobs
    normalized_jobs = [
        crawler.normalize_job(job, org_name)
        for job in raw_jobs
    ]
    
    return normalized_jobs
