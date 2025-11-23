"""
Enrichment Consistency Validation Service.
Detects when similar jobs get different enrichments.
"""
import logging
from typing import List, Dict, Any, Optional, Tuple
import psycopg2
from psycopg2.extras import RealDictCursor
from difflib import SequenceMatcher

from app.db_config import db_config

logger = logging.getLogger(__name__)


def similarity_score(str1: str, str2: str) -> float:
    """Calculate similarity between two strings (0-1)."""
    if not str1 or not str2:
        return 0.0
    return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()


def find_similar_jobs(
    job_id: str,
    title: str,
    description: Optional[str] = None,
    similarity_threshold: float = 0.85
) -> List[Dict[str, Any]]:
    """
    Find jobs with similar titles/descriptions.
    
    Returns list of similar jobs with their enrichments.
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_consistency] Database not configured")
        return []
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get all enriched jobs
        cursor.execute("""
            SELECT 
                id, title, description_snippet, org_name,
                impact_domain, functional_role, experience_level,
                confidence_overall
            FROM jobs
            WHERE status = 'active'
                AND id::text != %s
                AND (impact_domain IS NOT NULL OR experience_level IS NOT NULL)
            ORDER BY created_at DESC
            LIMIT 500
        """, (job_id,))
        
        all_jobs = cursor.fetchall()
        cursor.close()
        conn.close()
        
        # Calculate similarity
        similar_jobs = []
        for job in all_jobs:
            # Title similarity
            title_sim = similarity_score(title, job.get("title", ""))
            
            # Description similarity (if both have descriptions)
            desc_sim = 0.0
            if description and job.get("description_snippet"):
                desc_sim = similarity_score(description[:200], job.get("description_snippet", "")[:200])
            
            # Combined similarity (weighted: 60% title, 40% description)
            combined_sim = (title_sim * 0.6) + (desc_sim * 0.4)
            
            if combined_sim >= similarity_threshold:
                similar_jobs.append({
                    "job_id": str(job["id"]),
                    "title": job.get("title"),
                    "similarity": combined_sim,
                    "title_similarity": title_sim,
                    "description_similarity": desc_sim,
                    "impact_domain": job.get("impact_domain", []),
                    "functional_role": job.get("functional_role", []),
                    "experience_level": job.get("experience_level"),
                    "confidence_overall": job.get("confidence_overall"),
                })
        
        # Sort by similarity descending
        similar_jobs.sort(key=lambda x: x["similarity"], reverse=True)
        
        return similar_jobs[:10]  # Return top 10 most similar
        
    except Exception as e:
        logger.error(f"[enrichment_consistency] Failed to find similar jobs: {e}", exc_info=True)
        return []


def check_consistency(
    job_id: str,
    enrichment: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Check if a job's enrichment is consistent with similar jobs.
    
    Returns consistency report with:
    - is_consistent: Boolean
    - inconsistencies: List of fields that differ
    - similar_jobs: List of similar jobs for comparison
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_consistency] Database not configured")
        return {"error": "Database not configured"}
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get job details
        cursor.execute("""
            SELECT title, description_snippet
            FROM jobs
            WHERE id::text = %s
        """, (job_id,))
        
        job = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not job:
            return {"error": "Job not found"}
        
        # Find similar jobs
        similar_jobs = find_similar_jobs(
            job_id=job_id,
            title=job.get("title", ""),
            description=job.get("description_snippet"),
            similarity_threshold=0.80
        )
        
        if not similar_jobs:
            return {
                "is_consistent": True,
                "inconsistencies": [],
                "similar_jobs": [],
                "message": "No similar jobs found for comparison"
            }
        
        # Check for inconsistencies
        inconsistencies = []
        
        # Check impact_domain consistency
        job_domains = set(enrichment.get("impact_domain", []) or [])
        similar_domains = [set(j.get("impact_domain", []) or []) for j in similar_jobs]
        if similar_domains:
            # Check if job's domains match majority of similar jobs
            domain_matches = sum(1 for sd in similar_domains if job_domains & sd)
            if domain_matches < len(similar_domains) * 0.5:  # Less than 50% match
                inconsistencies.append({
                    "field": "impact_domain",
                    "job_value": list(job_domains),
                    "similar_jobs_values": [list(sd) for sd in similar_domains],
                    "match_rate": domain_matches / len(similar_domains)
                })
        
        # Check experience_level consistency
        job_level = enrichment.get("experience_level")
        similar_levels = [j.get("experience_level") for j in similar_jobs if j.get("experience_level")]
        if similar_levels:
            level_counts = {}
            for level in similar_levels:
                level_counts[level] = level_counts.get(level, 0) + 1
            
            most_common_level = max(level_counts.items(), key=lambda x: x[1])[0] if level_counts else None
            if most_common_level and job_level != most_common_level:
                inconsistencies.append({
                    "field": "experience_level",
                    "job_value": job_level,
                    "most_common_in_similar": most_common_level,
                    "similar_jobs_values": similar_levels,
                    "match_rate": level_counts.get(job_level, 0) / len(similar_levels) if job_level else 0.0
                })
        
        # Check functional_role consistency
        job_roles = set(enrichment.get("functional_role", []) or [])
        similar_roles = [set(j.get("functional_role", []) or []) for j in similar_jobs]
        if similar_roles:
            role_matches = sum(1 for sr in similar_roles if job_roles & sr)
            if role_matches < len(similar_roles) * 0.5:
                inconsistencies.append({
                    "field": "functional_role",
                    "job_value": list(job_roles),
                    "similar_jobs_values": [list(sr) for sr in similar_roles],
                    "match_rate": role_matches / len(similar_roles)
                })
        
        return {
            "is_consistent": len(inconsistencies) == 0,
            "inconsistencies": inconsistencies,
            "similar_jobs_count": len(similar_jobs),
            "similar_jobs": similar_jobs[:5],  # Return top 5 for display
            "consistency_score": 1.0 - (len(inconsistencies) / 3.0) if inconsistencies else 1.0
        }
        
    except Exception as e:
        logger.error(f"[enrichment_consistency] Failed to check consistency: {e}", exc_info=True)
        return {"error": str(e)}


def get_consistency_report(limit: int = 50) -> Dict[str, Any]:
    """
    Get overall consistency report across all jobs.
    
    Returns statistics about consistency across the database.
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_consistency] Database not configured")
        return {}
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get jobs with enrichments
        cursor.execute("""
            SELECT 
                COUNT(*) as total_enriched,
                COUNT(DISTINCT experience_level) as unique_levels,
                COUNT(DISTINCT unnest(impact_domain)) as unique_domains
            FROM jobs
            WHERE status = 'active'
                AND (impact_domain IS NOT NULL OR experience_level IS NOT NULL)
        """)
        
        stats = cursor.fetchone()
        cursor.close()
        conn.close()
        
        return dict(stats) if stats else {}
        
    except Exception as e:
        logger.error(f"[enrichment_consistency] Failed to get consistency report: {e}", exc_info=True)
        return {}

