"""Offline crawl comparison: one backend checkout against another, on saved pages (opt-in).

Never run by CI and never against production. It runs the real scheduler path (due sources,
lock, run row, crawler, save, finish) for twelve saved listing pages, with every fetch served
from the saved files and Python sockets closed to anything but loopback, on a local database
whose name ends in _test, which it empties and rebuilds from tests/sql/crawl_schema.sql.

Scenarios: "normal" crawls the pages. The others inject an error whose text carries fake
secrets, at the places that store a crawl outcome or log a database failure:
  crawl-error    the HTML crawler's extraction raises     (crawler's failure message)
  source-error   the crawler itself raises                 (orchestrator's crawl message)
  run-error      the orchestrator's crawl step raises      (the run's failure message)
  save-error     every job's save raises                   (failed_inserts.error)
  connect-error  the crawl's database connection fails     (the connection log lines)

  python scripts/offline_crawl_compare.py run --backend CHECKOUT/apps/backend \
      --pages RAW_HTML --db postgresql://postgres@localhost:54329/aidjobs_compare_test \
      --scenario normal --out before-normal.json
  python scripts/offline_crawl_compare.py compare before-normal.json after-normal.json

compare prints every difference in sources, crawl_logs, jobs and failed_inserts, after leaving
out ids and timestamps. A difference is "masked" only when the second file's value is the first's
with each fake secret replaced by the redaction mark (cut at a stored limit at most); any other
difference fails. It also counts the captured log messages and final log lines that hold a fake
secret. Python sockets are closed to anything but loopback; name lookups are not blocked.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import socket
import sys
from pathlib import Path
from urllib.parse import urlparse

FAKE_PASSWORD = "FAKEPW" + "3Rk" + "-7710z"
FAKE_KEY = "fakekey-" + "C0mp" + "arison4242"
FAKES = (FAKE_PASSWORD, FAKE_KEY)
LEAK = (f"connect to postgresql://probe:{FAKE_PASSWORD}@db.example.invalid:5432/x failed; "
        f"key {FAKE_KEY}")
VALUE_MARK = "<redacted>"
SCENARIOS = ("normal", "crawl-error", "source-error", "run-error", "save-error", "connect-error")
SCHEMA = Path(__file__).resolve().parents[1] / "tests" / "sql" / "crawl_schema.sql"

# (organisation, saved file relative to the pages folder, careers URL, saved status)
SOURCES = [
    ("MSF", "career-coverage/msf.body", "https://www.msf.org/careers", 404),
    ("GPE", "career-coverage/gpe.body", "https://www.globalpartnership.org/careers", 200),
    ("ICRC", "career-coverage/icrc.body",
     "https://careers.icrc.org/go/Global-Opportunities/8821501/", 200),
    ("IRC", "career-coverage/irc.body", "https://careers.rescue.org/en/index.html", 200),
    ("ReliefWeb", "career-coverage/reliefweb.body", "https://reliefweb.int/jobs", 202),
    ("Oxfam GB", "career-coverage/oxfam.body", "https://jobs.oxfam.org.uk/jobs/home/", 200),
    ("DevNetJobsIndia", "career-coverage/devnet.body", "https://www.devnetjobsindia.org/", 200),
    ("UNESCO", "careers_unesco_org/*/*/*.html",
     "https://careers.unesco.org/careersection/2/joblist.ftl", 200),
    ("UNDP", "jobs_undp_org/0*/*/*.html", "https://jobs.undp.org/cj_view_jobs.cfm", 200),
    ("UNDP second listing", "jobs_undp_org/b*/*/*.html",
     "https://jobs.undp.org/cj_view_jobs.cfm?cur_page=2", 200),
    ("UNICEF December", "jobs_unicef_org/*/*/*.html", "https://jobs.unicef.org/en-us/listing/",
     200),
    ("UNICEF", "unicef-pagination/page1-items50.body",
     "https://jobs.unicef.org/en-us/listing/?page-items=50", 200),
]
EXTRA_PAGES = {
    "https://jobs.unicef.org/en-us/listing/?page=2&page-items=20": "unicef-pagination/page2.body",
    "https://jobs.unicef.org/en-us/listing/?page=7&page-items=20":
        "unicef-pagination/page7-direct.body",
    "https://jobs.unicef.org/en-us/listing/?page-items=100":
        "unicef-pagination/page1-items100.body",
}


def check_test_url(url: str) -> tuple[str, int, str]:
    parsed = urlparse(url or "")
    database = parsed.path.lstrip("/")
    if (parsed.scheme not in ("postgresql", "postgres") or parsed.query or parsed.fragment
            or "," in parsed.netloc or parsed.hostname not in ("localhost", "127.0.0.1")
            or not database.endswith("_test")):
        raise SystemExit("--db must be a local database whose name ends in _test, with no options")
    return parsed.hostname, parsed.port or 5432, database


def _close_the_network() -> None:
    real_connect, real_connect_ex = socket.socket.connect, socket.socket.connect_ex

    def loopback(address):
        host = address[0] if isinstance(address, tuple) else address
        if host not in ("127.0.0.1", "::1", "localhost"):
            raise RuntimeError("network access is closed in the offline comparison")

    socket.socket.connect = lambda self, a: (loopback(a), real_connect(self, a))[1]
    socket.socket.connect_ex = lambda self, a: (loopback(a), real_connect_ex(self, a))[1]


def _pages(root: Path) -> dict[str, tuple[int, bytes]]:
    served: dict[str, tuple[int, bytes]] = {}
    for _name, pattern, url, status in SOURCES:
        matches = sorted(root.glob(pattern))
        if len(matches) != 1:
            raise SystemExit(f"expected one saved page for {pattern}, found {len(matches)}")
        served[url] = (status, matches[0].read_bytes())
    for url, rel in EXTRA_PAGES.items():
        served[url] = (200, (root / rel).read_bytes())
    vacancies = root / "career-coverage" / "vacancy-provenance.json"
    for row in json.loads(vacancies.read_text(encoding="utf-8")):
        served[row["final_url"]] = (row["status"], (root / "career-coverage" /
                                                    f"{row['slug']}.body").read_bytes())
    return served


_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _failed_insert_order(row):
    """Fields both sides share; the error text is what may differ."""
    return (row.get("source_url") or "", row.get("operation") or "",
            json.dumps(row.get("payload"), sort_keys=True))


def _volatile(key, value):
    """Ids and times differ between any two runs; nothing else is left out."""
    return (key.endswith("_at") or key in ("duration_ms", "last_crawl_duration_ms")
            or (isinstance(value, str) and bool(_UUID.match(value))))


def _normal(value):
    if isinstance(value, dict):
        return {k: _normal(v) for k, v in sorted(value.items()) if not _volatile(k, v)}
    if isinstance(value, list):
        return [_normal(v) for v in value]
    return value


def run(args) -> None:
    backend = Path(args.backend).resolve()
    for name in ("SUPABASE_DB_URL", "DATABASE_URL", "PGHOST", "PGHOSTADDR", "PGSERVICE"):
        if os.getenv(name):
            raise SystemExit(f"{name} must be unset")
    _host, port, database = check_test_url(args.db)
    import dotenv

    dotenv.load_dotenv = lambda *a, **k: False
    sys.path.insert(0, str(backend))
    os.chdir(backend)
    import psycopg2
    import psycopg2.extensions

    real_connect = psycopg2.connect

    def guarded_connect(dsn=None, *a, **kwargs):
        params = psycopg2.extensions.parse_dsn(dsn) if dsn else {}
        params.update(kwargs)
        if (params.get("host") not in ("localhost", "127.0.0.1")
                or int(params.get("port") or 5432) != port or params.get("dbname") != database
                or "hostaddr" in params or "service" in params):
            raise RuntimeError("refused: only the local comparison database may be used")
        if args.scenario == "connect-error" and connect_fails[0]:
            raise psycopg2.OperationalError(
                f'invalid dsn: "{dsn}" password={FAKE_PASSWORD} key={FAKE_KEY}')
        return real_connect(dsn, *a, **kwargs)

    connect_fails = [False]
    psycopg2.connect = guarded_connect
    _close_the_network()

    messages: list[str] = []
    lines: list[str] = []

    class Capture(logging.Handler):
        def emit(self, record):
            messages.append(record.getMessage())
            lines.append(self.format(record))

    from app import log_safety

    capture = Capture(level=logging.DEBUG)
    capture.setFormatter(log_safety.RedactingFormatter(logging.Formatter("%(message)s")))
    logging.getLogger().addHandler(capture)
    logging.getLogger().setLevel(logging.DEBUG)
    log_safety.refresh_secrets({"FAKE_SERVICE_API_KEY": FAKE_KEY})

    def sql(query, params=None):
        conn = psycopg2.connect(args.db)
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return cur.fetchall() if cur.description else None
        finally:
            conn.close()

    sql("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
    sql(SCHEMA.read_text(encoding="utf-8"))
    sql("""
        CREATE TABLE extraction_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), url text,
            raw_page_id uuid, status text, reason text, extracted_fields jsonb, source_id uuid,
            created_at timestamptz);
        CREATE TABLE failed_inserts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            source_url text, error text, payload jsonb, raw_page_id uuid, source_id uuid,
            attempt_at timestamptz, operation text);
    """)
    # Each source falls due an hour apart, so the scheduler takes them in this order.
    for hours, (name, _pattern, url, _status) in enumerate(SOURCES[::-1], start=1):
        sql("""INSERT INTO sources (org_name, careers_url, source_type, status, org_type,
                   crawl_frequency_days, consecutive_failures, next_run_at)
               VALUES (%s, %s, 'html', 'active', 'ngo', 3, 0,
                       NOW() - make_interval(hours => %s))""",
            (name, url, hours))

    import contracts.outbound as outbound

    served = _pages(Path(args.pages).resolve())
    real_fetch = outbound.fetch_url

    async def fetch_url(url, *a, **kwargs):
        if url not in served:
            raise outbound.FetchError("offline: page not saved")
        status, body = served[url]
        return outbound.FetchResult(status, {"content-type": "text/html; charset=utf-8"}, body,
                                    url)

    import orchestrator as orchestrator_module
    from crawler_v2 import simple_crawler

    for module in list(sys.modules.values()):
        if getattr(module, "fetch_url", None) is real_fetch:
            module.fetch_url = fetch_url

    orch = orchestrator_module.CrawlerOrchestrator(args.db)
    orch.health_score = lambda source_id: None
    # One crawl at a time: two saved UNICEF listings share jobs, and whichever saves first
    # inserts them, so running them side by side would make the counts depend on timing.
    orch.semaphore = asyncio.Semaphore(1)
    for crawler in (orch.html_crawler, orch.rss_crawler, orch.api_crawler):
        for attr in ("html_storage", "geocoder"):
            if hasattr(crawler, attr):
                setattr(crawler, attr, None)

    def boom(*a, **k):
        raise RuntimeError(LEAK)

    async def async_boom(*a, **k):
        raise RuntimeError(LEAK)

    if args.scenario == "crawl-error":
        orch.html_crawler.extract_jobs_from_html = boom
    elif args.scenario == "source-error":
        orch.html_crawler.crawl_source = async_boom
    elif args.scenario == "run-error":
        orch.crawl_source = async_boom
    elif args.scenario == "save-error":
        simple_crawler.persist_candidate = boom

    async def scenario():
        if args.scenario == "connect-error":
            connect_fails[0] = True
            try:
                orch._get_db_conn(retries=2)
            except psycopg2.OperationalError:
                pass
            try:
                await orch.run_due_sources_once()
            except psycopg2.OperationalError:
                pass
            connect_fails[0] = False
            return
        await orch.run_due_sources_once()

    orchestrator_module.time.sleep = lambda seconds: None
    asyncio.run(scenario())
    logging.getLogger().removeHandler(capture)

    names = {str(r[0]): r[1] for r in sql("SELECT id, org_name FROM sources")}

    def rows(query):
        out = []
        for (row,) in sql(query):
            if "source_id" in row:
                row["source"] = names.get(str(row["source_id"]), row["source_id"])
            out.append(_normal(row))
        return out

    result = {
        "scenario": args.scenario,
        "sources": rows("SELECT row_to_json(s) FROM sources s ORDER BY org_name"),
        "crawl_logs": sorted(rows("SELECT row_to_json(r) FROM crawl_logs r"),
                             key=lambda r: (r.get("source", ""), r.get("status", ""))),
        "jobs": sorted(rows("SELECT row_to_json(j) FROM jobs j"),
                       key=lambda r: (r.get("apply_url") or "", r.get("title") or "")),
        "failed_inserts": sorted(rows("SELECT row_to_json(f) FROM failed_inserts f"),
                                 key=_failed_insert_order),
        "locks": sql("SELECT count(*) FROM crawl_locks")[0][0],
        "log_messages_with_a_secret": [m for m in messages if any(f in m for f in FAKES)],
        "log_lines_with_a_secret": [line for line in lines if any(f in line for f in FAKES)],
        "log_messages": len(messages),
    }
    Path(args.out).write_text(json.dumps(result, indent=1, sort_keys=True, default=str),
                              encoding="utf-8")
    print(f"{args.scenario}: {len(result['sources'])} sources, {len(result['crawl_logs'])} runs, "
          f"{len(result['jobs'])} jobs, {len(result['failed_inserts'])} failed inserts, "
          f"{result['locks']} locks; log messages with a fake secret: "
          f"{len(result['log_messages_with_a_secret'])} of {len(messages)}; final log lines "
          f"with one: {len(result['log_lines_with_a_secret'])}")


def _diff(path, a, b, out):
    if isinstance(a, dict) and isinstance(b, dict):
        for key in sorted(set(a) | set(b)):
            _diff(f"{path}.{key}", a.get(key), b.get(key), out)
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            _diff(f"{path}[{i}]", x, y, out)
    elif a != b:
        out.append(("masked" if _only_masked(a, b) else "DIFFERENT", path, a, b))


def _only_masked(a, b) -> bool:
    """b is a with each fake secret masked as redaction masks it, cut at a stored limit at most."""
    if not (isinstance(a, str) and isinstance(b, str) and any(f in a for f in FAKES)):
        return False
    expected = (a.replace(f"probe:{FAKE_PASSWORD}@", f"{VALUE_MARK}@")
                .replace(FAKE_PASSWORD, VALUE_MARK).replace(FAKE_KEY, VALUE_MARK))
    return b in {expected, expected[:200], expected[:500]}


def compare(args) -> int:
    before = json.loads(Path(args.before).read_text(encoding="utf-8"))
    after = json.loads(Path(args.after).read_text(encoding="utf-8"))
    found: list = []
    for side in (before, after):
        side["failed_inserts"].sort(key=_failed_insert_order)
    for key in ("sources", "crawl_logs", "jobs", "failed_inserts", "locks"):
        _diff(key, before[key], after[key], found)
    for kind, path, a, b in found:
        print(f"{kind}: {path}\n  before: {str(a)[:300]}\n  after:  {str(b)[:300]}")
    unexpected = [f for f in found if f[0] == "DIFFERENT"]
    print(f"{before['scenario']}: {len(before['jobs'])} jobs and {len(before['crawl_logs'])} runs"
          f" before, {len(after['jobs'])} and {len(after['crawl_logs'])} after; "
          f"{len(found) - len(unexpected)} masked, {len(unexpected)} other differences; "
          f"log messages with a fake secret {len(before['log_messages_with_a_secret'])} -> "
          f"{len(after['log_messages_with_a_secret'])}; final log lines with one "
          f"{len(before['log_lines_with_a_secret'])} -> {len(after['log_lines_with_a_secret'])}")
    return 1 if unexpected else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    r = sub.add_parser("run")
    r.add_argument("--backend", required=True)
    r.add_argument("--pages", required=True)
    r.add_argument("--db", required=True)
    r.add_argument("--scenario", choices=SCENARIOS, default="normal")
    r.add_argument("--out", required=True)
    c = sub.add_parser("compare")
    c.add_argument("before")
    c.add_argument("after")
    args = parser.parse_args()
    if args.command == "run":
        run(args)
        return 0
    return compare(args)


if __name__ == "__main__":
    sys.exit(main())
