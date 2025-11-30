"""
UNESCO-specific extraction plugin.

Handles UNESCO job listings with multiple fallback patterns:
1. Table rows with job listings
2. Divs with job listings (card-based layouts)
3. List items with job content
4. Links with job-related text/URLs
"""
import re
import logging
from typing import List, Dict, Optional
from urllib.parse import urljoin
from .base import ExtractionPlugin, PluginResult

logger = logging.getLogger(__name__)


class UNESCOPlugin(ExtractionPlugin):
    """Plugin for UNESCO job extraction"""
    
    def __init__(self):
        super().__init__(name="unesco", priority=80)  # High priority for UNESCO URLs
    
    def can_handle(self, url: str, html: str, config: Optional[Dict] = None) -> bool:
        """Check if this is a UNESCO URL"""
        return 'unesco.org' in url.lower()
    
    def extract(
        self,
        html: str,
        base_url: str,
        config: Optional[Dict] = None
    ) -> PluginResult:
        """
        Extract UNESCO jobs using multiple fallback patterns.
        
        Returns:
            PluginResult with extracted jobs
        """
        soup = self.get_soup(html)
        job_elements = []
        
        self.logger.info(f"Using UNESCO-specific extraction for {base_url}")
        
        # Pattern 1: Table rows with job listings
        tables = soup.find_all('table')
        header_keywords = ['title', 'position', 'location', 'deadline', 'apply', 'reference', 'post', 'vacancy']
        is_likely_header_row = {}
        
        for idx, row in enumerate(tables[0].find_all('tr')[:5] if tables else []):
            row_text = row.get_text().lower()
            th_count = len(row.find_all('th'))
            td_count = len(row.find_all('td'))
            header_keyword_count = sum(1 for kw in header_keywords if kw in row_text)
            
            if (th_count > td_count or header_keyword_count >= 3) and idx < 3:
                is_likely_header_row[idx] = True
        
        for table in tables:
            rows = table.find_all('tr')
            for idx, row in enumerate(rows):
                if (row.find_parent('thead') or
                    (row.find('th') and not row.find('td')) or
                    is_likely_header_row.get(idx, False)):
                    continue
                
                row_text = row.get_text().lower()
                has_job_keywords = any(kw in row_text for kw in [
                    'position', 'vacancy', 'post', 'recruit', 'opportunity',
                    'consultant', 'specialist', 'officer', 'manager', 'coordinator',
                    'programme', 'project', 'fellowship', 'internship'
                ])
                has_link = row.find('a', href=True)
                
                if has_job_keywords and has_link and len(row_text.strip()) > 20:
                    links = row.find_all('a', href=True)
                    has_job_link = False
                    for link in links:
                        href = link.get('href', '').lower()
                        link_text = link.get_text().lower().strip()
                        if (any(kw in href for kw in ['/job/', '/position/', '/vacancy/', '/post/', '/opportunity/']) or
                            any(kw in link_text for kw in ['view', 'details', 'apply', 'read more']) or
                            re.search(r'/\d{4,}', href)):
                            has_job_link = True
                            break
                    
                    if has_job_link or len(links) == 1:
                        job_elements.append(row)
                        if len(job_elements) >= 100:
                            break
            if len(job_elements) >= 100:
                break
        
        # Pattern 2: Divs with job listings
        if not job_elements:
            job_divs = soup.find_all(['div', 'article', 'section'], class_=re.compile(
                r'job|position|vacancy|career|opportunity|listing|posting', re.I
            ))
            for div in job_divs:
                div_text = div.get_text().lower()
                if (any(kw in div_text for kw in ['position', 'vacancy', 'post', 'recruit', 'opportunity']) and
                    div.find('a', href=True)):
                    if 50 < len(div_text) < 2000:
                        job_elements.append(div)
                        if len(job_elements) >= 100:
                            break
        
        # Pattern 3: List items
        if not job_elements:
            list_items = soup.find_all('li')
            for li in list_items:
                li_text = li.get_text().lower()
                if (any(kw in li_text for kw in ['position', 'vacancy', 'post', 'recruit', 'opportunity']) and
                    li.find('a', href=True)):
                    if 50 < len(li_text) < 1000:
                        job_elements.append(li)
                        if len(job_elements) >= 100:
                            break
        
        # Pattern 4: Links with job-related text/URLs
        if not job_elements:
            all_links = soup.find_all('a', href=True)
            for link in all_links:
                href = link.get('href', '').lower()
                link_text = link.get_text().lower().strip()
                
                is_job_link = (
                    any(kw in href for kw in ['/job/', '/position/', '/vacancy/', '/career/', '/opportunity/', '/post/']) or
                    any(kw in link_text for kw in ['position', 'vacancy', 'post', 'recruit', 'opportunity', 'apply', 'view details']) or
                    re.search(r'/\d{4,}', href)
                )
                
                is_listing = any(kw in href for kw in ['/jobs', '/careers', '/vacancies', '/opportunities', '/list', '/search', '/all', '/index'])
                
                if is_job_link and not is_listing:
                    parent = link.parent
                    for _ in range(3):
                        if parent and parent.name in ['tr', 'div', 'li', 'article', 'section', 'td']:
                            if parent not in job_elements:
                                job_elements.append(parent)
                                break
                        parent = parent.parent if parent else None
                    
                    if len(job_elements) >= 100:
                        break
        
        self.logger.info(f"UNESCO extraction found {len(job_elements)} job elements")
        
        # Validate extraction
        elements_with_links = 0
        for elem in job_elements:
            if elem.find('a', href=True):
                elements_with_links += 1
        
        self.logger.info(f"UNESCO validation: {elements_with_links}/{len(job_elements)} elements have links")
        
        if elements_with_links == 0:
            self.logger.warning("UNESCO WARNING: No links found in extracted elements")
        
        # Convert to standard job format
        jobs = []
        for elem in job_elements:
            link = elem.find('a', href=True)
            if not link:
                continue
            
            href = link.get('href', '')
            if not href or href.startswith('#') or href.startswith('javascript:'):
                continue
            
            apply_url = urljoin(base_url, href)
            
            # Extract title
            title = link.get_text().strip()
            if not title or len(title) < 5:
                # Try to find title in parent element
                parent_text = elem.get_text().strip()
                if len(parent_text) > len(title):
                    # Use first line or first 100 chars
                    title = parent_text.split('\n')[0][:100].strip()
            
            if title and len(title) >= 5:
                jobs.append({
                    'title': title,
                    'apply_url': apply_url,
                    'description_snippet': elem.get_text()[:500] if elem.get_text() else None
                })
        
        confidence = 0.9 if len(jobs) > 0 else 0.0
        
        return PluginResult(
            jobs=jobs,
            confidence=confidence,
            message=f"Extracted {len(jobs)} UNESCO jobs" if jobs else "No jobs extracted",
            metadata={'elements_found': len(job_elements), 'elements_with_links': elements_with_links}
        )

