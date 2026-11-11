"""Apply the contract upsert inside the caller's database transaction.

This module does not open a connection, commit, roll back, or take a lock.
The crawler that already owns the transaction calls it and keeps that boundary.
"""
import json
from datetime import datetime, timezone

from contracts.identity import both_keys
from contracts.models import CrawlRun
from contracts.upsert import VALIDATED_FIELDS, _calendar_day, upsert
from contracts.validate import rejection_reason

# Read set for the match. Geocoding and quality are not loaded and are not
# part of the unchanged-versus-updated decision.
LOAD_COLUMNS = (
    "id",
    "canonical_hash",
    "title",
    "apply_url",
    "description_snippet",
    "location_raw",
    "country",
    "country_iso",
    "city",
    "is_remote",
    "deadline",
    "description",
    "posted_on",
    "locations",
    "contract_type",
    "salary_range_text",
    "advert_language",
    "source_id",
    "org_name",
    "deleted_at",
    "deleted_by",
    "deletion_reason",
    "status",
    "created_at",
    "fetched_at",
    "last_seen_at",
    "updated_at",
)

# Written on create and on a real field update only. Never on an unchanged crawl.
SUPPLEMENTARY_FIELDS = (
    "latitude",
    "longitude",
    "geocoding_source",
    "geocoded_at",
    "quality_score",
    "quality_grade",
    "quality_factors",
    "quality_issues",
    "needs_review",
    "quality_scored_at",
)

_JSON_FIELDS = frozenset({"quality_factors"})


def persist_candidate(
    cursor,
    candidate: dict,
    *,
    observed_at: datetime,
    heuristics: bool,
    reference: str | None = None,
    source_id: str | None = None,
    org_name: str | None = None,
    recorded: list | None = None,
    seen: list | None = None,
) -> str:
    """Validate, decide with the contract upsert, then write that decision.

    seen, when given, receives the id of a matched job of this candidate's source that was open
    (active, its deadline not passed) and not hidden before this write: the crawl's evidence
    that it read the source's open jobs
    (contract §6). A job this run created is reported too when a later row matches it; the
    caller removes those.
    """
    if candidate.get("admitted") is not True:
        return "rejected"
    if rejection_reason(candidate):
        return "rejected"

    payload = dict(candidate)
    payload.pop("admitted", None)
    if source_id is not None and "source_id" not in payload:
        payload["source_id"] = source_id
    if org_name is not None and "org_name" not in payload:
        payload["org_name"] = org_name

    title = payload.get("title") or ""
    apply_url = payload.get("apply_url") or ""
    keys = list(both_keys(title, apply_url, reference))
    cursor.execute(
        f"SELECT {', '.join(LOAD_COLUMNS)} FROM jobs WHERE canonical_hash = ANY(%s)",
        (keys,),
    )
    catalog = [_as_row(record) for record in cursor.fetchall()]
    before = {row.get("id"): dict(row) for row in catalog}
    crawl = CrawlRun(source_id=str(payload.get("source_id") or ""))
    decision = upsert(
        catalog,
        payload,
        crawl,
        observed_at=observed_at,
        heuristics=heuristics,
        reference=reference,
    )

    if decision == "identity_conflict":
        return decision
    if decision == "created":
        _insert(cursor, catalog[-1], payload)
        _remember(recorded, decision, catalog[-1].get("id"))
        return decision
    if decision in ("unchanged", "seen_again"):
        row = catalog[0]
        cursor.execute(
            "UPDATE jobs SET last_seen_at = %s WHERE id = %s",
            (observed_at, row["id"]),
        )
        if decision == "seen_again":
            _remember(recorded, decision, row.get("id"))
        _note_seen(seen, before.get(row["id"]), payload.get("source_id"), observed_at)
        return decision

    row = catalog[0]
    prior = before[row["id"]]
    _note_seen(seen, prior, payload.get("source_id"), observed_at)
    assignments = {
        name: row.get(name)
        for name in VALIDATED_FIELDS
        if row.get(name) != prior.get(name)
    }
    assignments["last_seen_at"] = observed_at
    assignments["updated_at"] = observed_at
    for name in SUPPLEMENTARY_FIELDS:
        if name in payload and payload[name] is not None:
            assignments[name] = payload[name]
    _update(cursor, row["id"], assignments)
    _remember(recorded, decision, row.get("id"))
    return decision


def created_ids(recorded) -> list:
    """The ids a save created, from the list persist_candidate records them in."""
    return [entry["job_id"] for entry in recorded or () if entry.get("outcome") == "created"]


def _note_seen(seen, prior, source_id, observed_at) -> None:
    if seen is None or not prior or prior.get("id") is None or source_id is None:
        return
    # The identity keys ignore the source, so a row can match another source's job.
    if str(prior.get("source_id")) != str(source_id):
        return
    if prior.get("status") != "active" or prior.get("deleted_at") is not None:
        return
    # A stored deadline already passed makes the job expired under contract §6, so it is not
    # one of the open jobs the run's start counted. Compared on the UTC day, as CURRENT_DATE is.
    if observed_at.tzinfo is None:
        today = observed_at.date()
    else:
        today = observed_at.astimezone(timezone.utc).date()
    deadline = _calendar_day(prior.get("deadline"))
    if deadline is not None and deadline < today.isoformat():
        return
    seen.append(str(prior["id"]))


def _remember(recorded, outcome: str, job_id) -> None:
    """Record the id this call wrote. Unchanged, rejected, and conflicts stay out."""
    if recorded is None or job_id is None:
        return
    if outcome not in ("created", "updated", "seen_again"):
        return
    recorded.append({"outcome": outcome, "job_id": str(job_id)})


def _insert(cursor, row: dict, candidate: dict) -> None:
    columns = [
        "id",
        "canonical_hash",
        "source_id",
        "org_name",
        "status",
        "created_at",
        "fetched_at",
        "last_seen_at",
        "updated_at",
    ]
    values = [row.get(name) for name in columns]
    for name in VALIDATED_FIELDS:
        columns.append(name)
        values.append(row.get(name))
    for name in SUPPLEMENTARY_FIELDS:
        if name in candidate and candidate[name] is not None:
            columns.append(name)
            values.append(candidate[name])
    placeholders = ", ".join(["%s"] * len(columns))
    bound = [_bind(name, value) for name, value in zip(columns, values)]
    cursor.execute(
        f"INSERT INTO jobs ({', '.join(columns)}) VALUES ({placeholders})",
        bound,
    )


def _update(cursor, row_id, assignments: dict) -> None:
    forbidden = {"id", "canonical_hash", "deleted_at", "deleted_by", "deletion_reason", "status"}
    names = [name for name in assignments if name not in forbidden]
    set_clause = ", ".join(f"{name} = %s" for name in names)
    values = [_bind(name, assignments[name]) for name in names]
    values.append(row_id)
    cursor.execute(f"UPDATE jobs SET {set_clause} WHERE id = %s", values)


def _bind(name: str, value):
    if name in _JSON_FIELDS and value is not None and not isinstance(value, str):
        return json.dumps(value)
    return value


def _as_row(record) -> dict:
    if isinstance(record, dict):
        return dict(record)
    return dict(zip(LOAD_COLUMNS, record))
