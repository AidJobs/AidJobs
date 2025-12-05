"""
Crawler management endpoints for admin.
"""
import os
import logging
import asyncio
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

from app.db_config import db_config
from crawler_v2.simple_crawler import SimpleCrawler
from crawler_v2.rss_crawler import SimpleRSSCrawler
from crawler_v2.api_crawler import SimpleAPICrawler

logger = logging.getLogger(__name__)
router = APIRouter()


class CrawlRequest(BaseModel):
    source_id: str


class CrawlLog(BaseModel):
    id: str
    source_id: str
    found: int
    inserted: int
    updated: int
    skipped: int
    status: str
    message: Optional[str]
    ran_at: str


def require_dev_mode():
    """Dependency to gate dev-only admin routes."""
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin routes only available in dev mode")


@router.post("/admin/crawl/run")
def run_crawl(request: CrawlRequest, _: None = Depends(require_dev_mode)):
    """
    Run crawler for a specific source.
    
    Fetches HTML, extracts jobs, upserts to database, and logs results.
    """
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    source_id = request.source_id
    conn = None
    
    try:
        # Get source details
        conn = psycopg2.connect(**conn_params)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute(
            """
            SELECT id, org_name, careers_url, source_type, status, parser_hint
            FROM sources
            WHERE id::text = %s
            """,
            (source_id,)
        )
        source = cursor.fetchone()
        
        if not source:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Source not found")
        
        if source['status'] == 'deleted':
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="Cannot crawl deleted source")
        
        careers_url = source['careers_url']
        source_type = source.get('source_type', 'html')
        org_name = source.get('org_name')
        parser_hint = source.get('parser_hint')
        
        # Initialize log entry
        import time
        start_time = time.time()
        log_status = "running"
        log_message = None
        stats = {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
        duration_ms = 0
        
        # Get database URL for crawlers
        db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
        if not db_url:
            log_status = "failed"
            log_message = "Database URL not configured"
            duration_ms = int((time.time() - start_time) * 1000)
        else:
            try:
                # Get source metadata for updating
                cursor.execute(
                    """
                    SELECT org_type, crawl_frequency_days, consecutive_failures, consecutive_nochange
                    FROM sources
                    WHERE id::text = %s
                    """,
                    (source_id,)
                )
                source_meta = cursor.fetchone()
                org_type = source_meta.get('org_type') if source_meta else None
                base_freq_days = source_meta.get('crawl_frequency_days') if source_meta else None
                consecutive_failures = source_meta.get('consecutive_failures', 0) if source_meta else 0
                consecutive_nochange = source_meta.get('consecutive_nochange', 0) if source_meta else 0
                
                # Run async crawl using new enterprise scrapers
                async def run_async_crawl():
                    import os
                    use_ai = bool(os.getenv('OPENROUTER_API_KEY'))
                    
                    if source_type == 'rss':
                        rss_crawler = SimpleRSSCrawler(db_url)
                        # SimpleRSSCrawler doesn't have normalize_job, jobs are already normalized
                        result = await rss_crawler.crawl_source({
                            'id': source_id,
                            'careers_url': careers_url,
                            'org_name': org_name,
                            'source_type': 'rss'
                        })
                        counts = result.get('counts', {})
                        message = result.get('message', 'Crawl completed')
                        return {'status': result.get('status', 'ok'), 'message': message, 'counts': counts}
                    elif source_type == 'api' or source_type == 'json':
                        api_crawler = SimpleAPICrawler(db_url)
                        result = await api_crawler.crawl_source({
                            'id': source_id,
                            'careers_url': careers_url,
                            'org_name': org_name,
                            'source_type': 'api',
                            'parser_hint': parser_hint
                        })
                        counts = result.get('counts', {})
                        message = result.get('message', 'Crawl completed')
                        return {'status': result.get('status', 'ok'), 'message': message, 'counts': counts}
                    else:  # html (default)
                        html_crawler = SimpleCrawler(db_url, use_ai=use_ai)
                        result = await html_crawler.crawl_source({
                            'id': source_id,
                            'careers_url': careers_url,
                            'org_name': org_name,
                            'source_type': 'html',
                            'parser_hint': parser_hint
                        })
                        counts = result.get('counts', {})
                        message = result.get('message', 'Crawl completed')
                        return {'status': result.get('status', 'ok'), 'message': message, 'counts': counts}
                
                result = asyncio.run(run_async_crawl())
                duration_ms = int((time.time() - start_time) * 1000)
                stats = result.get('counts', stats)
                log_status = result.get('status', 'ok')
                log_message = result.get('message', 'Crawl completed')
                
                # Update consecutive counters
                if log_status == 'fail':
                    new_consecutive_failures = consecutive_failures + 1
                    new_consecutive_nochange = 0
                else:
                    new_consecutive_failures = 0
                    if stats['inserted'] == 0 and stats['updated'] == 0:
                        new_consecutive_nochange = consecutive_nochange + 1
                    else:
                        new_consecutive_nochange = 0
                
                # Compute next_run_at using orchestrator logic
                from orchestrator import CrawlerOrchestrator
                orchestrator = CrawlerOrchestrator(db_url)
                next_run_at = orchestrator.compute_next_run(
                    base_freq_days,
                    org_type,
                    stats['inserted'],
                    stats['updated'],
                    new_consecutive_failures,
                    new_consecutive_nochange
                )
                
                # Check circuit breaker
                new_status = source['status']
                if new_consecutive_failures >= 5:
                    new_status = 'paused'
                    log_message += ' (auto-paused after 5 failures)'
                
                # Update source with all fields
                cursor.execute(
                    """
                    UPDATE sources
                    SET last_crawled_at = NOW(),
                        last_crawl_status = %s,
                        last_crawl_message = %s,
                        consecutive_failures = %s,
                        consecutive_nochange = %s,
                        next_run_at = %s,
                        status = %s,
                        updated_at = NOW()
                    WHERE id::text = %s
                    """,
                    (log_status, log_message, new_consecutive_failures, new_consecutive_nochange, next_run_at, new_status, source_id)
                )
            
            except Exception as e:
                logger.error(f"Crawl failed: {e}")
                log_status = "failed"
                log_message = str(e)[:500]
                duration_ms = int((time.time() - start_time) * 1000)
        
        # Write crawl log
        cursor.execute(
            """
            INSERT INTO crawl_logs (
                source_id, found, inserted, updated, skipped, status, message, duration_ms
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, ran_at
            """,
            (
                source_id,
                stats['found'],
                stats['inserted'],
                stats['updated'],
                stats['skipped'],
                log_status,
                log_message,
                duration_ms,
            )
        )
        
        log_entry = cursor.fetchone()
        conn.commit()
        
        return {
            "status": "ok",
            "data": {
                "log_id": log_entry['id'],
                "crawl_status": log_status,
                "stats": stats,
                "message": log_message,
                "ran_at": log_entry['ran_at'].isoformat(),
            },
            "error": None,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Crawl error: {e}")
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            cursor.close()
            conn.close()


@router.get("/admin/crawl/logs")
def get_crawl_logs(
    source_id: Optional[str] = None,
    limit: int = 20,
    _: None = Depends(require_dev_mode)
):
    """
    Get recent crawl logs, optionally filtered by source_id.
    """
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    limit = max(1, min(100, limit))
    
    conn = None
    try:
        conn = psycopg2.connect(**conn_params)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        if source_id:
            cursor.execute(
                """
                SELECT 
                    cl.id,
                    cl.source_id,
                    cl.found,
                    cl.inserted,
                    cl.updated,
                    cl.skipped,
                    cl.status,
                    cl.message,
                    cl.ran_at,
                    cl.duration_ms,
                    s.org_name,
                    s.careers_url
                FROM crawl_logs cl
                LEFT JOIN sources s ON cl.source_id = s.id
                WHERE cl.source_id::text = %s
                ORDER BY cl.ran_at DESC
                LIMIT %s
                """,
                (source_id, limit)
            )
        else:
            cursor.execute(
                """
                SELECT 
                    cl.id,
                    cl.source_id,
                    cl.found,
                    cl.inserted,
                    cl.updated,
                    cl.skipped,
                    cl.status,
                    cl.message,
                    cl.ran_at,
                    cl.duration_ms,
                    s.org_name,
                    s.careers_url
                FROM crawl_logs cl
                LEFT JOIN sources s ON cl.source_id = s.id
                ORDER BY cl.ran_at DESC
                LIMIT %s
                """,
                (limit,)
            )
        
        logs = cursor.fetchall()
        
        # Convert to list of dicts
        logs_list = []
        for log in logs:
            logs_list.append({
                'id': log['id'],
                'source_id': log['source_id'],
                'org_name': log['org_name'],
                'careers_url': log['careers_url'],
                'found': log['found'],
                'inserted': log['inserted'],
                'updated': log['updated'],
                'skipped': log['skipped'],
                'status': log['status'],
                'message': log['message'],
                'ran_at': log['ran_at'].isoformat() if log['ran_at'] else None,
                'duration_ms': log.get('duration_ms'),
            })
        
        return {
            "status": "ok",
            "data": logs_list,
            "error": None,
        }
    
    except Exception as e:
        logger.error(f"Failed to fetch crawl logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            cursor.close()
            conn.close()
