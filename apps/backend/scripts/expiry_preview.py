r"""Read-only preview of what expiry would do (W-06, growth plan, step 4.6).

It runs the expiry rules' own conditions (contracts/expiry.py) as SELECTs, so it lists exactly
what the next counting run's finish and the next daily pass would change. It changes nothing.

Run through scripts/with-readonly-db.ps1, which sets AIDJOBS_READONLY_DB_URL from the
SecretStore vault for this command only. From a PowerShell prompt at the repository's root:

    & .\scripts\with-readonly-db.ps1 -- `
        apps\backend\.venv311\Scripts\python.exe apps\backend\scripts\expiry_preview.py

It never reads an env file. It forces a read-only session and stops unless the database confirms
it and the login is aidjobs_readonly. It prints each source's recent runs, the jobs that would
expire by absence (title, link, dates), and counts for the daily pass. No connection details and
no error text (it can name the host).
"""

import os
import sys
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from contracts.expiry import (  # noqa: E402
    ABSENCE_WHERE,
    DEADLINE_WHERE,
    DESCRIPTION_WHERE,
    absence_where,
)

URL_VARIABLE = "AIDJOBS_READONLY_DB_URL"
EXPECTED_ROLE = "aidjobs_readonly"
RECENT_RUNS = 6

SOURCES_SQL = "SELECT id, org_name, status FROM sources ORDER BY org_name, id"

RUNS_SQL = """
    SELECT ran_at, status, listing_complete, valid_count, observed, matched_active,
           active_at_start, failed_saves, unrecorded, counted
    FROM crawl_logs
    WHERE source_id = %(source_id)s AND status <> 'running'
    ORDER BY ran_at DESC
    LIMIT %(limit)s
"""

COUNTING_SQL = """
    SELECT COUNT(*) FROM crawl_logs WHERE source_id = %(source_id)s AND counted IS TRUE
"""

ABSENT_SQL = f"""
    SELECT j.title, j.apply_url, j.last_seen_at, j.deadline, j.created_at
    FROM jobs j
    WHERE {ABSENCE_WHERE}
    ORDER BY j.last_seen_at NULLS FIRST, j.title
"""

MISSED_ONCE_SQL = f"""
    SELECT COUNT(*) FROM jobs j WHERE {absence_where(1, "0 seconds")}
"""

DEADLINE_SQL = f"""
    SELECT s.org_name, COUNT(*), COUNT(*) FILTER (WHERE d.deleted_at IS NOT NULL)
    FROM (SELECT source_id, deleted_at FROM jobs WHERE {DEADLINE_WHERE}) d
    LEFT JOIN sources s ON s.id = d.source_id
    GROUP BY s.org_name ORDER BY s.org_name
"""

DESCRIPTIONS_SQL = f"SELECT COUNT(*) FROM jobs WHERE {DESCRIPTION_WHERE}"


def _one(cursor, sql, params=None):
    cursor.execute(sql, params)
    return cursor.fetchone()[0]


def _day(value) -> str:
    return value.strftime("%Y-%m-%d %H:%M UTC") if hasattr(value, "strftime") else "-"


def _runs(cursor, source_id, out) -> None:
    cursor.execute(RUNS_SQL, {"source_id": source_id, "limit": RECENT_RUNS})
    rows = cursor.fetchall()
    if not rows:
        out("    no finished runs")
        return
    for ran_at, status, complete, valid, observed, matched, active, failed, unrecorded, counted \
            in rows:
        out(
            f"    {_day(ran_at)}  {status:<11} complete={complete}  valid={valid}"
            f" observed={observed}  matched {matched} of {active} open"
            f"  failed={failed} unrecorded={unrecorded}  counts={counted}"
        )


def preview(cursor, out) -> None:
    out(f"database day: {_one(cursor, 'SELECT CURRENT_DATE')}")
    cursor.execute(SOURCES_SQL)
    sources = cursor.fetchall()
    total_absent = 0
    for source_id, name, status in sources:
        params = {"source_id": source_id}
        out("")
        out(f"{name} ({status})")
        out(f"  counting runs: {_one(cursor, COUNTING_SQL, params)}; recent runs:")
        _runs(cursor, source_id, out)
        cursor.execute(ABSENT_SQL, params)
        absent = cursor.fetchall()
        total_absent += len(absent)
        missed = _one(cursor, MISSED_ONCE_SQL, params)
        out(f"  missed by at least one counting run since last seen: {missed}")
        out(f"  would expire by absence at the next counting run's finish: {len(absent)}")
        for title, link, last_seen, deadline, created in absent:
            out(
                f"    - {title} | {link} | last seen {_day(last_seen)}"
                f" | deadline {deadline or '-'} | first saved {_day(created)}"
            )
    out("")
    out(f"would expire by absence, all sources: {total_absent}")
    out("would expire by passed deadline at the next daily pass (hidden among them):")
    cursor.execute(DEADLINE_SQL)
    rows = cursor.fetchall()
    for name, count, hidden in rows:
        out(f"  {name or '(no source)'}: {count} ({hidden})")
    out(f"  all sources: {sum(row[1] for row in rows)}")
    out(f"descriptions the next daily pass would drop: {_one(cursor, DESCRIPTIONS_SQL)}")


def main(environ=None, connect=None, out=print) -> int:
    environ = os.environ if environ is None else environ
    connect = psycopg2.connect if connect is None else connect
    url = environ.get(URL_VARIABLE)
    if not url:
        out(f"{URL_VARIABLE} is not set; run this through scripts/with-readonly-db.ps1")
        return 2
    try:
        conn = connect(url, connect_timeout=10, application_name="aidjobs-expiry-preview")
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
            cur.execute("SET LOCAL statement_timeout = '20s'")
            preview(cur, out)
        conn.rollback()
    except Exception as e:
        out(f"preview failed ({type(e).__name__})")
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
