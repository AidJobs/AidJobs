"""
Enterprise-grade data quality validation system.

Used by ALL extractors (HTML, RSS, API, JSON, REST) to ensure consistent,
high-quality job data across all sources.

NOW WITH DATA REPAIR: Instead of rejecting jobs, we attempt to repair them first.
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
        r'^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$',  # Date only (DD-MM-YYYY or DD/MM/YYYY)
        r'^\d{1,2}[-/]\d{1,2}[-/]\d{2}$',  # Date only (DD-MM-YY or DD/MM/YY)
        r'^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$',  # Date with month name (DD MMM YYYY)
        r'^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}$',  # Month DD, YYYY (Nov 20, 2025)
        r'^(nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)\s+\d{1,2}$',  # Month + day
        r'^\d{1,2}-[A-Z]{3,9}-\d{2,4}$',  # DD-MMM-YYYY or DD-MMM-YY (20-DEC-2025)
        r'^[A-Z]{3,9}\s+\d{1,2},?\s+\d{4}$',  # MMM DD, YYYY (Nov 20, 2025)
        r'^[A-Za-z]+,?\s+[A-Za-z]+$',  # City, Country pattern (Montreal, Canada) - likely location not title
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
    
    def validate_and_score(self, job: Dict[str, Any], attempt_repair: bool = True) -> Dict[str, Any]:
        """
        Validate job data and generate quality score.
        
        Args:
            job: Raw job dictionary
            attempt_repair: If True, attempt to repair issues before rejecting
        
        Returns:
            Dictionary with:
            {
                "valid": bool,  # Should this job be accepted?
                "score": int,   # Quality score 0-100
                "issues": List[str],  # List of quality issues
                "warnings": List[str],  # Non-critical warnings
                "rejected_reason": Optional[str],  # Why job was rejected
                "repaired": bool,  # Whether repairs were attempted
                "repair_log": List[str],  # Log of repairs performed
                "repaired_job": Optional[Dict]  # Repaired job if repairs were made
            }
        """
        # STEP 1: Attempt repair if enabled
        repaired_job = job
        repair_log = []
        repaired = False
        
        if attempt_repair:
            try:
                from core.data_repair import data_repair_engine
                repair_result = data_repair_engine.repair_job(job)
                if repair_result['repaired']:
                    repaired_job = repair_result['job']
                    repair_log = repair_result['repair_log']
                    repaired = True
                    logger.info(f"[data_quality] Job repaired: {len(repair_log)} repairs made")
            except Exception as e:
                logger.warning(f"[data_quality] Repair attempt failed: {e}")
                # Continue with original job if repair fails
        
        issues = []
        warnings = []
        score = 100
        
        # 2. Validate title (CRITICAL - reject if invalid)
        title_validation = self._validate_title(repaired_job.get('title', ''))
        if not title_validation['valid']:
            logger.warning(f"[data_quality] Job rejected - title validation failed: {title_validation['reason']}")
            return {
                "valid": False,
                "score": 0,
                "issues": [title_validation['reason']],
                "warnings": [],
                "rejected_reason": title_validation['reason'],
                "repaired": repaired,
                "repair_log": repair_log,
                "repaired_job": repaired_job if repaired else None
            }
        if title_validation['issues']:
            issues.extend(title_validation['issues'])
            score -= title_validation['penalty']
        
        # 3. Validate location (WARNING - don't reject after repair, just penalize)
        location_validation = self._validate_location(repaired_job.get('location_raw', ''))
        # After repair, we're more lenient - only reject if still severely contaminated AND repair didn't help
        if location_validation.get('reject', False) and not repaired:
            logger.warning(f"[data_quality] Job rejected - location contamination (repair failed): {location_validation['issues']}")
            return {
                "valid": False,
                "score": 0,
                "issues": location_validation['issues'],
                "warnings": [],
                "rejected_reason": location_validation['issues'][0] if location_validation['issues'] else "Location field contamination",
                "repaired": repaired,
                "repair_log": repair_log,
                "repaired_job": repaired_job if repaired else None
            }
        if location_validation['issues']:
            # After repair, treat as warnings (not critical issues)
            if repaired:
                warnings.extend(location_validation['issues'])
                score -= location_validation['penalty'] // 2  # Reduced penalty after repair
            else:
                issues.extend(location_validation['issues'])
                score -= location_validation['penalty']
        if location_validation.get('warnings'):
            warnings.extend(location_validation['warnings'])
        
        # 4. Validate deadline (WARNING - don't reject, but penalize)
        deadline_validation = self._validate_deadline(repaired_job.get('deadline'))
        if deadline_validation['issues']:
            warnings.extend(deadline_validation['issues'])
            score -= deadline_validation['penalty']
        
        # 5. Validate apply_url (CRITICAL - reject if missing or invalid)
        url_validation = self._validate_url(repaired_job.get('apply_url', ''))
        if url_validation['issues']:
            # Missing URL is critical - reject
            if 'missing' in str(url_validation['issues']).lower():
                return {
                    "valid": False,
                    "score": 0,
                    "issues": url_validation['issues'],
                    "warnings": [],
                    "rejected_reason": "Apply URL is missing",
                    "repaired": repaired,
                    "repair_log": repair_log,
                    "repaired_job": repaired_job if repaired else None
                }
            warnings.extend(url_validation['issues'])
            score -= url_validation['penalty']
        
        # 6. Check for cross-field contamination (e.g., location == title)
        contamination = self._check_contamination(repaired_job)
        if contamination['issues']:
            # After repair, contamination should be reduced
            if repaired:
                warnings.extend(contamination['issues'])  # Treat as warnings after repair
                score -= contamination['penalty'] // 2  # Reduced penalty
            else:
                issues.extend(contamination['issues'])
                score -= contamination['penalty']
                # Only reject if severe contamination AND repair didn't help
                if contamination.get('reject') and not repaired:
                    logger.warning(f"[data_quality] Job rejected - field contamination: {contamination['issues'][0]}")
                    return {
                        "valid": False,
                        "score": 0,
                        "issues": contamination['issues'],
                        "warnings": warnings,
                        "rejected_reason": contamination['issues'][0],
                        "repaired": repaired,
                        "repair_log": repair_log,
                        "repaired_job": repaired_job if repaired else None
                    }
        
        # Ensure score is within bounds
        score = max(0, min(100, score))
        
        # Boost score slightly if repairs were made (reward for fixing issues)
        if repaired:
            score = min(100, score + 5)
        
        if score < 80:
            logger.info(f"[data_quality] Job quality score: {score}/100 (issues: {len(issues)}, warnings: {len(warnings)})")
        
        result = {
            "valid": True,
            "score": score,
            "issues": issues,
            "warnings": warnings,
            "rejected_reason": None,
            "repaired": repaired,
            "repair_log": repair_log
        }
        
        # Include repaired job in result if repairs were made
        if repaired:
            result['repaired_job'] = repaired_job
        
        return result
    
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
        """Validate location field - STRICT validation to catch contamination."""
        if not location:
            return {
                "issues": [],
                "warnings": ["Location is missing"],
                "penalty": 5,
                "reject": False
            }
        
        location = location.strip()
        location_lower = location.lower().strip()
        
        # Check for invalid patterns (labels)
        for pattern in self.invalid_location_regex:
            if pattern.match(location):
                return {
                    "issues": [f"Location appears to be a label: '{location}'"],
                    "penalty": 15,
                    "reject": False
                }
        
        issues = []
        warnings = []
        penalty = 0
        reject = False
        
        # STRICT: Check if location looks like a job title or department
        job_title_keywords = [
            'assistant', 'director', 'manager', 'officer', 'specialist',
            'internship', 'consultant', 'professional', 'grade', 'type of post',
            'deputy', 'senior', 'junior', 'statistical', 'communications',
            'public engagement', 'methodologies', 'education', 'project',
            'general', 'service', 'contract', 'national'
        ]
        
        # Check if location contains job keywords (more strict)
        has_job_keywords = any(kw in location_lower for kw in job_title_keywords)
        
        if has_job_keywords:
            # Only allow if it's clearly a valid location pattern (city, country)
            has_valid_location_pattern = (
                ',' in location or  # "City, Country" pattern
                any(city in location_lower for city in [
                    'paris', 'montreal', 'kabul', 'cairo', 'geneva', 'bangkok',
                    'dhaka', 'beijing', 'tashkent', 'apia', 'santiago', 'erbil',
                    'suva', 'almaty', 'perugia', 'moscow'
                ]) or
                any(country in location_lower for country in [
                    'france', 'canada', 'afghanistan', 'egypt', 'switzerland',
                    'thailand', 'bangladesh', 'china', 'uzbekistan', 'samoa',
                    'chile', 'iraq', 'fiji', 'kazakhstan', 'italy', 'russia'
                ])
            )
            
            if not has_valid_location_pattern:
                issues.append(f"Location looks like a job title/department: '{location}' (severe contamination)")
                penalty += 30
                reject = True  # Reject jobs with contaminated locations
        
        # STRICT: Check for date fragments in location (e.g., "Nov FR", "20 Nov")
        date_fragments = ['nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct']
        location_words = location_lower.split()
        has_date_fragments = any(frag in location_words for frag in date_fragments)
        
        if has_date_fragments:
            # If location has date fragments and doesn't look like a valid location, reject
            if not (',' in location or len(location_words) <= 3):
                issues.append(f"Location contains date fragments: '{location}' (likely extraction error)")
                penalty += 25
                reject = True
        
        # Check for suspicious patterns (warnings, not rejections)
        if len(location) < 3:
            warnings.append(f"Location is very short: '{location}'")
            penalty += 5
        
        if location.isupper() and len(location) > 10:
            warnings.append("Location is all uppercase (may be formatting issue)")
            penalty += 3
        
        return {
            "issues": issues,
            "warnings": warnings,
            "penalty": penalty,
            "reject": reject
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
        
        # Check if title is a month abbreviation (likely location contamination)
        month_abbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        if title in month_abbrevs:
            issues.append(f"Title is a month abbreviation: '{title}' (likely extraction error)")
            penalty += 20
            reject = True
        
        # Check if location is a month abbreviation (should be in location, not title)
        if location in month_abbrevs:
            issues.append(f"Location is a month abbreviation: '{location}' (likely extraction error)")
            penalty += 15
        
        # Check if title looks like a location (city, country pattern)
        # More comprehensive location detection
        location_indicators = [
            'montreal', 'canada', 'paris', 'france', 'geneva', 'switzerland',
            'kabul', 'afghanistan', 'cairo', 'egypt', 'bangkok', 'thailand',
            'dhaka', 'bangladesh', 'beijing', 'china', 'tashkent', 'uzbekistan',
            'apia', 'samoa', 'santiago', 'chile', 'erbil', 'iraq', 'suva', 'fiji',
            'almaty', 'kazakhstan', 'perugia', 'italy', 'moscow', 'russian'
        ]
        if ',' in title and any(kw in title for kw in location_indicators):
            issues.append(f"Title looks like a location: '{title}' (likely extraction error)")
            penalty += 25
            reject = True
        
        # Check if title is just a label (common in table headers)
        label_patterns = ['title', 'location', 'deadline', 'closing date', 'apply by', 'reference', 'ref', 'grade', 'level', 'type of post', 'project assistant', 'service contract', 'logistics officer', 'general services']
        if title in label_patterns:
            issues.append(f"Title is a label: '{title}' (likely extraction error)")
            penalty += 20
            reject = True
        
        # Check if location looks like a job title (contains job keywords)
        job_keywords = ['assistant', 'director', 'manager', 'officer', 'specialist', 'internship', 'intern']
        if location and any(kw in location for kw in job_keywords):
            issues.append(f"Location contains job title keywords: '{location}' (likely extraction error)")
            penalty += 20
        
        return {
            "issues": issues,
            "penalty": penalty,
            "reject": reject
        }


# Global validator instance
data_quality_validator = DataQualityValidator()

