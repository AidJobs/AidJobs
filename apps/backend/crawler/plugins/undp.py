"""
UNDP-specific extraction plugin.

Handles UNDP job listings which use a pattern like:
"Job Title [title] Apply by [date] Location [location]"

CRITICAL: This plugin enforces strict uniqueness of apply_urls.
"""
import re
import logging
from typing import List, Dict, Optional
from urllib.parse import urlparse, urljoin
from .base import ExtractionPlugin, PluginResult
from core.field_extractors import field_extractor
from core.data_quality import data_quality_validator

logger = logging.getLogger(__name__)


class UNDPPlugin(ExtractionPlugin):
    """Plugin for UNDP job extraction"""
    
    def __init__(self):
        super().__init__(name="undp", priority=80)  # High priority for UNDP URLs
        self.job_title_pattern = re.compile(r'(?i)Job Title\s+', re.IGNORECASE)
    
    def can_handle(self, url: str, html: str, config: Optional[Dict] = None) -> bool:
        """Check if this is a UNDP URL"""
        url_lower = url.lower()
        return 'undp.org' in url_lower or 'cj_view_consultancies' in url_lower
    
    def extract(
        self,
        html: str,
        base_url: str,
        config: Optional[Dict] = None
    ) -> PluginResult:
        """
        Extract UNDP jobs with strict uniqueness enforcement.
        
        Returns:
            PluginResult with extracted jobs
        """
        soup = self.get_soup(html)
        job_elements = []
        
        self.logger.info(f"Using UNDP-specific extraction for {base_url}")
        self.logger.info("ENTERPRISE MODE: Strict uniqueness enforcement enabled")
        
        # Track used links to prevent duplicates (CRITICAL)
        used_links = set()
        used_containers = set()
        
        # Strategy: Find table rows (tr) that contain "Job Title" - each row is one job
        job_rows = []
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                row_text = row.get_text()
                if self.job_title_pattern.search(row_text):
                    title_match = re.search(r'(?i)Job Title\s+([^\n\r]+)', row_text)
                    if title_match:
                        title = title_match.group(1).strip()
                        if title and len(title) >= 5:
                            row_id = id(row)
                            if row_id not in used_containers:
                                job_rows.append({
                                    'container': row,
                                    'title': title,
                                    'type': 'table_row',
                                    'row_id': row_id
                                })
                                used_containers.add(row_id)
        
        self.logger.info(f"Found {len(job_rows)} job rows in table structure")
        
        # Fallback: Find "Job Title" text nodes if no table rows
        job_title_nodes = []
        if not job_rows:
            self.logger.info("No table rows found, using text node approach")
            for text_node in soup.find_all(string=self.job_title_pattern):
                parent = text_node.parent
                if not parent:
                    continue
                
                title_text = text_node.string if hasattr(text_node, 'string') else str(text_node)
                title_match = re.search(r'(?i)Job Title\s+([^\n\r]+)', title_text)
                if not title_match:
                    parent_text = parent.get_text() if parent else ''
                    title_match = re.search(r'(?i)Job Title\s+([^\n\r]+)', parent_text)
                
                if not title_match:
                    continue
                
                title = title_match.group(1).strip()
                if not title or len(title) < 5:
                    continue
                
                job_title_nodes.append({
                    'text_node': text_node,
                    'parent': parent,
                    'title': title
                })
            
            self.logger.info(f"Found {len(job_title_nodes)} 'Job Title' text nodes")
        
        # Process job rows (preferred method)
        for job_info in job_rows:
            container = job_info['container']
            title = job_info['title']
            
            self.logger.debug(f"Processing job: '{title[:60]}...'")
            
            # Extract links from cells in THIS row only
            cells = container.find_all(['td', 'th'])
            candidate_links = []
            
            for cell_idx, cell in enumerate(cells):
                cell_text = cell.get_text()
                cell_has_title = title.lower() in cell_text.lower() or self.job_title_pattern.search(cell_text)
                
                cell_links = cell.find_all('a', href=True)
                for link in cell_links:
                    href = link.get('href', '')
                    if href and not href.startswith('#') and not href.startswith('javascript:'):
                        resolved_href = urljoin(base_url, href)
                        normalized_href = resolved_href.rstrip('/').split('#')[0].split('?')[0]
                        
                        if normalized_href in used_links:
                            self.logger.debug(f"  Link already used: {href[:60]}...")
                            continue
                        
                        score = self._score_link(href, link, title, base_url, cell_has_title)
                        
                        candidate_links.append({
                            'link': link,
                            'href': href,
                            'resolved_href': resolved_href,
                            'normalized_href': normalized_href,
                            'score': score,
                            'cell_idx': cell_idx,
                            'in_title_cell': cell_has_title
                        })
            
            # Select best link
            if candidate_links:
                candidate_links.sort(key=lambda x: x['score'], reverse=True)
                best_candidate = candidate_links[0]
                
                if best_candidate['score'] > 0:
                    normalized_href = best_candidate['normalized_href']
                    
                    if normalized_href in used_links:
                        self.logger.warning(f"CRITICAL: Link collision detected for '{title[:50]}...'")
                        continue
                    
                    used_links.add(normalized_href)
                    full_text = container.get_text()
                    
                    self.logger.info(f"✓ Job '{title[:50]}...' -> {best_candidate['href'][:80]} (score: {best_candidate['score']:.1f})")
                    
                    job_elements.append({
                        'element': container,
                        'title': title,
                        'link': best_candidate['link'],
                        'link_href': best_candidate['href'],
                        'resolved_url': best_candidate['resolved_href'],
                        'full_text': full_text,
                        'title_text': title
                    })
                    
                    if len(job_elements) >= 100:
                        break
        
        # Fallback: Process text nodes if no table rows found
        if not job_rows and job_title_nodes:
            self.logger.info(f"Processing {len(job_title_nodes)} text nodes with strict validation")
            for job_info in job_title_nodes:
                text_node = job_info['text_node']
                parent = job_info['parent']
                title = job_info['title']
                
                container = self._find_container_for_title(parent, title, soup)
                if not container:
                    continue
                
                container_id = id(container)
                if container_id in used_containers:
                    continue
                used_containers.add(container_id)
                
                candidate_links = self._find_candidate_links(container, title, base_url, used_links)
                
                if candidate_links:
                    candidate_links.sort(key=lambda x: x['score'], reverse=True)
                    best_candidate = candidate_links[0]
                    
                    if best_candidate['score'] > 0:
                        normalized_href = best_candidate['normalized_href']
                        
                        if normalized_href in used_links:
                            continue
                        
                        used_links.add(normalized_href)
                        full_text = container.get_text()
                        
                        job_elements.append({
                            'element': container,
                            'title': title,
                            'link': best_candidate['link'],
                            'link_href': best_candidate['href'],
                            'resolved_url': best_candidate['resolved_href'],
                            'full_text': full_text,
                            'title_text': title
                        })
                        
                        if len(job_elements) >= 100:
                            break
        
        self.logger.info(f"UNDP extraction found {len(job_elements)} job elements")
        
        # Validate uniqueness
        extracted_urls = []
        for elem in job_elements:
            if isinstance(elem, dict) and 'resolved_url' in elem:
                extracted_urls.append(elem['resolved_url'])
            elif isinstance(elem, dict) and 'link_href' in elem:
                extracted_urls.append(urljoin(base_url, elem['link_href']))
        
        normalized_urls = [url.rstrip('/').split('#')[0].split('?')[0] for url in extracted_urls]
        unique_urls = set(normalized_urls)
        
        if len(unique_urls) < len(extracted_urls):
            self.logger.error(f"CRITICAL ERROR: Found {len(extracted_urls)} jobs but only {len(unique_urls)} unique URLs!")
        else:
            self.logger.info(f"✓ ENTERPRISE VALIDATION PASSED: All {len(job_elements)} jobs have unique URLs")
        
        # Convert to standard job format using field_extractor for consistency
        jobs = []
        for elem in job_elements:
            if isinstance(elem, dict):
                title = elem.get('title', '').strip()
                if not title or len(title) < 5:
                    continue
                
                # Validate title is not a date, location, or label (same as UNESCO)
                title_lower = title.lower()
                date_patterns = [
                    r'^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$',
                    r'^\d{1,2}\s+[a-z]{3,9}\s+\d{2,4}$',
                    r'^[a-z]{3,9}\s+\d{1,2},?\s+\d{2,4}$',
                ]
                if any(re.match(pattern, title_lower) for pattern in date_patterns):
                    self.logger.warning(f"[undp] REJECTED - title is a date: '{title}'")
                    continue
                
                month_abbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
                if title_lower in month_abbrevs:
                    self.logger.warning(f"[undp] REJECTED - title is a month: '{title}'")
                    continue
                
                job = {
                    'title': title,
                    'apply_url': elem.get('resolved_url') or urljoin(base_url, elem.get('link_href', '')),
                    'description_snippet': elem.get('full_text', '')[:500] if elem.get('full_text') else None
                }
                
                # Extract location and deadline using field_extractor for consistency
                container = elem.get('element')
                if container:
                    cells = container.find_all(['td', 'th'])
                    if cells:
                        # Try to find header row in parent table
                        header_map = {}
                        table = container.find_parent('table')
                        if table:
                            header_row = table.find('tr')
                            if header_row:
                                header_map = field_extractor.parse_table_header(header_row)
                        
                        # Extract using field_extractor
                        location = field_extractor.extract_location_from_table_row(container, header_map, cells)
                        deadline = field_extractor.extract_deadline_from_table_row(container, header_map, cells)
                        
                        if location:
                            job['location_raw'] = location
                        if deadline:
                            job['deadline'] = deadline
                
                # Fallback: Extract location and deadline from full_text if field_extractor didn't find them
                if not job.get('location_raw') or not job.get('deadline'):
                    full_text = elem.get('full_text', '')
                    if full_text:
                        if not job.get('location_raw'):
                            location_match = re.search(r'(?i)Location\s*:?\s*(.+)', full_text)
                            if location_match:
                                job['location_raw'] = location_match.group(1).strip().split('\n')[0].strip()
                        
                        if not job.get('deadline'):
                            deadline_match = re.search(r'(?i)(?:Apply by|Deadline|Closing date)\s*:?\s*(.+)', full_text)
                            if deadline_match:
                                deadline_text = deadline_match.group(1).strip().split('\n')[0].strip()
                                parsed_deadline = field_extractor.parse_deadline(deadline_text)
                                if parsed_deadline:
                                    job['deadline'] = parsed_deadline
                
                # Validate job data using the unified validator (same as UNESCO)
                validation_result = data_quality_validator.validate_and_score(job)
                
                if validation_result['valid']:
                    job['data_quality_score'] = validation_result['score']
                    job['data_quality_issues'] = validation_result['issues'] + validation_result['warnings']
                    jobs.append(job)
                else:
                    self.logger.warning(f"[undp] Rejected job due to quality issues: {validation_result['rejected_reason']} - Title: {title[:50]}...")
        
        confidence = 0.95 if len(jobs) > 0 and len(unique_urls) == len(extracted_urls) else 0.5
        
        return PluginResult(
            jobs=jobs,
            confidence=confidence,
            message=f"Extracted {len(jobs)} UNDP jobs" if jobs else "No jobs extracted",
            metadata={'unique_urls': len(unique_urls), 'total_extracted': len(extracted_urls)}
        )
    
    def _score_link(
        self,
        href: str,
        link,
        title: str,
        base_url: str,
        in_title_cell: bool = False
    ) -> float:
        """Score a link for quality"""
        score = 100.0 if in_title_cell else 50.0
        href_lower = href.lower()
        link_text = link.get_text().lower().strip()
        
        # Unique identifiers
        if re.search(r'/\d{4,}', href):
            score += 50
        elif re.search(r'/[a-z0-9-]{15,}', href):
            score += 40
        elif re.search(r'/id[=:](\d+|[a-z0-9-]+)', href, re.I):
            score += 45
        
        # Job detail patterns
        if any(kw in href_lower for kw in ['/job/', '/position/', '/vacancy/', '/detail', '/view/', '/apply', '/post/', '/consultant/', '/opportunity/', '/consultancy/']):
            score += 30
        
        # Detail keywords
        if any(kw in link_text for kw in ['view', 'details', 'read more', 'apply', 'see more', 'full', 'more info']):
            score += 20
        
        # Penalties
        if any(kw in href_lower for kw in ['/jobs', '/careers', '/vacancies', '/opportunities', '/list', '/search', '/cj_view_consultancies', '/all', '/index']):
            score -= 100
        
        parsed_base = urlparse(base_url)
        parsed_href = urlparse(href)
        if parsed_href.path == parsed_base.path or parsed_href.path == parsed_base.path.rstrip('/'):
            score -= 50
        
        if title.lower()[:20] in link_text:
            score += 15
        
        return score
    
    def _find_container_for_title(self, parent, title: str, soup) -> Optional:
        """Find the best container for a job title"""
        for level in range(6):
            current = parent
            for _ in range(level):
                if current:
                    current = current.parent
            
            if current and current.name in ['tr', 'div', 'li', 'article', 'section', 'td', 'tbody']:
                container_text = current.get_text()
                if self.job_title_pattern.search(container_text) and title.lower() in container_text.lower():
                    return current
        
        # Fallback
        container = parent
        for _ in range(3):
            if container and container.name in ['tr', 'div', 'li', 'article', 'section', 'td']:
                return container
            container = container.parent if container else None
        
        return None
    
    def _find_candidate_links(
        self,
        container,
        title: str,
        base_url: str,
        used_links: set
    ) -> List[Dict]:
        """Find candidate links in a container"""
        candidate_links = []
        
        if container.name == 'tr':
            cells = container.find_all(['td', 'th'])
            for cell in cells:
                cell_text = cell.get_text()
                cell_has_title = title.lower() in cell_text.lower() or self.job_title_pattern.search(cell_text)
                
                for link in cell.find_all('a', href=True):
                    href = link.get('href', '')
                    if href and not href.startswith('#') and not href.startswith('javascript:'):
                        resolved_href = urljoin(base_url, href)
                        normalized_href = resolved_href.rstrip('/').split('#')[0].split('?')[0]
                        
                        if normalized_href in used_links:
                            continue
                        
                        score = self._score_link(href, link, title, base_url, cell_has_title)
                        candidate_links.append({
                            'link': link,
                            'href': href,
                            'resolved_href': resolved_href,
                            'normalized_href': normalized_href,
                            'score': score
                        })
        else:
            for link in container.find_all('a', href=True):
                href = link.get('href', '')
                if href and not href.startswith('#') and not href.startswith('javascript:'):
                    resolved_href = urljoin(base_url, href)
                    normalized_href = resolved_href.rstrip('/').split('#')[0].split('?')[0]
                    
                    if normalized_href in used_links:
                        continue
                    
                    score = self._score_link(href, link, title, base_url, False)
                    candidate_links.append({
                        'link': link,
                        'href': href,
                        'resolved_href': resolved_href,
                        'normalized_href': normalized_href,
                        'score': score
                    })
        
        return candidate_links

