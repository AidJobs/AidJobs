"""Conceptual records. These are not database tables."""
from dataclasses import dataclass
from datetime import datetime

SOURCE_TYPES = frozenset({"html", "rss", "api"})


class ContractError(ValueError):
    """A contract rule rejected the input."""


@dataclass
class Organisation:
    id: str
    name: str
    slug: str
    type: str
    website_url: str
    status: str
    created_at: datetime
    updated_at: datetime


@dataclass
class Source:
    id: str
    organisation_id: str
    url: str
    source_type: str
    enabled: bool = True


@dataclass
class CrawlRun:
    source_id: str
    status: str = "running"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    discovered: int = 0
    valid: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    rejected: int = 0
    seen_again: int = 0
    identity_conflict: int = 0
    trustworthy: bool = False
    http_status: int | None = None


def require_source_type(source_type: str) -> str:
    """Browser rendering is a fetch strategy, not a source type."""
    if source_type not in SOURCE_TYPES:
        raise ContractError(f"unsupported source type: {source_type}")
    return source_type


def assign_organisation(job: dict, source: Source) -> dict:
    """A job takes its organisation from the source."""
    incoming = job.get("organisation_id")
    if incoming is not None and incoming != source.organisation_id:
        raise ContractError("job organisation_id does not match its source")
    assigned = dict(job)
    assigned["organisation_id"] = source.organisation_id
    return assigned


def note_http_status(crawl: CrawlRun, status_code: int) -> None:
    """HTTP status alone does not make a crawl a trusted catalogue."""
    crawl.http_status = status_code


def mark_partial(crawl: CrawlRun) -> None:
    crawl.status = "partial"
    crawl.trustworthy = False
