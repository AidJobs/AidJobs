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
    from psycopg2 import errors as psycopg2_errors
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

try:
    import httpx
except ImportError:
    httpx = None

import json

from app.db_config import db_config
from app.errors import InternalError, log_failure
from app.log_safety import current_request_id
from contracts.models import SOURCE_TYPES
from contracts.outbound import fetch_message
from security.admin_auth import admin_required

logger = logging.getLogger(__name__)
router = APIRouter()

DB_NOT_CONFIGURED = "Database not configured"
DB_SETTINGS_UNREADABLE = "Database settings could not be read"
# The whole check of one source URL, every redirect included
SOURCE_CHECK_TOTAL_SECONDS = 20.0
# What an edit may set. "deleted" is the delete route's, which also hides the source's jobs;
# "pending_validation", production's default for a new row, is set by no admin action.
EDITABLE_STATUSES = ("active", "paused")
DELETED_SOURCE = "This source is deleted. Add it again with the same careers URL to restore it."
RUN_IN_PROGRESS = "A crawl of this source is still running. Try again after it ends."
SOURCE_BUSY = ("This source or its jobs are being changed (a crawl may be saving jobs). "
               "Nothing was deleted; try again in a minute.")
# How long a source delete waits for any lock it needs, such as a crawl's job save in progress,
# before answering SOURCE_BUSY.
DELETE_LOCK_TIMEOUT = "10s"


SOURCE_TYPE_REFUSED = "source_type must be html, rss or api"


def check_source_type(source_type: Optional[str]) -> None:
    """Refuse a type outside the contract's source types (W-53); None means "unchanged"."""
    if source_type is not None and source_type not in SOURCE_TYPES:
        raise HTTPException(status_code=400, detail=SOURCE_TYPE_REFUSED)


def live_jobs_message(live: int) -> str:
    """Why a deleted source cannot be removed yet."""
    jobs, verb = ("job", "is") if live == 1 else ("jobs", "are")
    return (f"{live} {jobs} of this source {verb} not deleted. Delete them on the Jobs page, "
            "then delete the source permanently.")


def _connection_params() -> dict:
    """The database connection settings, or a 503 that says why there are none."""
    params = db_config.get_connection_params()
    if params:
        return params
    if db_config.settings_unreadable:
        raise HTTPException(status_code=503, detail=DB_SETTINGS_UNREADABLE)
    raise HTTPException(status_code=503, detail=DB_NOT_CONFIGURED)


def _source_error(message: str, source_id: str, cause: BaseException) -> InternalError:
    """InternalError for a route about one source: the ID goes to the log, not the response."""
    logger.error("[sources] %s: source %r", message, source_id)
    return InternalError(message, cause=cause)


def describe_failure(error: BaseException) -> str:
    """Why a source check failed, in our own words, chosen by the exception's type.

    Never the exception's text: third-party messages can quote URLs, headers or credentials.
    """
    from contracts.outbound import FetchError

    if isinstance(error, FetchError):
        reason = fetch_message(error)
        return f"Fetch failed: {reason}" if reason else "Fetch failed"
    if isinstance(error, json.JSONDecodeError):
        return f"Invalid JSON at line {error.lineno}, column {error.colno}"
    if httpx is not None:
        if isinstance(error, httpx.HTTPStatusError):
            return f"The source answered HTTP {error.response.status_code}"
        if isinstance(error, httpx.TimeoutException):
            return "Connection timeout. The server took too long to respond."
        if isinstance(error, httpx.ConnectError):
            return "Could not connect: the host name did not resolve or the connection was refused."
        if isinstance(error, httpx.TooManyRedirects):
            return "Too many redirects"
    return f"Unexpected error (ref {current_request_id()[:8] or 'unavailable'})"


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


@router.get("/api/admin/sources")
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
    
    conn_params = _connection_params()
    
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
                last_crawl_message, parser_hint, time_window, consecutive_failures, consecutive_nochange,
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
        raise InternalError("Failed to list sources", cause=e)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/admin/organisations")
