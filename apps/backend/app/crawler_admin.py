"""
Admin API routes for crawler management
"""
import os
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import errors as psycopg2_errors

from security.admin_auth import admin_required
from orchestrator import get_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/crawl", tags=["crawler_admin"])
robots_router = APIRouter(prefix="/admin/robots", tags=["robots"])
policies_router = APIRouter(prefix="/admin/domain_policies", tags=["domain_policies"])


def get_db_url():
    """Get database URL from environment (PostgreSQL connection string only)"""
    # SUPABASE_DB_URL is the PostgreSQL connection string
    # SUPABASE_URL is the HTTPS REST endpoint and cannot be used with psycopg2
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise HTTPException(status_code=500, detail="No PostgreSQL database URL configured. Set SUPABASE_DB_URL or DATABASE_URL.")
    return db_url


def get_db_conn():
    """Get database connection"""
    return psycopg2.connect(get_db_url())


# Models
class RunSourceRequest(BaseModel):
    source_id: str


class DomainPolicyUpdate(BaseModel):
    max_concurrency: Optional[int] = None
    min_request_interval_ms: Optional[int] = None
    max_pages: Optional[int] = None
    max_kb_per_page: Optional[int] = None
    allow_js: Optional[bool] = None


# Crawl management endpoints

@router.post("/run")
async def run_source(request: RunSourceRequest, admin=Depends(admin_required)):
    """Manually trigger crawl for a specific source"""
    db_url = get_db_url()
    orchestrator = get_orchestrator(db_url)
    
    # Get source
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, org_name, careers_url, source_type, org_type,
                       parser_hint, crawl_frequency_days, consecutive_failures,
                       consecutive_nochange
                FROM sources
                WHERE id::text = %s
            """, (request.source_id,))
            
            source = cur.fetchone()
            
            if not source:
                raise HTTPException(status_code=404, detail="Source not found")
    finally:
        conn.close()
    
    # Run in background
    import asyncio
    asyncio.create_task(orchestrator.run_source_with_lock(dict(source)))
    
    return {
        "status": "ok",
        "message": f"Crawl queued for {source['org_name']}"
    }


@router.post("/run_due")
async def run_due(admin=Depends(admin_required)):
    """Manually trigger crawl for all due sources"""
    db_url = get_db_url()
    orchestrator = get_orchestrator(db_url)
    
    result = await orchestrator.run_due_sources_once()
    
    return {
        "status": "ok",
        "data": result
    }


@router.post("/cleanup_expired")
async def cleanup_expired(admin=Depends(admin_required)):
    """Manually trigger cleanup of expired jobs"""
    db_url = get_db_url()
    orchestrator = get_orchestrator(db_url)
    
    result = await orchestrator.cleanup_expired_jobs()
    
    return {
        "status": "ok",
        "data": result
    }


@router.get("/status")
async def get_status(admin=Depends(admin_required)):
    """Get crawler status"""
    db_url = get_db_url()
    orchestrator = get_orchestrator(db_url)
    
    conn = get_db_conn()
    due_count = 0
    locked_count = 0
    
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Get due count - handle missing next_run_at column gracefully
            try:
                cur.execute("""
                    SELECT COUNT(*) as count
                    FROM sources
                    WHERE status = 'active'
                    AND (next_run_at IS NULL OR next_run_at <= NOW())
                """)
                due_count = cur.fetchone()['count']
            except psycopg2_errors.UndefinedColumn:
                # next_run_at column doesn't exist - fallback to simpler query
                logger.warning("next_run_at column does not exist, using fallback query")
                conn.rollback()
                cur.execute("""
                    SELECT COUNT(*) as count
                    FROM sources
                    WHERE status = 'active'
                """)
                due_count = cur.fetchone()['count']
            
            # Get locked count - handle missing table gracefully
            try:
                cur.execute("SELECT COUNT(*) as count FROM crawl_locks")
                locked_count = cur.fetchone()['count']
            except psycopg2_errors.UndefinedTable:
                # Table doesn't exist yet - need to create it
                # Rollback the failed transaction first
                conn.rollback()
                logger.warning("crawl_locks table does not exist, creating it...")
                
                # Use a separate connection for DDL to avoid transaction state issues
                ddl_conn = None
                try:
                    ddl_conn = get_db_conn()
                    ddl_conn.autocommit = True  # DDL operations should use autocommit
                    with ddl_conn.cursor() as ddl_cur:
                        ddl_cur.execute("""
                            CREATE TABLE IF NOT EXISTS crawl_locks (
                                source_id UUID PRIMARY KEY,
                                locked_at TIMESTAMPTZ DEFAULT NOW()
                            )
                        """)
                    logger.info("crawl_locks table created successfully")
                except Exception as ddl_error:
                    logger.error(f"Failed to create crawl_locks table: {ddl_error}")
                finally:
                    if ddl_conn:
                        ddl_conn.close()
                
                locked_count = 0
            except Exception as e:
                # If any other error occurs, log it but don't fail the entire request
                logger.error(f"Error checking crawl_locks: {e}")
                conn.rollback()
                locked_count = 0
    except Exception as e:
        logger.error(f"Error in get_status: {e}")
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to get crawler status: {str(e)}")
    finally:
        if conn:
            conn.close()
    
    return {
        "status": "ok",
        "data": {
            "running": orchestrator.running,
            "pool": {
                "global_max": 3,
                "available": orchestrator.semaphore._value
            },
            "due_count": due_count,
            "locked": locked_count,
            "in_flight": 3 - orchestrator.semaphore._value
        }
    }


@router.get("/logs")
async def get_logs(
    source_id: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    admin=Depends(admin_required)
):
    """Get crawl logs"""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if source_id:
                cur.execute("""
                    SELECT l.*, s.org_name, s.careers_url
                    FROM crawl_logs l
                    JOIN sources s ON s.id = l.source_id
                    WHERE l.source_id::text = %s
                    ORDER BY l.ran_at DESC
                    LIMIT %s
                """, (source_id, limit))
            else:
                cur.execute("""
                    SELECT l.*, s.org_name, s.careers_url
                    FROM crawl_logs l
                    JOIN sources s ON s.id = l.source_id
                    ORDER BY l.ran_at DESC
                    LIMIT %s
                """, (limit,))
            
            logs = cur.fetchall()
    finally:
        conn.close()
    
    # Convert to list of dicts with proper field names
    logs_list = []
    for log in logs:
        logs_list.append({
            'id': str(log['id']),
            'source_id': str(log['source_id']),
            'org_name': log.get('org_name'),
            'careers_url': log.get('careers_url'),
            'found': log.get('found', 0),
            'inserted': log.get('inserted', 0),
            'updated': log.get('updated', 0),
            'skipped': log.get('skipped', 0),
            'status': log.get('status', 'unknown'),
            'message': log.get('message'),
            'ran_at': log['ran_at'].isoformat() if log.get('ran_at') else None,
            'duration_ms': log.get('duration_ms'),
        })
    
    return {
        "status": "ok",
        "data": logs_list
    }


# Robots endpoints

@robots_router.get("/{host}")
async def get_robots(host: str, admin=Depends(admin_required)):
    """Get robots.txt cache for a host"""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT *
                FROM robots_cache
                WHERE host = %s
            """, (host,))
            
            cache = cur.fetchone()
            
            if not cache:
                return {
                    "status": "ok",
                    "data": None
                }
            
            return {
                "status": "ok",
                "data": dict(cache)
            }
    finally:
        conn.close()


