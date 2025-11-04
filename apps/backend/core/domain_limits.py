"""
Per-domain rate limiting using token bucket algorithm
"""
import time
import logging
import asyncio
from typing import Dict, Optional
from collections import defaultdict
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


class TokenBucket:
    """Simple token bucket for rate limiting"""
    
    def __init__(self, tokens: float, refill_rate: float):
        """
        Args:
            tokens: Initial tokens and max capacity
            refill_rate: Tokens added per second
        """
        self.capacity = tokens
        self.tokens = tokens
        self.refill_rate = refill_rate
        self.last_refill = time.time()
    
    def _refill(self):
        """Refill tokens based on time elapsed"""
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now
    
    def consume(self, tokens: float = 1.0) -> bool:
        """Try to consume tokens. Returns True if successful."""
        self._refill()
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False
    
    def wait_time(self, tokens: float = 1.0) -> float:
        """Calculate wait time needed to consume tokens"""
        self._refill()
        if self.tokens >= tokens:
            return 0.0
        needed = tokens - self.tokens
        return needed / self.refill_rate


class DomainLimiter:
    """Per-domain rate limiting with token buckets"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        # Host -> TokenBucket
        self.buckets: Dict[str, TokenBucket] = {}
        # Host -> last request time (for min interval enforcement)
        self.last_request: Dict[str, float] = defaultdict(float)
        self._lock = asyncio.Lock()
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    async def get_policy(self, host: str) -> Dict:
        """Get domain policy from database or use defaults"""
        conn = self._get_db_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT max_concurrency, min_request_interval_ms, max_pages, 
                           max_kb_per_page, allow_js
                    FROM domain_policies
                    WHERE host = %s
                """, (host,))
                
                policy = cur.fetchone()
                
                if policy:
                    return dict(policy)
                else:
                    # Return defaults
                    return {
                        'max_concurrency': 1,
                        'min_request_interval_ms': 3000,
                        'max_pages': 10,
                        'max_kb_per_page': 1024,
                        'allow_js': False
                    }
        finally:
            conn.close()
    
    async def ensure_bucket(self, host: str, crawl_delay_ms: Optional[int] = None):
        """Ensure token bucket exists for host"""
        if host not in self.buckets:
            policy = await self.get_policy(host)
            
            # Use the larger of policy min_interval or robots crawl_delay
            min_interval_ms = policy['min_request_interval_ms']
            if crawl_delay_ms:
                min_interval_ms = max(min_interval_ms, crawl_delay_ms)
            
            # Convert to refill rate (tokens per second)
            # If min interval is 3000ms, then rate = 1000/3000 = 0.333 tokens/sec
            refill_rate = 1000.0 / min_interval_ms if min_interval_ms > 0 else 1.0
            
            # Allow burst of max_concurrency requests
            capacity = float(policy['max_concurrency'])
            
            self.buckets[host] = TokenBucket(capacity, refill_rate)
            logger.debug(f"[domain_limits] Created bucket for {host}: capacity={capacity}, rate={refill_rate}/s")
    
    async def wait_for_slot(self, host: str, crawl_delay_ms: Optional[int] = None):
        """Wait until we can make a request to this host"""
        async with self._lock:
            await self.ensure_bucket(host, crawl_delay_ms)
            
            bucket = self.buckets[host]
            policy = await self.get_policy(host)
            min_interval_ms = policy['min_request_interval_ms']
            
            if crawl_delay_ms:
                min_interval_ms = max(min_interval_ms, crawl_delay_ms)
            
            # Check token bucket
            wait_time = bucket.wait_time(1.0)
            if wait_time > 0:
                logger.debug(f"[domain_limits] Waiting {wait_time:.2f}s for token bucket - {host}")
                await asyncio.sleep(wait_time)
                bucket.consume(1.0)
            else:
                bucket.consume(1.0)
            
            # Also enforce minimum interval since last request
            last_req = self.last_request[host]
            if last_req > 0:
                elapsed_ms = (time.time() - last_req) * 1000
                if elapsed_ms < min_interval_ms:
                    wait_ms = min_interval_ms - elapsed_ms
                    logger.debug(f"[domain_limits] Waiting {wait_ms:.0f}ms for min interval - {host}")
                    await asyncio.sleep(wait_ms / 1000.0)
            
            self.last_request[host] = time.time()
