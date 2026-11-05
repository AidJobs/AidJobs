"""Employer survey, step F: confirm careers pages and recruitment systems (W-31).

Run on the user's machine; CI runs only `build`:

  python tools/survey/confirm.py fetch [--batch 1] [--limit N]   # the employers' sites
  python tools/survey/confirm.py extract   # raw responses -> the small committed observations
  python tools/survey/confirm.py build     # committed files -> confirmed list and systems

`fetch` contacts each organisation of a step F batch (source-survey/first-wave.csv) at most twice:
the robots.txt of the host it will read, then the careers page, or, for a recruitment system
with a documented public job feed, that feed instead. Every request goes through the backend's
shared fetch policy (contracts/outbound.py: private addresses refused, redirect, size and time
limits), with an honest identity, one at a time, about 5 seconds apart and never the same host
within 10 seconds. A robots.txt that forbids the page stops that organisation; a 403, a 429 or a
bot challenge is recorded and stops that organisation, never bypassed; three refusals in a row
stop the run. Responses are kept under tools/survey/raw/confirm/ (git-ignored); `fetch` is
resumable.

`extract` and `build` use no network. `extract` keeps, per organisation, only what the survey
records: hosts and paths (no query strings), statuses, the recruitment system and its evidence,
how the listing can be read, the number of jobs seen and any bot protection; no page content,
emails or names. The method is in docs/architecture/source-survey.md, step F.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree

from careers import read_csv, strip_query, system_of

HERE = Path(__file__).resolve().parent
SURVEY = HERE.parents[1] / "docs" / "architecture" / "source-survey"
BACKEND = HERE.parents[1] / "apps" / "backend"
RAW = HERE / "raw" / "confirm"
USER_AGENT = "AidJobsSurvey/0.1 (+mailto:aidjobz@gmail.com)"
HEADERS = {"User-Agent": USER_AGENT,
           "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
           "Accept-Language": "en"}

INTERVAL = 5.0          # seconds between any two requests
HOST_INTERVAL = 10.0    # seconds between two requests to one host
STOP_REFUSALS = 3       # refusals (403, 429, bot challenge) in a row that stop the run
STOP_FAILURES = 5       # network failures in a row that stop the run
STEP_TIMEOUT, TOTAL_TIMEOUT = 20.0, 45.0

OBSERVATION_FIELDS = ["org_id", "target_url", "found_by", "request", "robots", "status",
                      "final_url", "redirects", "system", "system_evidence", "listing",
                      "jobs_seen", "bot_protection", "error"]
CONFIRMED_FIELDS = ["rank", "org_id", "name", "group", "outcome", "careers_page", "found_by",
                    "system", "system_evidence", "listing", "jobs_seen", "unjobs_jobs",
                    "bot_protection", "shares_site_with", "note"]
SYSTEM_FIELDS = ["system", "organisations", "confirmed", "jobs_seen", "unjobs_jobs",
                 "listing_kinds", "examples"]
DECISION_FIELDS = ["action", "org_id", "value", "confidence", "reason"]
CORRECTABLE = {"system", "listing", "outcome", "note"}


# --- what to read ----------------------------------------------------------------------------

# Query parameters that a listing needs to load (Taleo's organisation and site, SuccessFactors'
# company, Cornerstone's client, HRMDirect's search); every other parameter is dropped before a
# page is read.
LISTING_PARAMS = {"org", "cws", "company", "c", "search"}


def listing_url(url: str) -> str:
    """The careers page to read: scheme, host, path and only the parameters it needs."""
    base = strip_query(url)
    query = urlsplit(url).query if base else ""
    kept = [p for p in query.split("&") if p.split("=", 1)[0].lower() in LISTING_PARAMS]
    return base + ("?" + "&".join(kept) if kept else "")


def feed_for(url: str) -> tuple[str, str]:
    """(system, feed URL) when the page is on a recruitment system with a documented public job
    feed; ('', '') otherwise. The account is read from the page's address."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    segs = [s for s in parts.path.split("/") if s]
    first = segs[0] if segs else ""
    label = host.split(".")[0]
    if re.fullmatch(r"(?:job-)?boards(?:\.eu)?\.greenhouse\.io", host) and first:
        api = "boards-api.eu.greenhouse.io" if ".eu." in host else "boards-api.greenhouse.io"
        return "Greenhouse", f"https://{api}/v1/boards/{first}/jobs"
    if host in ("jobs.lever.co", "jobs.eu.lever.co") and first:
        api = "api.eu.lever.co" if ".eu." in host else "api.lever.co"
        return "Lever", f"https://{api}/v0/postings/{first}?mode=json"
    if host == "jobs.ashbyhq.com" and first:
        return "Ashby", f"https://api.ashbyhq.com/posting-api/job-board/{first}"
    if host in ("jobs.smartrecruiters.com", "careers.smartrecruiters.com") and first:
        return "SmartRecruiters", f"https://api.smartrecruiters.com/v1/companies/{first}/postings"
    if host == "apply.workable.com" and first and first not in ("j", "api"):
        return "Workable", f"https://apply.workable.com/api/v1/widget/accounts/{first}"
    if host.endswith(".recruitee.com") and label not in ("www", "app", "api"):
        return "Recruitee", f"https://{label}.recruitee.com/api/offers/"
    match = re.fullmatch(r"([a-z0-9-]+)\.jobs\.personio\.(de|com)", host)
    if match:
        return "Personio", f"https://{match.group(1)}.jobs.personio.{match.group(2)}/xml"
    if host.endswith(".teamtailor.com") and label not in ("www", "app", "api", "career"):
        return "Teamtailor", f"https://{label}.teamtailor.com/jobs.rss"
    return "", ""


