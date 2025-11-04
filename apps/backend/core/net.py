"""
HTTP client with retries, backoff, ETag/If-Modified-Since support
"""
import os
import time
import logging
from typing import Optional, Dict, Tuple
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

DEFAULT_UA = "AidJobsBot/1.0 (+contact@aidjobs.app)"
DEFAULT_CONTACT = "contact@aidjobs.app"
DEFAULT_TIMEOUT = 30.0
MAX_RETRIES = 2


class HTTPClient:
    """HTTP client with politeness, retries, and caching support"""
    
    def __init__(self, user_agent: Optional[str] = None, contact_email: Optional[str] = None):
        self.user_agent = user_agent or os.getenv("AIDJOBS_CRAWLER_UA", DEFAULT_UA)
        self.contact_email = contact_email or os.getenv("AIDJOBS_CONTACT_EMAIL", DEFAULT_CONTACT)
        self.timeout = httpx.Timeout(DEFAULT_TIMEOUT)
    
    def _get_headers(self, etag: Optional[str] = None, last_modified: Optional[str] = None) -> Dict[str, str]:
        """Build request headers with UA, From, and conditional request headers"""
        headers = {
            "User-Agent": self.user_agent,
            "From": self.contact_email,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }
        
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified
        
        return headers
    
    @retry(
        stop=stop_after_attempt(MAX_RETRIES + 1),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
        reraise=True
    )
    async def fetch(
        self,
        url: str,
        etag: Optional[str] = None,
        last_modified: Optional[str] = None,
        max_size_kb: int = 1024
    ) -> Tuple[int, Dict[str, str], bytes, int]:
        """
        Fetch URL with retries and conditional requests.
        
        Returns:
            (status_code, headers, body, content_length_bytes)
        """
        headers = self._get_headers(etag=etag, last_modified=last_modified)
        
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            start_time = time.time()
            
            try:
                response = await client.get(url, headers=headers)
                elapsed_ms = int((time.time() - start_time) * 1000)
                
                # Check size limit
                content_length = len(response.content)
                if content_length > max_size_kb * 1024:
                    logger.warning(f"[net] Content too large: {content_length} bytes (limit: {max_size_kb}KB) - {url}")
                    # Truncate but still return what we got
                    body = response.content[:max_size_kb * 1024]
                else:
                    body = response.content
                
                logger.info(f"[net] {response.status_code} {url} ({content_length} bytes, {elapsed_ms}ms)")
                
                return (
                    response.status_code,
                    dict(response.headers),
                    body,
                    content_length
                )
            
            except httpx.TimeoutException as e:
                logger.error(f"[net] Timeout fetching {url}: {e}")
                raise
            except httpx.ConnectError as e:
                logger.error(f"[net] Connection error fetching {url}: {e}")
                raise
            except Exception as e:
                logger.error(f"[net] Unexpected error fetching {url}: {e}")
                raise
    
    async def head(self, url: str) -> Tuple[int, Dict[str, str]]:
        """Send HEAD request to check resource metadata"""
        headers = self._get_headers()
        
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            try:
                response = await client.head(url, headers=headers)
                logger.info(f"[net] HEAD {response.status_code} {url}")
                return (response.status_code, dict(response.headers))
            except Exception as e:
                logger.error(f"[net] HEAD request failed for {url}: {e}")
                raise
