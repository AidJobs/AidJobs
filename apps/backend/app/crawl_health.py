"""Daily crawl-health message (W-39 / growth plan §4.1 item 6, decision D1).

Composes failed / partial / refused-challenge / overdue / half-matched sources and
sends via Resend when secrets are set. Missing key or recipient → compose and log
only. Never raises into the crawl scheduler. Logs HTTP status codes only — never
the API key, Authorization header, or provider response body.
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from urllib import error, request

from app.log_safety import redact_exception

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
DEFAULT_FROM = "AidJobs Health <onboarding@resend.dev>"

_REFUSAL_RE = re.compile(
    r"refus(ed|al)|challenge|aws\s*waf|\bHTTP\s+202\b|\bHTTP\s+429\b",
    re.IGNORECASE,
)


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _source_label(row: Dict[str, Any]) -> str:
    name = (row.get("org_name") or "").strip() or "Unnamed source"
    return name


def classify_sources(
    rows: List[Dict[str, Any]], *, now: Optional[datetime] = None
) -> Dict[str, List[str]]:
    """Bucket active sources into the five health categories (a source may appear in several)."""
    # Late import: orchestrator calls this module from the scheduler loop.
    from orchestrator import overdue_hours, resolve_base_freq_days

    if now is None:
        now = datetime.now(timezone.utc)
    buckets: Dict[str, List[str]] = {
        "failed": [],
        "partial": [],
        "refused_challenge": [],
        "overdue": [],
        "half_matched": [],
    }
    for row in rows:
        if (row.get("status") or "") == "deleted":
            continue
        label = _source_label(row)
        status = (row.get("last_crawl_status") or "").lower()
        message = row.get("last_crawl_message") or ""
        listing_complete = row.get("listing_complete")
        listing_stop = row.get("listing_stop") or ""
        counted = row.get("counted")
        matched = row.get("matched_active")
        active_at_start = row.get("active_at_start")

        if status in ("fail", "failed"):
            buckets["failed"].append(label)

        if status == "warn" or listing_complete is False:
            buckets["partial"].append(label)

        if _REFUSAL_RE.search(message) or _REFUSAL_RE.search(listing_stop):
            buckets["refused_challenge"].append(label)

        next_run = row.get("next_run_at")
        if next_run is not None and (row.get("status") or "") == "active":
            if getattr(next_run, "tzinfo", None) is None:
                next_run = next_run.replace(tzinfo=timezone.utc)
            target_days = resolve_base_freq_days(
                row.get("crawl_frequency_days"), row.get("org_type")
            )
            # Overdue vs target: past due by more than one full target interval.
            if overdue_hours(next_run, now=now) > (target_days * 24.0):
                buckets["overdue"].append(
                    f"{label} (target {target_days:g}d, overdue "
                    f"{overdue_hours(next_run, now=now) / 24.0:.1f}d)"
                )

        # Half-matched non-counting: complete listing that did not reach the half-match bar.
        if (
            listing_complete is True
            and counted is False
            and matched is not None
            and active_at_start is not None
            and active_at_start > 0
            and matched * 2 < active_at_start
        ):
            buckets["half_matched"].append(
                f"{label} (matched {matched} of {active_at_start} open at start)"
            )

    return buckets


def compose_message(buckets: Dict[str, List[str]], *, day: date) -> str:
    """Plain-text crawl-health body. Empty categories are stated so silence is not ambiguous."""
    sections = [
        ("Failed", buckets.get("failed") or []),
        ("Partial (listing incomplete or warn)", buckets.get("partial") or []),
        ("Refused / challenge", buckets.get("refused_challenge") or []),
        ("Overdue vs target", buckets.get("overdue") or []),
        ("Half-matched (did not count)", buckets.get("half_matched") or []),
    ]
    lines = [f"AidJobs crawl health — {day.isoformat()} UTC", ""]
    any_issue = False
    for title, items in sections:
        lines.append(f"{title}:")
        if items:
            any_issue = True
            for item in items:
                lines.append(f"  - {item}")
        else:
            lines.append("  (none)")
        lines.append("")
    if not any_issue:
        lines.append("No crawl-health issues for active sources today.")
    return "\n".join(lines).rstrip() + "\n"


def load_source_health_rows(cur) -> List[Dict[str, Any]]:
    """Latest finished crawl per source, plus scheduling columns, for classification."""
    cur.execute(
        """
        SELECT s.id, s.org_name, s.status, s.org_type, s.crawl_frequency_days,
               s.next_run_at, s.last_crawl_status, s.last_crawl_message,
               r.listing_complete, r.listing_stop, r.counted,
               r.matched_active, r.active_at_start
        FROM sources s
        LEFT JOIN LATERAL (
            SELECT listing_complete, listing_stop, counted, matched_active, active_at_start
            FROM crawl_logs
            WHERE source_id = s.id
              AND status IS DISTINCT FROM 'running'
            ORDER BY ran_at DESC
            LIMIT 1
        ) r ON TRUE
        WHERE s.status IS DISTINCT FROM 'deleted'
        ORDER BY s.org_name NULLS LAST, s.id
        """
    )
    return [dict(row) for row in cur.fetchall()]


def claim_utc_day(cur, day: date) -> bool:
    """Insert today's claim. True when this process owns the attempt; False if already claimed."""
    cur.execute(
        """
        INSERT INTO crawl_health_mail (attempted_on, delivery)
        VALUES (%s, 'pending')
        ON CONFLICT (attempted_on) DO NOTHING
        RETURNING attempted_on
        """,
        (day,),
    )
    return cur.fetchone() is not None


