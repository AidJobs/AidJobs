"""Clean the captured fields before they are stored (W-37). No fetch, log, or database.

Recruiters' email addresses and phone numbers are never stored (growth plan, section 4.6), so
they are removed from descriptions. A number counts as a phone only when it starts with "+" or
"0", or follows a phone label; other numbers stay, so dates, salaries and references are kept.
"""
import re
import warnings
from datetime import date, datetime, timedelta

from bs4 import BeautifulSoup, Comment, MarkupResemblesLocatorWarning, NavigableString, Tag

# Descriptions are often plain text, which BeautifulSoup would otherwise warn about.
warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)

DESCRIPTION_LIMIT = 20_000
SHORT_TEXT_LIMIT = 300
LOCATION_LIMIT = 50
CONTACT_REMOVED = "[contact removed]"

_DROPPED = frozenset({
    "script", "style", "noscript", "template", "iframe", "object", "embed", "svg", "head",
    "form", "button", "select", "input", "textarea",
})
_BLOCKS = frozenset({
    "address", "article", "aside", "blockquote", "dd", "div", "dl", "dt", "figcaption",
    "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main",
    "nav", "ol", "p", "pre", "section", "table", "tbody", "td", "th", "thead", "tr", "ul",
})
_MARKUP = re.compile(r"</?(?:p|br|div|li|ul|ol|strong|b|em|span|h[1-6]|table|a)\b[^>]*>", re.I)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")
_SPELLED_EMAIL = re.compile(
    r"[A-Za-z0-9._%+\-]+\s*[\[(]\s*at\s*[\])]\s*[A-Za-z0-9\-]+"
    r"(?:\s*(?:[\[(]\s*dot\s*[\])]|\.)\s*[A-Za-z0-9\-]+)+",
    re.I,
)
_LABELLED_PHONE = re.compile(
    r"(\b(?:tel|telephone|phone|mobile|mob|cell|whatsapp|fax)\b\.?"
    r"(?:\s*(?:no\.?|number))?\s*[:.]?\s*)"
    r"(\+?\(?\d[\d\s().\-/]{5,}\d)",
    re.I,
)
_INTERNATIONAL_PHONE = re.compile(r"(?<![\w+])\+\s?\(?\d[\d\s().\-]{6,}\d")
_NATIONAL_PHONE = re.compile(r"(?<![\w.,/])\(?0\d[\d\s().\-]{6,}\d(?![\w/])")

_ISO_DAY = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$")
# java.util.Date's text form, as SAP SuccessFactors career sites publish it (ICRC).
_JAVA_DAY = re.compile(
    r"^[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{1,2}) \d{2}:\d{2}:\d{2} [A-Z]{2,5} (\d{4})$"
)
_MONTHS = {
    name: number
    for number, name in enumerate(
        ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
        start=1,
    )
}


def clean_description(value) -> str | None:
    """Plain text from published HTML or text: contacts removed, at most DESCRIPTION_LIMIT."""
    if isinstance(value, Tag):
        node = value
    elif isinstance(value, str) and value.strip():
        node = BeautifulSoup(value, "html.parser")
        if _MARKUP.search(node.get_text()):
            # Some sites escape their HTML once more inside JSON-LD.
            node = BeautifulSoup(node.get_text(), "html.parser")
    else:
        return None
    parts: list[str] = []
    _walk(node, parts)
    text = remove_contacts("".join(parts))
    text = _tidy(text)
    if not text:
        return None
    if len(text) > DESCRIPTION_LIMIT:
        cut = text[: DESCRIPTION_LIMIT - 2]
        space = max(cut.rfind(" "), cut.rfind("\n"))
        if space > DESCRIPTION_LIMIT * 0.9:
            cut = cut[:space]
        text = cut.rstrip() + " …"
    return text


def remove_contacts(text: str) -> str:
    text = _EMAIL.sub(CONTACT_REMOVED, text)
    text = _SPELLED_EMAIL.sub(CONTACT_REMOVED, text)
    text = _LABELLED_PHONE.sub(_labelled_phone, text)
    text = _INTERNATIONAL_PHONE.sub(lambda m: _phone(m, 8, 15), text)
    return _NATIONAL_PHONE.sub(lambda m: _phone(m, 9, 12), text)


def _labelled_phone(match: re.Match) -> str:
    if _digits(match.group(2)) < 7:
        return match.group(0)
    return match.group(1) + CONTACT_REMOVED


def _phone(match: re.Match, low: int, high: int) -> str:
    if low <= _digits(match.group(0)) <= high:
        return CONTACT_REMOVED
    return match.group(0)


def _digits(text: str) -> int:
    return sum(char.isdigit() for char in text)


def _walk(node, parts: list[str]) -> None:
    for child in node.children:
        if isinstance(child, Comment):
            continue
        if isinstance(child, NavigableString):
            parts.append(str(child))
            continue
        if not isinstance(child, Tag) or child.name in _DROPPED:
            continue
        if child.name == "br":
            parts.append("\n")
            continue
        if child.name == "a" and str(child.get("href") or "").strip().lower().startswith(
            ("mailto:", "tel:")
        ):
            parts.append(CONTACT_REMOVED)
            continue
        block = child.name in _BLOCKS
        if block:
            parts.append("\n")
        if child.name == "li":
            parts.append("• ")
        _walk(child, parts)
        if block:
            parts.append("\n")


def _tidy(text: str) -> str:
    text = _CONTROL.sub("", text.replace("\r\n", "\n").replace("\r", "\n"))
    lines = [" ".join(line.split()) for line in text.split("\n")]
    kept: list[str] = []
    for line in lines:
        if line == "•":
            continue
        if not line and (not kept or not kept[-1]):
            continue
        kept.append(line)
    return "\n".join(kept).strip()


def clean_short_text(value, limit: int = SHORT_TEXT_LIMIT) -> str | None:
    """One line of published text, as written, or None."""
    if not isinstance(value, str):
        return None
    text = " ".join(_CONTROL.sub("", value).split())
    if not text:
        return None
    return text[:limit]


def clean_locations(values) -> list[str] | None:
    """Every location as written, once each, in the order published."""
    if not isinstance(values, (list, tuple)):
        return None
    kept: list[str] = []
    for value in values:
        text = clean_short_text(value)
        if text and text not in kept:
            kept.append(text)
        if len(kept) == LOCATION_LIMIT:
            break
    return kept or None


def posted_day(value, seen_on: date) -> str | None:
    """YYYY-MM-DD from a published posting date; None if unreadable or in the future.

    The calendar date is kept as written; a time or zone after it is ignored, not converted.
    The day seen is in UTC, so a date one day later is an employer east of UTC, not the future.
    """
    if isinstance(value, datetime):
        day = value.date()
    elif isinstance(value, date):
        day = value
    elif isinstance(value, str):
        day = _day_from_text(value.strip())
    else:
        day = None
    if day is None or day > seen_on + timedelta(days=1):
        return None
    return day.isoformat()


def _day_from_text(text: str) -> date | None:
    match = _ISO_DAY.match(text)
    if match:
        year, month, day = (int(group) for group in match.groups())
    else:
        match = _JAVA_DAY.match(text)
        if not match or match.group(1) not in _MONTHS:
            return None
        year, month, day = int(match.group(3)), _MONTHS[match.group(1)], int(match.group(2))
    try:
        return date(year, month, day)
    except ValueError:
        return None
