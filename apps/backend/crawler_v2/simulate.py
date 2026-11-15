"""Admin simulation of a listing read (ledger W-35 pull request 3a).

Runs the crawl's own HTML readers on the first page only (no later-page fetches), then
admission's verdict on each row: admitted, needs its job page, or rejected with the reason.
"""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional

from contracts.admission import admit_batch, too_thin
from contracts.reader import ListingResult, Request, Response
from crawler_v2.readers import html_readers, read_listing

# Fixed stop handed to every later-page request so Sites and PageUp walks stay on page one.
FIRST_PAGE_ONLY = "first page only"

# Fields shown for each simulated row (enough to judge the listing; not a full job record).
_ROW_FIELDS = (
    "title",
    "apply_url",
    "location_raw",
    "deadline",
    "employment_type",
    "record_class",
)


async def _refuse_later_pages(_request: Request) -> Response:
    return Response(0, "", stop=FIRST_PAGE_ONLY)


async def simulate_html(crawler, html: str, careers_url: str) -> Dict[str, Any]:
    """Read one listing page through the crawl's HTML readers; no further fetches."""
    result = await read_listing(
        html_readers(crawler),
        Response(200, html),
        {"careers_url": careers_url},
        fetch=_refuse_later_pages,
    )
    return summarise(result, "html")


def summarise(result: ListingResult, record_class: str) -> Dict[str, Any]:
    """Counts, reader, and a row list with admission's verdict on each."""
    jobs = list(result.jobs)
    verdicts = _verdicts(jobs, record_class)
    rows = [_row(job, verdict) for job, verdict in zip(jobs, verdicts)]
    rejected_reasons = [v for v in verdicts if v != "admitted"]
    report = result.report()
    if not isinstance(report, dict):
        report = {}
    return {
        "ok": True,
        "count": len(jobs),
        "reader": result.reader,
        "strategy": result.strategy,
        "expected": report.get("expected", result.expected),
        "pages": report.get("pages", result.pages),
        "complete": report.get("complete", result.complete),
        "stop": report.get("stop", result.stop),
        "admitted": sum(1 for v in verdicts if v == "admitted"),
        "rejected": len(rejected_reasons),
        "rejected_by_reason": dict(Counter(rejected_reasons)),
        "rows": rows,
        "sample": rows[:3],
    }


def summarise_jobs(
    jobs: List[Dict], record_class: str, reader: Optional[str] = None
) -> Dict[str, Any]:
    """Admission summary for RSS/API (or any pre-read list) until those readers join the
    interface (pull request 3b)."""
    return summarise(ListingResult(reader or "unknown", list(jobs)), record_class)


def _verdicts(jobs: List[Dict], record_class: str) -> List[str]:
    """Per-row verdict: 'admitted', 'needs_job_page', or the rejection reason. Copies only."""
    copies = [dict(job) for job in jobs]
    position = {id(copy): index for index, copy in enumerate(copies)}
    admitted, rejected = admit_batch(copies, record_class)
    verdicts = [""] * len(jobs)
    for job in admitted:
        verdicts[position[id(job)]] = "admitted"
    for job, reason in rejected:
        verdicts[position[id(job)]] = "needs_job_page" if too_thin(job, reason) else reason
    return verdicts


def _row(job: Dict, verdict: str) -> Dict[str, Any]:
    out = {key: job.get(key) for key in _ROW_FIELDS if job.get(key) not in (None, "")}
    out["verdict"] = verdict
    return out
