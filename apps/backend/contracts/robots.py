"""RFC 9309 robots.txt rules, without network. The fetch policy (contracts/outbound.py) and the
employer survey (tools/survey/confirm.py) share them.
"""
from __future__ import annotations

import math
import re
from functools import lru_cache
from urllib.parse import quote, urlsplit


def _groups(text: str) -> list[tuple[set[str], list[tuple[bool, str]], list[float]]]:
    """(agents, rules, crawl delays) per group; consecutive user-agent lines share a group."""
    groups: list[tuple[set[str], list[tuple[bool, str]], list[float]]] = []
    in_agents = False
    # Only a rule line ends a run of user-agent lines (Sitemap, Crawl-delay and others do not).
    for raw in text.lstrip("\ufeff").splitlines():
        key, sep, value = raw.split("#", 1)[0].partition(":")
        key, value = key.strip().lower(), value.strip()
        if not sep:
            continue
        if key == "user-agent":
            if not in_agents:
                groups.append((set(), [], []))
            groups[-1][0].add(value.split("/")[0].strip().lower())
            in_agents = True
        elif key in ("allow", "disallow"):
            in_agents = False
            if groups and value:
                groups[-1][1].append((key == "allow", value))
        elif key == "crawl-delay" and groups:
            try:
                seconds = float(value)
            except ValueError:
                continue
            if math.isfinite(seconds) and seconds >= 0:
                groups[-1][2].append(seconds)
    return groups


def _mine(text: str, token: str):
    """The groups that apply to `token` (RFC 9309, section 2.2): every group naming it, else
    every '*' group."""
    groups = _groups(text)
    named = [g for g in groups if token in g[0]]
    return named if named else [g for g in groups if "*" in g[0]]


def robots_rules(text: str, token: str) -> list[tuple[bool, str]]:
    """The (allow, pattern) rules that apply to `token`."""
    return [rule for _, rules, _ in _mine(text, token) for rule in rules]


def crawl_delay(text: str, token: str) -> float | None:
    """The longest Crawl-delay, in seconds, of the groups that apply to `token`; None if none.
    Crawl-delay is not part of RFC 9309; it is honoured as written."""
    delays = [d for _, _, found in _mine(text, token) for d in found]
    return max(delays) if delays else None


@lru_cache(maxsize=4096)
def _pattern(rule: str) -> re.Pattern:
    """A path pattern: '*' matches any characters, a final '$' the end of the path. Characters
    outside ASCII are percent-encoded, as addresses are (RFC 9309, section 2.2.2)."""
    end = rule.endswith("$")
    rule = quote(rule[:-1] if end else rule, safe="/?=&*$%:;@+,!~'()#[]")
    body = re.escape(rule).replace(r"\*", ".*")
    return re.compile(body + ("$" if end else ""))


def robots_allows(text: str, url: str, token: str) -> bool:
    """RFC 9309, section 2.2.2: the longest matching rule wins; on a tie, allow wins."""
    parts = urlsplit(url)
    path = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
    if parts.path == "/robots.txt":
        return True
    matches = [(len(rule), allow) for allow, rule in robots_rules(text, token)
               if _pattern(rule).match(path)]
    return max(matches)[1] if matches else True


def robots_verdict(status: int | None, body: str, url: str, token: str) -> str:
    """'allowed', 'forbidden', 'refused' (401, 403, 429) or 'unreachable' (5xx, no answer).
    RFC 9309: a robots.txt that is not there (other 4xx) allows everything; one that cannot be
    reached is treated as forbidding everything. RFC 9309 also allows crawling when robots.txt
    answers 401 or 403; AidJobs treats those as a refusal (decided by the user, 7 November 2026)."""
    if status is None or status >= 500:
        return "unreachable"
    if status in (401, 403, 429):
        return "refused"
    if status >= 400:
        return "allowed"
    if status != 200:
        return "unreachable"
    return "allowed" if robots_allows(body, url, token) else "forbidden"
