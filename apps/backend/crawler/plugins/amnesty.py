"""
Amnesty International-specific extraction plugin.
Uses browser rendering for JavaScript-heavy site.
"""
import logging
import re
from typing import List, Dict, Optional
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from .base import ExtractionPlugin, PluginResult

logger = logging.getLogger(__name__)


class AmnestyPlugin(ExtractionPlugin):
    """Plugin for Amnesty International job extraction"""
    
    def __init__(self):
        super().__init__(name="amnesty", priority=85)
        self._browser_crawler = None
    
    def can_handle(self, url: str, html: str, config: Optional[Dict] = None) -> bool:
        """Check if this is an Amnesty International URL"""
        url_lower = url.lower()
        return 'amnesty.org' in url_lower or 'careers.amnesty.org' in url_lower
    
    def extract(self, html: str, base_url: str, config: Optional[Dict] = None) -> PluginResult:
        """Extract Amnesty jobs using browser rendering if needed"""
        soup = self.get_soup(html)
        
        # Check if page has loaded jobs (look for job listings)
        job_containers = soup.select('div[class*="job"], article[class*="job"], li[class*="job"], div[class*="vacancy"]')
        
        # If no jobs found in HTML, note that browser rendering would be needed
        # For now, extract what we can from static HTML
        # TODO: Implement async browser rendering in the crawler layer
        if not job_containers or len(job_containers) < 2:
            logger.info("No jobs found in static HTML - Amnesty site requires JavaScript rendering")
            # Try to find any job-like content
            job_containers = soup.select('div, article, li, tr')
        
        jobs = []
        
        # Extract jobs from containers
        for container in job_containers[:100]:  # Limit to first 100
            # Extract title
            title_elem = container.find(['h2', 'h3', 'h4', 'h5', 'a', 'strong'])
            if not title_elem:
                continue
            
            title = title_elem.get_text().strip()
            if not title or len(title) < 10:
                continue
            
            # Filter out non-job content
            exclude_patterns = [
                'job alerts', 'register now', 'follow us', 'privacy policy',
                'cookie statement', 'main menu', 'skip to', 'choose language'
            ]
            title_lower = title.lower()
            if any(exclude in title_lower for exclude in exclude_patterns):
                continue
            
            # Extract apply URL
            apply_url = None
            link = container.find('a', href=True)
            if link:
                href = link.get('href', '')
                if href and not href.startswith('#') and not href.startswith('javascript:'):
                    apply_url = urljoin(base_url, href)
            
            if not apply_url:
                continue
            
            # Extract location
            location = None
            container_text = container.get_text()
            location_match = re.search(r'Location[:\s]+([^\n\r<]+)', container_text, re.IGNORECASE)
            if location_match:
                location = location_match.group(1).strip()
                location = re.sub(r'<[^>]+>', '', location).strip()
                if 3 <= len(location) <= 100:
                    pass
                else:
                    location = None
            
            # Extract deadline if available
            deadline = None
            deadline_match = re.search(r'Deadline[:\s]+([^\n\r<]+)', container_text, re.IGNORECASE)
            if deadline_match:
                deadline_text = deadline_match.group(1).strip()
                deadline = self._parse_deadline(deadline_text)
            
            job = {
                'title': title,
                'apply_url': apply_url,
                'location_raw': location,
                'deadline': deadline
            }
            
            jobs.append(job)
        
        logger.info(f"Amnesty extraction found {len(jobs)} jobs")
        return PluginResult(
            jobs=jobs,
            confidence=0.85 if jobs else 0.5,
            message=f"Extracted {len(jobs)} Amnesty jobs"
        )
    
    def _parse_deadline(self, text: str) -> Optional[str]:
        """Parse deadline text to YYYY-MM-DD format"""
        if not text:
            return None
        
        # Try common date formats
        match = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', text)
        if match:
            day, month, year = match.groups()
            try:
                from datetime import datetime
                year_int = int(year)
                if year_int < 100:
                    year_int += 2000 if year_int < 50 else 1900
                return datetime(year_int, int(month), int(day)).strftime('%Y-%m-%d')
            except:
                pass
        
        return None

