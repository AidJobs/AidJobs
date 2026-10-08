"""Reject candidates before any authoritative write."""
import re
from urllib.parse import urlparse

from contracts.models import CrawlRun

_SEARCH = re.compile(r"[?&](q=|page=|search=|filter=)", re.IGNORECASE)
_ROOT_PATHS = frozenset({"", "/careers", "/jobs", "/job", "/vacancies", "/opportunities"})
_PLACEHOLDER_PREFIX = "https://placeholder.missing-url/"
_QUALITY_FLOOR = 0.25
_PROFILE_HOSTS = frozenset({"twitter.com", "mobile.twitter.com", "x.com"})
_FACEBOOK_HOSTS = frozenset({"facebook.com", "m.facebook.com", "mbasic.facebook.com"})
_YOUTUBE_HOSTS = frozenset({"youtube.com", "m.youtube.com"})
_YOUTUBE_CHANNEL_PREFIXES = frozenset({"c", "channel", "user"})
_FACEBOOK_FUNCTIONS = frozenset({"jobs", "job", "share", "sharer", "dialog", "watch"})
_TWITTER_FUNCTIONS = frozenset(
    {"share", "intent", "i", "home", "search", "explore", "jobs", "privacy", "tos", "settings"}
)


def _hostname(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        return host[4:]
    return host


def _non_vacancy_destination(url: str) -> str | None:
    """Reject profile, channel, and badge URLs. Do not reject a whole host."""
    host = _hostname(url)
    path = urlparse(url).path.rstrip("/")
    segments = [segment for segment in path.split("/") if segment]
    lowered = [segment.lower() for segment in segments]
    if host == "pageuppeople.com" and path.lower() == "/powered-by-pageup":
        return "vendor_badge"
    if host == "linkedin.com" and lowered[:1] == ["company"]:
        return "social_profile"
    if host in _YOUTUBE_HOSTS and (
        (lowered[:1] and lowered[0] in _YOUTUBE_CHANNEL_PREFIXES)
        or (segments[:1] and segments[0].startswith("@"))
    ):
        return "social_profile"
    if host in _PROFILE_HOSTS and len(segments) == 1 and lowered[0] not in _TWITTER_FUNCTIONS:
        return "social_profile"
    if host in _FACEBOOK_HOSTS and len(segments) == 1 and lowered[0] not in _FACEBOOK_FUNCTIONS:
        return "social_profile"
    return None


def destination_rejection(job: dict) -> str | None:
    """URL and identity denies. The quality floor is not an admission signal."""
    title = str(job.get("title") or "").strip()
    apply_url = str(job.get("apply_url") or "").strip()
    if not title:
        return "missing_title"
    if not apply_url:
        return "missing_apply_url"
    lowered = apply_url.lower()
    if lowered.startswith("mailto:"):
        return "mailto"
    if lowered.startswith(_PLACEHOLDER_PREFIX):
        return "placeholder"
    if _SEARCH.search(apply_url):
        return "search_or_pagination"
    path = urlparse(apply_url).path.rstrip("/")
    if path in _ROOT_PATHS:
        return "root_careers_page"
    return _non_vacancy_destination(apply_url)


def rejection_reason(job: dict) -> str | None:
    reason = destination_rejection(job)
    if reason is not None:
        return reason
    score = job.get("quality_score")
    if score is not None:
        try:
            if float(score) < _QUALITY_FLOOR:
                return "quality_score_too_low"
        except (TypeError, ValueError):
            pass
    return None


def consider(job: dict, crawl: CrawlRun) -> str | None:
    """Record a rejection on the CrawlRun. A valid job returns None."""
    reason = rejection_reason(job)
    if reason is not None:
        crawl.rejected += 1
    return reason
