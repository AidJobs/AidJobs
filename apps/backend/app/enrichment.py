"""
Job Enrichment Pipeline.
Enriches jobs with impact domain, functional role, experience level, and SDGs.
Applies hybrid rules for SDG suppression and confidence thresholds.
"""
import json
import logging
from typing import Any, Optional, Dict, List
from datetime import datetime

from app.ai_service import get_ai_service
from app.db_config import db_config

logger = logging.getLogger(__name__)

# Operational/support roles that should suppress SDGs
OPERATIONAL_ROLES = {
    "Finance, Accounting & Audit",
    "HR, Admin & Ops",
    "IT / Digital / Systems",
    "Logistics, Supply Chain & Procurement",
    "Communications & Advocacy",  # General communications, not advocacy-specific
}

# MEAL roles that require higher SDG confidence
MEAL_ROLES = {
    "MEAL / Research / Evidence",
    "Monitoring Officer / Field Monitoring",
    "Data & GIS",
}


def apply_enrichment_rules(enrichment_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply hybrid rules to enrichment data:
    - Suppress SDGs for operational roles
    - Remove SDGs < 0.60 confidence
    - Keep max 2 SDGs
    - MEL threshold 0.85
    - Set low_confidence flags
    """
    functional_roles = enrichment_data.get("functional_role", [])
    sdgs = enrichment_data.get("sdgs", [])
    sdg_confidences = enrichment_data.get("sdg_confidences", {})
    confidence_overall = enrichment_data.get("confidence_overall", 0.0)
    
    low_confidence = False
    low_confidence_reasons = []
    
    # Check if any functional role is operational
    is_operational = any(role in OPERATIONAL_ROLES for role in functional_roles)
    
    # Check if any functional role is MEAL
    is_meal = any(role in MEAL_ROLES for role in functional_roles)
    
    # Rule 1: Suppress SDGs for operational/support roles
    if is_operational:
        enrichment_data["sdgs"] = []
        enrichment_data["sdg_confidences"] = {}
        enrichment_data["sdg_explanation"] = None
        low_confidence = True
        low_confidence_reasons.append("operational/support role")
    
    # Rule 2: Remove SDGs with confidence < 0.60
    if not is_operational and sdgs:
        filtered_sdgs = []
        filtered_confidences = {}
        
        for sdg in sdgs:
            sdg_key = str(sdg)
            confidence = sdg_confidences.get(sdg_key, 0.0)
            if confidence >= 0.60:
                filtered_sdgs.append(sdg)
                filtered_confidences[sdg_key] = confidence
        
        enrichment_data["sdgs"] = filtered_sdgs
        enrichment_data["sdg_confidences"] = filtered_confidences
    
    # Rule 3: Keep max 2 SDGs (top by confidence)
    if not is_operational and enrichment_data.get("sdgs"):
        sdgs_list = enrichment_data["sdgs"]
        confidences = enrichment_data["sdg_confidences"]
        
        if len(sdgs_list) > 2:
            # Sort by confidence descending
            sorted_sdgs = sorted(
                sdgs_list,
                key=lambda s: confidences.get(str(s), 0.0),
                reverse=True
            )
            top_2 = sorted_sdgs[:2]
            enrichment_data["sdgs"] = top_2
            enrichment_data["sdg_confidences"] = {
                str(s): confidences.get(str(s), 0.0) for s in top_2
            }
    
    # Rule 4: MEL threshold 0.85
    if is_meal and enrichment_data.get("sdgs"):
        top_sdg_confidence = 0.0
        if enrichment_data["sdg_confidences"]:
            top_sdg_confidence = max(
                enrichment_data["sdg_confidences"].values(),
                default=0.0
            )
        
        if top_sdg_confidence < 0.85:
            enrichment_data["sdgs"] = []
            enrichment_data["sdg_confidences"] = {}
            enrichment_data["sdg_explanation"] = None
            low_confidence = True
            low_confidence_reasons.append("MEAL role requires SDG confidence >= 0.85")
    
    # Rule 5: Set low_confidence if overall confidence < 0.65
    if confidence_overall < 0.65:
        low_confidence = True
        low_confidence_reasons.append(f"overall confidence {confidence_overall:.2f} < 0.65")
    
    enrichment_data["low_confidence"] = low_confidence
    if low_confidence_reasons:
        enrichment_data["low_confidence_reason"] = "; ".join(low_confidence_reasons)
    else:
        enrichment_data["low_confidence_reason"] = None
    
    return enrichment_data


def enrich_job(
    job_id: str,
    title: str,
    description: str,
    org_name: Optional[str] = None,
    location: Optional[str] = None,
    functional_role_hint: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Enrich a single job using AI service and apply rules.
    
    Returns enriched data dict or None on error.
    """
    ai_service = get_ai_service()
    
    if not ai_service.enabled:
        logger.warning(f"[enrichment] AI service not enabled, skipping enrichment for job {job_id}")
        return None
    
    # Call AI service
    enrichment_data = ai_service.enrich_job(
        title=title,
        description=description or "",
        org_name=org_name,
        location=location,
        functional_role_hint=functional_role_hint,
    )
    
    if not enrichment_data:
        logger.error(f"[enrichment] AI service returned no data for job {job_id}")
        return None
    
    # Apply hybrid rules
    enrichment_data = apply_enrichment_rules(enrichment_data)
    
    # Build embedding input (for future semantic rerank)
    embedding_parts = [title]
    if org_name:
        embedding_parts.append(org_name)
    if description:
        embedding_parts.append(description[:500])  # First 500 chars
    if enrichment_data.get("matched_keywords"):
        embedding_parts.append(" ".join(enrichment_data["matched_keywords"][:5]))
    
    enrichment_data["embedding_input"] = " | ".join(embedding_parts)
    
    # Add metadata
    enrichment_data["enriched_at"] = datetime.utcnow().isoformat()
    enrichment_data["enrichment_version"] = 1
    
    return enrichment_data


def save_enrichment_to_db(
    job_id: str,
    enrichment_data: Dict[str, Any],
) -> bool:
    """
    Save enrichment data to database.
    
    Returns True on success, False on error.
    """
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError:
        logger.error("[enrichment] psycopg2 not available")
        return False
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment] Database not configured")
        return False
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Prepare data
        impact_domain = enrichment_data.get("impact_domain", [])
        impact_confidences = json.dumps(enrichment_data.get("impact_confidences", {}))
        functional_role = enrichment_data.get("functional_role", [])
        functional_confidences = json.dumps(enrichment_data.get("functional_confidences", {}))
        experience_level = enrichment_data.get("experience_level")
        estimated_experience_years = json.dumps(enrichment_data.get("estimated_experience_years", {}))
        experience_confidence = enrichment_data.get("experience_confidence")
        sdgs = enrichment_data.get("sdgs", [])
        sdg_confidences = json.dumps(enrichment_data.get("sdg_confidences", {}))
        sdg_explanation = enrichment_data.get("sdg_explanation")
        matched_keywords = enrichment_data.get("matched_keywords", [])
        confidence_overall = enrichment_data.get("confidence_overall")
        low_confidence = enrichment_data.get("low_confidence", False)
        low_confidence_reason = enrichment_data.get("low_confidence_reason")
        embedding_input = enrichment_data.get("embedding_input")
        enriched_at = datetime.utcnow()
        enrichment_version = enrichment_data.get("enrichment_version", 1)
        
        # Update job
        cursor.execute("""
            UPDATE jobs
            SET
                impact_domain = %s,
                impact_confidences = %s::jsonb,
                functional_role = %s,
                functional_confidences = %s::jsonb,
                experience_level = %s,
                estimated_experience_years = %s::jsonb,
                experience_confidence = %s,
                sdgs = %s,
                sdg_confidences = %s::jsonb,
                sdg_explanation = %s,
                matched_keywords = %s,
                confidence_overall = %s,
                low_confidence = %s,
                low_confidence_reason = %s,
                embedding_input = %s,
                enriched_at = %s,
                enrichment_version = %s,
                updated_at = NOW()
            WHERE id::text = %s
        """, (
            impact_domain,
            impact_confidences,
            functional_role,
            functional_confidences,
            experience_level,
            estimated_experience_years,
            experience_confidence,
            sdgs,
            sdg_confidences,
            sdg_explanation,
            matched_keywords,
            confidence_overall,
            low_confidence,
            low_confidence_reason,
            embedding_input,
            enriched_at,
            enrichment_version,
            job_id,
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"[enrichment] Saved enrichment for job {job_id}")
        return True
        
    except Exception as e:
        logger.error(f"[enrichment] Failed to save enrichment for job {job_id}: {e}", exc_info=True)
        if conn:
            conn.rollback()
            conn.close()
        return False


def enrich_and_save_job(
    job_id: str,
    title: str,
    description: str,
    org_name: Optional[str] = None,
    location: Optional[str] = None,
    functional_role_hint: Optional[str] = None,
) -> bool:
    """
    Enrich a job and save to database.
    
    Returns True on success, False on error.
    """
    enrichment_data = enrich_job(
        job_id=job_id,
        title=title,
        description=description,
        org_name=org_name,
        location=location,
        functional_role_hint=functional_role_hint,
    )
    
    if not enrichment_data:
        return False
    
    return save_enrichment_to_db(job_id, enrichment_data)


def batch_enrich_jobs(
    job_ids: List[str],
    batch_size: int = 10,
) -> Dict[str, Any]:
    """
    Enrich multiple jobs in batches.
    
    Returns dict with success_count, error_count, and errors list.
    """
    import psycopg2
    from psycopg2.extras import RealDictCursor
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        return {"success_count": 0, "error_count": len(job_ids), "errors": ["Database not configured"]}
    
    success_count = 0
    error_count = 0
    errors = []
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Fetch job data
        placeholders = ",".join(["%s"] * len(job_ids))
        cursor.execute(f"""
            SELECT id::text, title, description_snippet, org_name, location_raw, functional_tags
            FROM jobs
            WHERE id::text IN ({placeholders})
        """, job_ids)
        
        jobs = cursor.fetchall()
        cursor.close()
        conn.close()
        
        # Process in batches
        for i in range(0, len(jobs), batch_size):
            batch = jobs[i:i + batch_size]
            
            for job in batch:
                job_id = job["id"]
                functional_role_hint = None
                if job.get("functional_tags"):
                    functional_role_hint = " ".join(job["functional_tags"][:3])
                
                success = enrich_and_save_job(
                    job_id=job_id,
                    title=job["title"],
                    description=job.get("description_snippet") or "",
                    org_name=job.get("org_name"),
                    location=job.get("location_raw"),
                    functional_role_hint=functional_role_hint,
                )
                
                if success:
                    success_count += 1
                else:
                    error_count += 1
                    errors.append(f"Job {job_id}: Enrichment failed")
        
        return {
            "success_count": success_count,
            "error_count": error_count,
            "errors": errors[:10],  # Limit to first 10 errors
        }
        
    except Exception as e:
        logger.error(f"[enrichment] Batch enrichment error: {e}", exc_info=True)
        return {
            "success_count": success_count,
            "error_count": error_count + len(job_ids) - success_count,
            "errors": [str(e)],
        }

