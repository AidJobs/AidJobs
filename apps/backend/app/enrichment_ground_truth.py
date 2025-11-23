"""
Enrichment Ground Truth Service.
Manages manually labeled test set for accuracy validation.
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

from app.db_config import db_config

logger = logging.getLogger(__name__)


def add_ground_truth(
    job_id: str,
    title: str,
    description_snippet: Optional[str],
    org_name: Optional[str],
    location_raw: Optional[str],
    impact_domain: List[str],
    functional_role: List[str],
    experience_level: Optional[str],
    sdgs: List[int],
    labeled_by: str,
    notes: Optional[str] = None,
) -> bool:
    """
    Add a ground truth entry (manually labeled job).
    
    Returns True on success, False on error.
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_ground_truth] Database not configured")
        return False
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            INSERT INTO enrichment_ground_truth (
                job_id, title, description_snippet, org_name, location_raw,
                impact_domain, functional_role, experience_level, sdgs,
                labeled_by, notes
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            ON CONFLICT (job_id) DO UPDATE SET
                title = EXCLUDED.title,
                description_snippet = EXCLUDED.description_snippet,
                org_name = EXCLUDED.org_name,
                location_raw = EXCLUDED.location_raw,
                impact_domain = EXCLUDED.impact_domain,
                functional_role = EXCLUDED.functional_role,
                experience_level = EXCLUDED.experience_level,
                sdgs = EXCLUDED.sdgs,
                labeled_by = EXCLUDED.labeled_by,
                notes = EXCLUDED.notes,
                labeled_at = NOW()
        """, (
            job_id,
            title,
            description_snippet,
            org_name,
            location_raw,
            impact_domain,
            functional_role,
            experience_level,
            sdgs,
            labeled_by,
            notes
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"[enrichment_ground_truth] Added ground truth for job {job_id}")
        return True
        
    except Exception as e:
        logger.error(f"[enrichment_ground_truth] Failed to add ground truth: {e}", exc_info=True)
        if conn:
            conn.rollback()
            conn.close()
        return False


def validate_enrichment_accuracy(
    job_id: str,
    ai_enrichment: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Compare AI enrichment against ground truth and calculate accuracy.
    
    Returns accuracy metrics:
    - precision: Correct predictions / Total predictions
    - recall: Correct predictions / Total ground truth labels
    - f1_score: Harmonic mean of precision and recall
    - field_accuracy: Per-field accuracy scores
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_ground_truth] Database not configured")
        return {}
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get ground truth
        cursor.execute("""
            SELECT impact_domain, functional_role, experience_level, sdgs
            FROM enrichment_ground_truth
            WHERE job_id = %s AND is_active = TRUE
        """, (job_id,))
        
        ground_truth = cursor.fetchone()
        if not ground_truth:
            cursor.close()
            conn.close()
            return {"error": "No ground truth found for this job"}
        
        # Compare AI output to ground truth
        results = {
            "job_id": job_id,
            "field_accuracy": {},
            "overall_correct": 0,
            "overall_total": 0,
        }
        
        # Impact domain accuracy
        gt_domains = set(ground_truth.get("impact_domain", []) or [])
        ai_domains = set(ai_enrichment.get("impact_domain", []) or [])
        if gt_domains:
            correct = len(gt_domains & ai_domains)
            precision = correct / len(ai_domains) if ai_domains else 0.0
            recall = correct / len(gt_domains) if gt_domains else 0.0
            f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
            results["field_accuracy"]["impact_domain"] = {
                "precision": precision,
                "recall": recall,
                "f1_score": f1,
                "correct": correct,
                "ground_truth": list(gt_domains),
                "ai_prediction": list(ai_domains),
            }
            results["overall_correct"] += correct
            results["overall_total"] += len(gt_domains)
        
        # Functional role accuracy
        gt_roles = set(ground_truth.get("functional_role", []) or [])
        ai_roles = set(ai_enrichment.get("functional_role", []) or [])
        if gt_roles:
            correct = len(gt_roles & ai_roles)
            precision = correct / len(ai_roles) if ai_roles else 0.0
            recall = correct / len(gt_roles) if gt_roles else 0.0
            f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
            results["field_accuracy"]["functional_role"] = {
                "precision": precision,
                "recall": recall,
                "f1_score": f1,
                "correct": correct,
                "ground_truth": list(gt_roles),
                "ai_prediction": list(ai_roles),
            }
            results["overall_correct"] += correct
            results["overall_total"] += len(gt_roles)
        
        # Experience level accuracy
        gt_level = ground_truth.get("experience_level")
        ai_level = ai_enrichment.get("experience_level")
        if gt_level:
            is_correct = (gt_level == ai_level) if ai_level else False
            results["field_accuracy"]["experience_level"] = {
                "correct": is_correct,
                "ground_truth": gt_level,
                "ai_prediction": ai_level,
            }
            if is_correct:
                results["overall_correct"] += 1
            results["overall_total"] += 1
        
        # SDG accuracy
        gt_sdgs = set(ground_truth.get("sdgs", []) or [])
        ai_sdgs = set(ai_enrichment.get("sdgs", []) or [])
        if gt_sdgs:
            correct = len(gt_sdgs & ai_sdgs)
            precision = correct / len(ai_sdgs) if ai_sdgs else 0.0
            recall = correct / len(gt_sdgs) if gt_sdgs else 0.0
            f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
            results["field_accuracy"]["sdgs"] = {
                "precision": precision,
                "recall": recall,
                "f1_score": f1,
                "correct": correct,
                "ground_truth": list(gt_sdgs),
                "ai_prediction": list(ai_sdgs),
            }
            results["overall_correct"] += correct
            results["overall_total"] += len(gt_sdgs)
        
        # Overall accuracy
        if results["overall_total"] > 0:
            results["overall_accuracy"] = results["overall_correct"] / results["overall_total"]
        else:
            results["overall_accuracy"] = 0.0
        
        cursor.close()
        conn.close()
        
        return results
        
    except Exception as e:
        logger.error(f"[enrichment_ground_truth] Failed to validate accuracy: {e}", exc_info=True)
        return {"error": str(e)}


def get_ground_truth_stats() -> Dict[str, Any]:
    """Get statistics about the ground truth test set."""
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_ground_truth] Database not configured")
        return {}
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT labeled_by) as labelers,
                MIN(labeled_at) as first_labeled,
                MAX(labeled_at) as last_labeled
            FROM enrichment_ground_truth
            WHERE is_active = TRUE
        """)
        
        stats = cursor.fetchone()
        cursor.close()
        conn.close()
        
        return dict(stats) if stats else {}
        
    except Exception as e:
        logger.error(f"[enrichment_ground_truth] Failed to get stats: {e}", exc_info=True)
        return {}

