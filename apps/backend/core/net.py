"""
HTTP client with retries, backoff, ETag/If-Modified-Since support
Enhanced for API sources with POST, custom headers, authentication, and throttling
"""
import os
import time
import asyncio
import logging
import base64
from typing import Optional, Dict, Tuple, Any
from collections import defaultdict
from urllib.parse import urlparse
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

DEFAULT_UA = "AidJobsBot/1.0 (+contact@aidjobs.app)"
DEFAULT_CONTACT = "contact@aidjobs.app"
DEFAULT_TIMEOUT = 30.0
MAX_RETRIES = 2


class RateLimiter:
    """Simple token bucket rate limiter for throttling"""
    
    def __init__(self, requests_per_minute: int, burst: int = 5):
        """
        Initialize rate limiter.
        
        Args:
            requests_per_minute: Maximum requests per minute
            burst: Maximum burst capacity (number of requests that can be made immediately)
        """
        self.requests_per_minute = max(1, requests_per_minute)
        self.burst = max(1, burst)
        # Refill rate: tokens per second
        self.refill_rate = self.requests_per_minute / 60.0
        # Current tokens (starts at burst capacity)
        self.tokens = float(self.burst)
        # Last refill time
        self.last_refill = time.time()
        # Lock for thread safety
        self._lock = asyncio.Lock()
    
    async def wait_if_needed(self):
        """Wait if necessary to respect rate limit"""
        async with self._lock:
            now = time.time()
            # Refill tokens based on elapsed time
            elapsed = now - self.last_refill
            self.tokens = min(self.burst, self.tokens + elapsed * self.refill_rate)
            self.last_refill = now
            
            # If we have tokens, consume one and proceed
            if self.tokens >= 1.0:
                self.tokens -= 1.0
                return
            
            # Calculate wait time needed
            tokens_needed = 1.0 - self.tokens
            wait_time = tokens_needed / self.refill_rate
            
            # Wait and then consume the token
            if wait_time > 0:
                logger.debug(f"[rate_limiter] Waiting {wait_time:.2f}s for rate limit")
                await asyncio.sleep(wait_time)
                self.tokens = 0.0
            else:
                self.tokens -= 1.0