def targets(survey: Path = SURVEY, batch: int = 1) -> list[dict]:
    """The organisations of a batch, each with the page to read and how it was found: a
    recorded careers-page decision (the agent's web search) wins over step E's guess."""
    decided = {r["org_id"]: r for r in read_csv(survey / "step-f-decisions.csv")
               if r["action"] == "careers-page"}
    out = []
    for w in read_csv(survey / "first-wave.csv"):
        if str(w["step_f_batch"]) != str(batch):
            continue
        d = decided.get(w["org_id"])
        if d and d["value"].upper() != "NONE":
            url, found_by = listing_url(d["value"]), f"web search ({d['confidence'] or 'medium'})"
        elif d:
            url, found_by = "", "web search: none found"
        elif w["step_e_guess"]:
            url, found_by = w["step_e_guess"], f"step E guess ({w['step_e_confidence']})"
        else:
            url, found_by = "", "none"
        system, feed = feed_for(url) if url else ("", "")
        out.append({"org_id": w["org_id"], "name": w["name"], "target_url": strip_query(url),
                    "found_by": found_by, "request_url": feed or url,
                    "request": f"feed ({system})" if feed else ("page" if url else "")})
    return out


# --- fetch (network) -------------------------------------------------------------------------

def safe_name(org_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", org_id)


def robots_verdict(status: int | None, body: str, url: str) -> str:
    """'allowed', 'forbidden', 'refused' (401, 403, 429) or 'unreachable' (5xx, no answer).
    RFC 9309: a robots.txt that is not there (other 4xx) allows everything; one that cannot be
    reached is treated as forbidding everything."""
    if status is None or status >= 500:
        return "unreachable"
    if status in (401, 403, 429):
        return "refused"
    if status >= 400:
        return "allowed"
    if status != 200:
        return "unreachable"
    parser = RobotFileParser()
    parser.parse(body.splitlines())
    return "allowed" if parser.can_fetch(USER_AGENT, url) else "forbidden"


# Pages that are a challenge, not the page asked for. Normal pages can carry a form's captcha or
# a protection service's script, so those count only on a refusal (401, 403, 429, 503).
CHALLENGES = [
    ("Cloudflare challenge", re.compile(r"<title>\s*(?:just a moment|attention required)"
                                        r"|cf_chl_opt|window\._cf_chl", re.IGNORECASE)),
    ("Akamai", re.compile(r"<title>\s*access denied</title>.{0,600}reference #", re.IGNORECASE | re.DOTALL)),
    ("Imperva", re.compile(r"_incapsula_resource", re.IGNORECASE)),
    ("DataDome", re.compile(r"captcha-delivery\.com", re.IGNORECASE)),
    ("PerimeterX", re.compile(r"px-captcha", re.IGNORECASE)),
    ("AWS WAF", re.compile(r"awswaf\.com|aws-waf-token", re.IGNORECASE)),
]
REFUSAL_HINTS = [("captcha", re.compile(r"captcha", re.IGNORECASE)),
                 ("Cloudflare", re.compile(r"cloudflare", re.IGNORECASE))]


def bot_protection(status: int | None, headers: dict, body: str) -> str:
    """A bot challenge or block, read from the status, headers and the start of the body."""
    if headers.get("cf-mitigated", "").lower() == "challenge":
        return "Cloudflare challenge"
    head = body[:30000]
    for name, pattern in CHALLENGES:
        if pattern.search(head):
            return name
    if status in (401, 403, 429):
        hint = next((n for n, p in REFUSAL_HINTS if p.search(head)), "")
        server = headers.get("server", "").lower()
        return (f"refused ({hint})" if hint else
                f"refused by {server}" if server else f"refused (HTTP {status})")
    return ""


class Fetcher:
    """One request at a time through the backend's fetch policy, spaced, logged."""

    def __init__(self, log: Path):
        sys.path.insert(0, str(BACKEND))
        from contracts.outbound import FetchError, fetch_message, fetch_url

        self.fetch_url, self.FetchError, self.fetch_message = fetch_url, FetchError, fetch_message
        self.log, self.last, self.hosts = log, 0.0, {}
        log.parent.mkdir(parents=True, exist_ok=True)

    def get(self, url: str, what: str) -> dict:
        import asyncio

        host = (urlsplit(url).hostname or "").lower()
        wait = max(INTERVAL - (time.monotonic() - self.last),
                   HOST_INTERVAL - (time.monotonic() - self.hosts.get(host, -1e9)))
        if wait > 0:
            time.sleep(wait)
        started = self.last = self.hosts[host] = time.monotonic()
        result = {"url": url, "status": None, "final_url": "", "redirects": 0, "headers": {},
                  "bytes": 0, "error": "", "body": b""}
        try:
            response = asyncio.run(self.fetch_url(url, headers=HEADERS, timeout=STEP_TIMEOUT,
                                                  total_timeout=TOTAL_TIMEOUT))
            kept = ("content-type", "server", "cf-mitigated", "cf-ray", "retry-after")
            result.update(status=response.status_code, final_url=response.url,
                          redirects=response.redirects, bytes=len(response.body),
                          body=response.body,
                          headers={k: v for k, v in response.headers.items() if k in kept})
        except self.FetchError as error:
            result["error"] = self.fetch_message(error) or "fetch failed"
        except Exception as error:  # noqa: BLE001  recorded; the run goes on
            result["error"] = type(error).__name__
        with self.log.open("a", encoding="utf-8") as handle:
            handle.write(f"{datetime.now(UTC).isoformat(timespec='seconds')}\t"
                         f"{result['status'] or result['error']}\t{result['bytes']}\t"
                         f"{time.monotonic() - started:.1f}s\t{what}\t{strip_query(url)}\n")
        return result


def fetch(args) -> int:
    fetcher = Fetcher(RAW / "requests.log")
    robots_cache: dict[str, tuple[int | None, str, str]] = {}
    refusals = failures = done = 0
    for t in targets(batch=args.batch):
        target = RAW / "orgs" / f"{safe_name(t['org_id'])}.json"
        if target.exists() or not t["request_url"]:
            continue
        if args.limit is not None and done >= args.limit:
            break
        record = {**t, "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
                  "robots": {}, "response": {}}
        parts = urlsplit(t["request_url"])
        host = (parts.hostname or "").lower()
        if host not in robots_cache:
            r = fetcher.get(f"{parts.scheme}://{parts.netloc}/robots.txt", "robots.txt")
            text = r["body"].decode("utf-8", "replace") if r["status"] == 200 else ""
            robots_cache[host] = (r["status"], text, r["error"])
        status, text, error = robots_cache[host]
        verdict = robots_verdict(status, text, t["request_url"])
        record["robots"] = {"host": host, "status": status, "error": error, "verdict": verdict}
        if verdict == "allowed":
            r = fetcher.get(t["request_url"], t["org_id"])
            body = r.pop("body")
            text = body.decode("utf-8", "replace")
            r["bot_protection"] = bot_protection(r["status"], r["headers"], text)
            record["response"] = r
            (RAW / "bodies").mkdir(parents=True, exist_ok=True)
            (RAW / "bodies" / f"{safe_name(t['org_id'])}.bin").write_bytes(body)
            refused = r["status"] in (403, 429) or bool(r["bot_protection"])
            refusals = refusals + 1 if refused else 0
            failures = failures + 1 if r["error"] else 0
        else:
            refusals = refusals + 1 if verdict == "refused" else 0
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(record, indent=1), encoding="utf-8")
        done += 1
        print(f"{t['org_id']}: robots {verdict}; {record['response'].get('status') or ''}"
              f"{record['response'].get('error') or ''}", flush=True)
        if refusals >= STOP_REFUSALS:
            print(f"stopped: {refusals} refusals in a row")
            return 1
        if failures >= STOP_FAILURES:
            print(f"stopped: {failures} network failures in a row")
            return 1
    print(f"{done} organisations read")
    return 0


