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
# These work generically across most job sites without needing per-site configuration
JOB_SELECTORS = [
    # Standard job listing classes
    '.job-listing', '.job-item', '.career-item', '.position',
    'article.job', 'div.vacancy', 'tr.job-row', 'li.job',
    # Additional common patterns (attribute contains)
    '[class*="job"]', '[class*="position"]', '[class*="vacancy"]', '[class*="career"]',
    '[class*="opening"]', '[id*="job"]', '[id*="position"]', '[id*="vacancy"]',
    'article[class*="job"]', 'div[class*="job"]', 'li[class*="job"]',
    'tr[class*="job"]', 'section[class*="job"]', 'div[class*="position"]',
    # Table-based listings (common in UN/INGO sites)
    'tbody tr', 'table tr[data-job]', 'table tr[data-position]',
    'table tbody tr', 'tr[class*="row"]', 'tr[class*="item"]',
    # List-based listings
    'ul.jobs li', 'ol.jobs li', 'ul.positions li', 'ul.vacancies li',
    'ul[class*="job"] li', 'ol[class*="job"] li',
    # Card-based listings
    '.card[class*="job"]', '.card[class*="position"]', '[role="article"]',
    # Generic content containers with job-like patterns
    'div[class*="listing"]', 'div[class*="posting"]', 'div[class*="opportunity"]'
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
                    'recruitment', 'hiring', 'apply', 'application', 'posting',
                    'consultant', 'specialist', 'officer', 'manager', 'coordinator',
                    'programme', 'project', 'fellowship', 'internship'
                ]) or any(keyword in link.get('href', '').lower() for keyword in [
                    '/job', '/position', '/vacancy', '/career', '/opening', '/opportunity',
                    '/recruitment', '/hiring', '/apply', '/application', '/posting',
                    '/consultant', '/specialist', '/officer', '/post', '/vacancies',
                    '/opportunities', '/employment', '/work-with-us'
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
        
        # Additional fallback: try more generic patterns for UN/INGO organization sites
        # This works for UNESCO, UNDP, and similar sites without needing per-site configuration
        if not job_elements:
            # Strategy 0: UNDP-specific pattern (HTML-based structure with "Job Title", "Apply by", "Location")
            # UNDP uses a pattern like: "Job Title [title] Apply by [date] Location [location]"
            if 'undp.org' in base_url.lower() or 'cj_view_consultancies' in base_url.lower():
                # Find all elements that contain "Job Title" text (preserving HTML structure)
                # Look for text nodes or elements containing "Job Title"
                job_title_pattern = re.compile(r'(?i)Job Title\s+', re.IGNORECASE)
                
                # Find all text nodes that contain "Job Title"
                for text_node in soup.find_all(string=job_title_pattern):
                    # Get the parent element that contains this text
                    parent = text_node.parent
                    if not parent:
                        continue
                    
                    # Extract title from text after "Job Title"
                    title_text = text_node.string if hasattr(text_node, 'string') else str(text_node)
                    title_match = re.search(r'(?i)Job Title\s+([^\n\r]+)', title_text)
                    if not title_match:
                        # Try to get title from the next text node or parent
                        next_text = parent.get_text() if parent else ''
                        title_match = re.search(r'(?i)Job Title\s+([^\n\r]+)', next_text)
                    
                    if not title_match:
                        continue
                    
                    title = title_match.group(1).strip()
                    if not title or len(title) < 5:
                        continue
                    
                    # Find the container element (could be div, tr, li, etc.)
                    # Look for a parent that contains the full job entry
                    container = parent
                    for _ in range(5):  # Go up max 5 levels to find container
                        if container and container.name in ['tr', 'div', 'li', 'article', 'section', 'td']:
                            # Find ALL links in this container
                            # For table rows, only get links in THIS row, not parent/sibling rows
                            all_links = []
                            
                            if container.name == 'tr':
                                # For table rows, only get links in cells of THIS row
                                cells = container.find_all(['td', 'th'])
                                for cell in cells:
                                    cell_links = cell.find_all('a', href=True)
                                    all_links.extend(cell_links)
                            else:
                                # For other containers, get all links
                                all_links = container.find_all('a', href=True)
                            
                            # If no links in container, check immediate children only (not parent)
                            if not all_links and container:
                                # Check direct children for links
                                for child in container.children:
                                    if hasattr(child, 'find_all'):
                                        child_links = child.find_all('a', href=True)
                                        all_links.extend(child_links)
                            
                            # Find the best link - prefer links that are near the title or have job-related paths
                            best_link = None
                            best_score = -1
                            
                            for link in all_links:
                                href = link.get('href', '')
                                if not href or href.startswith('#') or href.startswith('javascript:'):
                                    continue
                                
                                href_lower = href.lower()
                                link_text = link.get_text().lower().strip()
                                
                                score = 0
                                
                                # High priority: links with job detail patterns
                                if any(kw in href_lower for kw in ['/job/', '/position/', '/vacancy/', '/detail', '/view/', '/apply', '/post/', '/consultant/', '/opportunity/', '/id=', '/consultancy/']):
                                    score += 20
                                
                                # High priority: links with IDs or unique identifiers
                                if re.search(r'/\d+', href) or re.search(r'/[a-z0-9-]{10,}', href):
                                    score += 15
                                
                                # Medium: links with detail keywords in text
                                if any(kw in link_text for kw in ['view', 'details', 'read more', 'apply', 'see more', 'full']):
                                    score += 10
                                
                                # Penalty: listing pages
                                if any(kw in href_lower for kw in ['/jobs', '/careers', '/vacancies', '/opportunities', '/list', '/search', '/cj_view_consultancies']):
                                    score -= 20
                                
                                # Check if link is in the same cell/container as the title
                                link_parent = link.parent
                                if link_parent and (link_parent == container or container.find(link)):
                                    score += 5
                                
                                if score > best_score:
                                    best_score = score
                                    best_link = link
                            
                            if best_link and best_score >= 0:
                                full_text = container.get_text()
                                job_elements.append({
                                    'element': container,
                                    'title': title,
                                    'link': best_link,
                                    'full_text': full_text,
                                    'title_text': title  # Store original title for uniqueness
                                })
                                if len(job_elements) >= 100:  # Limit to 100 jobs
                                    break
                            break
                        container = container.parent if container else None
                    
                    if len(job_elements) >= 100:
                        break
                
                # If we didn't find jobs using the above method, try finding table rows or divs
                # that contain "Job Title" text and have links
                if not job_elements:
                    # Look for table rows or divs containing "Job Title"
                    for elem in soup.find_all(['tr', 'div', 'li']):
                        text = elem.get_text()
                        if job_title_pattern.search(text):
                            # Extract title
                            title_match = re.search(r'(?i)Job Title\s+([^\n\r]+)', text)
                            if title_match:
                                title = title_match.group(1).strip()
                                if title and len(title) > 5:
                                    # Find ALL links in this element and score them
                                    all_links = elem.find_all('a', href=True)
                                    best_link = None
                                    best_score = -1
                                    
                                    for link in all_links:
                                        href = link.get('href', '')
                                        if not href or href.startswith('#') or href.startswith('javascript:'):
                                            continue
                                        
                                        href_lower = href.lower()
                                        score = 0
                                        
                                        # High priority: job detail patterns
                                        if any(kw in href_lower for kw in ['/job/', '/position/', '/vacancy/', '/detail', '/view/', '/apply', '/post/', '/consultant/', '/opportunity/', '/id=', '/consultancy/']):
                                            score += 20
                                        
                                        # High priority: unique IDs
                                        if re.search(r'/\d+', href) or re.search(r'/[a-z0-9-]{10,}', href):
                                            score += 15
                                        
                                        # Penalty: listing pages
                                        if any(kw in href_lower for kw in ['/jobs', '/careers', '/vacancies', '/opportunities', '/list', '/search', '/cj_view_consultancies']):
                                            score -= 20
                                        
                                        if score > best_score:
                                            best_score = score
                                            best_link = link
                                    
                                    if best_link and best_score >= 0:
                                        job_elements.append({
                                            'element': elem,
                                            'title': title,
                                            'link': best_link,
                                            'full_text': text,
                                            'title_text': title
                                        })
                                        if len(job_elements) >= 100:
                                            break
            
            # Strategy 1: Look for table rows with job-like content (common in UN sites)
            if not job_elements:
                table_rows = soup.find_all('tr')
                for tr in table_rows:
                    text = tr.get_text().lower()
                    # Check if row contains job-related keywords
                    if any(kw in text for kw in ['position', 'vacancy', 'post', 'recruit', 'opportunity', 'consultant', 'specialist', 'officer', 'manager', 'coordinator']):
                        # Check if it has a link (likely a job listing)
                        if tr.find('a', href=True):
                            job_elements.append(tr)
                            if len(job_elements) >= 50:
                                break
            
            # Strategy 2: Try finding divs/sections with job-like content
            if not job_elements:
                all_divs = soup.find_all(['div', 'section', 'article'])
                for div in all_divs:
                    text = div.get_text().lower()
                    # Check for job keywords and presence of a link
                    if any(kw in text for kw in ['position', 'vacancy', 'post', 'recruit', 'opportunity', 'consultant', 'specialist', 'officer']) and div.find('a', href=True):
                        # Make sure it's not too large (likely a container, not a single job)
                        if len(text) < 2000:  # Reasonable size for a single job listing
                            job_elements.append(div)
                            if len(job_elements) >= 50:
                                break
            
            # Strategy 3: Look for list items (li) with job-like content
            if not job_elements:
                list_items = soup.find_all('li')
                for li in list_items:
                    text = li.get_text().lower()
                    if any(kw in text for kw in ['position', 'vacancy', 'post', 'recruit', 'opportunity']) and li.find('a', href=True):
                        if len(text) < 1000:  # Reasonable size for a list item job listing
                            job_elements.append(li)
                            if len(job_elements) >= 50:
                                break
        
        # Extract data from each element
        seen_urls = set()  # Track URLs to ensure uniqueness
        seen_titles = set()  # Track titles to avoid duplicates
        
        for elem in job_elements:
            job = self._extract_job_from_element(elem, base_url)
            if job and job.get('title'):
                title = job.get('title', '').strip()
                apply_url = job.get('apply_url', '')
                
                # Skip if we've seen this exact title+URL combination
                job_key = (title.lower(), apply_url)
                if job_key in seen_urls:
                    logger.debug(f"[html_fetch] Skipping duplicate job: {title[:50]}... -> {apply_url}")
                    continue
                
                # Skip if URL is the base URL (not a specific job page)
                if apply_url == base_url or apply_url == base_url.rstrip('/'):
                    # Only skip if we already have a job with this title
                    if title.lower() in seen_titles:
                        logger.debug(f"[html_fetch] Skipping job with base URL: {title[:50]}...")
                        continue
                
                seen_urls.add(job_key)
                seen_titles.add(title.lower())
                jobs.append(job)
                
                # Log first few jobs for debugging
                if len(jobs) <= 3:
                    logger.debug(f"[html_fetch] Extracted job {len(jobs)}: '{title[:50]}...' -> {apply_url}")
        
        logger.info(f"[html_fetch] Extracted {len(jobs)} unique jobs from {base_url}")
        return jobs
    
    def _extract_job_from_element(self, elem, base_url: str) -> Optional[Dict]:
        """Extract job data from a single HTML element or JSON-LD dict"""
        job = {}
        
        # Handle UNDP job dict (from HTML-based extraction with element and link)
        if isinstance(elem, dict) and 'title' in elem and 'element' in elem and 'link' in elem:
            job['title'] = elem.get('title', '').strip()
            if not job['title']:
                return None
            
            # Extract apply URL from the link we found
            link = elem.get('link')
            element = elem.get('element')
            
            # Try to find the best link for this job
            job['apply_url'] = base_url  # Default fallback
            
            # Collect all links from the element
            all_links = []
            if link and link.get('href'):
                all_links.append(link)
            if element:
                all_links.extend(element.find_all('a', href=True))
            
            # Score and find the best link
            best_link = None
            best_score = -1
            
            for candidate_link in all_links:
                href = candidate_link.get('href', '')
                if not href or href.startswith('#') or href.startswith('javascript:'):
                    continue
                
                href_lower = href.lower()
                link_text = candidate_link.get_text().lower().strip()
                
                # Score links based on relevance
                score = 0
                
                # High priority: links that look like job detail pages (not listing pages)
                if any(kw in href_lower for kw in ['/job/', '/position/', '/vacancy/', '/detail', '/view/', '/apply', '/post/', '/consultant/', '/opportunity/', '/id=']):
                    score += 10
                
                # High priority: links with job detail keywords in text
                if any(kw in link_text for kw in ['view', 'details', 'read more', 'apply', 'see more', 'full', 'more info', 'learn more']):
                    score += 8
                
                # Medium priority: links with IDs or slugs (likely detail pages)
                if re.search(r'/\d+', href) or re.search(r'/[a-z0-9-]{10,}$', href):
                    score += 5
                
                # Penalty: links that are clearly listing pages
                if any(kw in href_lower for kw in ['/jobs', '/careers', '/vacancies', '/opportunities', '/list', '/search', '/cj_view_consultancies']):
                    score -= 10
                
                # Penalty: if href is just the base path
                parsed_base = urlparse(base_url)
                parsed_href = urlparse(href)
                if parsed_href.path == parsed_base.path or parsed_href.path == parsed_base.path.rstrip('/'):
                    score -= 5
                
                if score > best_score:
                    best_score = score
                    best_link = candidate_link
            
            # Use the best link if we found one with positive score
            if best_link and best_score >= 0:
                href = best_link.get('href', '')
                job['apply_url'] = urljoin(base_url, href)
            elif all_links:
                # Fallback: use first valid link even if score is negative
                for candidate_link in all_links:
                    href = candidate_link.get('href', '')
                    if href and not href.startswith('#') and not href.startswith('javascript:'):
                        job['apply_url'] = urljoin(base_url, href)
                        break
            
            # Extract location and deadline from full text
            full_text = elem.get('full_text', '')
            job['location_raw'] = None
            apply_by = None
            
            # Look for "Location" and "Apply by" in the text
            lines = full_text.split('\n')
            for line in lines:
                line_lower = line.lower()
                if 'location' in line_lower and not job['location_raw']:
                    # Extract location (text after "Location")
                    location_match = re.search(r'(?i)Location\s*:?\s*(.+)', line)
                    if location_match:
                        job['location_raw'] = location_match.group(1).strip()
                elif 'apply by' in line_lower and not apply_by:
                    # Extract apply by date
                    apply_by_match = re.search(r'(?i)Apply by\s*:?\s*(.+)', line)
                    if apply_by_match:
                        apply_by = apply_by_match.group(1).strip()
            
            # Parse deadline from "Apply by" field
            if apply_by:
                try:
                    # Try to parse date (UNDP format: "Nov-21-25" or similar)
                    # Common formats: "Nov-21-25", "Nov 21, 2025", etc.
                    date_str = apply_by.replace('-', ' ').strip()
                    # Try various date formats
                    for fmt in ['%b %d %y', '%b %d, %Y', '%B %d, %Y', '%b-%d-%y', '%d-%b-%y', '%d %b %y']:
                        try:
                            parsed_date = datetime.strptime(date_str, fmt)
                            job['deadline'] = parsed_date.date()
                            break
                        except:
                            continue
                except:
                    pass
            
            # Extract description snippet
            job['description_snippet'] = full_text[:500] if full_text else None
            
            return job
        
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
        # Title - try multiple strategies
        title_elem = elem.find(['h1', 'h2', 'h3', 'h4', 'h5', 'a', 'strong', 'b'])
        if title_elem:
            job['title'] = title_elem.get_text().strip()
        else:
            # Try to find title in first line or first strong/bold element
            first_line = elem.get_text().split('\n')[0].strip()
            if first_line and len(first_line) > 10:
                job['title'] = first_line[:200]
            else:
                job['title'] = elem.get_text().strip()[:200]
        
        # Clean up title (remove extra whitespace, newlines)
        if job['title']:
            job['title'] = ' '.join(job['title'].split())
        
        if not job['title'] or len(job['title']) < 3:
            return None
        
        # Apply URL - improved extraction to find the best job detail link
        # Strategy 1: Find all links in the element and prioritize job detail links
        all_links = elem.find_all('a', href=True)
        
        if all_links:
            # Prioritize links that look like job detail pages
            # Prefer links with keywords like "view", "details", "read", "apply", or job-specific paths
            best_link = None
            best_score = -1
            
            for link in all_links:
                href = link.get('href', '').lower()
                link_text = link.get_text().lower().strip()
                
                # Skip invalid links
                if href.startswith('#') or href.startswith('javascript:') or not href:
                    continue
                
                # Score links based on relevance
                score = 0
                
                # High priority: links with job detail keywords in href
                if any(kw in href for kw in ['/job/', '/position/', '/vacancy/', '/detail', '/view/', '/apply', '/post/', '/opportunity/', '/consultant/']):
                    score += 10
                
                # High priority: links with job detail keywords in text
                if any(kw in link_text for kw in ['view', 'details', 'read more', 'apply', 'see more', 'full', 'more info', 'learn more']):
                    score += 8
                
                # Medium priority: links that look like detail pages (have IDs or slugs)
                if re.search(r'/\d+', href) or re.search(r'/[a-z0-9-]{10,}$', href):  # Has ID or long slug
                    score += 5
                
                # Medium priority: links that are NOT listing pages
                if not any(kw in href for kw in ['/jobs', '/careers', '/vacancies', '/opportunities', '/list', '/search']):
                    score += 3
                
                # Penalty: links that are clearly listing pages
                if any(kw in href for kw in ['/jobs', '/careers', '/vacancies', '/opportunities', '/list', '/search']):
                    score -= 10
                
                if score > best_score:
                    best_score = score
                    best_link = link
            
            if best_link and best_score >= 0:
                job['apply_url'] = urljoin(base_url, best_link['href'])
            elif all_links:
                # Fallback to first non-anchor link if no good match found
                for link in all_links:
                    href = link.get('href', '')
                    if href and not href.startswith('#') and not href.startswith('javascript:'):
                        job['apply_url'] = urljoin(base_url, href)
                        break
                else:
                    # Last resort: use base_url
                    job['apply_url'] = base_url
            else:
                job['apply_url'] = base_url
        else:
            # Strategy 2: Check parent element for links (for table rows, list items, etc.)
            parent = elem.parent
            if parent:
                parent_links = parent.find_all('a', href=True)
                if parent_links:
                    # Use same scoring logic for parent links
                    best_link = None
                    best_score = -1
                    for link in parent_links:
                        href = link.get('href', '').lower()
                        if href.startswith('#') or href.startswith('javascript:') or not href:
                            continue
                        score = 0
                        if any(kw in href for kw in ['/job/', '/position/', '/vacancy/', '/detail', '/view/', '/apply']):
                            score += 10
                        if not any(kw in href for kw in ['/jobs', '/careers', '/vacancies', '/list']):
                            score += 3
                        if score > best_score:
                            best_score = score
                            best_link = link
                    
                    if best_link:
                        job['apply_url'] = urljoin(base_url, best_link['href'])
                    else:
                        job['apply_url'] = base_url
                else:
                    job['apply_url'] = base_url
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
        jobs_to_enrich = []  # Track jobs that need enrichment
        
        try:
            with conn.cursor() as cur:
                for job in jobs:
                    # Check if exists
                    cur.execute("""
                        SELECT id, last_seen_at, enriched_at FROM jobs WHERE canonical_hash = %s
                    """, (job['canonical_hash'],))
                    
                    existing = cur.fetchone()
                    
                    if existing:
                        job_id = str(existing[0])
                        # Update job data (including apply_url, title, description, etc.) and last_seen_at
                        # This ensures we get the latest data, especially better apply_urls
                        cur.execute("""
                            UPDATE jobs SET
                                title = %s,
                                location_raw = %s,
                                country_iso = %s,
                                level_norm = %s,
                                career_type = %s,
                                work_modality = %s,
                                mission_tags = %s,
                                international_eligible = %s,
                                deadline = %s,
                                apply_url = %s,
                                description_snippet = %s,
                                last_seen_at = NOW(),
                                updated_at = NOW()
                            WHERE canonical_hash = %s
                        """, (
                            job.get('title'),
                            job.get('location_raw'),
                            job.get('country_iso'),
                            job.get('level_norm'),
                            job.get('career_type'),
                            job.get('work_modality'),
                            job.get('mission_tags', []),
                            job.get('international_eligible', False),
                            job.get('deadline'),
                            job.get('apply_url'),
                            job.get('description_snippet'),
                            job['canonical_hash']
                        ))
                        counts['updated'] += 1
                        
                        # Trigger enrichment if not already enriched or if job was updated
                        # (re-enrich on update to catch any changes)
                        jobs_to_enrich.append({
                            'id': job_id,
                            'title': job.get('title', ''),
                            'description': job.get('description_snippet', ''),
                            'org_name': job.get('org_name'),
                            'location': job.get('location_raw'),
                        })
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
                            ) RETURNING id
                        """, (
                            source_id, job.get('org_name'), job.get('title'),
                            job.get('location_raw'), job.get('country_iso'),
                            job.get('level_norm'), job.get('career_type'),
                            job.get('work_modality'), job.get('mission_tags', []),
                            job.get('international_eligible', False),
                            job.get('deadline'), job.get('apply_url'),
                            job.get('description_snippet'), job['canonical_hash']
                        ))
                        job_id = str(cur.fetchone()[0])
                        counts['inserted'] += 1
                        
                        # Trigger enrichment for newly inserted jobs
                        jobs_to_enrich.append({
                            'id': job_id,
                            'title': job.get('title', ''),
                            'description': job.get('description_snippet', ''),
                            'org_name': job.get('org_name'),
                            'location': job.get('location_raw'),
                        })
                
                conn.commit()
                
                # Trigger enrichment for all jobs (asynchronously, non-blocking)
                if jobs_to_enrich:
                    try:
                        from app.enrichment_worker import trigger_enrichment_on_job_create_or_update
                        for job_data in jobs_to_enrich:
                            trigger_enrichment_on_job_create_or_update(
                                job_id=job_data['id'],
                                title=job_data['title'],
                                description=job_data['description'],
                                org_name=job_data['org_name'],
                                location=job_data['location'],
                            )
                        logger.info(f"[html_fetch] Triggered enrichment for {len(jobs_to_enrich)} job(s)")
                    except Exception as e:
                        # Don't fail the crawl if enrichment fails
                        logger.warning(f"[html_fetch] Failed to trigger enrichment: {e}")
        
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
