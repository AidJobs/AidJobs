"""
Enterprise-Grade Job Management API

Provides comprehensive job search, filtering, bulk operations, and deletion capabilities.
Works even when sources are deleted.
"""
import os
import logging
import json
import traceback
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query  # pyright: ignore[reportMissingImports]
from pydantic import BaseModel  # type: ignore
import psycopg2  # type: ignore
from psycopg2.extras import RealDictCursor  # type: ignore

from security.admin_auth import admin_required
from app.db_config import db_config

logger = logging.getLogger(__name__)

# Try to import Meilisearch for index updates
try:
    import meilisearch  # type: ignore[reportMissingImports]
    MEILISEARCH_AVAILABLE = True
except ImportError:
    meilisearch = None  # type: ignore[assignment]
    MEILISEARCH_AVAILABLE = False

router = APIRouter(prefix="/api/admin/jobs", tags=["job_management"])


def get_db_conn():
    """Get database connection"""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    return psycopg2.connect(**conn_params, connect_timeout=5)


# Request Models
class JobSearchRequest(BaseModel):
    query: Optional[str] = None
    org_name: Optional[str] = None
    source_id: Optional[str] = None
    status: Optional[str] = None  # 'active', 'deleted', 'all'
    include_deleted: bool = False
    date_from: Optional[str] = None  # ISO format date
    date_to: Optional[str] = None  # ISO format date
    page: int = 1
    size: int = 50
    sort_by: Optional[str] = None  # 'created_at', 'deadline', 'title', 'org_name'
    sort_order: Optional[str] = 'desc'  # 'asc' or 'desc'


class BulkDeleteRequest(BaseModel):
    job_ids: Optional[List[str]] = None
    org_name: Optional[str] = None
    source_id: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    deletion_type: str = "soft"  # "soft" or "hard"
    deletion_reason: Optional[str] = None
    export_data: bool = False
    dry_run: bool = False


class RestoreRequest(BaseModel):
    job_ids: List[str]


class ExportRequest(BaseModel):
    job_ids: Optional[List[str]] = None
    org_name: Optional[str] = None
    source_id: Optional[str] = None
    format: str = "json"  # "json" or "csv"


# Endpoints

