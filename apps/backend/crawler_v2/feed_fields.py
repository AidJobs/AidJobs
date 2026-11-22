"""Turn an RSS entry or a JSON job object into the field-contract shape (W-35 3b).

Dates become ISO calendar days here, before the shared save step, so the day-first deadline
parser never sees an ambiguous month/day string from a feed. No network and no database.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

from crawler_v2.parse_lock import DATEPARSER_LOCK

# ISO calendar day (optional time/zone ignored), same idea as the HTML crawler's check.
_ISO_DAY = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$")
_HAS_DIGIT = re.compile(r"\d")

_LOCATION_PATTERNS = (
    re.compile(
        r"[Ll]ocation[:\s]+([A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)?)"
    ),
    re.compile(
        r"[Dd]uty\s+[Ss]tation[:\s]+([A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)?)"
    ),
)
_DEADLINE_PATTERNS = (
    re.compile(
        r"[Dd]eadline[:\s]+(\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})"
    ),
    re.compile(
        r"[Cc]losing\s+[Dd]ate[:\s]+(\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})"
    ),
    re.compile(
        r"[Aa]pply\s+[Bb]y[:\s]+(\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})"
    ),
)

_TITLE_KEYS = ("title", "name", "position", "job_title", "position_title")
_URL_KEYS = ("apply_url", "application_url", "url", "link", "job_url", "href")
_LOCATION_KEYS = ("location", "location_raw", "duty_station", "city", "country", "place")
_DEADLINE_KEYS = ("deadline", "closing_date", "application_deadline", "due_date", "validThrough")
_DESCRIPTION_KEYS = ("description", "summary", "content", "body")
_EMPLOYMENT_KEYS = ("employment_type", "employmentType", "contract_type", "job_type")
# Bare "count" is often a page size, not the catalogue total — omit it so a short page
# cannot become a counting crawl (contract §6).
_TOTAL_KEYS = ("total", "totalCount", "total_count", "jobCount", "job_count")


def iso_day(value: Any) -> Optional[str]:
    """YYYY-MM-DD when value names a calendar day; None when it does not."""
    if value is None or value is False:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (tuple, list)) and len(value) >= 3:
        try:
            return date(int(value[0]), int(value[1]), int(value[2])).isoformat()
        except (TypeError, ValueError):
            return None
    text = str(value).strip()
    if not text:
        return None
    match = _ISO_DAY.match(text)
    if match:
        try:
            return date(int(match.group(1)), int(match.group(2)), int(match.group(3))).isoformat()
        except ValueError:
            return None
    if not _HAS_DIGIT.search(text):
        return None
    try:
        import dateparser
    except ImportError:
        return None
    # Prefer year-month-day so a feed's ISO-like strings stay correct; ambiguous numeric
    # dates still become an ISO day before the shared save (plan: never hand US dates to DMY).
    with DATEPARSER_LOCK:
        parsed = dateparser.parse(
            text,
            languages=["en"],
            settings={
                "DATE_ORDER": "YMD",
                "PREFER_DATES_FROM": "future",
                "RETURN_AS_TIMEZONE_AWARE": False,
            },
        )
        if parsed is None:
            parsed = dateparser.parse(
                text,
                languages=["en"],
                settings={
                    "DATE_ORDER": "DMY",
                    "PREFER_DATES_FROM": "future",
                    "RETURN_AS_TIMEZONE_AWARE": False,
                },
            )
    if parsed is None:
        return None
    return parsed.date().isoformat()


def _entry_get(entry: Any, name: str) -> Any:
    value = getattr(entry, name, None)
    if value not in (None, ""):
        return value
    if isinstance(entry, dict):
        return entry.get(name)
    return None


def job_from_rss_entry(entry: Any, base_url: str) -> Optional[Dict]:
    """One feed entry as a candidate, or None without a title and apply link."""
    title = _text(_entry_get(entry, "title"))
    link = _text(_entry_get(entry, "link"))
    if not title or not link:
        return None
    apply_url = urljoin(base_url, link)
    description = _text(
        _entry_get(entry, "description") or _entry_get(entry, "summary")
    )
    job: Dict[str, Any] = {
        "title": title,
        "apply_url": apply_url,
        "record_class": "rss",
    }
    if description:
        job["description"] = description
        location = _first_match(_LOCATION_PATTERNS, description)
        if location:
            job["location_raw"] = location
        deadline = iso_day(_first_match(_DEADLINE_PATTERNS, description))
        if deadline:
            job["deadline"] = deadline
    published = _rss_published(entry)
    if published:
        job["posted_on"] = published
    return job


def job_from_json_item(item: Dict, base_url: str) -> Optional[Dict]:
    """One JSON object as a candidate, or None without a title and apply link."""
    if not isinstance(item, dict):
        return None
    title = _first_value(item, _TITLE_KEYS)
    if not title:
        return None
    apply_url = _first_value(item, _URL_KEYS)
    if not apply_url or apply_url.startswith("#") or apply_url.lower().startswith("javascript:"):
        apply_url = None
        for id_key in ("id", "job_id", "position_id"):
            if id_key in item and item[id_key] not in (None, ""):
                apply_url = urljoin(base_url.rstrip("/") + "/", str(item[id_key]))
                break
    if not apply_url:
        return None
    apply_url = urljoin(base_url, apply_url)
    job: Dict[str, Any] = {
        "title": title,
        "apply_url": apply_url,
        "record_class": "api",
    }
    location = _first_value(item, _LOCATION_KEYS)
    if location:
        job["location_raw"] = location
    deadline = iso_day(_first_value(item, _DEADLINE_KEYS))
    if deadline:
        job["deadline"] = deadline
    description = _first_value(item, _DESCRIPTION_KEYS)
    if description:
        job["description"] = description
    employment = _first_value(item, _EMPLOYMENT_KEYS)
    if employment:
        job["employment_type"] = employment
    posted = iso_day(
        item.get("posted_on")
        or item.get("published_at")
        or item.get("publishedAt")
        or item.get("first_published")
        or item.get("updated_at")
    )
    if posted:
        job["posted_on"] = posted
    return job


def jobs_array(data: Any) -> List[Dict]:
    """The list of job objects inside a common JSON listing shape."""
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("jobs", "results", "items", "data", "positions", "vacancies"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    nested = data.get("data")
    if isinstance(nested, dict):
        for key in ("jobs", "results", "items"):
            value = nested.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def stated_total(data: Any) -> Optional[int]:
    """A listing total the JSON states, when it is a non-negative integer."""
    if not isinstance(data, dict):
        return None
    for key in _TOTAL_KEYS:
        value = data.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int) and value >= 0:
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    for nest_key in ("meta", "pagination", "paging"):
        nested = data.get(nest_key)
        if not isinstance(nested, dict):
            continue
        for key in _TOTAL_KEYS:
            value = nested.get(key)
            if isinstance(value, bool):
                continue
            if isinstance(value, int) and value >= 0:
                return value
            if isinstance(value, str) and value.isdigit():
                return int(value)
    return None


def json_listing_report(jobs: List[Dict], data: Any) -> Dict:
    """Completeness for a generic JSON listing (W-39).

    When the body states a total, complete only if the candidates cover it and no paging
    signal remains. Without a total, the report is incomplete (generic JSON is not a named
    closed catalogue).
    """
    from crawler_v2.listing_completeness import incomplete, json_has_paging

    expected = stated_total(data)
    if expected is None:
        return incomplete("no stated total", expected=len(jobs) if jobs else None)
    if json_has_paging(data):
        return incomplete("paging not followed", expected=expected)
    if len(jobs) >= expected:
        return {
            "pages": 1,
            "expected": expected,
            "complete": True,
            "stop": None,
        }
    return incomplete("fewer rows than stated", expected=expected)


def _rss_published(entry: Any) -> Optional[str]:
    for attr in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, attr, None)
        if parsed:
            day = iso_day(parsed)
            if day:
                return day
    if isinstance(entry, dict):
        for key in ("published_parsed", "updated_parsed", "published", "updated", "pubDate"):
            day = iso_day(entry.get(key))
            if day:
                return day
    for attr in ("published", "updated"):
        day = iso_day(getattr(entry, attr, None))
        if day:
            return day
    return None


def _text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _first_value(item: Dict, keys: Tuple[str, ...]) -> Optional[str]:
    for key in keys:
        if key not in item or item[key] in (None, ""):
            continue
        value = item[key]
        if isinstance(value, (dict, list)):
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _first_match(patterns: Tuple[re.Pattern, ...], text: str) -> Optional[str]:
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return match.group(1).strip()
    return None