# --- extract (no network) --------------------------------------------------------------------

HREF = re.compile(r"""(?:href|src|action|data-url)\s*=\s*["']([^"'<>\s]+)["']""", re.IGNORECASE)
JOB_LINK = re.compile(
    r"/jobs?/[^/?#]*\d|/jobs?/[a-z0-9-]{12,}|/job-?details?/|/vacanc(?:y|ies)/[^/?#]+"
    r"|/careers?/[^/?#]+/[^/?#]*\d|/positions?/[^/?#]+|/openings?/[^/?#]+|/posting/"
    r"|[?&](?:job_?id|jobid|reqid|requisitionid|vacancyid)=|/requisitions?/|/offres?/[^/?#]+"
    r"|/stellen(?:angebote)?/[^/?#]+|/vacatures?/[^/?#]+|/ofertas?/[^/?#]+"
    r"|/j/[A-Z0-9]{6,}|lever\.co/[^/]+/[0-9a-f-]{20,}|/careers/\d+", re.IGNORECASE)
JS_SHELL = re.compile(r"""<div[^>]+id=["'](?:root|app|__next|__nuxt)["']|enable javascript"""
                      r"""|javascript is (?:required|disabled)|noscript""", re.IGNORECASE)


def count_feed(system: str, body: bytes) -> int | None:
    """Jobs in a public feed's answer, or None when it cannot be read."""
    try:
        if system in ("Personio", "Teamtailor"):
            root = ElementTree.fromstring(body)
            tag = "position" if system == "Personio" else "item"
            return sum(1 for e in root.iter() if e.tag.split("}")[-1] == tag)
        data = json.loads(body)
    except (ValueError, ElementTree.ParseError):
        return None
    if system == "Greenhouse":
        return len(data.get("jobs", []))
    if system == "Lever":
        return len(data) if isinstance(data, list) else None
    if system == "Ashby":
        return len(data.get("jobs", []))
    if system == "SmartRecruiters":
        return data.get("totalFound", len(data.get("content", [])))
    if system == "Workable":
        return len(data.get("jobs", []))
    if system == "Recruitee":
        return len(data.get("offers", []))
    return None


