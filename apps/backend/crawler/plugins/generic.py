"""
Generic extraction plugin.

Provides fallback extraction using common job listing patterns.
This is the default plugin when no source-specific plugin matches.
"""
import logging
import re
from typing import List, Dict, Optional
from urllib.parse import urljoin
from .base import ExtractionPlugin, PluginResult

logger = logging.getLogger(__name__)

# Common job listing selectors (heuristics)
JOB_SELECTORS = [
    '.job-listing', '.job-item', '.career-item', '.position',
    'article.job', 'div.vacancy', 'tr.job-row', 'li.job',
    '[class*="job"]', '[class*="position"]', '[class*="vacancy"]', '[class*="career"]',
    '[class*="opening"]', '[id*="job"]', '[id*="position"]', '[id*="vacancy"]',
    'article[class*="job"]', 'div[class*="job"]', 'li[class*="job"]',
    'tr[class*="job"]', 'section[class*="job"]', 'div[class*="position"]',
    'tbody tr', 'table tr[data-job]', 'table tr[data-position]',
    'table tbody tr', 'tr[class*="row"]', 'tr[class*="item"]',
    'ul.jobs li', 'ol.jobs li', 'ul.positions li', 'ul.vacancies li',
    'ul[class*="job"] li', 'ol[class*="job"] li',
    '.card[class*="job"]', '.card[class*="position"]', '[role="article"]',
    'div[class*="listing"]', 'div[class*="posting"]', 'div[class*="opportunity"]'
]


class GenericPlugin(ExtractionPlugin):
    """Generic fallback plugin for job extraction"""
    
    def __init__(self):
        super().__init__(name="generic", priority=10)  # Low priority - fallback only
    
    def can_handle(self, url: str, html: str, config: Optional[Dict] = None) -> bool:
        """Generic plugin can always handle (as fallback)"""
        return True
    
    def extract(
        self,
        html: str,
        base_url: str,
        config: Optional[Dict] = None
    ) -> PluginResult:
        """
        Extract jobs using generic patterns.
        
        Returns:
            PluginResult with extracted jobs
        """
        soup = self.get_soup(html)
        job_elements = []
        
        # Use parser hint if provided (CSS selector)
        parser_hint = config.get('parser_hint') if config else None
        if parser_hint:
            job_elements = soup.select(parser_hint)
            if job_elements:
                self.logger.debug(f"Found {len(job_elements)} jobs using parser_hint: {parser_hint}")
        
        # Try common selectors
        if not job_elements:
            for selector in JOB_SELECTORS:
                job_elements = soup.select(selector)
                if job_elements:
                    self.logger.debug(f"Found {len(job_elements)} jobs using selector: {selector}")
                    break
        
        # Fallback: Find links with job-related keywords
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
                self.logger.debug(f"Found {len(job_links)} job links")
                job_elements = job_links[:50]  # Limit to first 50
        
        # Try structured data (JSON-LD, microdata)
        if not job_elements:
            json_ld_scripts = soup.find_all('script', type='application/ld+json')
            for script in json_ld_scripts:
                try:
                    import json
                    data = json.loads(script.string)
                    if isinstance(data, dict) and data.get('@type') == 'JobPosting':
                        job_elements.append(data)
                    elif isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict) and item.get('@type') == 'JobPosting':
                                job_elements.append(item)
                except:
                    pass
            
            microdata_jobs = soup.find_all(attrs={'itemtype': lambda x: x and 'JobPosting' in x})
            if microdata_jobs:
                self.logger.debug(f"Found {len(microdata_jobs)} jobs via microdata")
                job_elements = microdata_jobs[:50]
        
        # Convert to standard job format
        jobs = []
        seen_urls = set()
        
        for elem in job_elements:
            # Handle JSON-LD structured data
            if isinstance(elem, dict) and '@type' in elem and elem.get('@type') == 'JobPosting':
                title = elem.get('title', '')
                apply_url = elem.get('url') or elem.get('applicationUrl', '')
                if title and apply_url:
                    normalized_url = apply_url.rstrip('/').split('#')[0].split('?')[0]
                    if normalized_url not in seen_urls:
                        seen_urls.add(normalized_url)
                        jobs.append({
                            'title': title,
                            'apply_url': apply_url,
                            'description_snippet': elem.get('description', '')[:500] if elem.get('description') else None,
                            'location_raw': elem.get('jobLocation', {}).get('address', {}).get('addressLocality', '') if isinstance(elem.get('jobLocation'), dict) else None
                        })
                continue
            
            # Handle HTML elements
            link = elem.find('a', href=True) if hasattr(elem, 'find') else None
            if not link:
                # Try to find link in element
                if hasattr(elem, 'find_all'):
                    links = elem.find_all('a', href=True)
                    link = links[0] if links else None
            
            if link:
                href = link.get('href', '')
                if href and not href.startswith('#') and not href.startswith('javascript:'):
                    apply_url = urljoin(base_url, href)
                    normalized_url = apply_url.rstrip('/').split('#')[0].split('?')[0]
                    
                    # Skip duplicates
                    if normalized_url in seen_urls:
                        continue
                    seen_urls.add(normalized_url)
                    
                    # Extract title
                    title = link.get_text().strip()
                    if not title or len(title) < 5:
                        # Try parent element text
                        if hasattr(elem, 'get_text'):
                            parent_text = elem.get_text().strip()
                            if len(parent_text) > len(title):
                                title = parent_text.split('\n')[0][:100].strip()
                    
                    if title and len(title) >= 5:
                        jobs.append({
                            'title': title,
                            'apply_url': apply_url,
                            'description_snippet': elem.get_text()[:500] if hasattr(elem, 'get_text') else None
                        })
        
        confidence = 0.7 if len(jobs) > 0 else 0.0
        
        return PluginResult(
            jobs=jobs,
            confidence=confidence,
            message=f"Extracted {len(jobs)} jobs using generic patterns" if jobs else "No jobs found",
            metadata={'elements_found': len(job_elements), 'unique_urls': len(seen_urls)}
        )

