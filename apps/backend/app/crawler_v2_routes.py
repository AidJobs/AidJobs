"""
API routes for the new simple crawler system.
"""

import os
import logging
import asyncio
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor

from security.admin_auth import admin_required
from crawler_v2.orchestrator import SimpleOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/crawl-v2", tags=["crawler_v2"])


def get_db_url():
    """Get database URL from environment"""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise HTTPException(status_code=500, detail="No database URL configured")
    return db_url


def get_db_conn():
    """Get database connection"""
    return psycopg2.connect(get_db_url())


class RunSourceRequest(BaseModel):
    source_id: str


@router.post("/run")
async def run_source(request: RunSourceRequest, admin=Depends(admin_required)):
    """Run crawl for a specific source using the new simple crawler"""
    db_url = get_db_url()
    orchestrator = SimpleOrchestrator(db_url)
    
    # Get source
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, org_name, careers_url, source_type, status
                FROM sources
                WHERE id::text = %s
            """, (request.source_id,))
            
            source = cur.fetchone()
            
            if not source:
                raise HTTPException(status_code=404, detail="Source not found")
            
            if source['status'] != 'active':
                raise HTTPException(status_code=400, detail=f"Source is not active (status: {source['status']})")
    finally:
        conn.close()
    
    # Run crawl in background
    asyncio.create_task(orchestrator.crawl_source(dict(source)))
    
    return {
        "status": "ok",
        "message": f"Crawl queued for {source['org_name']}"
    }


@router.post("/run-all")
async def run_all_sources(admin=Depends(admin_required)):
    """Run crawl for all active sources"""
    db_url = get_db_url()
    orchestrator = SimpleOrchestrator(db_url)
    
    # Run in background
    asyncio.create_task(orchestrator.crawl_all())
    
    return {
        "status": "ok",
        "message": "Crawl queued for all active sources"
    }


@router.get("/status")
async def get_status(admin=Depends(admin_required)):
    """Get status of recent crawls"""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Get recent crawl logs
            cur.execute("""
                SELECT 
                    cl.id, cl.status, cl.message, cl.duration_ms,
                    cl.found, cl.inserted, cl.updated, cl.skipped, cl.ran_at,
                    s.org_name, s.careers_url
                FROM crawl_logs cl
                JOIN sources s ON cl.source_id = s.id
                ORDER BY cl.ran_at DESC
                LIMIT 20
            """)
            
            logs = [dict(row) for row in cur.fetchall()]
            
            # Get source stats
            cur.execute("""
                SELECT 
                    COUNT(*) as total_sources,
                    COUNT(*) FILTER (WHERE status = 'active') as active_sources,
                    COUNT(*) FILTER (WHERE last_crawl_status = 'ok') as sources_ok,
                    COUNT(*) FILTER (WHERE last_crawl_status = 'warn') as sources_warn,
                    COUNT(*) FILTER (WHERE last_crawl_status = 'failed') as sources_failed
                FROM sources
                WHERE status != 'deleted'
            """)
            
            stats = dict(cur.fetchone())
            
            return {
                "status": "ok",
                "stats": stats,
                "recent_logs": logs
            }
    finally:
        conn.close()