def links_of(text: str, base: str) -> list[str]:
    """Every link, script and frame address on a page, made absolute."""
    out = []
    for m in HREF.finditer(text):
        link = m.group(1).replace("&amp;", "&")
        if link.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
            continue
        try:
            out.append(urljoin(base, link))
        except ValueError:
            continue
    return out


def page_facts(final_url: str, text: str) -> dict:
    """The recruitment system, how the listing can be read and the job links seen on a page
    (distinct addresses that look like job postings; an estimate)."""
    links = links_of(text, final_url)
    system, evidence = system_of(final_url), ""
    if system:
        evidence = f"the page is on {urlsplit(final_url).hostname}"
    else:
        seen = Counter()
        for link in links:
            found = system_of(link)
            if found:
                seen[(found, (urlsplit(link).hostname or "").lower())] += 1
        if seen:
            (system, host), count = seen.most_common(1)[0]
            evidence = f"links to {host} ({count})"
    jobs = set()
    for link in links:
        path = urlsplit(link).path.lower()
        if JOB_LINK.search(link) and not path.endswith((".pdf", ".js", ".css", ".png", ".jpg")):
            keeps_query = re.search(r"[?&](?:job_?id|jobid|reqid|requisitionid|vacancyid)=",
                                    link, re.IGNORECASE)
            jobs.add(link.split("#")[0] if keeps_query else strip_query(link))
    if jobs:
        listing = "plain page with job links"
    elif JS_SHELL.search(text) or len(re.sub(r"<[^>]+>|\s+", "", text)) < 2000 \
            or system in ("Workday", "Oracle Recruiting Cloud", "SuccessFactors"):
        listing = "needs JavaScript"
    else:
        listing = "no job links seen"
    return {"system": system or "own site (system not seen)", "system_evidence": evidence,
            "listing": listing, "jobs_seen": len(jobs)}


