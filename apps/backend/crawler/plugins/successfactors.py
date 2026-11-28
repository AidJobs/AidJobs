"""SuccessFactors career-site listing reader (growth plan, step 6, pull request 1).

Chosen by what the listing page shows, never by its address or the organisation: job tiles
(`li.job-tile`) that each hold a title link (`a.jobTitle-link`). Employers on SuccessFactors'
Career Site Builder (ICRC, Plan International, EBRD and others) render each tile up to three
times, once for desktop, tablet and phone; the reader reads one copy, the first present.

Fields are read by their visible label (`.section-label`), never by CSS class: employers reuse
the slot classes (ICRC puts Country in `.dept`, Location in `.customfield4` and the application
deadline in `.travel`). A field the page does not show is left out, never guessed.

The paging walk lives in `crawler_v2/simple_crawler.py`; this module only reads one page and
builds the one GET address the walk may ask for next (the site's own tile endpoint, at the next
start row). Nothing here makes a request.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

from core.extraction_heuristics import normalize_url

_SHOWING = re.compile(
    r"Showing\s+(\d[\d,]*)\s+to\s+(\d[\d,]*)\s+of\s+(\d[\d,]*)\s+Jobs?\b", re.IGNORECASE
)
_LABEL_IDS = "#tile-search-results-label, #searchresultslabel"
_INIT_CALL = re.compile(r"j2w\.SearchResults\.init\(\s*\{(.*?)\}\s*\)", re.DOTALL)
_INIT_PAIR = re.compile(r'(\w+)\s*:\s*(?:parseInt\(\s*"(\d+)"\s*\)|"([^"\n]*)")')
_ENDPOINT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.\-]*(?:/[A-Za-z0-9_.\-]+)*")
# Query parameters a later tile request keeps from the listing address: the search and filters.
_KEPT_QUERY = re.compile(r"^(?:q|locationsearch|locale|optionsFacetsDD\w*)$")
_SECTIONS = (".sub-section-desktop", ".sub-section-tablet", ".sub-section-mobile")

# Visible labels the reader maps; any other label is not read.
_LABEL_FIELDS = {
    "country": "country",
    "location": "location",
    "city": "city",
    "state": "state",
    "state/province": "state",
    "province": "state",
    "region": "state",
    "state/region": "state",
    "contract type": "contract",
    "employment type": "contract",
    "application deadline": "deadline",
    "closing date": "deadline",
    "deadline": "deadline",
    "apply by": "deadline",
    "posting date": "posted",
    "posted date": "posted",
    "date posted": "posted",
    "posted": "posted",
    "published": "posted",
    "publication date": "posted",
}
# Used only for a field with no label at all: the semantic slot classes, never the reused ones.
_CLASS_FIELDS = {
    "location": "location",
    "country": "country",
    "city": "city",
    "shifttype": "contract",
    "posteddate": "posted",
}
_MONTHS = {
    name: number
    for number, names in enumerate(
        (
            ("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"),
            ("may",), ("jun", "june"), ("jul", "july"), ("aug", "august"),
            ("sep", "sept", "september"), ("oct", "october"), ("nov", "november"),
            ("dec", "december"),
        ),
        start=1,
    )
    for name in names
}
_ISO = re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})")
_NUMERIC = re.compile(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})")
_DAY_MONTH = re.compile(
    r"(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([A-Za-z]{3,9})\.?,?[\s\-]+(\d{4})", re.IGNORECASE
)
_MONTH_DAY = re.compile(
    r"([A-Za-z]{3,9})\.?[\s\-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-]+(\d{4})", re.IGNORECASE
)
_TIME = re.compile(r"\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?(?:\s+[A-Za-z]{2,5})?$")


@dataclass
class TilePage:
    """One page of tiles (or one tile response) as the reader sees it."""

    # Tiles that hold a title link, copies of one job counted once each: the rows the site served.
    tiles: int = 0
    jobs: List[Dict] = field(default_factory=list)
    # The stated range from "Showing 1 to 12 of 12 Jobs", and the stated total.
    shown: Optional[Tuple[int, int, int]] = None
    total: Optional[int] = None
    # The label and the page's own script state a different total.
    total_conflict: bool = False
    # The site's tile endpoint (relative), from the page's own script; None when not stated.
    endpoint: Optional[str] = None
    # The site's own next-page link, when it is on the same site; else None.
    next_url: Optional[str] = None
    # A next-page link that leaves the site: found, but not to be followed.
    next_refused: bool = False
    is_tiles: bool = False


def _clean(text: str) -> str:
    return " ".join((text or "").split())


def _number(text: str) -> int:
    return int(text.replace(",", ""))


def _same_site(url: str, base_url: str) -> bool:
    one, other = urlparse(url), urlparse(base_url)
    return one.scheme in ("http", "https") and one.netloc.lower() == other.netloc.lower()


def _path(url: str) -> str:
    return urlparse(url).path.rstrip("/")


def _init_config(html: str) -> Dict[str, object]:
    """The page's `j2w.SearchResults.init({...})` settings: strings and whole numbers only."""
    call = _INIT_CALL.search(html or "")
    if call is None:
        return {}
    config: Dict[str, object] = {}
    for name, number, text in _INIT_PAIR.findall(call.group(1)):
        config[name] = int(number) if number else text
    return config