class HTTPClient:
    """HTTP client with politeness, retries, caching, and throttling support"""
    
    def __init__(self, user_agent: Optional[str] = None, contact_email: Optional[str] = None):
        self.user_agent = user_agent or os.getenv("AIDJOBS_CRAWLER_UA", DEFAULT_UA)
        self.contact_email = contact_email or os.getenv("AIDJOBS_CONTACT_EMAIL", DEFAULT_CONTACT)
        self.timeout = httpx.Timeout(DEFAULT_TIMEOUT)
        # OAuth2 token cache (token_url -> (token, expires_at))
        self._oauth2_tokens: Dict[str, Tuple[str, float]] = {}
        # Per-domain rate limiters (host -> RateLimiter)
        self._rate_limiters: Dict[str, RateLimiter] = {}
        # Rate limiter lock
        self._limiter_lock = asyncio.Lock()
    
    async def _get_rate_limiter(self, url: str, throttle_config: Optional[Dict[str, Any]] = None) -> Optional[RateLimiter]:
        """Get or create rate limiter for a URL's domain"""
        if not throttle_config or not throttle_config.get("enabled", False):
            return None
        
        parsed = urlparse(url)
        host = parsed.netloc or parsed.hostname or "default"
        
        requests_per_min = throttle_config.get("requests_per_minute", 30)
        burst = throttle_config.get("burst", 5)
        
        async with self._limiter_lock:
            if host not in self._rate_limiters:
                self._rate_limiters[host] = RateLimiter(requests_per_min, burst)
            
            return self._rate_limiters[host]
    
    async def _handle_retry_after(self, headers: Dict[str, str], url: str):
        """Handle Retry-After header if present"""
        retry_after = headers.get("Retry-After") or headers.get("retry-after")
        if retry_after:
            try:
                # Retry-After can be seconds (integer) or HTTP date
                wait_seconds = int(retry_after)
            except ValueError:
                # Try parsing as HTTP date (RFC 7231)
                try:
                    from email.utils import parsedate_to_datetime
                    retry_date = parsedate_to_datetime(retry_after)
                    wait_seconds = max(0, int((retry_date.timestamp() - time.time())))
                except Exception:
                    logger.warning(f"[net] Could not parse Retry-After header: {retry_after}")
                    return
            
            if wait_seconds > 0:
                logger.info(f"[net] Retry-After header: waiting {wait_seconds}s for {url}")
                await asyncio.sleep(wait_seconds)
    
    def _get_headers(
        self,
        etag: Optional[str] = None,
        last_modified: Optional[str] = None,
        custom_headers: Optional[Dict[str, str]] = None,
        auth_header: Optional[str] = None
    ) -> Dict[str, str]:
        """Build request headers with UA, From, and conditional request headers"""
        headers = {
            "User-Agent": self.user_agent,
            "From": self.contact_email,
            "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "DNT": "1",
            "Connection": "keep-alive",
        }
        
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified
        
        # Add custom headers (override defaults)
        if custom_headers:
            headers.update(custom_headers)
        
        # Add auth header (override if present)
        if auth_header:
            headers["Authorization"] = auth_header
        
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
        method: str = "GET",
        etag: Optional[str] = None,
        last_modified: Optional[str] = None,
        max_size_kb: int = 1024,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        auth_header: Optional[str] = None,
        throttle_config: Optional[Dict[str, Any]] = None
    ) -> Tuple[int, Dict[str, str], bytes, int]:
        """
        Fetch URL with retries, conditional requests, and throttling.
        
        Args:
            url: URL to fetch
            method: HTTP method (GET, POST, PUT)
            etag: ETag for conditional request
            last_modified: Last-Modified for conditional request
            max_size_kb: Maximum response size in KB
            headers: Custom headers to add
            params: Query parameters
            json_data: JSON body for POST/PUT
            auth_header: Authorization header value
            throttle_config: Throttling configuration dict with:
                - enabled: bool (default: False)
                - requests_per_minute: int (default: 30)
                - burst: int (default: 5)
        
        Returns:
            (status_code, headers, body, content_length_bytes)
        """
        # Apply rate limiting if configured
        rate_limiter = await self._get_rate_limiter(url, throttle_config)
        if rate_limiter:
            await rate_limiter.wait_if_needed()
        
        request_headers = self._get_headers(
            etag=etag,
            last_modified=last_modified,
            custom_headers=headers,
            auth_header=auth_header
        )
        
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            start_time = time.time()
            
            try:
                if method.upper() == "GET":
                    response = await client.get(url, headers=request_headers, params=params)
                elif method.upper() == "POST":
                    response = await client.post(url, headers=request_headers, params=params, json=json_data)
                elif method.upper() == "PUT":
                    response = await client.put(url, headers=request_headers, params=params, json=json_data)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")
                
                elapsed_ms = int((time.time() - start_time) * 1000)
                
                # Handle Retry-After header (429 Too Many Requests or 503 Service Unavailable)
                response_headers_dict = dict(response.headers)
                if response.status_code in [429, 503]:
                    await self._handle_retry_after(response_headers_dict, url)
                
                # Check size limit
                content_length = len(response.content)
                if content_length > max_size_kb * 1024:
                    logger.warning(f"[net] Content too large: {content_length} bytes (limit: {max_size_kb}KB) - {url}")
                    # Truncate but still return what we got
                    body = response.content[:max_size_kb * 1024]
                else:
                    body = response.content
                
                logger.info(f"[net] {method} {response.status_code} {url} ({content_length} bytes, {elapsed_ms}ms)")
                
                return (
                    response.status_code,
                    response_headers_dict,
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
    
    async def get_oauth2_token(
        self,
        token_url: str,
        client_id: str,
        client_secret: str,
        scope: Optional[str] = None
    ) -> str:
        """
        Get OAuth2 client credentials token with caching.
        
        Returns:
            Access token
        """
        # Check cache
        cache_key = f"{token_url}:{client_id}"
        if cache_key in self._oauth2_tokens:
            token, expires_at = self._oauth2_tokens[cache_key]
            if time.time() < expires_at - 60:  # Refresh 1 minute before expiry
                return token
        
        # Request new token
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                data = {
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                }
                if scope:
                    data["scope"] = scope
                
                response = await client.post(token_url, data=data)
                response.raise_for_status()
                token_data = response.json()
                
                access_token = token_data["access_token"]
                expires_in = token_data.get("expires_in", 3600)  # Default 1 hour
                expires_at = time.time() + expires_in
                
                # Cache token
                self._oauth2_tokens[cache_key] = (access_token, expires_at)
                
                logger.info(f"[net] OAuth2 token obtained for {token_url}")
                return access_token
        except Exception as e:
            logger.error(f"[net] Failed to get OAuth2 token from {token_url}: {e}")
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
