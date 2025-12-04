"""
Save the Children-specific extraction plugin.
Uses browser rendering for JavaScript-heavy ATS (UltiPro/PageUp).
"""
import logging
import re
from typing import List, Dict, Optional
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from .base import ExtractionPlugin, PluginResult

logger = logging.getLogger(__name__)


class SaveTheChildrenPlugin(ExtractionPlugin):
    """Plugin for Save the Children job extraction"""
    
    def __init__(self):
        super().__init__(name="save_the_children", priority=85)
    
    def can_handle(self, url: str, html: str, config: Optional[Dict] = None) -> bool:
        """Check if this is a Save the Children URL"""
        url_lower = url.lower()
        return ('savethechildren' in url_lower or 
                'ultipro.com' in url_lower or 
                'pageup' in url_lower or
                'SAV1002STCF' in url)
    
    def extract(self, html: str, base_url: str, config: Optional[Dict] = None) -> PluginResult:
        """Extract Save the Children jobs using browser rendering"""
        # This site requires JavaScript rendering
        # For now, try to extract from static HTML
        # TODO: Implement async browser rendering in the crawler layer
        soup = self.get_soup(html)
        
        # Check if we have usable content
        if 'unsupported browser' in html.lower():
            logger.warning("Save the Children site requires browser rendering")
            return PluginResult(jobs=[], confidence=0.0, message="Site requires JavaScript rendering")
        
        jobs = []
        
        # Look for job listings in various structures
        job_selectors = [
            'div[class*="job"]', 'tr[class*="job"]', 'li[class*="job"]',
            'article[class*="job"]', 'div[class*="position"]', 'div[class*="vacancy"]',
            'table tbody tr', 'div[class*="result"]', 'div[class*="listing"]'
        ]
        
        containers = []
        for selector in job_selectors:
            found = soup.select(selector)
            if found and len(found) >= 2:
                containers.extend(found[:100])
                break
        
        for container in containers:
            # Extract title
            title_elem = container.find(['h2', 'h3', 'h4', 'a', 'strong', 'td'])
            if not title_elem:
                continue
            
            title = title_elem.get_text().strip()
            if not title or len(title) < 10:
                continue
            
            # Filter out non-job content
            exclude_patterns = [
                'privacy policy', 'unsupported browser', 'save the children',
                'job board', 'search', 'filter', 'sort'
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
            
            # Extract deadline
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
        
        logger.info(f"Save the Children extraction found {len(jobs)} jobs")
        return PluginResult(
            jobs=jobs,
            confidence=0.85 if jobs else 0.5,
            message=f"Extracted {len(jobs)} Save the Children jobs"
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

