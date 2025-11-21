"""
Query Parser Service.
Parses natural language search queries into structured filters.
"""
import logging
from typing import Any, Optional, Dict
from functools import lru_cache
import time

from app.ai_service import get_ai_service

logger = logging.getLogger(__name__)

# Cache for parsed queries (TTL: 5 minutes)
_query_cache: Dict[str, tuple[Dict[str, Any], float]] = {}
CACHE_TTL = 300  # 5 minutes


def parse_query(query: str, use_cache: bool = True) -> Optional[Dict[str, Any]]:
    """
    Parse a natural language search query into structured filters.
    
    Returns structured filter dict or None on error.
    """
    if not query or not query.strip():
        return {
            "impact_domain": [],
            "functional_role": [],
            "experience_level": "",
            "location": "",
            "is_remote": False,
            "free_text": "",
        }
    
    query = query.strip()
    
    # Check cache
    if use_cache and query in _query_cache:
        cached_result, cached_time = _query_cache[query]
        if time.time() - cached_time < CACHE_TTL:
            logger.debug(f"[query_parser] Cache hit for query: {query[:50]}")
            return cached_result.copy()
        else:
            # Expired, remove from cache
            del _query_cache[query]
    
    ai_service = get_ai_service()
    
    if not ai_service.enabled:
        logger.warning("[query_parser] AI service not enabled, using fallback parsing")
        return _fallback_parse(query)
    
    # Call AI service
    parsed = ai_service.parse_query(query)
    
    if not parsed:
        logger.warning(f"[query_parser] AI parsing failed, using fallback for: {query[:50]}")
        return _fallback_parse(query)
    
    # Validate and normalize
    result = {
        "impact_domain": parsed.get("impact_domain", [])[:2],  # Max 2
        "functional_role": parsed.get("functional_role", [])[:2],  # Max 2
        "experience_level": parsed.get("experience_level", "") or "",
        "location": parsed.get("location", "") or "",
        "is_remote": bool(parsed.get("is_remote", False)),
        "free_text": parsed.get("free_text", "") or "",
    }
    
    # Cache result
    if use_cache:
        _query_cache[query] = (result.copy(), time.time())
        # Clean old cache entries (keep last 100)
        if len(_query_cache) > 100:
            oldest_key = min(_query_cache.keys(), key=lambda k: _query_cache[k][1])
            del _query_cache[oldest_key]
    
    return result


def _fallback_parse(query: str) -> Dict[str, Any]:
    """
    Fallback keyword-based parsing when AI is unavailable.
    """
    query_lower = query.lower()
    
    result = {
        "impact_domain": [],
        "functional_role": [],
        "experience_level": "",
        "location": "",
        "is_remote": False,
        "free_text": query,
    }
    
    # Check for remote
    if any(term in query_lower for term in ["remote", "work from home", "wfh", "telecommute"]):
        result["is_remote"] = True
        result["free_text"] = query_lower.replace("remote", "").replace("work from home", "").replace("wfh", "").strip()
    
    # Check for experience levels
    if any(term in query_lower for term in ["entry", "junior", "early", "0-2", "0 to 2"]):
        result["experience_level"] = "Early / Junior (0–2 yrs)"
    elif any(term in query_lower for term in ["mid", "mid-level", "officer", "associate", "2-5", "2 to 5"]):
        result["experience_level"] = "Officer / Associate (2–5 yrs)"
    elif any(term in query_lower for term in ["senior", "specialist", "advisor", "5-8", "5 to 8"]):
        result["experience_level"] = "Specialist / Advisor (5–8 yrs)"
    elif any(term in query_lower for term in ["manager", "7-12", "7 to 12"]):
        result["experience_level"] = "Manager / Senior Manager (7–12 yrs)"
    elif any(term in query_lower for term in ["director", "head", "10+", "10 plus"]):
        result["experience_level"] = "Head of Unit / Director (10+ yrs)"
    elif any(term in query_lower for term in ["expert", "lead", "technical lead"]):
        result["experience_level"] = "Expert / Technical Lead (variable)"
    
    # Check for common impact domains (keyword matching)
    impact_keywords = {
        "wash": "Water, Sanitation & Hygiene (WASH)",
        "water": "Water, Sanitation & Hygiene (WASH)",
        "sanitation": "Water, Sanitation & Hygiene (WASH)",
        "health": "Public Health & Primary Health Care",
        "education": "Education (Access & Quality)",
        "gender": "Gender Equality & Women's Empowerment",
        "protection": "Child Protection & Early Childhood Development",
        "shelter": "Shelter & CCCM",
        "nutrition": "Food Security & Nutrition",
        "food": "Food Security & Nutrition",
        "climate": "Climate & Environment",
        "disaster": "Disaster Risk Reduction & Preparedness",
        "migration": "Migration, Refugees & Displacement",
        "refugee": "Migration, Refugees & Displacement",
        "humanitarian": "Humanitarian Response & Emergency Operations",
        "meal": "Monitoring, Evaluation, Accountability & Learning (MEAL)",
        "monitoring": "Monitoring, Evaluation, Accountability & Learning (MEAL)",
    }
    
    for keyword, domain in impact_keywords.items():
        if keyword in query_lower and domain not in result["impact_domain"]:
            result["impact_domain"].append(domain)
            if len(result["impact_domain"]) >= 2:
                break
    
    # Check for common functional roles
    role_keywords = {
        "program": "Program & Field Implementation",
        "project manager": "Project Management",
        "pm": "Project Management",
        "meal": "MEAL / Research / Evidence",
        "monitoring": "Monitoring Officer / Field Monitoring",
        "data": "Data & GIS",
        "gis": "Data & GIS",
        "communications": "Communications & Advocacy",
        "grants": "Grants / Partnerships / Fundraising",
        "finance": "Finance, Accounting & Audit",
        "hr": "HR, Admin & Ops",
        "admin": "HR, Admin & Ops",
        "logistics": "Logistics, Supply Chain & Procurement",
        "procurement": "Logistics, Supply Chain & Procurement",
        "it": "IT / Digital / Systems",
        "digital": "IT / Digital / Systems",
        "security": "Security & Safety",
        "coordinator": "Program & Field Implementation",
        "officer": "Program & Field Implementation",
        "specialist": "Technical Specialists",
        "director": "Senior Leadership",
    }
    
    for keyword, role in role_keywords.items():
        if keyword in query_lower and role not in result["functional_role"]:
            result["functional_role"].append(role)
            if len(result["functional_role"]) >= 2:
                break
    
    # Extract location (simple: look for country names or common city patterns)
    # This is very basic - AI parser is much better
    common_countries = ["kenya", "nepal", "bangladesh", "ethiopia", "uganda", "tanzania", "somalia", "sudan", "yemen", "syria"]
    for country in common_countries:
        if country in query_lower:
            result["location"] = country.title()
            result["free_text"] = result["free_text"].replace(country, "").strip()
            break
    
    return result

