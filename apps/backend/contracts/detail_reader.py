"""Read evidence from one saved detail page. No fetch, log, or admission.

apply_detail_reading fills blank listing fields from exactly one reader result.
The visible read also takes the validThrough of a page's one microdata JobPosting.

read_detail_fields also returns, for each of those results, the captured fields (W-37):
description, posting date, salary, declared language, every location, a remote marker, and
the one published place a city may come from. They never decide whether a result qualifies,
so admission sees exactly what read_detail_page returns.
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
_SALARY_LABELS = {"Salary": "salaries"}
_ADDRESS_KEYS = ("addressLocality", "addressRegion", "addressCountry")
_REMOTE_TYPE = "TELECOMMUTE"


def read_detail_page(html: str) -> list[dict]:
    """Return each qualifying posting, or one visible-field result when none qualify."""
    return read_detail_fields(html)[0]


def read_detail_fields(html: str) -> tuple[list[dict], list[dict]]:
    """read_detail_page's results, and the captured fields of each, in the same order."""
    if not isinstance(html, str) or not html:
        return [], []
    soup = BeautifulSoup(html, "html.parser")
    postings = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        postings.extend(_postings_from_script(script))
    pairs = [
        (row, _posting_fields(item, row))
        for item in postings
        if (row := _posting_result(item))
    ]
    if pairs:
        page_salary = _single(_label_values(soup, _SALARY_LABELS)["salaries"])
        for _, fields in pairs:
            if fields["salary"] is None:
                fields["salary"] = page_salary
        return [row for row, _ in pairs], [fields for _, fields in pairs]
    visible = _visible_result(soup)
    if not visible:
        return [], []
    return [visible], [_visible_fields(soup, visible)]


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


def posting_locations(value) -> list[str]:
    """Every location of a JSON-LD jobLocation, as read_detail_page reads them."""
    return _locations(value)


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


def _posting_fields(data: dict, row: dict) -> dict:
    description = data.get("description")
    if not isinstance(description, str) or not description.strip():
        description = None
    return {
        "description": description,
        "posted": _texts(data.get("datePosted")),
        "salary": _salary(data.get("baseSalary"), data.get("salaryCurrency")),
        "language": _language(data.get("inLanguage")),
        "remote": _REMOTE_TYPE in _texts(data.get("jobLocationType")),
        "locations": list(row["locations"]),
        "place": _published_place(data.get("jobLocation")),
    }


