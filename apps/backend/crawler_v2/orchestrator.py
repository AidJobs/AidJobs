"""
Simple orchestrator - coordinates crawling of multiple sources.
"""

import logging
import asyncio
from typing import Dict, List, Optional
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

from .simple_crawler import SimpleCrawler
from .rss_crawler import SimpleRSSCrawler
from .api_crawler import SimpleAPICrawler

logger = logging.getLogger(__name__)


class SimpleOrchestrator:
    """
    Simple orchestrator that:
    1. Gets sources from database
    2. Crawls each source
    3. Updates source status and logs
    """
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.html_crawler = SimpleCrawler(db_url)
        self.rss_crawler = SimpleRSSCrawler(db_url)
        self.api_crawler = SimpleAPICrawler(db_url)
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    def get_active_sources(self, limit: Optional[int] = None) -> List[Dict]:
        """Get active sources from database"""
        conn = self._get_db_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                query = """
                    SELECT id, org_name, careers_url, source_type, status
                    FROM sources
                    WHERE status = 'active'
                    ORDER BY created_at DESC
                """
                if limit:
                    query += f" LIMIT {limit}"
                
                cur.execute(query)
                return [dict(row) for row in cur.fetchall()]
        finally:
            conn.close()
    
    def update_source_status(self, source_id: str, status: str, message: str, counts: Dict):
        """Update source status after crawl"""
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE sources
                    SET last_crawled_at = NOW(),
                        last_crawl_status = %s,
                        last_crawl_message = %s,
                        updated_at = NOW()
                    WHERE id::text = %s
                """, (status, message, source_id))
                conn.commit()
        except Exception as e:
            logger.error(f"Error updating source status: {e}")
            conn.rollback()
        finally:
            conn.close()
    
    def log_crawl(self, source_id: str, status: str, message: str, counts: Dict, duration_ms: int):
        """Log crawl result"""
        conn = self._get_db_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO crawl_logs (
                        source_id, status, message, duration_ms,
                        found, inserted, updated, skipped, ran_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, (
                    source_id,
                    status,
                    message,
                    duration_ms,
                    counts.get('found', 0),
                    counts.get('inserted', 0),
                    counts.get('updated', 0),
                    counts.get('skipped', 0)
                ))
                conn.commit()
        except Exception as e:
            logger.error(f"Error logging crawl: {e}")
            conn.rollback()
        finally:
            conn.close()
    
    async def crawl_source(self, source: Dict) -> Dict:
        """Crawl a single source"""
        source_id = str(source['id'])
        source_type = source.get('source_type', 'html')
        
        import time
        start_time = time.time()
        
        try:
            # Choose crawler based on type
            if source_type == 'html':
                result = await self.html_crawler.crawl_source(source)
            elif source_type == 'rss':
                result = await self.rss_crawler.crawl_source(source)
            elif source_type in ['api', 'json']:
                result = await self.api_crawler.crawl_source(source)
            else:
                result = {
                    'status': 'failed',
                    'message': f'Unknown source type: {source_type}',
                    'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                }
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Update source status
            self.update_source_status(
                source_id,
                result['status'],
                result['message'],
                result['counts']
            )
            
            # Log crawl
            self.log_crawl(
                source_id,
                result['status'],
                result['message'],
                result['counts'],
                duration_ms
            )
            
            return result
        
        except Exception as e:
            logger.error(f"Error crawling source {source_id}: {e}", exc_info=True)
            duration_ms = int((time.time() - start_time) * 1000)
            
            error_result = {
                'status': 'failed',
                'message': str(e)[:200],
                'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
            }
            
            # Update source status
            self.update_source_status(
                source_id,
                'failed',
                str(e)[:200],
                error_result['counts']
            )
            
            # Log crawl
            self.log_crawl(
                source_id,
                'failed',
                str(e)[:200],
                error_result['counts'],
                duration_ms
            )
            
            return error_result
    
    async def crawl_all(self, limit: Optional[int] = None):
        """Crawl all active sources"""
        sources = self.get_active_sources(limit)
        
        if not sources:
            logger.info("No active sources to crawl")
            return
        
        logger.info(f"Crawling {len(sources)} sources")
        
        # Crawl sequentially (simple, no concurrency for now)
        for source in sources:
            org_name = source.get('org_name', 'Unknown')
            logger.info(f"Crawling {org_name}...")
            
            result = await self.crawl_source(source)
            
            status_icon = "✅" if result['status'] == 'ok' else "⚠️" if result['status'] == 'warn' else "❌"
            logger.info(f"{status_icon} {org_name}: {result['message']}")

