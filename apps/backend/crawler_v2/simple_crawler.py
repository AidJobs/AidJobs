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
        1. Analyzes HTML structure to choose the best strategy
        2. Tries recommended strategy first
        3. Falls back to other strategies if needed
        4. Validates and normalizes results for consistency
        5. Maintains quality across all sources
        """
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
        soup = BeautifulSoup(html, 'html.parser')
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
                
                # Only add if we have title and apply_url
                if job.get('title') and job.get('apply_url'):
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
            
            # Only add if we have title and apply_url
            if job.get('title') and job.get('apply_url'):
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
                if isinstance(data, dict) and data.get('@type') == 'JobPosting':
                    job = self._parse_job_posting(data, base_url)
                    if job:
                        jobs.append(job)
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and item.get('@type') == 'JobPosting':
                            job = self._parse_job_posting(item, base_url)
                            if job:
                                jobs.append(job)
            except:
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
        """Parse a JobPosting structured data object"""
        job = {}
        
        if 'title' in data:
            job['title'] = str(data['title']).strip()
        
        if 'url' in data:
            url = str(data['url'])
            job['apply_url'] = urljoin(base_url, url)
        elif 'applicationUrl' in data:
            url = str(data['applicationUrl'])
            job['apply_url'] = urljoin(base_url, url)
        
        if 'jobLocation' in data:
            location = data['jobLocation']
            if isinstance(location, dict):
                if 'address' in location:
                    address = location['address']
                    if isinstance(address, dict):
                        city = address.get('addressLocality', '')
                        country = address.get('addressCountry', '')
                        job['location_raw'] = f"{city}, {country}".strip(', ')
                    else:
                        job['location_raw'] = str(address)
                else:
                    job['location_raw'] = str(location)
            else:
                job['location_raw'] = str(location)
        
        if 'validThrough' in data:
            deadline_text = str(data['validThrough'])
            deadline_cleaned = self._parse_deadline(deadline_text)
            if deadline_cleaned:
                job['deadline'] = deadline_cleaned
        
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
        Parse deadline text into a standard format.
        
        Handles formats like:
        - "12-DEC-2025"
        - "10/12/2025"
        - "December 10, 2025"
        - "10 December 2025"
        """
        if not text:
            return None
        
        text = text.strip()
        
        # Remove common prefixes
        prefixes = ['closing date:', 'deadline:', 'apply by:', 'due:', 'by:']
        for prefix in prefixes:
            if text.lower().startswith(prefix):
                text = text[len(prefix):].strip()
        
        # Try to parse common date formats
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
        
        # If we can't parse it, return the original text (database can handle it)
        return text
    
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
                        logger.debug(f"Skipping job: missing title or URL (title: {title[:50] if title else 'None'}, url: {apply_url[:50] if apply_url else 'None'})")
                        skipped += 1
                        continue
                    
                    # Additional validation before insertion
                    # Check if title is too short or looks invalid
                    if len(title) < 5:
                        logger.debug(f"Skipping job: title too short: {title[:50]}")
                        skipped += 1
                        continue
                    
                    # Check for invalid URL patterns
                    if apply_url.startswith('#') or apply_url.startswith('javascript:'):
                        logger.debug(f"Skipping job: invalid URL: {apply_url[:50]}")
                        skipped += 1
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
                    
                    # Check if exists (including deleted jobs)
                    cur.execute("""
                        SELECT id, deleted_at FROM jobs WHERE canonical_hash = %s
                    """, (canonical_hash,))
                    
                    existing = cur.fetchone()
                    
                    if existing:
                        # Check if job was deleted
                        is_deleted = existing[1] is not None
                        
                        # Update (and restore if deleted)
                        if deadline_date:
                            cur.execute("""
                                UPDATE jobs
                                SET title = %s,
                                    apply_url = %s,
                                    location_raw = %s,
                                    deadline = %s::DATE,
                                    deleted_at = NULL,
                                    deleted_by = NULL,
                                    deletion_reason = NULL,
                                    status = 'active',
                                    last_seen_at = NOW(),
                                    updated_at = NOW()
                                WHERE canonical_hash = %s
                            """, (title, apply_url, location, deadline_date, canonical_hash))
                        else:
                            cur.execute("""
                                UPDATE jobs
                                SET title = %s,
                                    apply_url = %s,
                                    location_raw = %s,
                                    deleted_at = NULL,
                                    deleted_by = NULL,
                                    deletion_reason = NULL,
                                    status = 'active',
                                    last_seen_at = NOW(),
                                    updated_at = NOW()
                                WHERE canonical_hash = %s
                            """, (title, apply_url, location, canonical_hash))
                        
                        if is_deleted:
                            logger.info(f"Restored deleted job: {title[:50]}...")
                            inserted += 1  # Count restored jobs as inserted
                        else:
                            updated += 1
                    else:
                        # Insert
                        if deadline_date:
                            cur.execute("""
                                INSERT INTO jobs (
                                    source_id, org_name, title, apply_url,
                                    location_raw, deadline, canonical_hash,
                                    status, fetched_at, last_seen_at
                                )
                                VALUES (%s, %s, %s, %s, %s, %s::DATE, %s, 'active', NOW(), NOW())
                            """, (source_id, org_name, title, apply_url, location, deadline_date, canonical_hash))
                        else:
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
            
            # UNDP-specific extraction patterns
            if 'undp.org' in job['apply_url'].lower():
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
                    'amnesty.org', 'ultipro.com', 'pageup', 'savethechildren'
                ])
                
                # Fetch HTML
                status, html = await self.fetch_html(careers_url, use_browser=needs_browser)
                
                # Accept any 2xx status as success (some sites use 202, 204, etc.)
                if status < 200 or status >= 300:
                    return {
                        'status': 'failed',
                        'message': f'HTTP {status}',
                        'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                    }
                
                # Extract jobs from listing page
                # Try AI extraction first if available
                jobs = []
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
                    # Use rule-based extraction
                    jobs = self.extract_jobs_from_html(html, careers_url)
                
                # Enrich jobs from detail pages (for UNDP and other sites)
                # Only enrich if we have a reasonable number of jobs (avoid timeout)
                if len(jobs) > 0 and len(jobs) <= 50:  # Limit to 50 jobs to avoid timeout
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
                    if len(jobs) > 50:
                        logger.info(f"Skipping detail page enrichment for {len(jobs)} jobs (too many)")
                    jobs = jobs
                
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