@router.get("/search")
async def search_jobs(
    query: Optional[str] = Query(None),
    org_name: Optional[str] = Query(None),
    source_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query('desc'),
    admin=Depends(admin_required)
):
    """
    Search and filter jobs with pagination.
    Works even when sources are deleted.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build WHERE clause
        where_clauses = []
        params = []
        
        # Status filter
        if status == 'active':
            where_clauses.append("status = 'active'")
            where_clauses.append("(deleted_at IS NULL)")
        elif status == 'deleted':
            where_clauses.append("(deleted_at IS NOT NULL)")
        elif not include_deleted:
            where_clauses.append("(deleted_at IS NULL)")
        
        # Search query (title, org_name, description)
        if query:
            where_clauses.append("(title ILIKE %s OR org_name ILIKE %s OR description_snippet ILIKE %s)")
            search_param = f"%{query}%"
            params.extend([search_param, search_param, search_param])
        
        # Organization name filter
        if org_name:
            where_clauses.append("org_name ILIKE %s")
            params.append(f"%{org_name}%")
        
        # Source ID filter
        if source_id:
            where_clauses.append("source_id::text = %s")
            params.append(source_id)
        
        # Date range filters
        if date_from:
            where_clauses.append("created_at >= %s")
            params.append(date_from)
        
        if date_to:
            where_clauses.append("created_at <= %s")
            params.append(date_to)
        
        where_clause = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        # Count total
        count_query = f"SELECT COUNT(*) as count FROM jobs {where_clause}"
        cursor.execute(count_query, params)
        total = cursor.fetchone()['count']
        
        # Sort
        valid_sort_fields = ['created_at', 'deadline', 'title', 'org_name', 'fetched_at']
        sort_field = sort_by if sort_by in valid_sort_fields else 'created_at'
        sort_dir = 'DESC' if sort_order.lower() == 'desc' else 'ASC'
        order_by = f"ORDER BY {sort_field} {sort_dir}"
        
        # Pagination
        offset = (page - 1) * size
        
        # Fetch jobs
        select_query = f"""
            SELECT 
                id::text,
                title,
                org_name,
                location_raw,
                country_iso,
                level_norm,
                deadline,
                apply_url,
                status,
                source_id::text as source_id,
                created_at,
                fetched_at,
                deleted_at,
                deleted_by,
                deletion_reason
            FROM jobs
            {where_clause}
            {order_by}
            LIMIT %s OFFSET %s
        """
        cursor.execute(select_query, params + [size, offset])
        jobs = cursor.fetchall()
        
        # Get source info for jobs (even if source is deleted)
        source_ids = list(set([job['source_id'] for job in jobs if job['source_id']]))
        source_info = {}
        if source_ids:
            placeholders = ','.join(['%s'] * len(source_ids))
            cursor.execute(f"""
                SELECT id::text, org_name, careers_url, status
                FROM sources
                WHERE id::text IN ({placeholders})
            """, source_ids)
            sources = cursor.fetchall()
            source_info = {s['id']: s for s in sources}
        
        # Format response
        items = []
        for job in jobs:
            job_dict = dict(job)
            source_id = job_dict.get('source_id')
            if source_id and source_id in source_info:
                job_dict['source'] = dict(source_info[source_id])
            else:
                job_dict['source'] = None  # Source doesn't exist or is deleted
            items.append(job_dict)
        
        return {
            "status": "ok",
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "size": size,
                "pages": (total + size - 1) // size
            }
        }
    except Exception as e:
        logger.error(f"Error searching jobs: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to search jobs: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/impact-analysis")
async def get_deletion_impact(
    request: BulkDeleteRequest,
    admin=Depends(admin_required)
):
    """
    Analyze the impact of a potential deletion before executing it.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build WHERE clause for jobs to be deleted
        where_clauses = []
        params = []
        
        if request.job_ids:
            placeholders = ','.join(['%s'] * len(request.job_ids))
            where_clauses.append(f"id::text IN ({placeholders})")
            params.extend(request.job_ids)
        elif request.org_name:
            where_clauses.append("org_name ILIKE %s")
            params.append(f"%{request.org_name}%")
        elif request.source_id:
            where_clauses.append("source_id::text = %s")
            params.append(request.source_id)
        
        if request.date_from:
            where_clauses.append("created_at >= %s")
            params.append(request.date_from)
        
        if request.date_to:
            where_clauses.append("created_at <= %s")
            params.append(request.date_to)
        
        # Only count non-deleted jobs
        where_clauses.append("deleted_at IS NULL")
        
        where_clause = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else "WHERE deleted_at IS NULL"
        
        # Count affected jobs
        cursor.execute(f"SELECT COUNT(*) as count FROM jobs {where_clause}", params)
        total_jobs = cursor.fetchone()['count']
        
        # Count active jobs
        cursor.execute(f"SELECT COUNT(*) as count FROM jobs {where_clause} AND status = 'active'", params)
        active_jobs = cursor.fetchone()['count']
        
        # Count related data (shortlists, enrichment, etc.)
        if request.job_ids:
            placeholders = ','.join(['%s'] * len(request.job_ids))
            shortlist_query = f"SELECT COUNT(*) as count FROM shortlists WHERE job_id::text IN ({placeholders})"
            cursor.execute(shortlist_query, request.job_ids)
        else:
            # For org_name or source_id, we need to get job IDs first
            cursor.execute(f"SELECT id::text FROM jobs {where_clause} LIMIT 1000", params)
            job_ids = [row['id'] for row in cursor.fetchall()]
            if job_ids:
                placeholders = ','.join(['%s'] * len(job_ids))
                shortlist_query = f"SELECT COUNT(*) as count FROM shortlists WHERE job_id::text IN ({placeholders})"
                cursor.execute(shortlist_query, job_ids)
            else:
                shortlist_query = "SELECT 0 as count"
                cursor.execute(shortlist_query)
        
        shortlists_count = cursor.fetchone()['count']
        
        return {
            "status": "ok",
            "data": {
                "total_jobs": total_jobs,
                "active_jobs": active_jobs,
                "deleted_jobs": total_jobs - active_jobs,
                "shortlists_count": shortlists_count,
                "enrichment_history_count": 0,  # TODO: Add if enrichment_history table exists
                "ground_truth_count": 0,  # TODO: Add if ground_truth table exists
                "risk_level": "high" if total_jobs > 1000 or shortlists_count > 100 else "medium" if total_jobs > 100 else "low"
            }
        }
    except Exception as e:
        logger.error(f"Error analyzing deletion impact: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to analyze impact: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/delete-bulk")
