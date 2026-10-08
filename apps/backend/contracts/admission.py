"""Batch admission. One function, no family counting inside the writer."""
import re
from urllib.parse import urlparse

from contracts.validate import destination_rejection

_NUMERIC_ID = re.compile(r"^\d+$")
_UUID = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_REPEAT_MIN = 2
_PAGE_SEGMENTS = frozenset({"page", "pages"})
_VACANCY_TOKENS = frozenset(
    {
        "job",
        "jobs",
        "vacancy",
        "vacancies",
        "position",
        "positions",
        "requisition",
        "requisitions",
        "opening",
        "openings",
    }
)
_JOB_POSTING_FIELDS = ("location_raw", "deadline", "employment_type")
_RSS_FIELDS = ("deadline",)
_API_FIELDS = ("deadline", "location_raw")


def _segments(url: str) -> list[str]:
    return [segment for segment in urlparse(url).path.split("/") if segment]


def family_key(url: str) -> str | None:
    """Collapse numeric segments to {id} and hyphenated UUIDs to {uuid}."""
    segments = _segments(url)
    if not any(_NUMERIC_ID.match(segment) or _UUID.match(segment) for segment in segments):
        return None
    normalized: list[str] = []
    seen_id = False
    collapsed_rest = False
    for segment in segments:
        if _NUMERIC_ID.match(segment):
            normalized.append("{id}")
            seen_id = True
        elif _UUID.match(segment):
            normalized.append("{uuid}")
            seen_id = True
        elif seen_id:
            if not collapsed_rest:
                normalized.append("{rest}")
                collapsed_rest = True
        else:
            normalized.append(segment.lower())
    return "/".join(normalized)


def _present(job: dict, names: tuple[str, ...]) -> bool:
    for name in names:
        value = job.get(name)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return True
    return False


def _structured(job: dict, record_class: str) -> bool:
    if record_class == "job_posting":
        return _present(job, _JOB_POSTING_FIELDS)
    if record_class == "rss":
        return _present(job, _RSS_FIELDS)
    if record_class == "api":
        return _present(job, _API_FIELDS)
    return False


def admit_batch(jobs: list[dict], record_class: str) -> tuple[list[dict], list[tuple[dict, str]]]:
    """Admit a candidate list. Stamp survivors. Do not count families per row later."""
    rejected: list[tuple[dict, str]] = []
    pool: list[dict] = []
    for job in jobs:
        job.pop("admitted", None)
        reason = destination_rejection(job)
        segments = _segments(str(job.get("apply_url") or ""))
        if reason is None and any(segment.lower() in _PAGE_SEGMENTS for segment in segments):
            reason = "pagination_path"
        if reason is not None:
            rejected.append((job, reason))
        else:
            pool.append(job)

    groups: dict[str, list[dict]] = {}
    for job in pool:
        key = family_key(str(job.get("apply_url") or ""))
        if key is None:
            continue
        groups.setdefault(key, []).append(job)

    admitted: list[dict] = []
    for job in pool:
        klass = str(job.get("record_class") or record_class)
        key = family_key(str(job.get("apply_url") or ""))
        family = groups.get(key or "", [])
        repeated = key is not None and len(family) >= _REPEAT_MIN
        segments = _segments(str(job.get("apply_url") or ""))
        numeric = (
            repeated
            and key is not None
            and "{id}" in key
            and any(segment.lower() in _VACANCY_TOKENS for segment in segments)
        )
        uuid = repeated and key is not None and "{uuid}" in key
        if numeric or uuid or _structured(job, klass):
            job["admitted"] = True
            admitted.append(job)
        elif klass == "html":
            rejected.append((job, "no_qualifying_family"))
        else:
            rejected.append((job, "no_qualifying_structured_evidence"))
    return admitted, rejected


def extraction_logger_for(db_url: str):
    """Existing failed-insert logger. A missing logger does not block admission."""
    try:
        from core.extraction_logger import ExtractionLogger
        return ExtractionLogger(db_url)
    except Exception:
        return None


def log_admission_rejections(extraction_logger, rejected, source_id: str) -> None:
    """Record admission rejects on the existing failed-insert log. Do not raise."""
    if extraction_logger is None or not rejected:
        return
    for job, reason in rejected:
        payload = {
            key: str(value)[:200]
            for key, value in job.items()
            if key != "admitted"
        }
        try:
            extraction_logger.log_failed_insert(
                source_url=str(job.get("apply_url") or ""),
                error=reason,
                source_id=source_id,
                payload=payload,
                operation="reject",
            )
        except Exception:
            continue