def finish_claim(cur, day: date, *, delivery: str, http_status: Optional[int]) -> None:
    cur.execute(
        """
        UPDATE crawl_health_mail
        SET delivery = %s, http_status = %s, attempted_at = NOW()
        WHERE attempted_on = %s
        """,
        (delivery, http_status, day),
    )


class _NoRedirect(request.HTTPRedirectHandler):
    """Refuse redirects so a Bearer token is never replayed to another host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_RESEND_OPENER = request.build_opener(_NoRedirect())


def send_resend(*, api_key: str, to_addr: str, from_addr: str, subject: str, text: str) -> int:
    """POST to Resend. Returns the HTTP status code. Never logs the key or response body.

    Redirects are refused (3xx becomes HTTPError). Authorization is unredirected as a
    second defence so a future opener change cannot copy the Bearer token.
    """
    payload = json.dumps(
        {"from": from_addr, "to": [to_addr], "subject": subject, "text": text}
    ).encode("utf-8")
    req = request.Request(
        RESEND_URL,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    # Unredirected: even if redirects were allowed, the key would not follow.
    req.add_unredirected_header("Authorization", f"Bearer {api_key}")
    try:
        with _RESEND_OPENER.open(req, timeout=30) as resp:
            # Drain without keeping the body for logs.
            resp.read()
            status = int(resp.status)
    except error.HTTPError as exc:
        try:
            exc.read()
        except Exception:
            pass
        status = int(exc.code)
    # Treat any redirect status as failure even if a custom opener returned it.
    if 300 <= status < 400:
        return status
    return status


def run_crawl_health_once(conn) -> Optional[Dict[str, Any]]:
    """One attempt per UTC day. Returns a summary, or None when today's attempt already exists.

    The day claim is committed as `pending` before any HTTP call, so a restart after a
    successful send cannot double-mail. Never raises for mail failures: the claim is
    finished as failed/log_only and the scheduler continues. Database errors still
    propagate so the caller can log them.
    """
    day = utc_today()
    from psycopg2.extras import RealDictCursor  # local import keeps module import light

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if not claim_utc_day(cur, day):
            conn.rollback()
            return None
        rows = load_source_health_rows(cur)
        buckets = classify_sources(rows)
        body = compose_message(buckets, day=day)
        # Commit the claim before any provider call (survives kill/restart).
        conn.commit()

    api_key = _env("RESEND_API_KEY")
    to_addr = _env("AIDJOBS_HEALTH_TO")
    from_addr = _env("AIDJOBS_HEALTH_FROM") or DEFAULT_FROM
    subject = f"AidJobs crawl health — {day.isoformat()} UTC"

    def _finish(delivery: str, http_status: Optional[int]) -> None:
        with conn.cursor() as cur:
            finish_claim(cur, day, delivery=delivery, http_status=http_status)
        conn.commit()

    if not api_key or not to_addr:
        _finish("log_only", None)
        logger.info(
            "[crawl_health] %s UTC: composed only (missing RESEND_API_KEY or "
            "AIDJOBS_HEALTH_TO); delivery=log_only\n%s",
            day.isoformat(),
            body,
        )
        return {
            "day": day.isoformat(),
            "delivery": "log_only",
            "http_status": None,
            "buckets": buckets,
        }

    try:
        status = send_resend(
            api_key=api_key,
            to_addr=to_addr,
            from_addr=from_addr,
            subject=subject,
            text=body,
        )
    except Exception as exc:
        _finish("failed", None)
        logger.error(
            "[crawl_health] %s UTC: send failed (%s); delivery=failed",
            day.isoformat(),
            redact_exception(exc),
        )
        return {
            "day": day.isoformat(),
            "delivery": "failed",
            "http_status": None,
            "buckets": buckets,
        }

    if 200 <= status < 300:
        _finish("sent", status)
        logger.info(
            "[crawl_health] %s UTC: sent; http_status=%s",
            day.isoformat(),
            status,
        )
        return {
            "day": day.isoformat(),
            "delivery": "sent",
            "http_status": status,
            "buckets": buckets,
        }

    _finish("failed", status)
    logger.error(
        "[crawl_health] %s UTC: provider refused; http_status=%s; delivery=failed",
        day.isoformat(),
        status,
    )
    return {
        "day": day.isoformat(),
        "delivery": "failed",
        "http_status": status,
        "buckets": buckets,
    }


__all__ = [
    "classify_sources",
    "compose_message",
    "run_crawl_health_once",
    "utc_today",
    "DEFAULT_FROM",
]
