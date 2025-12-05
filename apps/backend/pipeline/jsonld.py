"""
JSON-LD extractor.

Extracts job information from structured JSON-LD data (Schema.org JobPosting).
"""

import json
import logging
from typing import Dict, List, Optional, Any
from bs4 import BeautifulSoup

from .extractor import FieldResult, CONFIDENCE_SCORES

logger = logging.getLogger(__name__)


class JSONLDExtractor:
    """Extracts job data from JSON-LD structured data."""
    
    def extract(self, soup: BeautifulSoup, url: str) -> Dict[str, FieldResult]:
        """
        Extract job fields from JSON-LD.
        
        Returns:
            Dictionary mapping field names to FieldResult objects
        """
        fields = {}
        
        # Find all JSON-LD scripts
        scripts = soup.find_all('script', type='application/ld+json')
        
        for script in scripts:
            try:
                data = json.loads(script.string)
                
                # Handle different JSON-LD structures
                items = self._flatten_jsonld(data)
                
                for item in items:
                    if self._is_job_posting(item):
                        extracted = self._extract_job_posting(item, url)
                        # Merge results, keeping highest confidence
                        for field_name, field_result in extracted.items():
                            if field_name not in fields or field_result.confidence > fields[field_name].confidence:
                                fields[field_name] = field_result
            except (json.JSONDecodeError, AttributeError) as e:
                logger.debug(f"Failed to parse JSON-LD: {e}")
                continue
        
        return fields
    
    def _flatten_jsonld(self, data: Any) -> List[Dict]:
        """Flatten JSON-LD structure to list of items."""
        items = []
        
        if isinstance(data, dict):
            # Check if it's a JobPosting directly
            if self._is_job_posting(data):
                items.append(data)
            # Check for @graph
            elif '@graph' in data and isinstance(data['@graph'], list):
                items.extend([item for item in data['@graph'] if isinstance(item, dict)])
            # Check for itemListElement
            elif 'itemListElement' in data and isinstance(data['itemListElement'], list):
                for element in data['itemListElement']:
                    if isinstance(element, dict) and 'item' in element:
                        items.append(element['item'])
        elif isinstance(data, list):
            items.extend([item for item in data if isinstance(item, dict)])
        
        return items
    
    def _is_job_posting(self, item: Dict) -> bool:
        """Check if JSON-LD item is a JobPosting."""
        item_type = item.get('@type', '')
        if isinstance(item_type, str):
            return 'JobPosting' in item_type
        elif isinstance(item_type, list):
            return any('JobPosting' in str(t) for t in item_type)
        return False
    
    def _extract_job_posting(self, job_data: Dict, url: str) -> Dict[str, FieldResult]:
        """Extract fields from JobPosting JSON-LD."""
        fields = {}
        confidence = CONFIDENCE_SCORES['jsonld']
        
        # Title
        if 'title' in job_data:
            fields['title'] = FieldResult(
                value=str(job_data['title']).strip(),
                source='jsonld',
                confidence=confidence,
                raw_snippet=str(job_data['title'])[:200]
            )
        
        # Employer/Organization
        employer = None
        if 'hiringOrganization' in job_data:
            org = job_data['hiringOrganization']
            if isinstance(org, dict):
                employer = org.get('name', org.get('legalName'))
            elif isinstance(org, str):
                employer = org
        elif 'employer' in job_data:
            employer = job_data['employer']
        
        if employer:
            fields['employer'] = FieldResult(
                value=str(employer).strip(),
                source='jsonld',
                confidence=confidence,
                raw_snippet=str(employer)[:200]
            )
        
        # Location
        location = None
        if 'jobLocation' in job_data:
            loc = job_data['jobLocation']
            if isinstance(loc, dict):
                # Try address
                if 'address' in loc:
                    addr = loc['address']
                    if isinstance(addr, dict):
                        parts = []
                        if 'addressLocality' in addr:
                            parts.append(addr['addressLocality'])
                        if 'addressRegion' in addr:
                            parts.append(addr['addressRegion'])
                        if 'addressCountry' in addr:
                            parts.append(addr['addressCountry'])
                        location = ', '.join(parts) if parts else addr.get('addressCountry', '')
                    elif isinstance(addr, str):
                        location = addr
                elif 'name' in loc:
                    location = loc['name']
            elif isinstance(loc, str):
                location = loc
        
        if location:
            fields['location'] = FieldResult(
                value=str(location).strip(),
                source='jsonld',
                confidence=confidence,
                raw_snippet=str(location)[:200]
            )
        
        # Posted date
        if 'datePosted' in job_data:
            date_str = str(job_data['datePosted'])
            # Parse ISO date to YYYY-MM-DD
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                date_formatted = dt.strftime('%Y-%m-%d')
                fields['posted_on'] = FieldResult(
                    value=date_formatted,
                    source='jsonld',
                    confidence=confidence,
                    raw_snippet=date_str
                )
            except (ValueError, AttributeError):
                pass
        
        # Deadline
        if 'validThrough' in job_data or 'applicationDeadline' in job_data:
            deadline_str = str(job_data.get('validThrough') or job_data.get('applicationDeadline'))
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
                date_formatted = dt.strftime('%Y-%m-%d')
                fields['deadline'] = FieldResult(
                    value=date_formatted,
                    source='jsonld',
                    confidence=confidence,
                    raw_snippet=deadline_str
                )
            except (ValueError, AttributeError):
                pass
        
        # Description
        if 'description' in job_data:
            desc = str(job_data['description']).strip()
            fields['description'] = FieldResult(
                value=desc,
                source='jsonld',
                confidence=confidence,
                raw_snippet=desc[:500]
            )
        
        # Application URL
        if 'url' in job_data:
            fields['application_url'] = FieldResult(
                value=str(job_data['url']).strip(),
                source='jsonld',
                confidence=confidence,
                raw_snippet=str(job_data['url'])
            )
        
        return fields

