"""Role-content survey (W-54), the broad layer: reading adverts and measuring them by fixed rules.

Run on the user's machine; CI runs only `check` and the tests:

  python tools/survey/adverts.py plan --batch r1|r2          # which archived pages a batch reads (no request)
  python tools/survey/adverts.py fetch-archive --batch r1|r2 # archived pages, from data.commoncrawl.org
  python tools/survey/adverts.py fetch-live --batch r3|r4|r5 # boards, job feeds, UN pages, live
  python tools/survey/adverts.py extract                     # saved pages -> local plain-text adverts
  python tools/survey/adverts.py measure                     # local adverts -> broad-adverts.csv, broad-sections.csv
  python tools/survey/adverts.py copycheck FILE...           # the 8-word copy check against saved adverts
  python tools/survey/adverts.py check                       # the committed files' form (CI)

Reading (role-survey.md, sections 3, 17 and 19.6). Archived pages come from Common Crawl's data server
under decision 14's recorded exception, with step E's polite requester (careers.Requester:
AidJobsSurvey/0.1, 10 seconds apart, a stop at once on a 403 and for the day after two refusals in
a row), one byte-range request per page, and only pages whose employer's own robots.txt, read in
batch R0, allows AidJobsSurvey; Workday, Taleo and Workable pages, which hold no advert text, are
not read. Live pages (boards, documented job feeds, UN pages) go through the backend's shared fetch
policy with the survey's identity (confirm.Fetcher: robots.txt checked by the policy for every hop,
5 seconds apart, never the same host within 10 seconds); a refusal is recorded and never bypassed,
and step F's stop rules apply. Every batch stops at its approved size.

Everything read stays outside the repository, in survey-raw-archive/role-survey-reading/. `extract`
keeps a local plain-text copy of each advert with emails and phone numbers removed. `measure`
writes the committed files, which hold counts, categories and measures only: no advert text, no
job title, no address, no name (role-survey.md, section 19.5).
"""
from __future__ import annotations

import argparse
import contextlib
import csv
import gzip
import hashlib
import json
import random
import re
import statistics
import sys
import zlib
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import roles
from careers import read_csv, site_host, system_of

HERE = roles.HERE
ROLES_DIR = roles.ROLES
ARCHIVE = roles.ARCHIVE
READING = ARCHIVE / "role-survey-reading"
WORK = READING / "work"
R0 = ARCHIVE / "role-survey-r0-2026-11-11"
EARLIER_PAGES = [ARCHIVE / "role-survey-test-2026-11-10", ARCHIVE / "role-survey-m1-2026-11-11" / "pages"]
DATA_HOST = "https://data.commoncrawl.org/"

SEED = 20261111
ORG_CAP, FRENCH_CAP = 30, 60     # decision 21: per parent organisation; French adverts up to 60
WAVE_LANGUAGES = ("eng", "fra")  # wave 1 reads English and French (section 11)
SHELL_HOSTS = re.compile(r"(?:^|\.)(?:myworkdayjobs\.com|myworkdaysite\.com|taleo\.net|workable\.com)$")
BATCH_CAPS = {"r1": 60, "r2": 2300, "r3": 235, "r4": 10, "r5": 26}
MIN_ADVERT_WORDS = 150          # below this a page is not counted as an advert

ADVERT_FIELDS = [
    "advert_id", "org_id", "org_type", "org_type_basis", "source", "batch", "system", "family_id",
    "function", "sector", "level", "grade", "staff_consultant", "national_international",
    "humanitarian_development", "field_hq", "language", "extraction", "period", "words_total",
    "words_role", "sections", "standard_share", "standard_basis", "facts_given", "facts_missing",
    "years_min", "years_alt", "degree", "standards", "restrictions", "inclusion",
    "median_sentence", "score_decision_facts", "score_readability", "score_length",
    "score_findability", "partial_score", "held_out"]
SECTION_FIELDS = ["advert_id", "position", "section_type", "words"]


# --- which archived pages (no request) ------------------------------------------------------

job_key = roles.job_key


def page_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


class RobotsVerdicts:
    """Batch R0's robots.txt answers, judged for AidJobsSurvey with RFC 9309 (no request)."""

    def __init__(self, folder: Path = R0 / "robots"):
        self.by_host, self.cache = {}, {}
        for p in folder.glob("*.json"):
            rec = json.loads(p.read_text(encoding="utf-8"))
            self.by_host[rec["host"]] = rec

    def verdict(self, url: str) -> str:
        import confirm
        host = (urlsplit(url).hostname or "").lower()
        rec = self.by_host.get(host)
        if not rec:
            return "not read"
        if url not in self.cache:
            self.cache[url] = confirm.robots_verdict(rec["status"], rec["text"], url)
        return self.cache[url]


def candidates(archive: Path = ARCHIVE, orgs: roles.Organisations | None = None) -> list[dict]:
    """Every distinct archived job page in the saved index rows, its latest capture, with its
    organisation; shells and pages in other languages than wave 1's left out."""
    orgs = orgs or roles.Organisations.load(decisions=_decisions(), pools=roles.pools_of(archive))
    best = {}
    for m in roles.index_rows(roles.index_files(archive)):
        if m.get("status") != "200" or "html" not in (m.get("mime") or ""):
            continue
        url = m.get("url", "")
        host = (urlsplit(url).hostname or "").lower()
        if not host or SHELL_HOSTS.search(host):
            continue
        key = roles.archive_job_key(url)
        if not key:
            continue
        stamp = m.get("filename", "")   # crawl and segment names sort by date
        if key not in best or stamp > best[key]["stamp"]:
            best[key] = {"key": key, "url": url, "host": host, "filename": m["filename"],
                         "offset": int(m["offset"]), "length": int(m["length"]),
                         "languages": m.get("languages", ""), "stamp": stamp,
                         "crawl": m["filename"].split("/")[1] if "/" in m["filename"] else ""}
    out = []
    screened = set(RobotsVerdicts().by_host)
    for c in best.values():
        oid = orgs.of_url(c["url"])
        # Only the survey's organisations: step E's saved rows hold every account on each recruitment
        # system, most of them other employers; a site outside the list counts when R0 read its host.
        if not oid or oid.startswith("account:") or (oid not in orgs.rows and c["host"] not in screened):
            continue
        c["org_id"] = oid
        c["system"] = system_of(c["url"]) or "own site"
        c["page_id"] = page_id(c["url"])
        out.append(c)
    return sorted(out, key=lambda c: c["page_id"])


def in_wave_language(languages: str) -> bool:
    first = (languages or "").split(",")[0]
    return not first or first in WAVE_LANGUAGES


def is_french(languages: str) -> bool:
    return (languages or "").split(",")[0] == "fra"


def capped(pages: list[dict], seed: int = SEED, cap: int = ORG_CAP, french_cap: int = FRENCH_CAP,
           first: set[str] | frozenset = frozenset()) -> list[dict]:
    """At most `cap` pages per organisation, French pages allowed up to `french_cap` in all, drawn in
    a fixed random order; pages in `first` (already read) take their places before the rest."""
    rng = random.Random(seed)
    order = sorted(pages, key=lambda c: c["page_id"])
    rng.shuffle(order)
    order.sort(key=lambda c: c["page_id"] not in first)
    taken, n_all, n_other = [], Counter(), Counter()
    for c in order:
        o = c["org_id"]
        if is_french(c.get("languages", "")):
            if n_all[o] >= french_cap:
                continue
        elif n_other[o] >= cap or n_all[o] >= french_cap:
            continue
        else:
            n_other[o] += 1
        n_all[o] += 1
        taken.append(c)
    return taken


GAP_SITES = {"ilo.org", "rodekruis.nl", "enabel.be", "redcross.org.uk", "luxdev.lu", "um.dk",
             "communitybuilders.ca", "tanagerintl.org", "farmafrica.org", "scienceforafrica.foundation",
             "devp.org", "naturaljustice.org", "awf.org", "femnet.org", "sanaacenter.org", "reach-iraq.org",
             "ciprb.org", "kemitraan.or.id", "fowode.org", "fiftyfiftylb.com", "savsign.org"}
LARGE_OWN_SITES = {"unfpa.org", "osce.org", "wipo.int", "spc.int", "medecinsdumonde.org"}


def _site_of(host: str) -> str:
    h = site_host(host)
    for s in GAP_SITES | LARGE_OWN_SITES:
        if h == s or h.endswith("." + s):
            return s
    return ""


