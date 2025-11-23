"""
Admin endpoints for taxonomy management (dev-only).
"""
import os
from typing import Any, Optional
from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel, Field
from app.db_config import db_config
from app.normalizer import normalize_job_data
from app.search import search_service
from app.analytics import analytics_tracker

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None


def require_dev_mode():
    """Dependency that ensures endpoint is only accessible in dev mode."""
    aidjobs_env = os.getenv("AIDJOBS_ENV", "").lower()
    if aidjobs_env != "dev":
        raise HTTPException(
            status_code=403,
            detail="Admin taxonomy endpoints are only available in development mode (AIDJOBS_ENV=dev)"
        )


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_dev_mode)])

# Lookup table names
LOOKUP_TABLES = [
    "missions",
    "levels",
    "work_modalities",
    "contracts",
    "org_types",
    "crisis_types",
    "clusters",
    "response_phases",
    "benefits",
    "policy_flags",
    "donors",
]


@router.get("/dev/status")
async def dev_status() -> dict[str, Any]:
    """Dev mode status endpoint."""
    return {
        "env": os.getenv("AIDJOBS_ENV", "production"),
        "dev_enabled": True
    }


@router.get("/diagnostics/meili-openrouter")
async def diagnostics_meili_openrouter() -> dict[str, Any]:
    """
    Detailed diagnostics for Meilisearch and OpenRouter configuration.
    Shows what the backend actually sees from environment variables.
    """
    from app.search import search_service
    from app.ai_service import get_ai_service
    
    diagnostics = {
        "meilisearch": {
            "enabled": False,
            "configured": False,
            "connected": False,
            "error": None,
            "env_vars": {},
            "client_status": None,
            "index_status": None
        },
        "openrouter": {
            "enabled": False,
            "configured": False,
            "api_key_set": False,
            "model": None,
            "error": None
        }
    }
    
    # Check Meilisearch
    meili_url = os.getenv("MEILISEARCH_URL")
    meili_key = os.getenv("MEILISEARCH_KEY")
    meili_host = os.getenv("MEILI_HOST")
    meili_master_key = os.getenv("MEILI_MASTER_KEY")
    meili_api_key = os.getenv("MEILI_API_KEY")
    meili_index = os.getenv("MEILI_JOBS_INDEX", "jobs_index")
    enable_search = os.getenv("AIDJOBS_ENABLE_SEARCH", "true").lower()
    
    diagnostics["meilisearch"]["env_vars"] = {
        "MEILISEARCH_URL": "SET" if meili_url else "NOT SET",
        "MEILISEARCH_KEY": "SET" if meili_key else "NOT SET",
        "MEILI_HOST": "SET" if meili_host else "NOT SET",
        "MEILI_MASTER_KEY": "SET" if meili_master_key else "NOT SET",
        "MEILI_API_KEY": "SET" if meili_api_key else "NOT SET",
        "MEILI_JOBS_INDEX": meili_index,
        "AIDJOBS_ENABLE_SEARCH": enable_search
    }
    
    has_new_config = bool(meili_url and meili_key)
    has_legacy_config = bool(meili_host and (meili_master_key or meili_api_key))
    diagnostics["meilisearch"]["configured"] = has_new_config or has_legacy_config
    diagnostics["meilisearch"]["enabled"] = search_service.meili_enabled if search_service else False
    
    if search_service:
        diagnostics["meilisearch"]["client_status"] = "initialized" if search_service.meili_client else "not initialized"
        diagnostics["meilisearch"]["error"] = search_service.meili_error
        
        if search_service.meili_client:
            try:
                health = search_service.meili_client.health()
                diagnostics["meilisearch"]["connected"] = health.get("status") == "available"
                
                # Check index
                try:
                    index = search_service.meili_client.get_index(meili_index)
                    stats = index.get_stats()
                    # IndexStats is an object, not a dict - access attributes directly
                    diagnostics["meilisearch"]["index_status"] = {
                        "exists": True,
                        "documents": getattr(stats, "number_of_documents", 0),
                        "indexing": getattr(stats, "is_indexing", False)
                    }
                except Exception as e:
                    diagnostics["meilisearch"]["index_status"] = {
                        "exists": False,
                        "error": str(e)
                    }
            except Exception as e:
                diagnostics["meilisearch"]["connected"] = False
                diagnostics["meilisearch"]["error"] = str(e)
    
    # Check OpenRouter
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    openrouter_model = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    
    diagnostics["openrouter"]["api_key_set"] = bool(openrouter_key)
    diagnostics["openrouter"]["configured"] = bool(openrouter_key)
    diagnostics["openrouter"]["model"] = openrouter_model
    
    ai_service = get_ai_service()
    diagnostics["openrouter"]["enabled"] = ai_service.enabled if ai_service else False
    
    return {
        "status": "ok",
        "data": diagnostics
    }


