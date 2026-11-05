"""Employer survey, step E: likely careers pages and recruitment systems (W-31).

Run on the user's machine; CI runs only `build`:

  python tools/survey/careers.py download [wikidata|cluster|systems|sites] [--top N]
  python tools/survey/careers.py extract    # raw downloads -> the small committed extract
  python tools/survey/careers.py build      # committed files -> candidates, review, websites

`download` reads Common Crawl's public index files on data.commoncrawl.org (each crawl's
cluster.idx, then the index blocks it points to, by HTTP Range requests) and Wikidata's query
service, one request at a time, one every 10 seconds for Common Crawl and every 5 for
Wikidata, with an honest identity; every request is logged, errors back off, repeated errors
or two refusals in a row stop the run, a 403 stops it at once, and everything is kept under
tools/survey/raw/ (git-ignored). It is
resumable: what is already downloaded is not fetched again. No employer's website and no
recruitment system's page is contacted (that is step F).

`extract` and `build` use no network. `extract` keeps only careers-like index rows and
recruitment-system accounts whose name could match an organisation, with hosts and paths only
(query strings are dropped). `build` reads the extract, organisations.csv and the decisions in
source-survey/step-e-decisions.csv. The method is in docs/architecture/source-survey.md, step E.
"""
from __future__ import annotations

import argparse
import bisect
import csv
import gzip
import json
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from dedupe import PLATFORM_HOSTS, SHARED_HOSTS, strict_name

HERE = Path(__file__).resolve().parent
SURVEY = HERE.parents[1] / "docs" / "architecture" / "source-survey"
RAW = HERE / "raw" / "commoncrawl"
WD_RAW = HERE / "raw" / "wikidata"
USER_AGENT = "AidJobsSurvey/0.1 (+mailto:aidjobz@gmail.com)"
# Wikimedia's User-Agent policy asks for contact details, "bot" and the library.
WD_USER_AGENT = "AidJobsSurveyBot/0.1 (mailto:aidjobz@gmail.com; employer survey) python-requests"

# The latest crawl only, decided by the user on 5 November 2026 after Common Crawl's data
# server asked us to slow down (CC-MAIN-2026-39 and -34 dropped).
CRAWLS = ["CC-MAIN-2026-43"]
DATA = "https://data.commoncrawl.org/cc-index/collections/{crawl}/indexes/"
SPARQL = "https://query.wikidata.org/sparql"
SCOPE = {"hiring (UNjobs)", "income"}
SEARCH_TOP = 600
UN_FAMILY = "UN Secretariat (careers.un.org)"  # step D: its offices hire through one site
UN_CAREERS = "https://careers.un.org/"

CC_INTERVAL = 10.0       # seconds between Common Crawl requests (the user's decision, 5 Nov 2026)
WD_INTERVAL = 5.0
BACKOFF = (5, 30, 120)
STOP_AFTER = 3          # consecutive failed requests that stop a run
# The user's rule of 5 November 2026: a 403 stops at once; two refusals in a row (the server
# asking to slow down) stop for the day.
REFUSED = (429, 503)
STOP_REFUSALS = 2
FULL_SITE_BLOCKS = 4    # a site in at most this many blocks is read whole, else by careers prefixes
MAX_RANGE_BLOCKS = 30   # blocks joined into one Range request

# The recruitment systems whose accounts can be matched by name: per system, the SURT prefixes
# of its hosts (the reversed host name Common Crawl's index is sorted by).
SYSTEMS = {
    "Workday": ["com,myworkdayjobs,", "com,myworkdaysite,"],
    "Greenhouse": ["io,greenhouse,"],
    "Lever": ["co,lever,"],
    "Ashby": ["com,ashbyhq,"],
    "SmartRecruiters": ["com,smartrecruiters,"],
    "Jobvite": ["com,jobvite,"],
    "iCIMS": ["com,icims,careers-"],
    "BambooHR": ["com,bamboohr,"],
    "Workable": ["com,workable,"],
    "Pinpoint": ["com,pinpointhq,"],
    "Teamtailor": ["com,teamtailor,"],
    "Recruitee": ["com,recruitee,"],
    "Personio": ["de,personio,", "com,personio,"],
    "Avature": ["net,avature,"],
    "Taleo": ["net,taleo,"],
    "Zoho Recruit": ["com,zohorecruit,", "eu,zohorecruit,", "in,zohorecruit,"],
}
# Hosts that identify a recruitment system when an organisation's page redirects to them; more
# than the name-matchable ones above.
SYSTEM_HOSTS = [
    ("Workday", r"myworkdayjobs\.com|myworkdaysite\.com|myworkday\.com"),
    ("Greenhouse", r"greenhouse\.io"), ("Lever", r"lever\.co"), ("Ashby", r"ashbyhq\.com"),
    ("SmartRecruiters", r"smartrecruiters\.com"), ("Jobvite", r"jobvite\.com"),
    ("iCIMS", r"icims\.com"), ("BambooHR", r"bamboohr\.com"), ("Workable", r"workable\.com"),
    ("Pinpoint", r"pinpointhq\.com"), ("Teamtailor", r"teamtailor\.com"),
    ("Recruitee", r"recruitee\.com"), ("Personio", r"personio\.(?:de|com)"),
    ("Avature", r"avature\.net"), ("Taleo", r"taleo\.net"),
    ("Zoho Recruit", r"zohorecruit\.(?:com|eu|in)"),
    ("Oracle Recruiting Cloud", r"[a-z0-9-]+\.fa\.[a-z0-9-]+\.oraclecloud\.com"),
    ("SuccessFactors", r"successfactors\.(?:com|eu)|sapsf\.(?:com|eu)"),
    ("UKG UltiPro", r"ultipro\.com|ukg\.net"), ("Cornerstone", r"csod\.com"),
    ("PageUp", r"pageuppeople\.com"), ("JazzHR", r"applytojob\.com"), ("Breezy", r"breezy\.hr"),
    ("Paylocity", r"paylocity\.com"), ("Dayforce", r"dayforcehcm\.com"),
    ("Webcruiter", r"webcruiter\.(?:no|com)"), ("Talentsoft", r"talent-soft\.com"),
    ("Oleeo", r"tal\.net"), ("Phenom", r"phenompeople\.com"),
    ("UN Inspira (careers.un.org)", r"careers\.un\.org"),
]
SYSTEM_HOST_RE = [(name, re.compile(rf"(?:^|\.)(?:{pattern})$")) for name, pattern in SYSTEM_HOSTS]
# Vendor subdomains that are not an employer's account.
VENDOR_HOSTS = {
    "www", "app", "api", "apply", "jobs", "job-boards", "boards", "boards-api", "careers",
    "career", "help", "support", "blog", "docs", "status", "developers", "developer", "cdn",
    "static", "assets", "media", "marketing", "info", "community", "academy", "partners",
    "login", "auth", "admin", "mail", "go", "get", "try", "demo", "resources", "learn", "eu",
    "us", "uk", "de", "en", "fr", "es", "nl", "sandbox", "staging", "test", "my", "account",
    "accounts", "signup", "shop", "store", "events", "news", "press", "embed",
    "recruit", "recruiting", "talent", "people", "hr", "careers-page", "marketplace",
}

