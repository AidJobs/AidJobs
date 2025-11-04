"""
Robots.txt fetching, caching, and parsing
"""
import os
import logging
import json
from typing import Optional, Dict, List, Tuple
from urllib.parse import urlparse, urljoin
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
from core.net import HTTPClient

logger = logging.getLogger(__name__)

ROBOTS_CACHE_HOURS = 12


class RobotsChecker:
    """Handles robots.txt fetching, caching, and checking"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.http_client = HTTPClient()
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    def _parse_robots_txt(self, robots_txt: str, user_agent: str = "*") -> Tuple[List[str], Optional[int]]:
        """
        Parse robots.txt content.
        
        Returns:
            (disallow_paths, crawl_delay_ms)
        """
        disallow_paths = []
        crawl_delay = None
        current_ua = None
        in_relevant_section = False
        
        for line in robots_txt.split('\n'):
            line = line.strip()
            
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                continue
            
            if ':' not in line:
                continue
            
            key, value = line.split(':', 1)
            key = key.strip().lower()
            value = value.strip()
            
            # Check User-agent
            if key == 'user-agent':
                # Match our bot or wildcard
                if value.lower() in ['*', 'aidjobsbot', user_agent.lower()]:
                    in_relevant_section = True
                    current_ua = value
                else:
                    in_relevant_section = False
            
            elif in_relevant_section:
                if key == 'disallow':
                    if value:  # Empty disallow means allow all
                        disallow_paths.append(value)
                
                elif key == 'crawl-delay':
                    try:
                        # Convert to milliseconds
                        crawl_delay = int(float(value) * 1000)
                    except ValueError:
                        logger.warning(f"[robots] Invalid crawl-delay: {value}")
        
        return disallow_paths, crawl_delay
    
    async def get_robots_info(self, url: str) -> Dict:
        """
        Get robots.txt info for a URL (cached or fresh).
        
        Returns:
            {
                'allowed': bool,
                'crawl_delay_ms': int or None,
                'cached': bool,
                'disallow_paths': list
            }
        """
        parsed = urlparse(url)
        host = parsed.netloc
        robots_url = f"{parsed.scheme}://{host}/robots.txt"
        path = parsed.path or '/'
        
        # Check cache first
        conn = self._get_db_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT robots_txt, crawl_delay_ms, disallow, fetched_at
                    FROM robots_cache
                    WHERE host = %s
                    AND fetched_at > %s
                """, (host, datetime.utcnow() - timedelta(hours=ROBOTS_CACHE_HOURS)))
                
                cached = cur.fetchone()
                
                if cached:
                    # Use cached data
                    disallow_paths = cached['disallow'] if cached['disallow'] else []
                    allowed = not any(path.startswith(p) for p in disallow_paths)
                    
                    logger.debug(f"[robots] Using cached robots.txt for {host}")
                    return {
                        'allowed': allowed,
                        'crawl_delay_ms': cached['crawl_delay_ms'],
                        'cached': True,
                        'disallow_paths': disallow_paths
                    }
        finally:
            conn.close()
        
        # Fetch fresh robots.txt
        logger.info(f"[robots] Fetching {robots_url}")
        
        try:
            status, headers, body, size = await self.http_client.fetch(robots_url, max_size_kb=100)
            
            if status == 200:
                robots_txt = body.decode('utf-8', errors='ignore')
                disallow_paths, crawl_delay_ms = self._parse_robots_txt(robots_txt)
            elif status == 404:
                # No robots.txt means everything is allowed
                robots_txt = ""
                disallow_paths = []
                crawl_delay_ms = None
            else:
                # Treat errors conservatively (assume allowed but with delay)
                logger.warning(f"[robots] Unexpected status {status} for {robots_url}")
                robots_txt = ""
                disallow_paths = []
                crawl_delay_ms = 1000  # Conservative 1s delay
            
            # Cache the result
            conn = self._get_db_conn()
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO robots_cache (host, robots_txt, crawl_delay_ms, disallow, fetched_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (host) DO UPDATE SET
                            robots_txt = EXCLUDED.robots_txt,
                            crawl_delay_ms = EXCLUDED.crawl_delay_ms,
                            disallow = EXCLUDED.disallow,
                            fetched_at = EXCLUDED.fetched_at
                    """, (host, robots_txt, crawl_delay_ms, json.dumps(disallow_paths), datetime.utcnow()))
                    conn.commit()
            finally:
                conn.close()
            
            allowed = not any(path.startswith(p) for p in disallow_paths)
            
            return {
                'allowed': allowed,
                'crawl_delay_ms': crawl_delay_ms,
                'cached': False,
                'disallow_paths': disallow_paths
            }
        
        except Exception as e:
            logger.error(f"[robots] Error fetching robots.txt for {host}: {e}")
            # On error, assume allowed but be cautious
            return {
                'allowed': True,
                'crawl_delay_ms': 2000,  # Conservative 2s delay on errors
                'cached': False,
                'disallow_paths': []
            }
