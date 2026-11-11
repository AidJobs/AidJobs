"""Lifecycle observations. This module does not touch the database."""

# crawl_logs.listing_expected is a PostgreSQL integer; a listing page states its own total.
_MAX_STORED_TOTAL = 2_147_483_647


def jobs_not_rediscovered(known_ids, seen_ids, *, trustworthy: bool) -> list:
    """IDs from known_ids that were not seen.

    The caller supplies trustworthy. An untrusted crawl identifies no absences.
    """
    if not trustworthy:
        return []
    seen = set(seen_ids)
    return [job_id for job_id in known_ids if job_id not in seen]


def counting_crawl(
    *,
    listing_complete,
    valid: int,
    failed: int,
    unrecorded: int,
    active_at_start,
    matched_active: int,
) -> bool:
    """Whether a finished crawl is evidence of absence: a counting crawl (contract §6).

    Only a listing read completely counts, and never one with no valid job, one where any job
    failed to save or any listed row's sighting could not be recorded (the user's decisions of
    11 November 2026: that job was listed, but nothing shows it was seen), or one whose rows
    matched fewer than half of the source's open jobs that were not hidden when the run started.
    The crawl's status and failure counter play no part.
    """
    if listing_complete is not True:
        return False
    if not valid or valid < 0:
        return False
    if failed or unrecorded:
        return False
    # A run whose open jobs at its start were not recorded cannot be measured, so never counts.
    if active_at_start is None:
        return False
    if active_at_start and matched_active * 2 < active_at_start:
        return False
    return True


def run_lifecycle(result: dict, *, active_at_start, matched_active: int) -> dict:
    """The crawl_logs lifecycle columns for a finished run, from its result.

    A result without a listing report (a failure, a timeout, a shutdown, a source whose reader
    reports no completeness) is not complete, so it never counts.
    """
    listing = result.get("listing") or {}
    counts = result.get("counts") or {}
    complete = listing.get("complete")
    expected = listing.get("expected")
    stop = listing.get("stop")
    valid = int(result.get("valid") or 0)
    failed = int(counts.get("failed") or 0)
    unrecorded = int(counts.get("unrecorded") or 0)
    matched = int(matched_active or 0)
    return {
        "listing_complete": complete if isinstance(complete, bool) else None,
        "listing_expected": (
            expected
            if isinstance(expected, int)
            and not isinstance(expected, bool)
            and 0 <= expected <= _MAX_STORED_TOTAL
            else None
        ),
        "listing_stop": str(stop) if stop is not None else None,
        "valid_count": valid,
        "failed_saves": failed,
        "unrecorded": unrecorded,
        "matched_active": matched,
        "counted": counting_crawl(
            listing_complete=complete,
            valid=valid,
            failed=failed,
            unrecorded=unrecorded,
            active_at_start=active_at_start,
            matched_active=matched,
        ),
    }