def plan_batch(batch: str, pages: list[dict], verdicts: RobotsVerdicts, done: set[str],
               held: set[str] | frozenset = frozenset()) -> list[dict]:
    """R1: about 40 archived pages of the gap-filling sites and about 20 of the largest own sites,
    at random; R2: the broad sample, capped per organisation. Only pages R0 allows; pages already
    saved (earlier batches) are not planned again; organisations in `held` are left out."""
    allowed = [c for c in pages if in_wave_language(c["languages"]) and c["org_id"] not in held
               and verdicts.verdict(c["url"]) == "allowed"]
    rng = random.Random(SEED + (1 if batch == "r1" else 2))
    if batch == "r1":
        gap = defaultdict(list)
        own = defaultdict(list)
        for c in allowed:
            s = _site_of(c["host"])
            if s in GAP_SITES:
                gap[s].append(c)
            elif s in LARGE_OWN_SITES and c["system"] == "own site":
                own[s].append(c)
        chosen = []
        for groups, total in ((gap, 40), (own, 20)):
            sites = sorted(groups)
            per = max(1, total // max(len(sites), 1))
            pool = []
            for s in sites:
                items = sorted(groups[s], key=lambda c: c["page_id"])
                rng.shuffle(items)
                chosen += items[:per]
                pool += items[per:]
            rng.shuffle(pool)
            short = total - sum(1 for c in chosen if (_site_of(c["host"]) in groups))
            chosen += pool[:max(short, 0)]
        return [c for c in chosen if c["page_id"] not in done]
    return [c for c in capped(allowed, first=done) if c["page_id"] not in done]


def saved_pages() -> dict[str, Path]:
    """page id -> saved archived record, across the batches and the earlier test pages."""
    out = {}
    for b in ("r1", "r2"):
        for p in (READING / b / "pages").glob("*.warc.gz"):
            out[p.name.split(".")[0]] = p
    for folder in EARLIER_PAGES:
        for p in folder.glob("*.warc.gz"):
            uri = warc_uri(p.read_bytes())
            if uri:
                out.setdefault(page_id(uri), p)
    return out


def write_local(path: Path, fields: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        w = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


PLAN_FIELDS = ["page_id", "org_id", "system", "host", "crawl", "languages", "filename", "offset", "length", "url"]


def held_organisations(pages: list[dict], orgs: roles.Organisations) -> set[str]:
    """The UN system's organisations, held until the user decides on the UN's terms of use (19.11)."""
    return {c["org_id"] for c in pages if roles.un_system(orgs.type_of(c["org_id"]), c["host"])}


def plan(args) -> int:
    orgs = roles.Organisations.load(decisions=_decisions(), pools=roles.pools_of())
    pages = candidates(orgs=orgs)
    verdicts = RobotsVerdicts()
    done = set(saved_pages())
    held = held_organisations(pages, orgs)
    chosen = plan_batch(args.batch, pages, verdicts, done, held)
    (READING / args.batch).mkdir(parents=True, exist_ok=True)
    (READING / args.batch / "held-hosts.txt").write_text(
        "\n".join(sorted({c["host"] for c in pages if c["org_id"] in held})) + "\n", encoding="utf-8")
    (READING / args.batch / "held-orgs.txt").write_text("\n".join(sorted(held)) + "\n", encoding="utf-8")
    print(f"held for the UN terms decision: {len(held)} organisations, "
          f"{sum(1 for c in pages if c['org_id'] in held)} pages")
    write_local(READING / args.batch / "plan.csv", PLAN_FIELDS, chosen)
    v = Counter(verdicts.verdict(c["url"]) for c in pages)
    print(f"distinct archived job pages: {len(pages)} at {len({c['org_id'] for c in pages})} organisations; "
          f"by R0 verdict {dict(v)}; in wave-1 languages and allowed: "
          f"{sum(1 for c in pages if in_wave_language(c['languages']) and verdicts.verdict(c['url']) == 'allowed')}")
    print(f"{args.batch}: {len(chosen)} pages planned at {len({c['org_id'] for c in chosen})} organisations "
          f"(cap {BATCH_CAPS[args.batch]}); by system {dict(Counter(c['system'] for c in chosen).most_common(8))}; "
          f"French {sum(1 for c in chosen if is_french(c['languages']))}")
    if len(chosen) > BATCH_CAPS[args.batch]:
        print(f"note: more than the batch's size; fetch-archive stops at {BATCH_CAPS[args.batch]}")
    return 0


# --- reading (network) --------------------------------------------------------------------------

class Stopped(SystemExit):
    """A batch stopped by its rules; the reason is kept on disk, so a later run does not resume."""


def requests_sent(folder: Path) -> int:
    """Requests an archive batch has made across all its runs: one line each in its requests.log."""
    p = folder / "requests.log"
    if not p.exists():
        return 0
    with p.open(encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def check_not_stopped(folder: Path) -> None:
    p = folder / "stopped.txt"
    if p.exists():
        raise Stopped(f"this batch stopped earlier ({p.read_text(encoding='utf-8').strip()}); "
                      "it is not resumed without a new decision")


def stop_batch(folder: Path, why: str) -> None:
    (folder / "stopped.txt").write_text(f"{datetime.now(UTC).isoformat(timespec='seconds')} {why}\n",
                                        encoding="utf-8")
    raise Stopped(f"stopped: {why}")


class ArchiveReader:
    """Byte-range reads from Common Crawl's data server (decision 14): one GET per page with the
    survey's identity, at least 10 seconds apart, never retried; only a 206 answer is kept, read no
    further than the record's length. A 429 or 503 (the server asking to slow down) doubles the
    spacing, up to 30 seconds, which eases back after answers; a 403 stops the batch at once, two
    429 or 503 answers in a row stop it for the day, three failures in a row stop it. Each request
    is one line of the batch's requests.log, written before it is sent, so the batch's size holds
    across runs."""

    INTERVAL, REFUSALS, FAILURES, SLACK = 10.0, 2, 3, 4096

    def __init__(self, folder: Path, cap: int, session=None, sleep=None, clock=None):
        import time

        import careers
        self.folder, self.cap = folder, cap
        folder.mkdir(parents=True, exist_ok=True)
        if session is None:
            import requests
            session = requests.Session()
            session.headers.update({"User-Agent": careers.USER_AGENT})
        self.session, self.sleep, self.clock = session, sleep or time.sleep, clock or time.monotonic
        check_not_stopped(folder)
        state = folder / "archive-state.json"
        saved = json.loads(state.read_text(encoding="utf-8")) if state.exists() else {}
        self.last, self.refusals, self.failures = -1e9, saved.get("refusals", 0), saved.get("failures", 0)
        self.interval = saved.get("interval", self.INTERVAL)

    def _save_state(self) -> None:
        (self.folder / "archive-state.json").write_text(
            json.dumps({"refusals": self.refusals, "failures": self.failures, "interval": self.interval}),
            encoding="utf-8")

    def _log(self, text: str) -> None:
        with (self.folder / "requests.log").open("a", encoding="utf-8") as handle:
            handle.write(f"{datetime.now(UTC).isoformat(timespec='seconds')}\t{text}\n")

    def get(self, filename: str, offset: int, length: int, what: str) -> bytes | None:
        if requests_sent(self.folder) >= self.cap:
            raise Stopped(f"stopped: the batch's size of {self.cap} requests reached")
        wait = self.interval - (self.clock() - self.last)
        if wait > 0:
            self.sleep(wait)
        self.last = self.clock()
        self._log(f"GET\t{what}")
        status, body = None, b""
        try:
            response = self.session.get(DATA_HOST + filename, timeout=(30, 180), stream=True, allow_redirects=False,
                                        headers={"Range": f"bytes={offset}-{offset + length - 1}"})
            status = response.status_code
            if status == 206:
                for chunk in response.iter_content(65536):
                    body += chunk
                    if len(body) > length + self.SLACK:
                        break
            response.close()
        except Exception as error:  # noqa: BLE001  counted as a failure; three in a row stop the batch
            status = type(error).__name__
        with (self.folder / "answers.log").open("a", encoding="utf-8") as handle:
            handle.write(f"{datetime.now(UTC).isoformat(timespec='seconds')}\t{status}\t{len(body)}\t{what}\n")
        if status == 206 and len(body) <= length + self.SLACK:
            self.refusals = self.failures = 0
            self.interval = max(self.INTERVAL, self.interval * 0.8)
            self._save_state()
            return body
        if status == 403:
            stop_batch(self.folder, f"HTTP 403 ({what})")
        if status in (429, 503):
            self.refusals += 1
            self.interval = min(self.interval * 2, 30.0)     # the server asks to slow down (step E's rule)
            self._save_state()
            if self.refusals >= self.REFUSALS:
                stop_batch(self.folder, f"{self.refusals} refusals in a row (HTTP {status})")
            return None
        self.failures += 1          # a redirect, a 404, a 200 to a byte range, an error
        self._save_state()
        if self.failures >= self.FAILURES:
            stop_batch(self.folder, f"{self.failures} failures in a row ({status})")
        return None


def row_still_allowed(r: dict, verdicts: RobotsVerdicts, held_hosts: set[str],
                      held_orgs: set[str] | frozenset = frozenset()) -> str:
    """'' when a planned row may be read now, else why not (R0's verdict, a shell host, a language
    outside wave 1, a UN organisation or host held for the terms decision, or not an archive file)."""
    host = (urlsplit(r["url"]).hostname or "").lower()
    if not r["filename"].startswith("crawl-data/"):
        return "not an archive file"
    if SHELL_HOSTS.search(host):
        return "shell host"
    if not in_wave_language(r["languages"]):
        return "language outside wave 1"
    if host in held_hosts or roles.UN_HOSTS.search(host) or r.get("org_id", "") in held_orgs:
        return "held: the UN's terms of use"
    if verdicts.verdict(r["url"]) != "allowed":
        return "not allowed by R0"
    return ""


def fetch_archive(args) -> int:
    batch = args.batch
    cap = min(args.cap or BATCH_CAPS[batch], BATCH_CAPS[batch])
    folder = READING / batch
    rows = read_csv(folder / "plan.csv")
    out = folder / "pages"
    out.mkdir(parents=True, exist_ok=True)
    verdicts = RobotsVerdicts()
    if not (folder / "held-hosts.txt").exists() or not (folder / "held-orgs.txt").exists():
        print(f"{batch}: the plan has no list of held UN organisations and hosts; run plan again first")
        return 1
    held_hosts = set((folder / "held-hosts.txt").read_text(encoding="utf-8").split())
    held_orgs = set((folder / "held-orgs.txt").read_text(encoding="utf-8").split())
    reader = ArchiveReader(folder, cap)
    saved = failed = 0
    skipped = Counter()
    try:
        for r in rows:
            target = out / f"{r['page_id']}.warc.gz"
            if target.exists():
                continue
            why = row_still_allowed(r, verdicts, held_hosts, held_orgs)
            if why:
                skipped[why] += 1
                continue
            body = reader.get(r["filename"], int(r["offset"]), int(r["length"]), f"{batch} page {r['page_id']}")
            if body is None:
                failed += 1
                continue
            part = target.with_suffix(".part")
            part.write_bytes(body)
            part.replace(target)
            saved += 1
            if saved % 100 == 0:
                print(f"  {saved} saved; {requests_sent(folder)} requests in the batch", flush=True)
    except Stopped as stop:
        print(stop)
    print(f"{batch}: {saved} pages saved this run, {failed} failed, skipped {dict(skipped)}; "
          f"{requests_sent(folder)} requests in the batch (size {cap}); "
          f"{len(list(out.glob('*.warc.gz')))} pages on disk")
    return 0


# Live batches. Each board is read only within its approved size; its adverts are drawn at random
# from the job links of its listing pages.
BOARDS = {
    "myjobmag": {"listings": ["https://www.myjobmag.com/jobs-by-industry/ngo"],
                 "next": r"/jobs-by-industry/ngo/(\d+)$", "link": r"^https://www\.myjobmag\.com/job/[^/?#]+$",
                 "adverts": 80, "listing_pages": 6},
    "groundzero": {"listings": ["https://groundzero.community/jobs"],
                   "next": r"/jobs\?page=(\d+)$", "link": r"^https://groundzero\.community/jobs/\d+/[^/?#]+$",
                   "adverts": 70, "listing_pages": 4},
    "ngoportal": {"listings": ["https://jobs.ngoportal.africa/"],
                  "next": r"/page/(\d+)/?$", "link": r"^https://jobs\.ngoportal\.africa/job/[^/?#]+/?$",
                  "adverts": 25, "listing_pages": 4},
    "ngojobsinafrica": {"listings": ["https://ngojobsinafrica.com/"],
                        "next": r"/page/(\d+)/?$", "link": r"^https://ngojobsinafrica\.com/job/[^/?#]+/?$",
                        "adverts": 25, "listing_pages": 4},
}
FEEDS = {   # documented public job feeds of domestic charities found in the live reads (19.6, R4)
    "educate": ("Greenhouse", "https://boards-api.greenhouse.io/v1/boards/educate/jobs?content=true",
                "experienceeducate.org"),
    "girleffect": ("Greenhouse", "https://boards-api.greenhouse.io/v1/boards/girleffect/jobs?content=true",
                   "girleffect.org"),
    "instiglio": ("Greenhouse", "https://boards-api.greenhouse.io/v1/boards/instiglio/jobs?content=true",
                  "instiglio.org"),
    "movember": ("Teamtailor", "https://careers.movember.com/jobs.rss", "ca.movember.com"),
}
UN_PAGES = {   # P1-2 (19.6, R5): the UN careers feed and 12 agencies' careers pages, titles only
    "un-careers-feed": "https://careers.un.org/jobfeed",
    "unops": "https://jobs.unops.org/Pages/ViewVacancy/VAListing.aspx",
    "undp": "https://jobs.undp.org/cj_view_jobs.cfm",
    "unicef": "https://jobs.unicef.org/en-us/listing/",
    "wfp": "https://www.wfp.org/careers/job-openings",
    "unhcr": "https://www.unhcr.org/careers",
    "iom": "https://www.iom.int/vacancies",
    "unesco": "https://careers.unesco.org/go/All-jobs-openings/782502/",
    "fao": "https://www.fao.org/employment/vacancies/en",
    "ifad": "https://www.ifad.org/en/web/careers/job-openings",
    "unwomen": "https://www.unwomen.org/en/about-us/employment",
    "unu": "https://unu.edu/about/careers",
    "unido": "https://www.unido.org/overview/employment",
}


LIVE_REDIRECTS = 2   # redirects the fetch policy may follow for one live request


class SurveyRefusal(Exception):
    """Raised by the counting resolver: the batch's size is reached, or a host is off the site."""


def live_requests_sent(folder: Path) -> int:
    """Requests a live batch has made across all its runs: one line each in its resolver log."""
    p = folder / "resolver.log"
    if not p.exists():
        return 0
    with p.open(encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


class CountingResolver:
    """The fetch policy asks its resolver for a host's address once for every request it makes (each
    redirect hop and its own robots.txt reads included), before connecting. This resolver logs each
    request there, refuses it once the batch's size is reached, and refuses a host off the current
    request's site, which is then never contacted; otherwise it returns the policy's own lookup."""

    def __init__(self, folder: Path, cap: int, lookup=None):
        if lookup is None:
            from contracts.outbound import (
                _default_resolver as lookup,  # the policy's own DNS lookup
            )
        self.folder, self.cap, self.lookup = folder, cap, lookup
        self.site, self.refused = "", ""

    async def __call__(self, host: str, port: int) -> list[str]:
        if self.site and site_host(host) != self.site:
            self.refused = f"off the site ({host})"
            raise SurveyRefusal(self.refused)
        if live_requests_sent(self.folder) >= self.cap:
            self.refused = "size"
            raise SurveyRefusal(f"the batch's size of {self.cap} requests reached")
        with (self.folder / "resolver.log").open("a", encoding="utf-8") as handle:
            handle.write(f"{datetime.now(UTC).isoformat(timespec='seconds')}\t{host}:{port}\n")
        return await self.lookup(host, port)


class LiveRun:
    """One live batch: confirm.Fetcher (the fetch policy, the survey's identity, at most LIVE_REDIRECTS
    redirects), a counting resolver that makes the batch's size exact and keeps each request on its
    site, step F's stop rules, every body kept outside the repository."""

    def __init__(self, batch: str, cap: int, fetcher=None, folder: Path | None = None, lookup=None):
        import functools

        import confirm
        self.confirm = confirm
        self.batch, self.cap = batch, cap
        self.dir = folder or READING / batch
        (self.dir / "bodies").mkdir(parents=True, exist_ok=True)
        check_not_stopped(self.dir)
        self.resolver = CountingResolver(self.dir, cap, lookup)
        if fetcher is None:
            fetcher = confirm.Fetcher(self.dir / "requests.log")
            fetcher.fetch_url = functools.partial(fetcher.fetch_url, max_redirects=LIVE_REDIRECTS,
                                                  resolver=self.resolver)
        self.fetcher = fetcher
        state = self.dir / "state.json"
        saved = json.loads(state.read_text(encoding="utf-8")) if state.exists() else {}
        self.refusals = [tuple(x) for x in saved.get("refusals", [])]
        self.failures, self.stopped = saved.get("failures", 0), ""
        self.blocked_hosts = set(saved.get("blocked_hosts", []))
        self.records = []

    def _save_state(self) -> None:
        (self.dir / "state.json").write_text(json.dumps({
            "refusals": self.refusals, "failures": self.failures,
            "blocked_hosts": sorted(self.blocked_hosts)}), encoding="utf-8")

    def _refused(self, status, protection: str) -> bool:
        return status in (401, 403, 429) or bool(protection)

    def get(self, url: str, what: str) -> dict | None:
        host = (urlsplit(url).hostname or "").lower()
        if self.stopped or host in self.blocked_hosts:
            return None
        pid = page_id(url)
        meta_path = self.dir / "bodies" / f"{pid}.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if self._refused(meta.get("status"), meta.get("protection", "")) or \
                    (meta.get("error") or "").startswith(("robots.txt", "redirected off")):
                self.blocked_hosts.add(host)
            body = self.dir / "bodies" / f"{pid}.bin"
            meta["body"] = body.read_bytes() if body.exists() else b""
            return meta
        if live_requests_sent(self.dir) >= self.cap:
            self.stopped = f"the batch's size of {self.cap} requests reached"
            return None
        self.resolver.site, self.resolver.refused = site_host(host), ""
        r = self.fetcher.get(url, what)
        error = r["error"] or ""
        if self.resolver.refused == "size":
            self.stopped = f"the batch's size of {self.cap} requests reached"
            return None
        final_host = (urlsplit(r["final_url"]).hostname or "").lower() if r["final_url"] else host
        text = (r["body"] or b"").decode("utf-8", "replace")
        prot = self.confirm.bot_protection(r["status"], r["headers"], text) if r["status"] else ""
        refusal = None
        if self.resolver.refused:
            # A redirect off the site was refused before it was followed: not kept, host blocked.
            self.blocked_hosts.add(host)
            error, r = f"redirected off the site, not followed ({self.resolver.refused})", \
                {**r, "status": None, "body": b""}
        elif self._refused(r["status"], prot) or error == "robots.txt refused the crawler":
            refusal = (final_host, self.confirm.service_of(prot, r["headers"].get("server", "")))
            self.blocked_hosts |= {host, final_host}
        elif error.startswith("robots.txt"):
            self.blocked_hosts.add(host)     # forbidden, unreachable or too long a delay: not read
        network_failure = r["status"] is None and not error.startswith(("robots.txt", "redirected off"))
        self.refusals, self.failures = self.confirm.tally(self.refusals, self.failures, refusal, network_failure)
        meta = {"url": url, "what": what, "status": r["status"], "error": error, "final_url": r["final_url"],
                "protection": prot, "content_type": r["headers"].get("content-type", ""),
                "read_at": datetime.now(UTC).isoformat(timespec="seconds")}
        if r["status"] == 200 and not prot:
            (self.dir / "bodies" / f"{pid}.bin").write_bytes(r["body"])
        meta_path.write_text(json.dumps(meta), encoding="utf-8")
        self.records.append(meta)
        self._save_state()
        why = self.confirm.run_stop(self.refusals) or (
            f"{self.failures} network failures in a row" if self.failures >= self.confirm.STOP_FAILURES else "")
        if why:
            self.stopped = why
            (self.dir / "stopped.txt").write_text(f"{meta['read_at']} {why}\n", encoding="utf-8")
        meta["body"] = r["body"] if r["status"] == 200 and not prot else b""
        return meta

    def robots(self, host: str) -> bool:
        """Read and keep a host's robots.txt (the fetch policy reuses the answer); False when the
        host may not be read."""
        meta = self.get(f"https://{host}/robots.txt", f"robots.txt {host}")
        if not meta:
            return False
        verdict = self.confirm.robots_verdict(meta["status"], (meta["body"] or b"").decode("utf-8", "replace"),
                                              f"https://{host}/")
        if verdict != "allowed":
            self.blocked_hosts.add(host)
        return verdict == "allowed"


def links_in(body: bytes, base: str, pattern: str, host: str = "") -> list[str]:
    """Links of a page matching `pattern`; with `host`, only links on that host (a board's own)."""
    text = body.decode("utf-8", "replace")
    out = []
    for h in re.findall(r"href\s*=\s*[\"']([^\"'#\s]+)", text):
        u = urljoin(base, h)
        if host and (urlsplit(u).hostname or "").lower() != host:
            continue
        if re.search(pattern, u) and u not in out:
            out.append(u)
    return out


def board_pages(run: LiveRun, name: str, cfg: dict, rng: random.Random) -> tuple[int, list[str]]:
    """One board: its robots.txt, its listing pages in order (only the next page number, only on
    the board's own host, at most `listing_pages`), then its adverts drawn at random."""
    host = (urlsplit(cfg["listings"][0]).hostname or "").lower()
    if not run.robots(host):
        print(f"{name}: robots.txt does not allow the survey, or the host refused; not read")
        return 0, []
    links, queue, seen_pages = [], [cfg["listings"][0]], 0
    while queue and seen_pages < cfg["listing_pages"] and len(links) < cfg["adverts"] * 2:
        url = queue.pop(0)
        meta = run.get(url, f"listing {name}")
        seen_pages += 1
        if not meta or not meta["body"]:
            break
        links += [u for u in links_in(meta["body"], url, cfg["link"], host) if u not in links]
        nxt = [u for u in links_in(meta["body"], url, cfg["next"], host)
               if int(re.search(cfg["next"], u).group(1)) == seen_pages + 1]
        queue += [u for u in nxt[:1] if u not in queue]
    links = sorted(set(links))
    rng.shuffle(links)
    chosen = links[:cfg["adverts"]]
    for u in chosen:
        run.get(u, f"advert {name}")
    return seen_pages, links


def fetch_live(args) -> int:
    batch = args.batch
    cap = min(args.cap or BATCH_CAPS[batch], BATCH_CAPS[batch])
    run = LiveRun(batch, cap)
    if batch == "r3":
        rng = random.Random(SEED + 3)
        for name, cfg in BOARDS.items():
            seen_pages, links = board_pages(run, name, cfg, rng)
            print(f"{name}: {seen_pages} listing pages, {len(links)} job links, "
                  f"{min(len(links), cfg['adverts'])} adverts asked for", flush=True)
            if run.stopped:
                break
    elif batch == "r4":
        allowed_hosts = {}
        for name, (system, url, _site) in FEEDS.items():
            host = urlsplit(url).hostname
            if host not in allowed_hosts:
                allowed_hosts[host] = run.robots(host)
            if allowed_hosts[host]:
                run.get(url, f"feed {name} ({system})")
            if run.stopped:
                break
    elif batch == "r5":
        if not args.un_terms_decided:
            print("r5: held until the user decides on the UN's terms of use (role-survey.md, 19.11); no request")
            return 0
        for name, url in UN_PAGES.items():
            host = urlsplit(url).hostname
            if run.robots(host):
                run.get(url, f"UN page {name}")
            if run.stopped:
                break
    statuses = Counter(str(m["status"] or m["error"]) for m in run.records)
    print(f"{batch}: {len(run.records)} pages asked for this run, {live_requests_sent(run.dir)} requests in the "
          f"batch (size {cap}); "
          f"statuses {dict(statuses)}; blocked hosts {sorted(run.blocked_hosts)}"
          + (f"; stopped: {run.stopped}" if run.stopped else ""))
    return 0


# --- extraction (local) -------------------------------------------------------------------------

def warc_uri(raw_gz: bytes) -> str:
    try:
        head = gzip.decompress(raw_gz)[:4000].decode("utf-8", "replace")
    except (OSError, EOFError, zlib.error):
        return ""
    m = re.search(r"WARC-Target-URI:\s*(\S+)", head)
    return m.group(1) if m else ""


def http_body(raw_gz: bytes) -> tuple[str, bytes, dict]:
    """(target URI, decoded HTTP body, HTTP headers) of one archived WARC response record."""
    raw = gzip.decompress(raw_gz)
    parts = raw.split(b"\r\n\r\n", 2)
    if len(parts) < 3:
        return "", b"", {}
    warc_head, http_head, body = parts
    m = re.search(rb"WARC-Target-URI:\s*(\S+)", warc_head)
    uri = m.group(1).decode("utf-8", "replace") if m else ""
    headers = {}
    for line in http_head.split(b"\r\n")[1:]:
        if b":" in line:
            k, v = line.split(b":", 1)
            headers[k.strip().lower().decode("latin-1")] = v.strip().decode("latin-1")
    if headers.get("transfer-encoding", "").lower() == "chunked":
        body = dechunk(body)
    enc = headers.get("content-encoding", "").lower()
    # A body that cannot be decoded is left as it is; brotli is not decoded (no dependency added).
    with contextlib.suppress(OSError, EOFError, zlib.error):
        if enc in ("gzip", "x-gzip"):
            body = gzip.decompress(body)
        elif enc == "deflate":
            body = zlib.decompress(body)
    return uri, body, headers


def dechunk(body: bytes) -> bytes:
    out, i = bytearray(), 0
    while i < len(body):
        j = body.find(b"\r\n", i)
        if j < 0:
            break
        try:
            size = int(body[i:j].split(b";")[0], 16)
        except ValueError:
            return body
        if size == 0:
            break
        out += body[j + 2:j + 2 + size]
        i = j + 2 + size + 2
    return bytes(out)


EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# A phone number: an international prefix, an area code in brackets, a local number starting with 0, or
# digits after a phone word. Salary figures with spaces ("120 000 - 150 000") and year ranges stay.
PHONE = re.compile(r"(?<![\w/.])(?:\+|00)[1-9][\d\s().-]{6,}\d(?![\w/])|(?<![\w/.])\(\d{2,4}\)\s?\d[\d\s.-]{5,}\d"
                   r"|\b0[1-9]\d{1,2}[\s.-]?\d{3}[\s.-]?\d{3,4}\b")
PHONE_WORD = re.compile(r"(\b(?:tel|phone|call|mobile|whatsapp|t[ée]l[ée]phone|t[ée]l)\b\.?\W{1,5})"
                        r"(\d[\d\s().-]{6,}\d)", re.IGNORECASE)
BLOCK_TAGS = {"p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table", "section",
              "article", "br", "dd", "dt", "blockquote", "header", "td", "th"}
DROP_TAGS = ["script", "style", "noscript", "nav", "footer", "header", "aside", "form", "svg", "iframe",
             "button", "select", "template"]
DROP_ATTR = re.compile(r"(?:^|[-_ ])(?:nav|navbar|menu|footer|header|cookie|breadcrumbs?|sidebar|share|"
                       r"social|related|newsletter|banner|modal|skip)(?:$|[-_ ])", re.IGNORECASE)


def scrub(text: str) -> str:
    """Emails and phone numbers removed (growth plan 4.6), before anything is kept."""
    text = EMAIL.sub("[email]", text)
    text = PHONE_WORD.sub(lambda m: m.group(1) + "[phone]" if sum(ch.isdigit() for ch in m.group(2)) >= 7
                          else m.group(0), text)
    return PHONE.sub(lambda m: " [phone]" if sum(ch.isdigit() for ch in m.group(0)) >= 8 else m.group(0), text)


def html_lines(html: str) -> list[dict]:
    """The visible text of a page as lines, each marked as a heading or not; navigation, headers,
    footers and other site furniture left out."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(DROP_TAGS):
        tag.decompose()
    for tag in soup.find_all(True):
        if getattr(tag, "decomposed", False) or tag.attrs is None:
            continue
        attrs = " ".join([str(tag.get("id") or "")] + [str(c) for c in (tag.get("class") or [])])
        if attrs and DROP_ATTR.search(attrs) and tag.name not in ("body", "main", "article"):
            tag.decompose()
    root = soup.find("main") or soup.find("article") or soup.body or soup
    lines = []

    def emit(text: str, heading: bool, tag: str):
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            lines.append({"text": text, "heading": heading, "tag": tag})

    for el in root.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt", "dd", "td", "th", "div",
                             "span", "strong", "b"]):
        if el.find(["p", "li", "div", "h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol"]):
            continue
        if el.name in ("span", "strong", "b") and el.parent is not None and el.parent.name in \
                ("p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "dd", "dt"):
            continue
        text = el.get_text(" ", strip=True)
        if not text:
            continue
        heading = el.name in ("h1", "h2", "h3", "h4", "h5", "h6") or is_heading_text(text, el)
        emit(text, heading, el.name)
    out, prev = [], None
    for ln in lines:
        if ln["text"] != prev:
            out.append(ln)
        prev = ln["text"]
    return out


def is_heading_text(text: str, el=None) -> bool:
    words = text.split()
    if not words or len(words) > 10:
        return False
    if el is not None:
        strong = el.find(["strong", "b"])
        if strong is not None and strong.get_text(" ", strip=True) == text:
            return True
        if el.name in ("strong", "b"):
            return True
    if text.endswith(":") and len(words) <= 8:
        return True
    letters = [c for c in text if c.isalpha()]
    return len(letters) >= 4 and all(c.isupper() for c in letters) and len(words) <= 8


def jsonld_postings(html: str) -> list[dict]:
    out = []
    for blk in re.findall(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", html, re.DOTALL | re.IGNORECASE):
        try:
            data = json.loads(blk.strip())
        except ValueError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            it = stack.pop()
            if isinstance(it, dict):
                if "@graph" in it and isinstance(it["@graph"], list):
                    stack += it["@graph"]
                if "JobPosting" in str(it.get("@type", "")):
                    out.append(it)
    return out


def _text(v) -> str:
    if isinstance(v, dict):
        return " ".join(_text(x) for x in v.values())
    if isinstance(v, list):
        return " ".join(_text(x) for x in v)
    return str(v or "")


def posting_facts(p: dict) -> dict:
    """The facts a JobPosting states, as flags (never its text)."""
    sal = p.get("baseSalary") or p.get("estimatedSalary")
    loc = p.get("jobLocation") or p.get("applicantLocationRequirements")
    return {"title": bool(p.get("title")), "date_posted": bool(p.get("datePosted")),
            "closing_date": bool(p.get("validThrough")), "organisation": bool(p.get("hiringOrganization")),
            "place": bool(loc) or "TELECOMMUTE" in str(p.get("jobLocationType", "")).upper(),
            "employment_type": bool(p.get("employmentType")),
            "pay": bool(sal) and bool(re.search(r"\d", _text(sal)))}


def advert_from_html(html: str, url: str) -> dict:
    postings = [p for p in jsonld_postings(html) if len(re.sub(r"<[^>]+>", " ", _text(p.get("description"))).split()) >= 100]
    title = ""
    if postings:
        p = postings[0]
        lines = html_lines(_text(p.get("description")))
        method = "jsonld"
        title = re.sub(r"\s+", " ", _text(p.get("title"))).strip()
        facts = posting_facts(p)
        employer = _text((p.get("hiringOrganization") or {}).get("name") if isinstance(p.get("hiringOrganization"), dict) else "")
    else:
        lines = html_lines(html)
        method, facts, employer = "html", {}, ""
        h1 = next((ln["text"] for ln in lines if ln["tag"] == "h1"), "")
        if not h1:
            m = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
            h1 = roles.clean_text(m.group(1)).split(" | ")[0].split(" - ")[0] if m else ""
        title = h1
    for ln in lines:
        ln["text"] = scrub(ln["text"])
    return {"url": url, "title": scrub(title)[:200], "lines": lines, "method": method, "facts": facts,
            "employer": employer[:120]}


def feed_adverts(system: str, body: bytes) -> list[dict]:
    """The adverts of one documented job feed (Greenhouse, Teamtailor, Personio, Recruitee, Lever,
    Workable, SmartRecruiters as step F saved them)."""
    import html as htmllib
    from xml.etree import ElementTree
    out = []
    try:
        if system in ("Personio", "Teamtailor"):
            root = ElementTree.fromstring(body)
            parent = "position" if system == "Personio" else "item"
            for e in root.iter():
                if e.tag.split("}")[-1] != parent:
                    continue
                title, parts, link = "", [], ""
                for c in e.iter():
                    tag = c.tag.split("}")[-1]
                    if tag in ("name", "title") and c.text and not title:
                        title = c.text
                    elif tag in ("value", "description") and c.text:
                        parts.append(c.text)
                    elif tag in ("link", "id") and c.text and not link:
                        link = c.text
                out.append((title, " ".join(parts), link))
        else:
            d = json.loads(body)
            items = d if isinstance(d, list) else d.get("jobs") or d.get("offers") or d.get("content") or []
            for it in items:
                title = it.get("title") or it.get("text") or it.get("name") or ""
                desc = it.get("content") or it.get("description") or it.get("descriptionPlain") or ""
                if isinstance(it.get("lists"), list):
                    desc += " ".join(f"<h3>{x.get('text', '')}</h3>{x.get('content', '')}" for x in it["lists"])
                if it.get("additional"):
                    desc += str(it["additional"])
                link = it.get("absolute_url") or it.get("hostedUrl") or it.get("careers_url") or it.get("url") or ""
                out.append((title, desc, str(link)))
    except (ValueError, ElementTree.ParseError, AttributeError, TypeError):
        return []
    adverts = []
    for title, desc, link in out:
        html = htmllib.unescape(desc) if "&lt;" in desc else desc
        lines = html_lines(f"<html><body>{html}</body></html>")
        for ln in lines:
            ln["text"] = scrub(ln["text"])
        adverts.append({"url": link or f"feed:{page_id(title + desc[:200])}", "title": scrub(roles.clean_text(title))[:200],
                        "lines": lines, "method": "feed", "facts": {}, "employer": ""})
    return adverts


def extract(_args=None) -> int:
    """Every saved page or feed -> one local JSON per advert (contacts removed)."""
    out = WORK / "adverts"
    out.mkdir(parents=True, exist_ok=True)
    plans = {}
    for b in ("r1", "r2"):
        p = READING / b / "plan.csv"
        if p.exists():
            for r in read_csv(p):
                plans[r["page_id"]] = dict(r, batch=b)
    n, kinds = 0, Counter()
    for pid, path in sorted(saved_pages().items()):
        try:
            uri, body, headers = http_body(path.read_bytes())
        except (OSError, EOFError, zlib.error):
            kinds["unreadable"] += 1
            continue
        html = body.decode(charset(headers, body), "replace")
        ad = advert_from_html(html, uri)
        meta = plans.get(pid, {})
        ad.update(id=pid, source="archive", batch=meta.get("batch", "earlier"), system=system_of(uri) or "own site",
                  crawl=meta.get("crawl", ""), languages=meta.get("languages", ""))
        _save_advert(out, ad)
        n += 1
        kinds[ad["method"]] += 1
    for batch in ("r3", "r4", "r5"):
        for meta_path in sorted((READING / batch / "bodies").glob("*.json")):
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            body_path = meta_path.with_suffix(".bin")
            if meta.get("status") != 200 or not body_path.exists() or meta["url"].endswith("/robots.txt"):
                continue
            body = body_path.read_bytes()
            what = meta.get("what", "")
            if batch == "r4" and what.startswith("feed"):
                system = what.split("(")[-1].rstrip(")")
                site = FEEDS.get(what.split()[1], ("", "", ""))[2]
                for ad in feed_adverts(system, body):
                    ad.update(id=page_id(ad["url"]), source="feed", batch=batch, system=system, crawl="",
                              languages="", read_at=meta.get("read_at", ""), org_site=site)
                    _save_advert(out, ad)
                    n += 1
                    kinds["feed"] += 1
            elif batch == "r3" and what.startswith("advert"):
                ad = advert_from_html(body.decode("utf-8", "replace"), meta["url"])
                ad.update(id=page_id(meta["url"]), source="board", batch=batch, system=what.split()[-1],
                          crawl="", languages="", read_at=meta.get("read_at", ""))
                _save_advert(out, ad)
                n += 1
                kinds["board"] += 1
    for oid, system, ad in step_f_feed_adverts():
        ad.update(id=page_id(ad["url"]), source="step-f-feed", batch="step-f", system=system, crawl="",
                  languages="", org_hint=oid)
        _save_advert(out, ad)
        n += 1
        kinds["step-f-feed"] += 1
    print(f"extracted: {n} adverts or pages; by method {dict(kinds)}")
    return 0


def charset(headers: dict, body: bytes) -> str:
    m = re.search(r"charset=([\w-]+)", headers.get("content-type", ""), re.IGNORECASE) or \
        re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", body[:4000], re.IGNORECASE)
    name = m.group(1) if m else "utf-8"
    name = name.decode("ascii", "replace") if isinstance(name, bytes) else name
    try:
        "".encode(name)
        return name
    except LookupError:
        return "utf-8"


def step_f_feed_adverts():
    raw = roles.RAW_CONFIRM
    for path in sorted((raw / "orgs").glob("*.json")):
        rec = json.loads(path.read_text(encoding="utf-8"))
        req = rec.get("request", "")
        body = raw / "bodies" / (path.stem + ".bin")
        if req.startswith("feed") and body.exists():
            system = req[len("feed ("):-1]
            for ad in feed_adverts(system, body.read_bytes()):
                if words_of(" ".join(ln["text"] for ln in ad["lines"])) > 80:
                    yield rec["org_id"], system, ad


def _save_advert(folder: Path, ad: dict) -> None:
    (folder / f"{ad['id']}.json").write_text(json.dumps(ad, ensure_ascii=False), encoding="utf-8")


def load_adverts(folder: Path | None = None) -> list[dict]:
    folder = folder or WORK / "adverts"
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("*.json"))]


def read_saved_titles():
    """(source, snapshot, url, title) of the adverts read, for roles.py's titles."""
    for ad in load_adverts() if (WORK / "adverts").exists() else []:
        if ad.get("title") and ad["source"] != "step-f-feed":
            snap = ad.get("crawl") or ad.get("batch")
            yield ad["source"], snap, ad["url"], ad["title"]
    # R5's UN listing pages give titles only, from their job links (read only if the user allows UN pages).
    from confirm import JOB_LINK
    for meta_path in sorted((READING / "r5" / "bodies").glob("*.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        body = meta_path.with_suffix(".bin")
        if meta.get("status") != 200 or not body.exists() or meta["url"].endswith("/robots.txt"):
            continue
        base = meta.get("final_url") or meta["url"]
        for href, inner in roles.ANCHOR.findall(body.read_bytes().decode("utf-8", "replace")):
            t = roles.clean_text(inner)
            if JOB_LINK.search(href) and 4 <= len(t) <= 140 and roles.looks_like_title(t):
                yield "un-page", "r5", urljoin(base, href), t


# --- measuring (local -> committed) -------------------------------------------------------------

def words_of(text: str) -> int:
    return len(re.findall(r"[^\W\d_][\w'’-]*", text))


SECTION_TYPES: list[tuple[str, re.Pattern]] = [
    ("working_relationships", re.compile(r"^about (?:the|our) (?:team|department|unit|division)\b", re.IGNORECASE)),
    ("context", re.compile(r"^about (?:the|this) (?:programme|program|project)\b", re.IGNORECASE)),
    ("essential_requirements", re.compile(r"^about (?:the )?(?:candidate|applicant)s?\b", re.IGNORECASE)),
    ("about_organisation", re.compile(r"^(?:about(?:$| (?!the (?:role|job|position|post|opportunity|assignment|"
                                      r"vacancy)\b|this (?:role|job|position|post|opportunity)\b|you\b|the candidate\b))|"
                                      r"who we are|our organi[sz]ation|the organi[sz]ation|organi[sz]ational "
                                      r"(?:setting|context|background)|background on|à propos (?!du poste)|qui sommes|"
                                      r"pr[ée]sentation de|l'organisation|l'association|notre organisation|"
                                      r"company description|our mission|org(?:ani[sz]ation)? overview|overview of (?:the )?"
                                      r"(?:organi[sz]ation|company))", re.IGNORECASE)),
    ("role_purpose", re.compile(r"^(?:about (?:the|this) (?:role|job|position|post|opportunity|assignment|vacancy)|"
                                r"à propos du poste)", re.IGNORECASE)),
    ("context", re.compile(r"^(?:context|background|programme (?:background|description)|project "
                           r"(?:background|description|summary)|contexte|description du projet|"
                           r"(?:the )?country context|situation)", re.IGNORECASE)),
    ("role_purpose", re.compile(r"^(?:(?:job|position|role|post) (?:purpose|summary|overview|description)|"
                                r"purpose(?: of the (?:role|position|post|job))?|overview|summary|the role|"
                                r"about the (?:role|job|position)|objecti(?:ve|f)s? (?:of the|du) (?:poste|"
                                r"position|role|assignment|consultancy)|objectif du poste|raison d'[êe]tre|"
                                r"finalit[ée]|mission(?: g[ée]n[ée]rale)?(?: du poste)?$|r[ée]sum[ée] du poste|"
                                r"description du poste|le poste|your role|what is the role)", re.IGNORECASE)),
    ("scope", re.compile(r"^(?:scope|dimensions|key (?:relationships and )?dimensions|scope of work|"
                         r"p[ée]rim[èe]tre|budget|line management|supervision)", re.IGNORECASE)),
    ("responsibilities", re.compile(r"^(?:(?:key |main |major |principal |specific )?(?:duties|responsibilit|"
                                    r"tasks|accountabilit|activities|functions)|what you(?:'ll| will) do|"
                                    r"your (?:responsibilities|mission|tasks)|the job|job description|"
                                    r"(?:principales |vos )?(?:missions|t[âa]ches|responsabilit[ée]s|"
                                    r"attributions|activit[ée]s)|roles? and responsibilit|duties and "
                                    r"responsibilit|in this role|day to day|key result areas|"
                                    r"description des t[âa]ches)", re.IGNORECASE)),
    ("deliverables", re.compile(r"^(?:(?:expected |key )?deliverables|outputs|expected (?:results|outputs)|"
                                r"livrables|r[ée]sultats attendus|results expected|key performance|"
                                r"measures of success|success (?:looks|measures))", re.IGNORECASE)),
    ("working_relationships", re.compile(r"^(?:(?:key |working |internal and external )?(?:relationships|contacts)|"
                                         r"reporting(?: line| lines| to)?|reports to|liens? hi[ée]rarchiques?|"
                                         r"relations (?:de travail|fonctionnelles)|position in the organi)", re.IGNORECASE)),
    ("essential_requirements", re.compile(r"^(?:(?:essential |minimum |required |mandatory )?(?:qualifications?|"
                                          r"requirements?|criteria|skills|experience|education)|"
                                          r"(?:person specification|who you are|what you(?:'ll)? (?:bring|need|"
                                          r"have)|about you|your profile|the ideal candidate|candidate profile|"
                                          r"required skills|requirements and qualifications|"
                                          r"profil(?: recherch[ée]| requis| du candidat)?|comp[ée]tences "
                                          r"requises|qualifications requises|exp[ée]rience(?: requise)?|"
                                          r"formation|dipl[ôo]mes?|crit[èe]res|you have|must have)|"
                                          r"education(?:al)? (?:background|requirements)|work experience|"
                                          r"technical (?:skills|competencies|requirements))", re.IGNORECASE)),
    ("desirable_requirements", re.compile(r"^(?:desirable|preferred|nice to have|an advantage|assets?|"
                                          r"souhait[ée]|atouts?|appr[ée]ci[ée]|additional (?:assets|"
                                          r"qualifications))", re.IGNORECASE)),
    ("competencies", re.compile(r"^(?:(?:core |key |functional |technical |managerial )?competenc|behaviou?rs|"
                                r"values|comp[ée]tences (?:cl[ée]s|comportementales)|savoir-?[êe]tre|qualit[ée]s|"
                                r"personal (?:attributes|qualities)|soft skills)", re.IGNORECASE)),
    ("languages", re.compile(r"^(?:languages?(?: requirements| skills)?|langues?|language proficiency)", re.IGNORECASE)),
    ("field_conditions", re.compile(r"^(?:(?:living|working|field|security) conditions|conditions of (?:service|"
                                    r"work)|hardship|accommodation|conditions (?:de vie|de travail|de s[ée]curit[ée])|"
                                    r"work environment)", re.IGNORECASE)),
    ("pay_benefits", re.compile(r"^(?:(?:salary|remuneration|compensation|pay|benefits|what we offer|we offer|"
                                r"package|terms and conditions|conditions d'emploi|r[ée]mun[ée]ration|salaire|"
                                r"avantages|nous (?:vous )?offrons|ce que nous offrons|contract(?:ual)? "
                                r"(?:details|terms|conditions)|type of contract|contrat|conditions propos[ée]es))", re.IGNORECASE)),
    ("commitments_safeguarding", re.compile(r"^(?:safeguarding|psea|protection from sexual|child (?:safeguarding|"
                                            r"protection policy)|code of conduct|our (?:commitment|values)|"
                                            r"commitment to|engagements?|pr[ée]vention de l'exploitation|"
                                            r"politique de protection|integrity|un considerations?|special notice)", re.IGNORECASE)),
    ("equal_opportunity", re.compile(r"^(?:equal (?:opportunit|employment)|diversity|inclusion|eeo|equity|"
                                     r"[ée]galit[ée] des chances|diversit[ée]|non-?discrimination|"
                                     r"accessibility|reasonable (?:accommodation|adjustments))", re.IGNORECASE)),
    ("how_to_apply", re.compile(r"^(?:how to apply|application(?: process| procedure| instructions| method)?s?|"
                                r"to apply|apply(?: now)?|submission|comment postuler|candidature|"
                                r"pour postuler|modalit[ée]s de candidature|dossier de candidature|"
                                r"closing date|deadline|date limite)", re.IGNORECASE)),
    ("selection_process", re.compile(r"^(?:selection(?: process| criteria)?|recruitment process|assessment|"
                                     r"interview|next steps|processus de (?:s[ée]lection|recrutement)|"
                                     r"[ée]valuation des candidatures|timeline)", re.IGNORECASE)),
    ("fraud_notice", re.compile(r"^(?:(?:no )?fees?|fraud|scam|beware|disclaimer|avertissement|"
                                r"aucun frais|note:? (?:we|the organi[sz]ation) (?:do|does) not charge)", re.IGNORECASE)),
    ("data_protection", re.compile(r"^(?:data protection|privacy|gdpr|personal data|protection des donn[ée]es|"
                                   r"donn[ée]es personnelles|rgpd)", re.IGNORECASE)),
    ("header_facts", re.compile(r"^(?:job (?:details|information|facts)|position details|key (?:details|facts|"
                                r"information)|vacancy (?:details|information|announcement)|grade|level|"
                                r"contract (?:type|duration|length)|duration|start date|type de contrat|"
                                r"dur[ée]e|date de d[ée]but|reference|posting (?:date|period)|"
                                r"organizational unit|department|division|duty station|location|lieu d'affectation|"
                                r"lieu de travail|travel)", re.IGNORECASE)),
]
SECTION_IDS = [s for s, _ in SECTION_TYPES] + ["other_standard", "unclassified", "preamble"]
STANDARD_SECTIONS = {"about_organisation", "commitments_safeguarding", "equal_opportunity", "fraud_notice",
                     "data_protection", "other_standard"}


SECTION_EXTRA: list[tuple[str, re.Pattern]] = [
    ("essential_requirements", re.compile(r"^(?:job|position|key|general|specific|technical|professional) "
                                          r"(?:requirements|qualifications)|^conditions requises|we'?re looking for|"
                                          r"we are looking for|^looking for|(?:skills|experience|qualifications|"
                                          r"knowledge|competences|comp[ée]tences)$|^years of|^academic|"
                                          r"^ann[ée]es d'exp[ée]rience|^education$", re.IGNORECASE)),
    ("languages", re.compile(r"comp[ée]tences linguistiques|language skills", re.IGNORECASE)),
    ("about_organisation", re.compile(r"^organi[sz]ation(?:al)? (?:summary|profile)|^what is |^our (?:aim|vision|"
                                      r"story|work)|^who are we|^company (?:overview|profile)", re.IGNORECASE)),
    ("context", re.compile(r"^country (?:profile|overview)|^contexte", re.IGNORECASE)),
    ("role_purpose", re.compile(r"^(?:position|job|role) profile|^profil du poste$", re.IGNORECASE)),
    ("header_facts", re.compile(r"^(?:starting date|date de commencement|position|title|titre|d[ée]partement|"
                                r"department|location|lieu|contract duration|dur[ée]e du contrat)$|"
                                r"contract duration$", re.IGNORECASE)),
    ("responsibilities", re.compile(r"^fonctions$|responsibilities include|^responsabilit|^main tasks", re.IGNORECASE)),
    ("how_to_apply", re.compile(r"^before you apply", re.IGNORECASE)),
    ("pay_benefits", re.compile(r"^r[ée]?[mn]u[mn][ée]ration", re.IGNORECASE)),
    ("commitments_safeguarding", re.compile(r"^confidentialit", re.IGNORECASE)),
]


def section_type(heading: str) -> str:
    h = heading.strip().replace("&", " and ").replace("’", "'")
    h = re.sub(r"^[\W\d_]+|[\s:.;?!*]+$", "", h)
    h = re.sub(r"\s+", " ", h)
    for sid, pattern in SECTION_TYPES:
        if pattern.search(h):
            return sid
    for sid, pattern in SECTION_EXTRA:
        if pattern.search(h):
            return sid
    return "unclassified"


def sections_of(lines: list[dict]) -> list[dict]:
    """The advert's sections, in order: each recognised heading starts one; an unrecognised heading
    inside a section is read as its sub-heading; text before the first heading is the preamble.
    Words per section."""
    out = [{"type": "preamble", "heading": "", "lines": []}]
    for ln in lines:
        if ln["heading"] and words_of(ln["text"]) <= 12 and ln["tag"] != "h1" and re.search(r"[^\W\d_]", ln["text"]):
            kind = section_type(ln["text"])
            if kind == "unclassified" and out[-1]["type"] != "preamble":
                out[-1]["lines"].append(ln["text"])
                continue
            out.append({"type": kind, "heading": ln["text"], "lines": []})
        elif ln["tag"] != "h1":
            out[-1]["lines"].append(ln["text"])
    for s in out:
        s["words"] = sum(words_of(t) for t in s["lines"])
    return [s for s in out if s["words"] or s["type"] != "preamble"]


FACTS: dict[str, re.Pattern] = {
    # Pay as section 5 asks: a figure or range with its currency, a salary word next to a figure, or a
    # named scale (a grade on a salary scale, a band). "Competitive salary" is vague pay, its own item.
    "pay": re.compile(r"(?<![\w])(?:usd|us\$|\$|eur|€|£|gbp|kes|ksh|ngn|₦|inr|₹|rs\.?|chf|cad|aud|xof|fcfa|bdt|"
                      r"ugx|tzs|etb|ghs|zar|sek|nok|dkk)\s?\d[\d,.\s]{2,}|\b\d[\d,.]{2,}\s?(?:usd|eur|€|£|gbp|kes|ksh|"
                      r"ngn|inr|chf|xof|fcfa|bdt|ugx|tzs|etb|ghs|zar|sek|nok|dkk|lakhs?)\b|\b(?:salary|"
                      r"remuneration|stipend|honorarium|gross pay|net pay|r[ée]mun[ée]ration|salaire|allowances?|"
                      r"per diem)\b[^.\n]{0,25}?\b(?!(?:19|20)\d{2}\b(?!\s*(?:per|a (?:month|year)|/|usd|eur|gbp|"
                      r"kes|ngn|inr|\$|€|£)))(?:\d{1,3}(?:[,.\s]\d{3})+|\d{3,})\b|\b(?:salary|pay) (?:scale|band|grade)"
                      r"\s*:?\s*[A-Z]{0,3}-?\d|\bon the [\w\s]{2,40}? salary scale\b|\bgrade\s?[A-Z]{0,2}-?\d+ of the\b|"
                      r"\b(?:annual|monthly) net (?:base )?salary\b|\bnet base salary\b|\bpay band\b|"
                      r"\b\d+(?:\.\d+)?\s*(?:lakhs?|crores?|lpa)\b", re.IGNORECASE),
    "pay_vague": re.compile(r"\b(?:competitive|attractive|negotiable|commensurate)\b[^.\n]{0,30}\b(?:salary|pay|"
                            r"remuneration|package|compensation)\b|\b(?:salary|remuneration)\b[^.\n]{0,25}?\b"
                            r"(?:commensurate|negotiable|competitive|depending on experience|tbc|tbd)\b|\bpay\s*(?::|is|"
                            r"will be)\s*(?:competitive|negotiable|commensurate)\b|"
                            r"\bsalaire (?:attractif|comp[ée]titif|selon)\b", re.IGNORECASE),
    "grade": re.compile(r"\b(?:grade|band|level|cat[ée]gorie|groupe)\s*:?\s*[A-Z]{0,3}-?\d|\b(?:P|D|G|GS|NO)-\s?[1-7A-E]\b|"
                        r"\bNO[A-E]\b|\b(?:SB|SC|ICS|LICA|IICA|NPSA|IPSA)-?\d", re.IGNORECASE),
    "contract_type": re.compile(r"\bfixed[- ]term\b|\bpermanent\b|\btemporary\b|\bconsultan(?:cy|t)\b|\bindividual "
                                r"contract|\bcdd\b|\bcdi\b|\bcontrat\b|\bcontract type\b|\btype of contract\b|"
                                r"\bfreelance\b|\binternship\b|\bstage\b|\bvolunteer\b|\bcasual\b|\bservice "
                                r"contract\b|\btemporary appointment\b|\bcontinuing appointment\b", re.IGNORECASE),
    "contract_length": re.compile(r"\b(?:contract|duration|period|assignment|appointment|position|post|dur[ée]e|"
                                  r"contrat|mission|consultancy|engagement)\b[^.\n]{0,40}?\b\d{1,3}\s*(?:-|to|à)?\s*"
                                  r"\d{0,3}\s*(?:months?|mois|years?|ans|weeks?|semaines|working days|days|jours)\b|"
                                  r"\b\d{1,2}[- ](?:month|year|mois)s?\b[^.\n]{0,12}\b(?:fixed[- ]term|contract|"
                                  r"assignment|contrat|cdd|appointment)\b|\b(?:duration|dur[ée]e)\s*(?:of (?:the )?"
                                  r"(?:contract|assignment))?\s*:|\buntil \w+ \d{4}\b|\bend date\b|\bone[- ]year "
                                  r"(?:contract|fixed|appointment)\b", re.IGNORECASE),
    "hours": re.compile(r"\bfull[- ]time\b|\bpart[- ]time\b|\b\d{1,2}(?:\.\d)?\s*(?:hours|hrs|h)\s*(?:per|a|/)\s*"
                        r"week|\btemps (?:plein|partiel)\b|\b\d{2,3}\s?%\s*(?:fte|time|temps|of full[- ]time)\b|"
                        r"\bfte\b|\blevel of effort\b|(?<!outside )(?<!outside of )\bworking hours\b|"
                        r"\bheures (?:par|hebdomadaires)\b", re.IGNORECASE),
    "duty_station": re.compile(r"\bduty station\b|\blocation\s*:|(?<![\w-])based in\b|\blieu d'affectation\b|"
                               r"\blieu de (?:travail|mission)\b|\blieu\s*:|(?<![\w-])based? (?:at|in)\b|\bplace of "
                               r"(?:work|assignment|performance)\b|\boffice location\b|\blocalisation\s*:|"
                               r"\bposte bas[ée]\b|\blocation of (?:the )?(?:post|position|assignment)\b", re.IGNORECASE),
    "remote": re.compile(r"\bremote\b|\bhome[- ]based\b|\bwork from home\b|\bhybrid\b|\bt[ée]l[ée]travail\b|"
                         r"\bflexible (?:location|working)\b|\bteleworking\b", re.IGNORECASE),
    "travel": re.compile(r"\btravel\b[^.\n]{0,40}\d{1,3}\s?%|\d{1,3}\s?%[^.\n]{0,30}\btravel|\bfrequent travel\b|"
                         r"\btravel (?:to|within|required|up to)\b|\bd[ée]placements?\b|\broving\b|\bfield visits\b|"
                         r"\bmissions? (?:fr[ée]quentes|sur le terrain)\b", re.IGNORECASE),
    "reports_to": re.compile(r"\breport(?:s|ing)? (?:directly )?to\b|\bline manager\b|\bsupervisor\b|\bunder the "
                             r"(?:direct |overall )?supervision\b|\bsous la (?:responsabilit[ée]|supervision)\b|"
                             r"\brattach[ée]\b|\bsup[ée]rieur hi[ée]rarchique\b", re.IGNORECASE),
    "direct_reports": re.compile(r"\b(?:supervis(?:e|es|ing)|line[- ]manag(?:e|es|ing)|manag(?:e|es|ing)) (?:a team "
                                 r"of )?\d+|\bdirect reports?\b|\bteam of \d+|\bsupervises?\b|\bencadr(?:e|ement)\b|"
                                 r"\bline management\b", re.IGNORECASE),
    "budget": re.compile(r"\bbudget of\b|\bbudget\b[^.\n]{0,30}(?:\d[\d,.]*\s?(?:million|m\b|k\b)|usd|eur|\$|€|£)|"
                         r"(?:usd|eur|\$|€|£)\s?\d[\d,.]*\s?(?:million|m\b)|\bportfolio of\b", re.IGNORECASE),
    "closing_date": re.compile(r"\bclosing date\b|\bdeadline\b|\bdate limite\b|\bapply by\b|\bapplications? "
                               r"(?:close|must be received|will close)\b|\bclosing\b|\bcl[ôo]ture\b|\bexpiry date\b|"
                               r"\bopen until\b|\bavant le \d", re.IGNORECASE),
    "closing_time": re.compile(r"\b\d{1,2}[:.h]\d{2}\s*(?:am|pm|h)?\s*(?:\(?\s*(?:gmt|utc|cet|cest|eat|wat|cat|"
                               r"bst|est|edt|pst|ist|eet|heure)[^)]{0,12}\)?)|\bmidnight\b[^.\n]{0,20}(?:gmt|utc|cet|"
                               r"eat|time)|\b(?:gmt|utc)\s?[+-]\s?\d", re.IGNORECASE),
    "start_date": re.compile(r"\bstart(?:ing)? date\b|\bdate de (?:d[ée]but|prise de (?:poste|fonction))\b|\bas soon "
                             r"as possible\b|\basap\b|\bd[èe]s que possible\b|\bprise de poste\b|\bto start\b|"
                             r"\bimmediate start\b|\bstart in \w+\b", re.IGNORECASE),
    "languages": re.compile(r"\b(?:fluen(?:cy|t)|proficien(?:cy|t)|written and spoken|working knowledge|"
                            r"ma[îi]trise|bonne connaissance|courant)\b[^.\n]{0,60}\b(?:english|french|arabic|"
                            r"spanish|portuguese|swahili|hausa|amharic|anglais|fran[çc]ais|arabe|espagnol)\b|"
                            r"\b(?:english|french|arabic|spanish|portuguese|swahili|anglais|fran[çc]ais|arabe)\b"
                            r"[^.\n]{0,40}\b(?:required|essential|desirable|an asset|fluency|level|obligatoire|"
                            r"souhait[ée]|indispensable)\b|\blanguages?\s*:\s*(?:english|french|arabic|spanish|"
                            r"portuguese|swahili|anglais|fran[çc]ais|arabe|espagnol)\b", re.IGNORECASE),
    "selection_steps": re.compile(r"\bshortlist|\bwritten (?:test|assessment|exercise)\b|\binterview|\bassessment "
                                  r"(?:centre|center)\b|\btechnical test\b|\bentretien|\btest [ée]crit\b|"
                                  r"\bpresel|\bpr[ée]s[ée]lection\b|\bselection process\b|\brecruitment process\b", re.IGNORECASE),
    "how_to_apply": re.compile(r"\bto apply\b|\bhow to apply\b|\bapply (?:online|via|through|here|now|at)\b|\bsubmit "
                               r"(?:your|a|an)\b|\bsend (?:your|a)\b|\bpostuler\b|\bcandidature\b|\bapplication "
                               r"(?:form|portal|link)\b|\bclick (?:here|on)\b|\bcv\b|\bcover(?:ing)? letter\b|"
                               r"\blettre de motivation\b", re.IGNORECASE),
    "no_fee_notice": re.compile(r"(?:not|never) (?:charge|request|ask for|require)[^.\n]{0,40}(?:fee|payment|money)|"
                                r"\bno fees?\b|\bfree of charge\b|\bfraud(?:ulent)?\b|\bscam\b|\baucun frais\b|"
                                r"\bne (?:demande|facture) (?:aucun|jamais)\b", re.IGNORECASE),
    "safeguarding_checks": re.compile(r"\bsafeguarding\b|\bbackground (?:check|screening)|\breference checks?\b|"
                                      r"\bcriminal record|\bdbs\b|\bpolice clearance\b|\bvetting\b|\bpsea\b|"
                                      r"\bmisconduct disclosure\b|\bv[ée]rification des r[ée]f[ée]rences\b|"
                                      r"\bcasier judiciaire\b", re.IGNORECASE),
    "accompanied": re.compile(r"\bnon[- ]family\b|\bfamily duty station\b|\baccompanied\b|\bunaccompanied\b|"
                              r"\bnon accompagn[ée]\b|\bfamily posting\b", re.IGNORECASE),
    "hardship_rr": re.compile(r"\bhardship\b|\br\s?&\s?r\b|\brest and recuperation\b|\brepos et r[ée]cup[ée]ration\b|"
                              r"\bdanger pay\b|\bsecurity (?:phase|level)\b", re.IGNORECASE),
    "housing": re.compile(r"\baccommodation (?:is |will be )?provided\b|\bhousing\b|\bguesthouse\b|\bshared "
                          r"accommodation\b|\blogement\b|\bh[ée]bergement\b|\bcompound\b", re.IGNORECASE),
    "number_of_posts": re.compile(r"\bnumber of (?:posts|positions|vacancies)\b|\b\d+ (?:posts|positions)\b|"
                                  r"\bnombre de postes\b|\bvacancies:\s*\d", re.IGNORECASE),
    "funding_status": re.compile(r"\bsubject to (?:funding|donor approval|the availability)|\bcontingent (?:up)?on "
                                 r"funding\b|\bpending funding\b|\bsous r[ée]serve de financement\b", re.IGNORECASE),
    "equal_opportunity": re.compile(r"\bequal opportunit|\bequal employment\b|\bdiversity\b|\bwithout regard to\b|"
                                    r"\bdoes not discriminate\b|\bnon-?discriminat|\b[ée]galit[ée] des chances\b|"
                                    r"\bdiversit[ée]\b|\binclusive (?:employer|workplace)\b", re.IGNORECASE),
    "adjustments": re.compile(r"\breasonable (?:adjustments?|accommodations?)\b|\baccess needs\b|\bdisability "
                              r"confident\b|\bam[ée]nagements? raisonnables?\b", re.IGNORECASE),
    "reference_number": re.compile(r"\b(?:reference|ref\.?|vacancy|requisition|job|req)\s*(?:no\.?|number|id|#|code)"
                                   r"\s*:?\s*[A-Z0-9][A-Z0-9/_.-]{2,}|\br[ée]f[ée]rence\s*:", re.IGNORECASE),
}
def facts_of(text: str) -> set[str]:
    """The facts an advert gives, by FACTS, each match checked: a duration followed by "experience"
    is years asked, not the contract's length."""
    found = set()
    for kind, pattern in FACTS.items():
        for m in pattern.finditer(text):
            if kind == "contract_length" and re.match(r"[ \t]*(?:of[ \t]+)?(?:[\w-]+[ \t]+){0,3}?exp[ée]rience",
                                                      text[m.end():m.end() + 60], re.IGNORECASE):
                continue
            found.add(kind)
            break
    return found


DECISION_FACTS = ["pay", "contract_type", "contract_length", "hours", "duty_station", "travel", "closing_date",
                  "closing_time", "start_date", "selection_steps", "how_to_apply", "languages"]
FIELD_FACTS = ["accompanied", "hardship_rr", "housing"]
OPTIONAL_FACTS = {"travel", "hours"}

STANDARDS: dict[str, re.Pattern] = {
    "Sphere": re.compile(r"\bsphere\b(?: standards| handbook| minimum)?", re.IGNORECASE),
    "CHS": re.compile(r"\bcore humanitarian standard\b|\bCHS\b"),
    "CPMS": re.compile(r"\bCPMS\b|child protection minimum standards", re.IGNORECASE),
    "INEE": re.compile(r"\bINEE\b"),
    "IASC": re.compile(r"\bIASC\b"),
    "LEGS/MERS/MISMA": re.compile(r"\bLEGS\b|\bMERS\b|\bMISMA\b"),
    "Humanitarian principles": re.compile(r"humanitarian principles|principes humanitaires", re.IGNORECASE),
    "Do No Harm": re.compile(r"\bdo no harm\b", re.IGNORECASE),
    "PSEA": re.compile(r"\bPSEA\b|sexual exploitation and abuse", re.IGNORECASE),
    "Kobo/ODK": re.compile(r"\bkobo(?:toolbox| collect)?\b|\bODK\b|open data kit", re.IGNORECASE),
    "CommCare": re.compile(r"\bcommcare\b", re.IGNORECASE),
    "DHIS2": re.compile(r"\bDHIS ?2\b", re.IGNORECASE),
    "ActivityInfo": re.compile(r"\bactivityinfo\b", re.IGNORECASE),
    "SPSS/Stata/R": re.compile(r"\bSPSS\b|\bstata\b|\bR studio\b|\bRStudio\b", re.IGNORECASE),
    "Power BI/Tableau": re.compile(r"\bpower ?bi\b|\btableau\b", re.IGNORECASE),
    "NVivo": re.compile(r"\bnvivo\b", re.IGNORECASE),
    "GIS": re.compile(r"\bArcGIS\b|\bQGIS\b|\bGIS\b"),
    "Excel": re.compile(r"\bexcel\b", re.IGNORECASE),
    "SAP/Oracle/Dynamics": re.compile(r"\bSAP\b|\boracle\b|\bdynamics ?(?:365|nav)\b|\bnavision\b", re.IGNORECASE),
    "Sage/QuickBooks/Xero": re.compile(r"\bsage\b(?! advice)|\bquickbooks\b|\bxero\b|\btally\b", re.IGNORECASE),
    "Salesforce/Raiser's Edge": re.compile(r"\bsalesforce\b|\braiser'?s edge\b", re.IGNORECASE),
    "IFRS/IPSAS/GAAP": re.compile(r"\bIFRS\b|\bIPSAS\b|\bGAAP\b"),
    "ACCA/CIMA/CPA": re.compile(r"\bACCA\b|\bCIMA\b|\bCPA\b|\bchartered accountant\b", re.IGNORECASE),
    "CIPS": re.compile(r"\bCIPS\b"),
    "CIPD": re.compile(r"\bCIPD\b"),
    "PRINCE2/PMP/PMD Pro": re.compile(r"\bPRINCE ?2\b|\bPMP\b|\bPMD ?Pro\b|\bMEAL ?DPro\b", re.IGNORECASE),
    "USAID rules": re.compile(r"\bUSAID\b|\b2 CFR\b|\bADS\b"),
    "EU/ECHO rules": re.compile(r"\bECHO\b|\bEuropeAid\b|\bPRAG\b|\bDG ?INTPA\b|\bEuropean Union\b|\bEU funding\b"),
    "FCDO rules": re.compile(r"\bFCDO\b|\bDFID\b"),
    "UN agencies' rules": re.compile(r"\bUNHCR\b|\bUNICEF\b|\bWFP\b|\bOCHA\b|\bpooled fund", re.IGNORECASE),
    "Global Fund": re.compile(r"\bglobal fund\b", re.IGNORECASE),
    "HACCP/WHO": re.compile(r"\bHACCP\b|\bWHO guidelines\b"),
    "CMAM/IYCF": re.compile(r"\bCMAM\b|\bIYCF\b"),
    "Cash (CALP)": re.compile(r"\bCALP\b|\bcash and voucher assistance\b|\bCVA\b"),
    "CCCM/Shelter cluster": re.compile(r"\bCCCM\b|\bshelter cluster\b", re.IGNORECASE),
    "Cluster system": re.compile(r"\bcluster (?:system|coordination|approach)\b", re.IGNORECASE),
    "GDPR": re.compile(r"\bGDPR\b|\bRGPD\b"),
    "ESF/IFC PS": re.compile(r"\benvironmental and social (?:framework|standards)\b|\bIFC performance standards\b|"
                             r"\bESS\d\b|\bESF\b", re.IGNORECASE),
}

# Restrictions feed the fairness check, so each rule needs the applicant as its subject; inclusion
# statements, the "(H/F)" mark and right-to-work statements are never restrictions (employer-side
# plan, section 20.2).
APPLICANT = r"(?:candidates?|applicants?|you|the (?:successful )?(?:candidate|applicant|post ?holder|incumbent))"
RESTRICTIONS: dict[str, re.Pattern] = {
    "sex": re.compile(r"\b(?:female|male|women|men)\s+(?:candidates?|applicants?)\s+only\b|\bonly\s+(?:female|male|women|"
                      r"men)\s+(?:candidates?|applicants?|may apply|need apply|should apply|are eligible)\b|"
                      r"\b(?:position|post|vacancy|role|job|opportunity|applications?)\b[^.\n]{0,30}\bfor (?:women|men|"
                      r"females|males) only\b|\b" + APPLICANT +
                      r"\s+(?:must|should) be (?:a )?(?:female|male|woman|man)\b|\bopen only to (?:female|male|women|"
                      r"men)\b|\bopen to (?:female|male|women|men)(?: candidates| applicants)? only\b|\bposte "
                      r"r[ée]serv[ée] aux (?:femmes|hommes)\b|\buniquement (?:aux|des) (?:candidates|femmes|hommes)\b|"
                      r"\bcandidatures? f[ée]minines? uniquement\b", re.IGNORECASE),
    "age": re.compile(r"\b" + APPLICANT + r"\b[^.\n]{0,40}?\b(?:aged?|between the ages? of|not (?:older|more) than|under|"
                      r"below|must not (?:be older than|exceed))\s*(?:between\s+)?\d{2}\s*(?:(?:-|–|to|and)\s*\d{2}\s*)?"
                      r"(?:years|yrs)\b|"
                      r"\b(?:upper )?(?:age limit|maximum age)\s*(?:of|:|is)?\s*\d{2}\b|\bbetween\s+\d{2}\s*(?:and|-|–|to)\s*"
                      r"\d{2}\s*years?\s+(?:old|of age)\b|\b\d{2}\s*years?\s*(?:old\s*)?or\s*(?:younger|less|under|below)\b|"
                      r"(?m:^\s*age\s*:\s*\d{2}\s*(?:-|–|to)\s*\d{2}\b)|\bcandidat(?:e|s|es)?\b[^.\n]{0,40}?"
                      r"\b[âa]g[ée]e?s? de (?:moins de|plus de|au plus|entre) \d{2}\b|\b[âa]ge (?:maximum|limite)\s*:?\s*"
                      r"\d{2}\s*ans\b", re.IGNORECASE),
    "religion": re.compile(r"\bmust be (?:a )?(?:practising|committed|born-again|devout)\s+(?:christian|muslim|"
                           r"catholic)\b|\b(?:christian|muslim|catholic) (?:faith|believer) (?:is )?(?:required|"
                           r"essential)\b|\bpersonal (?:christian )?faith (?:is )?required\b|\bactive church member\b",
                           re.IGNORECASE),
    "marital_family": re.compile(r"\b" + APPLICANT + r"\b[^.\n]{0,30}?\b(?:must|should) be (?:single|unmarried|married)\b|"
                                 r"\b(?:single|unmarried|married) (?:candidates|applicants)\b|\b(?:single|unmarried|"
                                 r"married) (?:candidate|applicant)s? only\b|\bc[ée]libataires? uniquement\b",
                                 re.IGNORECASE),
    "nationality": re.compile(r"\b(?:nationals?|citizens?) (?:of [a-z]+(?: [a-z]+)? )?only\b|\bonly (?:open to )?(?:[a-z]+ )?"
                              r"(?:nationals|citizens)\b|\b" + APPLICANT + r" must be (?:an? )?(?:[a-z]+ )?(?:national|"
                              r"citizen)s?\b|\bopen (?:only )?to (?:[a-z]+ )?nationals(?: only)?\b|\blocal candidates "
                              r"only\b|\bressortissants? [^.\n]{0,30}uniquement\b|\bnationalit[ée] [^.\n]{0,20}"
                              r"(?:exig[ée]e|obligatoire)\b|\bnon-?nationals? only\b", re.IGNORECASE),
    # UN-style national posts are a case of their own (section 20.2), recorded apart from nationality.
    "national_post": re.compile(r"(?i:\bnational (?:position|post|officer|professional officer|staff (?:position|post))\b|"
                                r"\bposte national\b)|\bNO-?[A-E]\b"),
    "disability": re.compile(r"\bable[- ]bodied\b", re.IGNORECASE),
    "photo_appearance": re.compile(r"(?<!not )(?<!n't )(?<!never )\b(?:attach|include|send|submit|enclose) (?:a |your )?"
                                   r"(?:recent )?(?:passport[- ]size )?(?:photo|photograph|picture)\b|\b" + APPLICANT +
                                   r"\b[^.\n]{0,20}\b(?:be|look) presentable\b|\bpresentable (?:appearance|candidates?|"
                                   r"applicants?)\b|\bgood appearance\b|\b(?:minimum height|height requirement)\b|\b" +
                                   APPLICANT + r"\b[^.\n]{0,30}\b(?:must|should) (?:be|have)\b[^.\n]{0,20}(?<!at )"
                                   r"\bheight\b(?!s)|"
                                   r"\bphoto (?:d'identit[ée]|r[ée]cente)\b", re.IGNORECASE),
}
# A match about the people an organisation serves, not the applicant, is not a restriction.
SERVED = re.compile(r"\b(?:children|child|youth|young people|girls?|boys?|women|men|adolescents?|beneficiar\w*|pupils?|"
                    r"students?|infants?|participants?|survivors?|patients?|learners?|enfants|jeunes|filles|femmes)\b",
                    re.IGNORECASE)
NOT_NATIONALITY = re.compile(r"\ball nationals\b|\bnationals? and non-?nationals?\b|\bnon-?nationals? and nationals?\b|"
                             r"\bregardless of (?:their )?nationality\b", re.IGNORECASE)

def restrictions_of(text: str) -> set[str]:
    """The explicit restrictions an advert states (employer-side plan, section 20.2), each match checked
    against its surroundings: an age about the people served, "open to all nationals", or a service
    "for women only" is not a restriction on who may apply."""
    found = set()
    for kind, pattern in RESTRICTIONS.items():
        for m in pattern.finditer(text):
            before = text[max(0, m.start() - 40):m.start()]
            own = re.sub(r"\([^)]*\)", " ", m.group(0))      # "Applicants (youth) must be aged …" is about applicants
            heading = re.match(r"\s*age\s*:", m.group(0), re.IGNORECASE)
            if kind == "age" and not heading and (SERVED.search(own) or (
                    SERVED.search(before) and not re.search(APPLICANT, own, re.IGNORECASE))):
                continue
            start = max(text.rfind(c, 0, m.start()) for c in ".!?\n") + 1
            ends = [i for i in (text.find(c, m.end()) for c in ".!?\n") if i >= 0]
            sentence = text[start:min(ends) if ends else len(text)]
            if kind == "nationality" and NOT_NATIONALITY.search(sentence):
                continue
            found.add(kind)
            break
    return found
FAIRNESS_CATEGORIES = [k for k in RESTRICTIONS if k != "national_post"]
INCLUSION: dict[str, re.Pattern] = {
    "women_encouraged": re.compile(r"\b(?:women|female (?:candidates|applicants))[^.\n]{0,30}(?:strongly )?encouraged\b|"
                                   r"\bencourage[sd]? (?:applications from |)(?:women|female)\b|\bcandidatures? "
                                   r"f[ée]minines? (?:sont )?(?:vivement )?encourag[ée]es\b", re.IGNORECASE),
    "both_sexes_mark": re.compile(r"\((?:h\s*/\s*f|f\s*/\s*h|m\s*/\s*f|f\s*/\s*m|m\s*/\s*w\s*/\s*d|m\s*/\s*f\s*/\s*d|"
                                  r"h\s*/\s*f\s*/\s*x)\)|"
                                  r"\b(?:h/f|f/h)\b", re.IGNORECASE),
    "disability_encouraged": re.compile(r"\b(?:persons?|people|candidates?|applicants?) with disabilit(?:y|ies)[^.\n]"
                                        r"{0,40}encouraged\b|\bdisability confident\b|\bguaranteed interview\b|"
                                        r"\bpersonnes (?:en situation de|vivant avec un) handicap\b", re.IGNORECASE),
    "underrepresented_encouraged": re.compile(r"\bunder-?represented\b|\bminorit(?:y|ies)[^.\n]{0,40}encouraged\b|"
                                              r"\bfrom all backgrounds\b|\bdiverse backgrounds\b|\bglobal south\b"
                                              r"[^.\n]{0,40}encouraged\b", re.IGNORECASE),
    "equal_opportunity": FACTS["equal_opportunity"],
    "adjustments_offered": FACTS["adjustments"],
}

NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
                "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "un": 1, "deux": 2, "trois": 3, "quatre": 4,
                "cinq": 5, "sept": 7, "huit": 8, "neuf": 9, "dix": 10, "douze": 12, "quinze": 15}
NUM = r"(\d{1,2}|" + "|".join(NUMBER_WORDS) + r")"
YEARS_EN = re.compile(NUM + r"\s*(?:\(\s*\d{1,2}\s*\)\s*)?(?:\+|or more|plus)?\s*(?:full\s+)?years?\b"
                      r"(?:'|’)?[^.;\n]{0,80}?\bexperience|\bexperience\b[^.;\n]{0,40}?\b(?:of\s+)?(?:at least|minimum of|"
                      r"minimum)?\s*" + NUM + r"\s*\+?\s*years?", re.IGNORECASE)
YEARS_FR = re.compile(NUM + r"\s*(?:\(\s*\d{1,2}\s*\)\s*)?\s*(?:ans|ann[ée]es)\b[^.;\n]{0,40}?exp[ée]rience|"
                      r"exp[ée]rience[^.;\n]{0,40}?(?:d'au moins|minimum de|de|d')\s*" + NUM + r"\s*(?:ans|ann[ée]es)", re.IGNORECASE)
MASTER = re.compile(r"\bmaster'?s\b|\bmasters? (?:degree|of|in|en)\b|\badvanced (?:university )?degree\b|\bpost-?graduate "
                    r"(?:degree|diploma|qualification)\b|\bm\.sc\b|\bmsc\b|\bm\.a\.|\bma (?:in|degree)\b|\bmba\b|\bmph\b|"
                    r"\bma[îi]trise (?:en|universitaire)\b|\bdipl[ôo]me de ma[îi]trise\b|\bbac ?\+ ?5\b|"
                    r"\bdipl[ôo]me (?:universitaire )?sup[ée]rieur\b", re.IGNORECASE)
BACHELOR = re.compile(r"\bbachelor'?s?\b|\bfirst[- ]level (?:university )?degree\b|\bundergraduate degree\b|\bb\.sc\b|"
                      r"\bbsc\b|\bb\.a\.|\bba (?:in|degree)\b|\blicence (?:en|in|universitaire|professionnelle)\b|"
                      r"\blicence de (?!conduire)|"
                      r"\bbac ?\+ ?[34]\b|\buniversity degree\b|\b(?:a|relevant|academic) degree in\b|\bhnd\b",
                      re.IGNORECASE)
YEAR_RANGE = re.compile(NUM + r"\s*(?:\(\s*\d{1,2}\s*\)\s*)?(?:-|–|to|à|a)\s*" + NUM +
                        r"\s*(?:\(\s*\d{1,2}\s*\)\s*)?(?=\s*(?:\+\s*)?(?:years?|ans|ann[ée]es)\b)", re.IGNORECASE)
NOT_EXPERIENCE = re.compile(r"(?:under|below|aged?|children|age of|moins de|[âa]g[ée]e?s? de)\s*$", re.IGNORECASE)
YEARS_AGO = re.compile(r"\s*(?:\(\s*\d{1,2}\s*\)\s*)?(?:\+\s*)?(?:years?|ans)\s+(?:ago|old)\b", re.IGNORECASE)
ADDITIONAL_YEARS = re.compile(r"\b(?:first[- ]level|bachelor'?s?)\b[^.]{0,200}?\b" + NUM + r"\s*(?:\(\s*\d{1,2}\s*\)\s*)?"
                              r"additional years", re.IGNORECASE)
PHD = re.compile(r"\bph\.?d\b|\bdoctora(?:te|l)\b|\bdoctorat\b", re.IGNORECASE)
SECONDARY = re.compile(r"\bdiploma\b|\bcertificate\b|\bhigh school\b|\bsecondary (?:school|education)\b|\bbaccalaur[ée]at\b|"
                       r"\bo-?level|\ba-?level|\bwaec\b|\bkcse\b|\bssce\b", re.IGNORECASE)


SPECIFICS = {
    "number": re.compile(r"\b\d[\d,.]*\s*(?:%|percent|people|staff|sites?|vehicles?|households|beneficiaries|"
                         r"partners|projects|million|m\b|k\b|days?|weeks?|months?)?|\b(?:two|three|four|five|six|"
                         r"seven|eight|nine|ten|twelve|twenty|hundred)\b", re.IGNORECASE),
    "standard_or_tool": re.compile("|".join(p.pattern for p in STANDARDS.values()), re.IGNORECASE),
    "frequency": re.compile(r"\b(?:daily|weekly|monthly|quarterly|annual(?:ly)?|bi-?weekly|each (?:week|month|"
                            r"quarter)|every (?:week|month|quarter)|hebdomadaire|mensuel(?:le)?|trimestriel(?:le)?)\b",
                            re.IGNORECASE),
    "counterpart": re.compile(r"\b(?:government|ministry|ministries|donors?|partners?|clusters?|communit(?:y|ies)|"
                              r"local authorities|county|district|headquarters|regional office|suppliers?|"
                              r"minist[èe]re|bailleurs?|partenaires?|autorit[ée]s)\b", re.IGNORECASE),
    "deadline_or_output": re.compile(r"\b(?:report|plan|budget|strategy|proposal|assessment|database|dashboard|"
                                     r"training|guidelines?|rapport|plan d'action|termes de r[ée]f[ée]rence)s?\b",
                                     re.IGNORECASE),
}


def specificity(line: str) -> tuple[int, list[str]]:
    """0 to 3 for one duty line, by the kinds of specifics it carries (section 8: numbers, named
    standards or tools, frequency, counterparts, outputs): none 0, one 1, two 2, three or more 3."""
    kinds = [k for k, p in SPECIFICS.items() if p.search(line)]
    return min(len(kinds), 3), kinds


def duty_lines(ad: dict) -> list[str]:
    """The lines of an advert's responsibilities sections, 5 to 60 words each."""
    out = []
    for s in sections_of(ad["lines"]):
        if s["type"] in ("responsibilities", "deliverables"):
            out += [t for t in s["lines"] if 5 <= words_of(t) <= 60]
    return out


def _num(s: str) -> int:
    return int(s) if s.isdigit() else NUMBER_WORDS.get(s.lower(), 0)


def years_asked(text: str) -> tuple[str, str]:
    """(minimum years, the alternative with a lower degree) asked; the UN's 'X years with a master's
    or Y with a bachelor's' read as both."""
    text = YEAR_RANGE.sub(lambda m: m.group(1), text)        # a range counts from its low end

    def numbers(chunk: str) -> list[int]:
        out = []
        for pattern in (YEARS_EN, YEARS_FR):
            pos = 0
            while m := pattern.search(chunk, pos):
                idx = next((i for i in range(1, len(m.groups()) + 1) if m.group(i)), 0)
                if not idx:
                    break
                at, end = m.start(idx), m.end(idx)
                pos = end            # the next search starts after this number, so none is swallowed
                if NOT_EXPERIENCE.search(chunk[max(0, at - 15):at]) or YEARS_AGO.match(chunk, end):
                    continue
                n = _num(m.group(idx))
                if 0 < n <= 30:
                    out.append(n)
        return out

    found = numbers(text)
    if not found:
        return "", ""
    for sent in re.split(r"(?<=\.)\s+|\n", text):
        if MASTER.search(sent) and BACHELOR.search(sent):
            nums = numbers(sent)
            if len(set(nums)) >= 2:
                return str(min(nums)), str(max(nums))
    low = min(found)
    m = ADDITIONAL_YEARS.search(text)
    return str(low), (str(low + _num(m.group(1))) if m else "")


def degree_asked(text: str) -> str:
    for name, pattern in (("phd", PHD), ("master", MASTER), ("bachelor", BACHELOR), ("secondary", SECONDARY)):
        if pattern.search(text):
            return name
    return ""


STOPWORDS = {
    "en": {"the", "and", "of", "to", "in", "for", "with", "on", "is", "are", "be", "will", "a", "an", "as", "by", "this", "that", "or", "from", "at", "you", "your", "we", "our"},
    "fr": {"le", "la", "les", "des", "et", "de", "du", "en", "pour", "avec", "sur", "est", "sont", "un", "une", "au", "aux", "par", "dans", "vous", "votre", "nous", "notre"},
    "es": {"el", "la", "los", "las", "y", "de", "del", "en", "para", "con", "por", "una", "un", "es", "son", "su", "sus", "que", "como", "al"},
    "de": {"der", "die", "das", "und", "mit", "für", "von", "zu", "ist", "sind", "ein", "eine", "auf", "im", "den", "dem", "wir", "sie"},
    "nl": {"de", "het", "een", "en", "van", "voor", "met", "op", "is", "zijn", "je", "jouw", "wij", "ons", "te", "bij"},
    "pt": {"o", "os", "as", "e", "de", "do", "da", "dos", "das", "em", "para", "com", "por", "uma", "um", "é", "são"},
}


def language_of(text: str) -> str:
    words = re.findall(r"[a-zàâçéèêëîïôûùüÿñæœäöß]+", text.lower())[:3000]
    scores = {k: sum(1 for w in words if w in v) for k, v in STOPWORDS.items()}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] >= 5 else "unknown"


def sentences_of(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?;])\s+|\n", text) if words_of(s) >= 3]


LENGTH_BANDS = {"national_ngo_south": (200, 600, "whole"), "ingo": (650, 1150, "role"),
                "un_agency": (700, 1300, "role"), "un_secretariat": (700, 1300, "role")}


def score_decision_facts(given: set[str]) -> int:
    """Section 5's decision facts (field conditions belong to field realism, which is coded, not
    scored here): 3 for every applicable fact with pay, 0 under a third without pay; pay counts
    double. Travel and hours apply only "where they vary", which a script cannot tell, so they count
    when stated and are not required. The anchors for 1 and 2 (a third, two thirds) are provisional
    until Phase 0's guide fixes them."""
    facts = [f for f in DECISION_FACTS if f not in OPTIONAL_FACTS or f in given]
    units = len(facts) + 1
    have = sum(1 for f in facts if f in given) + ("pay" in given)
    share = have / units
    if share >= 1 and "pay" in given:
        return 3
    if share >= 2 / 3:
        return 2
    if share >= 1 / 3 or "pay" in given:
        return 1
    return 0


def score_readability(median_sentence: float) -> int:
    if 13 <= median_sentence <= 20:
        return 3
    if 10 <= median_sentence <= 25:
        return 2
    if 7 <= median_sentence <= 30:
        return 1
    return 0


def score_length(org_type: str, words_total: int, words_role: int, standard_share: float) -> int | None:
    band = LENGTH_BANDS.get(org_type)
    if not band:
        return None                              # the band comes from Phase 2's own counts (section 5)
    low, high, basis = band
    n = words_total if basis == "whole" else words_role
    if standard_share > 0.5:
        return 0
    # The bands are ceilings, never targets (section 5): at or under the ceiling scores 3 unless the
    # advert is under half the band's lower end; over the ceiling loses points.
    if n <= high:
        return 3 if n >= low * 0.5 else 2
    if n <= high * 1.25:
        return 2
    if n <= high * 1.5:
        return 1
    return 0


def score_findability(role: roles.Role, title: str, google: dict) -> int:
    clear = bool(role.function) and bool(role.level) and not re.search(r"[!*#@]", title) and not \
        (sum(c.isupper() for c in title) > 0.6 * max(sum(c.isalpha() for c in title), 1) and len(title) > 12)
    n = sum(1 for v in google.values() if v)
    if clear and n >= 7:
        return 3
    if role.function and n >= 5:
        return 2
    if role.function or n >= 4:
        return 1
    return 0


WEIGHTS = {"decision_facts": 20, "readability": 10, "length": 5, "findability": 5}


def standard_sentences(adverts: list[dict]) -> dict[str, set[str]]:
    """Per organisation, the sentences of 8 words or more that recur in two or more of its adverts."""
    seen = defaultdict(Counter)
    for ad in adverts:
        uniq = {norm_sentence(s) for s in sentences_of("\n".join(ln["text"] for ln in ad["lines"])) if words_of(s) >= 8}
        for s in uniq:
            seen[ad["org_id"]][s] += 1
    return {o: {s for s, n in c.items() if n >= 2} for o, c in seen.items()}


KNOWN_STANDARD = re.compile(r"un considerations|does not charge a fee|equal opportunit|zero tolerance|sexual exploitation "
                            r"and abuse|committed to (?:diversity|safeguarding|achieving)|only shortlisted|"
                            r"background checks?|smoke-free|reference checks|without regard to|personal data|"
                            r"aucun frais|seul(?:e)?s les candidat|tol[ée]rance z[ée]ro", re.IGNORECASE)


def norm_sentence(s: str) -> str:
    return re.sub(r"\W+", " ", s.lower()).strip()


CHROME_WORDS = 6


def carries_meaning(line: str) -> bool:
    """A short line the measures read is never site furniture, however often it recurs: a sentence of
    five words or more that carries a known standard text, an inclusion statement, a restriction or a
    fact, or a "label: value" line with a fact. Menu items ("Apply now", "Remote jobs") are neither."""
    if re.match(r"^[^:]{2,40}:\s*\S", line):
        return any(p.search(line) for p in FACTS.values())
    if words_of(line) < 5:
        return False
    return bool(KNOWN_STANDARD.search(line)) or any(p.search(line) for p in FACTS.values()) or \
        any(p.search(line) for p in INCLUSION.values()) or any(p.search(line) for p in RESTRICTIONS.values())


def chrome_lines(adverts: list[dict]) -> dict[str, set[str]]:
    """Per organisation with three or more pages read as HTML, the short lines (at most CHROME_WORDS
    words, and not a recognised section heading) on at least 60% of them: menus, buttons and other
    site furniture the page structure did not show. An organisation's standard sentences are longer
    and stay, so they are measured as standard text."""
    by_org = defaultdict(list)
    for ad in adverts:
        if ad["method"] == "html":
            by_org[ad["org_id"]].append({ln["text"] for ln in ad["lines"] if words_of(ln["text"]) <= CHROME_WORDS
                                         and not (ln["heading"] and section_type(ln["text"]) != "unclassified")
                                         and not carries_meaning(ln["text"])})
    out = {}
    for o, pages in by_org.items():
        if len(pages) >= 3:
            c = Counter(t for p in pages for t in p)
            out[o] = {t for t, n in c.items() if n >= 0.6 * len(pages)}
    return out


def shingles(text: str, k: int = 5) -> set[int]:
    w = re.findall(r"\w+", text.lower())
    return {zlib.crc32(" ".join(w[i:i + k]).encode("utf-8")) for i in range(max(len(w) - k + 1, 1))}


def comparable_title(title: str, source: str = "board") -> str:
    """A title as copies are compared: a board's ' at <employer>' ending dropped (boards only)."""
    t = re.split(r"\s+(?:at|chez)\s+", title or "", maxsplit=1)[0] if source == "board" else (title or "")
    return roles.normalise(t).text


def minhash(sh: set[int], seeds: list[int]) -> list[int]:
    if not sh:
        return [0] * len(seeds)
    return [min(((x * a + b) % 4294967311) for x in sh) for a, b in seeds]


# Which copy of one advert is kept: step F's feed copy first (the AI test set is drawn from them),
# then an employer's archived page, a documented feed, and a board's copy last.
SOURCE_RANK = {"step-f-feed": 0, "archive": 1, "feed": 2, "board": 3}


def near_duplicates(adverts: list[dict], threshold: float = 0.8,
                    keep: set[str] | frozenset = frozenset()) -> dict[str, str]:
    """advert id -> the id it duplicates (the same advert in another copy: an archived copy, a board's
    copy or a feed's), by 5-word shingles; an employer's own copy is kept over a board's."""
    rng = random.Random(SEED)
    seeds = [(rng.randrange(1, 4294967311), rng.randrange(0, 4294967311)) for _ in range(64)]
    sigs, sh = {}, {}
    for ad in adverts:
        s = shingles(" ".join(ln["text"] for ln in ad["lines"]))
        sh[ad["id"]], sigs[ad["id"]] = s, minhash(s, seeds)
    buckets = defaultdict(list)
    for aid, sig in sigs.items():
        for band in range(16):
            buckets[(band, tuple(sig[band * 4:(band + 1) * 4]))].append(aid)
    # Held-out adverts (`keep`) are always the copy kept, so no copy of one enters the evidence.
    order = {ad["id"]: (ad["id"] not in keep, SOURCE_RANK.get(ad["source"], 3), ad["id"]) for ad in adverts}
    titles = {ad["id"]: comparable_title(ad.get("title", ""), ad["source"]) for ad in adverts}
    dup = {}
    for ids in buckets.values():
        if len(ids) < 2:
            continue
        ids = sorted(set(ids), key=lambda i: order[i])
        for i, a in enumerate(ids):
            if a in dup:
                continue
            for b in ids[i + 1:]:
                if b in dup:
                    continue
                inter = len(sh[a] & sh[b])
                # Two different jobs of one organisation can share most of their text (its standard
                # blocks), so differing titles need a near-identical text to count as one advert.
                same_title = not titles[a] or not titles[b] or titles[a] == titles[b]
                if inter and inter / len(sh[a] | sh[b]) >= (threshold if same_title else 0.95):
                    dup[b] = a
    return dup


def ai_test_set(adverts: list[dict], saved: dict | None = None) -> tuple[list[str], set[str]]:
    """Section 10's draw, by fixed seed: Phase 0's pilot of 20 (at most 10 from any organisation) from
    step F's feed adverts, then the test set from the rest (at most 10 IMPACT Initiatives, 10 World
    Relief, 5 CDP, 1 Technopolis), then widened toward 30 from the archived adverts, at most 2 per
    organisation. Once drawn it is frozen: a saved draw is kept as it is and only topped up toward
    30, so an advert already turned into a brief never enters the evidence. Returns (the pilot's
    ids, the test set's ids); the test set is held out of the evidence, the pilot is not."""
    rng = random.Random(SEED + 10)
    by_id = {a["id"]: a for a in adverts}
    if saved:
        pilot, test = list(saved.get("pilot", [])), list(saved.get("test", []))
    else:
        feeds = sorted([a for a in adverts if a["source"] == "step-f-feed"], key=lambda a: a["id"])
        rng.shuffle(feeds)
        pilot, per = [], Counter()
        for a in feeds:
            if len(pilot) < 20 and per[a["org_id"]] < 10:
                pilot.append(a["id"])
                per[a["org_id"]] += 1
        caps = {"impact": 10, "world relief": 10, "cdp": 5, "technopolis": 1}
        test, per = [], Counter()
        for a in feeds:
            if a["id"] in pilot:
                continue
            name = a.get("org_name", "").lower()
            cap = next((v for k, v in caps.items() if k in name), 0)
            if per[a["org_id"]] < cap:
                test.append(a["id"])
                per[a["org_id"]] += 1
    per = Counter(by_id[i]["org_id"] for i in test if i in by_id and by_id[i]["source"] == "archive")
    archived = sorted([a for a in adverts if a["source"] == "archive" and a["id"] not in test], key=lambda a: a["id"])
    random.Random(SEED + 11 + len(test)).shuffle(archived)
    for a in archived:
        if len(test) >= 30:
            break
        if per[a["org_id"]] < 2:
            test.append(a["id"])
            per[a["org_id"]] += 1
    return pilot, set(test)


def is_advert(ad: dict) -> bool:
    text = " ".join(ln["text"] for ln in ad["lines"])
    if words_of(text) < MIN_ADVERT_WORDS:
        return False
    if ad["source"] in ("feed", "step-f-feed"):
        return True                                 # an item of a job feed is an advert
    signals = sum(1 for k in ("how_to_apply", "closing_date", "contract_type", "reports_to", "duty_station")
                  if FACTS[k].search(text))
    secs = {section_type(ln["text"]) for ln in ad["lines"] if ln["heading"]}
    return signals >= 2 or bool(secs & {"responsibilities", "essential_requirements"})


def board_org(ad: dict, orgs: roles.Organisations, names: dict[str, str]) -> tuple[str, str]:
    """(organisation id, basis) for a board's advert: the employer it names, matched to the survey's
    list by name; otherwise a stable id from the name, never the name itself."""
    emp = re.sub(r"\s+", " ", (ad.get("employer") or "")).strip()
    if not emp:
        slug = re.sub(r"-\d+/?$", "", urlsplit(ad["url"]).path.rstrip("/").split("/")[-1])
        emp = slug.rsplit("-at-", 1)[1].replace("-", " ") if "-at-" in slug else ""
    key = re.sub(r"[^a-z0-9]", "", emp.lower())
    if key and key in names:
        return names[key], "matched by name"
    return ("board-employer:h" + hashlib.sha1(key.encode()).hexdigest()[:10] if key else
            "board-employer:unknown"), "board, employer not in the list"


def measure(_args=None) -> int:
    decisions = _decisions()
    orgs = roles.Organisations.load(decisions=decisions, pools=roles.pools_of())
    title_decisions = roles.decision_map(decisions)
    names = {}
    for oid, r in orgs.rows.items():
        for n in (r.get("name", ""), r.get("acronym", "")):
            k = re.sub(r"[^a-z0-9]", "", n.lower())
            if len(k) >= 4:
                names.setdefault(k, oid)
    adverts, dropped = [], Counter()
    for ad in load_adverts():
        if ad["source"] == "step-f-feed":
            ad["org_id"] = orgs.parent(ad.get("org_hint", ""))
            ad["org_type_basis"] = "rule"
        elif ad["source"] == "board":
            ad["org_id"], ad["org_type_basis"] = board_org(ad, orgs, names)
        elif ad["source"] == "feed" and ad.get("org_site"):
            ad["org_id"] = orgs.of_url("https://" + ad["org_site"] + "/")
            ad["org_type_basis"] = "rule"
        else:
            ad["org_id"] = orgs.of_url(ad["url"]) if not ad["url"].startswith("feed:") else ""
            ad["org_type_basis"] = "rule"
        if ad["source"] == "feed" and not ad["org_id"]:
            ad["org_id"] = "feed:" + ad["system"].lower()
        ad["org_name"] = orgs.rows.get(ad["org_id"], {}).get("name", "")
        if not ad["org_id"]:
            dropped["no organisation"] += 1
            continue
        if roles.un_system(orgs.type_of(ad["org_id"]), urlsplit(ad["url"]).hostname or ""):
            dropped["held: the UN's terms of use (19.11)"] += 1
            continue
        adverts.append(ad)
    std = standard_sentences(adverts)          # before any site furniture is removed
    chrome = chrome_lines(adverts)
    for ad in adverts:
        drop = chrome.get(ad["org_id"], set())
        ad["lines"] = [ln for ln in ad["lines"] if ln["text"] not in drop]
    kept = []
    for ad in adverts:
        if is_advert(ad):
            kept.append(ad)
        else:
            dropped["not an advert (too short or no advert signals)"] += 1
    saved_path = WORK / "ai-test-set.json"
    saved = json.loads(saved_path.read_text(encoding="utf-8")) if saved_path.exists() else None
    dup = near_duplicates(kept, keep=set((saved or {}).get("test", [])))
    kept = [a for a in kept if a["id"] not in dup]
    dropped["near-duplicate of another copy"] += len(dup)
    pilot, held = ai_test_set(kept, saved)
    saved_path.write_text(json.dumps({"pilot": pilot, "test": sorted(held)}), encoding="utf-8")
    # The cap of 30 (French 60) counts evidence only; held-out adverts are kept beside it.
    evidence = [a for a in kept if a["id"] not in held]
    within = {a["page_id"] for a in capped([{"page_id": a["id"], "org_id": a["org_id"], "languages": (
        "fra" if language_of(" ".join(ln["text"] for ln in a["lines"])) == "fr" else "eng")} for a in evidence])}
    dropped["over the cap per organisation"] += sum(1 for a in evidence if a["id"] not in within)
    kept = [a for a in kept if a["id"] in within or a["id"] in held]
    per_org = Counter(a["org_id"] for a in kept)
    rows, sec_rows = [], []
    for ad in sorted(kept, key=lambda a: a["id"]):
        text = "\n".join(ln["text"] for ln in ad["lines"])
        role = roles.classify(ad.get("title", ""), title_decisions)
        secs = sections_of(ad["lines"])
        sents = sentences_of(text)
        org_std = std.get(ad["org_id"], set())
        std_words = sum(words_of(s) for s in sents if norm_sentence(s) in org_std or KNOWN_STANDARD.search(s))
        words_total = words_of(text)
        std_section_words = sum(s["words"] for s in secs if s["type"] in STANDARD_SECTIONS)
        standard_share = min(1.0, max(std_words, std_section_words) / max(words_total, 1))
        words_role = max(0, words_total - max(std_words, std_section_words))
        given = facts_of(text)
        f = ad.get("facts") or {}
        if f.get("pay"):
            given.add("pay")
        if f.get("closing_date"):
            given.add("closing_date")
        if f.get("place"):
            given.add("duty_station")
        if f.get("employment_type"):
            given |= {"contract_type", "hours"}
        missing = [k for k in DECISION_FACTS if k not in given]
        req_text = "\n".join("\n".join(s["lines"]) for s in secs if s["type"] in
                             ("essential_requirements", "desirable_requirements")) or text
        y_min, y_alt = years_asked(req_text)
        lang = language_of(text)
        med = statistics.median([words_of(s) for s in sents]) if sents else 0
        org_type = orgs.type_of(ad["org_id"])
        google = {"title": bool(ad.get("title")), "description": words_total >= MIN_ADVERT_WORDS,
                  "date_posted": bool(f.get("date_posted")), "closing_date": "closing_date" in given,
                  "organisation": True, "place": "duty_station" in given or "remote" in given,
                  "employment_type": "contract_type" in given or "hours" in given, "pay": "pay" in given}
        s_df = score_decision_facts(given)
        s_rd = score_readability(med)
        s_ln = score_length(org_type, words_total, words_role, standard_share)
        s_fd = score_findability(role, ad.get("title", ""), google)
        parts = {"decision_facts": s_df, "readability": s_rd, "length": s_ln, "findability": s_fd}
        points = sum(WEIGHTS[k] * v / 3 for k, v in parts.items() if v is not None)
        possible = sum(WEIGHTS[k] for k, v in parts.items() if v is not None)
        period = ad.get("crawl", "")[8:15] if ad["source"] == "archive" else (ad.get("read_at", "")[:7] or "2026-11")
        rows.append({
            "advert_id": ad["id"], "org_id": ad["org_id"], "org_type": org_type,
            "org_type_basis": ad.get("org_type_basis", "rule"), "source": ad["source"], "batch": ad["batch"],
            "system": ad["system"], "family_id": role.family_id or "unplaced", "function": role.function or "unplaced",
            "sector": role.sector, "level": role.level or "unknown", "grade": role.grade,
            **{c: role.contexts[c] for c in roles.CONTEXT_FIELDS}, "language": lang, "extraction": ad["method"],
            "period": period, "words_total": words_total, "words_role": words_role, "sections": len(secs),
            "standard_share": f"{standard_share:.3f}",
            "standard_basis": "recurring" if per_org[ad["org_id"]] >= 2 else "known texts only (Estimate)",
            "facts_given": ";".join(sorted(given & set(FACTS))), "facts_missing": ";".join(missing),
            "years_min": y_min, "years_alt": y_alt, "degree": degree_asked(req_text),
            "standards": ";".join(sorted(k for k, p in STANDARDS.items() if p.search(text))),
            "restrictions": ";".join(sorted(restrictions_of(text))),
            "inclusion": ";".join(sorted(k for k, p in INCLUSION.items() if p.search(text))),
            "median_sentence": f"{med:.1f}", "score_decision_facts": s_df, "score_readability": s_rd,
            "score_length": "" if s_ln is None else s_ln, "score_findability": s_fd,
            "partial_score": f"{points * 40 / possible:.1f}" if possible else "",
            "held_out": "true" if ad["id"] in held else "false"})
        for i, s in enumerate(secs):
            sec_rows.append({"advert_id": ad["id"], "position": i, "section_type": s["type"], "words": s["words"]})
    write_dicts(ROLES_DIR / "broad-adverts.csv", ADVERT_FIELDS, rows)
    write_dicts(ROLES_DIR / "broad-sections.csv", SECTION_FIELDS, sec_rows)
    local = WORK / "measured.jsonl"
    with local.open("w", encoding="utf-8") as handle:
        for ad in kept:
            handle.write(json.dumps({"id": ad["id"], "org_id": ad["org_id"], "title": ad.get("title", ""),
                                     "url": ad["url"]}, ensure_ascii=False) + "\n")
    print(f"measured: {len(rows)} adverts at {len({r['org_id'] for r in rows})} organisations; held out {len(held)}; "
          f"dropped {dict(dropped)}; by source {dict(Counter(r['source'] for r in rows))}; "
          f"by language {dict(Counter(r['language'] for r in rows))}")
    return 0


def write_dicts(path: Path, fields: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        w = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def _decisions() -> list[dict]:
    p = ROLES_DIR / "role-decisions.csv"
    return read_csv(p) if p.exists() else []


# --- copying and form checks ----------------------------------------------------------------------

STD_QUOTE = re.compile(r"[\"“]([^\"”]{1,200})[\"”]\s*\*\(std\)\*")


def eight_word_runs(text: str) -> set[str]:
    w = re.findall(r"[^\W_]+", text.lower())
    return {" ".join(w[i:i + 8]) for i in range(len(w) - 7)}


def copy_matches(committed: str, saved_runs: set[str]) -> list[str]:
    """The 8-word runs of a committed text that appear in a saved advert; a quote marked *(std)* is
    exempt only when it is under 15 words (section 3)."""
    text = STD_QUOTE.sub(lambda m: " " if words_of(m.group(1)) < 15 else m.group(0), committed)
    return sorted(eight_word_runs(text) & saved_runs)


def copycheck(args) -> int:
    runs = set()
    for ad in load_adverts():
        runs |= eight_word_runs(" ".join(ln["text"] for ln in ad["lines"]))
    bad = 0
    for name in args.files:
        hits = copy_matches(Path(name).read_text(encoding="utf-8"), runs)
        print(f"{name}: {len(hits)} 8-word runs found in saved adverts")
        bad += len(hits)
    return 1 if bad else 0


PHONE_LIKE = re.compile(r"(?<![\w.-])\+?\d[\d ().-]{8,}\d(?![\w.-])")
ALLOWED = {
    "org_type": set(roles.ORG_TYPES), "source": {"archive", "board", "feed", "step-f-feed"},
    "function": set(roles.FUNCTION_IDS) | {"unplaced"}, "sector": set(roles.SECTOR_IDS),
    "level": set(roles.LEVEL_IDS) | {"unknown"}, "language": set(STOPWORDS) | {"unknown"},
    "extraction": {"jsonld", "html", "feed"}, "held_out": {"true", "false"},
    "staff_consultant": {"consultant", "unknown"}, "national_international": {"national", "international", "unknown"},
    "humanitarian_development": {"humanitarian", "development", "unknown"}, "field_hq": {"field", "hq", "unknown"},
    "section_type": set(SECTION_IDS), "degree": {"", "phd", "master", "bachelor", "secondary"},
}
LISTS = {"facts_given": set(FACTS), "facts_missing": set(FACTS), "standards": set(STANDARDS),
         "restrictions": set(RESTRICTIONS), "inclusion": set(INCLUSION)}
FORMS = {   # free-text columns: identifiers and codes only, never words from an advert
    "advert_id": re.compile(r"[0-9a-f]{16}"), "org_id": re.compile(r"[\w.:/-]{1,80}"),
    "system": re.compile(r"[A-Za-z][A-Za-z .()]{0,40}"), "grade": re.compile(r"(?:[A-Z]{1,4}-[0-9A-E]{1,2})?"),
    "period": re.compile(r"(?:\d{4}-\d{2})?"), "batch": re.compile(r"r[1-5]|step-f|earlier"),
    "org_type_basis": re.compile(r"rule|matched by name|board, employer not in the list|decision"),
    "standard_basis": re.compile(r"recurring|known texts only \(Estimate\)"),
}
# Columns of identifiers and numbers: register ids ("irs:521231983") and counts are not phone numbers.
NOT_FREE_TEXT = {"advert_id", "org_id", "snapshot", "words_total", "words_role", "sections", "words", "position", "years_min",
                 "years_alt", "median_sentence", "standard_share", "partial_score", "count", "titles", "organisations",
                 "share_within_type", "weighted_share", "consultant_share", "national_share", "humanitarian_share"}


def check_file(path: Path, fields: list[str]) -> list[str]:
    """Problems with one committed broad file: its columns, allowed values, and no email address,
    phone-like number, job title or address in it."""
    problems = []
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != fields:
            return [f"{path.name}: columns {reader.fieldnames} are not {fields}"]
        for i, row in enumerate(reader, 2):
            for k, v in row.items():
                if EMAIL.search(v or "") or (k not in NOT_FREE_TEXT and PHONE_LIKE.search(v or "")):
                    problems.append(f"{path.name}:{i}: {k} holds an email address or a phone-like number")
                if k in FORMS and not FORMS[k].fullmatch(v or ""):
                    problems.append(f"{path.name}:{i}: {k}={v!r} is not in its form")
                if re.search(r"https?://|www\.", v or ""):
                    problems.append(f"{path.name}:{i}: {k} holds an address")
                if k in ALLOWED and v not in ALLOWED[k]:
                    problems.append(f"{path.name}:{i}: {k}={v!r} is not an allowed value")
                if k in LISTS and v and not set(v.split(";")) <= LISTS[k]:
                    problems.append(f"{path.name}:{i}: {k} holds an unknown item")
                if k in ("words_total", "words_role", "sections", "words", "position") and not (v or "").isdigit():
                    problems.append(f"{path.name}:{i}: {k} is not a count")
    return problems


def check(_args=None, roles_dir: Path = ROLES_DIR) -> int:
    problems = []
    for name, fields in (("broad-adverts.csv", ADVERT_FIELDS), ("broad-sections.csv", SECTION_FIELDS)):
        p = roles_dir / name
        if p.exists():
            problems += check_file(p, fields)
    for name, fields in (("role-counts.csv", roles.COUNT_FIELDS), ("title-variants.csv", roles.VARIANT_FIELDS),
                         ("role-map.csv", roles.MAP_FIELDS)):
        p = roles_dir / name
        if p.exists():
            with p.open(encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                if reader.fieldnames != fields:
                    problems.append(f"{name}: columns {reader.fieldnames} are not {fields}")
                for i, row in enumerate(reader, 2):
                    if any(EMAIL.search(v or "") or re.search(r"https?://|www\.", v or "") or
                           (k not in NOT_FREE_TEXT and PHONE_LIKE.search(v or "")) for k, v in row.items()):
                        problems.append(f"{name}:{i}: an email address, phone-like number or address")
                    if "org_id" in row and not FORMS["org_id"].fullmatch(row["org_id"] or ""):
                        problems.append(f"{name}:{i}: org_id is not in its form")
                    if "snapshot" in row and not re.fullmatch(r"[A-Za-z0-9-]{1,20}", row["snapshot"] or ""):
                        problems.append(f"{name}:{i}: snapshot is not in its form")
                    if name == "title-variants.csv" and int(row["organisations"] or 0) < 2:
                        problems.append(f"{name}:{i}: a title seen at fewer than two organisations")
    for p in problems[:50]:
        print(p)
    print(f"check: {len(problems)} problems")
    return 1 if problems else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--batch", choices=["r1", "r2"], required=True)
    p.set_defaults(func=plan)
    p = sub.add_parser("fetch-archive")
    p.add_argument("--batch", choices=["r1", "r2"], required=True)
    p.add_argument("--cap", type=int, default=0)
    p.set_defaults(func=fetch_archive)
    p = sub.add_parser("fetch-live")
    p.add_argument("--batch", choices=["r3", "r4", "r5"], required=True)
    p.add_argument("--cap", type=int, default=0)
    p.add_argument("--un-terms-decided", action="store_true",
                   help="only once the user has decided that UN pages may be read (19.11)")
    p.set_defaults(func=fetch_live)
    sub.add_parser("extract").set_defaults(func=extract)
    sub.add_parser("measure").set_defaults(func=measure)
    p = sub.add_parser("copycheck")
    p.add_argument("files", nargs="+")
    p.set_defaults(func=copycheck)
    sub.add_parser("check").set_defaults(func=check)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    raise SystemExit(main())
