"""
Enterprise-grade data repair and enrichment system.

Instead of rejecting jobs with data quality issues, this module:
1. Repairs contaminated fields (extracts correct data from mixed fields)
2. Enriches missing data (infers location, deadline, etc.)
3. Cleans and normalizes extracted data
4. Only rejects truly invalid jobs (no title, no URL)

This ensures we maximize job opportunities for users while maintaining quality.
"""

import re
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, date, timedelta
from dateutil import parser as date_parser
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class DataRepairEngine:
    """
    Intelligent data repair engine that fixes extraction errors.
    
    Instead of rejecting jobs, it attempts to:
    - Extract correct location from contaminated location fields
    - Parse dates from mixed location/deadline fields
    - Infer missing data from context
    - Clean and normalize extracted values
    """
    
    # Common city-country patterns for location extraction
    CITY_COUNTRY_PATTERNS = [
        r'([A-Z][a-zA-Z\s]+),\s*([A-Z][a-zA-Z\s]+)',  # "Paris, France"
        r'([A-Z][a-zA-Z\s]+)\s+([A-Z]{2,3})',  # "Paris FR" or "Montreal CA"
    ]
    
    # Date fragments to remove from locations
    DATE_FRAGMENTS = ['nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                     'jul', 'aug', 'sep', 'oct', 'fr', 'af', 'ca']
    
    # Job title keywords that shouldn't be in location
    JOB_TITLE_KEYWORDS = [
        'assistant', 'director', 'manager', 'officer', 'specialist',
        'internship', 'consultant', 'professional', 'deputy', 'senior',
        'junior', 'statistical', 'communications', 'methodologies', 'education',
        'project', 'general', 'service', 'contract', 'national'
    ]
    
    # Common location names (cities, countries)
    KNOWN_LOCATIONS = {
        'paris': 'Paris, France',
        'montreal': 'Montreal, Canada',
        'kabul': 'Kabul, Afghanistan',
        'cairo': 'Cairo, Egypt',
        'geneva': 'Geneva, Switzerland',
        'bangkok': 'Bangkok, Thailand',
        'dhaka': 'Dhaka, Bangladesh',
        'beijing': 'Beijing, China',
        'tashkent': 'Tashkent, Uzbekistan',
        'apia': 'Apia, Samoa',
        'santiago': 'Santiago, Chile',
        'erbil': 'Erbil, Iraq',
        'suva': 'Suva, Fiji',
        'almaty': 'Almaty, Kazakhstan',
        'perugia': 'Perugia, Italy',
        'moscow': 'Moscow, Russia',
    }
    
    def __init__(self):
        """Initialize repair engine."""
        self.city_country_regex = [re.compile(pattern) for pattern in self.CITY_COUNTRY_PATTERNS]
    
    def repair_job(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """
        Repair a job with data quality issues.
        
        Args:
            job: Job dictionary with potential quality issues
            
        Returns:
            Repaired job dictionary with:
            - repaired: bool - Whether any repairs were made
            - repair_log: List[str] - Log of repairs performed
            - original_issues: List[str] - Original quality issues
        """
        repaired_job = job.copy()
        repairs = []
        original_issues = []
        
        # 1. Repair contaminated location field
        if job.get('location_raw'):
            location_repair = self._repair_location(job.get('location_raw', ''), job.get('title', ''))
            if location_repair['repaired']:
                repaired_job['location_raw'] = location_repair['value']
                repairs.append(f"Location repaired: '{job.get('location_raw')}' → '{location_repair['value']}'")
                original_issues.append(location_repair.get('original_issue', 'Location contamination'))
        
        # 2. Extract deadline from contaminated location or description
        if not job.get('deadline') and job.get('location_raw'):
            deadline_extracted = self._extract_deadline_from_location(job.get('location_raw', ''))
            if deadline_extracted:
                repaired_job['deadline'] = deadline_extracted
                repairs.append(f"Deadline extracted from location: {deadline_extracted}")
        
        # 3. Infer location from description or URL if missing
        if not repaired_job.get('location_raw') or not self._is_valid_location(repaired_job.get('location_raw', '')):
            inferred_location = self._infer_location(job)
            if inferred_location:
                repaired_job['location_raw'] = inferred_location
                repairs.append(f"Location inferred: '{inferred_location}'")
        
        # 4. Infer deadline from similar jobs or heuristics if missing
        if not repaired_job.get('deadline'):
            inferred_deadline = self._infer_deadline(job)
            if inferred_deadline:
                repaired_job['deadline'] = inferred_deadline
                repairs.append(f"Deadline inferred: {inferred_deadline}")
        
        # 5. Clean title (remove extra whitespace, fix encoding)
        if job.get('title'):
            cleaned_title = self._clean_title(job.get('title', ''))
            if cleaned_title != job.get('title'):
                repaired_job['title'] = cleaned_title
                repairs.append(f"Title cleaned")
        
        return {
            'job': repaired_job,
            'repaired': len(repairs) > 0,
            'repair_log': repairs,
            'original_issues': original_issues
        }
    
    def _repair_location(self, location: str, title: str) -> Dict[str, Any]:
        """
        Repair contaminated location field.
        
        Examples:
        - "Director" → None (job title, not location)
        - "Paris, France Nov FR" → "Paris, France" (remove date fragments)
        - "Montreal, Canada" → "Montreal, Canada" (already valid)
        """
        if not location:
            return {'repaired': False, 'value': None}
        
        location_lower = location.lower().strip()
        title_lower = title.lower().strip() if title else ''
        
        # Check if location is identical to title (severe contamination)
        if location_lower == title_lower:
            return {
                'repaired': True,
                'value': None,
                'original_issue': 'Location identical to title'
            }
        
        # Check if location contains title (partial contamination)
        if title_lower and title_lower in location_lower and len(title_lower) > 5:
            # Try to extract location part
            location_cleaned = location_lower.replace(title_lower, '').strip()
            if self._is_valid_location(location_cleaned):
                return {
                    'repaired': True,
                    'value': location_cleaned.title(),
                    'original_issue': 'Location contained title'
                }
            return {
                'repaired': True,
                'value': None,
                'original_issue': 'Location was title'
            }
        
        # Check if location is a job title keyword
        location_words = location_lower.split()
        has_job_keywords = any(kw in location_lower for kw in self.JOB_TITLE_KEYWORDS)
        
        if has_job_keywords:
            # Try to extract valid location from mixed field
            # Look for city-country patterns
            for pattern in self.city_country_regex:
                match = pattern.search(location)
                if match:
                    city = match.group(1).strip()
                    country = match.group(2).strip()
                    # Remove date fragments
                    city = self._remove_date_fragments(city)
                    country = self._remove_date_fragments(country)
                    if city and country and len(city) > 2:
                        return {
                            'repaired': True,
                            'value': f"{city}, {country}",
                            'original_issue': 'Location contained job keywords'
                        }
            
            # If no pattern found, return None
            return {
                'repaired': True,
                'value': None,
                'original_issue': 'Location was job title'
            }
        
        # Remove date fragments (e.g., "Nov FR", "20 Nov")
        location_cleaned = self._remove_date_fragments(location)
        location_cleaned = re.sub(r'\s+', ' ', location_cleaned).strip()
        
        # Check if cleaned location is valid
        if location_cleaned and self._is_valid_location(location_cleaned):
            if location_cleaned != location:
                return {
                    'repaired': True,
                    'value': location_cleaned,
                    'original_issue': 'Location contained date fragments'
                }
            return {'repaired': False, 'value': location}
        
        return {
            'repaired': True,
            'value': None,
            'original_issue': 'Location invalid after cleaning'
        }
    
    def _remove_date_fragments(self, text: str) -> str:
        """Remove date fragments from text."""
        if not text:
            return text
        
        # Remove standalone month abbreviations and country codes
        words = text.split()
        cleaned_words = []
        for word in words:
            word_lower = word.lower().strip('.,;:')
            if word_lower not in self.DATE_FRAGMENTS:
                cleaned_words.append(word)
        
        return ' '.join(cleaned_words).strip()
    
    def _is_valid_location(self, location: str) -> bool:
        """Check if location looks valid."""
        if not location or len(location) < 3:
            return False
        
        location_lower = location.lower()
        
        # Check if it's a known location
        for known_loc in self.KNOWN_LOCATIONS.keys():
            if known_loc in location_lower:
                return True
        
        # Check if it matches city, country pattern
        for pattern in self.city_country_regex:
            if pattern.search(location):
                return True
        
        # Check if it contains job keywords (invalid)
        if any(kw in location_lower for kw in self.JOB_TITLE_KEYWORDS):
            return False
        
        # If it's a reasonable length and doesn't look like a job title, accept it
        return len(location) >= 3 and len(location) <= 100
    
    def _extract_deadline_from_location(self, location: str) -> Optional[date]:
        """Extract deadline date from location field if it contains date fragments."""
        if not location:
            return None
        
        # Look for date patterns in location
        date_patterns = [
            r'(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})',  # DD-MM-YYYY
            r'(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})',  # DD MMM YYYY
            r'([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})',  # MMM DD, YYYY
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, location, re.IGNORECASE)
            if match:
                try:
                    parsed = date_parser.parse(location, fuzzy=True)
                    if parsed.date() > date.today():  # Only future dates
                        return parsed.date()
                except:
                    continue
        
        return None
    
    def _infer_location(self, job: Dict[str, Any]) -> Optional[str]:
        """
        Infer location from job context.
        
        Strategies:
        1. Extract from description_snippet
        2. Extract from apply_url domain
        3. Use org_name default locations (e.g., UNESCO → Paris)
        """
        # Strategy 1: Extract from description
        if job.get('description_snippet'):
            desc = job.get('description_snippet', '').lower()
            for known_loc, full_loc in self.KNOWN_LOCATIONS.items():
                if known_loc in desc:
                    return full_loc
        
        # Strategy 2: Infer from URL domain
        if job.get('apply_url'):
            url = job.get('apply_url', '')
            domain = urlparse(url).netloc.lower()
            
            # Domain-based location inference
            if 'paris' in domain or 'france' in domain:
                return 'Paris, France'
            elif 'montreal' in domain or 'canada' in domain:
                return 'Montreal, Canada'
            elif 'geneva' in domain or 'switzerland' in domain:
                return 'Geneva, Switzerland'
        
        # Strategy 3: Org-based defaults
        org_name = (job.get('org_name') or '').lower()
        if 'unesco' in org_name:
            return 'Paris, France'
        elif 'undp' in org_name:
            return 'New York, USA'  # UNDP HQ
        elif 'unicef' in org_name:
            return 'New York, USA'
        elif 'who' in org_name:
            return 'Geneva, Switzerland'
        
        return None
    
    def _infer_deadline(self, job: Dict[str, Any]) -> Optional[date]:
        """
        Infer deadline using heuristics.
        
        Strategies:
        1. Default: 30 days from now (common for job postings)
        2. Extract from description
        3. Use similar job deadlines
        """
        # Strategy 1: Extract from description
        if job.get('description_snippet'):
            desc = job.get('description_snippet', '')
            # Look for deadline patterns
            deadline_patterns = [
                r'deadline[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
                r'apply by[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
                r'closing[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
            ]
            
            for pattern in deadline_patterns:
                match = re.search(pattern, desc, re.IGNORECASE)
                if match:
                    try:
                        parsed = date_parser.parse(match.group(1), fuzzy=True)
                        if parsed.date() > date.today():
                            return parsed.date()
                    except:
                        continue
        
        # Strategy 2: Default heuristic (30 days)
        # Only use if we have a valid job (title + URL)
        if job.get('title') and job.get('apply_url'):
            return (date.today() + timedelta(days=30))
        
        return None
    
    def _clean_title(self, title: str) -> str:
        """Clean title (remove extra whitespace, fix encoding)."""
        if not title:
            return title
        
        # Remove extra whitespace
        cleaned = re.sub(r'\s+', ' ', title).strip()
        
        # Fix common encoding issues
        cleaned = cleaned.replace('â€™', "'")
        cleaned = cleaned.replace('â€"', '"')
        cleaned = cleaned.replace('â€"', '"')
        
        return cleaned


# Global repair engine instance
data_repair_engine = DataRepairEngine()

