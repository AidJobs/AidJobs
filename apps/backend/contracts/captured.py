"""Clean the captured fields before they are stored (W-37). No fetch, log, or database.

Recruiters' email addresses and phone numbers are never stored (growth plan, section 4.6), so
they are removed from every captured text. A number counts as a phone when it starts with "+"
or "0", has the North American 3-3-4 shape, or follows a phone label; a run holding a date, a
year range, or thousands groups is not a phone, so dates, salaries and references are kept.
Every pattern is bounded and runs on bounded input, so a hostile page cannot stall a crawl.
"""
import html
import re
from datetime import date, datetime, timedelta

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

DESCRIPTION_LIMIT = 20_000
# Text read before the patterns run; the cap above applies after contacts are removed.
_READ_LIMIT = DESCRIPTION_LIMIT * 4
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

_LOCAL = r"(?<![A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]{1,64}"
_LABEL = r"[A-Za-z0-9\-]{1,63}"
_EMAIL = re.compile(_LOCAL + r"\s?@\s?" + _LABEL + r"(?:\." + _LABEL + r"){0,6}\.[A-Za-z]{2,24}\b")
_SPELLED_EMAIL = re.compile(
    _LOCAL + r"\s{0,3}[\[(]\s{0,3}at\s{0,3}[\])]\s{0,3}" + _LABEL
    + r"(?:\s{0,3}(?:[\[(]\s{0,3}dot\s{0,3}[\])]|\.)\s{0,3}" + _LABEL + r"){1,6}",
    re.I,
)
_WORDED_EMAIL = re.compile(
    r"\b[A-Za-z0-9._%+\-]{1,64} at " + _LABEL
    + r"(?: dot " + _LABEL + r"){0,5} dot [A-Za-z]{2,6}\b",
    re.I,
)
_DASHES = "\u2010\u2011\u2012\u2013\u2014\u2212"
_RUN = r"[\d\s().\-/" + _DASHES + r"]"
# tel, phone, telephone, fax and WhatsApp name a number by themselves; the others need ":" or
# "number", so "the post is mobile." is not a label.
_LABELLED_PHONE = re.compile(
    r"(\b(?:(?:tel|telephone|phone|fax|whatsapp|hotline|helpline)\b\.?"
    r"(?:\s{0,3}(?:no\.?|number|#))?\s{0,3}[:.]?"
    r"|(?:mobile|mob|cell|contact|call)\b(?:\s{0,3}(?:no\.?|number|#))?\s{0,3}:"
    r"|(?:mobile|mob|cell|contact)\s{1,3}(?:no\.?|number|#))\s{0,3})"
    r"(\+?\(?\d" + _RUN + r"{5,24}\d)",
    re.I,
)
_INTERNATIONAL_PHONE = re.compile(r"(?<![\w+])\+\s?\(?\d" + _RUN.replace("/", "") + r"{6,24}\d")
_NATIONAL_PHONE = re.compile(
    r"(?<![\w.,/])\(?0\d" + _RUN.replace("/", "") + r"{6,20}\d(?![\w/])"
)
_NORTH_AMERICAN_PHONE = re.compile(
    r"(?<![\w.,/+])(?:1[\s.\-])?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-" + _DASHES + r"]\d{4}(?![\w/])"
)
_EXTENSION = re.compile(
    re.escape(CONTACT_REMOVED) + r"(\s{0,3}(?:ext\.?|extension|x)\s{0,3}\d{1,6})\b", re.I
)
# A run that holds one of these is a date, a year range or an amount, never a phone.
_NOT_A_PHONE = (
    re.compile(r"\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}"),
    re.compile(r"(?:19|20)\d{2}\s{0,3}[\-" + _DASHES + r"/]\s{0,3}(?:19|20)\d{2}"),
)
# A round amount such as "+15 000 000"; "+254 722 123 456" is a phone.
_ROUND_AMOUNT = re.compile(r"\+?\s?\d{1,3}(?:[ ,.]\d{3})*[ ,.]000")

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
        text = _text_of(value)
    elif isinstance(value, str) and value.strip():
        text = _text_of_markup(value[: _READ_LIMIT * 2])
        if _MARKUP.search(text):
            # Some sites escape their HTML once more inside JSON-LD.
            text = _text_of_markup(text)
    else:
        return None
    text = remove_contacts(text[:_READ_LIMIT])
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


def _text_of_markup(value: str) -> str:
    if "<" not in value:
        return html.unescape(value)
    return _text_of(BeautifulSoup(value, "html.parser"))


def _text_of(node) -> str:
    parts: list[str] = []
    _walk(node, parts)
    return "".join(parts)


def remove_contacts(text: str) -> str:
    text = _EMAIL.sub(CONTACT_REMOVED, text)
    text = _SPELLED_EMAIL.sub(CONTACT_REMOVED, text)
    text = _WORDED_EMAIL.sub(CONTACT_REMOVED, text)
    text = _LABELLED_PHONE.sub(_labelled_phone, text)
    text = _INTERNATIONAL_PHONE.sub(lambda m: _phone(m, 8, 15), text)
    text = _NATIONAL_PHONE.sub(lambda m: _phone(m, 9, 12), text)
    text = _NORTH_AMERICAN_PHONE.sub(lambda m: _phone(m, 10, 11), text)
    return _EXTENSION.sub(CONTACT_REMOVED, text)


def _labelled_phone(match: re.Match) -> str:
    number = match.group(2)
    if _digits(number) < 7 or _not_a_phone(number):
        return match.group(0)
    return match.group(1) + CONTACT_REMOVED


def _phone(match: re.Match, low: int, high: int) -> str:
    number = match.group(0)
    if not low <= _digits(number) <= high or _not_a_phone(number):
        return number
    return CONTACT_REMOVED


def _not_a_phone(number: str) -> bool:
    if any(pattern.search(number) for pattern in _NOT_A_PHONE):
        return True
    return _ROUND_AMOUNT.fullmatch(number.strip()) is not None


def _digits(text: str) -> int:
    return sum(char.isdigit() for char in text)


def _walk(node, parts: list[str]) -> None:
    """Text in document order, iteratively, so deep nesting cannot exhaust the stack."""
    stack: list = list(reversed(list(node.children)))
    while stack:
        child = stack.pop()
        if isinstance(child, str) and not isinstance(child, NavigableString):
            parts.append(child)
            continue
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
            stack.append("\n")
        if child.name == "li":
            parts.append("• ")
        stack.extend(reversed(list(child.children)))


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
    """One line of published text, as written but for contacts, or None."""
    if not isinstance(value, str):
        return None
    text = " ".join(remove_contacts(_CONTROL.sub("", value[: limit * 4])).split())
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