# Careers words, in the languages of the survey's organisations, as a whole path segment or
# the start of one ("careers", "careers-at-irc"); a word inside a sentence-like slug
# ("rebuilding-her-career") does not count.
CAREER_WORDS = (
    r"careers?|jobs?|job-?opportunities|career-?opportunities|employment(?:-opportunities)?"
    r"|vacanc(?:y|ies)|vacancy-?announcements|current-?vacancies|work-?with-?us|work-?for-?us"
    r"|working-?(?:with|for|at)-?us|join-?us|join-?our-?team|recruit(?:ment|ing)?"
    r"|emplois?|offres-?d-?emploi|recrutement|nous-?rejoindre|rejoignez-?nous"
    r"|travailler-?(?:avec|chez)-?nous|empleos?|ofertas-?de-?empleo|bolsa-?de-?trabajo"
    r"|trabaja(?:-?con-?nosotros)?|trabajar(?:-?con-?nosotros)?|stellen(?:angebote|markt)?"
    r"|karriere|jobs-?und-?karriere|vacatures|werken-?bij|werkenbij|lavora(?:-?con-?noi)?"
    r"|lavoro|opportunita-?di-?lavoro|carreiras?|trabalhe-?conosco|vagas"
    r"|lediga-?jobb|jobba-?hos-?oss|ledige-?stillinger|stillinger|job-?hos-?os|tyopaikat"
    r"|kariera|praca|wakazi"
)
CAREER_SEGMENT = re.compile(rf"^(?:{CAREER_WORDS})(?:$|[-_.])")
CAREER_LABEL = re.compile(
    r"^(?:careers?|jobs?|recruit(?:ment|ing)?|vacanc(?:y|ies)|emplois?|empleos?|karriere|stellen"
    r"|talent|werkenbij|join|work|carreiras?|vacatures)(?:$|-)")
# Prefixes read on a site too large to read whole.
ROOT_SLUGS = ["careers", "career", "jobs", "job", "vacancies", "vacancy", "work-with-us",
              "work-for-us", "working-with-us", "join-us", "join-our-team", "recruitment",
              "employment", "emploi", "emplois", "recrutement", "nous-rejoindre", "empleo",
              "empleos", "trabaja", "stellen", "karriere", "vacatures", "werken-bij", "lavora",
              "carreiras", "about-us/careers", "about/careers", "who-we-are/careers",
              "get-involved/careers", "about-us/jobs", "about/jobs"]
SUB_SLUGS = ["careers", "career", "jobs", "job", "recruit", "vacanc", "emploi", "empleo",
             "karriere", "stellen", "talent", "join", "work"]
LANGS = ["en", "fr", "es"]

CONFIDENCE = ["high", "medium", "low"]
CANDIDATE_FIELDS = ["rank", "org_id", "name", "candidate_url", "system_guess", "crawls", "status",
                    "redirect", "rule", "confidence"]
REVIEW_FIELDS = ["rank", "org_id", "name", "kind", "detail", "reason"]
WEBSITE_FIELDS = ["rank", "org_id", "name", "website", "source", "detail"]
INDEX_FIELDS = ["crawl", "site", "landing", "status", "redirect", "below_ok", "below_all",
                "system_redirect"]
TENANT_FIELDS = ["system", "tenant", "sites", "crawls", "captures", "example"]
WIKIDATA_FIELDS = ["match", "value", "item", "label", "description", "website"]
DECISION_FIELDS = ["action", "org_id", "value", "confidence", "reason"]
WAVE_FIELDS = ["rank", "org_id", "name", "group", "unjobs_jobs", "income_usd", "website",
               "step_e_guess", "step_e_confidence", "step_f_batch"]

# The first wave of employers (the user's decision, 5 November 2026): everything on UNjobs outside
# the UN system, and the 100 largest organisations by income; the UN system comes later. These
# are the bodies on UNjobs' UN page that are not part of the UN system.
OUTSIDE_UN_SYSTEM = {
    "unjobs-un:107",     # World Bank Group
    "unjobs-un:32",      # International Finance Corporation
    "unjobs-un:35",      # International Monetary Fund
    "unjobs-un:14",      # European Bank for Reconstruction and Development
    "unjobs-un:30",      # Inter-American Development Bank
    "unjobs-un:2",       # Asian Infrastructure Investment Bank
    "unjobs-un:1",       # Asian Development Bank
    "unjobs-un:41",      # Islamic Development Bank
    "unjobs-un:4",       # African Development Bank
    "unjobs-un:51",      # Nordic Investment Bank
    "unjobs-nonun:468",  # The Global Fund
    "unjobs-un:26",      # International Criminal Court
    "unjobs-un:61",      # OSCE
    "unjobs-un:55",      # OECD
    "unjobs-un:66",      # Pacific Community
    "unjobs-un:45",      # International Centre for Migration Policy Development
    "unjobs-un:47",      # International Food Policy Research Institute
    "unjobs-un:3",       # ASEAN
    "unjobs-un:6",       # CABI
    "unjobs-un:28",      # International Commission on Missing Persons
    "unjobs-un:106",     # World Trade Organization
    "unjobs-un:22",      # European Forest Institute
    "unjobs-un:38",      # Inter-Parliamentary Union
    "unjobs-un:46",      # International Development Law Organization
    "unjobs-un:48",      # International Institute for Applied Systems Analysis
    "unjobs-un:39",      # International Renewable Energy Agency
    "unjobs-un:62",      # Organisation of Eastern Caribbean States
}
WAVE_INCOME_TOP = 100   # the largest organisations of the income tier in the first wave
STEP_F_FIRST = (150, 50)  # step F's first batch: the first wave's top by jobs, and by income

# Wikidata properties for the identifiers the survey holds (checked on 5 November 2026).
WD_PROPS = {
    "uk": ("P3057", "Charity Commission no."),
    "oscr": ("P3163", "Scottish Charity number"),
    "irs": ("P1297", "IRS Employer Identification Number"),
    "cra": ("P8860", "Canada Business Number"),
    "acnc": ("P3548", "Australian Business Number"),
    "acnc-charity": ("P10081", "Australian Charities and Not-for-profits Register Charity ID"),
    "iati": ("P13305", "IATI organisation ID"),
    "eu": ("P2657", "EU Transparency Register ID"),
}
WD_BATCH = 150
WD_NAME_BATCH = 60


# --- keys and patterns ---------------------------------------------------------------------

def surt_host(host: str) -> str:
    """'www.Rescue.org' -> 'org,rescue', as Common Crawl's index writes a host."""
    host = re.sub(r"^www\d*\.", "", (host or "").lower().strip(".").split(":")[0])
    return ",".join(reversed(host.split(".")))


def url_key(url: str) -> str:
    """A URL as the index's sort key, without the query: 'org,rescue)/careers'."""
    parts = urlsplit(url if "//" in url else "//" + url)
    return surt_host(parts.hostname or "") + ")" + (parts.path or "/").lower()


def strip_query(url: str) -> str:
    """Scheme, host and path only: query strings and fragments are never kept."""
    if not url:
        return ""
    parts = urlsplit(url if "//" in url else "https://" + url)
    if not parts.hostname:
        return ""
    return f"{parts.scheme or 'https'}://{parts.hostname}{parts.path or '/'}"