async def bulk_delete_jobs(
    request: BulkDeleteRequest,
    admin=Depends(admin_required)
):
    """
    Bulk delete jobs with comprehensive options.
    Works even when sources are deleted.
    """
    import traceback
    
    logger.info(f"[bulk_delete] Received deletion request: type={request.deletion_type}, job_ids={len(request.job_ids) if request.job_ids else 0}, org_name={request.org_name}, source_id={request.source_id}, admin={admin}")
    
    conn = None
    cursor = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        logger.info("[bulk_delete] Database connection established")
        
        # Validate that at least one filter is provided to prevent accidental deletion of all jobs
        if not request.job_ids and not request.org_name and not request.source_id:
            raise HTTPException(
                status_code=400,
                detail="At least one filter is required: job_ids, org_name, or source_id"
            )
        
        # Build WHERE clause
        where_clauses = []
        params = []
        
        if request.job_ids:
            if not isinstance(request.job_ids, list) or len(request.job_ids) == 0:
                raise HTTPException(status_code=400, detail="job_ids must be a non-empty array")
            
            # Validate job IDs exist and log details
            # Ensure all IDs are strings for consistent comparison
            job_ids_str = [str(jid).strip() for jid in request.job_ids]
            placeholders = ','.join(['%s'] * len(job_ids_str))
            
            check_query = f"""
                SELECT id::text, title, deleted_at, status
                FROM jobs 
                WHERE id::text = ANY(ARRAY[{placeholders}]::text[])
            """
            
            logger.info(f"[bulk_delete] Checking if {len(job_ids_str)} job IDs exist in database...")
            logger.info(f"[bulk_delete] Sample job IDs: {job_ids_str[:3]}")
            logger.info(f"[bulk_delete] Sample job ID types: {[type(id).__name__ for id in job_ids_str[:3]]}")
            
            cursor.execute(check_query, job_ids_str)
            existing_jobs = cursor.fetchall()
            existing_ids = [row['id'] for row in existing_jobs]
            logger.info(f"[bulk_delete] Found {len(existing_ids)} existing jobs in database")
            already_deleted = [row['id'] for row in existing_jobs if row.get('deleted_at')]
            
            logger.info(f"[bulk_delete] Requested {len(request.job_ids)} job IDs")
            logger.info(f"[bulk_delete] Found {len(existing_ids)} existing jobs in database")
            if len(existing_ids) > 0:
                logger.info(f"[bulk_delete] Sample existing jobs: {[{'id': r['id'], 'title': r.get('title', '')[:30], 'deleted_at': r.get('deleted_at'), 'status': r.get('status')} for r in existing_jobs[:3]]}")
            if already_deleted:
                if request.deletion_type == "hard":
                    logger.info(f"[bulk_delete] {len(already_deleted)} jobs are soft-deleted but will be hard-deleted: {already_deleted[:5]}")
                else:
                    logger.info(f"[bulk_delete] {len(already_deleted)} jobs are already deleted and will be skipped: {already_deleted[:5]}")
            if len(existing_ids) < len(request.job_ids):
                missing = set(request.job_ids) - set(existing_ids)
                logger.warning(f"[bulk_delete] {len(missing)} job IDs not found in database: {list(missing)[:5]}")
            
            # Only add to WHERE clause if we have existing jobs (for hard delete, include even deleted ones)
            if len(existing_ids) == 0:
                logger.error(f"[bulk_delete] None of the requested job IDs exist! Cannot proceed with deletion.")
                return {
                    "status": "ok",
                    "data": {
                        "deleted_count": 0,
                        "deleted_ids": [],
                        "deletion_type": request.deletion_type,
                        "exported_data": None,
                        "message": f"None of the {len(request.job_ids)} requested job IDs exist in the database."
                    }
                }
            
            # Use text array comparison - ensures consistent matching
            # Convert all IDs to strings and use text array
            job_ids_str = [str(jid).strip() for jid in request.job_ids]
            placeholders = ','.join(['%s'] * len(job_ids_str))
            where_clauses.append(f"id::text = ANY(ARRAY[{placeholders}]::text[])")
            params.extend(job_ids_str)
        elif request.org_name:
            if not request.org_name.strip():
                raise HTTPException(status_code=400, detail="org_name cannot be empty")
            where_clauses.append("org_name ILIKE %s")
            params.append(f"%{request.org_name}%")
        elif request.source_id:
            if not request.source_id.strip():
                raise HTTPException(status_code=400, detail="source_id cannot be empty")
            where_clauses.append("source_id::text = %s")
            params.append(request.source_id)
        
        if request.date_from:
            where_clauses.append("created_at >= %s")
            params.append(request.date_from)
        
        if request.date_to:
            where_clauses.append("created_at <= %s")
            params.append(request.date_to)
        
        # For soft delete, only delete non-deleted jobs
        # For hard delete, we can delete even already soft-deleted jobs
        if request.deletion_type == "soft":
            where_clauses.append("deleted_at IS NULL")
        
        where_clause = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        logger.info(f"[bulk_delete] WHERE clause: {where_clause}")
        logger.info(f"[bulk_delete] Params: {params}")
        logger.info(f"[bulk_delete] Deletion type: {request.deletion_type}")
        
        # First, check how many jobs match the criteria (for debugging)
        # Also check if jobs exist at all (without WHERE clause filters)
        total_existing = 0
        if request.job_ids:
            job_ids_str = [str(jid).strip() for jid in request.job_ids]
            placeholders = ','.join(['%s'] * len(job_ids_str))
            check_all_query = f"SELECT COUNT(*) as count FROM jobs WHERE id::text = ANY(ARRAY[{placeholders}]::text[])"
            cursor.execute(check_all_query, job_ids_str)
            total_existing = cursor.fetchone()['count']
            logger.info(f"[bulk_delete] Total jobs with these IDs (including deleted): {total_existing}")
        
        if where_clause:
            cursor.execute(f"SELECT COUNT(*) as count FROM jobs {where_clause}", params)
        else:
            cursor.execute("SELECT COUNT(*) as count FROM jobs", [])
        matching_count = cursor.fetchone()['count']
        logger.info(f"[bulk_delete] Found {matching_count} jobs matching deletion criteria (with WHERE clause)")
        
        # If we have job_ids and matching_count is 0, check what's wrong
        if request.job_ids and matching_count == 0:
            if total_existing > 0:
                logger.warning(f"[bulk_delete] Jobs exist but don't match WHERE clause!")
                logger.warning(f"[bulk_delete] This suggests the WHERE clause is filtering them out")
                # Check if they're soft-deleted
                job_ids_str = [str(jid).strip() for jid in request.job_ids]
                placeholders = ','.join(['%s'] * len(job_ids_str))
                check_deleted_query = f"SELECT id::text, deleted_at FROM jobs WHERE id::text = ANY(ARRAY[{placeholders}]::text[])"
                cursor.execute(check_deleted_query, job_ids_str)
                job_statuses = cursor.fetchall()
                for job in job_statuses:
                    logger.warning(f"[bulk_delete] Job {job['id']}: deleted_at={job.get('deleted_at')}")
            else:
                logger.warning(f"[bulk_delete] None of the requested job IDs exist in the database!")
                logger.warning(f"[bulk_delete] Requested IDs: {request.job_ids[:5]}...")
        
        if matching_count == 0:
            logger.warning(f"[bulk_delete] No jobs match the deletion criteria. WHERE: {where_clause}, params: {params}")
            # Still return success but with 0 count
            return {
                "status": "ok",
                "data": {
                    "deleted_count": 0,
                    "deleted_ids": [],
                    "deletion_type": request.deletion_type,
                    "exported_data": None,
                    "message": "No jobs matched the deletion criteria. They may have already been deleted or the filters did not match any jobs."
                }
            }
        
        # Dry run - just count
        if request.dry_run:
            cursor.execute(f"SELECT COUNT(*) as count FROM jobs {where_clause}", params)
            count = cursor.fetchone()['count']
            return {
                "status": "ok",
                "data": {
                    "dry_run": True,
                    "jobs_to_delete": count,
                    "message": f"Dry run: Would delete {count} jobs"
                }
            }
        
        # Export data if requested
        exported_data = None
        if request.export_data:
            cursor.execute(f"""
                SELECT id::text, title, org_name, apply_url, location_raw, deadline, 
                       created_at, fetched_at, source_id::text as source_id
                FROM jobs
                {where_clause}
                LIMIT 10000
            """, params)
            exported_jobs = cursor.fetchall()
            exported_data = [dict(job) for job in exported_jobs]
        
        # Perform deletion
        if request.deletion_type == "hard":
            if not request.deletion_reason or not request.deletion_reason.strip():
                raise HTTPException(status_code=400, detail="Deletion reason is required for hard delete")
            
            # Hard delete - actually remove from database
            # Note: Hard delete can delete even already soft-deleted jobs
            logger.info(f"[bulk_delete] Performing hard delete with WHERE: {where_clause}, params: {params}")
            if where_clause:
                cursor.execute(f"DELETE FROM jobs {where_clause} RETURNING id::text", params)
            else:
                # This should never happen due to validation, but handle it
                raise HTTPException(status_code=400, detail="Cannot hard delete all jobs - filter required")
            deleted_ids = [row['id'] for row in cursor.fetchall()]
            deleted_count = len(deleted_ids)
            logger.info(f"[bulk_delete] Hard deleted {deleted_count} jobs: {deleted_ids[:10]}")
        else:
            # Soft delete
            deletion_reason = request.deletion_reason or "Bulk deletion via admin"
            logger.info(f"[bulk_delete] Performing soft delete with WHERE: {where_clause}, reason: {deletion_reason[:50]}, params count: {len(params)}")
            
            # Build the full parameter list: deletion_reason first (for SET clause), then WHERE params
            full_params = [deletion_reason] + params
            logger.info(f"[bulk_delete] Full params: deletion_reason='{deletion_reason[:30]}...', WHERE params={params[:5] if len(params) > 5 else params}")
            
            # Execute soft delete
            cursor.execute(f"""
                UPDATE jobs
                SET deleted_at = NOW(),
                    deleted_by = 'admin',
                    deletion_reason = %s
                {where_clause}
                RETURNING id::text
            """, full_params)
            deleted_ids = [row['id'] for row in cursor.fetchall()]
            deleted_count = len(deleted_ids)
            logger.info(f"[bulk_delete] Soft deleted {deleted_count} jobs: {deleted_ids[:10] if deleted_ids else 'none'}")
            
            if deleted_count == 0:
                logger.warning(f"[bulk_delete] No jobs were deleted! WHERE clause: {where_clause}, params: {params}")
        
        conn.commit()
        
        # Remove deleted jobs from Meilisearch index (both hard and soft deletes)
        # Soft-deleted jobs should also be removed from search since they're filtered out
        if deleted_ids and MEILISEARCH_AVAILABLE:
            try:
                meili_host = os.getenv("MEILISEARCH_URL") or os.getenv("MEILI_HOST")
                meili_key = os.getenv("MEILISEARCH_KEY") or os.getenv("MEILI_API_KEY")
                meili_index_name = os.getenv("MEILI_JOBS_INDEX", "jobs_index")
                
                if meili_host and meili_key and meilisearch:
                    client = meilisearch.Client(meili_host, meili_key)  # type: ignore[union-attr]
                    index = client.index(meili_index_name)
                    
                    # Delete in batches of 100 (Meilisearch limit)
                    batch_size = 100
                    for i in range(0, len(deleted_ids), batch_size):
                        batch = deleted_ids[i:i + batch_size]
                        try:
                            index.delete_documents(batch)
                            logger.info(f"Deleted {len(batch)} jobs from Meilisearch index")
                        except Exception as e:
                            logger.warning(f"Failed to delete some jobs from Meilisearch: {e}")
                            # Continue with other batches even if one fails
            except Exception as e:
                logger.warning(f"Failed to update Meilisearch after deletion: {e}")
                # Don't fail the entire operation if Meilisearch update fails
        
        logger.info(f"[bulk_delete] Bulk deleted {deleted_count} jobs (type: {request.deletion_type})")
        
        # If no jobs were deleted, return a warning but still success (might be expected)
        if deleted_count == 0:
            logger.warning(f"[bulk_delete] WARNING: No jobs were deleted. This might indicate:")
            logger.warning(f"[bulk_delete]   - Jobs were already deleted")
            logger.warning(f"[bulk_delete]   - WHERE clause did not match any jobs")
            logger.warning(f"[bulk_delete]   - Jobs were filtered out by deleted_at IS NULL check")
        
        return {
            "status": "ok",
            "data": {
                "deleted_count": deleted_count,
                "deleted_ids": deleted_ids[:100],  # Limit to first 100 IDs
                "deletion_type": request.deletion_type,
                "exported_data": exported_data,
                "message": f"Successfully {request.deletion_type}-deleted {deleted_count} jobs" if deleted_count > 0 else "No jobs were deleted (they may have already been deleted or did not match the filters)"
            }
        }
    except HTTPException:
        raise
    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        error_msg = f"Database error: {str(e)}"
        logger.error(f"[bulk_delete] {error_msg}")
        logger.error(traceback.format_exc())
        # Check if it's a column missing error
        if "column" in str(e).lower() and "does not exist" in str(e).lower():
            raise HTTPException(
                status_code=500,
                detail="Database schema error: Missing deletion columns. Please run migration to add deleted_at, deleted_by, deletion_reason columns."
            )
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        if conn:
            conn.rollback()
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(f"[bulk_delete] {error_msg}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=error_msg)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/restore")
async def restore_jobs(
    request: RestoreRequest,
    admin=Depends(admin_required)
):
    """
    Restore soft-deleted jobs.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        placeholders = ','.join(['%s'] * len(request.job_ids))
        cursor.execute(f"""
            UPDATE jobs
            SET deleted_at = NULL,
                deleted_by = NULL,
                deletion_reason = NULL
            WHERE id::text IN ({placeholders})
            AND deleted_at IS NOT NULL
            RETURNING id::text
        """, request.job_ids)
        
        restored_ids = [row['id'] for row in cursor.fetchall()]
        restored_count = len(restored_ids)
        
        conn.commit()
        
        return {
            "status": "ok",
            "data": {
                "restored_count": restored_count,
                "restored_ids": restored_ids,
                "message": f"Successfully restored {restored_count} jobs"
            }
        }
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error restoring jobs: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to restore jobs: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/export")
async def export_jobs(
    request: ExportRequest,
    admin=Depends(admin_required)
):
    """
    Export jobs to JSON or CSV format.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build WHERE clause
        where_clauses = []
        params = []
        
        if request.job_ids:
            placeholders = ','.join(['%s'] * len(request.job_ids))
            where_clauses.append(f"id::text IN ({placeholders})")
            params.extend(request.job_ids)
        elif request.org_name:
            where_clauses.append("org_name ILIKE %s")
            params.append(f"%{request.org_name}%")
        elif request.source_id:
            where_clauses.append("source_id::text = %s")
            params.append(request.source_id)
        
        where_clause = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        # Fetch jobs (limit to 10000 for performance)
        cursor.execute(f"""
            SELECT 
                id::text,
                title,
                org_name,
                location_raw,
                country_iso,
                level_norm,
                deadline,
                apply_url,
                description_snippet,
                status,
                source_id::text as source_id,
                created_at,
                fetched_at
            FROM jobs
            {where_clause}
            ORDER BY created_at DESC
            LIMIT 10000
        """, params)
        
        jobs = [dict(row) for row in cursor.fetchall()]
        
        if request.format == "csv":
            import csv
            import io
            output = io.StringIO()
            if jobs:
                writer = csv.DictWriter(output, fieldnames=jobs[0].keys())
                writer.writeheader()
                writer.writerows(jobs)
            csv_content = output.getvalue()
            return {
                "status": "ok",
                "data": {
                    "format": "csv",
                    "content": csv_content,
                    "count": len(jobs)
                }
            }
        else:
            return {
                "status": "ok",
                "data": {
                    "format": "json",
                    "jobs": jobs,
                    "count": len(jobs)
                }
            }
    except Exception as e:
        logger.error(f"Error exporting jobs: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to export jobs: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

