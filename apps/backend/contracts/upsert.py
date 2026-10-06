"""In-memory upsert. This is not a database writer."""
import uuid
from datetime import date, datetime

from contracts.identity import both_keys, write_key
from contracts.models import CrawlRun

VALIDATED_FIELDS = (
    "title",
    "apply_url",
    "description_snippet",
    "location_raw",
    "country",
    "country_iso",
    "city",
    "is_remote",
    "deadline",
)

UNCHANGED_ON_MATCH = (
    "id",
    "canonical_hash",
    "source_id",
    "org_name",
    "organisation_id",
    "deleted_at",
    "deleted_by",
    "deletion_reason",
    "status",
    "created_at",
    "fetched_at",
)


def _field(row: dict, name: str):
    return row.get(name)


def _calendar_day(value) -> str | None:
    """YYYY-MM-DD for a date, datetime, or that same calendar day as text."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        text = value.strip()
        if len(text) != 10:
            return None
        try:
            return datetime.strptime(text, "%Y-%m-%d").date().isoformat()
        except ValueError:
            return None
    return None


def _equivalent(stored, incoming) -> bool:
    """Same value, including a Postgres date and its YYYY-MM-DD text."""
    if stored == incoming:
        return True
    stored_day = _calendar_day(stored)
    incoming_day = _calendar_day(incoming)
    return stored_day is not None and stored_day == incoming_day


def _present_changes(existing: dict, candidate: dict) -> dict:
    """A missing key is not a change. An explicit None is."""
    changes = {}
    for name in VALIDATED_FIELDS:
        if name not in candidate:
            continue
        if not _equivalent(existing.get(name), candidate[name]):
            changes[name] = candidate[name]
    return changes


def upsert(
    catalog: list[dict],
    candidate: dict,
    crawl: CrawlRun,
    *,
    observed_at: datetime,
    heuristics: bool,
    reference: str | None = None,
) -> str:
    """Match either existing key. A hit does not replace the stored key."""
    title = candidate.get("title") or ""
    apply_url = candidate.get("apply_url") or ""
    keys = set(both_keys(title, apply_url, reference))
    matches = [row for row in catalog if row.get("canonical_hash") in keys]
    match_ids = {row.get("id") for row in matches}

    if len(match_ids) > 1:
        crawl.identity_conflict += 1
        return "identity_conflict"

    if not matches:
        catalog.append(
            _new_row(candidate, observed_at, heuristics=heuristics, reference=reference)
        )
        crawl.created += 1
        return "created"

    existing = matches[0]
    protected = {name: existing.get(name) for name in UNCHANGED_ON_MATCH}
    if existing.get("deleted_at") is not None:
        existing["last_seen_at"] = observed_at
        _restore(existing, protected)
        crawl.seen_again += 1
        return "seen_again"

    changes = _present_changes(existing, candidate)
    if changes:
        existing.update(changes)
        existing["last_seen_at"] = observed_at
        existing["updated_at"] = observed_at
        _restore(existing, protected)
        crawl.updated += 1
        return "updated"

    existing["last_seen_at"] = observed_at
    _restore(existing, protected)
    crawl.unchanged += 1
    return "unchanged"


def _restore(existing: dict, protected: dict) -> None:
    for name, value in protected.items():
        existing[name] = value


def _new_row(
    candidate: dict,
    observed_at: datetime,
    *,
    heuristics: bool,
    reference: str | None,
) -> dict:
    title = candidate.get("title") or ""
    apply_url = candidate.get("apply_url") or ""
    row = {name: _field(candidate, name) for name in VALIDATED_FIELDS}
    row.update(
        {
            "id": candidate.get("id") or str(uuid.uuid4()),
            "canonical_hash": write_key(
                title, apply_url, reference, heuristics=heuristics
            ),
            "source_id": candidate.get("source_id"),
            "org_name": candidate.get("org_name"),
            "organisation_id": candidate.get("organisation_id"),
            "deleted_at": None,
            "deleted_by": None,
            "deletion_reason": None,
            "status": "active",
            "created_at": observed_at,
            "fetched_at": observed_at,
            "last_seen_at": observed_at,
            "updated_at": observed_at,
        }
    )
    return row
