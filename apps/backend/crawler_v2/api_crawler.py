"""API crawler: JSON reader behind the shared interface, one save step (ledger W-35 3b)."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, List, Optional

import httpx
import psycopg2

from app.log_safety import redact_exception, stored_text
from contracts.admission import (
    admit_batch,
    extraction_logger_for,
    log_admission_rejections,
    too_thin,
)
from contracts.canary import (
    append_message as canary_append_message,
)
from contracts.canary import (
    evaluate as canary_evaluate,
)
from contracts.canary import (
    previous_kept_from_logs,
    previous_reader_from_logs,
)
from contracts.outbound import FetchError, current_budget, fetch_url, host_group
from contracts.reader import Fetch, ListingResult, Request, Response
from contracts.refusal import refusal
from contracts.run_ownership import OwnershipLost, save_failure_outcome
from crawler_v2.feed_fields import job_from_json_item, jobs_array
from crawler_v2.readers import (
    LISTING_READER,
    api_readers,
    read_listing,
    resolve_feed_request,
)
from crawler_v2.simple_crawler import _listing_outcome, place_job

logger = logging.getLogger(__name__)


class SimpleAPICrawler:
    """Fetch a JSON listing through the shared JSON reader and the one save step."""

    def __init__(self, db_url: str):
        self.db_url = db_url
        self.timeout = httpx.Timeout(30.0)
        self.extraction_logger = extraction_logger_for(db_url)
        self.quality_scorer = None
        try:
            from core.data_quality import get_quality_scorer

            self.quality_scorer = get_quality_scorer()
        except Exception as exc:
            logger.warning("Quality scorer not available: %s", exc)

    def _get_db_conn(self):
        return psycopg2.connect(self.db_url, connect_timeout=10)

    def _previous_kept_row(self, source_id: str):
        """(valid_count, observed) of the latest finished crawl for the source, or None."""
        if not self.db_url:
            return None
        try:
            conn = psycopg2.connect(self.db_url, connect_timeout=2)
        except Exception:
            return None
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT valid_count, observed
                    FROM crawl_logs
                    WHERE source_id = %s
                      AND status IS DISTINCT FROM 'running'
                    ORDER BY ran_at DESC NULLS LAST, id DESC
                    LIMIT 1
                    """,
                    (source_id,),
                )
                return cur.fetchone()
        except Exception:
            return None
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def _previous_reader_name(self, source_id: str):
        """The latest extraction_logs reader for the source, or None."""
        if not self.db_url:
            return None
        try:
            conn = psycopg2.connect(self.db_url, connect_timeout=2)
        except Exception:
            return None
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT extracted_fields->>'reader'
                    FROM extraction_logs
                    WHERE source_id = %s
                      AND extracted_fields ? 'reader'
                    ORDER BY created_at DESC NULLS LAST, id DESC
                    LIMIT 1
                    """,
                    (source_id,),
                )
                row = cur.fetchone()
                return row[0] if row else None
        except Exception:
            return None
        finally:
            try:
                conn.close()
            except Exception:
                pass

    async def fetch_api_response(
        self,
        url: str,
        headers: Optional[Dict] = None,
        *,
        budget_group: Optional[str] = None,
    ) -> Response:
        """Fetch the JSON body as a reader Response (stop set on refusal)."""
        try:
            request_headers = {
                key: value
                for key, value in (headers or {}).items()
                if str(key).lower() not in ("user-agent", "from")
            }
            with host_group(budget_group):
                result = await fetch_url(
                    url,
                    headers=request_headers,
                    timeout=float(self.timeout.connect or 30.0),
                )
            if result.status_code != 200 or refusal(
                result.status_code, result.headers, result.text
            ):
                logger.error("API fetch failed: HTTP %s", result.status_code)
                stop = (
                    f"HTTP {result.status_code}"
                    if result.status_code
                    else (current_budget().refused if current_budget() else "fetch failed")
                )
                return Response(result.status_code or 0, "", stop=str(stop or "fetch failed"))
            return Response(
                result.status_code,
                result.text or "",
                content_type=result.headers.get("content-type", "application/json")
                if getattr(result, "headers", None)
                else "application/json",
            )
        except FetchError as exc:
            logger.error("Error fetching API %s: %s", url, exc)
            reason = str(exc) if str(exc) else "fetch failed"
            return Response(0, "", stop=reason)
        except Exception as exc:
            logger.error("Error fetching API %s: %s", url, exc)
            return Response(0, "", stop="fetch failed")

    def _reader_fetch(self, budget_group: Optional[str] = None) -> Fetch:
        """Fetch callback for ATS readers (Greenhouse single-job) through the shared policy."""

        async def fetch(request: Request) -> Response:
            headers = {}
            if request.accept:
                headers["Accept"] = request.accept
            return await self.fetch_api_response(
                request.url, headers=headers or None, budget_group=budget_group
            )

        return fetch

    async def fetch_api(self, url: str, headers: Optional[Dict] = None) -> Optional[Dict]:
        """Backward-compatible parsed JSON, or None on failure."""
        answer = await self.fetch_api_response(url, headers=headers)
        if answer.stop or answer.status != 200 or not answer.body:
            return None
        try:
            return json.loads(answer.body)
        except (TypeError, ValueError):
            return None

    def extract_jobs_from_json(self, data: Dict, base_url: str) -> List[Dict]:
        """Backward-compatible extract for scripts; crawl and Simulate use the reader."""
        jobs = []
        for item in jobs_array(data):
            job = job_from_json_item(item, base_url)
            if job:
                jobs.append(job)
        return jobs

    def save_jobs(
        self,
        jobs: List[Dict],
        source_id: str,
        org_name: str,
        base_url: Optional[str] = None,
        *,
        run_token: Optional[str] = None,
        loop=None,
        thin: Optional[List[Dict]] = None,
    ) -> Dict:
        """The one shared save step (SimpleCrawler.save_jobs): field-contract shape, observation."""
        from crawler_v2.simple_crawler import SimpleCrawler

        return SimpleCrawler(self.db_url).save_jobs(
            jobs,
            source_id,
            org_name,
            base_url=base_url,
            run_token=run_token,
            loop=loop,
            thin=thin,
        )

    async def crawl_source(self, source: Dict, run=None) -> Dict:
        source_id = str(source["id"])
        org_name = source.get("org_name", "Unknown")
        careers_url = source["careers_url"]
        LISTING_READER.set("unknown")
        logger.info("Crawling API %s: %s", org_name, careers_url)

        try:
            readers = api_readers(self)
            chosen, feed_request = resolve_feed_request(readers, source)
            fetch_url_value = feed_request.url if feed_request else careers_url
            group = getattr(chosen, "budget_group", None) if chosen else None
            headers = {}
            if feed_request and feed_request.accept:
                headers["Accept"] = feed_request.accept
            first = await self.fetch_api_response(
                fetch_url_value, headers=headers or None, budget_group=group
            )
            if first.stop or first.status != 200 or not first.body:
                budget = current_budget()
                refused = budget.refused if budget is not None and budget.refused else first.stop
                return {
                    "status": "failed",
                    "message": (
                        f"Refused: {refused}" if refused else "Failed to fetch API"
                    ),
                    "counts": {"found": 0, "inserted": 0, "updated": 0, "skipped": 0},
                }

            reader_fetch = self._reader_fetch(group)
            if chosen is not None:
                listing = await chosen.read(first, source, fetch=reader_fetch)
                if listing is None:
                    listing = ListingResult(chosen.name)
            else:
                listing = await read_listing(
                    readers, first, source, fetch=reader_fetch
                )
            LISTING_READER.set(listing.reader)
            jobs = list(listing.jobs)
            listing_report = listing.report()

            for job in jobs:
                place_job(job)
            if self.quality_scorer and jobs:
                for job in jobs:
                    try:
                        quality = self.quality_scorer.score_job(job)
                        job["quality_score"] = quality["score"]
                        job["quality_grade"] = quality["grade"]
                        job["quality_factors"] = quality["factors"]
                        job["quality_issues"] = quality["issues"]
                        job["needs_review"] = quality["needs_review"]
                    except Exception as exc:
                        logger.debug(
                            "Error scoring job %s: %s",
                            (job.get("title") or "")[:50],
                            exc,
                        )

            admitted, rejected = admit_batch(jobs, "api")
            await asyncio.to_thread(
                log_admission_rejections,
                self.extraction_logger or extraction_logger_for(self.db_url),
                rejected,
                source_id,
            )
            if run is None:
                raise OwnershipLost("crawl_source needs the run that owns the source")
            thin = [job for job, reason in rejected if too_thin(job, reason)]
            counts = await run.save(
                self.save_jobs, admitted, source_id, org_name, base_url=careers_url,
                thin=thin,
            )

            reader_name = listing.reader or "unknown"
            canary_warnings = canary_evaluate(
                page=first.body or "",
                readers=readers,
                reader_name=reader_name,
                rows_read=len(jobs),
                admitted=len(admitted),
                observed=int(counts.get("observed") or 0),
                previous_kept=previous_kept_from_logs(
                    lambda: self._previous_kept_row(source_id)
                ),
                previous_reader=previous_reader_from_logs(
                    lambda: self._previous_reader_name(source_id)
                ),
            )

            if self.extraction_logger:
                fields = {
                    "job_count": len(jobs),
                    "inserted": counts.get("inserted", 0),
                    "updated": counts.get("updated", 0),
                    "skipped": counts.get("skipped", 0),
                    "failed": counts.get("failed", 0),
                    "reader": reader_name,
                }
                if listing_report:
                    fields["listing_pages"] = listing_report.get("pages")
                    fields["listing_expected"] = listing_report.get("expected")
                    fields["listing_complete"] = listing_report.get("complete")
                    fields["listing_stop"] = listing_report.get("stop")
                if canary_warnings:
                    fields["canary"] = list(canary_warnings)
                await asyncio.to_thread(
                    self.extraction_logger.log_extraction,
                    url=careers_url,
                    status="OK" if jobs else "EMPTY",
                    source_id=source_id,
                    raw_page_id=None,
                    reason=None if jobs else "No jobs found",
                    extracted_fields=fields,
                    job_count=len(jobs),
                )

            report = dict(listing_report) if isinstance(listing_report, dict) else None
            crawl_status, crawl_message = _listing_outcome(len(jobs), report)
            crawl_status, crawl_message = save_failure_outcome(
                crawl_status, crawl_message, counts
            )
            crawl_message = canary_append_message(crawl_message, canary_warnings)
            return {
                "status": crawl_status,
                "message": crawl_message,
                "listing": report,
                "valid": len(admitted),
                "counts": {
                    "found": len(jobs),
                    "inserted": counts["inserted"],
                    "updated": counts["updated"],
                    "skipped": counts["skipped"],
                    "failed": counts.get("failed", 0),
                    "unrecorded": counts.get("unrecorded", 0),
                    "observed": counts.get("observed", 0),
                },
            }
        except Exception as exc:
            logger.error(
                "Error crawling API %s: %s", org_name, redact_exception(exc), exc_info=True
            )
            return {
                "status": "failed",
                "message": stored_text(exc, 200),
                "counts": {"found": 0, "inserted": 0, "updated": 0, "skipped": 0},
            }
