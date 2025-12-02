"""
RSS/Atom feed crawler
"""
import logging
import hashlib
from typing import List, Dict, Optional
from urllib.parse import urlparse
from datetime import datetime, timedelta
import feedparser
from dateutil import parser as date_parser

from core.net import HTTPClient
from core.job_categorizer import JobCategorizer

logger = logging.getLogger(__name__)


class RSSCrawler:
    """RSS/Atom feed crawler"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.http_client = HTTPClient()
    
    async def fetch_feed(self, url: str) -> List[Dict]:
        """
        Fetch and parse RSS/Atom feed.
        
        Returns:
            List of raw job dicts
        """
        try:
            status, headers, body, size = await self.http_client.fetch(url, max_size_kb=512)
            
            if status != 200:
                logger.warning(f"[rss_fetch] Non-200 status for {url}: {status}")
                return []
            
            # Parse feed
            feed_text = body.decode('utf-8', errors='ignore')
            feed = feedparser.parse(feed_text)
            
            if not feed.entries:
                logger.warning(f"[rss_fetch] No entries found in feed: {url}")
                return []
            
            jobs = []
            for entry in feed.entries:
                job = self._parse_entry(entry, url)
                if job:
                    jobs.append(job)
            
            logger.info(f"[rss_fetch] Parsed {len(jobs)} jobs from {url}")
            return jobs
        
        except Exception as e:
            logger.error(f"[rss_fetch] Error fetching feed {url}: {e}")
            return []
    
    def _parse_entry(self, entry, feed_url: str) -> Optional[Dict]:
        """Parse a single RSS entry to job dict"""
        job = {}
        
        # Title
        job['title'] = entry.get('title', '').strip()
        if not job['title']:
            return None
        
        # Apply URL
        job['apply_url'] = entry.get('link', feed_url)
        
        # Description
        if 'summary' in entry:
            job['description_snippet'] = entry.summary[:500]
        elif 'description' in entry:
            job['description_snippet'] = entry.description[:500]
        else:
            job['description_snippet'] = job['title']
        
        # Published date -> deadline (heuristic: +30 days)
        if 'published_parsed' in entry and entry.published_parsed:
            try:
                pub_date = datetime(*entry.published_parsed[:6])
                # Assume deadline is 30 days after publish
                job['deadline'] = (pub_date + timedelta(days=30)).date()
            except:
                pass
        
        # Enhanced location extraction from description
        job['location_raw'] = None
        description_text = job.get('description_snippet', '') or job.get('title', '')
        if description_text:
            # Look for location patterns in description
            location_patterns = [
                r'Location[:\s]+([A-Z][a-zA-Z\s,]+)',
                r'Duty Station[:\s]+([A-Z][a-zA-Z\s,]+)',
                r'Based in[:\s]+([A-Z][a-zA-Z\s,]+)',
                r'([A-Z][a-zA-Z\s]+),\s*([A-Z][a-zA-Z\s]+)',  # City, Country
            ]
            
            for pattern in location_patterns:
                match = re.search(pattern, description_text, re.IGNORECASE)
                if match:
                    location = match.group(1) if match.lastindex >= 1 else match.group(0)
                    # Clean location
                    location = re.sub(r'^(Location|Duty Station|Based in)[:\s]+', '', location, flags=re.I).strip()
                    # Validate it's not a job title
                    job_keywords = ['director', 'manager', 'officer', 'specialist', 'assistant']
                    if location and len(location) >= 3 and not any(kw in location.lower() for kw in job_keywords):
                        job['location_raw'] = location
                        break
        
        # Enhanced deadline extraction from description
        if not job.get('deadline') and description_text:
            deadline_patterns = [
                r'Deadline[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
                r'Closing Date[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
                r'Apply by[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
                r'Application Deadline[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
            ]
            
            for pattern in deadline_patterns:
                match = re.search(pattern, description_text, re.IGNORECASE)
                if match:
                    try:
                        parsed = date_parser.parse(match.group(1), fuzzy=True)
                        if parsed.date() > datetime.now().date():
                            job['deadline'] = parsed.date()
                            break
                    except:
                        continue
        
        # Org name
        job['org_name'] = None
        if 'author' in entry:
            job['org_name'] = entry.author
        
        return job
    
    def normalize_job(self, raw_job: Dict, source_org_name: Optional[str] = None) -> Dict:
        """
        Normalize a raw RSS job dict to canonical fields.
        Mirrors html_fetch.HTMLCrawler.normalize_job logic.
        """
        job = raw_job.copy()
        
        # Use source org_name if not present
        if not job.get('org_name') and source_org_name:
            job['org_name'] = source_org_name
        
        # Normalize title
        title_lower = job.get('title', '').lower()
        description_lower = job.get('description_snippet', '').lower()
        
        # Determine level_norm using enterprise categorizer
        # Infer org_type from source_org_name
        org_type = None
        if source_org_name:
            source_lower = source_org_name.lower()
            if any(un in source_lower for un in ['un', 'united nations', 'undp', 'unicef', 'unhcr', 'unesco', 'who']):
                org_type = 'un'
            elif any(ingo in source_lower for ingo in ['international', 'global', 'world', 'care', 'save', 'oxfam']):
                org_type = 'ingo'
        
        job['level_norm'] = JobCategorizer.categorize_from_title_and_description(
            title=job.get('title'),
            description=job.get('description_snippet'),
            org_type=org_type
        )
        
        # Determine career_type
        job['career_type'] = None
        if any(kw in title_lower for kw in ['consult', 'consultant']):
            job['career_type'] = 'consultancy'
        elif any(kw in title_lower for kw in ['fellow', 'fellowship']):
            job['career_type'] = 'fellowship'
        elif any(kw in title_lower for kw in ['intern', 'internship']):
            job['career_type'] = 'internship'
        else:
            job['career_type'] = 'staff'
        
        # Determine work_modality
        job['work_modality'] = 'onsite'  # default
        if any(kw in title_lower for kw in ['remote', 'telework', 'work from home']):
            job['work_modality'] = 'remote'
        elif any(kw in title_lower for kw in ['hybrid']):
            job['work_modality'] = 'hybrid'
        
        # Parse location -> country_iso (basic mapping)
        location_raw = job.get('location_raw', '')
        job['country_iso'] = self._parse_country_iso(location_raw)
        job['country_name'] = None
        
        # Mission tags (keyword extraction)
        job['mission_tags'] = self._extract_mission_tags(description_lower)
        
        # International eligible
        job['international_eligible'] = (
            job['work_modality'] == 'remote' or
            'international' in title_lower or
            'global' in title_lower
        )
        
        # Generate canonical hash
        job['canonical_hash'] = self._generate_canonical_hash(job)
        
        return job
    
    def _parse_country_iso(self, location: Optional[str]) -> Optional[str]:
        """Parse country ISO code from location string"""
        if not location:
            return None
        
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
            if any(kw in text for kw in keywords):
                tags.append(tag)
        
        return tags[:3]  # Limit to 3 tags
    
    def _generate_canonical_hash(self, job: Dict) -> str:
        """Generate canonical hash for deduplication"""
        canonical_str = f"{job.get('title', '')}|{job.get('org_name', '')}|{job.get('location_raw', '')}"
        return hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()[:16]


async def fetch_rss_jobs(
    url: str,
    org_name: str,
    org_type: Optional[str] = None,
    time_window_days: Optional[int] = None,
    conn_params: Optional[Dict] = None
) -> List[Dict]:
    """
    Fetch and normalize RSS jobs (wrapper for simulate_extract).
    
    Returns:
        List of normalized job dicts ready for display or upsert
    """
    import os
    
    # Get DB URL
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        logger.warning("[rss_fetch] No database URL available")
        return []
    
    # Fetch raw jobs
    rss_crawler = RSSCrawler(db_url)
    raw_jobs = await rss_crawler.fetch_feed(url)
    
    if not raw_jobs:
        return []
    
    # Filter by time window if specified
    if time_window_days:
        cutoff = datetime.utcnow() - timedelta(days=time_window_days)
        filtered_jobs = []
        for job in raw_jobs:
            if job.get('deadline'):
                try:
                    deadline_dt = datetime.combine(job['deadline'], datetime.min.time())
                    if deadline_dt >= cutoff:
                        filtered_jobs.append(job)
                except:
                    filtered_jobs.append(job)
            else:
                filtered_jobs.append(job)
        raw_jobs = filtered_jobs
    
    # Normalize jobs using RSS crawler's normalize_job method
    normalized_jobs = [
        rss_crawler.normalize_job(job, org_name)
        for job in raw_jobs
    ]
    
    return normalized_jobs
