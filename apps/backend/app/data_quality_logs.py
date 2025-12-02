"""
Data Quality Logging Endpoints

Provides endpoints to view data quality logs and statistics for debugging.
"""

import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException
from psycopg2.extras import RealDictCursor
import psycopg2

from app.db import get_db_conn
from app.auth import admin_required

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/logs")
async def get_data_quality_logs(
    source_id: Optional[str] = Query(None),
    min_score: Optional[int] = Query(None, ge=0, le=100),
    max_score: Optional[int] = Query(None, ge=0, le=100),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    admin=Depends(admin_required)
):
    """
    Get data quality logs for jobs.
    
    Returns jobs with their quality scores and issues for debugging.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build WHERE clause
        where_clauses = []
        params = []
        
        if source_id:
            where_clauses.append("source_id::text = %s")
            params.append(source_id)
        
        if min_score is not None:
            where_clauses.append("data_quality_score >= %s")
            params.append(min_score)
        
        if max_score is not None:
            where_clauses.append("data_quality_score <= %s")
            params.append(max_score)
        
        where_clause = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        # Count total
        count_query = f"SELECT COUNT(*) as count FROM jobs {where_clause}"
        cursor.execute(count_query, params)
        total = cursor.fetchone()['count']
        
        # Pagination
        offset = (page - 1) * size
        
        # Fetch jobs with quality data
        select_query = f"""
            SELECT 
                id::text,
                title,
                org_name,
                source_id::text as source_id,
                data_quality_score,
                data_quality_issues,
                created_at
            FROM jobs
            {where_clause}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(select_query, params + [size, offset])
        jobs = cursor.fetchall()
        
        return {
            "status": "ok",
            "data": {
                "items": [dict(job) for job in jobs],
                "total": total,
                "page": page,
                "size": size,
                "pages": (total + size - 1) // size
            }
        }
    except Exception as e:
        logger.error(f"Error fetching data quality logs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch logs: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/stats")
async def get_data_quality_stats(
    source_id: Optional[str] = Query(None),
    admin=Depends(admin_required)
):
    """
    Get data quality statistics.
    
    Returns aggregate statistics about data quality across all jobs.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build WHERE clause
        where_clause = ""
        params = []
        if source_id:
            where_clause = "WHERE source_id::text = %s"
            params.append(source_id)
        
        # Get statistics
        stats_query = f"""
            SELECT 
                COUNT(*) as total_jobs,
                COUNT(data_quality_score) as jobs_with_score,
                AVG(data_quality_score) as avg_score,
                MIN(data_quality_score) as min_score,
                MAX(data_quality_score) as max_score,
                COUNT(CASE WHEN data_quality_score >= 80 THEN 1 END) as high_quality,
                COUNT(CASE WHEN data_quality_score >= 60 AND data_quality_score < 80 THEN 1 END) as medium_quality,
                COUNT(CASE WHEN data_quality_score < 60 THEN 1 END) as low_quality,
                COUNT(CASE WHEN data_quality_issues IS NOT NULL AND jsonb_array_length(data_quality_issues) > 0 THEN 1 END) as jobs_with_issues
            FROM jobs
            {where_clause}
        """
        cursor.execute(stats_query, params)
        stats = cursor.fetchone()
        
        return {
            "status": "ok",
            "data": dict(stats)
        }
    except Exception as e:
        logger.error(f"Error fetching data quality stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/rejected")
async def get_rejected_jobs(
    source_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    admin=Depends(admin_required)
):
    """
    Get jobs that were rejected during extraction (not in database).
    
    Note: This endpoint shows jobs that were rejected by the validator.
    Since rejected jobs are not inserted, we can't query them directly.
    This endpoint returns jobs with very low quality scores as a proxy.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build WHERE clause - jobs with score 0 or NULL (likely rejected or not validated)
        where_clauses = ["(data_quality_score IS NULL OR data_quality_score = 0)"]
        params = []
        
        if source_id:
            where_clauses.append("source_id::text = %s")
            params.append(source_id)
        
        where_clause = f"WHERE {' AND '.join(where_clauses)}"
        
        # Count total
        count_query = f"SELECT COUNT(*) as count FROM jobs {where_clause}"
        cursor.execute(count_query, params)
        total = cursor.fetchone()['count']
        
        # Pagination
        offset = (page - 1) * size
        
        # Fetch jobs
        select_query = f"""
            SELECT 
                id::text,
                title,
                org_name,
                source_id::text as source_id,
                data_quality_score,
                data_quality_issues,
                created_at
            FROM jobs
            {where_clause}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(select_query, params + [size, offset])
        jobs = cursor.fetchall()
        
        return {
            "status": "ok",
            "data": {
                "items": [dict(job) for job in jobs],
                "total": total,
                "page": page,
                "size": size,
                "pages": (total + size - 1) // size,
                "note": "These are jobs with score 0 or NULL. Actual rejected jobs are not stored in the database."
            }
        }
    except Exception as e:
        logger.error(f"Error fetching rejected jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch rejected jobs: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

