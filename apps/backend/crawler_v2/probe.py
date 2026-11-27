"""Admin probe of a careers address (ledger W-40, pull request 1).

One read of the address, and nothing is written: no source row, no crawl run, no saved page.
The recruitment system is recognised from the address by the ATS readers' own rules. If one
matches, exactly one feed request is sent; Greenhouse's detail pages are not opened. Otherwise
one page request is sent through the HTML readers. Later listing pages are refused, so a probe
is one listing read. Every request goes through the fetch policy (contracts/outbound.fetch_url).
Admission's verdict per row is reported, as Simulate does.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional
from urllib.parse import urlsplit

from contracts.outbound import FETCH_MESSAGES, FetchError, crawl_budget, fetch_message, fetch_url
from contracts.refusal import refusal
from crawler_v2.readers import api_readers, resolve_feed_request
from crawler_v2.simulate import simulate_api, simulate_html

# The whole probe, every hop included, and the requests it may send: robots.txt, the address,
# and at most a few redirects.
PROBE_SECONDS = 20.0
PROBE_REQUESTS = 6
ADDRESS_MAX_LENGTH = 2048
TEXT_MAX_LENGTH = 200
SAMPLE_ROWS = 3

ADDRESS_REFUSED = "Enter a careers address that starts with http:// or https:// and names a host."
ADDRESS_TOO_LONG = "The careers address is too long."
NO_ANSWER = "The address did not answer in time."
UNREADABLE = "The address did not return a readable listing."
NO_READ = "The address could not be read."


def address_refusal(url: str) -> Optional[str]:
    """Why the address is refused before any request, or None when it may be read."""
    if not url or len(url) > ADDRESS_MAX_LENGTH:
        return ADDRESS_TOO_LONG if url else ADDRESS_REFUSED
    try:
        parts = urlsplit(url)
        host = parts.hostname
    except ValueError:
        return ADDRESS_REFUSED
    if parts.scheme not in ("http", "https") or not host:
        return ADDRESS_REFUSED
    return None


def _cap(value: Any) -> Any:
    if isinstance(value, str) and len(value) > TEXT_MAX_LENGTH:
        return value[:TEXT_MAX_LENGTH] + "…"
    return value


def _refused(stop: Optional[str], status: int) -> Dict[str, Any]:
    if stop:
        text = f"Refused: {stop}"
    elif status:
        text = f"HTTP {status}"
    else:
        text = NO_READ
    return {"ok": False, "error": text, "error_category": "runtime"}


def _unreadable() -> Dict[str, Any]:
    return {"ok": False, "error": UNREADABLE, "error_category": "runtime"}


def _report(summary: Dict[str, Any], suggested_type: str) -> Dict[str, Any]:
    """Only the fields the admin needs; no response body, and sample rows with capped text."""
    sample = [
        {key: _cap(value) for key, value in row.items()}
        for row in summary["sample"][:SAMPLE_ROWS]
    ]
    return {
        "ok": True,
        "suggested_source_type": suggested_type,
        "reader": summary["reader"],
        "strategy": summary["strategy"],
        "count": summary["count"],
        "expected": summary["expected"],
        "pages": summary["pages"],
        "complete": summary["complete"],
        "stop": _cap(summary["stop"]),
        "admitted": summary["admitted"],
        "rejected": summary["rejected"],
        "rejected_by_reason": summary["rejected_by_reason"],
        "fill_rates": summary["fill_rates"],
        "fill_basis": "Share of the admitted rows of this one listing read. Stored fill (W-39) "
                      "is measured after the jobs are saved.",
        "sample": sample,
    }


async def _read(url: str, db_url: str) -> Dict[str, Any]:
    from crawler_v2.api_crawler import SimpleAPICrawler
    from crawler_v2.simple_crawler import SimpleCrawler, _html_request_headers

    api_crawler = SimpleAPICrawler(db_url)
    chosen, feed_request = resolve_feed_request(api_readers(api_crawler), {"careers_url": url})
    if chosen is not None and feed_request is not None:
        headers = {"Accept": feed_request.accept} if feed_request.accept else None
        answer = await api_crawler.fetch_api_response(
            feed_request.url,
            headers=headers,
            budget_group=getattr(chosen, "budget_group", None),
        )
        if answer.stop or answer.status != 200 or not answer.body:
            # The feed path carries the fetch error's raw text; only the fixed messages pass.
            stop = answer.stop if answer.stop in FETCH_MESSAGES else None
            return _refused(stop, answer.status)
        try:
            # fetch=None: the reader does not open detail pages (Greenhouse) for a probe.
            return _report(await simulate_api(answer.body, url), "api")
        except ValueError:
            return _unreadable()

    try:
        result = await fetch_url(url, headers=_html_request_headers(), timeout=30.0)
    except FetchError as exc:
        return _refused(fetch_message(exc) or "fetch failed", 0)
    except Exception:
        return _refused("fetch failed", 0)
    stop = refusal(result.status_code, result.headers, result.text)
    if stop or result.status_code != 200:
        return _refused(stop or None, result.status_code)
    if not result.text:
        return {"ok": False, "error": "The page was empty.", "error_category": "runtime"}
    try:
        return _report(await simulate_html(SimpleCrawler(db_url), result.text, url), "html")
    except ValueError:
        return _unreadable()


async def probe_address(careers_url: str, db_url: str = "") -> Dict[str, Any]:
    """Read one careers address once. Writes nothing; sends at most PROBE_REQUESTS requests."""
    url = careers_url.strip()
    reason = address_refusal(url)
    if reason:
        return {"ok": False, "error": reason, "error_category": "validation"}
    try:
        async with asyncio.timeout(PROBE_SECONDS):
            with crawl_budget(PROBE_REQUESTS, PROBE_SECONDS):
                return await _read(url, db_url)
    except TimeoutError:
        return {"ok": False, "error": NO_ANSWER, "error_category": "runtime"}
