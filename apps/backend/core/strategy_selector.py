"""
AI-Powered Strategy Selector for Job Extraction

Intelligently selects the best extraction strategy for each source
and validates results for consistency.
"""

import logging
import re
from typing import Dict, List, Optional, Any, Tuple
from bs4 import BeautifulSoup
import os

logger = logging.getLogger(__name__)


class StrategySelector:
    """
    AI-powered strategy selector that:
    1. Analyzes HTML structure to choose the best extraction strategy
    2. Validates extracted jobs for consistency
    3. Adapts to different source types without affecting others
    """
    
    def __init__(self, ai_extractor=None):
        """
        Initialize strategy selector.
        
        Args:
            ai_extractor: Optional AI extractor instance for intelligent analysis
        """
        self.ai_extractor = ai_extractor
    
    def analyze_html_structure(self, html: str, base_url: str) -> Dict[str, Any]:
        """
        Analyze HTML structure to determine the best extraction strategy.
        
        Returns:
            {
                "recommended_strategy": str,  # "tables", "divs", "links", "structured", "generic"
                "confidence": float,  # 0.0-1.0
                "indicators": Dict,  # What indicators led to this decision
                "source_type": str  # Inferred source type
            }
        """
        soup = BeautifulSoup(html, 'html.parser')
        indicators = {}
        
        # Indicator 1: Check for tables
        tables = soup.find_all('table')
        table_count = len(tables)
        has_table_headers = False
        if tables:
            for table in tables[:3]:
                rows = table.find_all('tr')
                if len(rows) >= 2:
                    first_row = rows[0]
                    cells = first_row.find_all(['th', 'td'])
                    cell_texts = [c.get_text().strip().lower() for c in cells]
                    job_keywords = ['title', 'position', 'location', 'deadline', 'apply']
                    if any(kw in ' '.join(cell_texts) for kw in job_keywords):
                        has_table_headers = True
                        break
        
        indicators['tables'] = {
            'count': table_count,
            'has_headers': has_table_headers,
            'score': table_count * (2 if has_table_headers else 1)
        }
        
        # Indicator 2: Check for div/list containers
        job_containers = []
        for selector in [
            'div[class*="job"]', 'div[class*="position"]', 'div[class*="vacancy"]',
            'li[class*="job"]', 'li[class*="position"]', 'article[class*="job"]'
        ]:
            containers = soup.select(selector)
            job_containers.extend(containers[:10])
        
        indicators['divs'] = {
            'container_count': len(job_containers),
            'score': len(job_containers)
        }
        
        # Indicator 3: Check for structured data
        json_ld = soup.find_all('script', type='application/ld+json')
        microdata = soup.find_all(attrs={'itemtype': lambda x: x and 'JobPosting' in str(x)})
        
        indicators['structured'] = {
            'json_ld_count': len(json_ld),
            'microdata_count': len(microdata),
            'score': len(json_ld) * 3 + len(microdata) * 2
        }
        
        # Indicator 4: Check for job-like links
        all_links = soup.find_all('a', href=True)
        job_links = []
        job_keywords = ['position', 'job', 'vacancy', 'career', 'opening']
        for link in all_links[:100]:
            link_text = link.get_text().strip().lower()
            href = link.get('href', '').lower()
            if len(link_text) >= 10:
                if any(kw in link_text or kw in href for kw in job_keywords):
                    job_links.append(link)
        
        indicators['links'] = {
            'job_link_count': len(job_links),
            'score': len(job_links) * 0.5
        }
        
        # Indicator 5: Check main content area
        main_content = soup.find('main') or soup.find('div', id=lambda x: x and 'content' in str(x).lower())
        indicators['has_main_content'] = main_content is not None
        
        # Determine recommended strategy based on scores
        scores = {
            'tables': indicators['tables']['score'],
            'divs': indicators['divs']['score'],
            'structured': indicators['structured']['score'],
            'links': indicators['links']['score'],
            'generic': 1.0  # Always available as fallback
        }
        
        recommended_strategy = max(scores, key=scores.get)
        max_score = scores[recommended_strategy]
        total_score = sum(scores.values())
        confidence = max_score / total_score if total_score > 0 else 0.0
        
        # Infer source type
        if indicators['structured']['score'] > 0:
            source_type = 'structured'
        elif indicators['tables']['score'] > 5:
            source_type = 'table-based'
        elif indicators['divs']['score'] > 3:
            source_type = 'div-based'
        elif indicators['links']['score'] > 5:
            source_type = 'link-based'
        else:
            source_type = 'generic'
        
        return {
            'recommended_strategy': recommended_strategy,
            'confidence': confidence,
            'indicators': indicators,
            'source_type': source_type,
            'scores': scores
        }
    
    def validate_extracted_jobs(self, jobs: List[Dict], source_url: str) -> Tuple[List[Dict], List[str]]:
        """
        Validate extracted jobs for consistency and quality.
        
        Args:
            jobs: List of extracted job dictionaries
            source_url: Source URL for context
        
        Returns:
            (valid_jobs, warnings) - Filtered jobs and warning messages
        """
        valid_jobs = []
        warnings = []
        
        if not jobs:
            return valid_jobs, warnings
        
        # Validation 1: Check for minimum required fields
        for job in jobs:
            if not job.get('title') or len(job.get('title', '').strip()) < 5:
                warnings.append(f"Job missing or invalid title: {job.get('title', 'N/A')}")
                continue
            
            if not job.get('apply_url'):
                warnings.append(f"Job missing apply_url: {job.get('title', 'N/A')}")
                continue
            
            # Validation 2: Check for common false positives
            title = job.get('title', '').lower()
            nav_keywords = ['home', 'about', 'contact', 'login', 'register', 'privacy', 'terms']
            if any(nav in title for nav in nav_keywords) and len(title) < 20:
                warnings.append(f"Possible navigation link detected: {job.get('title')}")
                continue
            
            # Validation 3: Check for date-only titles (common extraction error)
            date_patterns = [
                r'^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$',
                r'^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$',
                r'^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}$'
            ]
            if any(re.match(pattern, job.get('title', ''), re.I) for pattern in date_patterns):
                warnings.append(f"Title appears to be a date: {job.get('title')}")
                continue
            
            # Validation 4: Check for location-only titles
            if ',' in job.get('title', '') and len(job.get('title', '').split(',')) == 2:
                # Might be "City, Country" pattern - check if it looks like location
                parts = job.get('title', '').split(',')
                if len(parts[0].strip()) < 15 and len(parts[1].strip()) < 15:
                    warnings.append(f"Title appears to be location: {job.get('title')}")
                    continue
            
            # Validation 5: Check URL validity
            apply_url = job.get('apply_url', '')
            if apply_url.startswith('#') or apply_url.startswith('javascript:'):
                warnings.append(f"Invalid apply_url: {apply_url}")
                continue
            
            # All validations passed
            valid_jobs.append(job)
        
        # Validation 6: Check for duplicates
        seen_titles = set()
        deduplicated_jobs = []
        for job in valid_jobs:
            title_key = job.get('title', '').lower().strip()
            if title_key not in seen_titles:
                seen_titles.add(title_key)
                deduplicated_jobs.append(job)
            else:
                warnings.append(f"Duplicate job detected: {job.get('title')}")
        
        if len(valid_jobs) != len(deduplicated_jobs):
            logger.info(f"Removed {len(valid_jobs) - len(deduplicated_jobs)} duplicate jobs")
        
        return deduplicated_jobs, warnings
    
    def normalize_job_data(self, job: Dict) -> Dict:
        """
        Normalize job data for consistency across all sources.
        
        Args:
            job: Raw job dictionary
        
        Returns:
            Normalized job dictionary
        """
        normalized = job.copy()
        
        # Normalize title
        if 'title' in normalized:
            title = normalized['title'].strip()
            # Remove common prefixes/suffixes
            title = re.sub(r'^(Job Title|Position|Title)[:\s]+', '', title, flags=re.I)
            title = re.sub(r'\s+', ' ', title)  # Normalize whitespace
            normalized['title'] = title
        
        # Normalize location
        if 'location_raw' in normalized and normalized['location_raw']:
            location = normalized['location_raw'].strip()
            # Remove common prefixes
            location = re.sub(r'^(Location|Duty Station|Based in)[:\s]+', '', location, flags=re.I)
            location = re.sub(r'\s+', ' ', location)
            normalized['location_raw'] = location
        
        # Normalize deadline
        if 'deadline' in normalized and normalized['deadline']:
            deadline = normalized['deadline']
            if isinstance(deadline, str):
                deadline = deadline.strip()
                # Remove common prefixes
                deadline = re.sub(r'^(Deadline|Closing|Apply by|Due)[:\s]+', '', deadline, flags=re.I)
                normalized['deadline'] = deadline
        
        # Normalize apply_url
        if 'apply_url' in normalized:
            url = normalized['apply_url'].strip()
            # Remove fragments and query params that might cause duplicates
            if '#' in url:
                url = url.split('#')[0]
            normalized['apply_url'] = url
        
        return normalized
    
    def select_and_validate(
        self,
        html: str,
        base_url: str,
        extraction_strategies: Dict[str, callable]
    ) -> Tuple[List[Dict], Dict[str, Any]]:
        """
        Select best strategy, extract jobs, and validate results.
        
        Args:
            html: HTML content
            base_url: Base URL for resolving relative links
            extraction_strategies: Dict mapping strategy names to extraction functions
        
        Returns:
            (jobs, metadata) - Extracted and validated jobs, plus metadata
        """
        # Step 1: Analyze HTML structure
        analysis = self.analyze_html_structure(html, base_url)
        recommended = analysis['recommended_strategy']
        confidence = analysis['confidence']
        
        logger.info(f"Strategy analysis: {recommended} (confidence: {confidence:.2f})")
        
        # Step 2: Try recommended strategy first
        jobs = []
        strategy_used = None
        
        if recommended in extraction_strategies:
            try:
                extract_func = extraction_strategies[recommended]
                jobs = extract_func(html, base_url)
                strategy_used = recommended
                logger.info(f"Strategy '{recommended}' extracted {len(jobs)} jobs")
            except Exception as e:
                logger.warning(f"Strategy '{recommended}' failed: {e}")
        
        # Step 3: If recommended strategy failed or found no jobs, try others in order
        if not jobs:
            strategy_order = ['tables', 'divs', 'links', 'structured', 'generic']
            for strategy in strategy_order:
                if strategy == recommended:
                    continue  # Already tried
                if strategy in extraction_strategies:
                    try:
                        extract_func = extraction_strategies[strategy]
                        jobs = extract_func(html, base_url)
                        if jobs:
                            strategy_used = strategy
                            logger.info(f"Fallback strategy '{strategy}' extracted {len(jobs)} jobs")
                            break
                    except Exception as e:
                        logger.warning(f"Strategy '{strategy}' failed: {e}")
                        continue
        
        # Step 4: Normalize all jobs
        normalized_jobs = [self.normalize_job_data(job) for job in jobs]
        
        # Step 5: Validate jobs
        valid_jobs, warnings = self.validate_extracted_jobs(normalized_jobs, base_url)
        
        metadata = {
            'analysis': analysis,
            'strategy_used': strategy_used,
            'original_count': len(jobs),
            'validated_count': len(valid_jobs),
            'warnings': warnings
        }
        
        return valid_jobs, metadata

