"""
Link validation service for verifying apply URLs.

Validates that job apply URLs are accessible and working.
Uses HTTP HEAD requests through the shared outbound policy (contracts.outbound),
follows redirects, and caches results in database for 24 hours.
"""

import logging
import asyncio
import contextlib
import ssl
from typing import Dict, Optional, Tuple, Any, List
from datetime import datetime
from urllib.parse import urlsplit
import httpcore
import psycopg2
from psycopg2.extras import RealDictCursor
from app.errors import log_failure
from app.log_safety import current_request_id, redact_exception
from contracts.outbound import FetchError, fetch_message, fetch_url

logger = logging.getLogger(__name__)

# Cache TTL: 24 hours
VALIDATION_CACHE_TTL_HOURS = 24

# Valid status codes
VALID_STATUS_CODES = {200, 201, 202, 301, 302, 303, 307, 308}

# Maximum redirect hops to follow; one more is reported as "redirect limit"
MAX_REDIRECT_HOPS = 10

CHECK_TIMEOUT_SECONDS = 10.0
# The whole check of one link, every hop included
CHECK_TOTAL_SECONDS = 20.0

# Failures with a category of their own; anything else is unexpected and logged with its cause
_EXPECTED_FAILURES = (FetchError, httpcore.TimeoutException, httpcore.NetworkError,
                      httpcore.ProtocolError, OSError, ValueError)


def _caused_by_tls(error: BaseException) -> bool:
    seen = 0
    current: Optional[BaseException] = error
    while current is not None and seen < 5:
        if isinstance(current, ssl.SSLError):
            return True
        current = current.__cause__ or current.__context__
        seen += 1
    return False


def describe_link_failure(error: BaseException) -> str:
    """Why a link check failed, in our own words, chosen by the exception's type.

    Never the exception's text: it can quote the URL, its query string or the server's reply.
    """
    if isinstance(error, FetchError):
        return f"Validation error: {fetch_message(error) or 'fetch failed'}"
    if isinstance(error, (httpcore.TimeoutException, TimeoutError)):
        return "Validation error: timeout"
    if isinstance(error, (httpcore.NetworkError, OSError)):
        if _caused_by_tls(error):
            return "Validation error: TLS error"
        return "Validation error: connection failed"
    if isinstance(error, (httpcore.LocalProtocolError, ValueError)):
        return "Validation error: invalid URL"
    if isinstance(error, httpcore.ProtocolError):
        return "Validation error: invalid response"
    return f"Validation error: unexpected error (ref {current_request_id()[:8] or 'unavailable'})"


def _well_formed(url: str) -> bool:
    """A scheme, a host that encodes, and a readable port."""
    try:
        parts = urlsplit(url)
        if not parts.scheme or not parts.hostname:
            return False
        parts.hostname.encode("idna")
        return parts.port is None or parts.port >= 0
    except ValueError:
        return False


