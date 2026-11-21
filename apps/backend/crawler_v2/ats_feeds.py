"""Public ATS job-feed URL recognition and field mapping (ledger W-38).

Sources keep their normal board URLs; readers map them to documented GET feeds.
No network and no database.
"""
from __future__ import annotations

import html
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import unquote, urlparse, urlunparse
from xml.etree import ElementTree

from crawler_v2.feed_fields import iso_day

_WORKABLE_HOSTS = frozenset({"apply.workable.com", "www.workable.com", "workable.com"})
_GREENHOUSE_BOARD_HOSTS = frozenset({
    "job-boards.greenhouse.io",
    "boards.greenhouse.io",
    "boards-api.greenhouse.io",
})
_TEAMTAILOR_BLOCKED = frozenset({"www", "app", "api", "career"})
_LEVER_BOARD_HOSTS = {
    "jobs.lever.co": "api.lever.co",
    "jobs.eu.lever.co": "api.eu.lever.co",
}
_PERSONIO_HOST = re.compile(
    r"^([a-z0-9][a-z0-9-]*)\.jobs\.personio\.(com|de)$", re.I
)

_WORKABLE_ACCOUNT = re.compile(
    r"^/(?:api/v1/widget/accounts/|api/accounts/)?([A-Za-z0-9][A-Za-z0-9_-]*)/?$",
    re.I,
)
_GREENHOUSE_TOKEN = re.compile(
    r"^/(?:v1/boards/)?([A-Za-z0-9][A-Za-z0-9_-]*)(?:/jobs(?:/(\d+))?)?/?$",
    re.I,
)
_LEVER_SITE = re.compile(r"^/([A-Za-z0-9][A-Za-z0-9_-]*)(?:/.*)?$", re.I)
_REMOTE_STATUS = frozenset({"fully", "remote", "fully_remote", "fully-remote"})


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").rstrip(".").lower()
    except ValueError:
        return ""


def _path(url: str) -> str:
    try:
        return unquote(urlparse(url).path or "")
    except ValueError:
        return ""


def workable_account(careers_url: str) -> Optional[str]:
    """Account slug from a Workable board or widget URL; None when it is not Workable."""
    host = _host(careers_url)
    if host not in _WORKABLE_HOSTS and not host.endswith(".workable.com"):
        return None
    match = _WORKABLE_ACCOUNT.match(_path(careers_url))
    if not match:
        return None
    account = match.group(1)
    if account.lower() in {"api", "j", "jobs", "widget", "accounts"}:
        return None
    return account


def workable_feed_url(account: str, *, details: bool = True) -> str:
    path = f"/api/v1/widget/accounts/{account}"
    query = "details=true" if details else ""
    return urlunparse(("https", "apply.workable.com", path, "", query, ""))


def greenhouse_token(careers_url: str) -> Optional[str]:
    """Board token from a Greenhouse board or Job Board API URL; None when it is not one."""
    host = _host(careers_url)
    if host not in _GREENHOUSE_BOARD_HOSTS:
        return None
    match = _GREENHOUSE_TOKEN.match(_path(careers_url))
    if not match:
        return None
    token = match.group(1)
    if token.lower() in {"v1", "boards", "jobs"}:
        return None
    return token


def greenhouse_list_url(token: str, *, content: bool = True) -> str:
    path = f"/v1/boards/{token}/jobs"
    query = "content=true" if content else ""
    return urlunparse(("https", "boards-api.greenhouse.io", path, "", query, ""))


def greenhouse_job_url(token: str, job_id: str | int) -> str:
    path = f"/v1/boards/{token}/jobs/{job_id}"
    return urlunparse(("https", "boards-api.greenhouse.io", path, "", "", ""))


def looks_like_workable(data: Any) -> bool:
    if not isinstance(data, dict) or "jobs" not in data:
        return False
    jobs = data.get("jobs")
    if not isinstance(jobs, list):
        return False
    if "name" in data:
        return True
    return any(isinstance(item, dict) and "shortcode" in item for item in jobs)


