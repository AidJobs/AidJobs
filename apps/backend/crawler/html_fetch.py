"""
HTML crawler for job listings.
"""
import hashlib
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

from app.db_config import db_config

logger = logging.getLogger(__name__)

USER_AGENT = "AidJobs/1.0 (+https://aidjobs.org; job crawler)"
REQUEST_TIMEOUT = 15


def fetch_html(url: str) -> Optional[str]:
    """
    Fetch HTML from a URL with timeout and user agent.
    
    Args:
        url: The URL to fetch
        
    Returns:
        HTML content as string, or None if fetch failed
    """
    try:
        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        
        return response.text
    except requests.RequestException as e:
        logger.error(f"Failed to fetch {url}: {e}")
        return None


def extract_jobs(html: str, base_url: str) -> List[Dict[str, Any]]:
    """
    Extract job listings from HTML.
    
    This is a minimal generic extractor that looks for common job listing patterns.
    For production use, implement source-specific extractors.
    
    Args:
        html: HTML content
        base_url: Base URL for resolving relative links
        
    Returns:
        List of job dictionaries with keys: title, org_name, location_raw, 
        apply_url, description_snippet, deadline
    """
    jobs = []
    
    try:
        soup = BeautifulSoup(html, 'html.parser')
        
        # Generic job listing extraction
        # Look for common patterns: job cards, listings, etc.
        # This is a simple heuristic - customize per source for better results
        
        job_elements = []
        
        # Try common selectors
        selectors = [
            'article[class*="job"]',
            'div[class*="job-listing"]',
            'div[class*="job-item"]',
            'li[class*="job"]',
            'tr[class*="job"]',
            '.job-card',
            '.position',
            '.vacancy',
        ]
        
        for selector in selectors:
            elements = soup.select(selector)
            if elements:
                job_elements = elements
                break
        
        # If no specific job elements found, look for links with job-related text
        if not job_elements:
            all_links = soup.find_all('a', href=True)
            for link in all_links:
                text = link.get_text(strip=True).lower()
                href = link.get('href', '')
                
                # Basic heuristic: link text contains job-related keywords
                if any(keyword in text for keyword in ['apply', 'position', 'vacancy', 'opportunity', 'career']):
                    job_elements.append(link.parent or link)
        
        # Extract job data from elements
        for element in job_elements[:50]:  # Limit to first 50
            try:
                job_data = _extract_job_from_element(element, base_url)
                if job_data and job_data.get('title'):
                    jobs.append(job_data)
            except Exception as e:
                logger.debug(f"Failed to extract job from element: {e}")
                continue
        
        logger.info(f"Extracted {len(jobs)} jobs from HTML")
        
    except Exception as e:
        logger.error(f"Failed to parse HTML: {e}")
    
    return jobs


def _extract_job_from_element(element, base_url: str) -> Optional[Dict[str, Any]]:
    """Extract job data from a single HTML element."""
    job = {}
    
    # Extract title
    title_elem = element.find(['h1', 'h2', 'h3', 'h4', 'a'])
    if title_elem:
        job['title'] = title_elem.get_text(strip=True)
    else:
        return None
    
    # Extract apply URL
    link = element.find('a', href=True)
    if link:
        job['apply_url'] = urljoin(base_url, link.get('href'))
    else:
        job['apply_url'] = base_url
    
    # Extract organization name (if available)
    org_elem = element.find(['span', 'div'], class_=lambda c: c and ('org' in c.lower() or 'company' in c.lower()))
    job['org_name'] = org_elem.get_text(strip=True) if org_elem else None
    
    # Extract location
    location_elem = element.find(['span', 'div'], class_=lambda c: c and 'location' in c.lower())
    if not location_elem:
        location_elem = element.find(string=lambda t: t and any(word in t.lower() for word in ['location:', 'based in']))
    
    if location_elem:
        # Handle both Tag and NavigableString types
        try:
            job['location_raw'] = location_elem.get_text(strip=True)
        except AttributeError:
            # location_elem is a NavigableString (text node)
            job['location_raw'] = str(location_elem).strip()
    else:
        job['location_raw'] = None
    
    # Extract description snippet
    desc_elem = element.find(['p', 'div'], class_=lambda c: c and ('desc' in c.lower() or 'summary' in c.lower()))
    if desc_elem:
        job['description_snippet'] = desc_elem.get_text(strip=True)[:500]
    else:
        # Fallback: use element text
        job['description_snippet'] = element.get_text(strip=True)[:500]
    
    # Extract deadline (if available)
    deadline_elem = element.find(string=lambda t: t and any(word in t.lower() for word in ['deadline', 'closing date', 'apply by']))
    job['deadline'] = None  # Would need date parsing here
    
    return job


def compute_canonical_hash(job: Dict[str, Any]) -> str:
    """
    Compute a canonical hash for a job to detect duplicates.
    
    Args:
        job: Job dictionary
        
    Returns:
        SHA256 hash as hex string
    """
    # Create a stable canonical representation
    canonical_parts = [
        job.get('title', '').strip().lower(),
        job.get('org_name', '').strip().lower(),
        job.get('apply_url', '').strip().lower(),
    ]
    
    canonical_string = '|'.join(canonical_parts)
    return hashlib.sha256(canonical_string.encode('utf-8')).hexdigest()


def upsert_jobs(items: List[Dict[str, Any]], source_id: str) -> Dict[str, int]:
    """
    Insert or update jobs in the database.
    
    Args:
        items: List of job dictionaries
        source_id: UUID of the source
        
    Returns:
        Dictionary with keys: found, inserted, updated, skipped
    """
    if not psycopg2:
        raise RuntimeError("Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise RuntimeError("Database not configured")
    
    stats = {
        'found': len(items),
        'inserted': 0,
        'updated': 0,
        'skipped': 0,
    }
    
    conn = None
    try:
        conn = psycopg2.connect(**conn_params)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        for job in items:
            try:
                # Normalize and compute hash
                canonical_hash = compute_canonical_hash(job)
                
                # Check if job exists
                cursor.execute(
                    "SELECT id, updated_at FROM jobs WHERE canonical_hash = %s",
                    (canonical_hash,)
                )
                existing = cursor.fetchone()
                
                if existing:
                    # Update last_seen_at
                    cursor.execute(
                        """
                        UPDATE jobs 
                        SET last_seen_at = NOW(), updated_at = NOW()
                        WHERE canonical_hash = %s
                        """,
                        (canonical_hash,)
                    )
                    stats['updated'] += 1
                else:
                    # Insert new job
                    cursor.execute(
                        """
                        INSERT INTO jobs (
                            source_id, org_name, title, location_raw, apply_url,
                            description_snippet, canonical_hash, fetched_at, last_seen_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                        """,
                        (
                            source_id,
                            job.get('org_name'),
                            job.get('title'),
                            job.get('location_raw'),
                            job.get('apply_url'),
                            job.get('description_snippet'),
                            canonical_hash,
                        )
                    )
                    stats['inserted'] += 1
                
            except Exception as e:
                logger.error(f"Failed to upsert job {job.get('title')}: {e}")
                stats['skipped'] += 1
                continue
        
        conn.commit()
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error during upsert: {e}")
        raise
    finally:
        if conn:
            cursor.close()
            conn.close()
    
    return stats
