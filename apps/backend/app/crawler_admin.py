"""
Admin API routes for crawler management
"""
import os
import logging
import json
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query  # pyright: ignore[reportMissingImports]
from pydantic import BaseModel  # type: ignore
import psycopg2  # type: ignore
from psycopg2.extras import RealDictCursor  # type: ignore
from psycopg2 import errors as psycopg2_errors  # type: ignore

from security.admin_auth import admin_required
from orchestrator import get_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/crawl", tags=["crawler_admin"])
robots_router = APIRouter(prefix="/api/admin/robots", tags=["robots"])
policies_router = APIRouter(prefix="/api/admin/domain_policies", tags=["domain_policies"])
quality_router = APIRouter(prefix="/api/admin/data-quality", tags=["data_quality"])


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


class DeleteJobsRequest(BaseModel):
    source_id: str
    deletion_type: str = "soft"  # "soft" or "hard"
    trigger_crawl: bool = False
    dry_run: bool = False
    deletion_reason: Optional[str] = None
    export_data: bool = False  # Export before deletion


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
    try:
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
        finally:
            # Connection will be closed in outer finally block
            pass
        
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_status: {e}", exc_info=True)
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to get crawler status: {str(e)}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()


@router.get("/diagnostics/unesco")
async def unesco_diagnostics(admin=Depends(admin_required)):
    """Diagnostic endpoint to test UNESCO extraction and verify job extraction"""
    from crawler.html_fetch import HTMLCrawler
    
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Find UNESCO source
            cur.execute("""
                SELECT id, org_name, careers_url, source_type, status, parser_hint,
                       last_crawled_at, last_crawl_status, last_crawl_message,
                       consecutive_failures, consecutive_nochange
                FROM sources
                WHERE org_name ILIKE '%UNESCO%' OR careers_url ILIKE '%unesco%'
                ORDER BY created_at DESC
                LIMIT 1
            """)
            source = cur.fetchone()
            
            if not source:
                return {
                    "status": "error",
                    "message": "No UNESCO source found in database"
                }
            
            source_id = source['id']
            careers_url = source['careers_url']
            
            # Test extraction
            db_url = get_db_url()
            crawler = HTMLCrawler(db_url)
            
            # Fetch HTML
            status, headers, html, size = await crawler.fetch_html(careers_url)
            
            if status != 200:
                return {
                    "status": "error",
                    "message": f"Failed to fetch UNESCO page: HTTP {status}",
                    "source": {
                        "id": str(source['id']),
                        "org_name": source['org_name'],
                        "careers_url": source['careers_url']
                    }
                }
            
            # Extract jobs
            parser_hint = source.get('parser_hint')
            extracted_jobs = crawler.extract_jobs(html, careers_url, parser_hint)
            
            # Get existing UNESCO jobs from database
            cur.execute("""
                SELECT id, title, apply_url, fetched_at, last_seen_at
                FROM jobs
                WHERE source_id = %s
                ORDER BY fetched_at DESC
                LIMIT 50
            """, (source_id,))
            existing_jobs = cur.fetchall()
            
            # Analyze extraction results
            extraction_stats = {
                "html_size_bytes": size,
                "jobs_extracted": len(extracted_jobs),
                "has_jobs": len(extracted_jobs) > 0,
                "sample_jobs": [
                    {
                        "title": job.get('title', '')[:100],
                        "apply_url": job.get('apply_url', '')[:150] if job.get('apply_url') else None,
                        "location": job.get('location_raw', '')[:100] if job.get('location_raw') else None
                    }
                    for job in extracted_jobs[:10]
                ]
            }
            
            # Get recent crawl logs
            cur.execute("""
                SELECT id, status, message, duration_ms, stats, created_at
                FROM crawl_logs
                WHERE source_id = %s
                ORDER BY created_at DESC
                LIMIT 5
            """, (source_id,))
            logs = cur.fetchall()
            
            return {
                "status": "ok",
                "source": {
                    "id": str(source['id']),
                    "org_name": source['org_name'],
                    "careers_url": source['careers_url'],
                    "source_type": source['source_type'],
                    "parser_hint": source.get('parser_hint'),
                    "status": source['status'],
                    "last_crawled_at": source['last_crawled_at'].isoformat() if source['last_crawled_at'] else None,
                    "last_crawl_status": source['last_crawl_status'],
                    "last_crawl_message": source['last_crawl_message']
                },
                "extraction_test": extraction_stats,
                "existing_jobs": {
                    "total": len(existing_jobs),
                    "sample": [
                        {
                            "id": str(job['id']),
                            "title": job['title'][:100],
                            "apply_url": job['apply_url'][:150] if job['apply_url'] else None,
                            "fetched_at": job['fetched_at'].isoformat() if job['fetched_at'] else None
                        }
                        for job in existing_jobs[:10]
                    ]
                },
                "recent_logs": [
                    {
                        "id": str(log['id']),
                        "status": log['status'],
                        "message": log['message'],
                        "created_at": log['created_at'].isoformat() if log['created_at'] else None,
                        "stats": log['stats'] if isinstance(log['stats'], dict) else None
                    }
                    for log in logs
                ]
            }
            
    except Exception as e:
        logger.error(f"Error in unesco_diagnostics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get UNESCO diagnostics: {str(e)}")
    finally:
        conn.close()


