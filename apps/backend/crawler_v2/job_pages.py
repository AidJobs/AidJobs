"""Which job pages a crawl opens (crawler plan, C3 and C4 amendment of 30 October 2026; W-09, W-36).

Pages are opened for the listing's new vacancies, up to NEW_PAGE_CAP a crawl. A saved job's page
is reopened only when its deadline is within DEADLINE_WINDOW_DAYS either side of the run's day, so
an extension is caught, or on its turn in a rotation of ROTATION_CRAWLS crawls, up to
KNOWN_PAGE_CAP a crawl, deadlines first. When more rows qualify than a cap allows, the start of
their order moves on by the cap each crawl (each turn, for the rotation), so no row waits behind
the same others every time. Every other
saved job is read from its listing row alone; a too-thin row of one is seen through the
observation path in the writer. A new vacancy over the cap that the listing alone leaves too thin
is held back as detail_unconfirmed and read by a later crawl; one the listing already admits is
saved from the listing. A row whose rejection no page can cure is never opened.

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
    # Every row that is a saved job of the source, opened or not.
    saved: set[int] = field(default_factory=set)


def link_key(url) -> str:
    """The normalised apply link, exactly as the observation path matches it."""
    return observation_link(url)


def _digest(text: str) -> int:
    return int(hashlib.sha256(text.encode()).hexdigest(), 16)


def rotation_bucket(job_id: str) -> int:
    """A stable bucket per job, the same in every process: its turn is when the source's crawl
    count modulo ROTATION_CRAWLS equals it."""
    return _digest(str(job_id)) % ROTATION_CRAWLS


def _this_crawls_order(rows: list[dict], indexes: list[int], step: int, cap: int) -> list[int]:
    """The rows in a fixed order (by link), started cap places further on each step, so with an
    unchanged set every row is within the cap at least once in ceil(len / cap) steps."""
    ordered = sorted(indexes, key=lambda index: _digest(link_key(rows[index].get("apply_url"))))
    if not ordered or cap <= 0:
        return ordered
    start = (step * cap) % len(ordered)
    return ordered[start:] + ordered[:start]


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
    run_number: the source's crawl count, which turns the rotation and the order within a cap.
    """
    new_cap = NEW_PAGE_CAP if new_cap is None else new_cap
    known_cap = KNOWN_PAGE_CAP if known_cap is None else known_cap
    plan = PagePlan()
    new_rows: list[int] = []
    deadline_rows: list[int] = []
    rotation_rows: list[int] = []
    turn = run_number % ROTATION_CRAWLS
    for index in sorted(verdicts):
        known = saved.get(link_key(rows[index].get("apply_url")), [])
        if not known:
            new_rows.append(index)
            continue
        plan.saved.add(index)
        visible = [job for job in known if not job.hidden]
        if any(_near_deadline(job.deadline, today) for job in visible):
            deadline_rows.append(index)
        elif any(rotation_bucket(job.id) == turn for job in visible):
            rotation_rows.append(index)
        else:
            plan.listing_only.add(index)
    ordered_new = _this_crawls_order(rows, new_rows, run_number, new_cap)
    plan.open.update(ordered_new[:new_cap])
    plan.unconfirmed.update(
        index for index in ordered_new[new_cap:] if verdicts[index] == "thin_vacancy"
    )
    # Deadlines first; a rotation bucket comes round once in ROTATION_CRAWLS crawls, so its
    # order moves on once per turn.
    known_rows = (
        _this_crawls_order(rows, deadline_rows, run_number, known_cap)
        + _this_crawls_order(rows, rotation_rows, run_number // ROTATION_CRAWLS, known_cap)
    )
    plan.open.update(known_rows[:known_cap])
    plan.listing_only.update(known_rows[known_cap:])
    return plan
