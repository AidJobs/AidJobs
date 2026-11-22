"""Listing id fingerprint for W-39 early-stop (detail budget only).

Fingerprint = SHA-256 of sorted unique normalised apply URLs (the writer's sighting key),
plus the count. Early-stop skips detail enrichment for already-saved rows that are not in
the deadline window or rotation; new / thin / detail_unconfirmed rows still open pages.
Never stops the listing walk; never changes listing_complete or counted.
"""
from __future__ import annotations

import hashlib
from typing import Iterable, Optional

from contracts.persist import observation_link


def listing_url_keys(jobs: Iterable[dict]) -> list[str]:
    """Sorted unique normalised apply URLs from listing rows."""
    keys = {
        observation_link(job.get("apply_url"))
        for job in jobs
        if observation_link(job.get("apply_url"))
    }
    return sorted(keys)


def listing_ids_fingerprint(jobs: Iterable[dict]) -> tuple[Optional[str], int]:
    """SHA-256 hex of the listing URL keys, and the key count. Empty listing → (None, 0)."""
    keys = listing_url_keys(jobs)
    if not keys:
        return None, 0
    digest = hashlib.sha256("\n".join(keys).encode("utf-8")).hexdigest()
    return digest, len(keys)


def early_stop_details(
    *,
    listing_complete,
    current_hash: Optional[str],
    previous_hash: Optional[str],
) -> bool:
    """True only when this run is complete and its fingerprint matches a prior complete run."""
    if listing_complete is not True:
        return False
    if not current_hash or not previous_hash:
        return False
    return current_hash == previous_hash


def previous_complete_listing_hash(rows: Iterable[tuple]) -> Optional[str]:
    """Hash from the latest finished complete crawl row, or None if that row has none.

    `rows` are (listing_ids_hash,) ordered by ran_at descending. A newer complete row with a
    null hash must not fall through to an older hash (W-39 D8).
    """
    for row in rows:
        if not row:
            return None
        value = row[0]
        if value is None or value == "":
            return None
        return str(value)
    return None
