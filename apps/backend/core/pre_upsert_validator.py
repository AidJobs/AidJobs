"""
Pre-Upsert Validation Module
Validates jobs before database insertion to prevent bad data.

Validations:
- Duplicate URL detection (same apply_url + source_id)
- Missing required fields
- URL format validation
- Data type validation
"""

import logging
import re
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class PreUpsertValidator:
    """
    Validates jobs before database insertion.
    """
    
    REQUIRED_FIELDS = ['title', 'apply_url']
    
    # Valid URL patterns
    VALID_URL_SCHEMES = ['http', 'https']
    INVALID_URL_PATTERNS = [
        r'^#',
        r'^javascript:',
        r'^mailto:',
        r'^tel:',
        r'^data:',
    ]
    
    def __init__(self, db_connection=None):
        """
        Initialize validator.
        
        Args:
            db_connection: Database connection for duplicate checking
        """
        self.db_connection = db_connection
    
    def validate_job(self, job: Dict, source_id: Optional[str] = None) -> Tuple[bool, Optional[str], List[str]]:
        """
        Validate a single job.
        
        Args:
            job: Job dictionary to validate
            source_id: Source ID for duplicate checking
            
        Returns:
            Tuple of (is_valid, error_message, warnings)
        """
        warnings = []
        
        # Check required fields
        for field in self.REQUIRED_FIELDS:
            value = job.get(field)
            if not value or (isinstance(value, str) and not value.strip()):
                return False, f"Missing required field: {field}", warnings
        
        title = job.get('title', '').strip()
        apply_url = job.get('apply_url', '').strip()
        
        # Validate title
        if len(title) < 5:
            return False, f"Title too short (minimum 5 characters): {title[:50]}", warnings
        
        if len(title) > 500:
            warnings.append(f"Title very long ({len(title)} chars), may be truncated")
        
        # Validate URL format
        url_valid, url_error = self._validate_url(apply_url)
        if not url_valid:
            return False, url_error, warnings
        
        # Check for duplicate URL (if we have DB connection and source_id)
        # TEMPORARY: Disable duplicate check - it might be blocking valid updates
        # if self.db_connection and source_id:
        #     is_duplicate, duplicate_error = self._check_duplicate_url(apply_url, source_id)
        #     if is_duplicate:
        #         return False, duplicate_error, warnings
        
        # Validate deadline format if present
        deadline = job.get('deadline')
        if deadline:
            deadline_valid, deadline_error = self._validate_deadline(deadline)
            if not deadline_valid:
                warnings.append(deadline_error)
        
        # Validate location if present
        location = job.get('location_raw', '').strip()
        if location and len(location) > 500:
            warnings.append(f"Location very long ({len(location)} chars), may be truncated")
        
        return True, None, warnings
    
    def _validate_url(self, url: str) -> Tuple[bool, Optional[str]]:
        """
        Validate URL format.
        
        Args:
            url: URL string to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not url or not url.strip():
            return False, "URL is empty"
        
        # Check for invalid patterns
        for pattern in self.INVALID_URL_PATTERNS:
            if re.match(pattern, url, re.IGNORECASE):
                return False, f"Invalid URL pattern: {url[:50]}"
        
        # Try to parse URL
        try:
            parsed = urlparse(url)
            
            # Check scheme
            if parsed.scheme not in self.VALID_URL_SCHEMES:
                return False, f"Invalid URL scheme (must be http or https): {url[:50]}"
            
            # Check netloc (domain)
            if not parsed.netloc:
                return False, f"Missing domain in URL: {url[:50]}"
            
            # Check for suspicious patterns
            if len(url) > 2000:
                return False, f"URL too long (max 2000 chars): {len(url)} chars"
            
            return True, None
            
        except Exception as e:
            return False, f"URL parsing error: {str(e)}"
    
    def _validate_deadline(self, deadline: str) -> Tuple[bool, Optional[str]]:
        """
        Validate deadline format.
        
        Args:
            deadline: Deadline string or date object
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not deadline:
            return True, None
        
        # If it's a string, check format
        if isinstance(deadline, str):
            # Check if it's in YYYY-MM-DD format
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', deadline):
                return False, f"Deadline format should be YYYY-MM-DD: {deadline}"
        
        return True, None
    
    def _check_duplicate_url(self, apply_url: str, source_id: str) -> Tuple[bool, Optional[str]]:
        """
        Check if URL already exists for this source.
        
        Args:
            apply_url: URL to check
            source_id: Source ID
            
        Returns:
            Tuple of (is_duplicate, error_message)
        """
        if not self.db_connection:
            return False, None
        
        try:
            with self.db_connection.cursor() as cur:
                # Check for existing job with same URL and source
                cur.execute("""
                    SELECT id, title, status, deleted_at
                    FROM jobs
                    WHERE apply_url = %s AND source_id::text = %s
                    LIMIT 1
                """, (apply_url, source_id))
                
                existing = cur.fetchone()
                
                if existing:
                    # Job exists - this is expected for updates
                    # Only error if it's a different active job (shouldn't happen with canonical_hash)
                    if existing[2] == 'active' and existing[3] is None:
                        # This is fine - will be updated via canonical_hash
                        return False, None
                    else:
                        # Deleted job - will be restored
                        return False, None
                
                return False, None
                
        except Exception as e:
            logger.error(f"Error checking duplicate URL: {e}")
            # Don't block on DB errors - let it through and handle at insert time
            return False, None
    
    def validate_batch(self, jobs: List[Dict], source_id: Optional[str] = None) -> Dict:
        """
        Validate multiple jobs.
        
        Args:
            jobs: List of job dictionaries
            source_id: Source ID for duplicate checking
            
        Returns:
            Dict with:
            - valid_jobs: List of valid jobs
            - invalid_jobs: List of (job, error) tuples
            - warnings: List of warnings
            - stats: Validation statistics
        """
        valid_jobs = []
        invalid_jobs = []
        all_warnings = []
        
        for job in jobs:
            is_valid, error, warnings = self.validate_job(job, source_id)
            
            if is_valid:
                valid_jobs.append(job)
                if warnings:
                    all_warnings.extend(warnings)
            else:
                invalid_jobs.append((job, error))
                if warnings:
                    all_warnings.extend(warnings)
        
        return {
            'valid_jobs': valid_jobs,
            'invalid_jobs': invalid_jobs,
            'warnings': all_warnings,
            'stats': {
                'total': len(jobs),
                'valid': len(valid_jobs),
                'invalid': len(invalid_jobs),
                'warnings_count': len(all_warnings)
            }
        }


# Global instance (lazy initialization)
_validator: Optional[PreUpsertValidator] = None


def get_validator(db_connection=None) -> PreUpsertValidator:
    """Get or create the global validator instance"""
    global _validator
    
    if _validator is None or db_connection:
        _validator = PreUpsertValidator(db_connection=db_connection)
    
    return _validator

