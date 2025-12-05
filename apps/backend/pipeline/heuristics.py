"""
Heuristic extractor.

Uses label-based heuristics and pattern matching to extract job fields.
"""

import re
import logging
from typing import Dict, Optional
from datetime import datetime
from bs4 import BeautifulSoup

from .extractor import FieldResult, CONFIDENCE_SCORES

logger = logging.getLogger(__name__)


class HeuristicExtractor:
    """Extracts job fields using heuristics and pattern matching."""
    
    def extract(self, soup: BeautifulSoup, url: str) -> Dict[str, FieldResult]:
        """Extract fields using heuristics."""
        fields = {}
        text = soup.get_text() if soup else ""
        
        # Location extraction
        location = self._extract_location(soup, text)
        if location:
            fields['location'] = location
        
        # Deadline extraction
        deadline = self._extract_deadline(soup, text)
        if deadline:
            fields['deadline'] = deadline
        
        # Posted date extraction
        posted_on = self._extract_posted_date(soup, text)
        if posted_on:
            fields['posted_on'] = posted_on
        
        # Requirements extraction
        requirements = self._extract_requirements(soup, text)
        if requirements:
            fields['requirements'] = requirements
        
        return fields
    
    def _extract_location(self, soup: BeautifulSoup, text: str) -> Optional[FieldResult]:
        """Extract location using label heuristics."""
        # Look for labeled location fields
        location_patterns = [
            r'(?:location|duty station|based in|work location)[:\s]+([A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)?)',
            r'(?:location|duty station)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        ]
        
        # Try in structured elements first
        if soup:
            # Look for labels
            labels = soup.find_all(['dt', 'th', 'label', 'span'], 
                                 string=re.compile(r'location|duty station', re.I))
            for label in labels:
                # Get next sibling or parent's next sibling
                value_elem = label.find_next_sibling(['dd', 'td', 'div', 'span'])
                if value_elem:
                    location_text = value_elem.get_text().strip()
                    if location_text and len(location_text) > 2:
                        return FieldResult(
                            value=location_text,
                            source='heuristic',
                            confidence=CONFIDENCE_SCORES['heuristic'],
                            raw_snippet=f"{label.get_text()}: {location_text}"[:200]
                        )
        
        # Fallback to regex
        for pattern in location_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                location = match.group(1).strip()
                if len(location) > 2 and len(location) < 100:
                    return FieldResult(
                        value=location,
                        source='heuristic',
                        confidence=CONFIDENCE_SCORES['heuristic'],
                        raw_snippet=match.group(0)[:200]
                    )
        
        return None
    
    def _extract_deadline(self, soup: BeautifulSoup, text: str) -> Optional[FieldResult]:
        """Extract deadline using heuristics."""
        # Try dateutil parser if available
        try:
            from dateutil import parser as date_parser
            use_dateutil = True
        except ImportError:
            use_dateutil = False
        
        # Look for labeled deadline fields
        deadline_labels = ['deadline', 'closing date', 'apply by', 'application deadline', 'due date']
        
        if soup:
            for label_text in deadline_labels:
                labels = soup.find_all(['dt', 'th', 'label', 'span'], 
                                     string=re.compile(label_text, re.I))
                for label in labels:
                    value_elem = label.find_next_sibling(['dd', 'td', 'div', 'span'])
                    if value_elem:
                        date_text = value_elem.get_text().strip()
                        parsed_date = self._parse_date(date_text, use_dateutil)
                        if parsed_date:
                            return FieldResult(
                                value=parsed_date,
                                source='heuristic',
                                confidence=CONFIDENCE_SCORES['heuristic'],
                                raw_snippet=f"{label.get_text()}: {date_text}"[:200]
                            )
        
        # Regex patterns
        date_patterns = [
            r'(?:deadline|closing|apply by|due date)[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
            r'(?:deadline|closing|apply by|due date)[:\s]+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})',
            r'(?:deadline|closing|apply by|due date)[:\s]+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})',
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date_text = match.group(1)
                parsed_date = self._parse_date(date_text, use_dateutil)
                if parsed_date:
                    return FieldResult(
                        value=parsed_date,
                        source='heuristic',
                        confidence=CONFIDENCE_SCORES['heuristic'],
                        raw_snippet=match.group(0)[:200]
                    )
        
        return None
    
    def _extract_posted_date(self, soup: BeautifulSoup, text: str) -> Optional[FieldResult]:
        """Extract posted date."""
        try:
            from dateutil import parser as date_parser
            use_dateutil = True
        except ImportError:
            use_dateutil = False
        
        # Look for posted date labels
        posted_labels = ['posted', 'published', 'posted on', 'date posted']
        
        if soup:
            for label_text in posted_labels:
                labels = soup.find_all(['dt', 'th', 'label', 'span'], 
                                     string=re.compile(label_text, re.I))
                for label in labels:
                    value_elem = label.find_next_sibling(['dd', 'td', 'div', 'span'])
                    if value_elem:
                        date_text = value_elem.get_text().strip()
                        parsed_date = self._parse_date(date_text, use_dateutil)
                        if parsed_date:
                            return FieldResult(
                                value=parsed_date,
                                source='heuristic',
                                confidence=CONFIDENCE_SCORES['heuristic'],
                                raw_snippet=f"{label.get_text()}: {date_text}"[:200]
                            )
        
        return None
    
    def _extract_requirements(self, soup: BeautifulSoup, text: str) -> Optional[FieldResult]:
        """Extract requirements as list."""
        requirements = []
        
        # Look for requirements section
        req_section = None
        if soup:
            # Find section with "requirements" in heading
            headings = soup.find_all(['h2', 'h3', 'h4'], 
                                    string=re.compile(r'requirement|qualification|skill', re.I))
            for heading in headings:
                # Get next siblings until next heading
                current = heading.find_next_sibling()
                while current and current.name not in ['h1', 'h2', 'h3', 'h4']:
                    if current.name in ['ul', 'ol']:
                        items = current.find_all('li')
                        requirements.extend([item.get_text().strip() for item in items])
                        break
                    current = current.find_next_sibling()
                if requirements:
                    break
        
        if requirements:
            return FieldResult(
                value=requirements,
                source='heuristic',
                confidence=CONFIDENCE_SCORES['heuristic'],
                raw_snippet='\n'.join(requirements[:5])[:500]
            )
        
        return None
    
    def _parse_date(self, date_text: str, use_dateutil: bool = False) -> Optional[str]:
        """Parse date string to YYYY-MM-DD format."""
        if not date_text:
            return None
        
        try:
            if use_dateutil:
                from dateutil import parser as date_parser
                dt = date_parser.parse(date_text, fuzzy=True)
                return dt.strftime('%Y-%m-%d')
            else:
                # Basic parsing
                # Try common formats
                formats = [
                    '%Y-%m-%d',
                    '%m/%d/%Y',
                    '%d/%m/%Y',
                    '%d-%m-%Y',
                    '%B %d, %Y',
                    '%b %d, %Y',
                ]
                for fmt in formats:
                    try:
                        dt = datetime.strptime(date_text.strip(), fmt)
                        return dt.strftime('%Y-%m-%d')
                    except ValueError:
                        continue
        except Exception as e:
            logger.debug(f"Failed to parse date '{date_text}': {e}")
        
        return None