@router.get("/setup/status")
async def setup_status() -> dict[str, Any]:
    """
    Check status of all configured providers.
    Returns: supabase, meilisearch, payments, ai statuses.
    """
    import time
    from datetime import datetime
    
    status = {
        "supabase": "fail",
        "meili": "fail",
        "payments": {
            "paypal": False,
            "razorpay": False
        },
        "ai": False,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "versions": {
            "python": "3.11",
            "fastapi": "0.115.0"
        },
        "env_vars": {
            "supabase": ["SUPABASE_DB_URL", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"],
            "meilisearch": ["MEILISEARCH_URL", "MEILISEARCH_KEY", "MEILI_HOST", "MEILI_MASTER_KEY", "MEILI_API_KEY"],
            "payments": {
                "paypal": ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
                "razorpay": ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]
            },
            "ai": ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]
        }
    }
    
    # Check Supabase
    try:
        conn = _get_db_connection()
        if conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
            conn.close()
            status["supabase"] = "ok"
        else:
            status["supabase"] = "warn"
    except Exception as e:
        status["supabase"] = "fail"
    
    # Check Meilisearch
    try:
        from app.search import search_service
        if search_service and search_service.meili_enabled and search_service.meili_client:
            health = search_service.meili_client.health()
            status["meili"] = "ok" if health.get("status") == "available" else "warn"
        else:
            # Check if config exists but not initialized
            meili_url = os.getenv("MEILISEARCH_URL") or os.getenv("MEILI_HOST")
            meili_key = os.getenv("MEILISEARCH_KEY") or os.getenv("MEILI_MASTER_KEY") or os.getenv("MEILI_API_KEY")
            if meili_url and meili_key:
                status["meili"] = "warn"  # Config exists but not connected
            else:
                status["meili"] = "fail"  # No config
    except Exception as e:
        status["meili"] = "fail"
        status["meili_error"] = str(e)
    
    # Check payment providers
    status["payments"]["paypal"] = bool(os.getenv("PAYPAL_CLIENT_ID") and os.getenv("PAYPAL_CLIENT_SECRET"))
    status["payments"]["razorpay"] = bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"))
    
    # Check AI providers (OpenRouter)
    status["ai"] = bool(os.getenv("OPENROUTER_API_KEY"))
    # Also check legacy AI providers for backward compatibility
    if not status["ai"]:
        status["ai"] = bool(os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY"))
    
    return {
        "status": "ok",
        "data": status
    }


@router.get("/metrics")
async def get_metrics() -> dict[str, Any]:
    """
    Dev-only analytics metrics endpoint.
    Returns last 20 queries, average latency, and hit rates.
    """
    metrics = analytics_tracker.get_metrics()
    return {
        "status": "ok",
        "data": metrics,
        "error": None,
    }


def _get_db_connection():
    """Get database connection or None."""
    if not psycopg2:
        return None
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        return None
    
    try:
        return psycopg2.connect(**conn_params, connect_timeout=5)
    except Exception:
        return None


class LookupItem(BaseModel):
    key: str = Field(..., description="Lowercase slug key")
    label: str = Field(..., description="Human-readable label")
    parent: Optional[str] = Field(None, description="Parent key (for hierarchical items)")
    sdg_links: Optional[list[int]] = Field(None, description="SDG links (for missions)")


class SynonymItem(BaseModel):
    type: str = Field(..., description="Type: mission, level, modality, donor")
    raw_value: str = Field(..., description="Raw input value")
    canonical_key: str = Field(..., description="Canonical lookup key")


@router.get("/lookups/status")
async def get_lookups_status() -> dict[str, Any]:
    """Get counts for all lookup tables."""
    try:
        conn = _get_db_connection()
        if not conn:
            return {
                "status": "ok",
                "data": None,
                "error": "Database not available",
            }
        
        cursor = conn.cursor()
        counts = {}
        
        for table in LOOKUP_TABLES:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            counts[table] = cursor.fetchone()[0]
        
        # Also get synonyms count
        cursor.execute("SELECT COUNT(*) FROM synonyms")
        counts["synonyms"] = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
        
        return {
            "status": "ok",
            "data": counts,
            "error": None,
        }
    except Exception as e:
        return {
            "status": "ok",
            "data": None,
            "error": str(e),
        }


@router.get("/lookups/{table}")
async def get_lookup_items(
    table: str,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Get items from a lookup table (paged)."""
    if table not in LOOKUP_TABLES:
        return {
            "status": "ok",
            "data": None,
            "error": f"Invalid table: {table}",
        }
    
    try:
        conn = _get_db_connection()
        if not conn:
            return {
                "status": "ok",
                "data": None,
                "error": "Database not available",
            }
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        offset = (page - 1) * size
        
        # Get paginated items
        cursor.execute(f"SELECT * FROM {table} ORDER BY key LIMIT %s OFFSET %s", (size, offset))
        items = cursor.fetchall()
        
        # Get total count
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        total = cursor.fetchone()["count"]
        
        cursor.close()
        conn.close()
        
        return {
            "status": "ok",
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "size": size,
            },
            "error": None,
        }
    except Exception as e:
        return {
            "status": "ok",
            "data": None,
            "error": str(e),
        }


@router.post("/lookups/{table}")
async def upsert_lookup_item(table: str, item: LookupItem) -> dict[str, Any]:
    """Upsert an item in a lookup table."""
    if table not in LOOKUP_TABLES:
        return {
            "status": "ok",
            "data": None,
            "error": f"Invalid table: {table}",
        }
    
    # Validate key is lowercase slug
    if not item.key.replace("_", "").replace("-", "").isalnum() or item.key != item.key.lower():
        return {
            "status": "ok",
            "data": None,
            "error": "Key must be a lowercase slug (alphanumeric, underscores, hyphens)",
        }
    
    try:
        conn = _get_db_connection()
        if not conn:
            return {
                "status": "ok",
                "data": None,
                "error": "Database not available",
            }
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build upsert query based on table schema
        if table == "missions" and item.parent is not None and item.sdg_links is not None:
            cursor.execute(
                f"""
                INSERT INTO {table} (key, label, parent, sdg_links)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (key) DO UPDATE
                SET label = EXCLUDED.label, parent = EXCLUDED.parent, sdg_links = EXCLUDED.sdg_links
                RETURNING *
                """,
                (item.key, item.label, item.parent, item.sdg_links)
            )
        elif table == "missions" and item.sdg_links is not None:
            cursor.execute(
                f"""
                INSERT INTO {table} (key, label, sdg_links)
                VALUES (%s, %s, %s)
                ON CONFLICT (key) DO UPDATE
                SET label = EXCLUDED.label, sdg_links = EXCLUDED.sdg_links
                RETURNING *
                """,
                (item.key, item.label, item.sdg_links)
            )
        elif table in ["missions", "clusters"] and item.parent is not None:
            cursor.execute(
                f"""
                INSERT INTO {table} (key, label, parent)
                VALUES (%s, %s, %s)
                ON CONFLICT (key) DO UPDATE
                SET label = EXCLUDED.label, parent = EXCLUDED.parent
                RETURNING *
                """,
                (item.key, item.label, item.parent)
            )
        else:
            cursor.execute(
                f"""
                INSERT INTO {table} (key, label)
                VALUES (%s, %s)
                ON CONFLICT (key) DO UPDATE
                SET label = EXCLUDED.label
                RETURNING *
                """,
                (item.key, item.label)
            )
        
        result = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            "status": "ok",
            "data": dict(result) if result else None,
            "error": None,
        }
    except Exception as e:
        return {
            "status": "ok",
            "data": None,
            "error": str(e),
        }


@router.get("/synonyms")
async def get_synonyms(
    type: Optional[str] = Query(None, description="Filter by type: mission, level, modality, donor"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Get synonyms (paged, optionally filtered by type)."""
    try:
        conn = _get_db_connection()
        if not conn:
            return {
                "status": "ok",
                "data": None,
                "error": "Database not available",
            }
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        offset = (page - 1) * size
        
        if type:
            cursor.execute(
                "SELECT * FROM synonyms WHERE type = %s ORDER BY type, raw_value LIMIT %s OFFSET %s",
                (type, size, offset)
            )
            items = cursor.fetchall()
            
            cursor.execute("SELECT COUNT(*) FROM synonyms WHERE type = %s", (type,))
            total = cursor.fetchone()["count"]
        else:
            cursor.execute(
                "SELECT * FROM synonyms ORDER BY type, raw_value LIMIT %s OFFSET %s",
                (size, offset)
            )
            items = cursor.fetchall()
            
            cursor.execute("SELECT COUNT(*) FROM synonyms")
            total = cursor.fetchone()["count"]
        
        cursor.close()
        conn.close()
        
        return {
            "status": "ok",
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "size": size,
            },
            "error": None,
        }
    except Exception as e:
        return {
            "status": "ok",
            "data": None,
            "error": str(e),
        }


@router.post("/synonyms")
async def upsert_synonym(item: SynonymItem) -> dict[str, Any]:
    """Upsert a synonym."""
    # Validate type
    valid_types = ["mission", "level", "modality", "donor"]
    if item.type not in valid_types:
        return {
            "status": "ok",
            "data": None,
            "error": f"Invalid type. Must be one of: {', '.join(valid_types)}",
        }
    
    try:
        conn = _get_db_connection()
        if not conn:
            return {
                "status": "ok",
                "data": None,
                "error": "Database not available",
            }
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute(
            """
            INSERT INTO synonyms (type, raw_value, canonical_key)
            VALUES (%s, %s, %s)
            ON CONFLICT (type, raw_value) DO UPDATE
            SET canonical_key = EXCLUDED.canonical_key
            RETURNING *
            """,
            (item.type, item.raw_value, item.canonical_key)
        )
        
        result = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            "status": "ok",
            "data": dict(result) if result else None,
            "error": None,
        }
    except Exception as e:
        return {
            "status": "ok",
            "data": None,
            "error": str(e),
        }