# Domain policies endpoints

@policies_router.get("/{host}")
async def get_policy(host: str, admin=Depends(admin_required)):
    """Get domain policy for a host"""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT *
                FROM domain_policies
                WHERE host = %s
            """, (host,))
            
            policy = cur.fetchone()
            
            if not policy:
                # Return defaults
                return {
                    "status": "ok",
                    "data": {
                        "host": host,
                        "max_concurrency": 1,
                        "min_request_interval_ms": 3000,
                        "max_pages": 10,
                        "max_kb_per_page": 1024,
                        "allow_js": False
                    }
                }
            
            return {
                "status": "ok",
                "data": dict(policy)
            }
    finally:
        conn.close()


@policies_router.post("/{host}")
async def upsert_policy(host: str, policy: DomainPolicyUpdate, admin=Depends(admin_required)):
    """Create or update domain policy"""
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            # Build update fields
            fields = []
            values = []
            
            if policy.max_concurrency is not None:
                fields.append("max_concurrency = %s")
                values.append(policy.max_concurrency)
            if policy.min_request_interval_ms is not None:
                fields.append("min_request_interval_ms = %s")
                values.append(policy.min_request_interval_ms)
            if policy.max_pages is not None:
                fields.append("max_pages = %s")
                values.append(policy.max_pages)
            if policy.max_kb_per_page is not None:
                fields.append("max_kb_per_page = %s")
                values.append(policy.max_kb_per_page)
            if policy.allow_js is not None:
                fields.append("allow_js = %s")
                values.append(policy.allow_js)
            
            fields.append("updated_at = NOW()")
            values.append(host)
            
            # Upsert
            cur.execute(f"""
                INSERT INTO domain_policies (host, {', '.join([f.split(' = ')[0] for f in fields[:-1]])})
                VALUES (%s, {', '.join(['%s'] * (len(fields) - 1))})
                ON CONFLICT (host) DO UPDATE SET
                {', '.join(fields)}
            """, [host] + values[:-1] + [values[-1]])
            
            conn.commit()
    finally:
        conn.close()
    
    return {
        "status": "ok",
        "message": f"Policy updated for {host}"
    }
