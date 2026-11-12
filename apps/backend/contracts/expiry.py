"""Expiry (contract §6; growth plan, section 4.3, with its amendment of 11 November 2026).

The expiry rules are written here and nowhere else. The run's finish expires by absence, the
writer returns a job on sight, the daily pass expires passed deadlines and drops descriptions
90 days after a job closes, and scripts/expiry_preview.py reads the same conditions read-only.
Every date is the database's CURRENT_DATE, the rule public search applies.

Expiry changes lifecycle only (status and expired_at): it never deletes, hides or unhides a row.
This module does not open a connection, commit or roll back.
"""
from contracts.upsert import calendar_day

ABSENCE_RUNS = 2
ABSENCE_SPAN = "24 hours"
DESCRIPTION_DAYS = 90
# last_seen_at is stamped by the app's clock and a run's ran_at by the database's. A run that
# started this soon after a job's last sighting is never taken to have missed it, so a clock
# difference can never make the run that saw a job count against it.
SIGHTING_MARGIN = "10 minutes"

def absence_where(runs: int = ABSENCE_RUNS, span: str = ABSENCE_SPAN) -> str:
    """A job j of source %(source_id)s missing from at least `runs` counting runs of its source
    since it was last seen, spanning at least `span`. Open and not hidden only (the amendment's
    "jobs that are not hidden"); a job whose deadline has passed is left to the daily pass, which
    expires it by its deadline. Only the defaults are the expiry rule; the preview also reads
    other values."""
    return f"""
    j.source_id = %(source_id)s
    AND j.status = 'active'
    AND j.deleted_at IS NULL
    AND (j.deadline IS NULL OR j.deadline >= CURRENT_DATE)
    AND (
        SELECT COUNT(*) >= {int(runs)}
               AND MAX(c.ran_at) - MIN(c.ran_at) >= INTERVAL '{span}'
        FROM crawl_logs c
        WHERE c.source_id = j.source_id
          AND c.counted IS TRUE
          AND c.ran_at > COALESCE(j.last_seen_at, j.created_at) + INTERVAL '{SIGHTING_MARGIN}'
    )
"""


ABSENCE_WHERE = absence_where()

EXPIRE_BY_ABSENCE_SQL = f"""
    UPDATE jobs j SET status = 'expired', expired_at = NOW()
    WHERE {ABSENCE_WHERE}
    RETURNING j.id
"""

# Every row, hidden or not (the amendment of 11 November 2026).
DEADLINE_WHERE = "status = 'active' AND deadline IS NOT NULL AND deadline < CURRENT_DATE"

# The day a job closed: its passed deadline, or the day it expired by absence.
CLOSED_DAY = "LEAST(deadline, expired_at::date)"

# A closed job: expired, or due to expire by its deadline (the pass expires those first, so the
# preview, run before the pass, counts the same rows).
DESCRIPTION_WHERE = (
    f"description IS NOT NULL AND (status = 'expired' OR ({DEADLINE_WHERE}))"
    f" AND {CLOSED_DAY} <= CURRENT_DATE - {DESCRIPTION_DAYS}"
)

# The daily pass skips rows a crawl's open transaction holds, so it never waits on a crawl and
# never deadlocks with one; what it skipped is done on its next attempt.
EXPIRE_BY_DEADLINE_SQL = f"""
    UPDATE jobs SET status = 'expired', expired_at = NOW()
    WHERE id IN (SELECT id FROM jobs WHERE {DEADLINE_WHERE} FOR UPDATE SKIP LOCKED)
"""

DROP_DESCRIPTIONS_SQL = f"""
    UPDATE jobs SET description = NULL
    WHERE id IN (SELECT id FROM jobs WHERE {DESCRIPTION_WHERE} FOR UPDATE SKIP LOCKED)
"""

PASS_LEFT_SQL = f"""
    SELECT (SELECT COUNT(*) FROM jobs WHERE {DEADLINE_WHERE})
         + (SELECT COUNT(*) FROM jobs WHERE {DESCRIPTION_WHERE})
"""

# An expired job seen again. Expired by absence (its deadline before this reading had not
# passed): it returns unless the stored deadline has now passed. Expired by its deadline: only a
# reading that stores a deadline on or after today brings it back; being seen does not.
RETURN_ON_SIGHT_SQL = """
    UPDATE jobs SET status = 'active', expired_at = NULL
    WHERE id = %(id)s AND status = 'expired'
      AND (deadline >= CURRENT_DATE
           OR (deadline IS NULL
               AND (%(prior)s::date IS NULL OR %(prior)s::date >= CURRENT_DATE)))
    RETURNING id
"""


def _first(row):
    if row is None:
        return None
    if isinstance(row, dict):
        return next(iter(row.values()))
    return row[0]


def expire_absent(cursor, source_id) -> list:
    """Expire the source's jobs missing from its counting runs. Call only in the finish of a run
    that counts, under its ownership. Returns the ids expired."""
    cursor.execute(EXPIRE_BY_ABSENCE_SQL, {"source_id": str(source_id)})
    return [str(_first(row)) for row in cursor.fetchall()]


def return_on_sight(cursor, job_id, prior_deadline) -> bool:
    """Make an expired job that a crawl saw open again, when the rules allow it.

    prior_deadline is the deadline stored before this sighting's write, which tells a job
    expired by absence from one expired by its deadline. True when the job returned.
    """
    cursor.execute(
        RETURN_ON_SIGHT_SQL, {"id": str(job_id), "prior": calendar_day(prior_deadline)}
    )
    return cursor.fetchone() is not None


def daily_pass(cursor) -> dict:
    """Expire every passed deadline, then drop descriptions 90 days after their job closed.

    "left" counts the rows still due, skipped because a crawl held them; the caller tries again.
    """
    cursor.execute(EXPIRE_BY_DEADLINE_SQL)
    expired = max(cursor.rowcount, 0)
    cursor.execute(DROP_DESCRIPTIONS_SQL)
    dropped = max(cursor.rowcount, 0)
    cursor.execute(PASS_LEFT_SQL)
    left = int(_first(cursor.fetchone()) or 0)
    return {"expired": expired, "descriptions_dropped": dropped, "left": left}
