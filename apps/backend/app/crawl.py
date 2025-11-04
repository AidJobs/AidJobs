"""
Crawler management endpoints for admin.
"""
import os
import logging
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
from crawler.html_fetch import fetch_html, extract_jobs, upsert_jobs

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
            SELECT id, org_name, careers_url, source_type, status
            FROM sources
            WHERE id = %s
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
        
        # Initialize log entry
        log_status = "running"
        log_message = None
        stats = {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
        
        try:
            # Fetch HTML
            logger.info(f"Fetching HTML from {careers_url}")
            html = fetch_html(careers_url)
            
            if not html:
                log_status = "failed"
                log_message = f"Failed to fetch HTML from {careers_url}"
            else:
                # Extract jobs
                logger.info(f"Extracting jobs from HTML")
                jobs = extract_jobs(html, careers_url)
                
                if not jobs:
                    log_status = "success"
                    log_message = "No jobs found"
                else:
                    # Upsert jobs
                    logger.info(f"Upserting {len(jobs)} jobs")
                    stats = upsert_jobs(jobs, source_id)
                    
                    log_status = "success"
                    log_message = f"Processed {stats['found']} jobs"
                
                # Update source last_crawled_at
                cursor.execute(
                    """
                    UPDATE sources
                    SET last_crawled_at = NOW(),
                        last_crawl_status = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (log_status, source_id)
                )
        
        except Exception as e:
            logger.error(f"Crawl failed: {e}")
            log_status = "failed"
            log_message = str(e)
        
        # Write crawl log
        cursor.execute(
            """
            INSERT INTO crawl_logs (
                source_id, found, inserted, updated, skipped, status, message
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
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
                    s.org_name,
                    s.careers_url
                FROM crawl_logs cl
                LEFT JOIN sources s ON cl.source_id = s.id
                WHERE cl.source_id = %s
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