def site_host(value: str) -> str:
    """A website as a bare host: 'https://www.ICRC.org/en' -> 'icrc.org'."""
    value = (value or "").strip().lower()
    if not value:
        return ""
    host = urlsplit(value if "//" in value else "//" + value).hostname or ""
    return re.sub(r"^www\d*\.", "", host.strip("."))


SECOND_LEVEL = {"org", "co", "com", "ac", "gov", "or", "ne", "net", "edu", "gob", "gouv", "nic"}


def website_stem(host: str) -> str:
    """'savethechildren.org.uk' -> 'savethechildren'; '' for shared hosts."""
    host = site_host(host)
    if not host or host in SHARED_HOSTS:
        return ""
    labels = host.split(".")
    if len(labels) >= 3 and labels[-2] in SECOND_LEVEL and len(labels[-1]) == 2:
        labels = labels[:-1]
    return re.sub(r"[^a-z0-9]", "", labels[-2]) if len(labels) >= 2 else ""


def careers_landing(url: str, site: str) -> str:
    """The careers landing page a captured URL belongs to on the organisation's own site, or ''.

    A careers subdomain ('careers.rescue.org') is its own landing; otherwise the path up to and
    including its first careers segment ('/en/careers/job/1' -> '/en/careers')."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    bare = re.sub(r"^www\d*\.", "", host)
    site = site_host(site)
    if bare != site and not bare.endswith("." + site):
        return ""
    if bare != site:
        labels = bare[: -len(site) - 1].split(".")
        if any(CAREER_LABEL.match(label) for label in labels):
            return f"https://{host}/"
    segments = [s for s in parts.path.split("/") if s]
    for i, segment in enumerate(segments):
        if CAREER_SEGMENT.match(unquote(segment).lower()):
            return f"https://{host}/" + "/".join(segments[: i + 1])
    return ""


def system_of(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower() if url else ""
    return next((name for name, pattern in SYSTEM_HOST_RE if pattern.search(host)), "")


LOCALE = re.compile(r"^[a-z]{2}(?:-[a-z]{2,4})?$", re.IGNORECASE)


def tenant_of(url: str) -> tuple[str, str, str]:
    """(system, account, site) for a recruitment-system URL; account '' when none is named.

    The query is read only here, for Greenhouse's embedded boards ('?for=account'), and never
    kept."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    segs = [unquote(s) for s in parts.path.split("/") if s]
    system = system_of(url)
    labels = host.split(".")
    account, site = "", ""
    if system == "Workday":
        match = re.match(r"^([a-z0-9-]+)\.(?:wd\d+|impl-wd\d+)\.myworkdayjobs\.com$", host)
        rest = [s for s in segs if not LOCALE.match(s) and s.lower() != "robots.txt"]
        if match and ".impl-" not in host and "impl-wd" not in host:
            account, site = match.group(1), (rest[0] if rest else "")
        elif host.endswith("myworkdaysite.com") and "recruiting" in rest:
            after = rest[rest.index("recruiting") + 1:]
            account, site = (after[0] if after else ""), (after[1] if len(after) > 1 else "")
    elif system == "Greenhouse":
        if segs and segs[0] in ("embed", "v1"):
            if segs[0] == "v1" and len(segs) > 2 and segs[1] == "boards":
                account = segs[2]
            else:
                account = (parse_qs(parts.query).get("for") or [""])[0]
        elif segs and labels[0] in ("boards", "job-boards", "boards-api"):
            account = segs[0]
    elif system in ("Lever", "Ashby", "Jobvite"):
        if labels[0] in ("jobs", "api") and segs:
            account = segs[0] if segs[0] not in ("v0", "posting-api") else (
                segs[2] if len(segs) > 2 else "")
    elif system == "SmartRecruiters":
        if labels[0] in ("jobs", "careers") and segs:
            account = segs[0]
    elif system == "Workable":
        if labels[0] == "apply" and segs:
            account = segs[0]
        elif len(labels) == 3:
            account = labels[0]
    elif system == "iCIMS":
        match = re.match(r"^careers-([a-z0-9-]+)\.icims\.com$", host)
        account = match.group(1) if match else ""
    elif system == "Personio":
        if len(labels) >= 4 and labels[1] == "jobs":
            account = labels[0]
    elif system in ("BambooHR", "Pinpoint", "Teamtailor", "Recruitee", "Avature", "Taleo",
                    "Zoho Recruit"):
        if len(labels) == 3:
            account = labels[0]
    account = account.strip().lower()
    if account in VENDOR_HOSTS or not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{1,62}", account):
        account = ""
    return system, account, site


GENERIC_TENANT_ENDINGS = re.compile(
    r"(?:careers?|jobs?|external|extern|portal|recruiting|recruitment|talent|hr|global"
    r"|inc|llc|ltd|site|boards?)$")


def norm_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def tenant_keys(account: str, site: str = "") -> set[str]:
    """An account name, with generic endings and trailing digits removed: 'rescue1', 'rescue'."""
    keys = set()
    for raw in (account, site):
        key = norm_key(raw)
        while key:
            keys.add(key)
            shorter = GENERIC_TENANT_ENDINGS.sub("", re.sub(r"\d+$", "", key))
            if shorter.startswith("the") and len(shorter) > 6:
                shorter = shorter[3:]
            if shorter == key:
                break
            key = shorter
    return {k for k in keys if len(k) >= 3}


def org_keys(name: str, acronym: str, website: str) -> list[tuple[str, str]]:
    """(kind, key) by strength: the full name, the website's name, the acronym."""
    keys = []
    full = strict_name(name).replace(" ", "")
    if len(full) >= 4:
        keys.append(("full name", full))
        if full.startswith("the"):
            keys.append(("full name", full[3:]))
    stem = website_stem(website)
    if len(stem) >= 4 and stem not in {k for _, k in keys}:
        keys.append(("website name", stem))
    acr = norm_key(acronym)
    if len(acr) >= 3 and acr not in {k for _, k in keys}:
        keys.append(("acronym", acr))
    return keys


# --- the cluster index ---------------------------------------------------------------------

class ClusterIndex:
    """A crawl's cluster.idx: one line per block of about 3,000 index rows, sorted by key."""

    def __init__(self, lines):
        self.keys, self.blocks = [], []
        for line in lines:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4:
                continue
            self.keys.append(parts[0].split(" ")[0])
            self.blocks.append((parts[1], int(parts[2]), int(parts[3])))

    @classmethod
    def read(cls, path: Path) -> ClusterIndex:
        with path.open(encoding="utf-8", errors="replace") as handle:
            return cls(handle)

    def blocks_for(self, prefix: str) -> list[int]:
        """Blocks that may hold keys starting with prefix (block i holds keys[i] to keys[i+1])."""
        low = max(bisect.bisect_left(self.keys, prefix) - 1, 0)
        high = bisect.bisect_left(self.keys, prefix + "\uffff")
        return [i for i in range(low, max(high, low + 1)) if i < len(self.keys)]

    def ranges(self, blocks) -> list[tuple[str, int, int, int]]:
        """Neighbouring blocks of one file joined: (file, first byte, last byte, blocks)."""
        out = []
        for i in sorted(set(blocks)):
            name, offset, length = self.blocks[i]
            last = out[-1] if out else None
            if last and last[0] == name and last[2] + 1 == offset and last[3] < MAX_RANGE_BLOCKS:
                out[-1] = (name, last[1], offset + length - 1, last[3] + 1)
            else:
                out.append((name, offset, offset + length - 1, 1))
        return out


