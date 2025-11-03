from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import Optional
from contextlib import asynccontextmanager
import os
import logging

from app.config import Capabilities, get_env_presence
from app.search import search_service

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
