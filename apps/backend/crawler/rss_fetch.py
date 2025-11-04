"""
RSS/Atom feed crawler
"""
import logging
import hashlib
from typing import List, Dict, Optional
from urllib.parse import urlparse
from datetime import datetime, timedelta
import feedparser
from dateutil import parser as date_parser

from core.net import HTTPClient

logger = logging.getLogger(__name__)


class RSSCrawler:
    """RSS/Atom feed crawler"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.http_client = HTTPClient()
    
    async def fetch_feed(self, url: str) -> List[Dict]:
        """
        Fetch and parse RSS/Atom feed.
        
        Returns:
            List of raw job dicts
        """
        try:
            status, headers, body, size = await self.http_client.fetch(url, max_size_kb=512)
            
            if status != 200:
                logger.warning(f"[rss_fetch] Non-200 status for {url}: {status}")
                return []
            
            # Parse feed
            feed_text = body.decode('utf-8', errors='ignore')
            feed = feedparser.parse(feed_text)
            
            if not feed.entries:
                logger.warning(f"[rss_fetch] No entries found in feed: {url}")
                return []
            
            jobs = []
            for entry in feed.entries:
                job = self._parse_entry(entry, url)
                if job:
                    jobs.append(job)
            
            logger.info(f"[rss_fetch] Parsed {len(jobs)} jobs from {url}")
            return jobs
        
        except Exception as e:
            logger.error(f"[rss_fetch] Error fetching feed {url}: {e}")
            return []
    
    def _parse_entry(self, entry, feed_url: str) -> Optional[Dict]:
        """Parse a single RSS entry to job dict"""
        job = {}
        
        # Title
        job['title'] = entry.get('title', '').strip()
        if not job['title']:
            return None
        
        # Apply URL
        job['apply_url'] = entry.get('link', feed_url)
        
        # Description
        if 'summary' in entry:
            job['description_snippet'] = entry.summary[:500]
        elif 'description' in entry:
            job['description_snippet'] = entry.description[:500]
        else:
            job['description_snippet'] = job['title']
        
        # Published date -> deadline (heuristic: +30 days)
        if 'published_parsed' in entry and entry.published_parsed:
            try:
                pub_date = datetime(*entry.published_parsed[:6])
                # Assume deadline is 30 days after publish
                job['deadline'] = (pub_date + timedelta(days=30)).date()
            except:
                pass
        
        # Try to extract location from title or description
        job['location_raw'] = None
        
        # Org name
        job['org_name'] = None
        if 'author' in entry:
            job['org_name'] = entry.author
        
        return job
