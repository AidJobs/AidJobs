"""Read evidence from one saved detail page. No fetch, log, or admission.

apply_detail_reading fills blank listing fields from exactly one reader result.
"""
import json

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

_LABELS = {
    "Location": "locations",
    "Application Deadline": "deadlines",
    "Closing Date": "deadlines",
    "Contract type": "employment_types",
    "Contract Type": "employment_types",
    "Type of Contract": "employment_types",
}
_ADDRESS_KEYS = ("addressLocality", "addressRegion", "addressCountry")


def read_detail_page(html: str) -> list[dict]:
    """Return each qualifying posting, or one visible-field result when none qualify."""
    if not isinstance(html, str) or not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    postings = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        postings.extend(_postings_from_script(script))
    qualified = [row for row in (_posting_result(item) for item in postings) if row]
    if qualified:
        return qualified
    visible = _visible_result(soup)
    return [visible] if visible else []


def _postings_from_script(script: Tag) -> list[dict]:
    raw = script.string if script.string is not None else script.get_text()
    try:
        data = json.loads(raw or "")
    except json.JSONDecodeError:
        return []
    found = []
    if isinstance(data, list):
        found.extend(item for item in data if isinstance(item, dict) and _is_posting(item))
        return found
    if not isinstance(data, dict):
        return []
    if _is_posting(data):
        found.append(data)
    graph = data.get("@graph")
    if isinstance(graph, list):
        found.extend(item for item in graph if isinstance(item, dict) and _is_posting(item))
    return found


def _is_posting(data: dict) -> bool:
    kind = data.get("@type")
    if isinstance(kind, str):
        return kind == "JobPosting"
    if isinstance(kind, list):
        return any(item == "JobPosting" for item in kind)
    return False


def _posting_result(data: dict) -> dict | None:
    title = _plain(data.get("title"))
    if title is None:
        return None
    row = {
        "title": title,
        "locations": _locations(data.get("jobLocation")),
        "deadlines": _texts(data.get("validThrough")),
        "employment_types": _texts(data.get("employmentType")),
    }
    if not _has_evidence(row):
        return None
    return row


def _locations(value) -> list[str]:
    if isinstance(value, str):
        text = _plain(value)
        return [text] if text else []
    if isinstance(value, list):
        found = []
        for item in value:
            found.extend(_locations(item))
        return found
    if isinstance(value, dict) and value:
        text = _location_object(value)
        return [text] if text else []
    return []


def _location_object(value: dict) -> str | None:
    address = value.get("address")
    if isinstance(address, dict):
        parts = [_plain(address.get(key)) for key in _ADDRESS_KEYS]
        parts = [part for part in parts if part]
        if parts:
            return ", ".join(parts)
    name = _plain(value.get("name"))
    if name:
        return name
    if isinstance(address, dict):
        return _plain(address.get("streetAddress"))
    return None


def _texts(value) -> list[str]:
    if isinstance(value, str):
        text = _plain(value)
        return [text] if text else []
    if isinstance(value, list):
        return [text for item in value if (text := _plain(item))]
    return []


def _visible_result(soup: BeautifulSoup) -> dict | None:
    heading = soup.find("h1")
    title = _plain(heading.get_text(" ", strip=True)) if heading and not _hidden(heading) else None
    if title is None:
        return None
    row = {"title": title, "locations": [], "deadlines": [], "employment_types": []}
    for tag in soup.find_all(True):
        if _hidden(tag):
            continue
        parsed = _label_text(_own_text(tag))
        if parsed is None:
            continue
        label, inline = parsed
        value = _evidence(_plain(inline) if inline is not None else _sibling_value(tag))
        if value is None:
            continue
        row[_LABELS[label]].append(value)
    if not _has_evidence(row):
        return None
    return row


def _label_text(text: str) -> tuple[str, str | None] | None:
    if ":" in text:
        label, _, rest = text.partition(":")
        label = label.strip()
        if label not in _LABELS:
            return None
        rest = rest.strip()
        return label, rest or None
    if text in _LABELS:
        return text, None
    return None


def _sibling_value(tag: Tag) -> str | None:
    sibling = tag.next_sibling
    while _gap(sibling):
        sibling = sibling.next_sibling
    if isinstance(sibling, NavigableString):
        return _plain(str(sibling))
    if isinstance(sibling, Tag) and sibling.name not in {"script", "style"}:
        return _plain(sibling.get_text(" ", strip=True))
    return None


def _own_text(tag: Tag) -> str:
    parts = [str(child) for child in tag.children if isinstance(child, NavigableString)]
    return _clean(" ".join(parts))


def _hidden(tag: Tag) -> bool:
    current = tag
    while isinstance(current, Tag):
        if current.name in {"script", "style"}:
            return True
        current = current.parent
    return False


def _gap(node) -> bool:
    if isinstance(node, Comment):
        return True
    return isinstance(node, NavigableString) and not str(node).strip()


def _evidence(value: str | None) -> str | None:
    if value is None or value == "All":
        return None
    return value


def _has_evidence(row: dict) -> bool:
    return bool(row["locations"] or row["deadlines"] or row["employment_types"])


def _plain(value) -> str | None:
    if not isinstance(value, str):
        return None
    text = _clean(value)
    return text or None


def _clean(value: str) -> str:
    return " ".join(value.split())


_LISTING_FIELDS = (
    ("location_raw", "locations"),
    ("deadline", "deadlines"),
    ("employment_type", "employment_types"),
)


def apply_detail_reading(job: dict, results: list) -> dict:
    """Return the listing row, filling blank evidence from one reader result.

    Several results leave the row unchanged. Title, apply URL, and reference
    are never written. The stored value is the first non-blank item in the
    order read_detail_page returned it.
    """
    if not isinstance(job, dict):
        return {}
    updated = dict(job)
    if not isinstance(results, list) or len(results) != 1 or not isinstance(results[0], dict):
        return updated
    row = results[0]
    for field, source in _LISTING_FIELDS:
        if not _blank_listing(updated.get(field)):
            continue
        value = _first_nonblank(row.get(source))
        if value is not None:
            updated[field] = value
    return updated


def _blank_listing(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


def _first_nonblank(values) -> str | None:
    if isinstance(values, str):
        return _plain(values)
    if not isinstance(values, list):
        return None
    for item in values:
        text = _plain(item)
        if text is not None:
            return text
    return None
