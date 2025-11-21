"""
Re-ranking Service.
Computes match scores and top reasons for search results.
"""
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def compute_match_score(
    job: Dict[str, Any],
    parsed_filters: Dict[str, Any],
) -> tuple[float, List[str]]:
    """
    Compute match score (0-100) and top reasons for a job.
    
    Returns (match_score, top_reasons) tuple.
    """
    score = 0.0
    reasons = []
    
    # Impact domain match: +30 points
    job_impact_domains = set(job.get("impact_domain", []) or [])
    filter_impact_domains = set(parsed_filters.get("impact_domain", []) or [])
    
    if filter_impact_domains and job_impact_domains:
        matched_domains = job_impact_domains.intersection(filter_impact_domains)
        if matched_domains:
            score += 30.0
            reasons.append(f"Matches Impact: {', '.join(list(matched_domains)[:2])}")
    
    # Functional role match: +30 points
    job_roles = set(job.get("functional_role", []) or [])
    filter_roles = set(parsed_filters.get("functional_role", []) or [])
    
    if filter_roles and job_roles:
        matched_roles = job_roles.intersection(filter_roles)
        if matched_roles:
            score += 30.0
            reasons.append(f"Role: {', '.join(list(matched_roles)[:2])}")
    
    # Experience level match: +20 points
    job_experience = job.get("experience_level", "")
    filter_experience = parsed_filters.get("experience_level", "")
    
    if filter_experience and job_experience:
        if filter_experience.lower() in job_experience.lower() or job_experience.lower() in filter_experience.lower():
            score += 20.0
            reasons.append(f"Experience: {job_experience}")
    
    # Location match: +10 points
    job_location = (job.get("location_raw") or job.get("country") or "").lower()
    filter_location = parsed_filters.get("location", "").lower()
    
    if filter_location and job_location:
        if filter_location in job_location or job_location in filter_location:
            score += 10.0
            reasons.append(f"Location: {job.get('location_raw') or job.get('country')}")
    
    # Remote match: +10 points
    job_is_remote = job.get("work_modality", "").lower() in ["remote", "hybrid", "work from home"]
    filter_is_remote = parsed_filters.get("is_remote", False)
    
    if filter_is_remote and job_is_remote:
        score += 10.0
        reasons.append("Remote work available")
    
    # Clamp score to 0-100
    score = max(0.0, min(100.0, score))
    
    # Limit reasons to top 3
    top_reasons = reasons[:3]
    
    return score, top_reasons


def rerank_results(
    results: List[Dict[str, Any]],
    parsed_filters: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Re-rank search results by computing match scores.
    
    Returns results with match_score and top_reasons added.
    """
    enriched_results = []
    
    for job in results:
        match_score, top_reasons = compute_match_score(job, parsed_filters)
        
        # Add match_score and top_reasons to job
        enriched_job = job.copy()
        enriched_job["match_score"] = round(match_score, 1)
        enriched_job["top_reasons"] = top_reasons
        
        enriched_results.append(enriched_job)
    
    # Sort by match_score descending (highest first)
    enriched_results.sort(key=lambda j: j.get("match_score", 0.0), reverse=True)
    
    return enriched_results

