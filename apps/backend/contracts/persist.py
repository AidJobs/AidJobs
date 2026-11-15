"""Apply the contract upsert inside the caller's database transaction.

This module does not open a connection, commit, roll back, or take a lock.
The crawler that already owns the transaction calls it and keeps that boundary.
"""
import json
from datetime import date, datetime, timezone

from contracts.expiry import return_on_sight
from contracts.identity import both_keys
from contracts.models import CrawlRun
from contracts.upsert import VALIDATED_FIELDS, calendar_day, upsert
from contracts.validate import rejection_reason
from core.extraction_heuristics import normalize_url

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
    not_open: list | None = None,
    open_on: date | None = None,
    returned: list | None = None,
) -> str:
    """Validate, decide with the contract upsert, then write that decision.

    seen, when given, receives the id of a matched job of this candidate's source that was open
    before this write (active, not hidden, its deadline not before open_on): the crawl's evidence
    that it read the source's open jobs (contract §6). not_open receives the other matched jobs
    of the source. open_on is the run's first day as the database dates it, so the writer and
    the run's start count read "passed" on the same calendar; without it, the UTC day.
    A job reported in seen may still have to be left out by the caller: one this run created, or
    one that was in not_open earlier in the run (a row can change a job's deadline).
    A matched job that was expired returns on sight, after this write (contracts.expiry);
    returned receives its id.
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
        _note_seen(seen, not_open, before.get(row["id"]), payload.get("source_id"),
                   _open_on(open_on, observed_at))
        _return_if_expired(cursor, before.get(row["id"]), returned)
        return decision

    row = catalog[0]
    prior = before[row["id"]]
    _note_seen(seen, not_open, prior, payload.get("source_id"), _open_on(open_on, observed_at))
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
    _return_if_expired(cursor, prior, returned)
    return decision


def _return_if_expired(cursor, prior, returned) -> None:
    """The return on sight, for a matched job that was expired before this write."""
    if not prior or prior.get("status") != "expired" or prior.get("id") is None:
        return
    if return_on_sight(cursor, prior["id"], prior.get("deadline")) and returned is not None:
        returned.append(str(prior["id"]))


_OBSERVABLE_COLUMNS = ("id", "apply_url", "status", "deadline", "deleted_at")


def observation_link(url) -> str:
    """The normalised apply link the observation path matches on (W-36)."""
    return normalize_url(str(url or "").strip())


def observable_jobs(cursor, source_id) -> dict:
    """The source's saved jobs that could be observed (not hidden; active or expired), by
    observation_link, read inside the save's transaction. observe_known applies the deadline."""
    cursor.execute(
        f"SELECT {', '.join(_OBSERVABLE_COLUMNS)} FROM jobs"
        " WHERE source_id = %s AND deleted_at IS NULL AND status IN ('active', 'expired')",
        (str(source_id),),
    )
    by_link: dict = {}
    for record in cursor.fetchall():
        row = dict(record) if isinstance(record, dict) else dict(zip(_OBSERVABLE_COLUMNS, record))
        by_link.setdefault(observation_link(row.get("apply_url")), []).append(row)
    return by_link


def observe_known(
    cursor,
    row: dict,
    by_link: dict,
    *,
    observed_at: datetime,
    source_id,
    open_on: date | None = None,
    seen: list | None = None,
    not_open: list | None = None,
    returned: list | None = None,
) -> str:
    """The observation path (crawler plan, C3 and C4 amendment; contract §6; W-36).

    A listing row admission rejected as too thin counts as a saved job seen when its normalised
    apply link matches exactly one job of the same source that is not hidden and is active or
    expired by absence; a job whose stored deadline has passed is expired by its deadline and is
    not matched. Only that job's last_seen_at is written: no other field, no identity, no
    hiding; a job expired by absence returns on sight (contract §6), and returned receives its
    id. Returns 'observed', 'ambiguous' (two or more such jobs: nothing is observed),
    'ineligible' (only hidden, passed or other jobs have the link) or 'unknown'.
    """
    day = _open_on(open_on, observed_at)
    matches = by_link.get(observation_link(row.get("apply_url")), [])
    if not matches:
        return "unknown"
    eligible = [
        job for job in matches
        if job.get("deleted_at") is None
        and job.get("status") in ("active", "expired")
        and not _deadline_before(job.get("deadline"), day)
    ]
    if not eligible:
        return "ineligible"
    if len(eligible) > 1:
        return "ambiguous"
    job = eligible[0]
    cursor.execute("UPDATE jobs SET last_seen_at = %s WHERE id = %s", (observed_at, job["id"]))
    _note_seen(seen, not_open, {**job, "source_id": source_id}, source_id, day)
    _return_if_expired(cursor, job, returned)
    return "observed"


def _deadline_before(deadline, day: date) -> bool:
    stored = calendar_day(deadline)
    return stored is not None and stored < day.isoformat()


def created_ids(recorded) -> list:
    """The ids a save created, from the list persist_candidate records them in."""
    return [entry["job_id"] for entry in recorded or () if entry.get("outcome") == "created"]


def _open_on(open_on, observed_at: datetime) -> date:
    """The run's day when known; otherwise the UTC day of the observation (naive is UTC)."""
    if isinstance(open_on, date) and not isinstance(open_on, datetime):
        return open_on
    if observed_at.tzinfo is None:
        return observed_at.date()
    return observed_at.astimezone(timezone.utc).date()


def _note_seen(seen, not_open, prior, source_id, open_on: date) -> None:
    if seen is None or not prior or prior.get("id") is None or source_id is None:
        return
    # The identity keys ignore the source, so a row can match another source's job.
    if str(prior.get("source_id")) != str(source_id):
        return
    # A stored deadline already passed makes the job expired under contract §6, so it is not
    # one of the open jobs the run's start counted.
    deadline = calendar_day(prior.get("deadline"))
    is_open = (
        prior.get("status") == "active"
        and prior.get("deleted_at") is None
        and (deadline is None or deadline >= open_on.isoformat())
    )
    if is_open:
        seen.append(str(prior["id"]))
    elif not_open is not None:
        not_open.append(str(prior["id"]))


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
