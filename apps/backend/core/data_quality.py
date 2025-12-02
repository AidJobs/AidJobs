"""
Enterprise-grade data quality validation system.

Used by ALL extractors (HTML, RSS, API, JSON, REST) to ensure consistent,
high-quality job data across all sources.
"""

import re
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, date
from dateutil import parser as date_parser

logger = logging.getLogger(__name__)


class DataQualityValidator:
    """
    Unified data quality validator for all job sources.
    
    Validates and scores job data quality, rejecting obviously incorrect data.
    """
    
    # Invalid title patterns (labels, dates, placeholders)
    INVALID_TITLE_PATTERNS = [
        r'^(title|location|deadline|closing date|apply by|reference|ref|n/a|na|-|—)$',
        r'^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$',  # Date only
        r'^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$',  # Date with month name
        r'^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}$',  # Month DD, YYYY
        r'^(nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)\s+\d{1,2}$',  # Month + day
    ]
    
    # Invalid location patterns
    INVALID_LOCATION_PATTERNS = [
        r'^(location|place|city|country|n/a|na|-|—)$',
        r'^(nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)$',  # Month abbreviations
    ]
    
    # Invalid deadline patterns
    INVALID_DEADLINE_PATTERNS = [
        r'^(deadline|closing date|apply by|n/a|na|-|—)$',
    ]
    
    def __init__(self):
        """Initialize validator with compiled regex patterns."""
        self.invalid_title_regex = [re.compile(pattern, re.I) for pattern in self.INVALID_TITLE_PATTERNS]
        self.invalid_location_regex = [re.compile(pattern, re.I) for pattern in self.INVALID_LOCATION_PATTERNS]
        self.invalid_deadline_regex = [re.compile(pattern, re.I) for pattern in self.INVALID_DEADLINE_PATTERNS]
    
    def validate_and_score(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate job data and generate quality score.
        
        Args:
            job: Raw job dictionary
            
        Returns:
            Dictionary with:
            {
                "valid": bool,  # Should this job be accepted?
                "score": int,   # Quality score 0-100
                "issues": List[str],  # List of quality issues
                "warnings": List[str],  # Non-critical warnings
                "rejected_reason": Optional[str]  # Why job was rejected
            }
        """
        issues = []
        warnings = []
        score = 100
        
        # 1. Validate title (CRITICAL - reject if invalid)
        title_validation = self._validate_title(job.get('title', ''))
        if not title_validation['valid']:
            logger.warning(f"[data_quality] Job rejected - title validation failed: {title_validation['reason']}")
            return {
                "valid": False,
                "score": 0,
                "issues": [title_validation['reason']],
                "warnings": [],
                "rejected_reason": title_validation['reason']
            }
        if title_validation['issues']:
            issues.extend(title_validation['issues'])
            score -= title_validation['penalty']
        
        # 2. Validate location (WARNING - don't reject, but penalize)
        location_validation = self._validate_location(job.get('location_raw', ''))
        if location_validation['issues']:
            warnings.extend(location_validation['issues'])
            score -= location_validation['penalty']
        
        # 3. Validate deadline (WARNING - don't reject, but penalize)
        deadline_validation = self._validate_deadline(job.get('deadline'))
        if deadline_validation['issues']:
            warnings.extend(deadline_validation['issues'])
            score -= deadline_validation['penalty']
        
        # 4. Validate apply_url (WARNING - don't reject, but penalize)
        url_validation = self._validate_url(job.get('apply_url', ''))
        if url_validation['issues']:
            warnings.extend(url_validation['issues'])
            score -= url_validation['penalty']
        
        # 5. Check for cross-field contamination (e.g., location == title)
        contamination = self._check_contamination(job)
        if contamination['issues']:
            issues.extend(contamination['issues'])
            score -= contamination['penalty']
            # Reject if severe contamination
            if contamination.get('reject'):
                logger.warning(f"[data_quality] Job rejected - field contamination: {contamination['issues'][0]}")
                return {
                    "valid": False,
                    "score": 0,
                    "issues": contamination['issues'],
                    "warnings": warnings,
                    "rejected_reason": contamination['issues'][0]
                }
        
        # Ensure score is non-negative
        score = max(0, score)
        
        if score < 80:
            logger.info(f"[data_quality] Job quality score: {score}/100 (issues: {len(issues)}, warnings: {len(warnings)})")
        
        return {
            "valid": True,
            "score": score,
            "issues": issues,
            "warnings": warnings,
            "rejected_reason": None
        }
    
    def _validate_title(self, title: Optional[str]) -> Dict[str, Any]:
        """Validate job title."""
        if not title:
            return {
                "valid": False,
                "reason": "Title is missing",
                "issues": [],
                "penalty": 0
            }
        
        title = title.strip()
        
        # Check minimum length
        if len(title) < 5:
            return {
                "valid": False,
                "reason": f"Title too short: '{title}' (minimum 5 characters)",
                "issues": [],
                "penalty": 0
            }
        
        # Check for invalid patterns
        for pattern in self.invalid_title_regex:
            if pattern.match(title):
                return {
                    "valid": False,
                    "reason": f"Title is invalid pattern: '{title}' (appears to be a label or date)",
                    "issues": [],
                    "penalty": 0
                }
        
        issues = []
        penalty = 0
        
        # Check for suspicious patterns (warnings, not rejections)
        if len(title) < 10:
            issues.append(f"Title is very short: '{title}'")
            penalty += 5
        
        if title.isupper() and len(title) > 20:
            issues.append("Title is all uppercase (may be formatting issue)")
            penalty += 3
        
        if title.count(' ') == 0 and len(title) > 15:
            issues.append("Title has no spaces (may be concatenated)")
            penalty += 5
        
        return {
            "valid": True,
            "reason": None,
            "issues": issues,
            "penalty": penalty
        }
    
    def _validate_location(self, location: Optional[str]) -> Dict[str, Any]:
        """Validate location field."""
        if not location:
            return {
                "issues": ["Location is missing"],
                "penalty": 10
            }
        
        location = location.strip()
        
        # Check for invalid patterns
        for pattern in self.invalid_location_regex:
            if pattern.match(location):
                return {
                    "issues": [f"Location appears to be a label: '{location}'"],
                    "penalty": 15
                }
        
        issues = []
        penalty = 0
        
        # Check for suspicious patterns
        if len(location) < 3:
            issues.append(f"Location is very short: '{location}'")
            penalty += 5
        
        if location.isupper() and len(location) > 10:
            issues.append("Location is all uppercase (may be formatting issue)")
            penalty += 3
        
        return {
            "issues": issues,
            "penalty": penalty
        }
    
    def _validate_deadline(self, deadline: Any) -> Dict[str, Any]:
        """Validate deadline field."""
        if not deadline:
            return {
                "issues": ["Deadline is missing"],
                "penalty": 5
            }
        
        # If deadline is a string, check for invalid patterns
        if isinstance(deadline, str):
            deadline_str = deadline.strip()
            for pattern in self.invalid_deadline_regex:
                if pattern.match(deadline_str):
                    return {
                        "issues": [f"Deadline appears to be a label: '{deadline_str}'"],
                        "penalty": 10
                    }
        
        return {
            "issues": [],
            "penalty": 0
        }
    
    def _validate_url(self, url: Optional[str]) -> Dict[str, Any]:
        """Validate apply URL."""
        if not url:
            return {
                "issues": ["Apply URL is missing"],
                "penalty": 10
            }
        
        issues = []
        penalty = 0
        
        # Check for invalid URLs
        if url.startswith('#') or url.startswith('javascript:'):
            issues.append(f"Invalid URL format: '{url}'")
            penalty += 15
        
        if url == 'http://' or url == 'https://':
            issues.append("URL is just a protocol")
            penalty += 10
        
        return {
            "issues": issues,
            "penalty": penalty
        }
    
    def _check_contamination(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Check for cross-field contamination (e.g., location == title)."""
        issues = []
        penalty = 0
        reject = False
        
        title = (job.get('title', '') or '').strip().lower()
        location = (job.get('location_raw', '') or '').strip().lower()
        
        # Check if location is the same as title (severe contamination)
        if title and location and title == location:
            issues.append(f"Location is identical to title: '{location}' (likely extraction error)")
            penalty += 30
            reject = True  # Reject if severe contamination
        
        # Check if title contains location (less severe)
        if title and location and location in title and len(location) > 5:
            issues.append("Title contains location text (may be extraction error)")
            penalty += 10
        
        return {
            "issues": issues,
            "penalty": penalty,
            "reject": reject
        }


# Global validator instance
data_quality_validator = DataQualityValidator()