@router.get("/diagnostics/undp")
async def undp_diagnostics(admin=Depends(admin_required)):
    """Diagnostic endpoint to check UNDP crawl status and verify unique apply_urls"""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Find UNDP source
            cur.execute("""
                SELECT id, org_name, careers_url, source_type, status, parser_hint,
                       last_crawled_at, last_crawl_status, last_crawl_message,
                       consecutive_failures, consecutive_nochange
                FROM sources
                WHERE org_name ILIKE '%UNDP%' OR careers_url ILIKE '%undp%'
                ORDER BY created_at DESC
                LIMIT 1
            """)
            source = cur.fetchone()
            
            if not source:
                return {
                    "status": "error",
                    "message": "No UNDP source found in database"
                }
            
            source_id = source['id']
            
            # Get recent crawl logs
            cur.execute("""
                SELECT id, status, message, duration_ms, stats, created_at
                FROM crawl_logs
                WHERE source_id = %s
                ORDER BY created_at DESC
                LIMIT 5
            """, (source_id,))
            logs = cur.fetchall()
            
            # Get UNDP jobs and check for duplicate apply_urls
            cur.execute("""
                SELECT id, title, apply_url, fetched_at, last_seen_at
                FROM jobs
                WHERE source_id = %s
                ORDER BY fetched_at DESC
                LIMIT 100
            """, (source_id,))
            jobs = cur.fetchall()
            
            # Analyze URL uniqueness
            url_counts = {}
            url_to_titles = {}
            duplicate_urls = []
            
            for job in jobs:
                url = job['apply_url'] or 'NO_URL'
                normalized_url = url.rstrip('/').split('#')[0].split('?')[0]
                
                url_counts[normalized_url] = url_counts.get(normalized_url, 0) + 1
                if normalized_url not in url_to_titles:
                    url_to_titles[normalized_url] = []
                url_to_titles[normalized_url].append(job['title'])
                
                if url_counts[normalized_url] > 1 and normalized_url not in duplicate_urls:
                    duplicate_urls.append(normalized_url)
            
            # Prepare response
            response = {
                "status": "ok",
                "source": {
                    "id": str(source['id']),
                    "org_name": source['org_name'],
                    "careers_url": source['careers_url'],
                    "source_type": source['source_type'],
                    "status": source['status'],
                    "last_crawled_at": source['last_crawled_at'].isoformat() if source['last_crawled_at'] else None,
                    "last_crawl_status": source['last_crawl_status'],
                    "last_crawl_message": source['last_crawl_message'],
                    "consecutive_failures": source['consecutive_failures'],
                    "consecutive_nochange": source['consecutive_nochange']
                },
                "jobs": {
                    "total": len(jobs),
                    "unique_urls": len(set(url.rstrip('/').split('#')[0].split('?')[0] for url in [j['apply_url'] or 'NO_URL' for j in jobs])),
                    "has_duplicates": len(duplicate_urls) > 0,
                    "duplicate_count": len(duplicate_urls),
                    "duplicate_urls": [
                        {
                            "url": url[:100],
                            "count": url_counts[url],
                            "jobs": url_to_titles[url][:3]  # First 3 job titles
                        }
                        for url in duplicate_urls[:5]  # First 5 duplicates
                    ]
                },
                "recent_logs": [
                    {
                        "id": str(log['id']),
                        "status": log['status'],
                        "message": log['message'],
                        "created_at": log['created_at'].isoformat() if log['created_at'] else None,
                        "stats": log['stats'] if isinstance(log['stats'], dict) else None
                    }
                    for log in logs
                ],
                "sample_jobs": [
                    {
                        "id": str(job['id']),
                        "title": job['title'][:100],
                        "apply_url": job['apply_url'][:150] if job['apply_url'] else None,
                        "fetched_at": job['fetched_at'].isoformat() if job['fetched_at'] else None
                    }
                    for job in jobs[:10]
                ]
            }
            
            return response
            
    except Exception as e:
        logger.error(f"Error in undp_diagnostics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get UNDP diagnostics: {str(e)}")
    finally:
        conn.close()


