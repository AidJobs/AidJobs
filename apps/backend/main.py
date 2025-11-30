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
from app.presets import router as presets_router
from app.rate_limit import limiter, RATE_LIMIT_SEARCH, RATE_LIMIT_SUBMIT
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from security.admin_auth import admin_required
import psycopg2
from app.db_config import db_config
from app.query_parser import parse_query
from app.autocomplete import get_suggestions
from app.enrichment import enrich_and_save_job, batch_enrich_jobs

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
        "https://ece7b4ba-3a82-477c-a281-2adcc8be6f96-00-1j1pwa2ohhygd.spock.replit.dev",
        # Vercel deployments (production and preview)
        "https://*.vercel.app",
        # Custom domain
        "https://aidjobs.app",
        "https://www.aidjobs.app",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(admin_auth_router)
app.include_router(admin_router)
app.include_router(sources_router)
app.include_router(presets_router)
app.include_router(crawl_router)
app.include_router(shortlist_router)
app.include_router(find_earn_router)

# Add new crawler admin routes
try:
    from app.crawler_admin import router as crawler_admin_router, robots_router, policies_router, quality_router
    app.include_router(crawler_admin_router)
    app.include_router(robots_router)
    app.include_router(policies_router)
    app.include_router(quality_router)
except ImportError as e:
    logger.warning(f"[main] Could not import crawler_admin routes: {e}")




@app.get("/api/healthz")
async def healthz():
    return Capabilities.get_status()


@app.get("/api/capabilities")
async def capabilities():
    return Capabilities.get_capabilities()


@app.get("/api/search/status")
async def search_status():
    """Get Meilisearch status (public endpoint, production-safe)"""
    try:
        result = await search_service.get_search_status()
        return result
    except Exception as e:
        logger.error(f"[api/search/status] Error: {e}", exc_info=True)
        return {
            "enabled": False,
            "error": "Failed to get search status"
        }


@app.get("/api/db/status")
async def db_status():
    """Get database status with job count (public endpoint, production-safe)"""
    try:
        result = await search_service.get_db_status()
        return result
    except Exception as e:
        logger.error(f"[api/db/status] Error: {e}", exc_info=True)
        return {
            "ok": False,
            "error": "Failed to get database status"
        }


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
    # Trinity Search enrichment filters
    impact_domain: Optional[list[str]] = Query(None, description="Filter by impact domain"),
    functional_role: Optional[list[str]] = Query(None, description="Filter by functional role"),
    experience_level: Optional[str] = Query(None, description="Filter by experience level"),
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
        impact_domain=impact_domain,
        functional_role=functional_role,
        experience_level=experience_level,
    )


@app.get("/api/search/facets")
async def search_facets():
    return await search_service.get_facets()


@app.post("/api/search/parse")
@limiter.limit(RATE_LIMIT_SEARCH)
async def parse_search_query(
    request: Request,
    body: dict,
):
    """Parse a natural language search query into structured filters."""
    query = body.get("query", "")
    if not query:
        return {
            "status": "ok",
            "data": {
                "impact_domain": [],
                "functional_role": [],
                "experience_level": "",
                "location": "",
                "is_remote": False,
                "free_text": "",
            },
            "error": None,
        }
    
    try:
        parsed = parse_query(query)
        if parsed:
            return {
                "status": "ok",
                "data": parsed,
                "error": None,
            }
        else:
            return {
                "status": "error",
                "data": None,
                "error": "Failed to parse query",
            }
    except Exception as e:
        logger.error(f"[api/search/parse] Error: {e}", exc_info=True)
        return {
            "status": "error",
            "data": None,
            "error": str(e),
        }


