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
import re
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
    
    Now supports AI-powered extraction as primary method with rule-based fallback.
    """
    
    def __init__(self, db_url: str, use_ai: bool = True):
        self.db_url = db_url
        self.timeout = httpx.Timeout(30.0)
        self.user_agent = "Mozilla/5.0 (compatible; AidJobs/1.0; +https://aidjobs.app)"
        self.use_ai = use_ai
        
        # Initialize AI extractor if available
        self.ai_extractor = None
        if use_ai:
            try:
                from core.ai_extractor import AIJobExtractor
                self.ai_extractor = AIJobExtractor()
                logger.info("AI extractor initialized")
            except Exception as e:
                logger.warning(f"AI extractor not available: {e}")
                self.use_ai = False
        
        # Initialize AI-powered strategy selector
        self.strategy_selector = None
        try:
            from core.strategy_selector import StrategySelector
            self.strategy_selector = StrategySelector(ai_extractor=self.ai_extractor)
            logger.info("Strategy selector initialized")
        except Exception as e:
            logger.warning(f"Strategy selector not available: {e}")
        
        # Initialize HTML storage (Phase 2)
        self.html_storage = None
        try:
            from core.html_storage import get_html_storage
            self.html_storage = get_html_storage()
            logger.info("HTML storage initialized")
        except Exception as e:
            logger.warning(f"HTML storage not available: {e}")
        
        # Initialize extraction logger (Phase 2)
        self.extraction_logger = None
        try:
            from core.extraction_logger import ExtractionLogger
            self.extraction_logger = ExtractionLogger(db_url)
            logger.info("Extraction logger initialized")
        except Exception as e:
            logger.warning(f"Extraction logger not available: {e}")
        
        # Initialize AI normalizer (Phase 3)
        self.ai_normalizer = None
        try:
            from core.ai_normalizer import get_ai_normalizer
            self.ai_normalizer = get_ai_normalizer()
            if self.ai_normalizer:
                logger.info("AI normalizer initialized")
            else:
                logger.debug("AI normalizer not available (OPENROUTER_API_KEY not set)")
        except Exception as e:
            logger.warning(f"AI normalizer not available: {e}")
        
        # Initialize geocoder (Phase 4)
        self.geocoder = None
        try:
            from core.geocoder import get_geocoder
            self.geocoder = get_geocoder()
            logger.info("Geocoder initialized")
        except Exception as e:
            logger.warning(f"Geocoder not available: {e}")
        
        # Initialize quality scorer (Phase 4)
        self.quality_scorer = None
        try:
            from core.data_quality import get_quality_scorer
            self.quality_scorer = get_quality_scorer()
            logger.info("Quality scorer initialized")
        except Exception as e:
            logger.warning(f"Quality scorer not available: {e}")
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    async def fetch_html(self, url: str, retry_count: int = 0, use_browser: bool = False) -> Tuple[int, str]:
        """
        Fetch HTML from URL with retry logic for 403 errors.
        
        Args:
            url: URL to fetch
            retry_count: Number of retries attempted
            use_browser: If True, use browser rendering for JavaScript-heavy sites
        
        Returns:
            (status_code, html_content)
        """
        # Check if browser rendering is needed
        if use_browser:
            try:
                from crawler.browser_crawler import BrowserCrawler
                browser_crawler = BrowserCrawler()
                html = await browser_crawler.fetch_html(url, timeout=30000)
                if html:
                    return 200, html
                else:
                    logger.warning(f"Browser rendering returned no HTML for {url}")
            except ImportError:
                logger.warning("Playwright not installed - browser rendering unavailable")
            except Exception as e:
                logger.warning(f"Browser rendering failed: {e}, falling back to HTTP")
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                # Use more realistic headers to avoid 403 blocks
                headers = {
                    "User-Agent": self.user_agent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Upgrade-Insecure-Requests": "1",
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "none",
                    "Cache-Control": "max-age=0"
                }
                response = await client.get(url, headers=headers)
                
                # If 403 and we haven't retried, try with different User-Agent
                if response.status_code == 403 and retry_count < 2:
                    import asyncio
                    await asyncio.sleep(2)  # Wait before retry
                    # Try with a different, more common User-Agent
                    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    logger.info(f"Retrying {url} with different User-Agent (attempt {retry_count + 1})")
                    return await self.fetch_html(url, retry_count + 1)
                
                # Check if page requires JavaScript (common indicators)
                html_text = response.text.lower()
                if any(indicator in html_text for indicator in [
                    'unsupported browser', 'javascript required', 'enable javascript',
                    'loading...', 'please wait', 'pageup', 'ultipro'
                ]):
                    logger.info(f"Page appears to require JavaScript, attempting browser rendering for {url}")
                    # Try browser rendering as fallback
                    if not use_browser:
                        return await self.fetch_html(url, retry_count, use_browser=True)
                
                return response.status_code, response.text
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return 0, ""
    
    def extract_jobs_from_html(self, html: str, base_url: str) -> List[Dict]:
        """
        Extract jobs from HTML using AI-powered strategy selection.
        
        Uses intelligent strategy selection that:
        1. Tries JSON-LD structured data FIRST (most reliable)
        2. Analyzes HTML structure to choose the best strategy
        3. Tries recommended strategy
        4. Falls back to other strategies if needed
        5. Validates and normalizes results for consistency
        6. Maintains quality across all sources
        """
        soup = BeautifulSoup(html, 'html.parser')
        
        # PRIORITY 1: Try JSON-LD structured data FIRST (most reliable source)
        logger.info("Trying JSON-LD structured data extraction (priority)...")
        jobs = self._extract_from_structured_data(soup, base_url)
        if jobs:
            logger.info(f"JSON-LD extraction found {len(jobs)} jobs")
            return jobs
        
        # Use AI-powered strategy selector if available
        if self.strategy_selector:
            try:
                # Prepare strategy functions
                strategies = {
                    'tables': lambda h, b: self._extract_from_tables(BeautifulSoup(h, 'html.parser'), b),
                    'divs': lambda h, b: self._extract_from_divs_lists(BeautifulSoup(h, 'html.parser'), b),
                    'links': lambda h, b: self._extract_from_links(BeautifulSoup(h, 'html.parser'), b),
                    'structured': lambda h, b: self._extract_from_structured_data(BeautifulSoup(h, 'html.parser'), b),
                    'generic': lambda h, b: self._extract_generic_fallback(BeautifulSoup(h, 'html.parser'), b)
                }
                
                # Use strategy selector (now sync method)
                jobs, metadata = self.strategy_selector.select_and_validate(html, base_url, strategies)
                
                logger.info(f"Strategy selector: {metadata.get('strategy_used', 'unknown')} "
                          f"extracted {len(jobs)} jobs (validated from {metadata.get('original_count', 0)})")
                
                if metadata.get('warnings'):
                    logger.warning(f"Validation warnings: {len(metadata['warnings'])} warnings")
                
                return jobs
            except Exception as e:
                logger.warning(f"Strategy selector failed, falling back to sequential: {e}")
                # Fall through to sequential strategy
        
        # Fallback: Sequential strategy selection (original behavior)
        jobs = []
        
        # Strategy 1: Table-based extraction (for UNESCO-style sites)
        logger.info("Trying table-based extraction...")
        jobs = self._extract_from_tables(soup, base_url)
        if jobs:
            logger.info(f"Strategy 1 (tables) found {len(jobs)} jobs")
            return jobs
        
        # Strategy 2: Div/list-based extraction (for UNDP-style sites)
        logger.info("Trying div/list-based extraction...")
        jobs = self._extract_from_divs_lists(soup, base_url)
        if jobs:
            logger.info(f"Strategy 2 (divs/lists) found {len(jobs)} jobs")
            return jobs
        
        # Strategy 3: Link-based extraction (for MSF-style sites)
        logger.info("Trying link-based extraction...")
        jobs = self._extract_from_links(soup, base_url)
        if jobs:
            logger.info(f"Strategy 3 (links) found {len(jobs)} jobs")
            return jobs
        
        # Strategy 4: Structured data (JSON-LD, microdata)
        logger.info("Trying structured data extraction...")
        jobs = self._extract_from_structured_data(soup, base_url)
        if jobs:
            logger.info(f"Strategy 4 (structured data) found {len(jobs)} jobs")
            return jobs
        
        # Strategy 5: Generic fallback - extract any substantial links from main content
        logger.info("Trying generic fallback extraction...")
        jobs = self._extract_generic_fallback(soup, base_url)
        if jobs:
            logger.info(f"Strategy 5 (generic fallback) found {len(jobs)} jobs")
            return jobs
        
        logger.warning("No extraction strategy found jobs")
        return []
    
    def _extract_from_tables(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """Extract jobs from HTML tables (UNESCO-style)"""
        jobs = []
        tables = soup.find_all('table')
        logger.info(f"Found {len(tables)} tables")
        
        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:
                continue
            
            # Find header row
            header_row = None
            header_map = {}
            
            for row in rows[:5]:
                cells = row.find_all(['th', 'td'])
                if not cells:
                    continue
                
                cell_texts = [c.get_text().strip().lower() for c in cells]
                header_keywords = ['title', 'position', 'location', 'deadline', 'closing', 'apply', 'date', 'grade', 'type']
                keyword_count = sum(1 for text in cell_texts for kw in header_keywords if kw in text)
                
                # Also check if row has mostly <th> tags (strong indicator of header)
                th_count = len(row.find_all('th'))
                td_count = len(row.find_all('td'))
                is_likely_header = th_count > td_count or keyword_count >= 2
                
                if is_likely_header:
                    header_row = row
                    for idx, cell in enumerate(cells):
                        text = cell.get_text().strip().lower()
                        # More flexible matching
                        if 'title' in text or 'position' in text or 'job' in text:
                            header_map[idx] = 'title'
                        elif 'location' in text or 'duty' in text or 'station' in text:
                            header_map[idx] = 'location'
                        elif 'deadline' in text or 'closing' in text or 'apply by' in text or ('date' in text and ('closing' in text or 'apply' in text)):
                            header_map[idx] = 'deadline'
                    break
            
            if not header_map:
                continue
            
            # Extract data rows
            for row in rows:
                if row == header_row:
                    continue
                
                cells = row.find_all(['td', 'th'])
                if len(cells) < 1:  # At least 1 cell (more lenient)
                    continue
                
                job = {}
                
                # Extract title from link (preferred)
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
                                # Clean text - remove "Job Title" prefix if present
                                text = re.sub(r'^Job Title\s*', '', text, flags=re.IGNORECASE).strip()
                                # Remove "Apply by" and "Location" if they got mixed in
                                text = re.sub(r'\s*Apply by.*$', '', text, flags=re.IGNORECASE).strip()
                                text = re.sub(r'\s*Location.*$', '', text, flags=re.IGNORECASE).strip()
                                if text and len(text) >= 5:
                                    job['title'] = text
                                # If no link found, try to find link in this cell
                                if 'apply_url' not in job:
                                    cell_link = cell.find('a', href=True)
                                    if cell_link:
                                        href = cell_link.get('href', '')
                                        if href and not href.startswith('#') and not href.startswith('javascript:'):
                                            job['apply_url'] = urljoin(base_url, href)
                        elif field == 'location':
                            if text and len(text) >= 3:
                                # Clean location - remove "Location" prefix if present
                                text = re.sub(r'^Location\s*', '', text, flags=re.IGNORECASE).strip()
                                if text and len(text) >= 3:
                                    job['location_raw'] = text
                        elif field == 'deadline':
                            if text and len(text) >= 3:
                                # Clean deadline - remove "Apply by" prefix if present
                                text = re.sub(r'^Apply by\s*', '', text, flags=re.IGNORECASE).strip()
                                deadline_cleaned = self._parse_deadline(text)
                                if deadline_cleaned:
                                    job['deadline'] = deadline_cleaned
                
                # If header map exists but title not found, try to extract from first cell
                if 'title' not in job and header_map and len(cells) > 0:
                    # Try first cell as title if no header map matched
                    first_cell = cells[0]
                    first_text = first_cell.get_text().strip()
                    # Clean and check if it looks like a title
                    first_text = re.sub(r'^Job Title\s*', '', first_text, flags=re.IGNORECASE).strip()
                    if first_text and len(first_text) >= 10:
                        # Check if it contains deadline/location info (shouldn't be in title)
                        if not re.search(r'Apply by|Location|Deadline', first_text, re.IGNORECASE):
                            job['title'] = first_text
                            # Try to find link in first cell
                            first_link = first_cell.find('a', href=True)
                            if first_link:
                                href = first_link.get('href', '')
                                if href and not href.startswith('#') and not href.startswith('javascript:'):
                                    job['apply_url'] = urljoin(base_url, href)
                
                # Also try to extract from row text if header map didn't work (last resort)
                if 'title' not in job:
                    row_text = row.get_text().strip()
                    # Look for substantial text that might be a title
                    if len(row_text) >= 10:
                        # Split by newlines and find the first substantial line that doesn't contain metadata
                        lines = [line.strip() for line in row_text.split('\n') if line.strip()]
                        for line in lines:
                            # Skip lines that are clearly metadata
                            if re.search(r'^(Job Title|Apply by|Location|Deadline):?\s*', line, re.IGNORECASE):
                                continue
                            if len(line) >= 10 and not any(nav in line.lower() for nav in ['home', 'about', 'contact', 'login']):
                                # Check if line contains deadline/location (shouldn't be in title)
                                if not re.search(r'Apply by|Location|Deadline', line, re.IGNORECASE):
                                    job['title'] = line
                                    break
                
                # If we have a title but no URL, try to construct URL from title link or row link
                if job.get('title') and 'apply_url' not in job:
                    # Try to find any link in the row
                    row_link = row.find('a', href=True)
                    if row_link:
                        href = row_link.get('href', '')
                        if href and not href.startswith('#') and not href.startswith('javascript:'):
                            job['apply_url'] = urljoin(base_url, href)
                
                # Only add if we have title (apply_url will be set by fallback in save_jobs if still missing)
                if job.get('title'):
                    jobs.append(job)
                    if len(jobs) >= 100:
                        break
            
            if jobs:
                break
        
        return jobs
    
    def _extract_from_divs_lists(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """Extract jobs from div/list structures (UNDP-style)"""
        jobs = []
        
        # Look for common job container patterns
        job_containers = []
        
        # Try common class patterns
        for selector in [
            'div[class*="job"]', 'div[class*="position"]', 'div[class*="vacancy"]',
            'li[class*="job"]', 'li[class*="position"]', 'article[class*="job"]',
            'div[class*="listing"]', 'div[class*="item"]', 'div[class*="card"]',
            'div[class*="post"]', 'div[class*="entry"]', 'div[class*="result"]'
        ]:
            containers = soup.select(selector)
            if containers:
                job_containers.extend(containers[:50])  # Limit to first 50
                break
        
        # If no specific containers, look for sections with job-like content
        if not job_containers:
            # Look for sections with multiple links that might be jobs
            sections = soup.find_all(['section', 'div'], class_=lambda x: x and any(
                kw in x.lower() for kw in ['job', 'position', 'vacancy', 'career', 'opportunity']
            ))
            for section in sections:
                links = section.find_all('a', href=True)
                if len(links) >= 3:  # Likely a job listing section
                    job_containers.append(section)
        
        # Fallback: Look for any container with multiple substantial links (likely job listings)
        if not job_containers:
            # Find main content areas
            main_content = soup.find('main') or soup.find('div', id=lambda x: x and ('content' in x.lower() or 'main' in x.lower()))
            if main_content:
                # Look for containers with multiple links (likely job listings)
                for container in main_content.find_all(['div', 'li', 'article'], recursive=True):
                    links = container.find_all('a', href=True)
                    # Filter out navigation/menu links (short text, common nav words)
                    substantial_links = [
                        link for link in links 
                        if len(link.get_text().strip()) >= 8  # More lenient for BRAC (was 10)
                        and not any(nav_word in link.get_text().lower() for nav_word in ['home', 'about', 'contact', 'login', 'register', 'search', 'skip'])
                    ]
                    if len(substantial_links) >= 1:  # More lenient: at least 1 substantial link (was 2)
                        job_containers.append(container)
                        if len(job_containers) >= 30:  # Increased limit for BRAC (was 20)
                            break
        
        logger.info(f"Found {len(job_containers)} potential job containers")
        
        for container in job_containers:
            job = {}
            
            # Extract title from link (most reliable)
            link = container.find('a', href=True)
            if link:
                link_text = link.get_text().strip()
                # More lenient: accept 5+ chars (was already 5, but ensure it's not too strict)
                if link_text and len(link_text) >= 5:
                    job['title'] = link_text
                    href = link.get('href', '')
                    if href and not href.startswith('#') and not href.startswith('javascript:'):
                        job['apply_url'] = urljoin(base_url, href)
            
            # If no link found, try to extract from text (for BRAC-style sites)
            if not job.get('title') and not job.get('apply_url'):
                container_text = container.get_text().strip()
                # Look for first substantial line as title
                lines = [line.strip() for line in container_text.split('\n') if line.strip()]
                for line in lines[:3]:  # Check first 3 lines
                    if len(line) >= 10 and not any(nav in line.lower() for nav in ['home', 'about', 'contact', 'login']):
                        # Check if line contains a link pattern or looks like a title
                        if not line.startswith('Location') and not line.startswith('Deadline'):
                            job['title'] = line[:200]  # Limit length
                            # Try to find a link in the container
                            all_links = container.find_all('a', href=True)
                            if all_links:
                                href = all_links[0].get('href', '')
                                if href and not href.startswith('#') and not href.startswith('javascript:'):
                                    job['apply_url'] = urljoin(base_url, href)
                            break
            
            # Extract location and deadline from text
            container_text = container.get_text()
            
            # Look for location patterns
            location_patterns = [
                r'Location[:\s]+([^\n\r]+)',
                r'Duty Station[:\s]+([^\n\r]+)',
                r'Location[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
            ]
            for pattern in location_patterns:
                match = re.search(pattern, container_text, re.IGNORECASE)
                if match:
                    location = match.group(1).strip()
                    if len(location) >= 3 and len(location) < 100:
                        job['location_raw'] = location
                        break
            
            # Look for deadline patterns
            deadline_patterns = [
                r'Apply by[:\s]+([^\n\r]+)',
                r'Deadline[:\s]+([^\n\r]+)',
                r'Closing[:\s]+([^\n\r]+)',
                r'Due[:\s]+([^\n\r]+)',
            ]
            for pattern in deadline_patterns:
                match = re.search(pattern, container_text, re.IGNORECASE)
                if match:
                    deadline_text = match.group(1).strip()
                    deadline_cleaned = self._parse_deadline(deadline_text)
                    if deadline_cleaned:
                        job['deadline'] = deadline_cleaned
                        break
            
            # Only add if we have title (apply_url will be set by fallback in save_jobs if still missing)
            if job.get('title'):
                jobs.append(job)
                if len(jobs) >= 100:
                    break
        
        return jobs
    
    def _extract_from_links(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """Extract jobs from links with job-like patterns (MSF-style)"""
        jobs = []
        
        # Find all links
        all_links = soup.find_all('a', href=True)
        
        # Filter for job-like links - more flexible approach
        job_keywords = [
            'position', 'job', 'vacancy', 'career', 'opening', 'opportunity',
            'recruitment', 'hiring', 'apply', 'application', 'posting',
            'consultant', 'specialist', 'officer', 'manager', 'coordinator',
            'analyst', 'advisor', 'assistant', 'director', 'engineer', 'expert'
        ]
        
        # Navigation/menu keywords to exclude
        nav_keywords = ['home', 'about', 'contact', 'login', 'register', 'search', 'menu', 'skip']
        
        job_links = []
        for link in all_links:
            link_text = link.get_text().strip()
            href = link.get('href', '').strip()
            
            # Skip navigation/menu links
            if not link_text or len(link_text) < 5:
                continue
            
            link_text_lower = link_text.lower()
            href_lower = href.lower()
            
            # Skip if it's clearly navigation
            if any(nav in link_text_lower for nav in nav_keywords) and len(link_text) < 20:
                continue
            
            # Skip anchors and javascript
            if href.startswith('#') or href.startswith('javascript:'):
                continue
            
            # Strategy 1: Link text or URL contains job keywords
            has_job_keyword = any(kw in link_text_lower for kw in job_keywords) or any(kw in href_lower for kw in job_keywords)
            
            # Strategy 2: Link is substantial (long text, likely a job title)
            is_substantial = len(link_text) >= 15 and not any(nav in link_text_lower for nav in nav_keywords)
            
            # Strategy 3: Link is in a job-related section
            parent = link.parent
            is_in_job_section = False
            if parent:
                parent_class = parent.get('class', [])
                parent_id = parent.get('id', '')
                parent_text = parent.get_text().lower()
                section_indicators = ['job', 'position', 'vacancy', 'career', 'opportunity', 'listing']
                is_in_job_section = any(
                    ind in str(parent_class).lower() or 
                    ind in str(parent_id).lower() or 
                    ind in parent_text[:200]  # Check first 200 chars
                    for ind in section_indicators
                )
            
            if has_job_keyword or (is_substantial and is_in_job_section) or (is_substantial and len(link_text) >= 25):
                job_links.append(link)
        
        logger.info(f"Found {len(job_links)} job-like links")
        
        for link in job_links[:150]:  # Limit to first 150
            link_text = link.get_text().strip()
            href = link.get('href', '').strip()
            
            if href.startswith('#') or href.startswith('javascript:'):
                continue
            
            job = {
                'title': link_text,
                'apply_url': urljoin(base_url, href)
            }
            
            # Try to extract location/deadline from nearby text (parent, siblings, nearby elements)
            parent = link.parent
            if parent:
                # Check parent and siblings
                parent_text = parent.get_text()
                
                # Also check next sibling
                next_sibling = parent.find_next_sibling()
                if next_sibling:
                    parent_text += " " + next_sibling.get_text()
                
                # Look for location
                location_patterns = [
                    r'Location[:\s]+([^\n\r<]+)',
                    r'Duty Station[:\s]+([^\n\r<]+)',
                    r'Based in[:\s]+([^\n\r<]+)',
                    r'Location[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
                ]
                for pattern in location_patterns:
                    location_match = re.search(pattern, parent_text, re.IGNORECASE)
                    if location_match:
                        location = location_match.group(1).strip()
                        # Clean up HTML tags if any
                        location = re.sub(r'<[^>]+>', '', location)
                        if 3 <= len(location) < 100:
                            job['location_raw'] = location
                            break
                
                # Look for deadline
                deadline_patterns = [
                    r'Apply by[:\s]+([^\n\r<]+)',
                    r'Deadline[:\s]+([^\n\r<]+)',
                    r'Closing[:\s]+([^\n\r<]+)',
                    r'Due[:\s]+([^\n\r<]+)',
                    r'Application deadline[:\s]+([^\n\r<]+)',
                ]
                for pattern in deadline_patterns:
                    deadline_match = re.search(pattern, parent_text, re.IGNORECASE)
                    if deadline_match:
                        deadline_text = deadline_match.group(1).strip()
                        deadline_text = re.sub(r'<[^>]+>', '', deadline_text)  # Clean HTML
                        deadline_cleaned = self._parse_deadline(deadline_text)
                        if deadline_cleaned:
                            job['deadline'] = deadline_cleaned
                            break
            
            jobs.append(job)
        
        return jobs
    
    def _extract_from_structured_data(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """Extract jobs from structured data (JSON-LD, microdata)"""
        jobs = []
        
        # Try JSON-LD
        json_ld_scripts = soup.find_all('script', type='application/ld+json')
        for script in json_ld_scripts:
            try:
                import json
                data = json.loads(script.string)
                
                # Handle different JSON-LD structures
                items_to_check = []
                
                if isinstance(data, dict):
                    # Check if it's a JobPosting directly
                    if data.get('@type') == 'JobPosting' or 'JobPosting' in str(data.get('@type', '')):
                        items_to_check.append(data)
                    # Check if it has @graph (common in structured data)
                    elif '@graph' in data and isinstance(data['@graph'], list):
                        items_to_check.extend([item for item in data['@graph'] if isinstance(item, dict)])
                    # Check if it has itemListElement (for job listings)
                    elif 'itemListElement' in data and isinstance(data['itemListElement'], list):
                        items_to_check.extend([item.get('item', {}) for item in data['itemListElement'] if isinstance(item.get('item'), dict)])
                elif isinstance(data, list):
                    items_to_check = [item for item in data if isinstance(item, dict)]
                
                # Process all potential job postings
                for item in items_to_check:
                    if isinstance(item, dict):
                        # Check for JobPosting type (various formats)
                        item_type = item.get('@type', '')
                        if item_type == 'JobPosting' or 'JobPosting' in str(item_type):
                            job = self._parse_job_posting(item, base_url)
                            if job:
                                jobs.append(job)
            except Exception as e:
                logger.debug(f"Error parsing JSON-LD: {e}")
                pass
        
        # Try microdata
        microdata_jobs = soup.find_all(attrs={'itemtype': lambda x: x and 'JobPosting' in x})
        for item in microdata_jobs:
            job = {}
            
            # Extract title
            title_elem = item.find(attrs={'itemprop': 'title'})
            if title_elem:
                job['title'] = title_elem.get_text().strip()
            
            # Extract URL
            url_elem = item.find(attrs={'itemprop': 'url'}) or item.find('a', href=True)
            if url_elem:
                href = url_elem.get('href') or url_elem.get('content')
                if href:
                    job['apply_url'] = urljoin(base_url, href)
            
            # Extract location
            location_elem = item.find(attrs={'itemprop': 'jobLocation'})
            if location_elem:
                job['location_raw'] = location_elem.get_text().strip()
            
            # Extract deadline
            deadline_elem = item.find(attrs={'itemprop': 'validThrough'})
            if deadline_elem:
                deadline_text = deadline_elem.get_text().strip()
                deadline_cleaned = self._parse_deadline(deadline_text)
                if deadline_cleaned:
                    job['deadline'] = deadline_cleaned
            
            if job.get('title') and job.get('apply_url'):
                jobs.append(job)
        
        return jobs
    
    def _parse_job_posting(self, data: Dict, base_url: str) -> Optional[Dict]:
        """Parse a JobPosting structured data object with comprehensive field extraction"""
        job = {}
        
        # Extract title
        if 'title' in data:
            job['title'] = str(data['title']).strip()
        
        # Extract URL (try multiple fields)
        url_fields = ['url', 'applicationUrl', 'applicationURL', 'applyUrl', 'applyURL', 'jobUrl']
        for field in url_fields:
            if field in data:
                url = str(data[field])
                if url:
                    job['apply_url'] = urljoin(base_url, url)
                    break
        
        # Extract location (comprehensive handling)
        if 'jobLocation' in data:
            location = data['jobLocation']
            if isinstance(location, dict):
                # Handle structured location
                if 'address' in location:
                    address = location['address']
                    if isinstance(address, dict):
                        # Build location string from address components
                        parts = []
                        if address.get('addressLocality'):
                            parts.append(address['addressLocality'])
                        if address.get('addressRegion'):
                            parts.append(address['addressRegion'])
                        if address.get('addressCountry'):
                            parts.append(address['addressCountry'])
                        if parts:
                            job['location_raw'] = ', '.join(parts)
                        elif address.get('streetAddress'):
                            job['location_raw'] = str(address['streetAddress'])
                    else:
                        job['location_raw'] = str(address)
                elif 'name' in location:
                    job['location_raw'] = str(location['name'])
                else:
                    job['location_raw'] = str(location)
            elif isinstance(location, list):
                # Multiple locations
                locations = [str(loc.get('name', loc) if isinstance(loc, dict) else loc) for loc in location]
                job['location_raw'] = '; '.join(locations)
            else:
                job['location_raw'] = str(location)
        
        # Extract deadline (try multiple fields)
        deadline_fields = ['validThrough', 'applicationDeadline', 'deadline', 'closingDate', 'expires']
        for field in deadline_fields:
            if field in data:
                deadline_text = str(data[field])
                deadline_cleaned = self._parse_deadline(deadline_text)
                if deadline_cleaned:
                    job['deadline'] = deadline_cleaned
                    break
        
        # Extract salary (if available)
        if 'baseSalary' in data:
            salary = data['baseSalary']
            if isinstance(salary, dict):
                if 'value' in salary:
                    value = salary['value']
                    if isinstance(value, dict):
                        amount = value.get('value', '')
                        currency = value.get('currency', '')
                        if amount:
                            job['salary_raw'] = f"{currency} {amount}".strip()
                    else:
                        job['salary_raw'] = str(value)
                elif 'minValue' in salary and 'maxValue' in salary:
                    job['salary_raw'] = f"{salary['minValue']} - {salary['maxValue']}"
        
        # Extract description (if available)
        if 'description' in data:
            job['description'] = str(data['description']).strip()
        
        # Extract employment type
        if 'employmentType' in data:
            job['employment_type'] = str(data['employmentType'])
        
        # Extract hiring organization
        if 'hiringOrganization' in data:
            org = data['hiringOrganization']
            if isinstance(org, dict) and 'name' in org:
                job['employer'] = str(org['name']).strip()
        
        # Validate required fields
        if job.get('title') and job.get('apply_url'):
            return job
        
        return None
    
    def _extract_generic_fallback(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """
        Generic fallback: Extract any substantial links from main content area.
        This is a last resort that tries to find job-like links even without clear patterns.
        """
        jobs = []
        
        # Find main content area (skip header, footer, nav)
        main_content = soup.find('main')
        if not main_content:
            # Try common content selectors
            for selector in ['#content', '#main', '.content', '.main', '[role="main"]']:
                main_content = soup.select_one(selector)
                if main_content:
                    break
        
        if not main_content:
            # Fallback: use body but exclude nav, header, footer
            main_content = soup.find('body')
            if main_content:
                # Remove navigation elements
                for nav in main_content.find_all(['nav', 'header', 'footer']):
                    nav.decompose()
        
        if not main_content:
            return jobs
        
        # Find all links in main content
        all_links = main_content.find_all('a', href=True)
        
        # Filter for substantial links (likely job titles)
        nav_keywords = ['home', 'about', 'contact', 'login', 'register', 'search', 'menu', 'skip', 'privacy', 'terms']
        
        for link in all_links:
            link_text = link.get_text().strip()
            href = link.get('href', '').strip()
            
            # Skip if too short or navigation - more lenient for BRAC
            if len(link_text) < 8:  # Lowered from 10
                continue
            
            if any(nav in link_text.lower() for nav in nav_keywords) and len(link_text) < 20:  # Lowered from 25
                continue
            
            # Skip anchors and javascript
            if href.startswith('#') or href.startswith('javascript:'):
                continue
            
            # Skip external links to social media, etc.
            if any(domain in href.lower() for domain in ['facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com', 'youtube.com', 'pinterest.com']):
                continue
            
            # More lenient: Accept links with 10+ chars (was 15) OR links with job keywords (8+ chars)
            has_job_keyword = any(kw in link_text.lower() for kw in ['position', 'job', 'vacancy', 'career', 'opening', 'opportunity', 'recruitment', 'hiring'])
            is_substantial = len(link_text) >= 10  # Lowered from 15
            
            if is_substantial or (has_job_keyword and len(link_text) >= 8):
                job = {
                    'title': link_text,
                    'apply_url': urljoin(base_url, href)
                }
                
                # Try to extract location/deadline from nearby context
                parent = link.parent
                if parent:
                    context_text = parent.get_text()
                    
                    # Look for location
                    location_match = re.search(r'Location[:\s]+([^\n\r<]+)', context_text, re.IGNORECASE)
                    if location_match:
                        location = location_match.group(1).strip()
                        location = re.sub(r'<[^>]+>', '', location)
                        if 3 <= len(location) < 100:
                            job['location_raw'] = location
                    
                    # Look for deadline
                    deadline_match = re.search(r'(?:Apply by|Deadline|Closing|Due)[:\s]+([^\n\r<]+)', context_text, re.IGNORECASE)
                    if deadline_match:
                        deadline_text = deadline_match.group(1).strip()
                        deadline_text = re.sub(r'<[^>]+>', '', deadline_text)
                        deadline_cleaned = self._parse_deadline(deadline_text)
                        if deadline_cleaned:
                            job['deadline'] = deadline_cleaned
                
                jobs.append(job)
                
                if len(jobs) >= 100:  # Limit to 100 jobs
                    break
        
        return jobs
    
    def _parse_deadline(self, text: str) -> Optional[str]:
        """
        Parse deadline text into YYYY-MM-DD format using dateparser.
        
        Handles formats like:
        - "12-DEC-2025"
        - "10/12/2025"
        - "December 10, 2025"
        - "10 December 2025"
        - "31 Dec" (assumes current year if year missing)
        - ISO 8601 formats
        """
        if not text:
            return None
        
        text = text.strip()
        
        # Remove common prefixes
        prefixes = ['closing date:', 'deadline:', 'apply by:', 'due:', 'by:', 'valid through:', 'expires:']
        for prefix in prefixes:
            if text.lower().startswith(prefix):
                text = text[len(prefix):].strip()
        
        # Remove time components if present (e.g., "2025-12-31T23:59:59Z" -> "2025-12-31")
        if 'T' in text:
            text = text.split('T')[0]
        
        # Try dateparser first (handles many formats automatically)
        try:
            import dateparser
            from datetime import datetime
            
            # Parse with dateparser (handles many locales and formats)
            parsed_date = dateparser.parse(
                text,
                settings={
                    'PREFER_DAY_OF_MONTH': 'first',
                    'RELATIVE_BASE': datetime.now(),
                    'DATE_ORDER': 'DMY',  # Day-Month-Year (common in international formats)
                    'PREFER_DATES_FROM': 'future'  # Prefer future dates for deadlines
                }
            )
            
            if parsed_date:
                return parsed_date.strftime('%Y-%m-%d')
        except ImportError:
            logger.warning("dateparser not available, falling back to regex parsing")
        except Exception as e:
            logger.debug(f"dateparser failed for '{text}': {e}")
        
        # Fallback: Try regex patterns for common formats
        import re
        from datetime import datetime
        
        # Format: DD-MMM-YYYY or DD/MMM/YYYY (e.g., "12-DEC-2025")
        mmm_pattern = r'(\d{1,2})[-/]([A-Z]{3,})[-/](\d{2,4})'
        match = re.search(mmm_pattern, text.upper())
        if match:
            day, month_str, year = match.groups()
            month_map = {
                'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
                'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
            }
            if month_str in month_map:
                try:
                    year_int = int(year)
                    if year_int < 100:
                        year_int += 2000 if year_int < 50 else 1900
                    date_obj = datetime(year_int, month_map[month_str], int(day))
                    return date_obj.strftime('%Y-%m-%d')
                except:
                    pass
        
        # Format: DD/MM/YYYY or DD-MM-YYYY
        numeric_pattern = r'(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})'
        match = re.search(numeric_pattern, text)
        if match:
            day, month, year = match.groups()
            try:
                year_int = int(year)
                if year_int < 100:
                    year_int += 2000 if year_int < 50 else 1900
                date_obj = datetime(year_int, int(month), int(day))
                return date_obj.strftime('%Y-%m-%d')
            except:
                pass
        
        # Format: DD Month YYYY (e.g., "10 December 2025")
        month_names = [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december'
        ]
        month_abbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        
        for i, month_name in enumerate(month_names + month_abbrevs, 1):
            pattern = rf'(\d{{1,2}})\s+{month_name}\s+(\d{{2,4}})'
            match = re.search(pattern, text.lower())
            if match:
                day, year = match.groups()
                try:
                    year_int = int(year)
                    if year_int < 100:
                        year_int += 2000 if year_int < 50 else 1900
                    month_num = (i - 1) % 12 + 1
                    date_obj = datetime(year_int, month_num, int(day))
                    return date_obj.strftime('%Y-%m-%d')
                except:
                    pass
        
        # If already in YYYY-MM-DD format, return as-is
        if re.match(r'^\d{4}-\d{2}-\d{2}$', text):
            return text
        
        # If we can't parse it, return None (don't save unparseable dates)
        logger.debug(f"Could not parse deadline: {text}")
        return None
    
    def _validate_sql_construction(self, fields: List[str], values: List, placeholders: List[str], sql_values: List, operation: str = "INSERT") -> None:
        """
        Validate SQL construction to catch bugs like duplicate fields or mismatched counts.
        
        Raises ValueError if validation fails.
        """
        # Check for duplicate fields
        field_set = set(fields)
        if len(field_set) != len(fields):
            duplicates = [f for f in fields if fields.count(f) > 1]
            raise ValueError(f"{operation} has duplicate fields: {set(duplicates)}")
        
        # Check field/placeholder count match
        if len(fields) != len(placeholders):
            raise ValueError(f"{operation} field/placeholder mismatch: {len(fields)} fields, {len(placeholders)} placeholders")
        
        # Check placeholder/value count match (accounting for NOW() placeholders)
        now_count = sum(1 for p in placeholders if p == "NOW()")
        expected_sql_values = len(values) - now_count
        if len(sql_values) != expected_sql_values:
            raise ValueError(f"{operation} placeholder/value mismatch: {len(placeholders)} placeholders ({now_count} NOW()), {len(values)} total values, {len(sql_values)} SQL values (expected {expected_sql_values})")
        
        # Check that NOW() placeholders align with "NOW()" values
        for i, (val, placeholder) in enumerate(zip(values, placeholders)):
            if val == "NOW()" and placeholder != "NOW()":
                raise ValueError(f"{operation} NOW() value at index {i} doesn't match placeholder '{placeholder}'")
            if placeholder == "NOW()" and val != "NOW()":
                raise ValueError(f"{operation} NOW() placeholder at index {i} doesn't match value '{val}'")
    
    def save_jobs(self, jobs: List[Dict], source_id: str, org_name: str, base_url: Optional[str] = None) -> Dict:
        """
        Save jobs to database with comprehensive error logging and pre-upsert validation.
        
        Returns:
            Dict with counts: {inserted, updated, skipped, failed, validated}
        """
        logger.info(f"save_jobs called: {len(jobs)} jobs, source_id={source_id}, org_name={org_name}")
        
        # DEBUG: Log extracted jobs before validation
        logger.info(f"DEBUG: Extracted {len(jobs)} jobs before validation: {[j.get('title', '<no title>')[:80] for j in jobs[:5]]}")
        
        if not jobs:
            logger.warning("save_jobs called with empty jobs list")
            return {'inserted': 0, 'updated': 0, 'skipped': 0, 'failed': 0, 'validated': 0}
        
        # TEMPORARY: Skip validation entirely - just do basic checks
        validation_skipped = 0
        valid_jobs = []
        for job in jobs:
            # Ensure apply_url exists - use fallback if missing
            if not job.get('apply_url'):
                # Try to find URL in job data
                if job.get('url'):
                    job['apply_url'] = job['url']
                elif job.get('detail_url'):
                    job['apply_url'] = job['detail_url']
                elif job.get('source_url'):
                    job['apply_url'] = job['source_url']
                else:
                    # Last resort: use base_url if provided, otherwise placeholder
                    if base_url:
                        job['apply_url'] = base_url
                        logger.debug(f"Job missing apply_url, using base_url as fallback: {job.get('title', '')[:50]}")
                    else:
                        # Ultimate fallback: placeholder
                        job['apply_url'] = f"https://placeholder.missing-url/{abs(hash(job.get('title', '')))}"
                        logger.warning(f"Job missing apply_url and no base_url provided, using placeholder: {job.get('title', '')[:50]}")
            
            # Only basic checks - must have title and URL
            if job.get('title') and job.get('apply_url') and len(job.get('title', '')) >= 3:
                valid_jobs.append(job)
            else:
                validation_skipped += 1
                logger.warning(f"Skipping job: title_missing={not bool(job.get('title'))}, apply_url_missing={not bool(job.get('apply_url'))}, title_len={len(job.get('title', ''))}")
        
        jobs = valid_jobs
        
        if validation_skipped > 0:
            logger.warning(f"Basic validation: {validation_skipped} jobs skipped, {len(jobs)} valid")
        
        if not jobs:
            logger.warning(f"No valid jobs to save after validation (had {len(jobs) + validation_skipped} total)")
            return {
                'inserted': 0, 
                'updated': 0, 
                'skipped': validation_skipped, 
                'failed': 0,
                'validated': 0
            }
        
        if not jobs:
            return {
                'inserted': 0, 
                'updated': 0, 
                'skipped': validation_skipped, 
                'failed': 0,
                'validated': 0
            }
        
        inserted = 0
        updated = 0
        skipped = validation_skipped
        failed = 0
        failed_inserts = []  # Track failed inserts for logging
        
        logger.info(f"Saving {len(jobs)} jobs to database for source {source_id} ({org_name})")
        
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                for job in jobs:
                    try:
                        title = job.get('title', '').strip()
                        apply_url = job.get('apply_url', '').strip()
                        location = job.get('location_raw', '').strip()
                        deadline_str = job.get('deadline', '').strip()
                        
                        # Geocoding fields (Phase 4)
                        latitude = job.get('latitude')
                        longitude = job.get('longitude')
                        geocoding_source = job.get('geocoding_source')
                        is_remote = job.get('is_remote', False)
                        country = job.get('country', '').strip() or None
                        country_iso = job.get('country_iso', '').strip() or None
                        city = job.get('city', '').strip() or None
                        
                        # Quality scoring fields (Phase 4)
                        quality_score = job.get('quality_score')
                        quality_grade = job.get('quality_grade')
                        quality_factors = job.get('quality_factors')
                        quality_issues = job.get('quality_issues', [])
                        needs_review = job.get('needs_review', False)
                        
                        if not title or not apply_url:
                            reason = f"Missing title or URL (title: {title[:50] if title else 'None'}, url: {apply_url[:50] if apply_url else 'None'})"
                            logger.warning(f"Skipping job: {reason}")
                            skipped += 1
                            failed_inserts.append({
                                'title': title[:100] if title else None,
                                'apply_url': apply_url[:200] if apply_url else None,
                                'error': reason,
                                'payload': {k: str(v)[:200] for k, v in job.items()}
                            })
                            continue
                        
                        # Additional validation before insertion
                        # Check if title is too short or looks invalid
                        if len(title) < 3:  # Reduced from 5 to 3 to be more lenient
                            reason = f"Title too short: {title[:50]}"
                            logger.warning(f"Skipping job: {reason}")
                            skipped += 1
                            failed_inserts.append({
                                'title': title[:100],
                                'apply_url': apply_url[:200],
                                'error': reason,
                                'payload': {k: str(v)[:200] for k, v in job.items()}
                            })
                            continue
                        
                        # Check for invalid URL patterns
                        if apply_url.startswith('#') or apply_url.startswith('javascript:'):
                            reason = f"Invalid URL: {apply_url[:50]}"
                            logger.debug(f"Skipping job: {reason}")
                            skipped += 1
                            failed_inserts.append({
                                'title': title[:100],
                                'apply_url': apply_url[:200],
                                'error': reason,
                                'payload': {k: str(v)[:200] for k, v in job.items()}
                            })
                            continue
                        
                        # Parse deadline if present
                        deadline_date = None
                        if deadline_str:
                            # If already in YYYY-MM-DD format, use it
                            if re.match(r'^\d{4}-\d{2}-\d{2}$', deadline_str):
                                deadline_date = deadline_str
                            else:
                                # Try to parse it
                                deadline_date = self._parse_deadline(deadline_str)
                                # Only use if it's in YYYY-MM-DD format
                                if deadline_date and not re.match(r'^\d{4}-\d{2}-\d{2}$', deadline_date):
                                    deadline_date = None  # Don't save unparseable dates
                        
                        # Create canonical hash (simple hash of title + URL)
                        import hashlib
                        canonical_text = f"{title}|{apply_url}".lower()
                        canonical_hash = hashlib.md5(canonical_text.encode()).hexdigest()
                        
                        # DEBUG: Log canonical hash for dedupe diagnosis
                        logger.debug(f"DEBUG: canonical_hash={canonical_hash} title={title[:80]} apply_url={apply_url[:120]}")
                        
                        # Check if exists (including deleted jobs)
                        cur.execute("""
                            SELECT id, deleted_at FROM jobs WHERE canonical_hash = %s
                        """, (canonical_hash,))
                        
                        existing = cur.fetchone()
                        
                        if existing:
                            # Check if job was deleted
                            is_deleted = existing[1] is not None
                            
                            # Update (and restore if deleted)
                            try:
                                # Build update fields dynamically
                                update_fields = [
                                    "title = %s",
                                    "apply_url = %s",
                                    "location_raw = %s",
                                    "deleted_at = NULL",
                                    "deleted_by = NULL",
                                    "deletion_reason = NULL",
                                    "status = 'active'",
                                    "last_seen_at = NOW()",
                                    "updated_at = NOW()"
                                ]
                                update_values = [title, apply_url, location]
                                
                                if deadline_date:
                                    update_fields.append("deadline = %s::DATE")
                                    update_values.append(deadline_date)
                                
                                # Add geocoding fields (Phase 4)
                                if latitude is not None:
                                    update_fields.append("latitude = %s")
                                    update_values.append(latitude)
                                    update_fields.append("geocoded_at = NOW()")
                                if longitude is not None:
                                    update_fields.append("longitude = %s")
                                    update_values.append(longitude)
                                if geocoding_source:
                                    update_fields.append("geocoding_source = %s")
                                    update_values.append(geocoding_source)
                                if is_remote is not None:
                                    update_fields.append("is_remote = %s")
                                    update_values.append(is_remote)
                                if country:
                                    update_fields.append("country = %s")
                                    update_values.append(country)
                                if country_iso:
                                    update_fields.append("country_iso = %s")
                                    update_values.append(country_iso)
                                if city:
                                    update_fields.append("city = %s")
                                    update_values.append(city)
                                
                                # Add quality scoring fields (Phase 4)
                                if quality_score is not None:
                                    update_fields.append("quality_score = %s")
                                    update_values.append(quality_score)
                                    update_fields.append("quality_scored_at = NOW()")
                                if quality_grade:
                                    update_fields.append("quality_grade = %s")
                                    update_values.append(quality_grade)
                                if quality_factors:
                                    import json
                                    update_fields.append("quality_factors = %s::jsonb")
                                    update_values.append(json.dumps(quality_factors))
                                if quality_issues:
                                    update_fields.append("quality_issues = %s")
                                    update_values.append(quality_issues)
                                if needs_review is not None:
                                    update_fields.append("needs_review = %s")
                                    update_values.append(needs_review)
                                
                                update_values.append(canonical_hash)
                                
                                cur.execute(f"""
                                    UPDATE jobs
                                    SET {', '.join(update_fields)}
                                    WHERE canonical_hash = %s
                                """, update_values)
                                
                                if is_deleted:
                                    logger.info(f"Restored deleted job: {title[:50]}...")
                                    inserted += 1  # Count restored jobs as inserted
                                else:
                                    updated += 1
                            except Exception as e:
                                error_msg = f"DB update error: {str(e)}"
                                logger.error(f"Failed to update job '{title[:50]}...': {error_msg}")
                                failed += 1
                                failed_inserts.append({
                                    'title': title[:100],
                                    'apply_url': apply_url[:200],
                                    'error': error_msg,
                                    'payload': {k: str(v)[:200] for k, v in job.items()},
                                    'operation': 'update'
                                })
                        else:
                            # Insert
                            try:
                                # Build insert fields dynamically
                                insert_fields = [
                                    "source_id", "org_name", "title", "apply_url",
                                    "location_raw", "canonical_hash",
                                    "status", "fetched_at", "last_seen_at"
                                ]
                                insert_values = [source_id, org_name, title, apply_url, location, canonical_hash]
                                
                                if deadline_date:
                                    insert_fields.append("deadline")
                                    insert_values.append(deadline_date)
                                
                                # Add geocoding fields (Phase 4)
                                has_geocoding = False
                                if latitude is not None:
                                    insert_fields.append("latitude")
                                    insert_values.append(latitude)
                                    has_geocoding = True
                                if longitude is not None:
                                    insert_fields.append("longitude")
                                    insert_values.append(longitude)
                                    has_geocoding = True
                                if geocoding_source:
                                    insert_fields.append("geocoding_source")
                                    insert_values.append(geocoding_source)
                                    has_geocoding = True
                                if is_remote is not None:
                                    insert_fields.append("is_remote")
                                    insert_values.append(is_remote)
                                    has_geocoding = True
                                if country:
                                    insert_fields.append("country")
                                    insert_values.append(country)
                                    has_geocoding = True
                                if country_iso:
                                    insert_fields.append("country_iso")
                                    insert_values.append(country_iso)
                                    has_geocoding = True
                                if city:
                                    insert_fields.append("city")
                                    insert_values.append(city)
                                    has_geocoding = True
                                # Add geocoded_at only if we have any geocoding data
                                if has_geocoding:
                                    insert_fields.append("geocoded_at")
                                    insert_values.append("NOW()")
                                
                                # Add quality scoring fields (Phase 4)
                                has_quality = False
                                if quality_score is not None:
                                    insert_fields.append("quality_score")
                                    insert_values.append(quality_score)
                                    has_quality = True
                                if quality_grade:
                                    insert_fields.append("quality_grade")
                                    insert_values.append(quality_grade)
                                    has_quality = True
                                if quality_factors:
                                    import json
                                    insert_fields.append("quality_factors")
                                    insert_values.append(json.dumps(quality_factors))
                                    has_quality = True
                                if quality_issues:
                                    insert_fields.append("quality_issues")
                                    insert_values.append(quality_issues)
                                    has_quality = True
                                if needs_review is not None:
                                    insert_fields.append("needs_review")
                                    insert_values.append(needs_review)
                                    has_quality = True
                                # Add quality_scored_at only if we have any quality data
                                if has_quality:
                                    insert_fields.append("quality_scored_at")
                                    insert_values.append("NOW()")
                                
                                # Handle NOW() in SQL vs Python values
                                placeholders = []
                                sql_values = []
                                for i, val in enumerate(insert_values):
                                    if val == "NOW()":
                                        placeholders.append("NOW()")
                                    else:
                                        placeholders.append("%s")
                                        sql_values.append(val)
                                
                                # DEBUG: Log SQL construction details before validation
                                logger.error(f"DEBUG_SQL: Field count = {len(insert_fields)} | Value count = {len(insert_values)} | Placeholder count = {len(placeholders)} | SQL value count = {len(sql_values)}")
                                logger.error(f"DEBUG_SQL: Fields = {insert_fields}")
                                logger.error(f"DEBUG_SQL: Values preview = {[str(v)[:80] if v != 'NOW()' else 'NOW()' for v in insert_values]}")
                                logger.error(f"DEBUG_SQL: Placeholders = {placeholders}")
                                logger.error(f"DEBUG_SQL: SQL values preview = {[str(v)[:80] for v in sql_values]}")
                                
                                # CRITICAL: Validate SQL construction before executing
                                try:
                                    self._validate_sql_construction(insert_fields, insert_values, placeholders, sql_values, "INSERT")
                                except ValueError as ve:
                                    logger.error(f"SQL construction validation failed: {ve}")
                                    logger.error(f"Fields: {insert_fields}")
                                    logger.error(f"Values: {[str(v)[:50] if v != 'NOW()' else 'NOW()' for v in insert_values]}")
                                    raise  # Re-raise to be caught by outer exception handler
                                
                                # DEBUG: Log final SQL construction before execution
                                logger.error(f"DEBUG_SQL: About to execute INSERT with {len(insert_fields)} fields, {len(placeholders)} placeholders, {len(sql_values)} SQL values")
                                logger.error(f"DEBUG_SQL: SQL statement = INSERT INTO jobs ({', '.join(insert_fields)}) VALUES ({', '.join(placeholders)})")
                                
                                cur.execute(f"""
                                    INSERT INTO jobs ({', '.join(insert_fields)})
                                    VALUES ({', '.join(placeholders)})
                                """, sql_values)
                                inserted += 1
                                logger.debug(f"Inserted job: {title[:50]}...")
                            except Exception as e:
                                error_msg = f"DB insert error: {str(e)}"
                                logger.error(f"Failed to insert job '{title[:50]}...': {error_msg}", exc_info=True)
                                logger.error(f"Job data: title={title[:50]}, url={apply_url[:100]}")
                                logger.error(f"Insert fields ({len(insert_fields)}): {insert_fields}")
                                logger.error(f"Insert values ({len(insert_values)}): {[str(v)[:50] if v != 'NOW()' else 'NOW()' for v in insert_values]}")
                                logger.error(f"Placeholders ({len(placeholders)}): {placeholders}")
                                logger.error(f"SQL values ({len(sql_values)}): {[str(v)[:50] for v in sql_values]}")
                                failed += 1
                                failed_inserts.append({
                                    'title': title[:100],
                                    'apply_url': apply_url[:200],
                                    'error': error_msg,
                                    'payload': {k: str(v)[:200] for k, v in job.items()},
                                    'operation': 'insert'
                                })
                    except Exception as e:
                        # Catch any unexpected errors during job processing
                        error_msg = f"Unexpected error processing job: {str(e)}"
                        logger.error(f"Error processing job: {error_msg}")
                        failed += 1
                        failed_inserts.append({
                            'title': job.get('title', 'Unknown')[:100],
                            'apply_url': job.get('apply_url', 'Unknown')[:200],
                            'error': error_msg,
                            'payload': {k: str(v)[:200] for k, v in job.items()},
                            'operation': 'process'
                        })
                
                conn.commit()
                logger.info(f"Successfully saved jobs: {inserted} inserted, {updated} updated, {skipped} skipped, {failed} failed")
        
        except Exception as e:
            logger.error(f"Error saving jobs (batch): {e}", exc_info=True)
            if conn:
                conn.rollback()
            # Re-raise to see the actual error
            raise
        finally:
            if conn:
                conn.close()
        
        # Log failed inserts summary and to database (Phase 2)
        if failed_inserts:
            logger.warning(f"Failed to save {len(failed_inserts)} jobs for {org_name} (source_id: {source_id})")
            # Log first 5 failures in detail
            for i, failed_job in enumerate(failed_inserts[:5]):
                logger.warning(f"  Failed job {i+1}: {failed_job.get('title', 'Unknown')} - {failed_job.get('error', 'Unknown error')}")
            if len(failed_inserts) > 5:
                logger.warning(f"  ... and {len(failed_inserts) - 5} more failures")
            
            # Log to database via extraction_logger
            if self.extraction_logger:
                for failed_job in failed_inserts:
                    self.extraction_logger.log_failed_insert(
                        source_url=failed_job.get('apply_url', ''),
                        error=failed_job.get('error', 'Unknown error'),
                        source_id=source_id,
                        payload=failed_job.get('payload'),
                        operation=failed_job.get('operation', 'insert')
                    )
        
        return {
            'inserted': inserted, 
            'updated': updated, 
            'skipped': skipped, 
            'failed': failed,
            'validated': len(jobs) if 'jobs' in locals() else 0
        }
    
    async def enrich_job_from_detail_page(self, job: Dict, base_url: str) -> Dict:
        """
        Enrich job data by fetching and parsing the detail page.
        
        This extracts rich metadata like deadline, location, grade, etc.
        that's only available on the individual job detail pages.
        """
        if not job.get('apply_url'):
            return job
        
        try:
            # Fetch detail page
            status, html = await self.fetch_html(job['apply_url'])
            if status != 200:
                logger.warning(f"Failed to fetch detail page: {job['apply_url']} (HTTP {status})")
                return job
            
            soup = BeautifulSoup(html, 'html.parser')
            
            # UNICEF-specific extraction patterns
            if 'unicef.org' in job['apply_url'].lower():
                # Extract from detail page structure
                # Look for structured fields: Job no, Contract type, Duty Station, Level, Location, Categories
                
                # Extract Location (preferred: Duty Station, fallback: Location)
                location_found = False
                
                # Approach 1: Look for "Duty Station:" (preferred)
                duty_station_elem = soup.find(string=re.compile(r'Duty Station[:\s]*', re.IGNORECASE))
                if duty_station_elem:
                    parent = duty_station_elem.parent
                    # Get next sibling or parent text
                    if parent:
                        next_sibling = parent.find_next_sibling()
                        if next_sibling:
                            location_text = next_sibling.get_text().strip()
                        else:
                            # Try to find the value in the same parent
                            location_text = parent.get_text().replace('Duty Station:', '').replace('Duty Station', '').strip()
                        
                        if location_text and len(location_text) >= 3 and len(location_text) < 100:
                            # Clean up
                            location_text = re.sub(r'<[^>]+>', '', location_text).strip()
                            location_text = re.sub(r'\s+', ' ', location_text)
                            if location_text.lower() not in ['n/a', 'na', 'tbd']:
                                job['location_raw'] = location_text
                                location_found = True
                
                # Approach 2: Look for "Location:" field
                if not location_found:
                    location_elem = soup.find(string=re.compile(r'^Location[:\s]*', re.IGNORECASE))
                    if location_elem:
                        parent = location_elem.parent
                        if parent:
                            next_sibling = parent.find_next_sibling()
                            if next_sibling:
                                location_text = next_sibling.get_text().strip()
                            else:
                                location_text = parent.get_text().replace('Location:', '').replace('Location', '').strip()
                            
                            if location_text and len(location_text) >= 3 and len(location_text) < 100:
                                location_text = re.sub(r'<[^>]+>', '', location_text).strip()
                                location_text = re.sub(r'\s+', ' ', location_text)
                                if location_text.lower() not in ['n/a', 'na', 'tbd']:
                                    job['location_raw'] = location_text
                                    location_found = True
                
                # Extract Deadline
                deadline_found = False
                
                # Look for "Deadline:" in detail page
                deadline_elem = soup.find(string=re.compile(r'Deadline[:\s]*', re.IGNORECASE))
                if deadline_elem:
                    parent = deadline_elem.parent
                    if parent:
                        # Get deadline text
                        deadline_text = parent.get_text()
                        # Extract date pattern: "10 Dec 2025 11:55 PM" or "10 Dec 2025"
                        deadline_match = re.search(r'(\d{1,2}\s+\w{3}\s+\d{4})', deadline_text, re.IGNORECASE)
                        if deadline_match:
                            deadline_cleaned = self._parse_deadline(deadline_match.group(1))
                            if deadline_cleaned:
                                job['deadline'] = deadline_cleaned
                                deadline_found = True
                
                # Also check for deadline in structured data fields
                if not deadline_found:
                    # Look for "Closing date" or similar
                    closing_elem = soup.find(string=re.compile(r'Closing[:\s]*|Apply by[:\s]*', re.IGNORECASE))
                    if closing_elem:
                        parent = closing_elem.parent
                        if parent:
                            deadline_text = parent.get_text()
                            deadline_match = re.search(r'(\d{1,2}\s+\w{3}\s+\d{4})', deadline_text, re.IGNORECASE)
                            if deadline_match:
                                deadline_cleaned = self._parse_deadline(deadline_match.group(1))
                                if deadline_cleaned:
                                    job['deadline'] = deadline_cleaned
                                    deadline_found = True
            
            # UNDP-specific extraction patterns
            elif 'undp.org' in job['apply_url'].lower():
                # Pattern 1: Consultancies page structure
                # Look for "DEADLINE:" label - try multiple approaches
                deadline_found = False
                
                # Approach 1: Find text node with "DEADLINE:"
                deadline_elem = soup.find(string=re.compile(r'DEADLINE:', re.IGNORECASE))
                if deadline_elem:
                    parent = deadline_elem.parent
                    # Try to find next sibling or parent's next sibling
                    next_sibling = parent.find_next_sibling() if parent else None
                    if next_sibling:
                        deadline_text = next_sibling.get_text()
                    else:
                        deadline_text = parent.get_text() if parent else ''
                    
                    # Extract date part (e.g., "03-Dec-25" or "03-Dec-25 @ 03:00 PM")
                    deadline_match = re.search(r'(\d{1,2}[-/]\w{3}[-/]\d{2,4})', deadline_text, re.IGNORECASE)
                    if deadline_match:
                        deadline_cleaned = self._parse_deadline(deadline_match.group(1))
                        if deadline_cleaned:
                            job['deadline'] = deadline_cleaned
                            deadline_found = True
                
                # Approach 2: Look for "Apply Before:" (regular jobs)
                if not deadline_found:
                    apply_before = soup.find(string=re.compile(r'Apply Before:', re.IGNORECASE))
                    if apply_before:
                        parent = apply_before.parent
                        if parent:
                            deadline_text = parent.get_text()
                            # Extract date (e.g., "12/04/2025")
                            deadline_match = re.search(r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})', deadline_text)
                            if deadline_match:
                                deadline_cleaned = self._parse_deadline(deadline_match.group(1))
                                if deadline_cleaned:
                                    job['deadline'] = deadline_cleaned
                                    deadline_found = True
                
                # Location extraction
                location_found = False
                
                # Approach 1: Look for "OFFICE:" (consultancies)
                office_elem = soup.find(string=re.compile(r'OFFICE:', re.IGNORECASE))
                if office_elem:
                    parent = office_elem.parent
                    next_sibling = parent.find_next_sibling() if parent else None
                    if next_sibling:
                        office_text = next_sibling.get_text()
                    else:
                        office_text = parent.get_text() if parent else ''
                    
                    # Extract location (e.g., "UNDP-COL - COLOMBIA" -> "COLOMBIA")
                    # Try pattern: "UNDP-XXX - COUNTRY" or just "COUNTRY"
                    location_match = re.search(r'OFFICE:\s*[^-]*-?\s*([A-Z][A-Z\s]+)', office_text, re.IGNORECASE)
                    if location_match:
                        location = location_match.group(1).strip()
                        if location and len(location) >= 3:
                            job['location_raw'] = location
                            location_found = True
                
                # Approach 2: Look for "Locations:" (regular jobs)
                if not location_found:
                    locations_elem = soup.find(string=re.compile(r'Locations?:', re.IGNORECASE))
                    if locations_elem:
                        parent = locations_elem.parent
                        next_sibling = parent.find_next_sibling() if parent else None
                        if next_sibling:
                            location_text = next_sibling.get_text()
                        else:
                            location_text = parent.get_text() if parent else ''
                        
                        # Extract location (e.g., "Kyiv, Ukraine")
                        location_match = re.search(r'Locations?:\s*([^\n\r<]+)', location_text, re.IGNORECASE)
                        if location_match:
                            location = location_match.group(1).strip()
                            # Clean up any HTML or extra text
                            location = re.sub(r'<[^>]+>', '', location).strip()
                            if location and len(location) >= 3 and len(location) < 100:
                                job['location_raw'] = location
                                location_found = True
                
                # Approach 3: Look for location in title area (e.g., "DS - Kyiv")
                if not location_found and job.get('title'):
                    title_location_match = re.search(r'DS\s*-\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)', job['title'], re.IGNORECASE)
                    if title_location_match:
                        job['location_raw'] = title_location_match.group(1).strip()
                        location_found = True
                
                # Look for "Grade:" (e.g., "NPSA-9")
                grade_elem = soup.find(string=re.compile(r'Grade:', re.IGNORECASE))
                if grade_elem:
                    parent = grade_elem.parent
                    next_sibling = parent.find_next_sibling() if parent else None
                    if next_sibling:
                        grade_text = next_sibling.get_text()
                    else:
                        grade_text = parent.get_text() if parent else ''
                    grade_match = re.search(r'Grade:\s*([^\n\r<]+)', grade_text, re.IGNORECASE)
                    if grade_match:
                        grade = grade_match.group(1).strip()
                        if grade:
                            job['grade'] = grade
            
            # Generic extraction patterns (for other sites)
            else:
                # Look for common deadline patterns
                deadline_patterns = [
                    r'Deadline[:\s]+([^\n\r<]+)',
                    r'Apply by[:\s]+([^\n\r<]+)',
                    r'Apply Before[:\s]+([^\n\r<]+)',
                    r'Closing[:\s]+([^\n\r<]+)',
                ]
                for pattern in deadline_patterns:
                    deadline_match = re.search(pattern, html, re.IGNORECASE)
                    if deadline_match:
                        deadline_text = deadline_match.group(1).strip()
                        deadline_cleaned = self._parse_deadline(deadline_text)
                        if deadline_cleaned:
                            job['deadline'] = deadline_cleaned
                            break
                
                # Look for common location patterns
                location_patterns = [
                    r'Location[:\s]+([^\n\r<]+)',
                    r'Duty Station[:\s]+([^\n\r<]+)',
                    r'Office[:\s]+([^\n\r<]+)',
                ]
                for pattern in location_patterns:
                    location_match = re.search(pattern, html, re.IGNORECASE)
                    if location_match:
                        location = location_match.group(1).strip()
                        if location and len(location) >= 3 and len(location) < 100:
                            job['location_raw'] = location
                            break
            
        except Exception as e:
            logger.warning(f"Error enriching job from detail page {job.get('apply_url')}: {e}")
        
        return job
    
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
                # Check if this source needs browser rendering
                needs_browser = any(indicator in careers_url.lower() for indicator in [
                    'amnesty.org', 'ultipro.com', 'pageup', 'savethechildren', 'unicef.org'
                ])
                
                # Fetch HTML
                status, html = await self.fetch_html(careers_url, use_browser=needs_browser)
                
                # Store raw HTML (Phase 2)
                raw_page_id = None
                storage_path = None
                if self.html_storage and html:
                    try:
                        storage_path = self.html_storage.store(careers_url, html, source_id)
                        if storage_path:
                            # Save raw_page record to database
                            conn = self._get_db_conn()
                            try:
                                with conn.cursor() as cur:
                                    cur.execute("""
                                        INSERT INTO raw_pages (
                                            url, status, storage_path, content_length, source_id, fetched_at
                                        )
                                        VALUES (%s, %s, %s, %s, %s, NOW())
                                        RETURNING id
                                    """, (careers_url, status, storage_path, len(html), source_id))
                                    raw_page_id = str(cur.fetchone()[0])
                                    conn.commit()
                            except Exception as e:
                                logger.warning(f"Error saving raw_page record: {e}")
                                conn.rollback()
                            finally:
                                conn.close()
                    except Exception as e:
                        logger.warning(f"Error storing HTML: {e}")
                
                # Accept any 2xx status as success (some sites use 202, 204, etc.)
                if status < 200 or status >= 300:
                    # Log failed extraction
                    if self.extraction_logger:
                        self.extraction_logger.log_extraction(
                            url=careers_url,
                            status='EMPTY',
                            source_id=source_id,
                            raw_page_id=raw_page_id,
                            reason=f'HTTP {status}',
                            job_count=0
                        )
                    return {
                        'status': 'failed',
                        'message': f'HTTP {status}',
                        'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0, 'failed': 0}
                    }
                
                # Extract jobs from listing page
                # Check if we should use new pipeline extractor (rollout)
                jobs = []
                logger.info(f"Starting job extraction for {org_name} (HTML length: {len(html)} chars)")
                
                # Check rollout config for new extractor
                use_new_extractor = False
                try:
                    from core.rollout_config import get_rollout_config
                    rollout_config = get_rollout_config()
                    use_new_extractor = rollout_config.should_use_new_extractor(careers_url)
                    if use_new_extractor:
                        logger.info(f"Using NEW pipeline extractor for {org_name} (domain in allowlist, rollout={rollout_config.rollout_percent}%)")
                except Exception as e:
                    logger.warning(f"Error checking rollout config: {e}, using default extraction")
                
                if use_new_extractor:
                    # Use new pipeline extractor
                    try:
                        from pipeline.integration import PipelineAdapter
                        pipeline_adapter = PipelineAdapter(
                            db_url=self.db_url,
                            enable_ai=self.use_ai,
                            shadow_mode=rollout_config.is_shadow_mode()
                        )
                        jobs = await pipeline_adapter.extract_jobs_from_html(html, careers_url)
                        logger.info(f"New pipeline extractor found {len(jobs)} jobs for {org_name}")
                    except Exception as e:
                        logger.error(f"New pipeline extractor failed: {e}, falling back to default", exc_info=True)
                        use_new_extractor = False  # Fall through to default
                
                if not use_new_extractor:
                    # Default extraction (existing behavior)
                    if self.use_ai and self.ai_extractor:
                        try:
                            logger.info(f"Attempting AI extraction for {org_name}...")
                            # Use asyncio.wait_for to add overall timeout (2 minutes max)
                            jobs = await asyncio.wait_for(
                                self.ai_extractor.extract_jobs_from_html(html, careers_url, max_jobs=100),
                                timeout=120.0  # 2 minute overall timeout
                            )
                            if jobs:
                                logger.info(f"AI extraction successful: {len(jobs)} jobs found")
                            else:
                                logger.info("AI extraction returned no jobs, falling back to rule-based")
                                jobs = self.extract_jobs_from_html(html, careers_url)
                        except asyncio.TimeoutError:
                            logger.warning("AI extraction timed out (2 minutes), falling back to rule-based")
                            jobs = self.extract_jobs_from_html(html, careers_url)
                        except Exception as e:
                            logger.warning(f"AI extraction failed: {e}, falling back to rule-based")
                            jobs = self.extract_jobs_from_html(html, careers_url)
                    else:
                        # Try plugin system first, then fall back to rule-based extraction
                        try:
                            from crawler.plugins import get_plugin_registry
                            registry = get_plugin_registry()
                            plugin_result = registry.extract(html, careers_url, config=None, preferred_plugin=None)
                            if plugin_result.is_success() and plugin_result.jobs:
                                logger.info(f"Plugin extraction successful: {len(plugin_result.jobs)} jobs found")
                                jobs = plugin_result.jobs
                            else:
                                logger.info(f"Plugin extraction returned no jobs, falling back to rule-based")
                                jobs = self.extract_jobs_from_html(html, careers_url)
                        except Exception as e:
                            logger.warning(f"Plugin system error: {e}, falling back to rule-based")
                            jobs = self.extract_jobs_from_html(html, careers_url)
                
                logger.info(f"Job extraction complete: {len(jobs)} jobs extracted from listing page")
                
                if jobs:
                    logger.info(f"Sample job titles: {[j.get('title', 'No title')[:50] for j in jobs[:3]]}")
                else:
                    logger.warning(f"No jobs extracted from listing page for {org_name}")
                
                # Enrich jobs from detail pages (for UNDP, UNICEF, and other sites)
                # TEMPORARY: Skip enrichment for UNICEF due to 403 errors - save jobs from listing page only
                # Only enrich if we have a reasonable number of jobs (avoid timeout)
                # Skip enrichment for UNICEF since they're blocking with 403
                needs_enrichment = any('undp.org' in job.get('apply_url', '').lower() for job in jobs)
                skip_enrichment = any('unicef.org' in job.get('apply_url', '').lower() for job in jobs)
                
                if skip_enrichment:
                    logger.info(f"Skipping detail page enrichment for {len(jobs)} UNICEF jobs (403 errors - will save from listing page only)")
                elif len(jobs) > 0 and (len(jobs) <= 50 or needs_enrichment):
                    if needs_enrichment:
                        logger.info(f"Enriching {len(jobs)} jobs from detail pages (UNDP requires detail page data)...")
                    else:
                        logger.info(f"Enriching {len(jobs)} jobs from detail pages...")
                    
                    enriched_jobs = []
                    for i, job in enumerate(jobs):
                        if job.get('apply_url'):
                            try:
                                enriched_job = await self.enrich_job_from_detail_page(job, careers_url)
                                enriched_jobs.append(enriched_job)
                                # Small delay to avoid overwhelming servers (0.3s between requests)
                                if i < len(jobs) - 1:  # Don't delay after last job
                                    await asyncio.sleep(0.3)
                            except Exception as e:
                                logger.warning(f"Error enriching job {job.get('title', 'unknown')}: {e}")
                                enriched_jobs.append(job)  # Use original job if enrichment fails
                        else:
                            enriched_jobs.append(job)
                    jobs = enriched_jobs
                else:
                    if len(jobs) > 50 and not needs_enrichment:
                        logger.info(f"Skipping detail page enrichment for {len(jobs)} jobs (too many)")
                    jobs = jobs
                
                # Normalize ambiguous fields using AI (Phase 3) - only when heuristics fail
                if self.ai_normalizer and jobs:
                    normalized_count = 0
                    for job in jobs:
                        try:
                            # Check if normalization is needed
                            needs_normalization = False
                            
                            # Check deadline: normalize if not in YYYY-MM-DD format
                            if job.get('deadline'):
                                deadline_str = str(job['deadline'])
                                if not (len(deadline_str) == 10 and deadline_str.count('-') == 2):
                                    needs_normalization = True
                            
                            # Check location: normalize if ambiguous (contains /, ;, or multiple parts)
                            if job.get('location_raw') and not job.get('location_normalized'):
                                location = job['location_raw']
                                if '/' in location or ';' in location or location.count(',') > 1:
                                    needs_normalization = True
                            
                            # Check salary: normalize if present but not structured
                            if job.get('salary_raw') and not job.get('salary_normalized'):
                                needs_normalization = True
                            
                            # Only normalize if needed (cost control)
                            if needs_normalization:
                                normalized_job = await self.ai_normalizer.normalize_job_fields(
                                    job,
                                    use_ai_for_deadline=bool(job.get('deadline') and not re.match(r'^\d{4}-\d{2}-\d{2}$', str(job.get('deadline', '')))),
                                    use_ai_for_location=bool(job.get('location_raw') and not job.get('location_normalized')),
                                    use_ai_for_salary=bool(job.get('salary_raw') and not job.get('salary_normalized'))
                                )
                                
                                # Update job with normalized fields
                                if normalized_job.get('deadline') and normalized_job.get('deadline') != job.get('deadline'):
                                    job['deadline'] = normalized_job['deadline']
                                    normalized_count += 1
                                
                                if normalized_job.get('location_normalized'):
                                    job['location_normalized'] = normalized_job['location_normalized']
                                    normalized_count += 1
                                
                                if normalized_job.get('salary_normalized'):
                                    job['salary_normalized'] = normalized_job['salary_normalized']
                                    normalized_count += 1
                        except Exception as e:
                            logger.debug(f"Error normalizing job {job.get('title', 'unknown')[:50]}: {e}")
                            # Continue with original job if normalization fails
                    
                    if normalized_count > 0:
                        logger.info(f"AI normalized {normalized_count} field(s) across {len(jobs)} jobs")
                
                # Geocode locations (Phase 4) - only for jobs with location but no coordinates
                if self.geocoder and jobs:
                    geocoded_count = 0
                    for job in jobs:
                        try:
                            location = job.get('location_raw') or (job.get('location_normalized', {}).get('label') if isinstance(job.get('location_normalized'), dict) else None)
                            
                            # Only geocode if we have location but no coordinates
                            if location and not job.get('latitude') and not job.get('is_remote'):
                                # Check if already marked as remote
                                if isinstance(job.get('location_normalized'), dict) and job.get('location_normalized', {}).get('type') == 'remote':
                                    job['is_remote'] = True
                                    geocoded_count += 1
                                else:
                                    # Geocode the location
                                    geocoded = await self.geocoder.geocode(location, use_google=False)
                                    if geocoded:
                                        job['latitude'] = geocoded.get('latitude')
                                        job['longitude'] = geocoded.get('longitude')
                                        job['geocoding_source'] = geocoded.get('source', 'nominatim')
                                        job['is_remote'] = geocoded.get('is_remote', False)
                                        
                                        # Update country/city if geocoding provided better data
                                        if geocoded.get('country') and not job.get('country'):
                                            job['country'] = geocoded.get('country')
                                        if geocoded.get('country_code') and not job.get('country_iso'):
                                            job['country_iso'] = geocoded.get('country_code')
                                        if geocoded.get('city') and not job.get('city'):
                                            job['city'] = geocoded.get('city')
                                        
                                        geocoded_count += 1
                        except Exception as e:
                            logger.debug(f"Error geocoding job {job.get('title', 'unknown')[:50]}: {e}")
                            # Continue with original job if geocoding fails
                    
                    if geocoded_count > 0:
                        logger.info(f"Geocoded {geocoded_count} location(s) across {len(jobs)} jobs")
                
                # Score data quality (Phase 4)
                if self.quality_scorer and jobs:
                    scored_count = 0
                    for job in jobs:
                        try:
                            quality_result = self.quality_scorer.score_job(job)
                            job['quality_score'] = quality_result['score']
                            job['quality_grade'] = quality_result['grade']
                            job['quality_factors'] = quality_result['factors']
                            job['quality_issues'] = quality_result['issues']
                            job['needs_review'] = quality_result['needs_review']
                            scored_count += 1
                        except Exception as e:
                            logger.debug(f"Error scoring job {job.get('title', 'unknown')[:50]}: {e}")
                    
                    if scored_count > 0:
                        logger.info(f"Scored quality for {scored_count} job(s)")
                
                # Save to database
                counts = self.save_jobs(jobs, source_id, org_name, base_url=careers_url)
                
                # Log extraction result (Phase 2)
                if self.extraction_logger:
                    extraction_status = 'OK'
                    reason = None
                    if len(jobs) == 0:
                        extraction_status = 'EMPTY'
                        reason = 'No jobs found'
                    elif counts.get('failed', 0) > 0:
                        extraction_status = 'DB_FAIL'
                        reason = f"{counts.get('failed', 0)} jobs failed to insert"
                    elif counts.get('skipped', 0) > len(jobs) * 0.5:
                        extraction_status = 'PARTIAL'
                        reason = f"{counts.get('skipped', 0)} jobs skipped (>{len(jobs)*0.5:.0f}%)"
                    
                    # Create summary of extracted fields for logging
                    extracted_fields = {
                        'job_count': len(jobs),
                        'inserted': counts.get('inserted', 0),
                        'updated': counts.get('updated', 0),
                        'skipped': counts.get('skipped', 0),
                        'failed': counts.get('failed', 0)
                    }
                    if jobs:
                        # Sample first job's fields
                        sample_job = jobs[0]
                        extracted_fields['sample_title'] = sample_job.get('title', '')[:100]
                        extracted_fields['has_location'] = bool(sample_job.get('location_raw'))
                        extracted_fields['has_deadline'] = bool(sample_job.get('deadline'))
                    
                    self.extraction_logger.log_extraction(
                        url=careers_url,
                        status=extraction_status,
                        source_id=source_id,
                        raw_page_id=raw_page_id,
                        reason=reason,
                        extracted_fields=extracted_fields,
                        job_count=len(jobs)
                    )
                
                return {
                    'status': 'ok' if jobs else 'warn',
                    'message': f'Found {len(jobs)} jobs' if jobs else 'No jobs found',
                    'validation_info': {
                        'total_extracted': len(jobs),
                        'validated': counts.get('validated', 0),
                        'skipped': counts.get('skipped', 0),
                        'inserted': counts.get('inserted', 0),
                        'updated': counts.get('updated', 0)
                    } if jobs else None,
                    'counts': {
                        'found': len(jobs),
                        'inserted': counts['inserted'],
                        'updated': counts['updated'],
                        'skipped': counts['skipped'],
                        'failed': counts.get('failed', 0)
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

