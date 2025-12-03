"""
Link validation service for verifying apply URLs.

Validates that job apply URLs are accessible and working.
Uses HTTP HEAD requests to minimize bandwidth, follows redirects,
and caches results in database for 24 hours.
"""

import logging
import asyncio
from typing import Dict, Optional, Tuple, Any, List
from datetime import datetime, timedelta
from urllib.parse import urlparse
import psycopg2
from psycopg2.extras import RealDictCursor
from core.net import HTTPClient

logger = logging.getLogger(__name__)

# Cache TTL: 24 hours
VALIDATION_CACHE_TTL_HOURS = 24

# Valid status codes
VALID_STATUS_CODES = {200, 201, 202, 301, 302, 303, 307, 308}

# Maximum redirect hops to follow
MAX_REDIRECT_HOPS = 3


class LinkValidator:
    """
    Service for validating job apply URLs.
    
    Features:
    - HTTP HEAD requests (lightweight)
    - Redirect following (up to 3 hops)
    - Status code validation
    - Database caching (24h TTL)
    - Batch validation support
    """
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.http_client = HTTPClient()
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    async def validate_url(
        self,
        url: str,
        use_cache: bool = True,
        follow_redirects: bool = True
    ) -> Dict[str, Any]:
        """
        Validate a single URL.
        
        Args:
            url: URL to validate
            use_cache: Whether to use cached results (default: True)
            follow_redirects: Whether to follow redirects (default: True)
        
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
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
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
        except Exception as e:
            result = {
                'valid': False,
                'status_code': None,
                'final_url': url,
                'redirect_count': 0,
                'error': f'URL parsing error: {str(e)}',
                'cached': False,
                'validated_at': datetime.utcnow()
            }
            self._cache_validation(url, result)
            return result
        
        # Perform HTTP HEAD request
        try:
            status_code, final_url, redirect_count = await self._check_url(
                url,
                follow_redirects=follow_redirects
            )
            
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
            error_msg = str(e)
            result = {
                'valid': False,
                'status_code': None,
                'final_url': url,
                'redirect_count': 0,
                'error': f'Validation error: {error_msg}',
                'cached': False,
                'validated_at': datetime.utcnow()
            }
            
            # Cache error result (shorter TTL for errors)
            self._cache_validation(url, result, ttl_hours=1)
            
            logger.error(f"[link_validator] Error validating {url}: {error_msg}")
            return result
    
    async def _check_url(
        self,
        url: str,
        follow_redirects: bool = True
    ) -> Tuple[int, Optional[str], int]:
        """
        Check URL using HTTP HEAD request.
        
        Returns:
            (status_code, final_url_after_redirects, redirect_count)
        """
        redirect_count = 0
        current_url = url
        max_hops = MAX_REDIRECT_HOPS if follow_redirects else 0
        
        # Use httpx directly for more control over redirects
        import httpx
        
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0),  # 10 second timeout for validation
            follow_redirects=False  # Manual redirect handling for counting
        ) as client:
            for hop in range(max_hops + 1):
                try:
                    # Try HEAD first (lightweight)
                    response = await client.head(
                        current_url,
                        headers={
                            'User-Agent': self.http_client.user_agent,
                            'Accept': '*/*'
                        }
                    )
                    
                    status_code = response.status_code
                    
                    # Check if redirect
                    if status_code in {301, 302, 303, 307, 308} and follow_redirects:
                        location = response.headers.get('Location') or response.headers.get('location')
                        if location and hop < max_hops:
                            # Resolve relative URLs
                            if location.startswith('/'):
                                from urllib.parse import urljoin
                                location = urljoin(current_url, location)
                            elif not location.startswith('http'):
                                from urllib.parse import urljoin
                                location = urljoin(current_url, location)
                            
                            redirect_count += 1
                            current_url = location
                            logger.debug(f"[link_validator] Redirect {redirect_count}: {current_url}")
                            continue
                    
                    # Final status (or non-redirect status)
                    return status_code, current_url, redirect_count
                    
                except httpx.HTTPStatusError as e:
                    # Some servers return errors for HEAD, try GET
                    if hop == 0:
                        try:
                            # Try GET with minimal data (just headers)
                            response = await client.get(
                                current_url,
                                headers={
                                    'User-Agent': self.http_client.user_agent,
                                    'Accept': '*/*'
                                },
                                follow_redirects=follow_redirects
                            )
                            return response.status_code, str(response.url), redirect_count
                        except Exception as get_error:
                            # Both HEAD and GET failed
                            raise e
                    else:
                        raise e
                except httpx.RequestError as e:
                    # Network error, connection error, etc.
                    raise Exception(f"Request failed: {str(e)}")
                except Exception as e:
                    raise Exception(f"Unexpected error: {str(e)}")
            
            # If we get here, we hit max redirects
            raise Exception(f"Too many redirects (>{max_hops})")
    
    def _get_cached_validation(self, url: str) -> Optional[Dict]:
        """Get cached validation result if still valid"""
        conn = self._get_db_conn()
        try:
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
            logger.warning(f"[link_validator] Error reading cache: {e}")
        finally:
            conn.close()
        
        return None
    
    def _cache_validation(self, url: str, result: Dict, ttl_hours: int = VALIDATION_CACHE_TTL_HOURS):
        """Cache validation result in database"""
        conn = self._get_db_conn()
        try:
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
            logger.warning(f"[link_validator] Error caching validation: {e}")
            conn.rollback()
        finally:
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