def site_prefixes(cluster: ClusterIndex, site: str) -> list[str]:
    """The whole site when it is small, else its careers-like paths and subdomains."""
    s = surt_host(site)
    whole = [s + ")", s + ","]
    if len({b for p in whole for b in cluster.blocks_for(p)}) <= FULL_SITE_BLOCKS:
        return whole
    paths = [s + ")/" + slug for slug in ROOT_SLUGS]
    paths += [f"{s})/{lang}/{slug}" for lang in LANGS for slug in ROOT_SLUGS[:12]]
    return paths + [s + "," + sub for sub in SUB_SLUGS]


# --- download ------------------------------------------------------------------------------

class Requester:
    """One request at a time, spaced, logged; errors back off; repeated errors stop the run."""

    def __init__(self, log: Path, interval: float, user_agent: str):
        import requests

        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent})
        self.log, self.base, self.last, self.failures = log, interval, 0.0, 0
        self.interval, self.refusals = interval, 0
        log.parent.mkdir(parents=True, exist_ok=True)

    def _note(self, status, size, seconds, what, said=""):
        with self.log.open("a", encoding="utf-8") as handle:
            handle.write(f"{datetime.now(UTC).isoformat(timespec='seconds')}\t{status}\t{size}"
                         f"\t{seconds:.1f}s\t{what}" + (f"\t{said}" if said else "") + "\n")

    def get(self, url: str, what: str = "", method: str = "GET", ok=(200,), **kwargs):
        for attempt in range(len(BACKOFF) + 1):
            wait = self.interval - (time.monotonic() - self.last)
            if wait > 0:
                time.sleep(wait)
            started = time.monotonic()
            self.last = started
            try:
                response = self.session.request(method, url, timeout=180, **kwargs)
                body = response.content
                said = "" if response.status_code in ok else \
                    " ".join(body[:120].decode("utf-8", "replace").split())
                self._note(response.status_code, len(body), time.monotonic() - started,
                           f"{what} {url}".strip(), said)
                if response.status_code in ok:
                    self.failures = self.refusals = 0
                    self.interval = max(self.base, self.interval * 0.8)
                    return response
                if response.status_code == 403:
                    raise SystemExit(f"stopped at once: HTTP 403 ({what})")
                if response.status_code in REFUSED:
                    self.refusals += 1
                    if self.refusals >= STOP_REFUSALS:
                        raise SystemExit(f"stopped for the day: {self.refusals} refusals in a row"
                                         f" (HTTP {response.status_code}, {what})")
                    self.interval = min(self.interval * 2, 30.0)  # the server asks to slow down
                retry_after = response.headers.get("retry-after", "")
                problem = f"HTTP {response.status_code}"
            except Exception as error:  # noqa: BLE001  logged, backed off, then stopped
                self._note(type(error).__name__, 0, time.monotonic() - started, f"{what} {url}")
                retry_after, problem = "", type(error).__name__
            if attempt == len(BACKOFF):
                break
            pause = BACKOFF[attempt]
            if retry_after.isdigit():
                pause = max(pause, min(int(retry_after), 600))
            print(f"  {problem}; waiting {pause}s", flush=True)
            time.sleep(pause)
        self.failures += 1
        if self.failures >= STOP_AFTER:
            raise SystemExit(f"stopped: {self.failures} requests in a row failed ({problem})")
        return None


def _cc(log_name: str = "requests.log") -> Requester:
    return Requester(RAW / log_name, CC_INTERVAL, USER_AGENT)


def download_cluster(requester: Requester) -> None:
    for crawl in CRAWLS:
        target = RAW / crawl / "cluster.idx"
        if target.exists():
            print(f"{crawl} cluster.idx: already downloaded")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        response = requester.get(DATA.format(crawl=crawl) + "cluster.idx", "cluster.idx")
        if response is None:
            print(f"{crawl} cluster.idx: FAILED")
            continue
        partial = target.with_suffix(".part")
        partial.write_bytes(response.content)
        partial.replace(target)
        print(f"{crawl} cluster.idx: {target.stat().st_size:,} bytes", flush=True)


def _read_ranges(requester, cluster, crawl, prefixes, what) -> list[str] | None:
    """Index rows starting with any prefix, from the blocks that hold them."""
    rows = []
    blocks = {b for p in prefixes for b in cluster.blocks_for(p)}
    wanted = tuple(prefixes)
    for name, first, last, count in cluster.ranges(blocks):
        response = requester.get(DATA.format(crawl=crawl) + name, f"{what} ({count} blocks)",
                                 ok=(206,), headers={"Range": f"bytes={first}-{last}"})
        if response is None:
            return None
        text = gzip.decompress(response.content).decode("utf-8", errors="replace")
        rows += [line for line in text.splitlines() if line.startswith(wanted)]
    return rows