@app.get("/api/search/autocomplete")
@limiter.limit(RATE_LIMIT_SEARCH)
async def autocomplete_suggestions(
    request: Request,
    q: Optional[str] = Query(None, description="Partial search text"),
):
    """Get autocomplete suggestions based on partial text."""
    if not q:
        return {
            "status": "ok",
            "data": [],
            "error": None,
        }
    
    try:
        suggestions = get_suggestions(q)
        return {
            "status": "ok",
            "data": suggestions,
            "error": None,
        }
    except Exception as e:
        logger.error(f"[api/search/autocomplete] Error: {e}", exc_info=True)
        return {
            "status": "error",
            "data": [],
            "error": str(e),
        }


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
async def admin_search_init(admin: str = Depends(admin_required)):
    """Initialize Meilisearch index (admin-only, idempotent)"""
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
async def admin_search_reindex(admin: str = Depends(admin_required)):
    """Reindex jobs to search engine (admin-only, supports GET and POST)"""
    return await search_service.reindex_jobs()


@app.post("/admin/jobs/enrich")
async def admin_enrich_job(
    request: Request,
    body: dict,
    admin: str = Depends(admin_required),
):
    """Manually enrich a single job."""
    job_id = body.get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required")
    
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        
        conn_params = db_config.get_connection_params()
        if not conn_params:
            raise HTTPException(status_code=503, detail="Database not configured")
        
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT id::text, title, description_snippet, org_name, location_raw, functional_tags, apply_url
            FROM jobs
            WHERE id::text = %s
        """, (job_id,))
        
        job = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
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
            apply_url=job.get("apply_url"),
        )
        
        if success:
            return {
                "status": "ok",
                "data": {"job_id": job_id, "enriched": True},
                "error": None,
            }
        else:
            return {
                "status": "error",
                "data": None,
                "error": "Failed to enrich job",
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[admin/jobs/enrich] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/jobs/enrich/batch")
async def admin_enrich_jobs_batch(
    request: Request,
    body: dict,
    admin: str = Depends(admin_required),
):
    """Manually enrich multiple jobs in batch."""
    job_ids = body.get("job_ids", [])
    if not job_ids or not isinstance(job_ids, list):
        raise HTTPException(status_code=400, detail="job_ids array is required")
    
    if len(job_ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 jobs per batch")
    
    try:
        result = batch_enrich_jobs(job_ids)
        return {
            "status": "ok",
            "data": result,
            "error": None,
        }
    except Exception as e:
        logger.error(f"[admin/jobs/enrich/batch] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Enrichment Review Queue Endpoints
@app.get("/admin/enrichment/review-queue")
async def get_enrichment_review_queue(
    status: str = "pending",
    limit: int = 50,
    offset: int = 0,
    admin: str = Depends(admin_required),
):
    """Get jobs in the enrichment review queue."""
    from app.enrichment_review import get_review_queue
    
    try:
        reviews = get_review_queue(status=status, limit=limit, offset=offset)
        return {
            "status": "ok",
            "data": {
                "reviews": reviews,
                "count": len(reviews),
                "status": status,
            },
            "error": None,
        }
    except Exception as e:
        logger.error(f"[admin/enrichment/review-queue] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/enrichment/review/{review_id}")
async def update_enrichment_review(
    review_id: str,
    request: Request,
    body: dict,
    admin: str = Depends(admin_required),
):
    """Update a review entry (approve, reject, or add corrections)."""
    from app.enrichment_review import update_review
    
    status = body.get("status")
    reviewer_id = body.get("reviewer_id")
    review_notes = body.get("review_notes")
    corrected_enrichment = body.get("corrected_enrichment")
    
    if not status:
        raise HTTPException(status_code=400, detail="status is required")
    
    try:
        success = update_review(
            review_id=review_id,
            status=status,
            reviewer_id=reviewer_id,
            review_notes=review_notes,
            corrected_enrichment=corrected_enrichment,
        )
        
        if success:
            return {
                "status": "ok",
                "data": {"review_id": review_id, "status": status},
                "error": None,
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to update review")
    except Exception as e:
        logger.error(f"[admin/enrichment/review] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/enrichment/history/{job_id}")
async def get_enrichment_history(
    job_id: str,
    limit: int = 50,
    admin: str = Depends(admin_required),
):
    """Get enrichment history for a job."""
    from app.enrichment_history import get_enrichment_history
    
    try:
        history = get_enrichment_history(job_id=job_id, limit=limit)
        return {
            "status": "ok",
            "data": {
                "job_id": job_id,
                "history": history,
                "count": len(history),
            },
            "error": None,
        }
    except Exception as e:
        logger.error(f"[admin/enrichment/history] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/enrichment/quality-dashboard")
async def get_enrichment_quality_dashboard(
    admin: str = Depends(admin_required),
):
    """Get enrichment quality dashboard with comprehensive metrics."""
    from app.enrichment_dashboard import get_enrichment_quality_dashboard
    
    try:
        metrics = get_enrichment_quality_dashboard()
        return {
            "status": "ok",
            "data": metrics,
            "error": None,
        }
    except Exception as e:
        logger.error(f"[admin/enrichment/quality-dashboard] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/enrichment/unenriched-count")
async def get_unenriched_count(
    admin: str = Depends(admin_required),
):
    """Get count of jobs without enrichment data."""
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        
        conn_params = db_config.get_connection_params()
        if not conn_params:
            raise HTTPException(status_code=503, detail="Database not configured")
        
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM jobs
            WHERE status = 'active'
            AND deleted_at IS NULL
            AND (deadline IS NULL OR deadline >= CURRENT_DATE)
            AND (impact_domain IS NULL OR impact_domain = '[]'::jsonb)
        """)
        
        result = cursor.fetchone()
        count = result['count'] if result else 0
        
        cursor.close()
        conn.close()
        
        return {
            "status": "ok",
            "data": {"count": count},
            "error": None,
        }
    except Exception as e:
        logger.error(f"[admin/enrichment/unenriched-count] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/enrichment/unenriched-jobs")