def looks_like_greenhouse(data: Any) -> bool:
    if not isinstance(data, dict) or "jobs" not in data:
        return False
    jobs = data.get("jobs")
    if not isinstance(jobs, list):
        return False
    if isinstance(data.get("meta"), dict):
        return True
    return any(
        isinstance(item, dict)
        and ("absolute_url" in item or "internal_job_id" in item)
        for item in jobs
    )


def jobs_from_workable(data: Dict, account: str) -> List[Dict]:
    """One candidate per shortcode; locations merged; hidden places dropped."""
    grouped: Dict[str, Dict] = {}
    order: List[str] = []
    for item in data.get("jobs") or []:
        if not isinstance(item, dict):
            continue
        shortcode = str(item.get("shortcode") or "").strip()
        title = str(item.get("title") or "").strip()
        if not shortcode or not title:
            continue
        place = _workable_place(item)
        if shortcode not in grouped:
            apply_url = (
                f"https://apply.workable.com/{account}/j/{shortcode}"
            )
            job: Dict[str, Any] = {
                "title": title,
                "apply_url": apply_url,
                "record_class": "api",
                "reference": shortcode,
            }
            employment = str(item.get("employment_type") or "").strip()
            if employment:
                job["employment_type"] = employment
            if item.get("telecommuting") is True:
                job["is_remote"] = True
                if not place:
                    place = "Remote"
            posted = iso_day(item.get("published_on") or item.get("created_at"))
            if posted:
                job["posted_on"] = posted
            description = str(item.get("description") or "").strip()
            if description:
                job["description"] = description
            if place:
                job["location_raw"] = place
                job["locations"] = [place]
            grouped[shortcode] = job
            order.append(shortcode)
            continue
        if place:
            existing = grouped[shortcode]
            places = list(existing.get("locations") or [])
            if place not in places:
                places.append(place)
                existing["locations"] = places
                existing["location_raw"] = "; ".join(places)
    return [grouped[key] for key in order]


def jobs_from_greenhouse(data: Dict, token: str) -> Tuple[List[Dict], Optional[Dict]]:
    """Candidates from a Greenhouse list body, plus a completeness report when meta.total exists."""
    jobs: List[Dict] = []
    for item in data.get("jobs") or []:
        if not isinstance(item, dict):
            continue
        job = _greenhouse_item(item, token)
        if job:
            jobs.append(job)
    report = _greenhouse_report(jobs, data)
    return jobs, report


def greenhouse_posted_on(item: Dict) -> Optional[str]:
    """Employer posting day from first_published only — never updated_at."""
    return iso_day(item.get("first_published"))


def merge_greenhouse_detail(job: Dict, detail: Dict) -> None:
    """Fill posted_on (and missing description) from a single-job body, in place."""
    posted = greenhouse_posted_on(detail)
    if posted and not job.get("posted_on"):
        job["posted_on"] = posted
    if not job.get("description"):
        content = detail.get("content")
        if content:
            text = html.unescape(str(content)).strip()
            if text:
                job["description"] = text
    deadline = iso_day(detail.get("application_deadline"))
    if deadline and not job.get("deadline"):
        job["deadline"] = deadline


def _greenhouse_item(item: Dict, token: str) -> Optional[Dict]:
    title = str(item.get("title") or "").strip()
    if not title:
        return None
    apply_url = str(item.get("absolute_url") or "").strip()
    job_id = item.get("id")
    if not apply_url and job_id not in (None, ""):
        apply_url = f"https://job-boards.greenhouse.io/{token}/jobs/{job_id}"
    if not apply_url:
        return None
    job: Dict[str, Any] = {
        "title": title,
        "apply_url": apply_url,
        "record_class": "api",
    }
    if job_id not in (None, ""):
        job["reference"] = str(job_id)
    location = item.get("location")
    if isinstance(location, dict):
        place = str(location.get("name") or "").strip()
    else:
        place = str(location or "").strip()
    if not place:
        place = _greenhouse_office_place(item)
    if place:
        job["location_raw"] = place
    posted = greenhouse_posted_on(item)
    if posted:
        job["posted_on"] = posted
    content = item.get("content")
    if content:
        text = html.unescape(str(content)).strip()
        if text:
            job["description"] = text
    language = str(item.get("language") or "").strip()
    if language:
        job["advert_language"] = language
    deadline = iso_day(item.get("application_deadline"))
    if deadline:
        job["deadline"] = deadline
    return job


