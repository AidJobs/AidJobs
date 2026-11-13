"""One reader interface for every listing (ledger W-35; growth plan, section 4.1).

A reader turns what one recruitment system publishes into candidate jobs in the field contract's
shape (growth plan, section 4.4), and says whether it read the listing completely and what total
the listing states. Readers are chosen by what a page or a system shows, never by organisation
(contract §10). This module holds the shapes only: it makes no request and opens no database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Awaitable, Callable, Dict, FrozenSet, List, Optional

# The fields a reader may set on a candidate, by the names the save step reads. A field the
# employer does not publish is left out, never set empty or guessed (contract §10).
CANDIDATE_FIELDS: FrozenSet[str] = frozenset({
    "title",
    "apply_url",
    "record_class",
    "reference",
    "location_raw",
    "locations",
    "published_place",
    "location_normalized",
    "country",
    "country_iso",
    "city",
    "is_remote",
    "deadline",
    "employment_type",
    "posted_on",
    "description",
    "description_snippet",
    "salary_range_text",
    "salary_raw",
    "advert_language",
})

# Read by a reader but never saved: the general reader's link scores, and the employer a
# structured posting names (a job's organisation comes from its source, contract §5).
UNSAVED_FIELDS: FrozenSet[str] = frozenset({"extraction_score", "extraction_metadata", "employer"})


@dataclass(frozen=True)
class Request:
    """One request a reader asks the crawl to send, through the shared fetch policy (§9)."""

    url: str
    method: str = "GET"
    json_body: Optional[dict] = None
    accept: Optional[str] = None


@dataclass(frozen=True)
class Response:
    """What came back. `stop` is why the source stops here, in fixed words; '' otherwise."""

    status: int
    body: str
    content_type: str = ""
    stop: str = ""


Fetch = Callable[[Request], Awaitable[Response]]


@dataclass
class ListingResult:
    """A listing as one reader read it. `reported` is False for a reader that reports no
    completeness, whose crawls never count as evidence of absence (contract §6)."""

    reader: str
    jobs: List[Dict] = field(default_factory=list)
    reported: bool = False
    complete: Optional[bool] = None
    expected: Optional[int] = None
    pages: Optional[int] = 1
    stop: Optional[str] = None
    strategy: Optional[str] = None

    def report(self) -> Optional[Dict]:
        """The listing report the crawl message and the run's finish read; None without one."""
        if not self.reported:
            return None
        return {
            "pages": self.pages,
            "expected": self.expected,
            "complete": self.complete,
            "stop": self.stop,
        }

    @classmethod
    def from_report(
        cls, reader: str, jobs: List[Dict], report: Optional[Dict], strategy: Optional[str] = None
    ) -> "ListingResult":
        if report is None:
            return cls(reader, jobs, strategy=strategy)
        return cls(
            reader,
            jobs,
            reported=True,
            complete=report.get("complete"),
            expected=report.get("expected"),
            pages=report.get("pages"),
            stop=report.get("stop"),
            strategy=strategy,
        )


class Reader:
    """One recruitment system's reader.

    `record_class` is admission's class for rows that set none of their own. `budget_group`
    names one request budget shared by every employer on the same host (growth plan, section
    4.2); None gives each source its own. `read_job_page`, when a reader has one, reads a job's
    own page within the crawl's cap (crawler plan, C4); no reader has one yet.
    """

    name: str = ""
    source_types: FrozenSet[str] = frozenset({"html"})
    record_class: str = "html"
    budget_group: Optional[str] = None
    read_job_page: Optional[Callable] = None

    def first_request(self, source: Dict) -> Optional[Request]:
        """The first request for a source this reader recognises from its recruitment system's
        address, sent instead of fetching the careers page; None for a reader chosen by the
        fetched page, as every reader is today."""
        del source
        return None

    def marks(self, page: str) -> bool:
        """Whether a page shows this reader's system, by a test weaker than reading it."""
        del page
        return False

    async def read(
        self, first: Response, source: Dict, fetch: Optional[Fetch] = None
    ) -> Optional[ListingResult]:
        """The listing from its first response: a result, or None when it is not this reader's.

        Later pages are asked for only through `fetch`, or the crawl's own fetch when None.
        """
        raise NotImplementedError
