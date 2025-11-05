from fastapi import FastAPI, Query, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from typing import Optional
from contextlib import asynccontextmanager
import os
import logging
import traceback
from pydantic import BaseModel

from app.config import Capabilities, get_env_presence
from app.search import search_service
from app.normalizer import normalize_job_data
from app.validator import validator
from app.admin import router as admin_router
from app.sources import router as sources_router
from app.crawl import router as crawl_router
from app.shortlist import router as shortlist_router
from app.find_earn import router as find_earn_router
from app.analytics import analytics_tracker
from app.admin_auth_routes import router as admin_auth_router
from app.rate_limit import limiter, RATE_LIMIT_SEARCH, RATE_LIMIT_SUBMIT
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
import psycopg2
from app.db_config import db_config

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    password: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application lifecycle events."""
    database_url = os.getenv("DATABASE_URL")
    supabase_url = os.getenv("SUPABASE_URL")
    
    if database_url and supabase_url:
        logger.info("[aidjobs] Ignoring DATABASE_URL; using Supabase as primary DB.")
    
    aidjobs_env = os.getenv("AIDJOBS_ENV", "production").lower()
    if aidjobs_env == "dev":
        logger.info("[aidjobs] env: AIDJOBS_ENV=dev (dev-only admin routes enabled)")
        analytics_tracker.enable()
    else:
        logger.info(f"[aidjobs] env: AIDJOBS_ENV={aidjobs_env} (admin routes disabled)")
    
    # Start crawler orchestrator
    try:
        from orchestrator import start_scheduler, stop_scheduler
        # Only use PostgreSQL connection strings (not SUPABASE_URL which is HTTPS)
        db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
        if db_url:
            await start_scheduler(db_url)
        else:
            logger.warning("[orchestrator] No PostgreSQL database URL configured (need SUPABASE_DB_URL or DATABASE_URL), scheduler not started")
    except Exception as e:
        logger.error(f"[orchestrator] Failed to start scheduler: {e}")
    
    yield
    
    # Shutdown
    try:
        await stop_scheduler()
    except:
        pass


app = FastAPI(title="AidJobs API", version="0.1.0", lifespan=lifespan)

# Add rate limiter state
app.state.limiter = limiter

# Rate limit exceeded handler
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Error masking middleware
@app.middleware("http")
async def error_masking_middleware(request: Request, call_next):
    """Mask detailed errors in production; show full errors in dev."""
    try:
        response = await call_next(request)
        return response
    except HTTPException:
        # Let HTTPException propagate untouched (proper status codes like 404, 400, 401, etc.)
        raise
    except Exception as e:
        is_dev = os.getenv("AIDJOBS_ENV", "").lower() == "dev"
        
        # Log the full error
        logger.error(f"Unhandled error: {str(e)}")
        if is_dev:
            logger.error(traceback.format_exc())
        
        # Return masked or detailed error based on environment
        if is_dev:
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "error": str(e),
                    "traceback": traceback.format_exc()
                }
            )
        else:
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "error": "An internal error occurred. Please try again later."
                }
            )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",
        "https://ece7b4ba-3a82-477c-a281-2adcc8be6f96-00-1j1pwa2ohhygd.spock.replit.dev"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(admin_auth_router)
app.include_router(admin_router)
app.include_router(sources_router)
app.include_router(crawl_router)
app.include_router(shortlist_router)
app.include_router(find_earn_router)

# Add new crawler admin routes
try:
    from app.crawler_admin import router as crawler_admin_router, robots_router, policies_router
    app.include_router(crawler_admin_router)
    app.include_router(robots_router)
    app.include_router(policies_router)
except ImportError as e:
    logger.warning(f"[main] Could not import crawler_admin routes: {e}")




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
@limiter.limit(RATE_LIMIT_SEARCH)
async def search_query(
    request: Request,
    q: Optional[str] = Query(None, description="Search query"),
    page: int = Query(1, description="Page number", ge=1),
    size: int = Query(20, description="Page size", ge=1, le=100),
    sort: Optional[str] = Query(None, description="Sort order: relevance, newest, closing_soon"),
    country: Optional[str] = Query(None, description="Filter by country (name or ISO-2)"),
    level_norm: Optional[str] = Query(None, description="Filter by job level"),
    international_eligible: Optional[bool] = Query(None, description="Filter by international eligibility"),
    mission_tags: Optional[list[str]] = Query(None, description="Filter by mission tags"),
    work_modality: Optional[str] = Query(None, description="Filter by work modality"),
    career_type: Optional[str] = Query(None, description="Filter by career type"),
    org_type: Optional[str] = Query(None, description="Filter by organization type"),
    crisis_type: Optional[list[str]] = Query(None, description="Filter by crisis type"),
    response_phase: Optional[str] = Query(None, description="Filter by response phase"),
    humanitarian_cluster: Optional[list[str]] = Query(None, description="Filter by humanitarian cluster"),
    benefits: Optional[list[str]] = Query(None, description="Filter by benefits"),
    policy_flags: Optional[list[str]] = Query(None, description="Filter by policy flags"),
    donor_context: Optional[list[str]] = Query(None, description="Filter by donor context"),
):
    return await search_service.search_query(
        q=q,
        page=page,
        size=size,
        sort=sort,
        country=country,
        level_norm=level_norm,
        international_eligible=international_eligible,
        mission_tags=mission_tags,
        work_modality=work_modality,
        career_type=career_type,
        org_type=org_type,
        crisis_type=crisis_type,
        response_phase=response_phase,
        humanitarian_cluster=humanitarian_cluster,
        benefits=benefits,
        policy_flags=policy_flags,
        donor_context=donor_context,
    )


@app.get("/api/search/facets")
async def search_facets():
    return await search_service.get_facets()


@app.get("/api/jobs/{job_id}")
async def get_job_by_id(job_id: str):
    """Get a single job by ID from database (preferred) or Meilisearch fallback."""
    result = await search_service.get_job_by_id(job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return result


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


@app.get("/admin/search/settings")
async def admin_search_settings():
    """Get Meilisearch index settings for verification (dev-only)"""
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin endpoints only available in dev mode")
    return await search_service.get_search_settings()


@app.post("/admin/search/init")
async def admin_search_init():
    """Initialize Meilisearch index (dev-only, idempotent)"""
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin endpoints only available in dev mode")
    
    try:
        search_service._init_meilisearch()
        return {
            "success": True,
            "message": "Meilisearch index initialized successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@app.get("/admin/search/reindex")
@app.post("/admin/search/reindex")
async def admin_search_reindex():
    """Reindex jobs to search engine (dev-only, supports GET and POST)"""
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin endpoints only available in dev mode")
    return await search_service.reindex_jobs()


@app.post("/admin/normalize/reindex")
async def admin_normalize_reindex():
    """
    Normalize and reindex all jobs (dev-only).
    
    Guarantees normalization before indexing to Meilisearch.
    This is an explicit wrapper around the reindex functionality.
    """
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin endpoints only available in dev mode")
    
    return await search_service.reindex_jobs()


@app.get("/admin/normalize/report")
async def admin_normalize_report():
    """
    Get comprehensive normalization statistics (dev-only).
    
    Returns stats about normalized vs unknown values for all normalizable fields.
    """
    env = os.getenv("AIDJOBS_ENV", "").lower()
    if env != "dev":
        raise HTTPException(status_code=403, detail="Admin endpoints only available in dev mode")
    
    if not Capabilities.is_db_enabled():
        return {
            "ok": False,
            "error": "Database not available"
        }
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        return {
            "ok": False,
            "error": "Database connection not configured"
        }
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=2)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM jobs")
        total_jobs = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM sources")
        total_sources = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM countries")
        countries_count = cursor.fetchone()[0] if cursor.rowcount > 0 else 0
        
        cursor.execute("SELECT COUNT(*) FROM levels")
        levels_count = cursor.fetchone()[0] if cursor.rowcount > 0 else 0
        
        cursor.execute("SELECT COUNT(*) FROM tags")
        tags_count = cursor.fetchone()[0] if cursor.rowcount > 0 else 0
        
        fallback_used = countries_count == 0 or levels_count == 0 or tags_count == 0
        
        cursor.execute("""
            SELECT country, COUNT(*) as count
            FROM jobs
            WHERE country IS NOT NULL AND country_iso IS NULL
            GROUP BY country
            ORDER BY count DESC
            LIMIT 10
        """)
        top_unknown_countries = [{"value": row[0], "count": row[1]} for row in cursor.fetchall()]
        
        cursor.execute("""
            SELECT COUNT(*) FROM jobs WHERE country_iso IS NOT NULL
        """)
        normalized_countries = cursor.fetchone()[0]
        
        cursor.execute("""
            SELECT COUNT(*) FROM jobs WHERE country IS NOT NULL AND country_iso IS NULL
        """)
        unknown_countries = cursor.fetchone()[0]
        
        valid_levels = {'Intern', 'Junior', 'Mid', 'Senior', 'Lead'}
        cursor.execute(f"""
            SELECT level_norm, COUNT(*) as count
            FROM jobs
            WHERE level_norm IS NOT NULL AND level_norm NOT IN {tuple(valid_levels)}
            GROUP BY level_norm
            ORDER BY count DESC
            LIMIT 10
        """)
        top_unknown_levels = [{"value": row[0], "count": row[1]} for row in cursor.fetchall()]
        
        cursor.execute(f"""
            SELECT COUNT(*) FROM jobs WHERE level_norm IN {tuple(valid_levels)}
        """)
        normalized_levels = cursor.fetchone()[0]
        
        cursor.execute(f"""
            SELECT COUNT(*) FROM jobs WHERE level_norm IS NOT NULL AND level_norm NOT IN {tuple(valid_levels)}
        """)
        unknown_levels = cursor.fetchone()[0]
        
        cursor.execute("""
            SELECT COUNT(*) FROM jobs WHERE international_eligible = TRUE
        """)
        true_count = cursor.fetchone()[0]
        
        cursor.execute("""
            SELECT COUNT(*) FROM jobs WHERE international_eligible = FALSE
        """)
        false_count = cursor.fetchone()[0]
        
        cursor.execute("""
            SELECT COUNT(*) FROM jobs WHERE international_eligible IS NULL
        """)
        null_count = cursor.fetchone()[0]
        
        cursor.execute("""
            SELECT tag, COUNT(*) as count
            FROM jobs, UNNEST(mission_tags) as tag
            WHERE tag NOT IN (SELECT key FROM tags)
            GROUP BY tag
            ORDER BY count DESC
            LIMIT 10
        """)
        top_unknown_tags = [{"value": row[0], "count": row[1]} for row in cursor.fetchall()]
        
        cursor.execute("""
            SELECT COUNT(*) FROM jobs
            WHERE EXISTS (
                SELECT 1 FROM UNNEST(mission_tags) as tag
                WHERE tag IN (SELECT key FROM tags)
            )
        """)
        normalized_tags_result = cursor.fetchone()
        normalized_tags = normalized_tags_result[0] if normalized_tags_result else 0
        
        cursor.execute("""
            SELECT COUNT(*) FROM jobs
            WHERE EXISTS (
                SELECT 1 FROM UNNEST(mission_tags) as tag
                WHERE tag NOT IN (SELECT key FROM tags)
            ) AND array_length(mission_tags, 1) > 0
        """)
        unknown_tags_result = cursor.fetchone()
        unknown_tags = unknown_tags_result[0] if unknown_tags_result else 0
        
        cursor.close()
        conn.close()
        
        return {
            "ok": True,
            "totals": {
                "jobs": total_jobs,
                "sources": total_sources
            },
            "country": {
                "normalized": normalized_countries,
                "unknown": unknown_countries,
                "top_unknown": top_unknown_countries
            },
            "level_norm": {
                "normalized": normalized_levels,
                "unknown": unknown_levels,
                "top_unknown": top_unknown_levels
            },
            "international_eligible": {
                "true_count": true_count,
                "false_count": false_count,
                "null_count": null_count
            },
            "mission_tags": {
                "normalized": normalized_tags,
                "unknown": unknown_tags,
                "top_unknown": top_unknown_tags
            },
            "mapping_tables": {
                "countries": countries_count,
                "levels": levels_count,
                "tags": tags_count
            },
            "notes": {
                "fallback_used": fallback_used
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to generate normalization report: {e}")
        return {
            "ok": False,
            "error": str(e)
        }


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