def _greenhouse_office_place(item: Dict) -> str:
    offices = item.get("offices")
    if not isinstance(offices, list):
        return ""
    names: List[str] = []
    for office in offices:
        if not isinstance(office, dict):
            continue
        name = str(office.get("name") or office.get("location") or "").strip()
        if name and name not in names:
            names.append(name)
    return "; ".join(names)


def _greenhouse_report(jobs: List[Dict], data: Dict) -> Optional[Dict]:
    meta = data.get("meta")
    if not isinstance(meta, dict):
        return None
    total = meta.get("total")
    if isinstance(total, bool):
        return None
    if isinstance(total, str) and total.isdigit():
        total = int(total)
    if not isinstance(total, int) or total < 0:
        return None
    complete = len(jobs) >= total
    return {
        "pages": 1,
        "expected": total,
        "complete": complete,
        "stop": None if complete else "fewer rows than stated",
    }


def _workable_place(item: Dict) -> str:
    places: List[str] = []
    for entry in item.get("locations") or []:
        if not isinstance(entry, dict) or entry.get("hidden") is True:
            continue
        label = _place_label(
            entry.get("city"), entry.get("region"), entry.get("country")
        )
        if label and label not in places:
            places.append(label)
    if places:
        return "; ".join(places)
    return _place_label(item.get("city"), item.get("state"), item.get("country"))


def _place_label(*parts: Any) -> str:
    bits = [str(part).strip() for part in parts if part not in (None, "")]
    return ", ".join(bits)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child_text(element: ElementTree.Element, *names: str) -> str:
    wanted = {name.lower() for name in names}
    for child in list(element):
        if _local(child.tag).lower() in wanted:
            text = "".join(child.itertext()).strip()
            if text:
                return text
    return ""


