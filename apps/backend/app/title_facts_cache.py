"""
In-memory title-facts cache (W-42 PR2).

Process-local only (one uvicorn worker today; --workers would split the cache).
Rebuilt on start-up and after each successful crawl finish. Nothing is stored
on job rows. A failed rebuild keeps the previous map.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, Iterable, Optional

from app.title_facts import DESCRIPTION_PREFIX_LIMIT, facts_of

logger = logging.getLogger(__name__)

# Shared with search eligibility / list queries (plan should-fix).
OPEN_JOBS_SQL = (
    "status = 'active' AND deleted_at IS NULL "
    "AND (deadline IS NULL OR deadline >= CURRENT_DATE)"
)

# Bound the catalogue scan so a cold Supabase wake cannot hang Render forever.
REBUILD_STATEMENT_TIMEOUT_MS = 15_000
STARTUP_REBUILD_TIMEOUT_S = 30.0

# job_id -> facts dict. Swapped atomically under _lock.
_cache: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()
_rebuilding = False
_rebuild_pending = False


def open_jobs_sql_predicate() -> str:
    """SQL fragment matching the public open-job set."""
    return OPEN_JOBS_SQL


def get_cached_facts(job_id: Optional[str]) -> Optional[dict[str, Any]]:
    if not job_id:
        return None
    with _lock:
        facts = _cache.get(str(job_id))
        return dict(facts) if facts is not None else None


def cache_size() -> int:
    with _lock:
        return len(_cache)


def _title_only_facts(title: Optional[str]) -> dict[str, Any]:
    return facts_of(title or "")


def facts_for_row(
    job_id: Optional[str],
    title: Optional[str],
    *,
    allow_description: bool = False,
    description: Optional[str] = None,
    contract_type: Optional[str] = None,
    is_remote: Optional[bool] = None,
    advert_language: Optional[str] = None,
) -> dict[str, Any]:
    """
    Facts for one response row.

    Cache hit returns the cached object. On a miss, compute title-only facts from
    the title already on the row (no per-row description query on the search path).
    allow_description is for rebuild/tests only.
    """
    cached = get_cached_facts(job_id)
    if cached is not None:
        return cached
    if allow_description:
        return facts_of(
            title or "",
            description,
            contract_type=contract_type,
            is_remote=is_remote,
            advert_language=advert_language,
        )
    return _title_only_facts(title)


def attach_facts(item: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Attach a facts object to a job dict. Leaves the rest of the payload alone."""
    if not item or not isinstance(item, dict):
        return item
    item["facts"] = facts_for_row(item.get("id"), item.get("title"))
    return item


