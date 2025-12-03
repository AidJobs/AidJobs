"""
UNESCO-specific extraction plugin.

Handles UNESCO job listings with multiple fallback patterns:
1. Table rows with job listings (ENHANCED: proper column mapping)
2. Divs with job listings (card-based layouts)
3. List items with job content
4. Links with job-related text/URLs
"""
import re
import logging
from typing import List, Dict, Optional
from urllib.parse import urljoin
from .base import ExtractionPlugin, PluginResult
from core.field_extractors import field_extractor

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
        
        # Pattern 1: Table rows with job listings (ENHANCED with proper column mapping)
        tables = soup.find_all('table')
        header_map = None
        
        for table in tables:
            rows = table.find_all('tr')
            if not rows:
                continue
            
            # Find header row and parse column mapping
            # UNESCO often has header in thead or first row with th tags
            thead = table.find('thead')
            if thead:
                header_row = thead.find('tr')
                if header_row:
                    header_map = field_extractor.parse_table_header(header_row)
                    logger.info(f"[unesco] Found header in thead with columns: {header_map}")
            
            # If no thead, check first few rows
            if not header_map:
                for idx, row in enumerate(rows[:10]):  # Check first 10 rows (more thorough)
                    cells = row.find_all(['th', 'td'])
                    if not cells:
                        continue
                    
                    # Check if this looks like a header row
                    row_text = row.get_text().lower()
                    header_keywords = ['title', 'position', 'location', 'duty station', 'deadline', 'application deadline', 'apply', 'reference', 'closing']
                    header_keyword_count = sum(1 for kw in header_keywords if kw in row_text)
                    
                    # If row has many header keywords or mostly th tags, it's likely a header
                    if header_keyword_count >= 2 or (len(row.find_all('th')) > len(row.find_all('td'))):
                        header_map = field_extractor.parse_table_header(row)
                        logger.info(f"[unesco] Found header row at index {idx} with columns: {header_map}")
                        break
            
            # Extract jobs from data rows using header map
            header_row_found = False
            for row in rows:
                # Skip header rows (check if this is the header row we identified)
                if row.find_parent('thead'):
                    header_row_found = True
                    continue
                
                # Skip rows that are mostly th tags (likely header)
                th_count = len(row.find_all('th'))
                td_count = len(row.find_all('td'))
                if th_count > td_count and th_count > 0:
                    header_row_found = True
                    continue
                
                cells = row.find_all(['td', 'th'])
                if len(cells) < 2:  # Need at least 2 cells
                    continue
                
                # PRIORITY 1: Extract title from link text (most reliable)
                # Links in job tables almost always contain the actual job title
                link = row.find('a', href=True)
                title = None
                if link:
                    link_text = link.get_text().strip()
                    # Link text is usually the job title
                    if link_text and len(link_text) >= 5:
                        title = link_text
                        logger.debug(f"[unesco] Title from link: '{title[:50]}'")
                
                # PRIORITY 2: Use header map if no link or link text is too short
                if not title or len(title) < 5:
                    title = field_extractor.extract_title_from_table_row(row, header_map or {}, cells)
                    if title:
                        logger.debug(f"[unesco] Title from table cell: '{title[:50]}'")
                
                if not title:
                    continue
                
                # MINIMAL VALIDATION: Only reject obviously invalid titles
                # Let repair system and data quality validator handle contamination
                title_lower = title.lower().strip()
                
                # Only reject if title is EXACTLY a date (full match, not partial)
                date_patterns = [
                    r'^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$',  # DD-MM-YYYY (exact)
                    r'^\d{1,2}\s+[a-z]{3,9}\s+\d{2,4}$',  # DD MMM YYYY (exact)
                ]
                import re
                is_exact_date = any(re.fullmatch(pattern, title_lower) for pattern in date_patterns)
                if is_exact_date:
                    logger.debug(f"[unesco] Skipping - title is exact date: '{title}'")
                    continue
                
                # Only reject if title is a single month abbreviation (not part of text)
                month_abbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
                if title_lower in month_abbrevs and len(title) <= 3:
                    logger.debug(f"[unesco] Skipping - title is just month: '{title}'")
                    continue
                
                # Only reject if title is a single label word (not part of text)
                single_label_patterns = ['title', 'location', 'deadline', 'n/a', 'na', '-', '—']
                if title_lower in single_label_patterns and len(title) <= 10:
                    logger.debug(f"[unesco] Skipping - title is just label: '{title}'")
                    continue
                
                # Extract location and deadline (let repair handle contamination)
                location = field_extractor.extract_location_from_table_row(row, header_map or {}, cells)
                deadline = field_extractor.extract_deadline_from_table_row(row, header_map or {}, cells)
                
                # DEBUG: Log extraction results
                if not location:
                    logger.debug(f"[unesco] No location extracted for '{title[:50]}...' - cells: {[c.get_text().strip()[:30] for c in cells]}")
                if not deadline:
                    logger.debug(f"[unesco] No deadline extracted for '{title[:50]}...' - cells: {[c.get_text().strip()[:30] for c in cells]}")
                
                # NO STRICT VALIDATION HERE - let data quality validator and repair system handle it
                # This allows more jobs to pass through and be repaired if needed
                            logger.warning(f"[unesco] REJECTED - location contains date fragment: '{location}'")
                            continue
                    
                    # Clean location: remove date fragments if they slipped through
                    location_cleaned = location
                    for frag in date_fragments:
                        # Remove standalone month abbreviations
                        location_cleaned = re.sub(rf'\b{frag}\b', '', location_cleaned, flags=re.IGNORECASE).strip()
                    location_cleaned = re.sub(r'\s+', ' ', location_cleaned).strip()
                    
                    if location_cleaned != location:
                        logger.info(f"[unesco] Cleaned location: '{location}' -> '{location_cleaned}'")
                        location = location_cleaned if location_cleaned else None
                
                # Verify we have a job link (required)
                if not link:
                    logger.warning(f"[unesco] REJECTED - no link found for title: '{title[:50]}'")
                    continue
                
                # Add to job elements with extracted data
                job_elements.append({
                    'row': row,
                    'title': title,
                    'location': location,
                    'deadline': deadline,
                    'link': link
                })
                
                if len(job_elements) >= 100:
                    break
            
            if job_elements:
                break  # Found jobs, no need to check other tables
        
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
            # Handle enhanced table row extraction
            if isinstance(elem, dict):
                title = elem.get('title')
                location = elem.get('location')
                deadline = elem.get('deadline')
                link = elem.get('link')
                row = elem.get('row')
                
                if not link or not title:
                    continue
                
                href = link.get('href', '')
                if not href or href.startswith('#') or href.startswith('javascript:'):
                    continue
                
                apply_url = urljoin(base_url, href)
                
                job = {
                    'title': title,
                    'apply_url': apply_url,
                    'description_snippet': row.get_text()[:500] if row else None
                }
                
                # Add location and deadline if extracted
                if location:
                    job['location_raw'] = location
                if deadline:
                    job['deadline'] = deadline
                
                jobs.append(job)
            else:
                # Fallback: original extraction logic for non-table elements
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

