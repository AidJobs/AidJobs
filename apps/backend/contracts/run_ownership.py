"""Crawl-run ownership. A run may write only while its crawl_logs row is still running.

The token is the run's crawl_logs.id. Every job save checks it first, inside the save's own
transaction, and holds the run row with FOR SHARE until that transaction ends, so a takeover
(which locks the same row FOR UPDATE) waits for a save in progress and refuses every later one.

Before that, the save holds its source row with FOR KEY SHARE and refuses a deleted or removed
source (W-52). A source delete locks that row FOR UPDATE, so it waits for a save in progress, and
its own job update then sees the saved jobs; a later save waits for the delete and refuses. The
run's finish and a takeover take the source row FOR NO KEY UPDATE, which KEY SHARE does not
block, so taking it before the run row adds no deadlock with them.
"""


class OwnershipLost(RuntimeError):
    """The run no longer owns its source: no token, a foreign token, or a finished run."""


class SourceDeleted(OwnershipLost):
    """The run's source was deleted or removed: none of its jobs may be saved live."""


# A stuck database must not hold the run row or job rows indefinitely.
STEP_TIMEOUTS_SQL = (
    "SET LOCAL statement_timeout = '30s'; "
    "SET LOCAL idle_in_transaction_session_timeout = '60s'"
)

SOURCE_LIVE_SQL = """
    SELECT status FROM sources
    WHERE id = %s
    FOR KEY SHARE
"""

# ran_at::date is the day the run started on as the database dates it: the CURRENT_DATE its start
# count of open jobs used, so the writer reads "deadline passed" on the same calendar.
CONFIRM_RUNNING_SQL = """
    SELECT ran_at::date FROM crawl_logs
    WHERE id = %s AND source_id = %s AND status = 'running'
    FOR SHARE
"""

SOURCE_DELETED_MESSAGE = "The source was deleted during the crawl; no more of its jobs were saved"


def confirm_running(cursor, run_token, source_id):
    """Raise OwnershipLost unless run_token is a running run of source_id, and SourceDeleted
    when that source is deleted or gone. Locks the source row, then the run row.

    Returns the day the run started on, as the database dates it (for the writer's open jobs).
    Must be the first statement of the save's transaction; it also sets the step timeouts.
    """
    if not run_token:
        raise OwnershipLost("no run token")
    cursor.execute(STEP_TIMEOUTS_SQL)
    cursor.execute(SOURCE_LIVE_SQL, (str(source_id),))
    source = cursor.fetchone()
    if source is None or source[0] == "deleted":
        raise SourceDeleted(SOURCE_DELETED_MESSAGE)
    cursor.execute(CONFIRM_RUNNING_SQL, (str(run_token), str(source_id)))
    run = cursor.fetchone()
    if run is None:
        raise OwnershipLost(f"run {run_token} is not running for source {source_id}")
    return run[0]


def save_failure_outcome(status: str, message: str, counts: dict) -> tuple:
    """Issue #5: a crawl whose every job failed to save is a failure; some failures, a warning."""
    failed = counts.get("failed", 0) or 0
    # Jobs that reached their write; jobs skipped before it do not dilute "every job failed".
    attempted = counts.get("attempted", counts.get("validated", 0)) or 0
    if not failed:
        return status, message
    if attempted and failed >= attempted:
        return "fail", f"{message}; every job failed to save ({failed})"
    return "warn", f"{message}; {failed} of {attempted} jobs failed to save"
