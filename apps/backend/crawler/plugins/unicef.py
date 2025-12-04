"""
UNICEF-specific extraction plugin.
Handles their job listing page structure and filters out category pages.
"""
import re
import logging
from typing import List, Dict, Optional
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from .base import ExtractionPlugin, PluginResult

logger = logging.getLogger(__name__)


class UNICEFPlugin(ExtractionPlugin):
    """Plugin for UNICEF job extraction"""
    
    def __init__(self):
        super().__init__(name="unicef", priority=90)
    
    def can_handle(self, url: str, html: str, config: Optional[Dict] = None) -> bool:
        """Check if this is a UNICEF URL"""
        url_lower = url.lower()
        return 'unicef.org' in url_lower or 'jobs.unicef.org' in url_lower
    
    def extract(self, html: str, base_url: str, config: Optional[Dict] = None) -> PluginResult:
        """Extract UNICEF jobs, filtering out category pages"""
        soup = self.get_soup(html)
        jobs = []
        
        # Category pages to exclude (comprehensive list)
        exclude_patterns = [
            'learning and development', 'compensation', 'benefits', 'wellbeing',
            'job categories', 'where we work', 'work with unicef', 'life at unicef',
            'get prepared', 'diversity and inclusion', 'working in emergencies',
            'beware of fraudulent job offers', 'more jobs', 'send me jobs like these',
            'junior professional officer', 'internship programme', 'united nations volunteers',
            'explore careers', 'stories and news', 'follow us on', 'privacy policy',
            'cookie statement', 'legal', 'accessibility', 'careers homepage',
            'login', 'register', 'career faqs', 'choose language', 'main menu',
            'who we are', 'what we do', 'countries', 'get involved', 'donate',
            'latest', 'freedom, justice, equality', 'let\'s get to work',
            'refine search', 'view list', 'view map', 'filter results', 'programme',
            'type of contract', 'position level', 'functional area', 'contract type',
            'send me jobs', 'job alerts', 'register now', 'subscribe'
        ]
        
        # HTML patterns that indicate category/navigation pages (not jobs)
        category_html_patterns = [
            'class*="filter"', 'class*="refine"', 'class*="search"',
            'class*="category"', 'class*="navigation"', 'class*="menu"',
            'id*="filter"', 'id*="search"', 'id*="category"'
        ]
        
        # Strategy 1: Look for job listing containers with structured data
        # UNICEF jobs typically have: title, location, deadline in a structured format
        # Look for containers that have both "Location:" and "Deadline:" text (real jobs)
        job_selectors = [
            'article', 'div[class*="job"]', 'div[class*="vacancy"]',
            'li[class*="job"]', 'div[class*="listing"]', 'div[class*="result"]',
            'div[class*="card"]', 'div[class*="item"]', 'div[class*="posting"]'
        ]
        
        containers = []
        for selector in job_selectors:
            found = soup.select(selector)
            if found:
                # Filter out category/navigation containers
                for elem in found:
                    elem_text = elem.get_text().lower()
                    elem_html = str(elem).lower()
                    
                    # Skip if it's clearly a category/navigation element
                    is_category = False
                    for pattern in exclude_patterns:
                        if pattern in elem_text:
                            is_category = True
                            break
                    
                    # Skip if HTML indicates it's a filter/navigation element
                    if any(html_pattern.replace('*', '') in elem_html for html_pattern in category_html_patterns):
                        is_category = True
                    
                    # Skip if it's a pagination element
                    if 'more jobs' in elem_text or 'page' in elem_text or 'next' in elem_text or 'previous' in elem_text:
                        is_category = True
                    
                    # Only add if it looks like a real job container
                    if not is_category:
                        # Check if it has job-like content (title + location or deadline)
                        has_title = elem.find(['h2', 'h3', 'h4', 'h5', 'h6', 'a', 'strong'])
                        has_location_or_deadline = 'location:' in elem_text or 'deadline:' in elem_text
                        
                        if has_title and (has_location_or_deadline or len(elem_text) > 100):
                            containers.append(elem)
                            if len(containers) >= 100:
                                break
                
                if containers:
                    logger.info(f"Found {len(containers)} job containers with selector: {selector}")
                    break
        
        # Strategy 2: Look for structured job entries with title, location, deadline pattern
        if not containers:
            # Look for containers that have "Location:" and "Deadline:" text
            all_divs = soup.find_all('div', recursive=True)
            for div in all_divs:
                text = div.get_text().lower()
                # Check if it has both location and deadline indicators
                has_location = 'location:' in text or 'location' in text
                has_deadline = 'deadline:' in text or 'deadline' in text
                
                if has_location and has_deadline:
                    # Check if it has a job title (not a category)
                    title_elem = div.find(['h2', 'h3', 'h4', 'h5', 'h6', 'a', 'strong', 'b'])
                    if title_elem:
                        title_text = title_elem.get_text().strip().lower()
                        if title_text and len(title_text) >= 10:
                            if not any(exclude in title_text for exclude in exclude_patterns):
                                containers.append(div)
                                if len(containers) >= 100:
                                    break
        
        # Strategy 3: Look for job entries by pattern (title with location/deadline nearby)
        if not containers:
            # Find all headings/links that might be job titles
            headings = soup.find_all(['h2', 'h3', 'h4', 'h5', 'h6'])
            for heading in headings:
                title = heading.get_text().strip()
                if not title or len(title) < 10:
                    continue
                
                title_lower = title.lower()
                if any(exclude in title_lower for exclude in exclude_patterns):
                    continue
                
                # Check if nearby text has location/deadline
                parent = heading.parent
                if parent:
                    parent_text = parent.get_text().lower()
                    if ('location' in parent_text or 'deadline' in parent_text) and len(parent_text) < 2000:
                        containers.append(parent)
                        if len(containers) >= 100:
                            break
        
        logger.info(f"Found {len(containers)} potential job containers")
        
        for container in containers:
            # Extract title
            title = None
            title_elem = container.find(['h2', 'h3', 'h4', 'h5', 'h6', 'a', 'strong', 'b'])
            if title_elem:
                title = title_elem.get_text().strip()
            
            # If no title found, try getting first substantial text
            if not title:
                container_text = container.get_text().strip()
                lines = [line.strip() for line in container_text.split('\n') if line.strip()]
                for line in lines[:3]:  # Check first 3 lines
                    if len(line) >= 10 and not any(exclude in line.lower() for exclude in exclude_patterns):
                        title = line
                        break
            
            # If still no title, skip
            if not title or len(title) < 10:
                continue
            
            # CRITICAL: Filter out category pages and navigation elements
            title_lower = title.lower()
            if any(exclude in title_lower for exclude in exclude_patterns):
                logger.debug(f"Excluding category/navigation page: {title[:50]}")
                continue
            
            # CRITICAL: Filter out login/application form pages
            if any(login_term in title_lower for login_term in ['login', 'sign in', 'sign up', 'register', 'candidate login', 'application form']):
                logger.debug(f"Excluding login/registration page: {title[:50]}")
                continue
            
            # CRITICAL: Filter out URLs that are clearly login/application pages
            if apply_url:
                url_lower = apply_url.lower()
                if any(login_url in url_lower for login_url in ['/login', '/signin', '/signup', '/register', '/applicationform', '/default.asp', 'pageuppeople.com', 'secure.dc7']):
                    logger.debug(f"Excluding login/application URL: {apply_url[:80]}")
                    continue
            
            # Check if title looks like a job (has job keywords or is substantial)
            job_keywords = [
                'officer', 'manager', 'consultant', 'specialist', 'coordinator',
                'advisor', 'director', 'analyst', 'engineer', 'consultancy',
                'consultor', 'consultoría', 'position', 'vacancy', 'assignment',
                'programme', 'program', 'assistant', 'associate', 'expert',
                'representative', 'administrator', 'supervisor', 'lead'
            ]
            has_job_keyword = any(kw in title_lower for kw in job_keywords)
            
            # CRITICAL: Reject if title is too generic or looks like navigation
            generic_titles = ['candidate', 'login', 'register', 'apply', 'search', 'filter', 'view', 'more', 'next', 'previous']
            if title_lower in generic_titles or len(title_lower.split()) <= 2:
                logger.debug(f"Excluding - too generic or too short: {title[:50]}")
                continue
            
            # Allow if has job keyword OR title is substantial (30+ chars)
            if not has_job_keyword and len(title) < 30:
                logger.debug(f"Excluding - no job keywords and too short: {title[:50]}")
                continue
            
            # Extract apply URL
            apply_url = None
            link = container.find('a', href=True)
            if link:
                href = link.get('href', '')
                if href and not href.startswith('#') and not href.startswith('javascript:'):
                    apply_url = urljoin(base_url, href)
            
            # If no link in container, look for link with title text
            if not apply_url:
                all_links = container.find_all('a', href=True)
                for link in all_links:
                    link_text = link.get_text().strip()
                    # If link text matches title or is substantial
                    if (title_lower in link_text.lower() or link_text.lower() in title_lower or 
                        len(link_text) >= 15):
                        href = link.get('href', '')
                        if href and not href.startswith('#') and not href.startswith('javascript:'):
                            apply_url = urljoin(base_url, href)
                            break
            
            if not apply_url:
                logger.debug(f"No apply URL found for: {title[:50]}")
                continue
            
            # Extract location from listing page
            location = None
            container_text = container.get_text()
            location_patterns = [
                r'Location[:\s]+([^\n\r<]+?)(?:\s+Deadline|$)',
                r'Location[:\s]+([A-Z][a-zA-Z\s,/]+?)(?:\s+Deadline|$)',
            ]
            for pattern in location_patterns:
                location_match = re.search(pattern, container_text, re.IGNORECASE)
                if location_match:
                    location = location_match.group(1).strip()
                    # Clean up HTML tags if any
                    location = re.sub(r'<[^>]+>', '', location).strip()
                    # Remove trailing metadata (deadline, etc.)
                    location = re.sub(r'\s*Deadline.*$', '', location, flags=re.IGNORECASE).strip()
                    location = re.sub(r'\s*div_location.*$', '', location, flags=re.IGNORECASE).strip()
                    # Remove HTML artifacts
                    location = re.sub(r'div_location_\d+', '', location, flags=re.IGNORECASE).strip()
                    if 3 <= len(location) <= 100 and location.lower() not in ['n/a', 'na', 'tbd']:
                        break
                    else:
                        location = None
            
            # If location is still an HTML artifact, clear it (will be extracted from detail page)
            if location and ('div_location' in location.lower() or location.lower() in ['n/a', 'na']):
                location = None
            
            # Extract deadline
            deadline = None
            deadline_patterns = [
                r'Deadline[:\s]+([^\n\r<]+)',
                r'Deadline[:\s]+(\d{1,2}\s+\w{3}\s+\d{4})',
            ]
            for pattern in deadline_patterns:
                deadline_match = re.search(pattern, container_text, re.IGNORECASE)
                if deadline_match:
                    deadline_text = deadline_match.group(1).strip()
                    deadline_text = re.sub(r'<[^>]+>', '', deadline_text).strip()
                    # Parse deadline (format: "12 Dec 2025 11:55 PM" or "12 Dec 2025")
                    deadline = self._parse_deadline(deadline_text)
                    if deadline:
                        break
            
            job = {
                'title': title,
                'apply_url': apply_url,
                'location_raw': location,
                'deadline': deadline
            }
            
            jobs.append(job)
        
        logger.info(f"UNICEF extraction found {len(jobs)} jobs")
        return PluginResult(
            jobs=jobs,
            confidence=0.9 if jobs else 0.5,
            message=f"Extracted {len(jobs)} UNICEF jobs"
        )
    
    def _parse_deadline(self, text: str) -> Optional[str]:
        """Parse deadline text to YYYY-MM-DD format"""
        if not text:
            return None
        
        text = text.strip()
        
        # Format: "12 Dec 2025 11:55 PM" -> "2025-12-12"
        # Format: "12 Dec 2025" -> "2025-12-12"
        match = re.search(r'(\d{1,2})\s+(\w{3,9})\s+(\d{4})', text)
        if match:
            day, month_str, year = match.groups()
            month_map = {
                'january': 1, 'jan': 1,
                'february': 2, 'feb': 2,
                'march': 3, 'mar': 3,
                'april': 4, 'apr': 4,
                'may': 5,
                'june': 6, 'jun': 6,
                'july': 7, 'jul': 7,
                'august': 8, 'aug': 8,
                'september': 9, 'sep': 9, 'sept': 9,
                'october': 10, 'oct': 10,
                'november': 11, 'nov': 11,
                'december': 12, 'dec': 12
            }
            month = month_map.get(month_str.lower())
            if month:
                try:
                    from datetime import datetime
                    return datetime(int(year), month, int(day)).strftime('%Y-%m-%d')
                except:
                    pass
        
        return None