def _save_rows(target: Path, rows: list[str]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(".part")
    with gzip.open(partial, "wt", encoding="utf-8") as handle:
        handle.write("\n".join(rows))
    partial.replace(target)


def download_systems(requester: Requester) -> None:
    for crawl in CRAWLS:
        cluster = ClusterIndex.read(RAW / crawl / "cluster.idx")
        for system, prefixes in SYSTEMS.items():
            target = RAW / crawl / "systems" / f"{norm_key(system)}.cdx.gz"
            if target.exists():
                continue
            rows = _read_ranges(requester, cluster, crawl, prefixes, f"{crawl} {system}")
            if rows is None:
                print(f"{crawl} {system}: FAILED", flush=True)
                continue
            _save_rows(target, rows)
            print(f"{crawl} {system}: {len(rows):,} rows", flush=True)


def scope_rows(survey: Path = SURVEY) -> list[dict]:
    with (survey / "organisations.csv").open(encoding="utf-8") as handle:
        return [r for r in csv.DictReader(handle) if r["evidence"] in SCOPE]


def sites_to_read(survey: Path = SURVEY, top: int | None = None) -> list[str]:
    """Every website of the ranked organisations (or of the first `top`), with those filled in
    step E, best rank first."""
    sites = []
    filled = {}
    path = survey / "websites-filled.csv"
    if path.exists():
        with path.open(encoding="utf-8") as handle:
            filled = {r["org_id"]: r["website"] for r in csv.DictReader(handle) if r["website"]}
    for row in scope_rows(survey)[:top]:
        host = site_host(row["website_domain"] or filled.get(row["org_id"], ""))
        if host and host not in PLATFORM_HOSTS and host not in sites:
            sites.append(host)
    return sites


def download_sites(requester: Requester, top: int | None = None) -> None:
    sites = sites_to_read(top=top)
    for crawl in CRAWLS:
        cluster = ClusterIndex.read(RAW / crawl / "cluster.idx")
        done = 0
        for site in sites:
            target = RAW / crawl / "sites" / f"{site}.cdx.gz"
            if target.exists():
                done += 1
                continue
            rows = _read_ranges(requester, cluster, crawl, site_prefixes(cluster, site),
                                f"{crawl} {site}")
            if rows is None:
                print(f"{crawl} {site}: FAILED", flush=True)
                continue
            _save_rows(target, rows)
            done += 1
            if done % 25 == 0:
                print(f"{crawl}: {done} of {len(sites)} sites", flush=True)
        print(f"{crawl}: {done} of {len(sites)} sites read", flush=True)


def identifiers(row: dict) -> list[tuple[str, str]]:
    """(register, value as Wikidata writes it) for each identifier an organisation carries."""
    out = []
    for source in row["sources"].split("; "):
        register, _, value = source.partition(":")
        value = value.strip()
        if register == "irs" and re.fullmatch(r"\d{9}", value):
            out.append(("irs", f"{value[:2]}-{value[2:]}"))
        elif register == "uk" and value:
            out.append(("uk", value.split("-")[0]))
        elif register == "oscr" and value:
            out.append(("oscr", value.upper()))
        elif register == "cra" and value:
            out.append(("cra", value[:9]))
        elif register == "acnc" and value:
            digits = re.sub(r"\D", "", value)
            out += [("acnc", digits), ("acnc-charity", digits)]
        elif register in ("iati", "eu") and value:
            out.append((register, value))
    return out


def _sparql(requester: Requester, query: str, what: str) -> dict | None:
    response = requester.get(SPARQL, what, method="POST", data={"query": query},
                             headers={"Accept": "application/sparql-results+json"})
    return response.json() if response is not None else None


def _literal(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def download_wikidata(requester: Requester) -> None:
    WD_RAW.mkdir(parents=True, exist_ok=True)
    check = WD_RAW / "properties.json"
    if not check.exists():
        values = " ".join(f"wd:{pid}" for pid, _ in WD_PROPS.values()) + " wd:P856"
        data = _sparql(requester, f"SELECT ?p ?label WHERE {{ VALUES ?p {{ {values} }} "
                                  f"?p rdfs:label ?label . FILTER(lang(?label) = 'en') }}",
                       "property labels")
        if data is not None:
            check.write_text(json.dumps(data, indent=1), encoding="utf-8")
    rows = [r for r in scope_rows() if not r["website_domain"]]
    wanted = defaultdict(set)
    for row in rows:
        for register, value in identifiers(row):
            wanted[register].add(value)
    for register, values in sorted(wanted.items()):
        pid = WD_PROPS[register][0]
        ordered = sorted(values)
        for n in range(0, len(ordered), WD_BATCH):
            target = WD_RAW / f"ids-{register}-{n // WD_BATCH:02d}.json"
            if target.exists():
                continue
            batch = " ".join(_literal(v) for v in ordered[n:n + WD_BATCH])
            data = _sparql(requester, (
                f"SELECT ?value ?item ?itemLabel ?itemDescription ?site WHERE {{ "
                f"VALUES ?value {{ {batch} }} ?item wdt:{pid} ?value . "
                f"OPTIONAL {{ ?item wdt:P856 ?site }} "
                f"SERVICE wikibase:label {{ bd:serviceParam wikibase:language 'en'. }} }}"),
                f"{register} identifiers {n // WD_BATCH + 1}")
            if data is not None:
                target.write_text(json.dumps(data), encoding="utf-8")
                print(f"{target.name}: {len(data['results']['bindings'])} rows", flush=True)
    names = sorted({v for r in rows for v in name_variants(r["name"])})
    for n in range(0, len(names), WD_NAME_BATCH):
        target = WD_RAW / f"names-{n // WD_NAME_BATCH:02d}.json"
        if target.exists():
            continue
        batch = " ".join(_literal(v) + "@en" for v in names[n:n + WD_NAME_BATCH])
        data = _sparql(requester, (
            f"SELECT ?value ?item ?itemLabel ?itemDescription ?site WHERE {{ "
            f"VALUES ?value {{ {batch} }} {{ ?item rdfs:label ?value }} UNION "
            f"{{ ?item skos:altLabel ?value }} ?item wdt:P856 ?site . "
            f"SERVICE wikibase:label {{ bd:serviceParam wikibase:language 'en'. }} }}"),
            f"names {n // WD_NAME_BATCH + 1}")
        if data is not None:
            target.write_text(json.dumps(data), encoding="utf-8")
            print(f"{target.name}: {len(data['results']['bindings'])} rows", flush=True)


def name_variants(name: str) -> list[str]:
    """The name as listed, and without a trailing legal form ('Inc', 'Ltd')."""
    name = " ".join((name or "").split())
    bare = re.sub(r",?\s+(?:Inc\.?|Incorporated|Ltd\.?|Limited|LLC|e\.V\.)$", "", name)
    return sorted({n for n in (name, bare) if len(n) >= 3})


def download(args) -> None:
    part = args.part
    if part in ("all", "wikidata"):
        download_wikidata(Requester(WD_RAW / "requests.log", WD_INTERVAL, WD_USER_AGENT))
    if part in ("all", "cluster", "systems", "sites"):
        requester = _cc()
        if part in ("all", "cluster"):
            download_cluster(requester)
        if part in ("all", "systems"):
            download_systems(requester)
        if part in ("all", "sites"):
            download_sites(requester, args.top)


# --- extract (no network) ------------------------------------------------------------------

def parse_row(line: str) -> dict | None:
    try:
        _key, _stamp, data = line.split(" ", 2)
        row = json.loads(data)
    except ValueError:
        return None
    return row if row.get("url") else None


def _status_rank(status: str) -> int:
    status = str(status or "")
    return 0 if status == "200" else 1 if status.startswith("3") else 2 if status else 3


def site_landings(site: str, crawl: str, lines) -> list[dict]:
    """Careers-like landings on one site in one crawl, from its index rows."""
    found: dict[str, dict] = {}
    for line in lines:
        row = parse_row(line)
        if row is None:
            continue
        url = strip_query(row["url"])
        redirect = strip_query(row.get("redirect", ""))
        landing = careers_landing(url, site)
        if not landing and system_of(redirect):
            landing = url
        if not landing:
            continue
        entry = found.setdefault(landing.lower(), {
            "crawl": crawl, "site": site, "landing": landing, "status": "", "redirect": "",
            "below_ok": 0, "below_all": 0, "system_redirect": ""})
        status = str(row.get("status", ""))
        if url.rstrip("/").lower() == landing.rstrip("/").lower():
            if not entry["status"] or _status_rank(status) < _status_rank(entry["status"]):
                entry["status"], entry["redirect"] = status, redirect
        else:
            entry["below_all"] += 1
            entry["below_ok"] += status == "200"
        if system_of(redirect) and not entry["system_redirect"]:
            parts = urlsplit(redirect)
            segs = [s for s in parts.path.split("/") if s][:2]
            entry["system_redirect"] = f"https://{parts.hostname}/" + "/".join(segs)
    ordered = sorted(found.values(), key=lambda e: (
        not e["system_redirect"], _status_rank(e["status"]), -e["below_ok"],
        e["landing"].count("/"), e["landing"]))
    return ordered[:25]


def system_accounts(system: str, crawl: str, lines, accounts: dict) -> None:
    for line in lines:
        row = parse_row(line)
        if row is None:
            continue
        found, account, site = tenant_of(row["url"])
        if found != system or not account:
            continue
        entry = accounts.setdefault((system, account), {
            "sites": Counter(), "crawls": set(), "captures": 0, "example": "", "best": (9, 9)})
        entry["crawls"].add(crawl)
        entry["captures"] += 1
        if site:
            entry["sites"][site] += 1
        parts = urlsplit(row["url"])
        segs = [s for s in parts.path.split("/") if s]
        # A page that answered is the best example; the account's robots.txt only the last.
        rank = (segs[-1:] == ["robots.txt"], str(row.get("status")) != "200")
        if rank < entry["best"]:
            entry["best"] = rank
            entry["example"] = f"https://{parts.hostname}/" + "/".join(segs[:2])


def _read_gz(path: Path) -> list[str]:
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
        return handle.read().splitlines()


def extract(_args) -> int:
    sites = sites_to_read()
    index_rows = []
    for crawl in CRAWLS:
        missing = 0
        for site in sites:
            path = RAW / crawl / "sites" / f"{site}.cdx.gz"
            if not path.exists():
                missing += 1
                continue
            index_rows += site_landings(site, crawl, _read_gz(path))
        print(f"{crawl}: {len(sites) - missing} of {len(sites)} sites read")
    accounts: dict = {}
    for crawl in CRAWLS:
        for system in SYSTEMS:
            path = RAW / crawl / "systems" / f"{norm_key(system)}.cdx.gz"
            if path.exists():
                system_accounts(system, crawl, _read_gz(path), accounts)
            else:
                print(f"{crawl} {system}: not downloaded")
    with (SURVEY / "organisations.csv").open(encoding="utf-8") as handle:
        orgs = list(csv.DictReader(handle))
    filled = read_csv(SURVEY / "websites-filled.csv")
    known = {k for o in orgs for _, k in org_keys(o["name"], o["acronym"], o["website_domain"])}
    known |= {website_stem(r["website"]) for r in filled if r["website"]}
    tenant_rows = []
    for (system, account), entry in sorted(accounts.items()):
        sites_seen = [s for s, _ in entry["sites"].most_common(3)]
        if not tenant_keys(account, *sites_seen[:1]) & known:
            continue
        tenant_rows.append({
            "system": system, "tenant": account, "sites": " ".join(sites_seen),
            "crawls": " ".join(c[-7:] for c in CRAWLS if c in entry["crawls"]),
            "captures": entry["captures"], "example": entry["example"]})
    _write(SURVEY / "step-e-index.csv", INDEX_FIELDS, index_rows)
    _write(SURVEY / "step-e-tenants.csv", TENANT_FIELDS, tenant_rows)
    _write(SURVEY / "step-e-wikidata.csv", WIKIDATA_FIELDS, wikidata_rows())
    print(f"index rows {len(index_rows):,}; accounts seen {len(accounts):,}, "
          f"kept (could match a name) {len(tenant_rows):,}")
    return 0


def wikidata_rows() -> list[dict]:
    rows = {}
    for path in sorted(WD_RAW.glob("*.json")):
        if path.name == "properties.json":
            continue
        register = "name" if path.name.startswith("names-") else path.name.split("-")[1]
        if register == "acnc" and path.name.startswith("ids-acnc-charity"):
            register = "acnc-charity"
        data = json.loads(path.read_text(encoding="utf-8"))
        for b in data["results"]["bindings"]:
            item = b["item"]["value"].rsplit("/", 1)[-1]
            row = {"match": register, "value": b["value"]["value"], "item": item,
                   "label": b.get("itemLabel", {}).get("value", ""),
                   "description": b.get("itemDescription", {}).get("value", ""),
                   "website": strip_query(b.get("site", {}).get("value", ""))}
            rows[(row["match"], row["value"], item, row["website"])] = row
    return [rows[k] for k in sorted(rows)]


# --- build (no network) --------------------------------------------------------------------

def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _write(path: Path, fields, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n",
                                extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


@dataclass
class Decisions:
    website: dict[str, tuple[str, str]] = field(default_factory=dict)
    no_website: dict[str, str] = field(default_factory=dict)
    wikidata: dict[tuple[str, str], tuple[bool, str, str]] = field(default_factory=dict)
    tenant: dict[tuple[str, str], tuple[bool, str, str]] = field(default_factory=dict)
    reject_page: dict[tuple[str, str], str] = field(default_factory=dict)

    @classmethod
    def read(cls, rows) -> Decisions:
        d = cls()
        for r in rows:
            org, value, reason = r["org_id"], r["value"], r["reason"]
            action = r["action"]
            if action == "website":
                d.website[org] = (site_host(value), reason)
            elif action == "no-website":
                d.no_website[org] = reason
            elif action in ("accept-wikidata", "reject-wikidata"):
                item, _, host = value.partition(" ")  # "Q123" or "Q123 chosen-host.org"
                d.wikidata[(org, item)] = (action == "accept-wikidata", reason, site_host(host))
            elif action in ("accept-tenant", "reject-tenant"):
                d.tenant[(org, value.lower())] = (action == "accept-tenant",
                                                  r["confidence"] or "medium", reason)
            elif action == "reject-page":
                d.reject_page[(org, value.lower())] = reason
            else:
                raise ValueError(f"unknown decision {action!r}")
        return d


def fill_websites(orgs, wikidata, decisions: Decisions):
    """Websites for organisations without one: by identifier from Wikidata, by an accepted
    name match, or from the agent's search; name-only matches go to review."""
    by_value = defaultdict(list)
    for w in wikidata:
        by_value[(w["match"], w["value"])].append(w)
    filled, review = [], []
    rank_of = {o["org_id"]: int(o["rank"]) for o in orgs}
    for o in orgs:
        if o["website_domain"]:
            continue
        oid, base = o["org_id"], {"rank": o["rank"], "org_id": o["org_id"], "name": o["name"]}
        hits = [w for register, value in identifiers(o) for w in by_value[(register, value)]
                if w["website"]]
        hosts = Counter(h for h in (site_host(w["website"]) for w in hits)
                        if h and h not in PLATFORM_HOSTS)
        chosen = [(w, decisions.wikidata[(oid, w["item"])]) for w in hits
                  if decisions.wikidata.get((oid, w["item"]), (False,))[0]]
        if len(hosts) > 1 and chosen:
            w, (_, reason, host) = chosen[0]
            filled.append({**base, "website": host or site_host(w["website"]),
                           "source": "wikidata (identifier)",
                           "detail": f"{w['item']} by {WD_PROPS[w['match']][0]} {w['value']}; "
                                     f"{reason}"})
            continue
        if len(hosts) == 1:
            host = next(iter(hosts))
            first = next(w for w in hits if site_host(w["website"]) == host)
            pid = WD_PROPS[first["match"]][0]
            filled.append({**base, "website": host, "source": "wikidata (identifier)",
                           "detail": f"{first['item']} by {pid} {first['value']}"})
            continue
        if len(hosts) > 1:
            items = sorted({f"{w['item']} {site_host(w['website'])}" for w in hits})
            review.append({**base, "kind": "wikidata: identifiers disagree",
                           "detail": "; ".join(items), "reason": "two or more websites"})
        if oid in decisions.website:
            host, reason = decisions.website[oid]
            filled.append({**base, "website": host, "source": "unverified (search-engine copy)",
                           "detail": reason})
            continue
        names = {n for n in name_variants(o["name"])}
        named = [w for n in names for w in by_value[("name", n)] if w["website"]]
        accepted = [w for w in named if decisions.wikidata.get((oid, w["item"]), (False,))[0]]
        if accepted:
            w = accepted[0]
            _, reason, host = decisions.wikidata[(oid, w["item"])]
            filled.append({**base, "website": host or site_host(w["website"]),
                           "source": "wikidata (name, accepted)",
                           "detail": f"{w['item']}: {reason}"})
            continue
        open_named = [w for w in named if (oid, w["item"]) not in decisions.wikidata]
        for item in sorted({w["item"] for w in open_named}):
            sites = sorted({site_host(w["website"]) for w in open_named if w["item"] == item})
            label = next(w for w in open_named if w["item"] == item)
            review.append({**base, "kind": "wikidata: name only",
                           "detail": f"{item} {label['label']} ({label['description']}): "
                                     f"{' '.join(sites)}",
                           "reason": "a match by name alone is never automatic"})
        if oid in decisions.no_website:
            filled.append({**base, "website": "", "source": "none found (searched)",
                           "detail": decisions.no_website[oid]})
        elif o.get("family") == UN_FAMILY:
            filled.append({**base, "website": "", "source": "not needed",
                           "detail": "hires through the family's careers site, careers.un.org"})
        elif rank_of[oid] <= SEARCH_TOP:
            filled.append({**base, "website": "", "source": "not yet searched",
                           "detail": "next search batch"})
    return filled, review


def _confidence_cap(confidence: str, cap: str) -> str:
    return CONFIDENCE[max(CONFIDENCE.index(confidence), CONFIDENCE.index(cap))]


def page_candidates(org, site: str, rows) -> list[dict]:
    """Careers landings on the organisation's own site, merged over the crawls."""
    merged: dict[str, dict] = {}
    for r in rows:
        entry = merged.setdefault(r["landing"].lower(), {
            "landing": r["landing"], "crawls": [], "status": "", "redirect": "", "below_ok": 0,
            "system_redirect": ""})
        entry["crawls"].append(r["crawl"][-7:])
        if r["status"] and (not entry["status"]
                            or _status_rank(r["status"]) < _status_rank(entry["status"])):
            entry["status"], entry["redirect"] = r["status"], r["redirect"]
        entry["below_ok"] += int(r["below_ok"] or 0)
        entry["system_redirect"] = entry["system_redirect"] or r["system_redirect"]
    out = []
    for e in merged.values():
        system = system_of(e["system_redirect"]) or system_of(e["redirect"])
        path = urlsplit(e["landing"]).path.strip("/")
        depth = len([s for s in path.split("/") if s])
        if system:
            rule, confidence = f"own site redirects to {system}", "high"
        elif e["status"] == "200":
            rule = "own site, careers page"
            confidence = "high" if depth <= 2 else "medium"
        elif e["status"].startswith("3"):
            rule, confidence = "own site, careers page redirects", "medium"
        elif e["below_ok"]:
            rule, confidence = "own site, pages below a careers path", "medium"
        else:
            rule, confidence = "own site, careers path not answering", "low"
        if site in SHARED_HOSTS:
            confidence = _confidence_cap(confidence, "medium")
            rule += " (shared host)"
        out.append({
            "rank": org["rank"], "org_id": org["org_id"], "name": org["name"],
            "candidate_url": e["landing"],
            "system_guess": system or "own site (system unknown)",
            "crawls": " ".join(sorted(set(e["crawls"]), reverse=True)), "status": e["status"]
            or "not captured", "redirect": e["system_redirect"] or e["redirect"],
            "rule": rule + (f"; {e['below_ok']} pages below answered" if e["below_ok"] else ""),
            "confidence": confidence})
    return out


def match_tenants(orgs, tenants, websites: dict[str, str]):
    """Each account's best match: the full name, then the website's name, then the acronym.

    Returns {(org_id, 'System:account'): (kind, tenant row)} and the accounts that match two or
    more organisations at their best level, which go to review."""
    by_key = defaultdict(list)
    for o in orgs:
        for kind, key in org_keys(o["name"], o["acronym"], websites.get(o["org_id"], "")):
            by_key[key].append((kind, o["org_id"]))
    strength = {"full name": 0, "website name": 1, "acronym": 2}
    matches, shared = {}, {}
    for t in tenants:
        sites = t["sites"].split()
        found = [(strength[kind], kind, oid) for key in tenant_keys(t["tenant"], *sites[:1])
                 for kind, oid in by_key.get(key, [])]
        if not found:
            continue
        best = min(f[0] for f in found)
        ids = sorted({oid for s, _, oid in found if s == best})
        kind = next(k for s, k, _ in found if s == best)
        label = f"{t['system']}:{t['tenant']}"
        if len(ids) > 1:
            shared[label] = (kind, ids, t)
        else:
            matches[(ids[0], label)] = (kind, t)
    return matches, shared


def build(_args=None, survey: Path = SURVEY) -> int:
    orgs = scope_rows(survey)
    decisions = Decisions.read(read_csv(survey / "step-e-decisions.csv"))
    known = {o["org_id"] for o in orgs}
    unknown = sorted({k for k in [*decisions.website, *decisions.no_website,
                                  *(o for o, _ in decisions.wikidata),
                                  *(o for o, _ in decisions.tenant),
                                  *(o for o, _ in decisions.reject_page)] if k not in known})
    if unknown:
        print(f"decisions name organisations outside the scope: {unknown[:10]}")
        return 1
    wikidata = read_csv(survey / "step-e-wikidata.csv")
    filled, review = fill_websites(orgs, wikidata, decisions)
    websites = {o["org_id"]: site_host(o["website_domain"]) for o in orgs if o["website_domain"]}
    websites.update({f["org_id"]: f["website"] for f in filled if f["website"]})
    index = defaultdict(list)
    for r in read_csv(survey / "step-e-index.csv"):
        index[r["site"]].append(r)
    tenants = read_csv(survey / "step-e-tenants.csv")
    matches, shared = match_tenants(orgs, tenants, websites)
    by_org = {o["org_id"]: o for o in orgs}
    candidates = defaultdict(list)
    for o in orgs:
        site = websites.get(o["org_id"], "")
        if site and site not in PLATFORM_HOSTS:
            for c in page_candidates(o, site, index.get(site, [])):
                reason = decisions.reject_page.get((o["org_id"], c["candidate_url"].lower()))
                if reason is None:
                    candidates[o["org_id"]].append(c)
    un_seen = [r for r in index.get("un.org", []) if r["landing"].lower() == UN_CAREERS]
    for o in orgs:
        if o["family"] == UN_FAMILY:
            answered = any(r["status"] == "200" or int(r["below_ok"] or 0) for r in un_seen)
            candidates[o["org_id"]].append({
                "rank": o["rank"], "org_id": o["org_id"], "name": o["name"],
                "candidate_url": UN_CAREERS, "system_guess": "UN Inspira (careers.un.org)",
                "crawls": " ".join(sorted({r["crawl"][-7:] for r in un_seen}, reverse=True)),
                "status": "200" if answered else "not captured", "redirect": "",
                "rule": "family: the UN Secretariat's offices hire through careers.un.org",
                "confidence": "high" if answered else "medium"})
    redirected = {oid: {c["system_guess"] for c in cs if c["rule"].startswith("own site redir")}
                  for oid, cs in candidates.items()}
    tenant_hits = defaultdict(list)
    for (oid, label), (kind, t) in matches.items():
        tenant_hits[oid].append((label, kind, t))
    for label, (kind, ids, t) in shared.items():
        for oid in ids:
            decided = decisions.tenant.get((oid, label.lower()))
            if decided:
                tenant_hits[oid].append((label, "decided", t))
            elif not any(decisions.tenant.get((other, label.lower()), (False,))[0]
                         for other in ids):
                o = by_org[oid]
                review.append({"rank": o["rank"], "org_id": oid, "name": o["name"],
                               "kind": "one account, many organisations",
                               "detail": f"{label} ({t['example']}), {kind}",
                               "reason": f"also matches {len(ids) - 1} other organisation(s)"})
    for oid, hits in tenant_hits.items():
        o = by_org[oid]
        systems = {label.split(":")[0] for label, kind, _ in hits if kind != "acronym"}
        for label, kind, t in hits:
            system = label.split(":")[0]
            decided = decisions.tenant.get((oid, label.lower()))
            if decided and not decided[0]:
                continue
            corroborated = system in redirected.get(oid, set())
            conflict = (redirected.get(oid) and not corroborated) or len(systems) > 1
            if decided:
                rule, confidence = f"account by {kind}, decided: {decided[2]}", decided[1]
            elif kind == "acronym" or conflict:
                why = "abbreviation only" if kind == "acronym" else (
                    "own site points to another system" if redirected.get(oid)
                    else "accounts in two or more systems")
                review.append({"rank": o["rank"], "org_id": oid, "name": o["name"],
                               "kind": "abbreviation only" if kind == "acronym" else "conflict",
                               "detail": f"{label} ({t['example']}), {kind}", "reason": why})
                continue
            elif corroborated:
                rule, confidence = f"account by {kind}, own site redirects to it", "high"
            elif kind == "full name":
                key = strict_name(o["name"]).replace(" ", "")
                rule, confidence = "account by full name", "high" if len(key) >= 8 else "medium"
            else:
                stem = website_stem(websites.get(oid, ""))
                rule, confidence = "account by website name", "medium" if len(stem) >= 6 \
                    else "low"
            candidates[oid].append({
                "rank": o["rank"], "org_id": oid, "name": o["name"],
                "candidate_url": t["example"], "system_guess": system,
                "crawls": t["crawls"], "status": "", "redirect": "",
                "rule": f"{rule} ({t['captures']} captures)", "confidence": confidence})
    rows = []
    for o in orgs:
        found = sorted(candidates.get(o["org_id"], []), key=lambda c: (
            CONFIDENCE.index(c["confidence"]), not c["rule"].startswith("own site redir"),
            c["candidate_url"].count("/"), c["candidate_url"]))
        unique = {}
        for c in found:
            unique.setdefault(c["candidate_url"].lower().rstrip("/"), c)
        rows += list(unique.values())[:3]
    review.sort(key=lambda r: (int(r["rank"]), r["kind"], r["detail"]))
    filled.sort(key=lambda r: int(r["rank"]))
    _write(survey / "careers-candidates.csv", CANDIDATE_FIELDS, rows)
    _write(survey / "careers-review.csv", REVIEW_FIELDS, review)
    _write(survey / "websites-filled.csv", WEBSITE_FIELDS, filled)
    wave = first_wave(orgs, rows, websites)
    _write(survey / "first-wave.csv", WAVE_FIELDS, wave)
    for top in (SEARCH_TOP, len(orgs)):
        print(f"top {top}: " + coverage(orgs[:top], rows, websites))
    wave_ids = {w["org_id"] for w in wave}
    print(f"first wave {len(wave)} ({dict(Counter(w['group'] for w in wave))}); step F batch 1: "
          f"{sum(1 for w in wave if w['step_f_batch'] == 1)}; "
          + coverage([o for o in orgs if o["org_id"] in wave_ids], rows, websites))
    print(f"websites filled: {sum(1 for f in filled if f['website'])}; review rows: {len(review)}")
    return 0


def wave_group(org) -> str:
    """The organisation's first-wave group, or '' for the UN system (a later wave)."""
    kinds = {k.strip() for k in org["kind"].split(";")}
    if org["org_id"] in OUTSIDE_UN_SYSTEM:
        return "development bank, fund or other international body"
    if org.get("family") == UN_FAMILY or kinds & {"un-or-intergovernmental",
                                                   "un-secretariat (likely)"}:
        return ""
    if org["evidence"] != "hiring (UNjobs)":
        return ""
    if "non-un" in kinds:
        return "NGO, INGO, consultancy or foundation"
    if kinds & {"intergovernmental", "government agency"}:
        return "development agency or intergovernmental body"
    return ""


def first_wave(orgs, rows, websites) -> list[dict]:
    """The first wave in rank order, with step E's best guess and step F's batch."""
    best = {}
    for r in rows:
        best.setdefault(r["org_id"], r)
    income = [o for o in orgs if o["evidence"] == "income"][:WAVE_INCOME_TOP]
    income_ids = {o["org_id"] for o in income}
    by_jobs, by_income = STEP_F_FIRST
    out, hiring_seen, income_seen = [], 0, 0
    for o in orgs:
        group = wave_group(o) or ("INGO member or funder (by income)"
                                  if o["org_id"] in income_ids else "")
        if not group:
            continue
        if o["org_id"] in income_ids:
            income_seen += 1
            batch = 1 if income_seen <= by_income else 2
        else:
            hiring_seen += 1
            batch = 1 if hiring_seen <= by_jobs else 2
        guess = best.get(o["org_id"], {})
        out.append({"rank": o["rank"], "org_id": o["org_id"], "name": o["name"], "group": group,
                    "unjobs_jobs": o["unjobs_jobs"], "income_usd": o["income_usd"],
                    "website": websites.get(o["org_id"], ""),
                    "step_e_guess": guess.get("candidate_url", ""),
                    "step_e_confidence": guess.get("confidence", ""), "step_f_batch": batch})
    return out


def coverage(orgs, rows, websites) -> str:
    best = {}
    for r in rows:
        best.setdefault(r["org_id"], r["confidence"])
    counts = Counter(best.get(o["org_id"], "none") for o in orgs)
    no_site = sum(1 for o in orgs if not websites.get(o["org_id"]))
    return (", ".join(f"{k} {counts[k]}" for k in [*CONFIDENCE, "none"])
            + f"; without a website {no_site}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    get = commands.add_parser("download")
    get.add_argument("part", nargs="?", default="all",
                     choices=["all", "wikidata", "cluster", "systems", "sites"])
    # The user's decision of 5 November 2026: if Common Crawl keeps refusing, read only the
    # top 600's websites (--top 600); step F finds the rest's careers pages from their sites.
    get.add_argument("--top", type=int, default=None,
                     help="read only the websites of the first N ranked organisations")
    get.set_defaults(func=download)
    commands.add_parser("extract").set_defaults(func=extract)
    commands.add_parser("build").set_defaults(func=build)
    args = parser.parse_args()
    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
