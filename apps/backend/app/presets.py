"""
Presets endpoint for API source configurations.
Provides pre-configured schemas for common job APIs.
"""
import logging
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any

from security.admin_auth import admin_required

logger = logging.getLogger(__name__)
router = APIRouter()


# ReliefWeb Jobs API preset
RELIEFWEB_JOBS_PRESET = {
    "name": "ReliefWeb Jobs",
    "description": "ReliefWeb Jobs API - UN and humanitarian organization jobs",
    "org_name": "ReliefWeb",
    "org_type": "UN",
    "source_type": "api",
    "crawl_frequency_days": 1,
    "parser_hint": {
        "v": 1,
        "base_url": "https://api.reliefweb.int",
        "path": "/v1/jobs",
        "method": "POST",
        "auth": {
            "type": "none"
        },
        "headers": {
            "Content-Type": "application/json"
        },
        "body": {
            "profile": "list",
            "query": {
                "value": "job"
            },
            "limit": 1000,
            "offset": 0
        },
        "pagination": {
            "type": "offset",
            "limit_param": "limit",
            "offset_param": "offset",
            "page_size": 1000,
            "max_pages": 10,
            "until_empty": True
        },
        "since": {
            "enabled": True,
            "field": "date.created",
            "format": "iso8601",
            "operator": ">=",
            "fallback_days": 7
        },
        "data_path": "data",
        "map": {
            "id": "id",
            "title": "fields.title",
            "description_snippet": "fields.body",
            "org_name": "fields.source.name",
            "apply_url": "fields.url",
            "location_raw": "fields.country.name",
            "country": "fields.country.name",
            "country_iso": "fields.country.iso3",
            "mission_tags": "fields.theme.name",
            "level_norm": "fields.experience.name",
            "deadline": "fields.date.closing",
            "created_at": "fields.date.created"
        },
        "transforms": {
            "location_raw": {
                "join": ", "
            },
            "country": {
                "first": True
            },
            "country_iso": {
                "first": True
            },
            "mission_tags": {
                "join": ", "
            },
            "level_norm": {
                "first": True
            }
        },
        "throttle": {
            "enabled": True,
            "requests_per_minute": 60,
            "burst": 10
        },
        "success_codes": [200],
        "retry": {
            "max_retries": 2,
            "backoff_ms": 1000
        }
    }
}

# JSONPlaceholder preset (for testing)
JSONPLACEHOLDER_PRESET = {
    "name": "JSONPlaceholder (Test)",
    "description": "JSONPlaceholder API - Public test API for development",
    "org_name": "JSONPlaceholder",
    "org_type": "NGO",
    "source_type": "api",
    "crawl_frequency_days": 7,
    "parser_hint": {
        "v": 1,
        "base_url": "https://jsonplaceholder.typicode.com",
        "path": "/posts",
        "method": "GET",
        "auth": {
            "type": "none"
        },
        "headers": {},
        "query": {
            "_limit": 10
        },
        "pagination": {
            "type": "offset",
            "offset_param": "_start",
            "limit_param": "_limit",
            "page_size": 10,
            "max_pages": 1
        },
        "data_path": "$",
        "map": {
            "title": "title",
            "description_snippet": "body"
        },
        "success_codes": [200]
    }
}

# All presets
PRESETS = [
    RELIEFWEB_JOBS_PRESET,
    JSONPLACEHOLDER_PRESET
]


@router.get("/admin/presets/sources")
def get_source_presets(admin: str = Depends(admin_required)):
    """
    Get list of available source presets.
    
    Returns:
        List of preset configurations with name, description, and parser_hint
    """
    try:
        # Return presets with parser_hint as JSON string (for compatibility with frontend)
        presets_response = []
        for preset in PRESETS:
            preset_copy = preset.copy()
            # Convert parser_hint dict to JSON string
            if isinstance(preset_copy.get("parser_hint"), dict):
                import json
                preset_copy["parser_hint"] = json.dumps(preset_copy["parser_hint"], indent=2)
            presets_response.append(preset_copy)
        
        return {
            "status": "ok",
            "data": presets_response,
            "error": None
        }
    except Exception as e:
        logger.error(f"Failed to get presets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/presets/sources/{preset_name}")
def get_source_preset(preset_name: str, admin: str = Depends(admin_required)):
    """
    Get a specific preset by name.
    
    Args:
        preset_name: Name of the preset (e.g., "ReliefWeb Jobs")
    
    Returns:
        Preset configuration
    """
    try:
        # Find preset by name (case-insensitive)
        preset_name_lower = preset_name.lower()
        for preset in PRESETS:
            if preset["name"].lower() == preset_name_lower:
                preset_copy = preset.copy()
                # Convert parser_hint dict to JSON string
                if isinstance(preset_copy.get("parser_hint"), dict):
                    import json
                    preset_copy["parser_hint"] = json.dumps(preset_copy["parser_hint"], indent=2)
                return {
                    "status": "ok",
                    "data": preset_copy,
                    "error": None
                }
        
        raise HTTPException(status_code=404, detail=f"Preset '{preset_name}' not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get preset: {e}")
        raise HTTPException(status_code=500, detail=str(e))

