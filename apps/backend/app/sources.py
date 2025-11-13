"""
Sources management endpoints for admin.
"""
import os
import logging
from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel, HttpUrl, Field
from fastapi import APIRouter, HTTPException, Depends, Request

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

try:
    import httpx
except ImportError:
    httpx = None

from app.db_config import db_config
from security.admin_auth import admin_required

logger = logging.getLogger(__name__)
router = APIRouter()


class SourceCreate(BaseModel):
    org_name: Optional[str] = None
    careers_url: str
    source_type: str = "html"
    org_type: Optional[str] = None
    crawl_frequency_days: Optional[int] = 3
    parser_hint: Optional[str] = None
    time_window: Optional[str] = None


class SourceUpdate(BaseModel):
    org_name: Optional[str] = None
    careers_url: Optional[str] = None
    source_type: Optional[str] = None
    org_type: Optional[str] = None
    status: Optional[str] = None
    crawl_frequency_days: Optional[int] = None
    parser_hint: Optional[str] = None
    time_window: Optional[str] = None


class Source(BaseModel):
    id: str
    org_name: Optional[str]
    careers_url: str
    source_type: str
    org_type: Optional[str]
    status: str
    crawl_frequency_days: Optional[int]
    next_run_at: Optional[str]
    last_crawled_at: Optional[str]
    last_crawl_status: Optional[str]
    parser_hint: Optional[str]
    time_window: Optional[str]
    created_at: str
    updated_at: str


@router.get("/admin/sources")
def list_sources(
    request: Request,
    page: int = 1,
    size: int = 20,
    status: Optional[str] = None,
    query: Optional[str] = None,
    admin: str = Depends(admin_required)
):
    """List all sources with pagination, filtering, and search."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    page = max(1, page)
    size = max(1, min(100, size))
    offset = (page - 1) * size
    
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build query with optional filters
        where_clauses = []
        params = []
        
        # Filter by status (active, paused, deleted, or all)
        if status and status != "all":
            where_clauses.append("status = %s")
            params.append(status)
        
        # Search query (org_name or careers_url)
        if query:
            where_clauses.append("(org_name ILIKE %s OR careers_url ILIKE %s)")
            params.append(f"%{query}%")
            params.append(f"%{query}%")
        
        where_clause = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        # Count total
        count_query = f"SELECT COUNT(*) FROM sources {where_clause}"
        cursor.execute(count_query, params)
        total = cursor.fetchone()['count']
        
        # Fetch paginated results
        sql_query = f"""
            SELECT 
                id::text, org_name, careers_url, source_type, org_type, status,
                crawl_frequency_days, next_run_at, last_crawled_at, last_crawl_status,
                parser_hint, time_window, consecutive_failures, consecutive_nochange,
                created_at, updated_at
            FROM sources
            {where_clause}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(sql_query, params + [size, offset])
        items = cursor.fetchall()
        
        return {
            "status": "ok",
            "data": {
                "items": [dict(row) for row in items],
                "total": total,
                "page": page,
                "size": size
            },
            "error": None
        }
        
    except Exception as e:
        logger.error(f"Failed to list sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admin/sources")
