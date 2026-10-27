"""Crawl-run ownership. A run may write only while its crawl_logs row is still running.

The token is the run's crawl_logs.id. Every job save checks it first, inside the save's own
transaction, and holds the run row with FOR SHARE until that transaction ends, so a takeover
(which locks the same row FOR UPDATE) waits for a save in progress and refuses every later one.
"""


class OwnershipLost(RuntimeError):
    """The run no longer owns its source: no token, a foreign token, or a finished run."""


# A stuck database must not hold the run row or job rows indefinitely.
STEP_TIMEOUTS_SQL = (
    "SET LOCAL statement_timeout = '30s'; "
    "SET LOCAL idle_in_transaction_session_timeout = '60s'"
)

CONFIRM_RUNNING_SQL = """
    SELECT 1 FROM crawl_logs
    WHERE id = %s AND source_id = %s AND status = 'running'
    FOR SHARE
"""


def confirm_running(cursor, run_token, source_id) -> None:
    """Raise OwnershipLost unless run_token is a running run of source_id. Locks the run row.

    Must be the first statement of the save's transaction; it also sets the step timeouts.
    """
    if not run_token:
        raise OwnershipLost("no run token")
    cursor.execute(STEP_TIMEOUTS_SQL)
    cursor.execute(CONFIRM_RUNNING_SQL, (str(run_token), str(source_id)))
    if cursor.fetchone() is None:
        raise OwnershipLost(f"run {run_token} is not running for source {source_id}")

