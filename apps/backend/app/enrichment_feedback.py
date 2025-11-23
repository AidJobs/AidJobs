"""
Enrichment Feedback Service.
Collects human corrections to learn from and improve accuracy.
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

from app.db_config import db_config

logger = logging.getLogger(__name__)


def submit_feedback(
    job_id: str,
    feedback_type: str,
    field_name: str,
    original_value: Any,
    corrected_value: Any,
    feedback_notes: Optional[str] = None,
    submitted_by: Optional[str] = None,
) -> bool:
    """
    Submit feedback about an enrichment error.
    
    Args:
        job_id: Job ID
        feedback_type: 'correction', 'flag_incorrect', or 'flag_missing'
        field_name: Which field was incorrect (impact_domain, experience_level, etc.)
        original_value: What the AI said
        corrected_value: What it should be
        feedback_notes: Optional notes
        submitted_by: User/admin ID who submitted
    """
    if feedback_type not in ['correction', 'flag_incorrect', 'flag_missing']:
        logger.error(f"[enrichment_feedback] Invalid feedback_type: {feedback_type}")
        return False
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_feedback] Database not configured")
        return False
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Convert values to text for storage
        original_text = str(original_value) if original_value is not None else None
        corrected_text = str(corrected_value) if corrected_value is not None else None
        
        cursor.execute("""
            INSERT INTO enrichment_feedback (
                job_id, feedback_type, field_name, original_value, corrected_value,
                feedback_notes, submitted_by
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s
            )
        """, (
            job_id,
            feedback_type,
            field_name,
            original_text,
            corrected_text,
            feedback_notes,
            submitted_by
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"[enrichment_feedback] Feedback submitted for job {job_id}, field {field_name}")
        return True
        
    except Exception as e:
        logger.error(f"[enrichment_feedback] Failed to submit feedback: {e}", exc_info=True)
        if conn:
            conn.rollback()
            conn.close()
        return False


def get_feedback_patterns(
    field_name: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Get feedback patterns to identify systematic errors.
    
    Returns list of feedback entries grouped by pattern.
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_feedback] Database not configured")
        return []
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
            SELECT 
                field_name,
                original_value,
                corrected_value,
                COUNT(*) as error_count,
                MAX(submitted_at) as last_seen
            FROM enrichment_feedback
            WHERE processed = FALSE
        """
        
        params = []
        if field_name:
            query += " AND field_name = %s"
            params.append(field_name)
        
        query += """
            GROUP BY field_name, original_value, corrected_value
            ORDER BY error_count DESC, last_seen DESC
            LIMIT %s
        """
        params.append(limit)
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"[enrichment_feedback] Failed to get feedback patterns: {e}", exc_info=True)
        return []


def mark_feedback_processed(feedback_id: str) -> bool:
    """Mark feedback as processed (used for learning)."""
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_feedback] Database not configured")
        return False
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            UPDATE enrichment_feedback
            SET processed = TRUE, processed_at = NOW()
            WHERE id = %s
        """, (feedback_id,))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return True
        
    except Exception as e:
        logger.error(f"[enrichment_feedback] Failed to mark feedback as processed: {e}", exc_info=True)
        if conn:
            conn.rollback()
            conn.close()
        return False