def observation(record: dict, body: bytes) -> dict:
    robots, response = record["robots"], record.get("response") or {}
    row = {"org_id": record["org_id"], "target_url": strip_query(record["target_url"]),
           "found_by": record["found_by"], "request": record["request"],
           "robots": robots.get("verdict", ""), "status": response.get("status") or "",
           "final_url": strip_query(response.get("final_url", "")),
           "redirects": response.get("redirects", ""), "system": "", "system_evidence": "",
           "listing": "", "jobs_seen": "", "bot_protection": response.get("bot_protection", ""),
           "error": response.get("error") or robots.get("error") or ""}
    if robots.get("verdict") != "allowed" or response.get("status") != 200 \
            or row["bot_protection"]:
        return row
    if record["request"].startswith("feed"):
        system = record["request"][len("feed ("):-1]
        jobs = count_feed(system, body)
        row.update(system=system, system_evidence="its documented public job feed answered",
                   listing="public job feed" if jobs is not None else "feed not readable",
                   jobs_seen="" if jobs is None else jobs)
    else:
        row.update(page_facts(response.get("final_url", ""),
                              body.decode("utf-8", "replace")))
    return row


def extract(_args=None) -> int:
    rows = []
    for t in targets():
        path = RAW / "orgs" / f"{safe_name(t['org_id'])}.json"
        if not t["request_url"]:
            rows.append({"org_id": t["org_id"], "target_url": "", "found_by": t["found_by"]})
            continue
        if not path.exists():
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        body_path = RAW / "bodies" / f"{safe_name(t['org_id'])}.bin"
        rows.append(observation(record, body_path.read_bytes() if body_path.exists() else b""))
    write(SURVEY / "step-f-observations.csv", OBSERVATION_FIELDS, rows)
    print(f"observations: {len(rows)}")
    return 0


# --- build (no network) ----------------------------------------------------------------------

def write(path: Path, fields, rows) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n",
                                extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def outcome(o: dict) -> str:
    if not o.get("target_url"):
        return "no careers page found"
    if o.get("robots") in ("forbidden",):
        return "robots.txt forbids"
    if o.get("robots") in ("refused", "unreachable"):
        return f"robots.txt {o['robots']}"
    if o.get("bot_protection"):
        return "blocked"
    status = str(o.get("status") or "")
    if o.get("error") or not status:
        return "error"
    if status in ("404", "410"):
        return "not found"
    if status != "200":
        return f"HTTP {status}"
    if o["listing"] in ("public job feed", "plain page with job links"):
        return "confirmed"
    return {"needs JavaScript": "answers; needs JavaScript",
            "no job links seen": "answers; no job links seen"}.get(o["listing"], "answers")


def careers_key(url: str) -> str:
    parts = urlsplit(url)
    return f"{(parts.hostname or '').lower().removeprefix('www.')}{parts.path.rstrip('/')}"


