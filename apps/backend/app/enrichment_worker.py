"""
Enrichment Worker.
Event-driven job enrichment on create/update.
"""
import logging
from typing import Optional
import asyncio

from app.enrichment import enrich_and_save_job

logger = logging.getLogger(__name__)


async def enrich_job_async(
    job_id: str,
    title: str,
    description: str,
    org_name: Optional[str] = None,
    location: Optional[str] = None,
    functional_role_hint: Optional[str] = None,
) -> bool:
    """
    Asynchronously enrich a job.
    
    This is a wrapper that runs the synchronous enrich_and_save_job in a thread pool.
    """
    try:
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(
            None,
            enrich_and_save_job,
            job_id,
            title,
            description,
            org_name,
            location,
            functional_role_hint,
        )
        return success
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
) -> None:
    """
    Trigger enrichment when a job is created or updated.
    
    This function is called from the crawler/orchestrator after a job is inserted/updated.
    It runs enrichment asynchronously to avoid blocking the crawl process.
    """
    try:
        # Run enrichment in background
        asyncio.create_task(
            enrich_job_async(
                job_id=job_id,
                title=title,
                description=description or "",
                org_name=org_name,
                location=location,
                functional_role_hint=functional_role_hint,
            )
        )
        logger.info(f"[enrichment_worker] Triggered enrichment for job {job_id}")
    except Exception as e:
        logger.error(f"[enrichment_worker] Failed to trigger enrichment for job {job_id}: {e}", exc_info=True)

