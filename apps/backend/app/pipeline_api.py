"""
Read-only API endpoints for extracted jobs from pipeline.

Protected by INTERNAL_API_KEY header token.
"""

import os
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Query, Depends
from pydantic import BaseModel

import psycopg2
from psycopg2.extras import RealDictCursor

from app.db_config import db_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/_internal", tags=["pipeline_internal"])

# Internal API key (required for all endpoints)
INTERNAL_API_KEY = os.getenv('INTERNAL_API_KEY', '')


def verify_internal_api_key(x_internal_api_key: Optional[str] = Header(None)):
    """Verify internal API key."""
    if not INTERNAL_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Internal API not configured (INTERNAL_API_KEY not set)"
        )
    
    if not x_internal_api_key or x_internal_api_key != INTERNAL_API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing internal API key"
        )
    
    return True


def get_db_conn():
    """Get database connection."""
    if not psycopg2:
        raise HTTPException(status_code=503, detail="Database driver not available")
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    return psycopg2.connect(**conn_params, connect_timeout=5)


@router.get("/jobs")
async def list_extracted_jobs(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    source_id: Optional[str] = Query(None),
    shadow_mode: bool = Query(False),
    _: bool = Depends(verify_internal_api_key)
):
    """
    List extracted jobs (read-only).
    
    Returns jobs in ExtractionResult schema format.
    """
    conn = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Determine table name
        table_name = "jobs_side" if shadow_mode else "jobs"
        
        # Build query
        query = f"""
            SELECT 
                id, title, org_name, location_raw, deadline, apply_url,
                description_snippet, canonical_hash, source_id,
                created_at, updated_at, fetched_at
            FROM {table_name}
            WHERE status = 'active'
        """
        params = []
        
        if source_id:
            query += " AND source_id::text = %s"
            params.append(source_id)
        
        query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # Convert to ExtractionResult-like format
        jobs = []
        for row in rows:
            job = {
                "url": row.get('apply_url', ''),
                "canonical_id": row.get('canonical_hash', ''),
                "extracted_at": row.get('fetched_at').isoformat() if row.get('fetched_at') else None,
                "pipeline_version": "1.0.0",
                "fields": {
                    "title": {
                        "value": row.get('title'),
                        "source": "database",
                        "confidence": 1.0,
                        "raw_snippet": None
                    },
                    "employer": {
                        "value": row.get('org_name'),
                        "source": "database",
                        "confidence": 1.0,
                        "raw_snippet": None
                    },
                    "location": {
                        "value": row.get('location_raw'),
                        "source": "database",
                        "confidence": 1.0,
                        "raw_snippet": None
                    },
                    "deadline": {
                        "value": row.get('deadline').isoformat() if row.get('deadline') else None,
                        "source": "database",
                        "confidence": 1.0,
                        "raw_snippet": None
                    },
                    "description": {
                        "value": row.get('description_snippet'),
                        "source": "database",
                        "confidence": 1.0,
                        "raw_snippet": None
                    },
                    "application_url": {
                        "value": row.get('apply_url'),
                        "source": "database",
                        "confidence": 1.0,
                        "raw_snippet": None
                    }
                },
                "is_job": True,
                "classifier_score": 1.0,
                "dedupe_hash": row.get('canonical_hash', '')
            }
            jobs.append(job)
        
        # Get total count
        count_query = f"SELECT COUNT(*) FROM {table_name} WHERE status = 'active'"
        if source_id:
            count_query += " AND source_id::text = %s"
            cursor.execute(count_query, [source_id])
        else:
            cursor.execute(count_query)
        total = cursor.fetchone()[0]
        
        return {
            "status": "ok",
            "data": {
                "items": jobs,
                "total": total,
                "limit": limit,
                "offset": offset,
                "shadow_mode": shadow_mode
            }
        }
    
    except Exception as e:
        logger.error(f"Error listing extracted jobs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/jobs/{job_id}")
async def get_extracted_job(
    job_id: str,
    shadow_mode: bool = Query(False),
    _: bool = Depends(verify_internal_api_key)
):
    """
    Get a single extracted job by ID (read-only).
    
    Returns job in ExtractionResult schema format.
    """
    conn = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Determine table name
        table_name = "jobs_side" if shadow_mode else "jobs"
        
        cursor.execute(
            f"""
            SELECT 
                id, title, org_name, location_raw, deadline, apply_url,
                description_snippet, canonical_hash, source_id,
                created_at, updated_at, fetched_at
            FROM {table_name}
            WHERE id::text = %s AND status = 'active'
            """,
            (job_id,)
        )
        
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Convert to ExtractionResult-like format
        job = {
            "url": row.get('apply_url', ''),
            "canonical_id": row.get('canonical_hash', ''),
            "extracted_at": row.get('fetched_at').isoformat() if row.get('fetched_at') else None,
            "pipeline_version": "1.0.0",
            "fields": {
                "title": {
                    "value": row.get('title'),
                    "source": "database",
                    "confidence": 1.0,
                    "raw_snippet": None
                },
                "employer": {
                    "value": row.get('org_name'),
                    "source": "database",
                    "confidence": 1.0,
                    "raw_snippet": None
                },
                "location": {
                    "value": row.get('location_raw'),
                    "source": "database",
                    "confidence": 1.0,
                    "raw_snippet": None
                },
                "deadline": {
                    "value": row.get('deadline').isoformat() if row.get('deadline') else None,
                    "source": "database",
                    "confidence": 1.0,
                    "raw_snippet": None
                },
                "description": {
                    "value": row.get('description_snippet'),
                    "source": "database",
                    "confidence": 1.0,
                    "raw_snippet": None
                },
                "application_url": {
                    "value": row.get('apply_url'),
                    "source": "database",
                    "confidence": 1.0,
                    "raw_snippet": None
                }
            },
            "is_job": True,
            "classifier_score": 1.0,
            "dedupe_hash": row.get('canonical_hash', '')
        }
        
        return {
            "status": "ok",
            "data": job
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting extracted job: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