def build(_args=None, survey: Path = SURVEY) -> int:
    wave = {w["org_id"]: w for w in read_csv(survey / "first-wave.csv")}
    observed = {o["org_id"]: o for o in read_csv(survey / "step-f-observations.csv")}
    decisions = read_csv(survey / "step-f-decisions.csv")
    problems = [f"unknown decision {d['action']!r}" for d in decisions
                if d["action"] not in ("careers-page", "correct")]
    problems += [f"a decision names an organisation outside the first wave: {d['org_id']}"
                 for d in decisions if d["org_id"] not in wave]
    corrections = defaultdict(list)
    for d in decisions:
        if d["action"] == "correct":
            field, _, value = d["value"].partition("=")
            if field not in CORRECTABLE:
                problems.append(f"a correction names an unknown field: {d['value']}")
            corrections[d["org_id"]].append((field, value, d["reason"]))
    rows, by_site = [], defaultdict(list)
    for oid, o in observed.items():
        w = wave.get(oid)
        if w is None:
            problems.append(f"an observation names an organisation outside the wave: {oid}")
            continue
        feed = o.get("request", "").startswith("feed")
        page = o.get("target_url", "") if feed else (o.get("final_url") or o.get("target_url", ""))
        row = {"rank": w["rank"], "org_id": oid, "name": w["name"], "group": w["group"],
               "outcome": outcome(o), "careers_page": page, "found_by": o.get("found_by", ""),
               "system": o.get("system", ""), "system_evidence": o.get("system_evidence", ""),
               "listing": o.get("listing", ""), "jobs_seen": o.get("jobs_seen", ""),
               "unjobs_jobs": w["unjobs_jobs"], "bot_protection": o.get("bot_protection", ""),
               "note": ""}
        if not row["system"] and feed:
            row["system"] = o["request"][len("feed ("):-1]
        if not row["system"] and page:
            row["system"] = system_of(page) or ""
        for field, value, reason in corrections.get(oid, []):
            row[field] = value
            row["note"] = "; ".join(x for x in (row["note"], f"corrected: {reason}") if x)
        rows.append(row)
        if page and row["outcome"] not in ("no careers page found",):
            by_site[careers_key(page)].append(oid)
    for row in rows:
        others = [x for x in by_site.get(careers_key(row["careers_page"]), [])
                  if x != row["org_id"]] if row["careers_page"] else []
        row["shares_site_with"] = " ".join(others)
    if problems:
        print("\n".join(problems[:20]))
        return 1
    rows.sort(key=lambda r: list(wave).index(r["org_id"]))
    write(survey / "step-f-confirmed.csv", CONFIRMED_FIELDS, rows)
    write(survey / "step-f-systems.csv", SYSTEM_FIELDS, systems(rows))
    counts = Counter(r["outcome"] for r in rows)
    print(f"confirmed list: {len(rows)} organisations; " +
          ", ".join(f"{k} {v}" for k, v in counts.most_common()))
    return 0


def systems(rows) -> list[dict]:
    """Recruitment systems ranked by organisations, then by jobs seen."""
    groups = defaultdict(list)
    for r in rows:
        if r["system"] and r["outcome"] not in ("no careers page found",):
            groups[r["system"]].append(r)
    out = []
    for system, members in groups.items():
        out.append({
            "system": system, "organisations": len(members),
            "confirmed": sum(1 for m in members if m["outcome"] == "confirmed"),
            "jobs_seen": sum(int(m["jobs_seen"] or 0) for m in members),
            "unjobs_jobs": sum(int(m["unjobs_jobs"] or 0) for m in members),
            "listing_kinds": "; ".join(f"{k} {v}" for k, v in Counter(
                m["listing"] or m["outcome"] for m in members).most_common()),
            "examples": "; ".join(m["name"] for m in members[:3])})
    out.sort(key=lambda s: (-s["organisations"], -s["jobs_seen"], s["system"]))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    get = commands.add_parser("fetch")
    get.add_argument("--batch", type=int, default=1)
    get.add_argument("--limit", type=int, default=None,
                     help="read at most N organisations in this run")
    get.set_defaults(func=fetch)
    commands.add_parser("extract").set_defaults(func=extract)
    commands.add_parser("build").set_defaults(func=build)
    args = parser.parse_args()
    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