@router.post("/normalize/reindex")
async def normalize_and_reindex() -> dict[str, Any]:
    """Normalize all jobs and reindex to Meilisearch."""
    try:
        conn = _get_db_connection()
        if not conn:
            return {
                "status": "ok",
                "data": None,
                "error": "Database not available",
            }
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Fetch all jobs
        cursor.execute("SELECT * FROM jobs")
        jobs = cursor.fetchall()
        
        normalized_count = 0
        for job in jobs:
            # Normalize the job
            normalized = normalize_job_data(dict(job))
            
            # Update the job with normalized fields
            update_fields = []
            update_values = []
            for key, value in normalized.items():
                if key != 'id':
                    update_fields.append(f"{key} = %s")
                    update_values.append(value)
            
            if update_fields:
                update_values.append(job['id'])
                cursor.execute(
                    f"UPDATE jobs SET {', '.join(update_fields)} WHERE id = %s",
                    update_values
                )
                normalized_count += 1
        
        conn.commit()
        cursor.close()
        conn.close()
        
        # Reindex to Meilisearch
        indexed = await search_service.reindex_all()
        
        return {
            "status": "ok",
            "data": {
                "normalized": normalized_count,
                "indexed": indexed,
            },
            "error": None,
        }
    except Exception as e:
        return {
            "status": "ok",
            "data": None,
            "error": str(e),
        }
