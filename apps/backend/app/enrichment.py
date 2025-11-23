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
from app.enrichment_review import auto_flag_job_for_review
from app.enrichment_history import record_enrichment_change

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

# Canonical lists for validation
CANONICAL_IMPACT_DOMAINS = {
    "Climate & Environment",
    "Climate Adaptation & Resilience",
    "Disaster Risk Reduction & Preparedness",
    "Natural Resource Management & Biodiversity",
    "Water, Sanitation & Hygiene (WASH)",
    "Food Security & Nutrition",
    "Agriculture & Livelihoods",
    "Public Health & Primary Health Care",
    "Disease Control & Epidemiology",
    "Sexual & Reproductive Health (SRH)",
    "Mental Health & Psychosocial Support (MHPSS)",
    "Education (Access & Quality)",
    "Education in Emergencies",
    "Gender Equality & Women's Empowerment",
    "Child Protection & Early Childhood Development",
    "Gender-Based Violence (GBV) Prevention & Response",
    "Shelter & CCCM",
    "Migration, Refugees & Displacement",
    "Humanitarian Response & Emergency Operations",
    "Peacebuilding, Governance & Rule of Law",
    "Social Protection & Safety Nets",
    "Economic Recovery & Jobs / Livelihoods",
    "Water Resource Management & Irrigation",
    "Urban Resilience & Sustainable Cities",
    "Digital Development & Data for Development",
    "Monitoring, Evaluation, Accountability & Learning (MEAL)",
    "Human Rights & Advocacy",
    "Anti-Corruption & Transparency",
    "Energy Access & Renewable Energy",
    "Disability Inclusion & Accessibility",
    "Indigenous Peoples & Cultural Rights",
    "Innovation & Human-Centred Design",
}

CANONICAL_FUNCTIONAL_ROLES = {
    "Program & Field Implementation",
    "Project Management",
    "MEAL / Research / Evidence",
    "Data & GIS",
    "Communications & Advocacy",
    "Grants / Partnerships / Fundraising",
    "Finance, Accounting & Audit",
    "HR, Admin & Ops",
    "Logistics, Supply Chain & Procurement",
    "Technical Specialists",
    "Policy & Advocacy",
    "IT / Digital / Systems",
    "Monitoring Officer / Field Monitoring",
    "Security & Safety",
    "Shelter / NFI / CCCM Specialist",
    "Cash & Voucher Assistance (CVA) Specialist",
    "Livelihoods & Economic Inclusion Specialist",
    "Education Specialist / EiE Specialist",
    "Protection Specialist / Child Protection Specialist",
    "MHPSS Specialist",
    "Nutrition Specialist",
    "Health Technical Advisor",
    "Geographic / Regional Roles",
    "Senior Leadership",
    "Consulting / Short-term Technical Experts",
    "Legal / Compliance / Donor Compliance",
}

