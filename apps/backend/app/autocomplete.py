"""
Autocomplete Service.
Generates intelligent search suggestions based on partial text.
"""
import logging
from typing import Any, Optional, List, Dict
from functools import lru_cache
import time

from app.ai_service import get_ai_service

logger = logging.getLogger(__name__)

# Cache for autocomplete suggestions (TTL: 5 seconds)
_autocomplete_cache: Dict[str, tuple[List[Dict[str, Any]], float]] = {}
CACHE_TTL = 5  # 5 seconds


def get_suggestions(
    partial_text: str,
    common_combos: Optional[List[Dict[str, Any]]] = None,
    use_cache: bool = True,
) -> List[Dict[str, Any]]:
    """
    Generate autocomplete suggestions based on partial text.
    
    Returns list of suggestion objects with metadata.
    """
    if not partial_text or not partial_text.strip():
        return []
    
    partial_text = partial_text.strip().lower()
    
    # Check cache
    if use_cache and partial_text in _autocomplete_cache:
        cached_result, cached_time = _autocomplete_cache[partial_text]
        if time.time() - cached_time < CACHE_TTL:
            logger.debug(f"[autocomplete] Cache hit for: {partial_text[:50]}")
            return cached_result.copy()
        else:
            # Expired, remove from cache
            del _autocomplete_cache[partial_text]
    
    ai_service = get_ai_service()
    
    if not ai_service.enabled:
        logger.warning("[autocomplete] AI service not enabled, using fallback suggestions")
        return _fallback_suggestions(partial_text)
    
    # Call AI service
    suggestions = ai_service.get_autocomplete_suggestions(
        partial_text=partial_text,
        common_combos=common_combos,
    )
    
    if not suggestions:
        logger.warning(f"[autocomplete] AI suggestions failed, using fallback for: {partial_text[:50]}")
        return _fallback_suggestions(partial_text)
    
    # Validate and limit to 8
    result = suggestions[:8]
    
    # Ensure all suggestions have required fields
    for suggestion in result:
        if "filters" not in suggestion:
            suggestion["filters"] = {
                "impact_domain": [],
                "functional_role": [],
                "experience_level": "",
                "location": "",
                "is_remote": False,
                "free_text": "",
            }
        if "confidence" not in suggestion:
            suggestion["confidence"] = 0.5
        if "type" not in suggestion:
            suggestion["type"] = "combo"
    
    # Cache result
    if use_cache:
        _autocomplete_cache[partial_text] = (result.copy(), time.time())
        # Clean old cache entries (keep last 50)
        if len(_autocomplete_cache) > 50:
            oldest_key = min(_autocomplete_cache.keys(), key=lambda k: _autocomplete_cache[k][1])
            del _autocomplete_cache[oldest_key]
    
    return result


def _fallback_suggestions(partial_text: str) -> List[Dict[str, Any]]:
    """
    Fallback keyword-based suggestions when AI is unavailable.
    """
    suggestions = []
    partial_lower = partial_text.lower()
    
    # Common impact domains
    impact_domains = [
        "Water, Sanitation & Hygiene (WASH)",
        "Public Health & Primary Health Care",
        "Education (Access & Quality)",
        "Gender Equality & Women's Empowerment",
        "Food Security & Nutrition",
        "Climate & Environment",
        "Humanitarian Response & Emergency Operations",
        "Monitoring, Evaluation, Accountability & Learning (MEAL)",
    ]
    
    for domain in impact_domains:
        if partial_lower in domain.lower() or domain.lower().startswith(partial_lower):
            suggestions.append({
                "text": domain,
                "type": "impact_domain",
                "filters": {
                    "impact_domain": [domain],
                    "functional_role": [],
                    "experience_level": "",
                    "location": "",
                    "is_remote": False,
                    "free_text": "",
                },
                "confidence": 0.8,
            })
            if len(suggestions) >= 8:
                break
    
    # Common functional roles
    if len(suggestions) < 8:
        functional_roles = [
            "Program & Field Implementation",
            "Project Management",
            "MEAL / Research / Evidence",
            "Data & GIS",
            "Communications & Advocacy",
            "Grants / Partnerships / Fundraising",
        ]
        
        for role in functional_roles:
            if partial_lower in role.lower() or role.lower().startswith(partial_lower):
                suggestions.append({
                    "text": role,
                    "type": "functional_role",
                    "filters": {
                        "impact_domain": [],
                        "functional_role": [role],
                        "experience_level": "",
                        "location": "",
                        "is_remote": False,
                        "free_text": "",
                    },
                    "confidence": 0.8,
                })
                if len(suggestions) >= 8:
                    break
    
    # Experience levels
    if len(suggestions) < 8:
        experience_levels = [
            "Early / Junior (0–2 yrs)",
            "Officer / Associate (2–5 yrs)",
            "Specialist / Advisor (5–8 yrs)",
            "Manager / Senior Manager (7–12 yrs)",
        ]
        
        for level in experience_levels:
            if partial_lower in level.lower() or any(term in partial_lower for term in ["entry", "junior", "mid", "senior", "manager"]):
                suggestions.append({
                    "text": level,
                    "type": "experience_level",
                    "filters": {
                        "impact_domain": [],
                        "functional_role": [],
                        "experience_level": level,
                        "location": "",
                        "is_remote": False,
                        "free_text": "",
                    },
                    "confidence": 0.7,
                })
                if len(suggestions) >= 8:
                    break
    
    # Remote work
    if "remote" in partial_lower and len(suggestions) < 8:
        suggestions.append({
            "text": "Remote jobs",
            "type": "combo",
            "filters": {
                "impact_domain": [],
                "functional_role": [],
                "experience_level": "",
                "location": "",
                "is_remote": True,
                "free_text": "",
            },
            "confidence": 0.9,
        })
    
    return suggestions[:8]

