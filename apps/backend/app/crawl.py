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
from crawler.html_fetch import HTMLCrawler
from crawler.rss_fetch import RSSCrawler
from crawler.api_fetch import APICrawler

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
                
                # Run async crawl
                async def run_async_crawl():
                    html_crawler = HTMLCrawler(db_url)  # Always use HTMLCrawler for upsert_jobs
                    
                    if source_type == 'rss':
                        rss_crawler = RSSCrawler(db_url)
                        raw_jobs = await rss_crawler.fetch_feed(careers_url)
                        normalized_jobs = [
                            rss_crawler.normalize_job(job, org_name)
                            for job in raw_jobs
                        ]
                    elif source_type == 'api' or source_type == 'json':
                        api_crawler = APICrawler(db_url)
                        raw_jobs = await api_crawler.fetch_api(careers_url, parser_hint, None)
                        normalized_jobs = [
                            html_crawler.normalize_job(job, org_name)
                            for job in raw_jobs
                        ]
                    else:  # html (default)
                        status, headers, html, size = await html_crawler.fetch_html(careers_url)
                        
                        if status == 304:
                            return {'status': 'ok', 'message': 'Not modified (304)', 'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}}
                        
                        if status == 403:
                            return {'status': 'fail', 'message': 'Blocked by robots.txt', 'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}}
                        
                        if status != 200:
                            return {'status': 'fail', 'message': f'HTTP {status}: Failed to fetch HTML', 'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}}
                        
                        # Extract jobs using the same logic as simulation
                        raw_jobs = html_crawler.extract_jobs(html, careers_url, parser_hint)
                        
                        if not raw_jobs:
                            logger.warning(f"[crawl] No jobs extracted from {careers_url}. HTML size: {size} bytes, parser_hint: {parser_hint or 'none'}")
                            return {'status': 'fail', 'message': f'No jobs found. HTML fetched successfully ({size} bytes) but extraction returned 0 jobs. Try adding a parser_hint CSS selector to help identify job listings.', 'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}}
                        
                        logger.info(f"[crawl] Extracted {len(raw_jobs)} raw jobs from {careers_url}")
                        
                        normalized_jobs = [
                            html_crawler.normalize_job(job, org_name)
                            for job in raw_jobs
                        ]
                        
                        # Filter out jobs that lost their title during normalization
                        normalized_jobs = [job for job in normalized_jobs if job.get('title')]
                        logger.info(f"[crawl] Normalized to {len(normalized_jobs)} jobs with titles")
                    
                    # Upsert jobs (HTMLCrawler has the upsert_jobs method)
                    if not normalized_jobs:
                        logger.warning(f"[crawl] No valid jobs after normalization from {careers_url}")
                        return {'status': 'fail', 'message': 'No valid jobs found after extraction and normalization. Check if the page structure matches expected job listing format.', 'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}}
                    
                    counts = await html_crawler.upsert_jobs(normalized_jobs, source_id)
                    
                    # Create a more informative message
                    if counts['found'] == 0:
                        message = "No jobs found on the page"
                    elif counts['inserted'] > 0 and counts['updated'] > 0:
                        message = f"Found {counts['found']} job(s): {counts['inserted']} new, {counts['updated']} updated"
                    elif counts['inserted'] > 0:
                        message = f"Found {counts['found']} job(s): {counts['inserted']} new"
                    elif counts['updated'] > 0:
                        message = f"Found {counts['found']} job(s): {counts['updated']} updated with latest data"
                    else:
                        message = f"Found {counts['found']} job(s) (no changes)"
                    
                    return {'status': 'ok', 'message': message, 'counts': counts}
                
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