CANONICAL_EXPERIENCE_LEVELS = {
    "Early / Junior",
    "Officer / Associate",
    "Specialist / Advisor",
    "Manager / Senior Manager",
    "Head of Unit / Director",
    "Expert / Technical Lead",
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
    
    # Rule 5: Filter impact_domain by minimum confidence threshold (0.65)
    impact_domains = enrichment_data.get("impact_domain", [])
    impact_confidences = enrichment_data.get("impact_confidences", {})
    if impact_domains:
        filtered_domains = []
        filtered_domain_confidences = {}
        
        for domain in impact_domains:
            domain_key = str(domain)
            confidence = impact_confidences.get(domain_key, 0.0)
            if confidence >= 0.65:
                filtered_domains.append(domain)
                filtered_domain_confidences[domain_key] = confidence
            else:
                logger.warning(f"[enrichment] Rejecting impact_domain '{domain}' with low confidence {confidence:.2f} < 0.65")
        
        enrichment_data["impact_domain"] = filtered_domains
        enrichment_data["impact_confidences"] = filtered_domain_confidences
        
        # If all domains were filtered out, flag as low confidence
        if not filtered_domains and impact_domains:
            low_confidence = True
            low_confidence_reasons.append("all impact_domains below confidence threshold (0.65)")
    
    # Rule 6: Validate experience_level confidence threshold (0.70)
    experience_level = enrichment_data.get("experience_level")
    experience_confidence = enrichment_data.get("experience_confidence", 0.0)
    
    if experience_level:
        if experience_confidence < 0.70:
            # Clear experience level if confidence is too low
            logger.warning(f"[enrichment] Rejecting experience_level '{experience_level}' with low confidence {experience_confidence:.2f} < 0.70")
            enrichment_data["experience_level"] = None
            enrichment_data["experience_confidence"] = None
            enrichment_data["estimated_experience_years"] = {}
            low_confidence = True
            low_confidence_reasons.append(f"experience_level confidence {experience_confidence:.2f} < 0.70")
    
    # Rule 7: Set low_confidence if overall confidence < 0.65
    if confidence_overall < 0.65:
        low_confidence = True
        low_confidence_reasons.append(f"overall confidence {confidence_overall:.2f} < 0.65")
    
    enrichment_data["low_confidence"] = low_confidence
    if low_confidence_reasons:
        enrichment_data["low_confidence_reason"] = "; ".join(low_confidence_reasons)
    else:
        enrichment_data["low_confidence_reason"] = None
    
    return enrichment_data


def validate_enrichment_response(enrichment_data: Dict[str, Any], job_id: str) -> bool:
    """
    Validate AI enrichment response structure and values.
    
    Returns True if valid, False otherwise.
    Logs warnings for invalid values.
    """
    is_valid = True
    
    # Validate impact_domain
    impact_domains = enrichment_data.get("impact_domain", [])
    if not isinstance(impact_domains, list):
        logger.warning(f"[enrichment] Invalid impact_domain type for job {job_id}: {type(impact_domains)}")
        enrichment_data["impact_domain"] = []
        is_valid = False
    else:
        invalid_domains = [d for d in impact_domains if d not in CANONICAL_IMPACT_DOMAINS]
        if invalid_domains:
            logger.warning(f"[enrichment] Invalid impact_domain values for job {job_id}: {invalid_domains}")
            enrichment_data["impact_domain"] = [d for d in impact_domains if d in CANONICAL_IMPACT_DOMAINS]
            is_valid = False
    
    # Validate functional_role
    functional_roles = enrichment_data.get("functional_role", [])
    if not isinstance(functional_roles, list):
        logger.warning(f"[enrichment] Invalid functional_role type for job {job_id}: {type(functional_roles)}")
        enrichment_data["functional_role"] = []
        is_valid = False
    else:
        invalid_roles = [r for r in functional_roles if r not in CANONICAL_FUNCTIONAL_ROLES]
        if invalid_roles:
            logger.warning(f"[enrichment] Invalid functional_role values for job {job_id}: {invalid_roles}")
            enrichment_data["functional_role"] = [r for r in functional_roles if r in CANONICAL_FUNCTIONAL_ROLES]
            is_valid = False
    
    # Validate experience_level
    experience_level = enrichment_data.get("experience_level")
    if experience_level:
        if experience_level not in CANONICAL_EXPERIENCE_LEVELS:
            logger.warning(f"[enrichment] Invalid experience_level for job {job_id}: {experience_level}")
            enrichment_data["experience_level"] = None
            enrichment_data["experience_confidence"] = None
            enrichment_data["estimated_experience_years"] = {}
            is_valid = False
    
    # Validate confidence scores (must be 0-1)
    confidence_fields = [
        ("confidence_overall", enrichment_data.get("confidence_overall")),
        ("experience_confidence", enrichment_data.get("experience_confidence")),
    ]
    
    for field_name, value in confidence_fields:
        if value is not None:
            if not isinstance(value, (int, float)) or value < 0 or value > 1:
                logger.warning(f"[enrichment] Invalid {field_name} for job {job_id}: {value} (must be 0-1)")
                enrichment_data[field_name] = None
                is_valid = False
    
    # Validate impact_confidences
    impact_confidences = enrichment_data.get("impact_confidences", {})
    if not isinstance(impact_confidences, dict):
        logger.warning(f"[enrichment] Invalid impact_confidences type for job {job_id}: {type(impact_confidences)}")
        enrichment_data["impact_confidences"] = {}
        is_valid = False
    else:
        for domain, conf in impact_confidences.items():
            if not isinstance(conf, (int, float)) or conf < 0 or conf > 1:
                logger.warning(f"[enrichment] Invalid impact_confidences['{domain}'] for job {job_id}: {conf} (must be 0-1)")
                del impact_confidences[domain]
                is_valid = False
    
    # Validate functional_confidences
    functional_confidences = enrichment_data.get("functional_confidences", {})
    if not isinstance(functional_confidences, dict):
        logger.warning(f"[enrichment] Invalid functional_confidences type for job {job_id}: {type(functional_confidences)}")
        enrichment_data["functional_confidences"] = {}
        is_valid = False
    else:
        for role, conf in functional_confidences.items():
            if not isinstance(conf, (int, float)) or conf < 0 or conf > 1:
                logger.warning(f"[enrichment] Invalid functional_confidences['{role}'] for job {job_id}: {conf} (must be 0-1)")
                del functional_confidences[role]
                is_valid = False
    
    return is_valid


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
    
    # Log input quality
    desc_length = len(description) if description else 0
    logger.info(f"[enrichment] Enriching job {job_id}: title='{title[:50]}...', desc_length={desc_length}")
    
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
    
    # Validate response structure and values
    if not validate_enrichment_response(enrichment_data, job_id):
        logger.warning(f"[enrichment] Validation found issues for job {job_id}, continuing with corrected data")
    
    # Apply hybrid rules
    enrichment_data = apply_enrichment_rules(enrichment_data)
    
    # Log confidence scores
    logger.info(
        f"[enrichment] Job {job_id} enrichment: "
        f"confidence_overall={enrichment_data.get('confidence_overall', 'N/A')}, "
        f"experience_confidence={enrichment_data.get('experience_confidence', 'N/A')}, "
        f"low_confidence={enrichment_data.get('low_confidence', False)}, "
        f"impact_domains={len(enrichment_data.get('impact_domain', []))}, "
        f"functional_roles={len(enrichment_data.get('functional_role', []))}"
    )
    
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
        
        # Get current enrichment for history tracking
        cursor.execute("""
            SELECT 
                impact_domain, impact_confidences, functional_role, functional_confidences,
                experience_level, estimated_experience_years, experience_confidence,
                sdgs, sdg_confidences, sdg_explanation, matched_keywords,
                confidence_overall, low_confidence, low_confidence_reason
            FROM jobs
            WHERE id::text = %s
        """, (job_id,))
        
        current_job = cursor.fetchone()
        enrichment_before = None
        if current_job and current_job.get('impact_domain'):
            # Build before snapshot
            enrichment_before = {
                "impact_domain": current_job.get("impact_domain", []),
                "impact_confidences": current_job.get("impact_confidences", {}),
                "functional_role": current_job.get("functional_role", []),
                "functional_confidences": current_job.get("functional_confidences", {}),
                "experience_level": current_job.get("experience_level"),
                "estimated_experience_years": current_job.get("estimated_experience_years", {}),
                "experience_confidence": current_job.get("experience_confidence"),
                "sdgs": current_job.get("sdgs", []),
                "sdg_confidences": current_job.get("sdg_confidences", {}),
                "sdg_explanation": current_job.get("sdg_explanation"),
                "matched_keywords": current_job.get("matched_keywords", []),
                "confidence_overall": current_job.get("confidence_overall"),
                "low_confidence": current_job.get("low_confidence", False),
                "low_confidence_reason": current_job.get("low_confidence_reason"),
            }
        
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
        
        # Record in history
        record_enrichment_change(
            job_id=job_id,
            enrichment_before=enrichment_before,
            enrichment_after=enrichment_data,
            change_reason="auto-enrichment",
            changed_by="ai_service",
            enrichment_version=enrichment_version
        )
        
        # Auto-flag for review if needed
        auto_flag_job_for_review(job_id, enrichment_data)
        
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