def _shown_range(soup: BeautifulSoup) -> Optional[Tuple[int, int, int]]:
    for label in soup.select(_LABEL_IDS):
        match = _SHOWING.search(_clean(label.get_text(" ")))
        if match:
            return tuple(_number(part) for part in match.groups())
    return None


def _apply_url(href: Optional[str], page_url: str) -> Optional[str]:
    """The tile's job address as the general reader stores it (`normalize_url`), or None for a
    link that is not a job on this site."""
    href = (href or "").strip()
    if not href or href.startswith("#"):
        return None
    if href.lower().startswith(("javascript:", "mailto:", "tel:")):
        return None
    url = normalize_url(urljoin(page_url, href))
    if not _same_site(url, page_url) or _path(url) == _path(page_url):
        return None
    return url


def _tile_section(tile):
    """The first present copy of the tile that holds the title link, else the tile itself."""
    for selector in _SECTIONS:
        section = tile.select_one(selector)
        if section is not None and section.select_one("a.jobTitle-link[href]") is not None:
            return section
    return tile


def _label_of(node) -> Optional[str]:
    label = node.select_one(".section-label")
    if label is None:
        return None
    return _clean(label.get_text(" ")).rstrip(":").strip().lower()


def _field_name(node) -> Optional[str]:
    label = _label_of(node)
    if label is not None:
        return _LABEL_FIELDS.get(label)
    for css in node.get("class") or []:
        if css in _CLASS_FIELDS:
            return _CLASS_FIELDS[css]
    return None


def _tile_fields(section) -> Dict[str, str]:
    """The first value of each mapped field in one tile copy (its own `div` after the label)."""
    values: Dict[str, str] = {}
    for node in section.select(".section-field"):
        name = _field_name(node)
        if name is None or name in values:
            continue
        box = node.find("div", recursive=False)
        text = _clean(box.get_text(" ")) if box is not None else ""
        if text:
            values[name] = text
    return values


def _contains_word(part: str, other: str) -> bool:
    return re.search(r"(?<!\w)" + re.escape(part) + r"(?!\w)", other, re.IGNORECASE) is not None


def _place(values: Dict[str, str]) -> str:
    """The place as one line for the location reader: city, location, state, country, each
    kept once. A part that repeats another, or sits inside it ("Geneva" in "Geneva (GVA)"), is
    left out. "Geneva (GVA)" + "Afghanistan" gives "Geneva (GVA), Afghanistan"."""
    parts = [values[name] for name in ("city", "location", "state", "country") if values.get(name)]
    kept: List[str] = []
    for index, part in enumerate(parts):
        lowered = part.lower()
        repeated = any(other.lower() == lowered for other in parts[:index])
        inside = any(
            other.lower() != lowered and _contains_word(part, other)
            for other in parts
        )
        if not repeated and not inside:
            kept.append(part)
    return ", ".join(kept)


def _day(year: int, month: Optional[int], day: int) -> Optional[str]:
    if month is None:
        return None
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def parse_day(text: str) -> Optional[str]:
    """A day the page writes as YYYY-MM-DD, as day-month-year (DD/MM/YYYY, DD.MM.YYYY,
    DD-MM-YYYY, the crawler's convention), as 12 Dec 2026 or Dec 12, 2026, with an optional
    time after it. A numeric date is read as month-day-year only when its second part cannot be
    a month. Anything else, or a day that does not exist, is None."""
    text = _TIME.sub("", _clean(text or ""))
    if not text:
        return None
    match = _ISO.fullmatch(text)
    if match:
        year, month, day = (int(part) for part in match.groups())
        return _day(year, month, day)
    match = _NUMERIC.fullmatch(text)
    if match:
        first, second, year = (int(part) for part in match.groups())
        if second > 12 and first <= 12:
            return _day(year, first, second)
        return _day(year, second, first)
    match = _DAY_MONTH.fullmatch(text)
    if match:
        day, name, year = match.groups()
        return _day(int(year), _MONTHS.get(name.lower()), int(day))
    match = _MONTH_DAY.fullmatch(text)
    if match:
        name, day, year = match.groups()
        return _day(int(year), _MONTHS.get(name.lower()), int(day))
    return None


