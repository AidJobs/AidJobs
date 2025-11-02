from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import Optional

from app.config import Capabilities, get_env_presence
from app.search import search_service

load_dotenv()

app = FastAPI(title="AidJobs API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
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
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
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