@router.post("/fix-undp-urls")
async def fix_undp_urls(admin=Depends(admin_required)):
    """
    Fix UNDP jobs with incorrect apply_url values by re-extracting and updating.
    This endpoint forces re-extraction of UNDP jobs and updates apply_url for old jobs
    that have incorrect URLs (listing pages, base URLs, or missing unique identifiers).
    """
    from crawler.html_fetch import HTMLCrawler
    
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Find UNDP source
            cur.execute("""
                SELECT id, org_name, careers_url, source_type, parser_hint
                FROM sources
                WHERE org_name ILIKE '%UNDP%' OR careers_url ILIKE '%undp%'
                ORDER BY created_at DESC
                LIMIT 1
            """)
            source = cur.fetchone()
            
            if not source:
                raise HTTPException(status_code=404, detail="No UNDP source found in database")
            
            source_id = source['id']
            careers_url = source['careers_url']
            parser_hint = source.get('parser_hint')
            
            # Get database URL
            db_url = get_db_url()
            crawler = HTMLCrawler(db_url)
            
            # Fetch and extract jobs
            logger.info(f"[fix-undp-urls] Fetching UNDP page: {careers_url}")
            status, headers, html, size = await crawler.fetch_html(careers_url)
            
            if status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to fetch UNDP page: HTTP {status}"
                )
            
            logger.info(f"[fix-undp-urls] Extracting jobs from {size} bytes of HTML")
            extracted_jobs = crawler.extract_jobs(html, careers_url, parser_hint)
            
            if not extracted_jobs:
                return {
                    "status": "error",
                    "message": "No jobs extracted from UNDP page",
                    "html_size": size
                }
            
            # Normalize jobs
            org_name = source.get('org_name') or 'UNDP'
            normalized_jobs = [
                crawler.normalize_job(job, org_name)
                for job in extracted_jobs
            ]
            
            logger.info(f"[fix-undp-urls] Normalized {len(normalized_jobs)} jobs")
            
            # Upsert jobs (this will use the enhanced logic to force URL updates for UNDP)
            upsert_counts = await crawler.upsert_jobs(normalized_jobs, str(source_id))
            
            # Get statistics on fixed jobs
            cur.execute("""
                SELECT 
                    COUNT(*) as total_jobs,
                    COUNT(DISTINCT apply_url) as unique_urls,
                    COUNT(CASE WHEN apply_url IS NULL THEN 1 END) as null_urls,
                    COUNT(CASE 
                        WHEN apply_url LIKE '%/cj_view_consultancies%' 
                        OR apply_url LIKE '%/jobs%'
                        OR apply_url LIKE '%/careers%'
                        OR apply_url LIKE '%/list%'
                        OR apply_url LIKE '%/search%'
                        THEN 1 
                    END) as listing_page_urls
                FROM jobs
                WHERE source_id = %s
            """, (source_id,))
            stats = cur.fetchone()
            
            return {
                "status": "ok",
                "message": f"UNDP URL fix completed",
                "source": {
                    "id": str(source_id),
                    "org_name": source.get('org_name'),
                    "careers_url": careers_url
                },
                "extraction": {
                    "jobs_extracted": len(extracted_jobs),
                    "jobs_normalized": len(normalized_jobs),
                    "html_size_bytes": size
                },
                "upsert": upsert_counts,
                "current_stats": {
                    "total_jobs": stats['total_jobs'],
                    "unique_urls": stats['unique_urls'],
                    "null_urls": stats['null_urls'],
                    "listing_page_urls": stats['listing_page_urls']
                }
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in fix_undp_urls: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fix UNDP URLs: {str(e)}")
    finally:
        conn.close()


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


# Data quality endpoints

@quality_router.get("/source/{source_id}")
async def get_source_quality(source_id: str, admin=Depends(admin_required)):
    """Get data quality report for a specific source"""
    from app.data_quality import DataQualityValidator
    
    db_url = get_db_url()
    validator = DataQualityValidator(db_url)
    
    try:
        report = validator.get_source_quality_report(source_id)
        return {
            "status": "ok",
            "data": report
        }
    except Exception as e:
        logger.error(f"Error in get_source_quality: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get quality report: {str(e)}")


@quality_router.get("/global")
async def get_global_quality(admin=Depends(admin_required)):
    """Get global data quality report across all sources"""
    try:
        from app.data_quality import DataQualityValidator
        
        db_url = get_db_url()
        validator = DataQualityValidator(db_url)
        
        report = validator.get_global_quality_report()
        return {
            "status": "ok",
            "data": report
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_global_quality: {e}", exc_info=True)
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to get global quality report: {str(e)}")


# Crawl analytics endpoints

@router.get("/analytics/overview")
async def get_crawl_analytics_overview(admin=Depends(admin_required)):
    """Get overview of crawl analytics"""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Overall statistics
            cur.execute("""
                SELECT 
                    COUNT(DISTINCT source_id) as total_sources,
                    COUNT(*) as total_crawls,
                    SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as successful_crawls,
                    SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failed_crawls,
                    SUM(CASE WHEN status = 'warn' THEN 1 ELSE 0 END) as warning_crawls,
                    AVG(duration_ms) as avg_duration_ms,
                    SUM(found) as total_jobs_found,
                    SUM(inserted) as total_jobs_inserted,
                    SUM(updated) as total_jobs_updated
                FROM crawl_logs
                WHERE ran_at >= NOW() - INTERVAL '7 days'
            """)
            week_stats = cur.fetchone()
            
            cur.execute("""
                SELECT 
                    COUNT(DISTINCT source_id) as total_sources,
                    COUNT(*) as total_crawls,
                    SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as successful_crawls,
                    SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failed_crawls,
                    SUM(CASE WHEN status = 'warn' THEN 1 ELSE 0 END) as warning_crawls,
                    AVG(duration_ms) as avg_duration_ms,
                    SUM(found) as total_jobs_found,
                    SUM(inserted) as total_jobs_inserted,
                    SUM(updated) as total_jobs_updated
                FROM crawl_logs
                WHERE ran_at >= NOW() - INTERVAL '30 days'
            """)
            month_stats = cur.fetchone()
            
            # Success rate trends (daily for last 7 days)
            cur.execute("""
                SELECT 
                    DATE(ran_at) as date,
                    COUNT(*) as total_crawls,
                    SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as successful_crawls,
                    SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failed_crawls
                FROM crawl_logs
                WHERE ran_at >= NOW() - INTERVAL '7 days'
                GROUP BY DATE(ran_at)
                ORDER BY date DESC
            """)
            daily_trends = cur.fetchall()
            
            # Top sources by activity
            cur.execute("""
                SELECT 
                    s.id,
                    s.org_name,
                    COUNT(*) as crawl_count,
                    SUM(l.found) as total_jobs_found,
                    SUM(l.inserted + l.updated) as total_changes,
                    AVG(l.duration_ms) as avg_duration_ms,
                    SUM(CASE WHEN l.status = 'ok' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as success_rate
                FROM crawl_logs l
                JOIN sources s ON s.id = l.source_id
                WHERE l.ran_at >= NOW() - INTERVAL '7 days'
                GROUP BY s.id, s.org_name
                ORDER BY total_changes DESC
                LIMIT 10
            """)
            top_sources = cur.fetchall()
            
            # Safely convert week_stats and month_stats to dicts with defaults
            def safe_dict(row, defaults):
                if not row:
                    return defaults
                result = dict(row)
                for key, default_val in defaults.items():
                    if result.get(key) is None:
                        result[key] = default_val
                return result
            
            default_stats = {
                "total_sources": 0,
                "total_crawls": 0,
                "successful_crawls": 0,
                "failed_crawls": 0,
                "warning_crawls": 0,
                "avg_duration_ms": 0,
                "total_jobs_found": 0,
                "total_jobs_inserted": 0,
                "total_jobs_updated": 0
            }
            
            return {
                "status": "ok",
                "data": {
                    "last_7_days": safe_dict(week_stats, default_stats),
                    "last_30_days": safe_dict(month_stats, default_stats),
                    "daily_trends": [
                        {
                            "date": trend['date'].isoformat() if trend.get('date') else None,
                            "total_crawls": trend.get('total_crawls', 0) or 0,
                            "successful_crawls": trend.get('successful_crawls', 0) or 0,
                            "failed_crawls": trend.get('failed_crawls', 0) or 0,
                            "success_rate": round((trend.get('successful_crawls', 0) / trend.get('total_crawls', 1) * 100) if trend.get('total_crawls', 0) > 0 else 0, 2)
                        }
                        for trend in (daily_trends or [])
                    ],
                    "top_sources": [
                        {
                            "source_id": str(source.get('id', '')),
                            "org_name": source.get('org_name') or 'Unknown',
                            "crawl_count": source.get('crawl_count', 0) or 0,
                            "total_jobs_found": source.get('total_jobs_found', 0) or 0,
                            "total_changes": source.get('total_changes', 0) or 0,
                            "avg_duration_ms": round(float(source.get('avg_duration_ms', 0) or 0), 2),
                            "success_rate": round(float(source.get('success_rate', 0) or 0), 2)
                        }
                        for source in (top_sources or [])
                    ]
                }
            }
    except Exception as e:
        logger.error(f"Error in get_crawl_analytics_overview: {e}", exc_info=True)
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to get analytics: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.get("/analytics/source/{source_id}")
async def get_source_analytics(source_id: str, admin=Depends(admin_required)):
    """Get analytics for a specific source"""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Get source info
            cur.execute("""
                SELECT id, org_name, careers_url, org_type, status,
                       last_crawled_at, last_crawl_status, consecutive_failures,
                       consecutive_nochange, crawl_frequency_days
                FROM sources
                WHERE id::text = %s
            """, (source_id,))
            source = cur.fetchone()
            
            if not source:
                raise HTTPException(status_code=404, detail="Source not found")
            
            # Get health score
            from app.source_health import SourceHealthScorer
            scorer = SourceHealthScorer(get_db_url())
            health = scorer.calculate_health_score(source_id, dict(source))
            
            # Get crawl history
            cur.execute("""
                SELECT 
                    ran_at, status, message, duration_ms,
                    found, inserted, updated, skipped
                FROM crawl_logs
                WHERE source_id::text = %s
                ORDER BY ran_at DESC
                LIMIT 20
            """, (source_id,))
            crawl_history = cur.fetchall()
            
            # Get statistics
            cur.execute("""
                SELECT 
                    COUNT(*) as total_crawls,
                    SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as successful_crawls,
                    SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failed_crawls,
                    AVG(duration_ms) as avg_duration_ms,
                    SUM(found) as total_jobs_found,
                    SUM(inserted) as total_jobs_inserted,
                    SUM(updated) as total_jobs_updated,
                    MIN(ran_at) as first_crawl,
                    MAX(ran_at) as last_crawl
                FROM crawl_logs
                WHERE source_id::text = %s
            """, (source_id,))
            stats = cur.fetchone()
            
            return {
                "status": "ok",
                "data": {
                    "source": {
                        "id": str(source['id']),
                        "org_name": source['org_name'],
                        "careers_url": source['careers_url'],
                        "org_type": source['org_type'],
                        "status": source['status'],
                        "last_crawled_at": source['last_crawled_at'].isoformat() if source['last_crawled_at'] else None,
                        "last_crawl_status": source['last_crawl_status'],
                        "consecutive_failures": source['consecutive_failures'],
                        "consecutive_nochange": source['consecutive_nochange']
                    },
                    "health": health,
                    "statistics": dict(stats) if stats else {},
                    "recent_crawls": [
                        {
                            "ran_at": crawl['ran_at'].isoformat() if crawl['ran_at'] else None,
                            "status": crawl['status'],
                            "message": crawl['message'],
                            "duration_ms": crawl['duration_ms'],
                            "found": crawl['found'],
                            "inserted": crawl['inserted'],
                            "updated": crawl['updated'],
                            "skipped": crawl['skipped']
                        }
                        for crawl in crawl_history
                    ]
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_source_analytics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get source analytics: {str(e)}")
    finally:
        conn.close()


@router.post("/run-migration")
async def run_deletion_migration(admin: str = Depends(admin_required)):
    """
    Run the job deletion audit migration.
    This creates the audit table, soft delete columns, and impact function.
    Idempotent - safe to run multiple times.
    """
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            results = []
            
            # Step 1: Create audit table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS job_deletion_audit (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
                    deleted_by TEXT NOT NULL,
                    deletion_type TEXT NOT NULL CHECK (deletion_type IN ('hard', 'soft', 'batch')),
                    jobs_count INT NOT NULL,
                    deletion_reason TEXT,
                    metadata JSONB,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            results.append("✅ Created job_deletion_audit table")
            
            # Step 2: Create indexes
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_job_deletion_audit_source_id 
                ON job_deletion_audit(source_id, created_at DESC)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_job_deletion_audit_deleted_by 
                ON job_deletion_audit(deleted_by)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_job_deletion_audit_created_at 
                ON job_deletion_audit(created_at DESC)
            """)
            results.append("✅ Created indexes")
            
            # Step 3: Add soft delete columns
            cur.execute("""
                ALTER TABLE jobs 
                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS deleted_by TEXT,
                ADD COLUMN IF NOT EXISTS deletion_reason TEXT
            """)
            results.append("✅ Added soft delete columns to jobs table")
            
            # Step 4: Create index for soft-deleted jobs
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at 
                ON jobs(deleted_at) 
                WHERE deleted_at IS NOT NULL
            """)
            results.append("✅ Created index for soft-deleted jobs")
            
            # Step 5: Create impact function
            cur.execute("""
                CREATE OR REPLACE FUNCTION get_deletion_impact(source_uuid UUID)
                RETURNS TABLE (
                    total_jobs INT,
                    active_jobs INT,
                    shortlists_count INT,
                    enrichment_reviews_count INT,
                    enrichment_history_count INT,
                    enrichment_feedback_count INT,
                    ground_truth_count INT
                ) AS $$
                BEGIN
                    RETURN QUERY
                    SELECT 
                        COUNT(*)::INT as total_jobs,
                        COUNT(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL)::INT as active_jobs,
                        (SELECT COUNT(*)::INT FROM shortlists s 
                         INNER JOIN jobs j ON s.job_id = j.id 
                         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as shortlists_count,
                        (SELECT COUNT(*)::INT FROM enrichment_reviews er
                         INNER JOIN jobs j ON er.job_id = j.id
                         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as enrichment_reviews_count,
                        (SELECT COUNT(*)::INT FROM enrichment_history eh
                         INNER JOIN jobs j ON eh.job_id = j.id
                         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as enrichment_history_count,
                        (SELECT COUNT(*)::INT FROM enrichment_feedback ef
                         INNER JOIN jobs j ON ef.job_id = j.id
                         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as enrichment_feedback_count,
                        (SELECT COUNT(*)::INT FROM enrichment_ground_truth egt
                         INNER JOIN jobs j ON egt.job_id = j.id
                         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as ground_truth_count
                    FROM jobs
                    WHERE source_id = source_uuid AND deleted_at IS NULL;
                END;
                $$ LANGUAGE plpgsql;
            """)
            results.append("✅ Created get_deletion_impact function")
            
            conn.commit()
            
            # Verify
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'job_deletion_audit'
                )
            """)
            table_exists = cur.fetchone()[0]
            
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM pg_proc 
                    WHERE proname = 'get_deletion_impact'
                )
            """)
            function_exists = cur.fetchone()[0]
            
            logger.info(f"[migration] Job deletion audit migration completed by {admin}")
            
            return {
                "status": "ok",
                "message": "Migration completed successfully",
                "steps": results,
                "verification": {
                    "audit_table_exists": table_exists,
                    "impact_function_exists": function_exists
                }
            }
            
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error in run_deletion_migration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")
    finally:
        conn.close()