def create_source(
    request: Request,
    source: SourceCreate,
    admin: str = Depends(admin_required)
):
    """Create a new source with auto-queue (next_run_at=now())."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Auto-queue: set next_run_at=now() to trigger immediate crawl
        cursor.execute("""
            INSERT INTO sources (
                org_name, careers_url, source_type, org_type,
                crawl_frequency_days, parser_hint, time_window,
                status, next_run_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', NOW())
            RETURNING id::text, org_name, careers_url, source_type, org_type, status,
                      crawl_frequency_days, next_run_at, last_crawled_at, last_crawl_status,
                      parser_hint, time_window, created_at, updated_at
        """, (
            source.org_name,
            source.careers_url,
            source.source_type,
            source.org_type,
            source.crawl_frequency_days,
            source.parser_hint,
            source.time_window
        ))
        
        created = cursor.fetchone()
        conn.commit()
        
        logger.info(f"[sources] Created source {created['id']} with auto-queue (next_run_at=now())")
        
        return {
            "status": "ok",
            "data": dict(created),
            "error": None
        }
        
    except psycopg2.IntegrityError as e:
        if conn:
            conn.rollback()
        logger.error(f"Duplicate careers_url: {e}")
        raise HTTPException(status_code=409, detail="Source with this URL already exists")
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to create source: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/admin/sources/{source_id}")
def update_source(
    request: Request,
    source_id: str,
    update: SourceUpdate,
    admin: str = Depends(admin_required)
):
    """Update a source."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build update query dynamically
        updates = []
        params = []
        
        if update.org_name is not None:
            updates.append("org_name = %s")
            params.append(update.org_name)
        
        if update.careers_url is not None:
            updates.append("careers_url = %s")
            params.append(update.careers_url)
        
        if update.source_type is not None:
            updates.append("source_type = %s")
            params.append(update.source_type)
        
        if update.org_type is not None:
            updates.append("org_type = %s")
            params.append(update.org_type)
        
        if update.status is not None:
            updates.append("status = %s")
            params.append(update.status)
        
        if update.crawl_frequency_days is not None:
            updates.append("crawl_frequency_days = %s")
            params.append(update.crawl_frequency_days)
        
        if update.parser_hint is not None:
            updates.append("parser_hint = %s")
            params.append(update.parser_hint)
        
        if update.time_window is not None:
            updates.append("time_window = %s")
            params.append(update.time_window)
        
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        updates.append("updated_at = NOW()")
        params.append(source_id)
        
        sql_query = f"""
            UPDATE sources
            SET {', '.join(updates)}
            WHERE id = %s
            RETURNING id::text, org_name, careers_url, source_type, org_type, status,
                      crawl_frequency_days, next_run_at, last_crawled_at, last_crawl_status,
                      parser_hint, time_window, created_at, updated_at
        """
        
        cursor.execute(sql_query, params)
        updated = cursor.fetchone()
        
        if not updated:
            raise HTTPException(status_code=404, detail="Source not found")
        
        conn.commit()
        
        return {
            "status": "ok",
            "data": dict(updated),
            "error": None
        }
        
    except psycopg2.IntegrityError as e:
        if conn:
            conn.rollback()
        logger.error(f"Duplicate careers_url on update: {e}")
        raise HTTPException(status_code=409, detail="Source with this URL already exists")
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to update source: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/admin/sources/{source_id}")
def delete_source(
    request: Request,
    source_id: str,
    admin: str = Depends(admin_required)
):
    """Soft delete a source (set status='deleted')."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            UPDATE sources
            SET status = 'deleted', updated_at = NOW()
            WHERE id = %s
            RETURNING id::text
        """, (source_id,))
        
        deleted = cursor.fetchone()
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Source not found")
        
        conn.commit()
        
        return {
            "status": "ok",
            "data": {"id": deleted['id']},
            "error": None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to delete source: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admin/sources/{source_id}/test")
async def test_source(
    request: Request,
    source_id: str,
    admin: str = Depends(admin_required)
):
    """Test source connectivity. For API sources, tests the actual API endpoint."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    conn = None
    cursor = None
    
    try:
        # Fetch source
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT id::text, careers_url, source_type, parser_hint FROM sources WHERE id = %s
        """, (source_id,))
        
        source = cursor.fetchone()
        
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        
        url = source['careers_url']
        source_type = source['source_type']
        parser_hint = source.get('parser_hint')
        
        # Extract host for response
        from urllib.parse import urlparse
        parsed = urlparse(url)
        host = parsed.netloc
        
        # For API sources, test with actual API call
        if source_type == 'api' and parser_hint:
            try:
                import json
                import os
                from crawler.api_fetch import APICrawler
                from core.secrets import check_required_secrets, mask_secrets
                
                # Check if it's v1 schema
                schema = json.loads(parser_hint)
                version = schema.get("v")
                
                if version == 1:
                    # Check for missing secrets
                    missing_secrets = check_required_secrets(schema)
                    if missing_secrets:
                        return {
                            "ok": False,
                            "status": 0,
                            "error": f"Missing required secrets: {', '.join(missing_secrets)}",
                            "host": host,
                            "missing_secrets": missing_secrets
                        }
                    
                    # Test API call (limit to 1 page for testing)
                    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
                    if not db_url:
                        raise HTTPException(status_code=500, detail="Database not configured")
                    
                    api_crawler = APICrawler(db_url)
                    # Temporarily limit to 1 page for testing
                    test_schema = dict(schema)
                    if "pagination" in test_schema:
                        test_schema["pagination"] = {**test_schema["pagination"], "max_pages": 1}
                    else:
                        test_schema["pagination"] = {"max_pages": 1}
                    
                    # Test fetch (first page only)
                    jobs = await api_crawler.fetch_api(url, json.dumps(test_schema), last_success_at=None)
                    
                    return {
                        "ok": True,
                        "status": 200,
                        "host": host,
                        "count": len(jobs),
                        "first_ids": [job.get("id") for job in jobs[:5] if job.get("id")],
                        "headers_sanitized": mask_secrets(schema.get("headers", {})),
                        "message": f"Successfully fetched {len(jobs)} jobs"
                    }
                else:
                    # Legacy format - use HEAD request
                    import httpx
                    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                        response = await client.head(url, headers={
                            "User-Agent": "AidJobsBot/1.0 (+contact@aidjobs.app)"
                        })
                    
                    return {
                        "ok": response.status_code < 400,
                        "status": response.status_code,
                        "host": host
                    }
            except json.JSONDecodeError as e:
                return {
                    "ok": False,
                    "status": 0,
                    "error": f"Invalid JSON schema: {str(e)}",
                    "host": host
                }
            except ValueError as e:
                return {
                    "ok": False,
                    "status": 0,
                    "error": str(e),
                    "host": host
                }
            except Exception as e:
                logger.error(f"Failed to test API source {source_id}: {e}")
                return {
                    "ok": False,
                    "status": 0,
                    "error": str(e),
                    "host": host
                }
        else:
            # For HTML/RSS sources, use HEAD request
            import httpx
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.head(url, headers={
                    "User-Agent": "AidJobsBot/1.0 (+contact@aidjobs.app)"
                })
            
            return {
                "ok": response.status_code < 400,
                "status": response.status_code,
                "size": response.headers.get("content-length"),
                "etag": response.headers.get("etag"),
                "last_modified": response.headers.get("last-modified"),
                "host": host
            }
        
    except httpx.HTTPError as e:
        logger.error(f"Failed to test source {source_id}: {e}")
        return {
            "ok": False,
            "status": 0,
            "error": str(e),
            "host": host if 'host' in locals() else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admin/sources/{source_id}/export")
def export_source(
    request: Request,
    source_id: str,
    admin: str = Depends(admin_required)
):
    """
    Export source configuration as JSON.
    
    Returns:
        JSON configuration that can be imported to create the same source
    """
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT 
                id::text, org_name, careers_url, source_type, org_type,
                status, crawl_frequency_days, parser_hint, time_window,
                created_at, updated_at
            FROM sources
            WHERE id = %s
        """, (source_id,))
        
        source = cursor.fetchone()
        
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        
        # Build export configuration (exclude internal fields)
        export_config = {
            "org_name": source['org_name'],
            "careers_url": source['careers_url'],
            "source_type": source['source_type'],
            "org_type": source['org_type'],
            "crawl_frequency_days": source['crawl_frequency_days'],
            "parser_hint": source['parser_hint'],
            "time_window": source['time_window'],
        }
        
        return {
            "status": "ok",
            "data": export_config,
            "error": None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to export source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admin/sources/import")
def import_source(
    request: Request,
    source: SourceCreate,
    admin: str = Depends(admin_required)
):
    """
    Import source configuration from JSON.
    
    Args:
        source: Source configuration (same format as create_source)
    
    Returns:
        Created source
    """
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    # Validate source_type
    if source.source_type not in ["html", "rss", "api"]:
        raise HTTPException(status_code=400, detail=f"Invalid source_type: {source.source_type}")
    
    # Validate parser_hint for API sources
    if source.source_type == "api" and source.parser_hint:
        try:
            import json
            parser_hint = json.loads(source.parser_hint) if isinstance(source.parser_hint, str) else source.parser_hint
            if isinstance(parser_hint, dict) and parser_hint.get("v") != 1:
                raise HTTPException(status_code=400, detail="API sources must use v1 schema (v=1)")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in parser_hint")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid parser_hint: {e}")
    
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Create source (same logic as create_source)
        cursor.execute("""
            INSERT INTO sources (
                org_name, careers_url, source_type, org_type,
                crawl_frequency_days, parser_hint, time_window,
                status, next_run_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', NOW())
            RETURNING id::text, org_name, careers_url, source_type, org_type, status,
                      crawl_frequency_days, next_run_at, last_crawled_at, last_crawl_status,
                      parser_hint, time_window, created_at, updated_at
        """, (
            source.org_name,
            source.careers_url,
            source.source_type,
            source.org_type,
            source.crawl_frequency_days,
            source.parser_hint,
            source.time_window
        ))
        
        created = cursor.fetchone()
        conn.commit()
        
        logger.info(f"[sources] Imported source {created['id']} from config")
        
        return {
            "status": "ok",
            "data": dict(created),
            "error": None
        }
        
    except psycopg2.IntegrityError as e:
        if conn:
            conn.rollback()
        logger.error(f"Duplicate careers_url: {e}")
        raise HTTPException(status_code=409, detail="Source with this URL already exists")
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to import source: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admin/sources/{source_id}/simulate_extract")
async def simulate_extract(
    request: Request,
    source_id: str,
    admin: str = Depends(admin_required)
):
    """Simulate job extraction without DB writes (returns first 3 normalized items)."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    conn = None
    cursor = None
    
    try:
        # Fetch source
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT 
                id::text, org_name, careers_url, source_type, org_type,
                parser_hint, time_window
            FROM sources
            WHERE id = %s
        """, (source_id,))
        
        source = cursor.fetchone()
        
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        
        # Import crawler modules
        source_type = source['source_type']
        
        if source_type == 'html':
            from crawler.html_fetch import fetch_html_jobs
            jobs = await fetch_html_jobs(
                url=source['careers_url'],
                org_name=source['org_name'],
                org_type=source['org_type'],
                parser_hint=source['parser_hint'],
                conn_params=conn_params
            )
        elif source_type == 'rss':
            from crawler.rss_fetch import fetch_rss_jobs
            jobs = await fetch_rss_jobs(
                url=source['careers_url'],
                org_name=source['org_name'],
                org_type=source['org_type'],
                time_window_days=int(source['time_window']) if source['time_window'] else None,
                conn_params=conn_params
            )
        elif source_type == 'api':
            from crawler.api_fetch import APICrawler
            import os
            db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
            if not db_url:
                raise HTTPException(status_code=500, detail="Database not configured")
            api_crawler = APICrawler(db_url)
            # For simulate, don't use incremental fetching
            raw_jobs = await api_crawler.fetch_api(
                source['careers_url'],
                source.get('parser_hint'),
                last_success_at=None
            )
            # Normalize jobs (similar to orchestrator)
            from crawler.html_fetch import HTMLCrawler
            html_crawler = HTMLCrawler(db_url)
            jobs = [
                html_crawler.normalize_job(job, source.get('org_name'))
                for job in raw_jobs
            ]
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported source_type: {source_type}")
        
        # Return first 3 items
        sample = jobs[:3] if jobs else []
        
        return {
            "ok": True,
            "count": len(jobs),
            "sample": sample
        }
        
    except HTTPException:
        raise
    except ValueError as e:
        # Validation errors
        error_msg = str(e)
        logger.error(f"Validation error in simulate_extract for source {source_id}: {error_msg}")
        return {
            "ok": False,
            "error": error_msg,
            "error_category": "validation"
        }
    except RuntimeError as e:
        # Runtime errors (network, API failures)
        error_msg = str(e)
        logger.error(f"Runtime error in simulate_extract for source {source_id}: {error_msg}")
        return {
            "ok": False,
            "error": error_msg,
            "error_category": "runtime"
        }
    except Exception as e:
        logger.error(f"Failed to simulate extract for source {source_id}: {e}")
        return {
            "ok": False,
            "error": str(e),
            "error_category": "unknown"
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