class LinkValidator:
    """
    Service for validating job apply URLs.
    
    Features:
    - HTTP HEAD requests (lightweight), through the shared outbound policy
    - Redirect following (up to 10 hops), each destination checked
    - Status code validation
    - Database caching (24h TTL)
    - Batch validation support
    """
    
    def __init__(self, db_url: str):
        self.db_url = db_url
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    async def validate_url(
        self,
        url: str,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Validate a single URL.
        
        Args:
            url: URL to validate
            use_cache: Whether to use cached results (default: True)
        
        Returns:
            Dictionary with:
            {
                'valid': bool,
                'status_code': int,
                'final_url': str (after redirects),
                'redirect_count': int,
                'error': Optional[str],
                'cached': bool,
                'validated_at': datetime
            }
        """
        if not url or not url.strip():
            return {
                'valid': False,
                'status_code': None,
                'final_url': None,
                'redirect_count': 0,
                'error': 'URL is empty',
                'cached': False,
                'validated_at': datetime.utcnow()
            }
        
        url = url.strip()
        
        # Check cache first
        if use_cache:
            cached_result = self._get_cached_validation(url)
            if cached_result:
                logger.debug(f"[link_validator] Using cached validation for {url}")
                return cached_result
        
        # Validate URL format
        if not _well_formed(url):
            result = {
                'valid': False,
                'status_code': None,
                'final_url': url,
                'redirect_count': 0,
                'error': 'Invalid URL format',
                'cached': False,
                'validated_at': datetime.utcnow()
            }
            self._cache_validation(url, result)
            return result
        
        # Perform HTTP HEAD request
        try:
            status_code, final_url, redirect_count = await self._check_url(url)
            
            is_valid = status_code in VALID_STATUS_CODES
            
            result = {
                'valid': is_valid,
                'status_code': status_code,
                'final_url': final_url or url,
                'redirect_count': redirect_count,
                'error': None if is_valid else f'Invalid status code: {status_code}',
                'cached': False,
                'validated_at': datetime.utcnow()
            }
            
            # Cache result
            self._cache_validation(url, result)
            
            if is_valid:
                logger.debug(f"[link_validator] ✓ Valid: {url} -> {final_url} ({status_code})")
            else:
                logger.warning(f"[link_validator] ✗ Invalid: {url} ({status_code})")
            
            return result
            
        except Exception as e:
            if not isinstance(e, _EXPECTED_FAILURES):
                log_failure(logger, f"[link_validator] Unexpected failure checking {url!r}", e)
            result = {
                'valid': False,
                'status_code': None,
                'final_url': url,
                'redirect_count': 0,
                'error': describe_link_failure(e),
                'cached': False,
                'validated_at': datetime.utcnow()
            }
            
            # Cache error result (shorter TTL for errors)
            self._cache_validation(url, result, ttl_hours=1)
            
            logger.warning("[link_validator] Error validating %r: %s", url, result['error'])
            return result
    
    async def _check_url(self, url: str) -> Tuple[int, str, int]:
        """
        HEAD the URL through the shared outbound policy (contract section 9): every hop's
        destination is resolved, checked and pinned before it is connected to.
        
        Returns:
            (status_code, final_url_after_redirects, redirect_count)
        """
        result = await fetch_url(
            url,
            method="HEAD",
            headers={'Accept': '*/*'},
            timeout=CHECK_TIMEOUT_SECONDS,
            total_timeout=CHECK_TOTAL_SECONDS,
            max_redirects=MAX_REDIRECT_HOPS,
        )
        return result.status_code, result.url, result.redirects
    
    def _get_cached_validation(self, url: str) -> Optional[Dict]:
        """Get cached validation result if still valid. An unreachable cache is a miss."""
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT 
                        is_valid,
                        status_code,
                        final_url,
                        redirect_count,
                        error_message,
                        validated_at
                    FROM link_validations
                    WHERE url = %s
                    AND validated_at > NOW() - INTERVAL '%s hours'
                    ORDER BY validated_at DESC
                    LIMIT 1
                """, (url, VALIDATION_CACHE_TTL_HOURS))
                
                row = cur.fetchone()
                if row:
                    return {
                        'valid': row['is_valid'],
                        'status_code': row['status_code'],
                        'final_url': row['final_url'],
                        'redirect_count': row['redirect_count'],
                        'error': row['error_message'],
                        'cached': True,
                        'validated_at': row['validated_at']
                    }
        except Exception as e:
            logger.warning("[link_validator] Error reading cache: %s", redact_exception(e))
        finally:
            if conn is not None:
                conn.close()
        
        return None
    
    def _cache_validation(self, url: str, result: Dict, ttl_hours: int = VALIDATION_CACHE_TTL_HOURS):
        """Cache validation result in database. An unreachable cache skips the write."""
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                # Upsert validation result
                cur.execute("""
                    INSERT INTO link_validations (
                        url, is_valid, status_code, final_url,
                        redirect_count, error_message, validated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s
                    )
                    ON CONFLICT (url) DO UPDATE SET
                        is_valid = EXCLUDED.is_valid,
                        status_code = EXCLUDED.status_code,
                        final_url = EXCLUDED.final_url,
                        redirect_count = EXCLUDED.redirect_count,
                        error_message = EXCLUDED.error_message,
                        validated_at = EXCLUDED.validated_at
                """, (
                    url,
                    result['valid'],
                    result['status_code'],
                    result['final_url'],
                    result['redirect_count'],
                    result.get('error'),
                    result['validated_at']
                ))
                conn.commit()
        except Exception as e:
            logger.warning("[link_validator] Error caching validation: %s", redact_exception(e))
            if conn is not None:
                with contextlib.suppress(psycopg2.Error):
                    conn.rollback()
        finally:
            if conn is not None:
                conn.close()
    
    async def validate_batch(
        self,
        urls: List[str],
        use_cache: bool = True,
        max_concurrent: int = 10
    ) -> Dict[str, Dict]:
        """
        Validate multiple URLs concurrently.
        
        Args:
            urls: List of URLs to validate
            use_cache: Whether to use cached results
            max_concurrent: Maximum concurrent validations
        
        Returns:
            Dictionary mapping URL -> validation result
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        results = {}
        
        async def validate_with_semaphore(url: str):
            async with semaphore:
                return url, await self.validate_url(url, use_cache=use_cache)
        
        tasks = [validate_with_semaphore(url) for url in urls]
        completed = await asyncio.gather(*tasks, return_exceptions=True)
        
        for item in completed:
            if isinstance(item, Exception):
                logger.error(f"[link_validator] Batch validation error: {item}")
                continue
            
            url, result = item
            results[url] = result
        
        return results
    
    def get_validation_stats(self, job_ids: Optional[List[str]] = None) -> Dict:
        """
        Get validation statistics for jobs.
        
        Args:
            job_ids: Optional list of job IDs to filter by
        
        Returns:
            Dictionary with validation statistics
        """
        conn = self._get_db_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if job_ids:
                    placeholders = ','.join(['%s'] * len(job_ids))
                    cur.execute(f"""
                        SELECT 
                            COUNT(*) as total,
                            SUM(CASE WHEN lv.is_valid THEN 1 ELSE 0 END) as valid_count,
                            SUM(CASE WHEN NOT lv.is_valid THEN 1 ELSE 0 END) as invalid_count,
                            SUM(CASE WHEN lv.validated_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as recent_count
                        FROM jobs j
                        LEFT JOIN link_validations lv ON j.apply_url = lv.url
                        WHERE j.id::text = ANY(ARRAY[{placeholders}]::text[])
                        AND j.deleted_at IS NULL
                    """, job_ids)
                else:
                    cur.execute("""
                        SELECT 
                            COUNT(*) as total,
                            SUM(CASE WHEN lv.is_valid THEN 1 ELSE 0 END) as valid_count,
                            SUM(CASE WHEN NOT lv.is_valid THEN 1 ELSE 0 END) as invalid_count,
                            SUM(CASE WHEN lv.validated_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as recent_count
                        FROM jobs j
                        LEFT JOIN link_validations lv ON j.apply_url = lv.url
                        WHERE j.deleted_at IS NULL
                    """)
                
                row = cur.fetchone()
                if row:
                    total = row['total'] or 0
                    valid_count = row['valid_count'] or 0
                    invalid_count = row['invalid_count'] or 0
                    recent_count = row['recent_count'] or 0
                    
                    return {
                        'total': total,
                        'valid': valid_count,
                        'invalid': invalid_count,
                        'not_validated': total - (valid_count + invalid_count),
                        'recently_validated': recent_count,
                        'valid_percentage': (valid_count / total * 100) if total > 0 else 0
                    }
        except Exception as e:
            logger.error(f"[link_validator] Error getting stats: {e}")
            return {
                'total': 0,
                'valid': 0,
                'invalid': 0,
                'not_validated': 0,
                'recently_validated': 0,
                'valid_percentage': 0
            }
        finally:
            conn.close()
        
        return {
            'total': 0,
            'valid': 0,
            'invalid': 0,
            'not_validated': 0,
            'recently_validated': 0,
            'valid_percentage': 0
        }


# Global validator instance (lazy initialization)
_link_validator_instance: Optional[LinkValidator] = None


def get_link_validator(db_url: str) -> LinkValidator:
    """Get or create global link validator instance"""
    global _link_validator_instance
    if _link_validator_instance is None:
        _link_validator_instance = LinkValidator(db_url)
    return _link_validator_instance

