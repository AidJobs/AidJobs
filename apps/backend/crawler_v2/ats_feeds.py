"""Public ATS job-feed URL recognition and field mapping (ledger W-38).

Sources keep their normal board URLs; readers map them to documented GET feeds.
No network and no database.
"""
from __future__ import annotations

import html
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import unquote, urlparse, urlunparse

from crawler_v2.feed_fields import iso_day

_WORKABLE_HOSTS = frozenset({"apply.workable.com", "www.workable.com", "workable.com"})
_GREENHOUSE_BOARD_HOSTS = frozenset({
    "job-boards.greenhouse.io",
    "boards.greenhouse.io",
    "boards-api.greenhouse.io",
})

_WORKABLE_ACCOUNT = re.compile(
    r"^/(?:api/v1/widget/accounts/|api/accounts/)?([A-Za-z0-9][A-Za-z0-9_-]*)/?$",
    re.I,
)
_GREENHOUSE_TOKEN = re.compile(
    r"^/(?:v1/boards/)?([A-Za-z0-9][A-Za-z0-9_-]*)(?:/jobs(?:/(\d+))?)?/?$",
    re.I,
)


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