async def get_unenriched_jobs(
    limit: int = Query(50, ge=1, le=100),
    admin: str = Depends(admin_required),
):
    """Get list of job IDs that need enrichment."""
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        
        conn_params = db_config.get_connection_params()
        if not conn_params:
            raise HTTPException(status_code=503, detail="Database not configured")
        
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT id::text as job_id
            FROM jobs
            WHERE status = 'active'
            AND deleted_at IS NULL
            AND (deadline IS NULL OR deadline >= CURRENT_DATE)
            AND (impact_domain IS NULL OR impact_domain = '[]'::jsonb)
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))
        
        results = cursor.fetchall()
        job_ids = [row['job_id'] for row in results]
        
        cursor.close()
        conn.close()
        
        return {
            "status": "ok",
            "data": {"job_ids": job_ids, "count": len(job_ids)},
            "error": None,
        }
    except Exception as e:
        logger.error(f"[admin/enrichment/unenriched-jobs] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Enrichment Feedback Endpoints
@app.post("/admin/enrichment/feedback")
async def submit_enrichment_feedback(
    request: Request,
    body: dict,
    admin: str = Depends(admin_required),
):
    """Submit feedback about an enrichment error."""
    from app.enrichment_feedback import submit_feedback
    
    job_id = body.get("job_id")
    feedback_type = body.get("feedback_type")
    field_name = body.get("field_name")
    original_value = body.get("original_value")
    corrected_value = body.get("corrected_value")
    feedback_notes = body.get("feedback_notes")
    submitted_by = body.get("submitted_by")
    
    if not all([job_id, feedback_type, field_name]):
        raise HTTPException(status_code=400, detail="job_id, feedback_type, and field_name are required")
    
    try:
        success = submit_feedback(
            job_id=job_id,
            feedback_type=feedback_type,
            field_name=field_name,
            original_value=original_value,
            corrected_value=corrected_value,
            feedback_notes=feedback_notes,
            submitted_by=submitted_by,
        )
        
        if success:
            return {
                "status": "ok",
                "data": {"message": "Feedback submitted successfully"},
                "error": None,
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to submit feedback")
    except Exception as e:
        logger.error(f"[admin/enrichment/feedback] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/enrichment/feedback/patterns")
async def get_enrichment_feedback_patterns(
    field_name: Optional[str] = None,
    limit: int = 100,
    admin: str = Depends(admin_required),
):
    """Get feedback patterns to identify systematic errors."""
    from app.enrichment_feedback import get_feedback_patterns
    
    try:
        patterns = get_feedback_patterns(field_name=field_name, limit=limit)
        return {
            "status": "ok",
            "data": {
                "patterns": patterns,
                "count": len(patterns),
            },
            "error": None,
        }
    except Exception as e:
        logger.error(f"[admin/enrichment/feedback/patterns] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Ground Truth Endpoints
@app.post("/admin/enrichment/ground-truth")
async def add_ground_truth(
    request: Request,
    body: dict,
    admin: str = Depends(admin_required),
):
    """Add a ground truth entry (manually labeled job)."""
    from app.enrichment_ground_truth import add_ground_truth
    
    job_id = body.get("job_id")
    title = body.get("title")
    description_snippet = body.get("description_snippet")
    org_name = body.get("org_name")
    location_raw = body.get("location_raw")
    impact_domain = body.get("impact_domain", [])
    functional_role = body.get("functional_role", [])
    experience_level = body.get("experience_level")
    sdgs = body.get("sdgs", [])
    labeled_by = body.get("labeled_by", "admin")
    notes = body.get("notes")
    
    if not job_id or not title:
        raise HTTPException(status_code=400, detail="job_id and title are required")
    
    try:
        success = add_ground_truth(
            job_id=job_id,
            title=title,
            description_snippet=description_snippet,
            org_name=org_name,
            location_raw=location_raw,
            impact_domain=impact_domain,
            functional_role=functional_role,
            experience_level=experience_level,
            sdgs=sdgs,
            labeled_by=labeled_by,
            notes=notes,
        )
        
        if success:
            return {
                "status": "ok",
                "data": {"message": "Ground truth added successfully"},
                "error": None,
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to add ground truth")
    except Exception as e:
        logger.error(f"[admin/enrichment/ground-truth] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/enrichment/validate/{job_id}")
async def validate_enrichment_accuracy(
    job_id: str,
    admin: str = Depends(admin_required),
):
    """Validate AI enrichment against ground truth for a job."""
    from app.enrichment_ground_truth import validate_enrichment_accuracy
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from app.db_config import db_config
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    try:
        # Get current AI enrichment
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT 
                impact_domain, functional_role, experience_level, sdgs,
                confidence_overall
            FROM jobs
            WHERE id::text = %s
        """, (job_id,))
        
        job = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        ai_enrichment = {
            "impact_domain": job.get("impact_domain", []),
            "functional_role": job.get("functional_role", []),
            "experience_level": job.get("experience_level"),
            "sdgs": job.get("sdgs", []),
        }
        
        # Validate against ground truth
        results = validate_enrichment_accuracy(job_id, ai_enrichment)
        
        return {
            "status": "ok",
            "data": results,
            "error": None,
        }
    except Exception as e:
        logger.error(f"[admin/enrichment/validate] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Consistency Validation Endpoints
@app.get("/admin/enrichment/consistency/{job_id}")
async def check_enrichment_consistency(
    job_id: str,
    admin: str = Depends(admin_required),
):
    """Check if a job's enrichment is consistent with similar jobs."""
    from app.enrichment_consistency import check_consistency
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from app.db_config import db_config
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    try:
        # Get current enrichment
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT 
                impact_domain, functional_role, experience_level, sdgs
            FROM jobs
            WHERE id::text = %s
        """, (job_id,))
        
        job = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        enrichment = {
            "impact_domain": job.get("impact_domain", []),
            "functional_role": job.get("functional_role", []),
            "experience_level": job.get("experience_level"),
            "sdgs": job.get("sdgs", []),
        }
        
        # Check consistency
        results = check_consistency(job_id, enrichment)
        
        return {
            "status": "ok",
            "data": results,
            "error": None,
        }
    except Exception as e:
        logger.error(f"[admin/enrichment/consistency] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
