"""
Sources management endpoints for admin.
"""
import os
import logging
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, HttpUrl, Field
from fastapi import APIRouter, HTTPException, Depends

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

from app.db_config import db_config

logger = logging.getLogger(__name__)
router = APIRouter()


class SourceCreate(BaseModel):
    org_name: Optional[str] = None
    careers_url: str
    source_type: str = "html"
    notes: Optional[str] = None


class SourceUpdate(BaseModel):
    org_name: Optional[str] = None
    careers_url: Optional[str] = None
    source_type: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class Source(BaseModel):
    id: str
    org_name: Optional[str]
    careers_url: str
    source_type: str
    status: str
    last_crawled_at: Optional[str]
    last_crawl_status: Optional[str]
    notes: Optional[str]
    created_at: str
    updated_at: str


def require_dev_mode():
    """Dependency to gate dev-only admin routes."""
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin routes only available in dev mode")


@router.get("/admin/sources")
def list_sources(
    page: int = 1,
    size: int = 20,
    status_filter: Optional[str] = None,
    _: None = Depends(require_dev_mode)
):
    """List all sources with pagination."""
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
        
        # Build query with optional status filter
        where_clause = ""
        params = []
        
        if status_filter:
            where_clause = "WHERE status = %s"
            params.append(status_filter)
        
        # Count total
        count_query = f"SELECT COUNT(*) FROM sources {where_clause}"
        cursor.execute(count_query, params)
        total = cursor.fetchone()['count']
        
        # Fetch paginated results
        query = f"""
            SELECT 
                id::text, org_name, careers_url, source_type, status,
                last_crawled_at, last_crawl_status, notes,
                created_at, updated_at
            FROM sources
            {where_clause}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(query, params + [size, offset])
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
def create_source(source: SourceCreate, _: None = Depends(require_dev_mode)):
    """Create a new source."""
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
            INSERT INTO sources (org_name, careers_url, source_type, notes, status)
            VALUES (%s, %s, %s, %s, 'active')
            RETURNING id::text, org_name, careers_url, source_type, status,
                      last_crawled_at, last_crawl_status, notes,
                      created_at, updated_at
        """, (source.org_name, source.careers_url, source.source_type, source.notes))
        
        created = cursor.fetchone()
        conn.commit()
        
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
def update_source(source_id: str, update: SourceUpdate, _: None = Depends(require_dev_mode)):
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
        
        if update.status is not None:
            updates.append("status = %s")
            params.append(update.status)
        
        if update.notes is not None:
            updates.append("notes = %s")
            params.append(update.notes)
        
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        updates.append("updated_at = NOW()")
        params.append(source_id)
        
        query = f"""
            UPDATE sources
            SET {', '.join(updates)}
            WHERE id = %s
            RETURNING id::text, org_name, careers_url, source_type, status,
                      last_crawled_at, last_crawl_status, notes,
                      created_at, updated_at
        """
        
        cursor.execute(query, params)
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
def delete_source(source_id: str, _: None = Depends(require_dev_mode)):
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
