from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import Optional
from contextlib import asynccontextmanager
import os
import logging

from app.config import Capabilities, get_env_presence
from app.search import search_service
from app.normalizer import normalize_job_data
from app.validator import validator
import psycopg2
from app.db_config import db_config

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application lifecycle events."""
    database_url = os.getenv("DATABASE_URL")
    supabase_url = os.getenv("SUPABASE_URL")
    
    if database_url and supabase_url:
        logger.info("[aidjobs] Ignoring DATABASE_URL; using Supabase as primary DB.")
    
    yield


app = FastAPI(title="AidJobs API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/healthz")
async def healthz():
    return Capabilities.get_status()


@app.get("/api/capabilities")
async def capabilities():
    return Capabilities.get_capabilities()


@app.get("/admin/config/env")
async def config_env():
    return get_env_presence()


@app.get("/api/search/query")
async def search_query(
    q: Optional[str] = Query(None, description="Search query"),
    page: int = Query(1, description="Page number"),
    size: int = Query(20, description="Page size"),
    country: Optional[str] = Query(None, description="Filter by country"),
    level_norm: Optional[str] = Query(None, description="Filter by job level"),
    international_eligible: Optional[bool] = Query(
        None, description="Filter by international eligibility"
    ),
    mission_tags: Optional[list[str]] = Query(None, description="Filter by mission tags"),
):
    return await search_service.search_query(
        q=q,
        page=page,
        size=size,
        country=country,
        level_norm=level_norm,
        international_eligible=international_eligible,
        mission_tags=mission_tags,
    )


@app.get("/api/search/facets")
async def search_facets():
    return await search_service.get_facets()


@app.get("/admin/db/status")
async def admin_db_status():
    """Get database status (dev-only)"""
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin endpoints only available in dev mode")
    return await search_service.get_db_status()


@app.get("/admin/search/status")
async def admin_search_status():
    """Get search engine status (dev-only)"""
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin endpoints only available in dev mode")
    return await search_service.get_search_status()


@app.get("/admin/search/reindex")
@app.post("/admin/search/reindex")
async def admin_search_reindex():
    """Reindex jobs to search engine (dev-only, supports GET and POST)"""
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin endpoints only available in dev mode")
    return await search_service.reindex_jobs()


@app.get("/admin/normalize/preview")
async def admin_normalize_preview(
    source_id: Optional[str] = Query(None, description="Filter by source ID"),
    limit: int = Query(5, description="Number of records to preview"),
):
    """
    Preview normalization for job records (dev-only).
    
    Shows raw data, normalized data, and validation results.
    
    Args:
        source_id: Optional source ID to filter jobs
        limit: Number of records to preview (default: 5, max: 20)
    
    Returns:
        {
            "total": int,
            "previews": [
                {
                    "job_id": str,
                    "raw": dict,
                    "normalized": dict,
                    "validation": {
                        "valid": bool,
                        "errors": List[str],
                        "warnings": List[str]
                    }
                }
            ]
        }
    """
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin endpoints only available in dev mode")
    
    if not Capabilities.is_db_enabled():
        raise HTTPException(status_code=503, detail="Database not available")
    
    limit = min(limit, 20)
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=503, detail="Database connection not configured")
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor()
        
        if source_id:
            cursor.execute("""
                SELECT id, org_name, title, location_raw, country, country_iso, 
                       level_norm, mission_tags, international_eligible
                FROM jobs
                WHERE source_id = %s
                ORDER BY created_at DESC
                LIMIT %s
            """, (source_id, limit))
        else:
            cursor.execute("""
                SELECT id, org_name, title, location_raw, country, country_iso, 
                       level_norm, mission_tags, international_eligible
                FROM jobs
                ORDER BY created_at DESC
                LIMIT %s
            """, (limit,))
        
        rows = cursor.fetchall()
        
        cursor.execute("SELECT COUNT(*) FROM jobs" + (" WHERE source_id = %s" if source_id else ""), 
                      (source_id,) if source_id else ())
        total = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
        
        previews = []
        for row in rows:
            job_id, org_name, title, location_raw, country, country_iso, level_norm, mission_tags, international_eligible = row
            
            raw_data = {
                "org_name": org_name,
                "title": title,
                "location_raw": location_raw,
                "country": country,
                "country_iso": country_iso,
                "level_norm": level_norm,
                "mission_tags": mission_tags,
                "international_eligible": international_eligible
            }
            
            normalized_data = normalize_job_data({
                "country": country,
                "level_norm": level_norm,
                "mission_tags": mission_tags,
                "international_eligible": international_eligible
            })
            
            merged_data = {
                "country_iso": normalized_data["country_iso"] if "country_iso" in normalized_data else country_iso,
                "level_norm": normalized_data["level_norm"] if "level_norm" in normalized_data else level_norm,
                "mission_tags": normalized_data["mission_tags"] if "mission_tags" in normalized_data else mission_tags,
                "international_eligible": normalized_data["international_eligible"] if "international_eligible" in normalized_data else international_eligible
            }
            
            validation_result = validator.validate_job(merged_data)
            
            dropped_fields = []
            if country and not normalized_data.get("country_iso"):
                dropped_fields.append(f"country: '{country}' (not recognized)")
            if level_norm and not normalized_data.get("level_norm"):
                dropped_fields.append(f"level_norm: '{level_norm}' (not recognized)")
            if mission_tags:
                original_tags = set(mission_tags or [])
                normalized_tags = set(normalized_data.get("mission_tags", []))
                dropped_tags = original_tags - normalized_tags
                if dropped_tags:
                    dropped_fields.append(f"mission_tags: {list(dropped_tags)} (not recognized)")
            
            previews.append({
                "job_id": str(job_id),
                "raw": raw_data,
                "normalized": normalized_data,
                "dropped_fields": dropped_fields,
                "validation": validation_result
            })
        
        return {
            "total": total,
            "previews": previews
        }
        
    except Exception as e:
        logger.error(f"Failed to preview normalization: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to preview normalization: {str(e)}")