def attach_facts_to_items(items: Optional[Iterable[dict[str, Any]]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items or []:
        attach_facts(item)
        out.append(item)
    return out


def filter_jobs(
    items: Iterable[dict[str, Any]],
    *,
    sectors: Optional[list[str]] = None,
    functions: Optional[list[str]] = None,
    contract: Optional[str] = None,
    level: Optional[str] = None,
    open_to: Optional[str] = None,
    remote: Optional[bool] = None,
    language: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Pure in-memory filter over items that already carry facts (or get them via
    attach). Not called from search_query in W-42; reserved for UX-11.
    """
    wanted_sectors = set(sectors or [])
    wanted_functions = set(functions or [])
    result: list[dict[str, Any]] = []
    for item in items:
        facts = item.get("facts")
        if not isinstance(facts, dict):
            facts = facts_for_row(item.get("id"), item.get("title"))
        if wanted_sectors:
            row_sectors = set(facts.get("sectors") or [])
            if not (row_sectors & wanted_sectors):
                continue
        if wanted_functions:
            row_functions = set(facts.get("functions") or [])
            if not (row_functions & wanted_functions):
                continue
        if contract is not None and facts.get("contract") != contract:
            continue
        if level is not None and facts.get("level") != level:
            continue
        if open_to is not None and facts.get("openTo") != open_to:
            continue
        if remote is not None and bool(facts.get("remote")) != remote:
            continue
        if language is not None and facts.get("language") != language:
            continue
        result.append(item)
    return result


def _load_open_job_facts() -> dict[str, dict[str, Any]]:
    """Read every open job and compute facts. Raises on connection/query failure."""
    import psycopg2
    from psycopg2.extras import RealDictCursor

    from app.db_config import db_config

    conn_params = db_config.get_connection_params()
    if not conn_params:
        raise RuntimeError("no database connection params for title-facts rebuild")

    conn = psycopg2.connect(**conn_params, connect_timeout=5)
    try:
        # Explicit transaction so SET LOCAL applies to the catalogue read.
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SET LOCAL statement_timeout = %s",
                    (f"{REBUILD_STATEMENT_TIMEOUT_MS // 1000}s",),
                )
                cur.execute(
                    f"""
                    SELECT
                        id::text AS id,
                        title,
                        left(description, %s) AS description_prefix,
                        contract_type,
                        is_remote,
                        advert_language
                    FROM jobs
                    WHERE {OPEN_JOBS_SQL}
                    """,
                    (DESCRIPTION_PREFIX_LIMIT,),
                )
                rows = cur.fetchall()
    finally:
        conn.close()

    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        job_id = str(row["id"])
        out[job_id] = facts_of(
            row.get("title") or "",
            row.get("description_prefix"),
            contract_type=row.get("contract_type"),
            is_remote=row.get("is_remote"),
            advert_language=row.get("advert_language"),
        )
    return out


def rebuild_sync() -> int:
    """
    Replace the whole open-job facts map. On failure, keep the previous map and
    re-raise. Returns the new cache size.
    """
    new_cache = _load_open_job_facts()
    with _lock:
        global _cache
        _cache = new_cache
    logger.info("[title_facts] cache rebuilt: %s open jobs", len(new_cache))
    return len(new_cache)


def _finish_rebuild_locked_state() -> bool:
    """Clear rebuilding; return whether another rebuild was requested."""
    global _rebuilding, _rebuild_pending
    with _lock:
        _rebuilding = False
        pending = _rebuild_pending
        _rebuild_pending = False
        return pending


def _rebuild_once_keep_previous_on_error() -> None:
    try:
        rebuild_sync()
    except Exception:
        logger.exception("[title_facts] cache rebuild failed; keeping previous map")


def schedule_rebuild_after_finish(
    succeeded: bool,
    loop: Optional[asyncio.AbstractEventLoop] = None,
) -> None:
    """
    After a crawl finish that committed successfully, rebuild the whole catalogue.

    Single-flight: a finish that arrives mid-rebuild queues one follow-up.
    A finish that rolled back (succeeded=False) does not rebuild.
    """
    if not succeeded:
        return

    global _rebuilding, _rebuild_pending
    with _lock:
        if _rebuilding:
            _rebuild_pending = True
            return
        _rebuilding = True

    async def _run() -> None:
        try:
            while True:
                await asyncio.to_thread(_rebuild_once_keep_previous_on_error)
                if not _finish_rebuild_locked_state():
                    return
                with _lock:
                    global _rebuilding
                    _rebuilding = True
        except Exception:
            logger.exception("[title_facts] scheduled rebuild task failed")
            _finish_rebuild_locked_state()

    if loop is not None:
        try:
            loop.call_soon_threadsafe(lambda: loop.create_task(_run()))
        except RuntimeError:
            logger.warning("[title_facts] rebuild skipped; the event loop is closed")
            _finish_rebuild_locked_state()
        return
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        # No loop (tests / sync caller): rebuild inline, then any queued follow-up.
        try:
            while True:
                _rebuild_once_keep_previous_on_error()
                if not _finish_rebuild_locked_state():
                    return
                with _lock:
                    _rebuilding = True
        except Exception:
            logger.exception("[title_facts] inline rebuild failed")
            _finish_rebuild_locked_state()
        return
    running.create_task(_run())


async def ensure_startup_rebuild(timeout_s: float = STARTUP_REBUILD_TIMEOUT_S) -> None:
    """Await a bounded first rebuild before serving. On timeout/failure, keep going."""
    try:
        await asyncio.wait_for(asyncio.to_thread(rebuild_sync), timeout=timeout_s)
    except asyncio.TimeoutError:
        logger.warning(
            "[title_facts] startup rebuild timed out after %ss; serving title-only misses",
            timeout_s,
        )
    except Exception:
        logger.exception(
            "[title_facts] startup rebuild failed; serving title-only misses"
        )


# Test helpers
def _reset_cache_for_tests(mapping: Optional[dict[str, dict[str, Any]]] = None) -> None:
    global _cache, _rebuilding, _rebuild_pending
    with _lock:
        _cache = dict(mapping or {})
        _rebuilding = False
        _rebuild_pending = False
