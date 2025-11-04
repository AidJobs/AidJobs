"""
Shortlist API endpoints for managing saved jobs.

Provides server-side persistence for user job shortlists with RLS security.
"""
import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/shortlist", tags=["shortlist"])


class ShortlistToggleResponse(BaseModel):
    saved: bool
    job_id: str


class ShortlistItem(BaseModel):
    id: str
    job_id: str
    created_at: str


@router.post("/{job_id}")
async def toggle_shortlist(job_id: str, user_id: Optional[str] = None) -> dict:
    """
    Toggle a job in the user's shortlist.
    
    Args:
        job_id: UUID of the job to toggle
        user_id: UUID of the user (from auth context)
        
    Returns:
        {saved: bool, job_id: str}
    """
    # For now, without auth, we'll use a placeholder user_id
    # Later this will come from auth.uid() via JWT or session
    if not user_id:
        # Guest mode - return error indicating auth required
        raise HTTPException(
            status_code=401,
            detail="Authentication required for server-side shortlist persistence"
        )
    
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError:
        raise HTTPException(status_code=500, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=2)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check if already saved
        cursor.execute(
            "SELECT id FROM shortlists WHERE user_id = %s AND job_id = %s",
            (user_id, job_id)
        )
        existing = cursor.fetchone()
        
        if existing:
            # Remove from shortlist
            cursor.execute(
                "DELETE FROM shortlists WHERE user_id = %s AND job_id = %s",
                (user_id, job_id)
            )
            conn.commit()
            return {"saved": False, "job_id": job_id}
        else:
            # Add to shortlist
            cursor.execute(
                "INSERT INTO shortlists (user_id, job_id) VALUES (%s, %s)",
                (user_id, job_id)
            )
            conn.commit()
            return {"saved": True, "job_id": job_id}
            
    except Exception as e:
        logger.error(f"Failed to toggle shortlist: {e}")
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to toggle shortlist: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("")
async def get_shortlist(user_id: Optional[str] = None) -> dict:
    """
    Get all saved job IDs for the user.
    
    Args:
        user_id: UUID of the user (from auth context)
        
    Returns:
        {job_ids: [str], items: [{id, job_id, created_at}]}
    """
    if not user_id:
        # Guest mode - return empty list
        return {"job_ids": [], "items": []}
    
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError:
        raise HTTPException(status_code=500, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=2)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute(
            """
            SELECT id, job_id, created_at 
            FROM shortlists 
            WHERE user_id = %s 
            ORDER BY created_at DESC
            """,
            (user_id,)
        )
        rows = cursor.fetchall()
        
        items = []
        job_ids = []
        for row in rows:
            item = dict(row)
            # Convert UUID to string
            if item.get('id'):
                item['id'] = str(item['id'])
            if item.get('job_id'):
                item['job_id'] = str(item['job_id'])
                job_ids.append(str(item['job_id']))
            # Convert timestamp to ISO string
            if item.get('created_at'):
                item['created_at'] = item['created_at'].isoformat()
            items.append(item)
        
        return {"job_ids": job_ids, "items": items}
        
    except Exception as e:
        logger.error(f"Failed to get shortlist: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get shortlist: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
