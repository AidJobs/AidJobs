"""
Enrichment Worker.
Event-driven job enrichment on create/update.
"""
import logging
from typing import Optional
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

from app.enrichment import enrich_and_save_job

logger = logging.getLogger(__name__)

# Thread pool for running enrichment in background
_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="enrichment")


def _enrich_job_sync(
    job_id: str,
    title: str,
    description: str,
    org_name: Optional[str] = None,
    location: Optional[str] = None,
    functional_role_hint: Optional[str] = None,
    apply_url: Optional[str] = None,
) -> bool:
    """
    Synchronously enrich a job (runs in thread pool).
    """
    try:
        return enrich_and_save_job(
            job_id=job_id,
            title=title,
            description=description,
            org_name=org_name,
            location=location,
            functional_role_hint=functional_role_hint,
            apply_url=apply_url,
        )
    except Exception as e:
        logger.error(f"[enrichment_worker] Error enriching job {job_id}: {e}", exc_info=True)
        return False


def trigger_enrichment_on_job_create_or_update(
    job_id: str,
    title: str,
    description: Optional[str] = None,
    org_name: Optional[str] = None,
    location: Optional[str] = None,
    functional_role_hint: Optional[str] = None,
    apply_url: Optional[str] = None,
) -> None:
    """
    Trigger enrichment when a job is created or updated.
    
    This function is called from the crawler/orchestrator after a job is inserted/updated.
    It runs enrichment in a background thread to avoid blocking the crawl process.
    
    This is a fire-and-forget operation - it doesn't wait for completion.
    """
    try:
        # Submit to thread pool (non-blocking)
        _executor.submit(
            _enrich_job_sync,
            job_id=job_id,
            title=title,
            description=description or "",
            org_name=org_name,
            location=location,
            functional_role_hint=functional_role_hint,
            apply_url=apply_url,
        )
        logger.info(f"[enrichment_worker] Triggered enrichment for job {job_id}")
    except Exception as e:
        logger.error(f"[enrichment_worker] Failed to trigger enrichment for job {job_id}: {e}", exc_info=True)

