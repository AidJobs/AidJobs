"""
Enrichment Review Queue Service.
Handles quality assurance for low-confidence enrichments.
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import json

from app.db_config import db_config

logger = logging.getLogger(__name__)


def auto_flag_job_for_review(job_id: str, enrichment_data: Dict[str, Any]) -> bool:
    """
    Automatically flag a job for review based on enrichment quality.
    
    Flags jobs when:
    - confidence_overall < 0.60
    - experience_confidence < 0.65
    - impact_domain confidence < 0.70
    - description < 100 chars
    - low_confidence flag is True
    
    Returns True if flagged, False otherwise.
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_review] Database not configured")
        return False
    
    # Check if should be flagged
    should_flag = False
    flag_reasons = []
    
    confidence_overall = enrichment_data.get("confidence_overall", 1.0)
    experience_confidence = enrichment_data.get("experience_confidence", 1.0)
    impact_confidences = enrichment_data.get("impact_confidences", {})
    low_confidence = enrichment_data.get("low_confidence", False)
    
    if confidence_overall < 0.60:
        should_flag = True
        flag_reasons.append(f"overall confidence {confidence_overall:.2f} < 0.60")
    
    if experience_confidence and experience_confidence < 0.65:
        should_flag = True
        flag_reasons.append(f"experience confidence {experience_confidence:.2f} < 0.65")
    
    # Check impact domain confidences
    if impact_confidences:
        max_domain_confidence = max(impact_confidences.values(), default=0.0)
        if max_domain_confidence < 0.70:
            should_flag = True
            flag_reasons.append(f"max impact_domain confidence {max_domain_confidence:.2f} < 0.70")
    
    if low_confidence:
        should_flag = True
        flag_reasons.append("low_confidence flag set")
    
    if not should_flag:
        return False
    
    conn = None
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check if review already exists
        cursor.execute("""
            SELECT id FROM enrichment_reviews 
            WHERE job_id = %s AND status = 'pending'
        """, (job_id,))
        
        existing = cursor.fetchone()
        if existing:
            logger.debug(f"[enrichment_review] Review already exists for job {job_id}")
            cursor.close()
            conn.close()
            return True
        
        # Create review entry
        cursor.execute("""
            INSERT INTO enrichment_reviews (
                job_id, status, original_enrichment, review_notes
            ) VALUES (
                %s, 'pending', %s::jsonb, %s
            )
        """, (
            job_id,
            json.dumps(enrichment_data),
            f"Auto-flagged: {', '.join(flag_reasons)}"
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"[enrichment_review] Auto-flagged job {job_id} for review: {', '.join(flag_reasons)}")
        return True
        
    except Exception as e:
        logger.error(f"[enrichment_review] Failed to flag job {job_id} for review: {e}", exc_info=True)
        if conn:
            conn.rollback()
            conn.close()
        return False


def get_review_queue(
    status: str = "pending",
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Get jobs in the review queue.
    
    Returns list of review entries with job details.
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_review] Database not configured")
        return []
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT 
                er.id,
                er.job_id,
                er.status,
                er.review_notes,
                er.original_enrichment,
                er.corrected_enrichment,
                er.created_at,
                er.reviewed_at,
                j.title,
                j.org_name,
                j.description_snippet,
                j.confidence_overall,
                j.experience_level,
                j.impact_domain,
                j.low_confidence_reason
            FROM enrichment_reviews er
            JOIN jobs j ON er.job_id = j.id
            WHERE er.status = %s
            ORDER BY er.created_at ASC
            LIMIT %s OFFSET %s
        """, (status, limit, offset))
        
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"[enrichment_review] Failed to get review queue: {e}", exc_info=True)
        return []


def update_review(
    review_id: str,
    status: str,
    reviewer_id: Optional[str] = None,
    review_notes: Optional[str] = None,
    corrected_enrichment: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Update a review entry (approve, reject, or add corrections).
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_review] Database not configured")
        return False
    
    if status not in ['pending', 'approved', 'rejected', 'needs_review']:
        logger.error(f"[enrichment_review] Invalid status: {status}")
        return False
    
    conn = None
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get job_id from review
        cursor.execute("SELECT job_id FROM enrichment_reviews WHERE id = %s", (review_id,))
        review = cursor.fetchone()
        if not review:
            logger.error(f"[enrichment_review] Review {review_id} not found")
            cursor.close()
            conn.close()
            return False
        
        job_id = review['job_id']
        
        # Update review
        cursor.execute("""
            UPDATE enrichment_reviews
            SET 
                status = %s,
                reviewer_id = %s,
                review_notes = COALESCE(%s, review_notes),
                corrected_enrichment = COALESCE(%s::jsonb, corrected_enrichment),
                reviewed_at = CASE WHEN %s != 'pending' THEN NOW() ELSE reviewed_at END,
                updated_at = NOW()
            WHERE id = %s
        """, (
            status,
            reviewer_id,
            review_notes,
            json.dumps(corrected_enrichment) if corrected_enrichment else None,
            status,
            review_id
        ))
        
        # If approved with corrections, update the job
        if status == 'approved' and corrected_enrichment:
            # Update job enrichment fields
            update_fields = []
            update_values = []
            
            if 'impact_domain' in corrected_enrichment:
                update_fields.append("impact_domain = %s")
                update_values.append(corrected_enrichment['impact_domain'])
            
            if 'functional_role' in corrected_enrichment:
                update_fields.append("functional_role = %s")
                update_values.append(corrected_enrichment['functional_role'])
            
            if 'experience_level' in corrected_enrichment:
                update_fields.append("experience_level = %s")
                update_values.append(corrected_enrichment.get('experience_level'))
            
            if update_fields:
                update_values.append(job_id)
                cursor.execute(f"""
                    UPDATE jobs
                    SET {', '.join(update_fields)}, updated_at = NOW()
                    WHERE id = %s
                """, update_values)
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"[enrichment_review] Updated review {review_id} to status {status}")
        return True
        
    except Exception as e:
        logger.error(f"[enrichment_review] Failed to update review {review_id}: {e}", exc_info=True)
        if conn:
            conn.rollback()
            conn.close()
        return False