def _epoch_day(value: Any) -> Optional[str]:
    """YYYY-MM-DD from Lever's millisecond epoch, or iso_day for other shapes."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            seconds = float(value)
            if seconds > 1e12:
                seconds /= 1000.0
            return datetime.fromtimestamp(seconds, tz=timezone.utc).date().isoformat()
        except (OverflowError, OSError, ValueError):
            return None
    text = str(value or "").strip()
    if text.isdigit():
        return _epoch_day(int(text))
    return iso_day(value)


def teamtailor_account(careers_url: str) -> Optional[str]:
    """Subdomain of *.teamtailor.com; None for vendor labels or non-Teamtailor hosts."""
    host = _host(careers_url)
    if not host.endswith(".teamtailor.com"):
        return None
    label = host.split(".", 1)[0]
    if not label or label in _TEAMTAILOR_BLOCKED:
        return None
    return label


def teamtailor_feed_url(account: str) -> str:
    return urlunparse(
        ("https", f"{account}.teamtailor.com", "/jobs.rss", "", "", "")
    )


def teamtailor_request_url(careers_url: str) -> Optional[str]:
    """Canonical jobs.rss URL for a Teamtailor board (https, no query)."""
    account = teamtailor_account(careers_url)
    if not account:
        return None
    return teamtailor_feed_url(account)


def lever_site(careers_url: str) -> Optional[Tuple[str, str]]:
    """(site, api_host) from jobs.lever.co/{site} or the EU board; None when not Lever."""
    host = _host(careers_url)
    api_host = _LEVER_BOARD_HOSTS.get(host)
    if not api_host:
        return None
    match = _LEVER_SITE.match(_path(careers_url))
    if not match:
        return None
    site = match.group(1)
    if site.lower() in {"v0", "postings"}:
        return None
    return site, api_host


def lever_feed_url(site: str, api_host: str = "api.lever.co") -> str:
    return urlunparse(
        ("https", api_host, f"/v0/postings/{site}", "", "mode=json", "")
    )


def personio_account(careers_url: str) -> Optional[Tuple[str, str]]:
    """(account, tld) from {account}.jobs.personio.{com|de}; None when not Personio."""
    host = _host(careers_url)
    match = _PERSONIO_HOST.match(host)
    if not match:
        return None
    return match.group(1), match.group(2).lower()


def personio_feed_url(account: str, tld: str = "com") -> str:
    return urlunparse(
        ("https", f"{account}.jobs.personio.{tld}", "/xml", "", "", "")
    )


def looks_like_teamtailor(data: Any) -> bool:
    """True when body is Teamtailor RSS (root rss with item children)."""
    if isinstance(data, ElementTree.Element):
        root = data
    elif isinstance(data, str):
        try:
            root = ElementTree.fromstring(data)
        except ElementTree.ParseError:
            return False
    else:
        return False
    if _local(root.tag).lower() != "rss":
        return False
    return any(_local(el.tag).lower() == "item" for el in root.iter())


def looks_like_lever(data: Any) -> bool:
    if not isinstance(data, list) or not data:
        return False
    return any(
        isinstance(item, dict) and ("hostedUrl" in item or "text" in item)
        for item in data
    )


def looks_like_personio(data: Any) -> bool:
    if isinstance(data, ElementTree.Element):
        root = data
    elif isinstance(data, str):
        try:
            root = ElementTree.fromstring(data)
        except ElementTree.ParseError:
            return False
    else:
        return False
    if _local(root.tag).lower() != "workzag-jobs":
        return False
    return any(_local(el.tag).lower() == "position" for el in root.iter())


def jobs_from_teamtailor(body: str) -> List[Dict]:
    """Candidates from a Teamtailor jobs.rss body. Links are not an admission family."""
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError:
        return []
    jobs: List[Dict] = []
    for item in root.iter():
        if _local(item.tag).lower() != "item":
            continue
        title = _child_text(item, "title")
        apply_url = _child_text(item, "link")
        if not title or not apply_url:
            continue
        job: Dict[str, Any] = {
            "title": title,
            "apply_url": apply_url,
            "record_class": "api",
        }
        guid = _child_text(item, "guid")
        if guid:
            job["reference"] = guid
        posted = iso_day(_child_text(item, "pubDate"))
        if posted:
            job["posted_on"] = posted
        description = _child_text(item, "description")
        if description:
            job["description"] = html.unescape(description).strip()
        place = _teamtailor_place(item)
        remote = _teamtailor_remote(item)
        if remote and not place:
            place = "Remote"
            job["is_remote"] = True
        elif remote:
            job["is_remote"] = True
        if place:
            places = [part.strip() for part in place.split(";") if part.strip()]
            job["location_raw"] = place
            if places:
                job["locations"] = places
        jobs.append(job)
    return jobs


def jobs_from_lever(data: List) -> List[Dict]:
    """Candidates from Lever's public postings JSON array."""
    jobs: List[Dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        title = str(item.get("text") or "").strip()
        apply_url = str(item.get("hostedUrl") or item.get("applyUrl") or "").strip()
        if not title or not apply_url:
            continue
        job: Dict[str, Any] = {
            "title": title,
            "apply_url": apply_url,
            "record_class": "api",
        }
        job_id = item.get("id")
        if job_id not in (None, ""):
            job["reference"] = str(job_id)
        posted = _epoch_day(item.get("createdAt"))
        if posted:
            job["posted_on"] = posted
        description = _lever_description(item)
        if description:
            job["description"] = description
        categories = item.get("categories")
        place = ""
        if isinstance(categories, dict):
            place = str(categories.get("location") or "").strip()
            commitment = str(categories.get("commitment") or "").strip()
            if commitment:
                job["employment_type"] = commitment
        workplace = str(item.get("workplaceType") or "").strip().lower()
        if workplace == "remote":
            job["is_remote"] = True
            if not place:
                place = "Remote"
        if place:
            job["location_raw"] = place
            job["locations"] = [place]
        jobs.append(job)
    return jobs


def jobs_from_personio(body: str, account: str, tld: str = "com") -> List[Dict]:
    """Candidates from a Personio workzag-jobs XML body."""
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError:
        return []
    host = f"{account}.jobs.personio.{tld}"
    jobs: List[Dict] = []
    for position in root.iter():
        if _local(position.tag).lower() != "position":
            continue
        title = _child_text(position, "name")
        job_id = _child_text(position, "id")
        if not title or not job_id:
            continue
        apply_url = f"https://{host}/job/{job_id}"
        job: Dict[str, Any] = {
            "title": title,
            "apply_url": apply_url,
            "record_class": "api",
            "reference": job_id,
        }
        place = _personio_place(position)
        if place:
            places = [part.strip() for part in place.split(";") if part.strip()]
            job["location_raw"] = place
            if places:
                job["locations"] = places
        employment = _child_text(position, "employmentType")
        if employment:
            job["employment_type"] = employment
        posted = iso_day(_child_text(position, "createdAt"))
        if posted:
            job["posted_on"] = posted
        description = _personio_description(position)
        if description:
            job["description"] = description
        jobs.append(job)
    return jobs


def _teamtailor_place(item: ElementTree.Element) -> str:
    names: List[str] = []
    for el in item.iter():
        if _local(el.tag).lower() != "location":
            continue
        # Prefer the location's own name; else city, country.
        label = _child_text(el, "name")
        if not label:
            label = _place_label(_child_text(el, "city"), _child_text(el, "country"))
        if label and label not in names:
            names.append(label)
    return "; ".join(names)


def _teamtailor_remote(item: ElementTree.Element) -> bool:
    for el in item.iter():
        if _local(el.tag).lower() != "remotestatus":
            continue
        value = "".join(el.itertext()).strip().lower().replace(" ", "_")
        return value in _REMOTE_STATUS
    return False


def _lever_description(item: Dict) -> str:
    parts: List[str] = []
    for key in ("description", "descriptionPlain"):
        text = str(item.get(key) or "").strip()
        if text:
            parts.append(html.unescape(text))
            break
    lists = item.get("lists")
    if isinstance(lists, list):
        for entry in lists:
            if not isinstance(entry, dict):
                continue
            heading = str(entry.get("text") or "").strip()
            content = str(entry.get("content") or "").strip()
            if heading:
                parts.append(f"<h3>{html.unescape(heading)}</h3>")
            if content:
                parts.append(html.unescape(content))
    additional = str(item.get("additional") or "").strip()
    if additional:
        parts.append(html.unescape(additional))
    return "\n".join(part for part in parts if part).strip()


def _personio_place(position: ElementTree.Element) -> str:
    places: List[str] = []
    office = _child_text(position, "office")
    if office:
        places.append(office)
    for el in position:
        if _local(el.tag).lower() != "additionaloffices":
            continue
        for child in el:
            if _local(child.tag).lower() != "office":
                continue
            name = "".join(child.itertext()).strip()
            if name and name not in places:
                places.append(name)
    return "; ".join(places)


def _personio_description(position: ElementTree.Element) -> str:
    parts: List[str] = []
    for el in position.iter():
        if _local(el.tag).lower() != "value":
            continue
        text = "".join(el.itertext()).strip()
        if text:
            parts.append(html.unescape(text))
    return "\n".join(parts).strip()
