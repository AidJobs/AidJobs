"""Which job pages a crawl opens (crawler plan, C3 and C4 amendment of 30 October 2026; W-09, W-36).

Pages are opened for the listing's new vacancies, up to NEW_PAGE_CAP a crawl. A saved job's page
is reopened only when its deadline is within DEADLINE_WINDOW_DAYS either side of the run's day, so
an extension is caught, or in a rotation that reaches each saved job about one crawl in
ROTATION_CRAWLS, up to KNOWN_PAGE_CAP a crawl. Every other saved job is read from its listing row
alone; a thin row of one is seen through the observation path in the writer. A new vacancy over the
cap that the listing alone leaves too thin is held back as detail_unconfirmed and read by a later
crawl; one the listing already admits is saved from the listing. Junk rows are never opened.

No network and no database: the crawler supplies the source's saved jobs and the admission verdicts.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date

from contracts.persist import observation_link

NEW_PAGE_CAP = 40
KNOWN_PAGE_CAP = 10
DEADLINE_WINDOW_DAYS = 3
ROTATION_CRAWLS = 7


@dataclass(frozen=True)
class SavedJob:
    id: str
    deadline: str | None  # YYYY-MM-DD, or None
    hidden: bool


def saved_job(job_id, deadline, hidden: bool) -> SavedJob:
    """A stored row as the page plan reads it; the deadline as a stored DATE or its text."""
    day = deadline.isoformat()[:10] if hasattr(deadline, "isoformat") else deadline
    return SavedJob(id=str(job_id), deadline=str(day)[:10] if day else None, hidden=hidden)


@dataclass
class PagePlan:
    open: set[int] = field(default_factory=set)
    listing_only: set[int] = field(default_factory=set)
    unconfirmed: set[int] = field(default_factory=set)


def link_key(url) -> str:
    """The normalised apply link, exactly as the observation path matches it."""
    return observation_link(url)


def rotation_bucket(job_id: str) -> int:
    """A stable bucket per job, the same in every process."""
    return int(hashlib.sha256(str(job_id).encode()).hexdigest(), 16) % ROTATION_CRAWLS


def _near_deadline(deadline: str | None, today: date) -> bool:
    if not deadline:
        return False
    try:
        day = date.fromisoformat(deadline[:10])
    except ValueError:
        return False
    return abs((day - today).days) <= DEADLINE_WINDOW_DAYS


def choose_pages(
    rows: list[dict],
    verdicts: dict[int, str],
    saved: dict[str, list[SavedJob]],
    *,
    today: date,
    run_number: int,
    new_cap: int | None = None,
    known_cap: int | None = None,
) -> PagePlan:
    """The plan for one listing.

    verdicts: admission's verdict on each row as the listing gives it ('admitted' or
    'thin_vacancy'); a row without one is junk. saved: the source's saved jobs by link_key.
    run_number: the source's crawl count, which turns the rotation.
    """
    new_cap = NEW_PAGE_CAP if new_cap is None else new_cap
    known_cap = KNOWN_PAGE_CAP if known_cap is None else known_cap
    plan = PagePlan()
    new_rows = 0
    deadline_rows: list[int] = []
    rotation_rows: list[int] = []
    turn = run_number % ROTATION_CRAWLS
    for index in sorted(verdicts):
        known = saved.get(link_key(rows[index].get("apply_url")), [])
        if not known:
            if new_rows < new_cap:
                plan.open.add(index)
                new_rows += 1
            elif verdicts[index] == "thin_vacancy":
                plan.unconfirmed.add(index)
            continue
        visible = [job for job in known if not job.hidden]
        if any(_near_deadline(job.deadline, today) for job in visible):
            deadline_rows.append(index)
        elif any(rotation_bucket(job.id) == turn for job in visible):
            rotation_rows.append(index)
        else:
            plan.listing_only.add(index)
    for index in (deadline_rows + rotation_rows)[:known_cap]:
        plan.open.add(index)
    for index in (deadline_rows + rotation_rows)[known_cap:]:
        plan.listing_only.add(index)
    return plan