def tile_endpoint_url(endpoint: Optional[str], listing_url: str, start_row: int) -> Optional[str]:
    """The site's tile endpoint at one start row, GET only, on the listing's own host.

    The endpoint must be a plain relative path (letters, digits, dots, dashes, slashes; no
    scheme, host, query, or `..`). The listing's search and filter parameters are kept; nothing
    else is. None when the endpoint is missing, unsafe, or resolves off the listing's host.
    """
    if not endpoint or not _ENDPOINT.fullmatch(endpoint) or ".." in endpoint.split("/"):
        return None
    target = urlparse(urljoin(listing_url, endpoint))
    base = urlparse(listing_url)
    if not base.hostname or target.scheme not in ("http", "https"):
        return None
    if (target.hostname or "").lower() != base.hostname.lower():
        return None
    kept = [
        (name, value)
        for name, value in parse_qsl(base.query, keep_blank_values=True)
        if _KEPT_QUERY.fullmatch(name)
    ]
    kept.append(("startrow", str(start_row)))
    return urlunparse(target._replace(query=urlencode(kept), fragment=""))


class SuccessFactorsListingReader:
    """Reads the tiles, the stated total, and the paging links of one listing page."""

    name = "successfactors"

    def get_soup(self, html: str) -> BeautifulSoup:
        return BeautifulSoup(html, "lxml")

    def read_page(self, html: str, page_url: str) -> TilePage:
        soup = self.get_soup(html)
        tiles = [
            tile for tile in soup.select("li.job-tile")
            if tile.select_one("a.jobTitle-link[href]") is not None
        ]
        page = TilePage(tiles=len(tiles), is_tiles=bool(tiles))
        if not tiles:
            return page
        seen = set()
        for tile in tiles:
            section = _tile_section(tile)
            links = section.select("a.jobTitle-link[href]")
            if len(links) != 1:
                continue  # an ambiguous card is not read, never guessed
            apply_url = _apply_url(links[0].get("href"), page_url)
            title = _clean(links[0].get_text(" "))
            if apply_url is None or not title or apply_url in seen:
                continue
            seen.add(apply_url)
            page.jobs.append(self._job(title, apply_url, _tile_fields(section)))

        page.shown = _shown_range(soup)
        config = _init_config(html)
        script_total = config.get("jobRecordsFound")
        label_total = page.shown[2] if page.shown else None
        if (
            isinstance(script_total, int)
            and label_total is not None
            and script_total != label_total
        ):
            page.total_conflict = True
        if label_total is not None:
            page.total = label_total
        elif isinstance(script_total, int):
            page.total = script_total
        endpoint = config.get("apiEndpoint")
        page.endpoint = endpoint if isinstance(endpoint, str) and endpoint else None
        page.next_url, page.next_refused = self._next_link(soup, page_url)
        return page

    @staticmethod
    def _job(title: str, apply_url: str, values: Dict[str, str]) -> Dict:
        job = {"title": title, "apply_url": apply_url, "record_class": "reader_card"}
        location = _place(values)
        if location:
            job["location_raw"] = location
        if values.get("contract"):
            job["employment_type"] = values["contract"]
        deadline = parse_day(values.get("deadline", ""))
        if deadline:
            job["deadline"] = deadline
        posted = parse_day(values.get("posted", ""))
        if posted:
            job["posted_on"] = posted
        return job

    @staticmethod
    def _next_link(soup: BeautifulSoup, page_url: str) -> Tuple[Optional[str], bool]:
        link = soup.select_one(
            'a[rel="next"][href], a.paginationItemNext[href], li.next:not(.disabled) a[href]'
        )
        if link is None:
            return None, False
        href = (link.get("href") or "").strip()
        # A script or empty control is not a link to follow: the tile endpoint is the way on.
        if not href or href.startswith("#") or href.lower().startswith(("javascript:", "mailto:")):
            return None, False
        target = urljoin(page_url, href)
        if not _same_site(target, page_url):
            return None, True
        return target, False