def list_organisations(admin: str = Depends(admin_required)):
    """Distinct trimmed source names. This does not read or write organisation rows."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    conn_params = _connection_params()
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            SELECT btrim(org_name) AS name, COUNT(*) AS source_count
            FROM sources
            WHERE btrim(coalesce(org_name, '')) <> ''
            GROUP BY btrim(org_name)
            ORDER BY btrim(org_name)
            """
        )
        items = [dict(row) for row in cursor.fetchall()]
        return {"status": "ok", "data": {"items": items}, "error": None}
    except Exception as e:
        raise InternalError("Failed to list organisations", cause=e)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/admin/sources/{source_id}")
def get_source(source_id: str, admin: str = Depends(admin_required)):
    """One source for the detail page."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    conn_params = _connection_params()
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            SELECT
                id::text, org_name, careers_url, source_type, org_type, status,
                crawl_frequency_days, next_run_at, last_crawled_at, last_crawl_status,
                last_crawl_message, consecutive_failures
            FROM sources
            WHERE id::text = %s
            """,
            (source_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Source not found")
        return {"status": "ok", "data": dict(row), "error": None}
    except HTTPException:
        raise
    except Exception as e:
        raise _source_error("Failed to load source", source_id, e)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/admin/sources")
def create_source(
    request: Request,
    source: SourceCreate,
    admin: str = Depends(admin_required)
):
    """Create a new source with auto-queue (next_run_at=now())."""
    check_source_type(source.source_type)
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = _connection_params()
    
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check if a deleted source with this URL exists
        cursor.execute("""
            SELECT id::text, status
            FROM sources
            WHERE careers_url = %s
        """, (source.careers_url,))
        
        existing = cursor.fetchone()
        
        if existing:
            if existing['status'] == 'deleted':
                # Restore the deleted source
                logger.info(f"[sources] Restoring deleted source {existing['id']}")
                cursor.execute("""
                    UPDATE sources
                    SET status = 'active',
                        org_name = COALESCE(%s, org_name),
                        source_type = COALESCE(%s, source_type),
                        org_type = COALESCE(%s, org_type),
                        crawl_frequency_days = COALESCE(%s, crawl_frequency_days),
                        parser_hint = COALESCE(%s, parser_hint),
                        time_window = COALESCE(%s, time_window),
                        next_run_at = NOW(),
                        updated_at = NOW()
                    WHERE id::text = %s
                    RETURNING id::text, org_name, careers_url, source_type, org_type, status,
                              crawl_frequency_days, next_run_at, last_crawled_at, last_crawl_status,
                              parser_hint, time_window, created_at, updated_at
                """, (
                    source.org_name,
                    source.source_type,
                    source.org_type,
                    source.crawl_frequency_days,
                    source.parser_hint,
                    source.time_window,
                    existing['id']
                ))
                
                restored = cursor.fetchone()
                conn.commit()
                
                logger.info(f"[sources] Restored source {restored['id']} with auto-queue (next_run_at=now())")
                
                return {
                    "status": "ok",
                    "data": dict(restored),
                    "error": None,
                    "message": "Source restored from deleted status"
                }
            else:
                # Active source exists
                conn.rollback()
                logger.error(f"Duplicate careers_url: {source.careers_url}")
                raise HTTPException(status_code=409, detail="Source with this URL already exists")
        
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
        
    except HTTPException:
        raise
    except psycopg2.IntegrityError:
        if conn:
            conn.rollback()
        logger.warning("[sources] Create refused: a source with this careers_url exists")
        raise HTTPException(status_code=409, detail="Source with this URL already exists")
    except Exception as e:
        if conn:
            conn.rollback()
        raise InternalError("Failed to create source", cause=e)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/admin/sources/{source_id}")
def update_source(
    request: Request,
    source_id: str,
    update: SourceUpdate,
    admin: str = Depends(admin_required)
):
    """Update a source that is not deleted."""
    if update.status is not None and update.status not in EDITABLE_STATUSES:
        detail = ("Delete a source with the delete action, which also hides its jobs"
                  if update.status == "deleted" else "status must be active or paused")
        raise HTTPException(status_code=400, detail=detail)
    check_source_type(update.source_type)
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = _connection_params()
    
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
            WHERE id::text = %s AND status IS DISTINCT FROM 'deleted'
            RETURNING id::text, org_name, careers_url, source_type, org_type, status,
                      crawl_frequency_days, next_run_at, last_crawled_at, last_crawl_status,
                      parser_hint, time_window, created_at, updated_at
        """
        
        cursor.execute(sql_query, params)
        updated = cursor.fetchone()
        
        if not updated:
            cursor.execute("SELECT 1 FROM sources WHERE id::text = %s", (source_id,))
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail=DELETED_SOURCE)
            raise HTTPException(status_code=404, detail="Source not found")
        
        conn.commit()
        
        return {
            "status": "ok",
            "data": dict(updated),
            "error": None
        }
        
    except psycopg2.IntegrityError:
        if conn:
            conn.rollback()
        logger.warning("[sources] Update refused: a source with this careers_url exists")
        raise HTTPException(status_code=409, detail="Source with this URL already exists")
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise _source_error("Failed to update source", source_id, e)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/api/admin/sources/{source_id}")
def delete_source(
    request: Request,
    source_id: str,
    admin: str = Depends(admin_required)
):
    """Soft delete a source (set status='deleted')."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = _connection_params()
    
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        logger.info(f"[sources] Deleting source {source_id}")
        
        # FOR UPDATE waits for a crawl's job save in progress (it holds this row FOR KEY SHARE),
        # so the job update below sees its jobs; a later save then refuses the deleted source.
        cursor.execute("SET LOCAL lock_timeout = %s", (DELETE_LOCK_TIMEOUT,))
        cursor.execute("""
            SELECT id::text, org_name
            FROM sources
            WHERE id::text = %s
            FOR UPDATE
        """, (source_id,))
        
        source = cursor.fetchone()
        
        if not source:
            logger.warning(f"[sources] Source {source_id} not found for deletion")
            raise HTTPException(status_code=404, detail="Source not found")
        
        # Soft delete the source
        cursor.execute("""
            UPDATE sources
            SET status = 'deleted', updated_at = NOW()
            WHERE id::text = %s
            RETURNING id::text
        """, (source_id,))
        
        deleted = cursor.fetchone()
        
        # Soft delete all associated jobs
        cursor.execute("""
            UPDATE jobs
            SET deleted_at = NOW(),
                deleted_by = 'system',
                deletion_reason = 'Source deleted'
            WHERE source_id::text = %s
            AND deleted_at IS NULL
        """, (source_id,))
        
        jobs_deleted = cursor.rowcount
        logger.info(f"[sources] Soft-deleted {jobs_deleted} jobs for source {source_id}")
        
        conn.commit()
        
        return {
            "status": "ok",
            "data": {"id": deleted['id']},
            "error": None
        }
        
    except HTTPException:
        raise
    except psycopg2_errors.LockNotAvailable:
        conn.rollback()
        logger.warning("[sources] Delete of source %r waited too long for a lock", source_id)
        raise HTTPException(status_code=409, detail=SOURCE_BUSY)
    except Exception as e:
        if conn:
            conn.rollback()
        raise _source_error("Failed to delete source", source_id, e)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/api/admin/sources/{source_id}/permanent")
def permanently_delete_source(
    request: Request,
    source_id: str,
    admin: str = Depends(admin_required)
):
    """Permanently delete a source from the database (only for deleted sources)."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = _connection_params()
    
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # The row lock holds back a crawl's new job (its foreign key check) and a job restore
        # (FOR SHARE on the source) until this transaction ends, so the count below stays true.
        cursor.execute("""
            SELECT id::text, status
            FROM sources
            WHERE id::text = %s
            FOR UPDATE
        """, (source_id,))
        
        source = cursor.fetchone()
        
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        
        if source['status'] != 'deleted':
            raise HTTPException(status_code=400, detail="Source must be deleted before permanent deletion. Use DELETE /api/admin/sources/{id} first.")
        
        # A run's finish locks its run row, then this source row: deleting the run rows under
        # this lock would deadlock with it. The recovery ends a stale running row on its own.
        cursor.execute("""
            SELECT 1 FROM crawl_logs
            WHERE source_id::text = %s AND status = 'running'
            LIMIT 1
        """, (source_id,))
        if cursor.fetchone():
            conn.rollback()
            raise HTTPException(status_code=409, detail=RUN_IN_PROGRESS)
        
        # Removing the row would leave these jobs public with no source, and never expired.
        cursor.execute("""
            SELECT COUNT(*) AS live
            FROM jobs
            WHERE source_id::text = %s AND deleted_at IS NULL
        """, (source_id,))
        live = cursor.fetchone()['live']
        if live:
            conn.rollback()
            raise HTTPException(status_code=409, detail=live_jobs_message(live))
        
        logger.info(f"[sources] Permanently deleting source {source_id}")
        
        # Delete associated crawl logs first (foreign key constraint)
        cursor.execute("""
            DELETE FROM crawl_logs
            WHERE source_id::text = %s
        """, (source_id,))
        
        # Delete crawl locks
        cursor.execute("""
            DELETE FROM crawl_locks
            WHERE source_id::text = %s
        """, (source_id,))
        
        # Delete the source
        cursor.execute("""
            DELETE FROM sources
            WHERE id::text = %s
        """, (source_id,))
        
        conn.commit()
        
        return {
            "status": "ok",
            "data": {"id": source_id},
            "error": None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise _source_error("Failed to permanently delete source", source_id, e)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


async def _policy_head(url: str) -> dict:
    """HEAD a stored source URL through the shared outbound policy."""
    from contracts.outbound import FetchError, fetch_url

    try:
        result = await fetch_url(
            url,
            method="HEAD",
            timeout=10.0,
            total_timeout=SOURCE_CHECK_TOTAL_SECONDS,
        )
    except FetchError as exc:
        return {"ok": False, "status": 0, "error": fetch_message(exc) or "Fetch failed"}
    return {
        "ok": result.status_code < 400,
        "status": result.status_code,
        "size": result.headers.get("content-length"),
        "etag": result.headers.get("etag"),
        "last_modified": result.headers.get("last-modified"),
    }


@router.post("/api/admin/sources/{source_id}/test")
async def test_source(
    request: Request,
    source_id: str,
    admin: str = Depends(admin_required)
):
    """Test source connectivity. For API sources, tests the actual API endpoint."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = _connection_params()
    
    conn = None
    cursor = None
    host = None
    
    try:
        # Fetch source
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        logger.info(f"[sources] Testing source {source_id}")
        cursor.execute("""
            SELECT id::text, careers_url, source_type, parser_hint FROM sources WHERE id::text = %s
        """, (source_id,))
        
        source = cursor.fetchone()
        
        if not source:
            logger.warning(f"[sources] Source {source_id} not found for testing")
            raise HTTPException(status_code=404, detail="Source not found")
        
        url = source['careers_url']
        source_type = source['source_type']
        parser_hint = source.get('parser_hint')
        
        # Support 'json' as an alias for 'api'
        if source_type == 'json':
            source_type = 'api'
        
        # Extract host for response
        from urllib.parse import urlparse
        parsed = urlparse(url)
        host = parsed.netloc
        
        # For API sources, test with actual API call
        if source_type == 'api' and parser_hint:
            try:
                import os
                from crawler_v2.api_crawler import SimpleAPICrawler
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
                        raise HTTPException(status_code=500, detail=DB_NOT_CONFIGURED)
                    
                    api_crawler = SimpleAPICrawler(db_url)
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
                    headed = await _policy_head(url)
                    headed["host"] = host
                    return headed
            except HTTPException:
                raise
            except json.JSONDecodeError as e:
                return {
                    "ok": False,
                    "status": 0,
                    "error": f"API configuration: {describe_failure(e)}",
                    "host": host
                }
            except Exception as e:
                log_failure(logger, f"[sources] Test of API source {source_id} failed", e)
                return {
                    "ok": False,
                    "status": 0,
                    "error": describe_failure(e),
                    "host": host
                }
        else:
            headed = await _policy_head(url)
            headed["host"] = host
            return headed
        
    except HTTPException:
        raise
    except Exception as e:
        log_failure(logger, f"[sources] Test of source {source_id} failed", e)
        return {
            "ok": False,
            "status": 0,
            "error": describe_failure(e),
            "host": host
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/admin/sources/{source_id}/export")
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
    
    conn_params = _connection_params()
    
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
            WHERE id::text = %s
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
        raise _source_error("Failed to export source", source_id, e)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/admin/sources/import")
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
    
    conn_params = _connection_params()
    
    check_source_type(source.source_type)
    
    # Validate parser_hint for API sources
    if source.source_type == "api" and source.parser_hint:
        try:
            parser_hint = json.loads(source.parser_hint) if isinstance(source.parser_hint, str) else source.parser_hint
            if isinstance(parser_hint, dict) and parser_hint.get("v") != 1:
                raise HTTPException(status_code=400, detail="API sources must use v1 schema (v=1)")
        except HTTPException:
            raise
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in parser_hint")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid parser_hint")
    
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
        
    except psycopg2.IntegrityError:
        if conn:
            conn.rollback()
        logger.warning("[sources] Import refused: a source with this careers_url exists")
        raise HTTPException(status_code=409, detail="Source with this URL already exists")
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise InternalError("Failed to import source", cause=e)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/admin/sources/{source_id}/simulate_extract")
async def simulate_extract(
    request: Request,
    source_id: str,
    admin: str = Depends(admin_required)
):
    """Simulate job extraction without DB writes (returns first 3 normalized items)."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    
    conn_params = _connection_params()
    
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
            WHERE id::text = %s
        """, (source_id,))
        
        source = cursor.fetchone()
        
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        
        # Import crawler modules
        source_type = source['source_type']
        
        # Support 'json' as an alias for 'api'
        if source_type == 'json':
            source_type = 'api'
        
        if source_type == 'html':
            from crawler_v2.simple_crawler import SimpleCrawler
            import os
            db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
            if not db_url:
                raise HTTPException(status_code=500, detail=DB_NOT_CONFIGURED)
            html_crawler = SimpleCrawler(db_url)
            # Fetch and extract jobs
            status, html = await html_crawler.fetch_html(source['careers_url'])
            if status == 200:
                jobs = html_crawler.extract_jobs_from_html(html, source['careers_url'])
            else:
                jobs = []
        elif source_type == 'rss':
            from crawler_v2.rss_crawler import SimpleRSSCrawler
            import os
            db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
            if not db_url:
                raise HTTPException(status_code=500, detail=DB_NOT_CONFIGURED)
            rss_crawler = SimpleRSSCrawler(db_url)
            feed = await rss_crawler.fetch_feed(source['careers_url'])
            if feed:
                jobs = rss_crawler.extract_jobs_from_feed(feed, source['careers_url'])
            else:
                jobs = []
        elif source_type == 'api':
            from crawler_v2.api_crawler import SimpleAPICrawler
            import os
            db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
            if not db_url:
                raise HTTPException(status_code=500, detail=DB_NOT_CONFIGURED)
            api_crawler = SimpleAPICrawler(db_url)
            # For simulate, fetch API and extract jobs
            data = await api_crawler.fetch_api(source['careers_url'])
            if data:
                jobs = api_crawler.extract_jobs_from_json(data, source['careers_url'])
            else:
                jobs = []
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported source_type: {source_type}. Supported types: html, rss, api (or json as alias for api)"
            )
        
        # Return first 3 items
        sample = jobs[:3] if jobs else []
        
        return {
            "ok": True,
            "count": len(jobs),
            "sample": sample
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_failure(logger, f"[sources] Simulated extraction for source {source_id} failed", e)
        if isinstance(e, ValueError):
            category = "validation"
        elif isinstance(e, RuntimeError):
            category = "runtime"
        else:
            category = "unknown"
        return {
            "ok": False,
            "error": describe_failure(e),
            "error_category": category
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
