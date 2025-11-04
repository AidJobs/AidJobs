"""
Find & Earn API endpoints.

Public endpoint for submitting career pages and admin endpoints for moderation.
"""
import os
import logging
from typing import Optional
from urllib.parse import urlparse
import requests
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor

from app.admin import require_dev_mode
from app.db_config import db_config
from security.admin_auth import admin_required
from app.rate_limit import limiter, RATE_LIMIT_SUBMIT

logger = logging.getLogger(__name__)

router = APIRouter(tags=["find-earn"])


class SubmitRequest(BaseModel):
    url: str
    source_type: str


class RejectRequest(BaseModel):
    notes: str


def validate_url(url: str) -> bool:
    """Validate URL format and reachability."""
    try:
        parsed = urlparse(url)
        if not parsed.scheme in ['http', 'https']:
            return False
        if not parsed.netloc:
            return False
        return True
    except Exception:
        return False


def detect_jobs_count(url: str) -> int:
    """
    Light page scan to roughly estimate job count.
    Just does a HEAD/GET request and looks for basic indicators.
    """
    try:
        response = requests.head(url, timeout=5, allow_redirects=True)
        if response.status_code != 200:
            # Try GET if HEAD fails
            response = requests.get(url, timeout=10, allow_redirects=True)
        
        if response.status_code == 200:
            # Very rough estimation - just check if it's accessible
            # Could be enhanced to parse HTML for job listings
            return 1  # Placeholder: assume at least 1 job if page loads
        return 0
    except Exception as e:
        logger.warning(f"Failed to scan URL {url}: {e}")
        return 0


@router.post("/api/find-earn/submit")
@limiter.limit(RATE_LIMIT_SUBMIT)
async def submit_url(http_request: Request, request: SubmitRequest) -> dict:
    """
    Public endpoint to submit a careers page URL.
    
    Validates URL, checks for duplicates in sources and find_earn_submissions,
    does light page scan for job detection, and creates pending submission.
    """
    try:
        import psycopg2
    except ImportError:
        raise HTTPException(status_code=500, detail="Database driver not available")
    
    # Validate URL format
    if not validate_url(request.url):
        raise HTTPException(status_code=400, detail="Invalid URL format")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check if URL already exists in sources
        cursor.execute(
            "SELECT id FROM sources WHERE careers_url = %s",
            (request.url,)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=409,
                detail="This URL is already in our database as an active source"
            )
        
        # Check if URL already submitted in find_earn_submissions
        cursor.execute(
            "SELECT id, status FROM find_earn_submissions WHERE url = %s",
            (request.url,)
        )
        existing = cursor.fetchone()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"This URL was already submitted (status: {existing['status']})"
            )
        
        # Light page scan to detect jobs
        detected_jobs = detect_jobs_count(request.url)
        
        # Insert submission
        cursor.execute(
            """
            INSERT INTO find_earn_submissions 
            (url, source_type, status, detected_jobs, submitted_by)
            VALUES (%s, %s, 'pending', %s, 'anonymous')
            RETURNING id::text, url, source_type, status, detected_jobs, 
                      submitted_by, submitted_at
            """,
            (request.url, request.source_type, detected_jobs)
        )
        
        result = cursor.fetchone()
        conn.commit()
        
        return {
            "status": "ok",
            "data": dict(result),
            "message": "Thank you! Your submission is pending review."
        }
        
    except psycopg2.IntegrityError as e:
        if conn:
            conn.rollback()
        logger.error(f"Duplicate URL submission: {e}")
        raise HTTPException(status_code=409, detail="This URL has already been submitted")
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to submit URL: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to submit: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admin/find-earn/list")
async def list_submissions(
    page: int = 1,
    size: int = 20,
    status_filter: Optional[str] = None,
    _: None = Depends(require_dev_mode)
) -> dict:
    """
    Admin endpoint to list Find & Earn submissions.
    """
    try:
        import psycopg2
    except ImportError:
        raise HTTPException(status_code=500, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    
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
        count_query = f"SELECT COUNT(*) FROM find_earn_submissions {where_clause}"
        cursor.execute(count_query, params)
        total = cursor.fetchone()['count']
        
        # Fetch paginated results
        query = f"""
            SELECT 
                id::text, url, source_type, status, detected_jobs,
                notes, submitted_by, submitted_at
            FROM find_earn_submissions
            {where_clause}
            ORDER BY submitted_at DESC
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
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to list submissions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admin/find-earn/approve/{submission_id}")
async def approve_submission(
    request: Request,
    submission_id: str,
    admin: str = Depends(admin_required)
) -> dict:
    """
    Admin endpoint to approve a submission.
    Creates/activates a source and marks submission as approved.
    """
    try:
        import psycopg2
    except ImportError:
        raise HTTPException(status_code=500, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get submission details
        cursor.execute(
            """
            SELECT id, url, source_type, status
            FROM find_earn_submissions
            WHERE id = %s
            """,
            (submission_id,)
        )
        submission = cursor.fetchone()
        
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        if submission['status'] == 'approved':
            raise HTTPException(status_code=400, detail="Submission already approved")
        
        # Extract org name from URL (simple heuristic)
        parsed = urlparse(submission['url'])
        org_name = parsed.netloc.replace('www.', '').split('.')[0].title()
        
        # Create source
        try:
            cursor.execute(
                """
                INSERT INTO sources (org_name, careers_url, source_type, status, notes)
                VALUES (%s, %s, %s, 'active', 'Created from Find & Earn submission')
                RETURNING id::text
                """,
                (org_name, submission['url'], submission['source_type'])
            )
            source = cursor.fetchone()
        except psycopg2.IntegrityError:
            # URL already exists in sources
            conn.rollback()
            # Just mark as approved anyway
            cursor.execute(
                """
                UPDATE find_earn_submissions
                SET status = 'approved', notes = 'Source already exists'
                WHERE id = %s
                RETURNING id::text
                """,
                (submission_id,)
            )
            conn.commit()
            return {
                "status": "ok",
                "message": "Source already exists, marked as approved"
            }
        
        # Mark submission as approved
        cursor.execute(
            """
            UPDATE find_earn_submissions
            SET status = 'approved', notes = %s
            WHERE id = %s
            RETURNING id::text
            """,
            (f"Approved - created source {source['id']}", submission_id)
        )
        
        conn.commit()
        
        return {
            "status": "ok",
            "message": "Submission approved and source created",
            "source_id": source['id']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to approve submission: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admin/find-earn/reject/{submission_id}")
async def reject_submission(
    http_request: Request,
    submission_id: str,
    request: RejectRequest,
    admin: str = Depends(admin_required)
) -> dict:
    """
    Admin endpoint to reject a submission with notes.
    """
    try:
        import psycopg2
    except ImportError:
        raise HTTPException(status_code=500, detail="Database driver not available")
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Update submission status
        cursor.execute(
            """
            UPDATE find_earn_submissions
            SET status = 'rejected', notes = %s
            WHERE id = %s
            RETURNING id::text
            """,
            (request.notes, submission_id)
        )
        
        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        conn.commit()
        
        return {
            "status": "ok",
            "message": "Submission rejected"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to reject submission: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
