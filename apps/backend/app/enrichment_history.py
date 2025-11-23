"""
Enrichment History Service.
Tracks all enrichment changes for audit trail.
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import json

from app.db_config import db_config

logger = logging.getLogger(__name__)


def record_enrichment_change(
    job_id: str,
    enrichment_before: Optional[Dict[str, Any]],
    enrichment_after: Dict[str, Any],
    change_reason: str = "auto-enrichment",
    changed_by: str = "system",
    enrichment_version: int = 1
) -> bool:
    """
    Record an enrichment change in the audit trail.
    
    Args:
        job_id: Job ID
        enrichment_before: Enrichment data before change (None for new enrichments)
        enrichment_after: Enrichment data after change
        change_reason: Reason for change (auto-enrichment, manual correction, etc.)
        changed_by: Who made the change (system, admin, ai_service, etc.)
        enrichment_version: Version of enrichment pipeline
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_history] Database not configured")
        return False
    
    # Calculate changed fields
    changed_fields = []
    if enrichment_before:
        for key in enrichment_after.keys():
            if key not in enrichment_before or enrichment_before[key] != enrichment_after[key]:
                changed_fields.append(key)
    else:
        # New enrichment - all fields are "changed"
        changed_fields = list(enrichment_after.keys())
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            INSERT INTO enrichment_history (
                job_id,
                enrichment_before,
                enrichment_after,
                changed_fields,
                change_reason,
                changed_by,
                enrichment_version
            ) VALUES (
                %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s
            )
        """, (
            job_id,
            json.dumps(enrichment_before) if enrichment_before else None,
            json.dumps(enrichment_after),
            changed_fields,
            change_reason,
            changed_by,
            enrichment_version
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.debug(f"[enrichment_history] Recorded enrichment change for job {job_id}: {len(changed_fields)} fields changed")
        return True
        
    except Exception as e:
        logger.error(f"[enrichment_history] Failed to record enrichment change for job {job_id}: {e}", exc_info=True)
        if conn:
            conn.rollback()
            conn.close()
        return False


def get_enrichment_history(
    job_id: str,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Get enrichment history for a job.
    
    Returns list of history entries ordered by most recent first.
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_history] Database not configured")
        return []
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT 
                id,
                enrichment_before,
                enrichment_after,
                changed_fields,
                change_reason,
                changed_by,
                changed_at,
                enrichment_version
            FROM enrichment_history
            WHERE job_id = %s
            ORDER BY changed_at DESC
            LIMIT %s
        """, (job_id, limit))
        
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"[enrichment_history] Failed to get history for job {job_id}: {e}", exc_info=True)
        return []

