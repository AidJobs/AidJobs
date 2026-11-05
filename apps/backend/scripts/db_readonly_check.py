r"""Read-only production check (security plan, stage 6). Prints counts only.

Run through scripts/with-readonly-db.ps1, which sets AIDJOBS_READONLY_DB_URL from the
SecretStore vault for this command only. From a PowerShell prompt at the repository's root:

    & .\scripts\with-readonly-db.ps1 -- `
        apps\backend\.venv311\Scripts\python.exe apps\backend\scripts\db_readonly_check.py

It never reads an env file. It forces a read-only session, stops unless the database confirms
it and the login is aidjobs_readonly, and prints the crawl locks, the running runs, the jobs
and the sources. No connection details, no row contents, no error text (it can name the host).
"""

import os
import sys

import psycopg2

URL_VARIABLE = "AIDJOBS_READONLY_DB_URL"
EXPECTED_ROLE = "aidjobs_readonly"
COUNTS = (
    ("crawl locks", "SELECT COUNT(*) FROM crawl_locks"),
    ("running runs", "SELECT COUNT(*) FROM crawl_logs WHERE status = 'running'"),
    ("jobs", "SELECT COUNT(*) FROM jobs"),
    ("open jobs", "SELECT COUNT(*) FROM jobs WHERE status = 'active' AND deleted_at IS NULL"),
    ("sources", "SELECT COUNT(*) FROM sources"),
)


def _one(cursor, sql):
    cursor.execute(sql)
    return cursor.fetchone()[0]


def main(environ=None, connect=None, out=print) -> int:
    environ = os.environ if environ is None else environ
    connect = psycopg2.connect if connect is None else connect
    url = environ.get(URL_VARIABLE)
    if not url:
        out(f"{URL_VARIABLE} is not set; run this through scripts/with-readonly-db.ps1")
        return 2
    try:
        conn = connect(url, connect_timeout=10, application_name="aidjobs-readonly-check")
    except Exception as e:
        out(f"could not connect ({type(e).__name__})")
        return 1
    try:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            read_only = _one(cur, "SHOW transaction_read_only")
            out(f"transaction_read_only: {read_only}")
            if read_only != "on":
                out("refused: the session is not read-only")
                return 1
            role = _one(cur, "SELECT current_user")
            if role != EXPECTED_ROLE:
                out(f"refused: signed in as {role}, not {EXPECTED_ROLE}")
                return 1
            out(f"role: {role}")
            out(f"role default read-only: {_one(cur, 'SHOW default_transaction_read_only')}")
            cur.execute("SET LOCAL statement_timeout = '10s'")
            for label, sql in COUNTS:
                out(f"{label}: {_one(cur, sql)}")
        conn.rollback()
    except Exception as e:
        out(f"check failed ({type(e).__name__})")
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
