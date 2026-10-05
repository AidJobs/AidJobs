"""Project committed job ids to Meilisearch. This module does not write jobs."""
import asyncio
import logging

logger = logging.getLogger(__name__)

_PROJECT = frozenset({"created", "updated"})
_REMOVE = frozenset({"seen_again"})


def projection_actions(recorded) -> tuple[list, list]:
    """Ids from this commit. Unchanged, rejected, and conflicts are omitted."""
    project_ids = []
    remove_ids = []
    for item in recorded or []:
        outcome = item.get("outcome")
        job_id = item.get("job_id")
        if job_id is None:
            continue
        if outcome in _PROJECT:
            project_ids.append(str(job_id))
        elif outcome in _REMOVE:
            remove_ids.append(str(job_id))
    return project_ids, remove_ids


def compose_public_page(meili_hits, eligible_ids, sql_items, page_size) -> list:
    """Keep eligible Meilisearch hits, then fill the page from eligible SQL rows.

    eligible_ids is None when the eligibility check failed. Those hits are dropped.
    """
    kept = []
    if eligible_ids is not None:
        allowed = {str(job_id) for job_id in eligible_ids}
        for hit in meili_hits or []:
            hit_id = hit.get("id")
            if hit_id is not None and str(hit_id) in allowed:
                kept.append(hit)
    seen = {str(item.get("id")) for item in kept if item.get("id") is not None}
    for row in sql_items or []:
        if len(kept) >= page_size:
            break
        row_id = row.get("id")
        if row_id is None or str(row_id) in seen:
            continue
        kept.append(row)
        seen.add(str(row_id))
    return kept[:page_size]


def stale_document_ids(index_ids, eligible_ids) -> list:
    """Index ids that are not in the eligible Postgres set. This does not wipe an index."""
    allowed = {str(job_id) for job_id in eligible_ids}
    return [str(job_id) for job_id in index_ids if str(job_id) not in allowed]


def commit_and_schedule(conn, recorded) -> None:
    """Commit the job writes, then schedule projection of those committed ids."""
    conn.commit()
    schedule_after_commit(recorded)


def schedule_after_commit(recorded) -> None:
    project_ids, remove_ids = projection_actions(recorded)
    if not project_ids and not remove_ids:
        return

    async def _run():
        try:
            await project_committed_jobs(project_ids, remove_ids)
        except Exception:
            logger.exception("search projection failed")

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning("search projection skipped; no running event loop")
        return
    loop.create_task(_run())


async def project_committed_jobs(project_ids, remove_ids) -> None:
    """Read committed rows and update Meilisearch. Do not write jobs."""
    from app.search import search_service

    await search_service.project_committed(project_ids, remove_ids)
