"""Admin simulation of a listing read (ledger W-35).

HTML: the crawl's own readers on the first page only (no later-page fetches).
RSS and API: the feed / JSON readers on the fetched body (pull request 3b).
Then admission's verdict on each row: admitted, needs its job page, or rejected with the reason.
"""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional

from contracts.admission import admit_batch, too_thin
from contracts.reader import ListingResult, Request, Response
from crawler_v2.readers import api_readers, html_readers, read_listing, rss_readers

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


async def simulate_rss(body: str, careers_url: str) -> Dict[str, Any]:
    """Read one feed body through the RSS feed reader."""
    result = await read_listing(
        rss_readers(),
        Response(200, body, content_type="application/rss+xml"),
        {"careers_url": careers_url},
    )
    return summarise(result, "rss")


async def simulate_api(
    body: str,
    careers_url: str,
    fetch=None,
) -> Dict[str, Any]:
    """Read one JSON listing body through the API readers (ATS feeds first, then generic)."""
    source = {"careers_url": careers_url}
    readers = api_readers()
    result = await read_listing(
        readers,
        Response(200, body, content_type="application/json"),
        source,
        fetch=fetch,
    )
    return summarise(result, "api")


# Capture fields reported as fill rates on a probe (ledger W-40; names as data_quality's
# CAPTURE_FILL_FIELDS). Each entry reads the reader's own keys on a listing row. Country and city
# are set only when a job is saved (place_job), so a listing read cannot fill them:
# they report None.
PROBE_FILL_FIELDS = (
    ("description", ("description",)),
    ("posted_on", ("posted_on",)),
    ("locations", ("locations", "location_raw")),
    ("contract_type", ("employment_type",)),
    ("salary_range_text", ("salary_raw", "salary_range_text")),
    ("advert_language", ("advert_language",)),
    ("deadline", ("deadline",)),
    ("location_raw", ("location_raw",)),
    ("country", None),
    ("city", None),
)


def listing_fill_rates(jobs: List[Dict]) -> Dict[str, Dict[str, Any]]:
    """Filled, total and rate per capture field, over the admitted rows of one listing read."""
    total = len(jobs)
    rates: Dict[str, Dict[str, Any]] = {}
    for name, keys in PROBE_FILL_FIELDS:
        if keys is None:
            rates[name] = {"filled": None, "total": total, "rate": None}
            continue
        filled = sum(1 for job in jobs if any(job.get(key) not in (None, "", []) for key in keys))
        rates[name] = {
            "filled": filled,
            "total": total,
            "rate": round(filled / total * 100.0, 1) if total else None,
        }
    return rates


def summarise(result: ListingResult, record_class: str) -> Dict[str, Any]:
    """Counts, reader, and a row list with admission's verdict on each."""
    jobs = list(result.jobs)
    verdicts = _verdicts(jobs, record_class)
    rows = [_row(job, verdict) for job, verdict in zip(jobs, verdicts)]
    rejected_reasons = [v for v in verdicts if v != "admitted"]
    admitted_jobs = [job for job, verdict in zip(jobs, verdicts) if verdict == "admitted"]
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
        "admitted": len(admitted_jobs),
        "rejected": len(rejected_reasons),
        "rejected_by_reason": dict(Counter(rejected_reasons)),
        "rows": rows,
        "sample": rows[:3],
        "fill_rates": listing_fill_rates(admitted_jobs),
    }


def summarise_jobs(
    jobs: List[Dict], record_class: str, reader: Optional[str] = None
) -> Dict[str, Any]:
    """Admission summary for a pre-read list (tests; Simulate uses the readers)."""
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
