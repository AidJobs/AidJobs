"""Reject candidates before any authoritative write."""
import re
from urllib.parse import urlparse

from contracts.models import CrawlRun

_SEARCH = re.compile(r"[?&](q=|page=|search=|filter=)", re.IGNORECASE)
_ROOT_PATHS = frozenset({"", "/careers", "/jobs", "/job", "/vacancies", "/opportunities"})
_PLACEHOLDER_PREFIX = "https://placeholder.missing-url/"
_QUALITY_FLOOR = 0.25


def rejection_reason(job: dict) -> str | None:
    title = str(job.get("title") or "").strip()
    apply_url = str(job.get("apply_url") or "").strip()
    if not title:
        return "missing_title"
    if not apply_url:
        return "missing_apply_url"
    lowered = apply_url.lower()
    if lowered.startswith("mailto:"):
        return "mailto"
    if lowered.startswith(_PLACEHOLDER_PREFIX):
        return "placeholder"
    if _SEARCH.search(apply_url):
        return "search_or_pagination"
    path = urlparse(apply_url).path.rstrip("/")
    if path in _ROOT_PATHS:
        return "root_careers_page"
    score = job.get("quality_score")
    if score is not None:
        try:
            if float(score) < _QUALITY_FLOOR:
                return "quality_score_too_low"
        except (TypeError, ValueError):
            pass
    return None


def consider(job: dict, crawl: CrawlRun) -> str | None:
    """Record a rejection on the CrawlRun. A valid job returns None."""
    reason = rejection_reason(job)
    if reason is not None:
        crawl.rejected += 1
    return reason