def _salary(value, currency) -> str | None:
    """baseSalary as published: an amount or a range, with its currency and unit."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        value = str(value)
    if isinstance(value, str):
        return _plain(value)
    if not isinstance(value, dict):
        return None
    unit = None
    amount = value.get("value")
    if isinstance(amount, dict):
        unit = _plain(amount.get("unitText"))
        if amount.get("minValue") is not None and amount.get("maxValue") is not None:
            amount = f"{amount['minValue']} - {amount['maxValue']}"
        else:
            amount = amount.get("value")
    elif value.get("minValue") is not None and value.get("maxValue") is not None:
        amount = f"{value['minValue']} - {value['maxValue']}"
    if isinstance(amount, (int, float)) and not isinstance(amount, bool):
        amount = str(amount)
    amount = _plain(amount)
    if amount is None:
        return None
    unit = unit or _plain(value.get("unitText"))
    parts = [_plain(value.get("currency")) or _plain(currency), amount, unit]
    return " ".join(part for part in parts if part)


def _language(value) -> str | None:
    if isinstance(value, dict):
        value = value.get("alternateName") or value.get("name")
    text = _plain(value)
    return text if text and len(text) <= 35 else None


def _published_place(value) -> dict | None:
    """The one structured location and its published locality, when there is exactly one."""
    if isinstance(value, list):
        items = [item for item in value if item not in ({}, None, "")]
        if len(items) != 1:
            return None
        value = items[0]
    if not isinstance(value, dict):
        return None
    address = value.get("address")
    if not isinstance(address, dict):
        return None
    locality = _plain(address.get("addressLocality"))
    location = _location_object(value)
    if locality is None or location is None:
        return None
    return {"location": location, "locality": locality}


def _visible_result(soup: BeautifulSoup) -> dict | None:
    heading = soup.find("h1")
    title = _plain(heading.get_text(" ", strip=True)) if heading and not _hidden(heading) else None
    if title is None:
        return None
    row = {"title": title, **_label_values(soup, _LABELS)}
    row["deadlines"].extend(_microdata_deadlines(soup, heading, title))
    if not _has_evidence(row):
        return None
    return row


def _label_values(soup: BeautifulSoup, labels: dict) -> dict:
    found = {key: [] for key in labels.values()}
    for tag in soup.find_all(True):
        if _hidden(tag):
            continue
        parsed = _label_text(_own_text(tag), labels)
        if parsed is None:
            continue
        label, inline = parsed
        value = _evidence(_plain(inline) if inline is not None else _sibling_value(tag))
        if value is None:
            continue
        found[labels[label]].append(value)
    return found


def _visible_fields(soup: BeautifulSoup, row: dict) -> dict:
    posting = _own_microdata_posting(soup, soup.find("h1"), row["title"])
    description = None
    language = None
    posted: list[str] = []
    remote = False
    if posting is not None:
        posted = _microdata_values(posting, "datePosted")
        remote = _REMOTE_TYPE in _microdata_values(posting, "jobLocationType")
        language = _language(_single(_microdata_values(posting, "inLanguage")))
        element = _single_element(posting, "description")
        if element is not None:
            content = _plain(element.get("content"))
            if content:
                description = content
            elif _plain(element.get_text(" ")):
                description = element.decode_contents()
            language = language or _language(element.get("lang") or element.get("xml:lang"))
    return {
        "description": description,
        "posted": posted,
        "salary": _single(_label_values(soup, _SALARY_LABELS)["salaries"]),
        "language": language,
        "remote": remote,
        "locations": list(row["locations"]),
        "place": None,
    }


def _single(values: list[str]) -> str | None:
    """The one distinct value, or None when there are none or several."""
    distinct = list(dict.fromkeys(values))
    return distinct[0] if len(distinct) == 1 else None


def _microdata_deadlines(soup: BeautifulSoup, heading: Tag, title: str) -> list[str]:
    """validThrough content of the page's only microdata JobPosting, when it is the page's own job.

    A posting elsewhere on the page ("similar jobs") must not lend its deadline to the heading.
    """
    posting = _own_microdata_posting(soup, heading, title)
    if posting is None:
        return []
    found = []
    for tag in posting.find_all(attrs={"itemprop": "validThrough"}):
        if _item_of(tag) is not posting:
            continue
        text = _plain(tag.get("content"))
        if text and any(char.isdigit() for char in text):
            found.append(text)
    return found


def _own_microdata_posting(soup: BeautifulSoup, heading: Tag | None, title: str) -> Tag | None:
    if heading is None:
        return None
    postings = [
        tag
        for tag in soup.find_all(attrs={"itemscope": True})
        if _microdata_posting(tag) and not _unrendered(tag)
    ]
    if len(postings) != 1:
        return None
    posting = postings[0]
    inside = any(parent is posting for parent in heading.parents)
    if not inside and _microdata_title(posting) != title:
        return None
    return posting


def _microdata_values(posting: Tag, prop: str) -> list[str]:
    found = []
    for tag in posting.find_all(attrs={"itemprop": prop}):
        if _item_of(tag) is not posting or _unrendered(tag):
            continue
        text = _plain(tag.get("content")) or _plain(tag.get_text(" ", strip=True))
        if text:
            found.append(text)
    return found


def _single_element(posting: Tag, prop: str) -> Tag | None:
    tags = [
        tag
        for tag in posting.find_all(attrs={"itemprop": prop})
        if _item_of(tag) is posting and not _unrendered(tag)
    ]
    return tags[0] if len(tags) == 1 else None


def _item_of(tag: Tag) -> Tag | None:
    return tag.find_parent(attrs={"itemscope": True})


def _unrendered(tag: Tag) -> bool:
    return _hidden(tag) or tag.find_parent(["noscript", "template"]) is not None


def _microdata_title(posting: Tag) -> str | None:
    for tag in posting.find_all(attrs={"itemprop": "title"}):
        if _item_of(tag) is posting:
            return _plain(tag.get("content")) or _plain(tag.get_text(" ", strip=True))
    return None


def _microdata_posting(tag: Tag) -> bool:
    kinds = str(tag.get("itemtype") or "").split()
    return any(kind.rstrip("/").rsplit("/", 1)[-1] == "JobPosting" for kind in kinds)


def _label_text(text: str, labels: dict) -> tuple[str, str | None] | None:
    if ":" in text:
        label, _, rest = text.partition(":")
        label = label.strip()
        if label not in labels:
            return None
        rest = rest.strip()
        return label, rest or None
    if text in labels:
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


_CAPTURED_TEXT = (
    ("description", "description"),
    ("posted_on", "posted"),
    ("salary_range_text", "salary"),
    ("advert_language", "language"),
)


def apply_captured_fields(job: dict, captured: list) -> dict:
    """Return the listing row with blank captured fields filled from one reader result.

    The same rule as apply_detail_reading: several results leave the row unchanged. A remote
    marker only ever sets is_remote to True. The description stays as published; the save
    step cleans it.
    """
    if not isinstance(job, dict):
        return {}
    updated = dict(job)
    if not isinstance(captured, list) or len(captured) != 1 or not isinstance(captured[0], dict):
        return updated
    row = captured[0]
    for field, source in _CAPTURED_TEXT:
        if not _blank_listing(updated.get(field)):
            continue
        value = row.get(source)
        value = value if field == "description" else _first_nonblank(value)
        if isinstance(value, str) and value.strip():
            updated[field] = value
    locations = [text for item in row.get("locations") or [] if (text := _plain(item))]
    if locations and not updated.get("locations"):
        updated["locations"] = locations
    if row.get("remote") is True:
        updated["is_remote"] = True
    if isinstance(row.get("place"), dict) and "published_place" not in updated:
        updated["published_place"] = dict(row["place"])
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
