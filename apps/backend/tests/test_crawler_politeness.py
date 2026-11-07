"""W-34: one honest identity, robots.txt, one request at a time per host, budgets, refusals.

Fake DNS and a scripted transport; no live network. Marked `politeness`, so the real robots.txt
check and host spacing run (tests/conftest.py switches them off for other tests).
"""
import asyncio
import logging
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpcore
import pytest
from bs4 import BeautifulSoup

from contracts import outbound
from contracts.outbound import (
    FetchError,
    FetchResult,
    PinnedBackend,
    crawl_budget,
    current_budget,
    fetch_url,
)
from contracts.refusal import refusal
from contracts.robots import crawl_delay, robots_allows, robots_verdict

pytestmark = pytest.mark.politeness

BACKEND = Path(__file__).resolve().parents[1]
TEST_SSL_CONTEXT = httpcore.default_ssl_context()
IDENTITY = "AidJobsBot/1.0 (+mailto:aidjobz@gmail.com)"
ALLOW_ALL = "User-agent: *\nAllow: /\n"


def _response(status, body=b"", headers=None, reason="OK"):
    fields = dict(headers or {})
    if not any(key.lower() in ("content-length", "transfer-encoding") for key in fields):
        fields["Content-Length"] = str(len(body))
    head = [f"HTTP/1.1 {status} {reason}", *(f"{k}: {v}" for k, v in fields.items())]
    return ("\r\n".join(head) + "\r\n\r\n").encode("latin-1") + body


def _robots(text=ALLOW_ALL, status=200):
    return _response(status, text.encode("utf-8"), {"Content-Type": "text/plain"})


def _redirect(location, status=302):
    return _response(status, b"", {"Location": location}, reason="Found")


class _Stream(httpcore.AsyncMockStream):
    def __init__(self, buffer, events):
        super().__init__(buffer)
        self.events = events

    async def write(self, buffer, timeout=None):
        self.events.append(("write", buffer))


class _Backend(httpcore.AsyncNetworkBackend):
    """Answers connections in order. `gates` holds a connection until its event is set;
    an exception in the list is raised instead of connecting."""

    def __init__(self, responses, events, gates=None):
        self.responses = responses
        self.events = events
        self.gates = gates or {}
        self.count = 0

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        index = self.count
        self.count += 1
        if index in self.gates:
            await self.gates[index].wait()
        if not self.responses:
            raise AssertionError("unexpected connection")
        answer = self.responses.pop(0)
        if isinstance(answer, BaseException):
            raise answer
        return _Stream([answer], self.events)

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):
        raise AssertionError("unix socket")

    async def sleep(self, seconds):
        return None


def _world(responses, gates=None):
    events: list = []
    backend = _Backend(list(responses), events, gates)

    async def resolver(host, port):
        return ["8.8.8.8"]

    def pool_factory(network_backend):
        return httpcore.AsyncConnectionPool(
            ssl_context=TEST_SSL_CONTEXT, network_backend=network_backend, max_connections=1,
            max_keepalive_connections=0, keepalive_expiry=0.0, retries=0, http2=False,
        )

    world = {
        "resolver": resolver,
        "backend_factory": lambda ip: PinnedBackend(ip, backend),
        "pool_factory": pool_factory,
    }
    return events, world


def _requests(events):
    """'METHOD host/path' for each request sent, and its headers."""
    sent = []
    for kind, buffer in events:
        if kind != "write" or buffer[:4] not in (b"GET ", b"HEAD"):
            continue
        lines = buffer.decode("latin-1").split("\r\n")
        method, target = lines[0].split()[:2]
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                name, value = line.split(":", 1)
                headers[name.strip().lower()] = value.strip()
        sent.append((f"{method} {headers.get('host', '')}{target}", headers))
    return sent


def _sent(events):
    return [line for line, _headers in _requests(events)]


@pytest.fixture
def slept(monkeypatch):
    """Host waits recorded instead of slept."""
    record = []

    async def fake_sleep(seconds):
        record.append(seconds)

    monkeypatch.setattr(outbound, "_sleep", fake_sleep)
    return record


def _fetch(url, world, **kwargs):
    return asyncio.run(fetch_url(url, **world, **kwargs))


# Identity -----------------------------------------------------------------------------------

def test_every_request_carries_the_one_identity_and_contact(slept):
    events, world = _world([_robots(), _response(200, b"ok")])
    assert _fetch("https://jobs.example/list", world).body == b"ok"
    for _line, headers in _requests(events):
        assert headers["user-agent"] == IDENTITY
        assert headers["from"] == "aidjobz@gmail.com"


def test_the_contact_setting_changes_only_the_address(monkeypatch, caplog):
    monkeypatch.setenv("AIDJOBS_CONTACT_EMAIL", "crawler@aidjobs.app")
    monkeypatch.setenv("AIDJOBS_CRAWLER_UA", "Mozilla/5.0 (Windows NT 10.0) Chrome/120")
    assert outbound.user_agent() == "AidJobsBot/1.0 (+mailto:crawler@aidjobs.app)"
    assert outbound._identity_headers("crawler")["From"] == "crawler@aidjobs.app"
    monkeypatch.setattr(outbound, "_contact_warned", False)
    monkeypatch.setenv("AIDJOBS_CONTACT_EMAIL", "Mozilla/5.0 <x@y.org>")
    with caplog.at_level(logging.WARNING, logger="contracts.outbound"):
        assert outbound.user_agent() == IDENTITY
    assert "not one email address" in caplog.text
    assert "Mozilla" not in caplog.text


def test_the_survey_keeps_its_own_published_name():
    assert outbound.user_agent("survey") == "AidJobsSurvey/0.1 (+mailto:aidjobz@gmail.com)"
    assert outbound._identity_headers("survey")["From"] == "aidjobz@gmail.com"


@pytest.mark.parametrize("headers", [
    {"User-Agent": "Mozilla/5.0"},
    {"user-agent": "AidJobsBot/1.0"},
    {"USER-AGENT": "x"},
    {"From": "someone@example.org"},
])
def test_a_caller_cannot_set_the_identity(headers, slept):
    events, world = _world([])
    with pytest.raises(FetchError, match="^user agent is set by the policy$"):
        _fetch("https://jobs.example/", world, headers=headers)
    assert events == []


@pytest.mark.parametrize("method", ["POST", "put", "DELETE", "PATCH", "OPTIONS"])
def test_only_get_and_head_leave_the_policy(method, slept):
    events, world = _world([])
    with pytest.raises(FetchError, match="^method is not permitted$"):
        _fetch("https://jobs.example/", world, method=method)
    assert events == []


def test_a_lowercase_head_is_a_head(slept):
    events, world = _world([_robots(), _response(200)])
    _fetch("https://jobs.example/", world, method="head")
    assert _sent(events) == ["GET jobs.example/robots.txt", "HEAD jobs.example/"]


def test_an_unknown_identity_is_refused(slept):
    with pytest.raises(FetchError, match="^identity is not permitted$"):
        _fetch("https://jobs.example/", _world([])[1], identity="browser")


# robots.txt rules (RFC 9309) ----------------------------------------------------------------

def test_the_rules_follow_rfc_9309():
    rules = "User-agent: *\nDisallow: /jobs\nAllow: /jobs/open\nDisallow: /*.pdf$\n"
    assert robots_allows(rules, "https://x.org/careers", "aidjobsbot")
    assert not robots_allows(rules, "https://x.org/jobs/list", "aidjobsbot")
    assert robots_allows(rules, "https://x.org/jobs/open/1", "aidjobsbot")
    assert not robots_allows(rules, "https://x.org/a.pdf", "aidjobsbot")
    assert robots_allows(rules, "https://x.org/a.pdf?x=1", "aidjobsbot")
    named = "User-agent: AidJobsBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n"
    assert not robots_allows(named, "https://x.org/a", "aidjobsbot")
    assert robots_allows(named, "https://x.org/a", "aidjobssurvey")


def test_crawl_delay_belongs_to_its_group():
    text = ("User-agent: *\nCrawl-delay: 2\nDisallow: /x\n\n"
            "User-agent: AidJobsBot\nCrawl-delay: 7\nCrawl-delay: 3\nAllow: /\n")
    assert crawl_delay(text, "aidjobsbot") == 7.0
    assert crawl_delay(text, "aidjobssurvey") == 2.0
    assert crawl_delay("User-agent: *\nCrawl-delay: soon\nCrawl-delay: -4\n", "a") is None
    assert crawl_delay("User-agent: *\nCrawl-delay: inf\n", "a") is None
    assert crawl_delay("Crawl-delay: 9\nUser-agent: *\n", "a") is None


@pytest.mark.parametrize("status, verdict", [
    (200, "allowed"), (404, "allowed"), (410, "allowed"), (401, "refused"), (403, "refused"),
    (429, "refused"), (500, "unreachable"), (503, "unreachable"), (None, "unreachable"),
    (202, "unreachable"), (204, "unreachable"),
])
def test_each_answer_has_one_verdict(status, verdict):
    assert robots_verdict(status, "", "https://x.org/a", "aidjobsbot") == verdict


# robots.txt inside the fetch policy ---------------------------------------------------------

def test_a_forbidden_page_is_never_requested(slept):
    events, world = _world([_robots("User-agent: *\nDisallow: /jobs\n")])
    with pytest.raises(FetchError, match="^robots.txt forbids this address$"):
        _fetch("https://jobs.example/jobs/1", world)
    assert _sent(events) == ["GET jobs.example/robots.txt"]


def test_robots_txt_is_read_once_and_kept(slept):
    events, world = _world([_robots(), _response(200), _response(200)])
    _fetch("https://jobs.example/a", world)
    _fetch("https://jobs.example/b", world)
    assert _sent(events) == [
        "GET jobs.example/robots.txt", "GET jobs.example/a", "GET jobs.example/b",
    ]


def test_an_answer_older_than_a_day_is_read_again(slept):
    events, world = _world([_robots(), _response(200), _robots(), _response(200)])
    _fetch("https://jobs.example/a", world)
    origin = ("https", "jobs.example", 443)
    old = outbound._robots[origin]
    outbound._robots[origin] = outbound._RobotsAnswer(
        old.status, old.text, old.fetched - outbound.ROBOTS_KEEP_SECONDS - 1
    )
    _fetch("https://jobs.example/b", world)
    assert _sent(events).count("GET jobs.example/robots.txt") == 2


def test_no_robots_txt_allows_everything(slept):
    events, world = _world([_response(404, b"not here"), _response(200, b"ok")])
    assert _fetch("https://jobs.example/a", world).body == b"ok"


@pytest.mark.parametrize("answer", [
    _response(500), _response(503), _response(202, b"challenge"), _response(204),
    httpcore.ConnectError("refused"),
    _response(200, b"x" * (outbound.ROBOTS_MAX_BYTES + 1)),
])
def test_robots_txt_that_cannot_be_read_forbids_everything(answer, slept):
    events, world = _world([answer])
    with pytest.raises(FetchError, match="^robots.txt unreachable$"):
        _fetch("https://jobs.example/a", world)
    assert _sent(events) in ([], ["GET jobs.example/robots.txt"])


def test_an_unreachable_answer_is_kept_only_ten_minutes(slept):
    events, world = _world([_response(503), _robots(), _response(200)])
    with pytest.raises(FetchError):
        _fetch("https://jobs.example/a", world)
    with pytest.raises(FetchError, match="^robots.txt unreachable$"):
        _fetch("https://jobs.example/a", world)
    origin = ("https", "jobs.example", 443)
    old = outbound._robots[origin]
    outbound._robots[origin] = outbound._RobotsAnswer(
        old.status, old.text, old.fetched - outbound.ROBOTS_UNREACHABLE_KEEP_SECONDS - 1
    )
    _fetch("https://jobs.example/a", world)
    assert _sent(events).count("GET jobs.example/robots.txt") == 2


@pytest.mark.parametrize("status", [401, 403, 429])
def test_a_robots_txt_refusal_stops_the_crawl(status, slept):
    events, world = _world([_robots("", status)])

    async def crawl():
        with crawl_budget() as budget:
            with pytest.raises(FetchError, match="^robots.txt refused the crawler$"):
                await fetch_url("https://jobs.example/a", **world)
            with pytest.raises(FetchError, match="^stopped after a refusal$"):
                await fetch_url("https://other.example/a", **world)
            return budget.refused

    assert asyncio.run(crawl()) == f"robots.txt answered HTTP {status}"
    assert _sent(events) == ["GET jobs.example/robots.txt"]


def test_robots_txt_redirects_are_followed_up_to_five(slept):
    hops = [_redirect(f"https://jobs.example/robots{n}.txt") for n in range(5)]
    events, world = _world([*hops, _robots("User-agent: *\nDisallow: /a\n")])
    with pytest.raises(FetchError, match="^robots.txt forbids this address$"):
        _fetch("https://jobs.example/a", world)
    events, world = _world([_redirect(f"https://jobs.example/r{n}.txt") for n in range(6)])
    outbound._robots.clear()
    with pytest.raises(FetchError, match="^robots.txt unreachable$"):
        _fetch("https://jobs.example/a", world)


def test_robots_txt_answers_for_the_origin_that_was_asked(slept):
    events, world = _world([_redirect("https://cdn.example/robots.txt"),
                            _robots("User-agent: *\nDisallow: /\n")])
    with pytest.raises(FetchError, match="^robots.txt forbids this address$"):
        _fetch("https://jobs.example/a", world)
    assert ("https", "jobs.example", 443) in outbound._robots
    assert ("https", "cdn.example", 443) not in outbound._robots


def test_a_redirect_destination_is_checked_against_its_own_robots_txt(slept):
    events, world = _world([
        _robots(), _redirect("https://ats.example/board"),
        _robots("User-agent: *\nDisallow: /board\n"),
    ])
    with pytest.raises(FetchError, match="^robots.txt forbids this address$"):
        _fetch("https://jobs.example/careers", world)
    assert _sent(events) == [
        "GET jobs.example/robots.txt", "GET jobs.example/careers", "GET ats.example/robots.txt",
    ]


def test_a_redirect_to_another_scheme_on_the_same_host_does_not_deadlock(slept):
    events, world = _world([
        _robots(), _redirect("https://jobs.example/a", 301), _robots(), _response(200, b"ok"),
    ])

    async def run():
        return await asyncio.wait_for(fetch_url("http://jobs.example/a", **world), 5)

    assert asyncio.run(run()).body == b"ok"
    assert _sent(events) == [
        "GET jobs.example/robots.txt", "GET jobs.example/a",
        "GET jobs.example/robots.txt", "GET jobs.example/a",
    ]


def test_the_survey_is_judged_by_its_own_name_from_the_same_answer(slept):
    text = "User-agent: AidJobsSurvey\nDisallow: /\n\nUser-agent: *\nAllow: /\n"
    events, world = _world([_robots(text), _response(200, b"ok")])
    assert _fetch("https://jobs.example/a", world).body == b"ok"
    with pytest.raises(FetchError, match="^robots.txt forbids this address$"):
        _fetch("https://jobs.example/a", world, identity="survey")
    assert _sent(events) == ["GET jobs.example/robots.txt", "GET jobs.example/a"]


def test_a_callers_own_robots_txt_request_serves_the_policy(slept):
    events, world = _world([_robots(), _response(200, b"page")])
    _fetch("https://jobs.example/robots.txt", world, identity="survey")
    assert _fetch("https://jobs.example/careers", world, identity="survey").body == b"page"
    assert _sent(events) == ["GET jobs.example/robots.txt", "GET jobs.example/careers"]
    assert _requests(events)[0][1]["user-agent"].startswith("AidJobsSurvey/0.1")


def test_callers_asking_together_share_one_robots_txt_request(slept):
    async def run():
        gate = asyncio.Event()
        events, world = _world([_robots(), _response(200, b"1"), _response(200, b"2")],
                               gates={0: gate})
        first = asyncio.create_task(fetch_url("https://jobs.example/1", **world))
        second = asyncio.create_task(fetch_url("https://jobs.example/2", **world))
        await asyncio.sleep(0.05)
        gate.set()
        bodies = sorted([(await first).body, (await second).body])
        return events, bodies

    events, bodies = asyncio.run(run())
    assert bodies == [b"1", b"2"]
    assert _sent(events).count("GET jobs.example/robots.txt") == 1


def test_cancelling_the_crawl_that_asked_first_does_not_cancel_the_others(slept):
    async def run():
        gate = asyncio.Event()
        events, world = _world([_robots(), _response(200, b"2")], gates={0: gate})
        first = asyncio.create_task(fetch_url("https://jobs.example/1", **world))
        await asyncio.sleep(0.05)
        second = asyncio.create_task(fetch_url("https://jobs.example/2", **world))
        await asyncio.sleep(0.05)
        first.cancel()
        gate.set()
        with pytest.raises(asyncio.CancelledError):
            await first
        return (await second).body

    assert asyncio.run(run()) == b"2"


def test_a_crawl_delay_is_honoured_and_a_long_one_stops_the_source(slept):
    events, world = _world([_robots("User-agent: *\nCrawl-delay: 12\n"),
                            _response(200), _response(200)])
    _fetch("https://jobs.example/a", world)
    _fetch("https://jobs.example/b", world)
    assert len(slept) == 2 and all(11 < wait <= 12 for wait in slept)
    events, world = _world([_robots("User-agent: *\nCrawl-delay: 61\n")])
    with pytest.raises(FetchError, match="^robots.txt asks for too long a delay$"):
        _fetch("https://slow.example/a", world)
    assert _sent(events) == ["GET slow.example/robots.txt"]


# One request at a time per host -------------------------------------------------------------

def test_requests_to_one_host_are_five_seconds_apart(slept):
    events, world = _world([_robots(), _response(200), _response(200)])
    _fetch("https://jobs.example/a", world)
    _fetch("https://jobs.example/b", world)
    assert len(slept) == 2
    assert all(4.5 < wait <= outbound.HOST_SPACING_SECONDS for wait in slept)


def test_other_hosts_do_not_wait(slept):
    events, world = _world([_robots(), _response(200), _robots(), _response(200)])
    _fetch("https://one.example/a", world)
    slept.clear()
    outbound._last_answer.pop("one.example")
    _fetch("https://two.example/a", world)
    assert len(slept) == 1  # two.example's page after its own robots.txt


def test_the_spacing_holds_across_event_loops(slept):
    events, world = _world([_robots(), _response(200), _response(200)])
    asyncio.run(fetch_url("https://jobs.example/a", **world))
    slept.clear()
    asyncio.run(fetch_url("https://jobs.example/b", **world))
    assert len(slept) == 1 and slept[0] > 4.5


def test_a_failed_request_still_counts_for_the_spacing(slept):
    events, world = _world([_robots(), _response(200), httpcore.ConnectError("reset"),
                            _response(200)])
    _fetch("https://jobs.example/a", world)
    outbound._last_answer["jobs.example"] -= 1000  # long ago: the failing request does not wait
    slept.clear()
    with pytest.raises(httpcore.ConnectError):
        _fetch("https://jobs.example/b", world)
    assert slept == []
    _fetch("https://jobs.example/c", world)
    assert len(slept) == 1 and slept[0] > 4.5


def test_the_robots_txt_table_is_bounded(monkeypatch):
    monkeypatch.setattr(outbound, "_ROBOTS_ORIGINS_KEPT", 2)
    for host in ("a.example", "b.example", "c.example"):
        outbound._remember_robots(("https", host, 443), 200, ALLOW_ALL)
    assert list(outbound._robots) == [("https", "b.example", 443), ("https", "c.example", 443)]


def test_a_callers_failed_or_oversized_robots_txt_is_not_kept(slept):
    big = _robots("User-agent: *\nDisallow: /\n" + "#" * outbound.ROBOTS_MAX_BYTES)
    events, world = _world([big, httpcore.ConnectError("reset")])
    _fetch("https://jobs.example/robots.txt", world, identity="survey")
    assert ("https", "jobs.example", 443) not in outbound._robots
    outbound._remember_robots(("https", "jobs.example", 443), 200, ALLOW_ALL)
    with pytest.raises(httpcore.ConnectError):
        _fetch("https://jobs.example/robots.txt", world, identity="survey")
    assert outbound._robots[("https", "jobs.example", 443)].text == ALLOW_ALL


@pytest.mark.parametrize("url, method", [
    ("https://jobs.example/robots.txt?x=1", "GET"),
    ("https://jobs.example/robots.txt", "HEAD"),
])
def test_only_a_plain_robots_txt_request_skips_the_check(url, method, slept):
    events, world = _world([_robots(), _response(200)])
    _fetch(url, world, method=method)
    assert _sent(events)[0] == "GET jobs.example/robots.txt"
    assert len(_sent(events)) == 2


def test_the_shared_robots_txt_fetch_has_an_overall_limit(monkeypatch):
    # Its hops' own limit is set out of reach, so only the overall limit can end the fetch.
    monkeypatch.setattr(outbound, "ROBOTS_TOTAL_TIMEOUT_SECONDS", 30.0)
    monkeypatch.setattr(outbound, "ROBOTS_OVERALL_SECONDS", 0.2)

    async def run():
        never = asyncio.Event()
        events, world = _world([_robots()], gates={0: never})
        started = asyncio.get_running_loop().time()
        with pytest.raises(FetchError, match="^robots.txt unreachable$"):
            await asyncio.wait_for(fetch_url("https://jobs.example/a", **world), 5)
        return asyncio.get_running_loop().time() - started

    assert asyncio.run(run()) < 2


def test_waiting_for_robots_txt_is_bounded_by_the_crawls_time():
    async def run():
        never = asyncio.Event()
        events, world = _world([_robots()], gates={0: never})
        with crawl_budget(seconds=0.1):
            with pytest.raises(FetchError, match="^time budget used up$"):
                await fetch_url("https://jobs.example/a", **world)

    asyncio.run(run())


def test_one_request_at_a_time_per_host():
    async def run():
        gate = asyncio.Event()
        events, world = _world([_robots(), _response(200, b"1"), _response(200, b"2")],
                               gates={1: gate})
        first = asyncio.create_task(fetch_url("https://jobs.example/1", **world))
        second = asyncio.create_task(fetch_url("https://jobs.example/2", **world))
        await asyncio.sleep(0.2)
        held = len(_sent(events))
        gate.set()
        await first
        await second
        return held

    outbound.HOST_SPACING_SECONDS = 0.0
    try:
        held = asyncio.run(run())
    finally:
        outbound.HOST_SPACING_SECONDS = 5.0
    assert held == 1  # robots.txt only: the second page waits for the first


def test_waiting_for_the_host_is_not_counted_in_the_request_time_limit(monkeypatch):
    monkeypatch.setattr(outbound, "HOST_SPACING_SECONDS", 0.3)
    events, world = _world([_robots(), _response(200, b"ok")])
    assert _fetch("https://jobs.example/a", world, total_timeout=0.2).body == b"ok"


def test_a_wait_longer_than_the_cap_is_host_busy(monkeypatch):
    monkeypatch.setattr(outbound, "HOST_SPACING_SECONDS", 1.0)
    monkeypatch.setattr(outbound, "MAX_HOST_WAIT_SECONDS", 0.1)
    events, world = _world([_robots()])
    with pytest.raises(FetchError, match="^host busy$"):
        _fetch("https://jobs.example/a", world)


# The crawl's budget -------------------------------------------------------------------------

def test_the_request_budget_counts_robots_txt_and_every_hop(slept):
    events, world = _world([_robots(), _redirect("https://jobs.example/b"), _response(200)])

    async def crawl():
        with crawl_budget(requests=2):
            with pytest.raises(FetchError, match="^request budget used up$"):
                await fetch_url("https://jobs.example/a", **world)

    asyncio.run(crawl())
    assert _sent(events) == ["GET jobs.example/robots.txt", "GET jobs.example/a"]


def test_the_time_budget_bounds_the_wait_for_a_host(monkeypatch):
    monkeypatch.setattr(outbound, "HOST_SPACING_SECONDS", 1.0)
    events, world = _world([_robots()])

    async def crawl():
        with crawl_budget(seconds=0.15):
            with pytest.raises(FetchError, match="^time budget used up$"):
                await fetch_url("https://jobs.example/a", **world)

    asyncio.run(crawl())


def test_a_spent_time_budget_sends_nothing(slept):
    events, world = _world([])

    async def crawl():
        with crawl_budget(seconds=0):
            with pytest.raises(FetchError, match="^time budget used up$"):
                await fetch_url("https://jobs.example/a", **world)

    asyncio.run(crawl())
    assert events == []


@pytest.mark.parametrize("answer, reason", [
    (_response(403), "HTTP 403"),
    (_response(429), "HTTP 429"),
    (_response(202, b"<html>wait</html>"), "HTTP 202"),
    (_response(200, b"<html></html>", {"x-amzn-waf-action": "challenge"}),
     "HTTP 200 (AWS WAF challenge)"),
    (_response(200, b"<html></html>", {"cf-mitigated": "challenge"}),
     "HTTP 200 (Cloudflare challenge)"),
])
def test_a_refusal_stops_every_later_request_of_the_crawl(answer, reason, slept):
    events, world = _world([_robots(), answer])

    async def crawl():
        with crawl_budget() as budget:
            await fetch_url("https://jobs.example/a", **world)
            with pytest.raises(FetchError, match="^stopped after a refusal$"):
                await fetch_url("https://elsewhere.example/b", **world)
            return budget.refused

    assert asyncio.run(crawl()) == reason
    assert _sent(events) == ["GET jobs.example/robots.txt", "GET jobs.example/a"]


def test_tasks_started_inside_a_crawl_spend_its_budget(slept):
    events, world = _world([_robots(), _response(200)])

    async def crawl():
        with crawl_budget() as budget:
            await asyncio.create_task(fetch_url("https://jobs.example/a", **world))
            return budget.used, current_budget() is budget

    assert asyncio.run(crawl()) == (2, True)
    assert current_budget() is None


# Refusals and challenges --------------------------------------------------------------------

_UNICEF_SAVED = BACKEND.parents[1] / "raw-html" / "unicef-pagination" / "page1-items50.body"


@pytest.mark.parametrize("status, headers, body, expected", [
    (200, {}, "<html>jobs</html>", ""),
    (200, {}, '<script src="https://www.google.com/recaptcha/api.js"></script>', ""),
    (200, {}, '<script src="https://x.token.awswaf.com/challenge.js"></script>', ""),
    (200, {}, "<script>_incapsula_resource</script>", ""),
    (200, {}, "<title>Just a moment...</title>", "HTTP 200 (Cloudflare challenge)"),
    (202, {}, "<script src='https://x.token.awswaf.com/x.js'></script>",
     "HTTP 202 (AWS WAF challenge)"),
    (202, {"X-Amzn-Waf-Action": "challenge"}, "", "HTTP 202 (AWS WAF challenge)"),
    (204, {}, "", "HTTP 204"),
    (403, {"Server": "secret-name"}, "please solve the captcha", "HTTP 403"),
    (404, {}, "", ""),
    (503, {}, "busy", ""),
    (503, {}, "<script>_incapsula_resource</script>", "HTTP 503 (Imperva)"),
])
def test_what_counts_as_a_refusal(status, headers, body, expected):
    assert refusal(status, headers, body) == expected


def test_unicefs_own_listing_page_is_not_a_challenge():
    if not _UNICEF_SAVED.is_file():
        pytest.skip("saved UNICEF listing is gitignored")
    html = _UNICEF_SAVED.read_bytes().decode("utf-8", errors="replace")
    assert re.search("recaptcha", html, re.IGNORECASE)
    assert refusal(200, {"content-type": "text/html"}, html) == ""


# The HTML crawler ---------------------------------------------------------------------------

def _html_crawler(monkeypatch, answer):
    from crawler_v2 import simple_crawler

    async def fake_fetch_url(url, **_kwargs):
        if isinstance(answer, BaseException):
            raise answer
        return answer

    monkeypatch.setattr(simple_crawler, "fetch_url", fake_fetch_url)
    crawler = simple_crawler.SimpleCrawler("postgresql://unused")
    crawler.extraction_logger = None
    crawler.html_storage = None
    return crawler


_SOURCE = {"id": "src-1", "org_name": "Example", "careers_url": "https://jobs.example/",
           "source_type": "html"}


@pytest.mark.parametrize("answer, message", [
    (FetchResult(202, {}, b"<html></html>", "https://jobs.example/"), "Refused: HTTP 202"),
    (FetchResult(200, {"cf-mitigated": "challenge"}, b"<html>x</html>", "https://jobs.example/"),
     "Refused: HTTP 200 (Cloudflare challenge)"),
    (FetchResult(403, {}, b"", "https://jobs.example/"), "Refused: HTTP 403"),
    (FetchError("robots.txt forbids this address"),
     "Not fetched: robots.txt forbids this address"),
    (FetchError("stopped after a refusal"), "Not fetched: stopped after a refusal"),
    (FetchResult(404, {}, b"", "https://jobs.example/"), "HTTP 404"),
    (FetchError("timeout"), "HTTP 0"),
])
def test_a_first_page_that_is_not_a_listing_fails_the_crawl(answer, message, monkeypatch):
    crawler = _html_crawler(monkeypatch, answer)
    result = asyncio.run(crawler.crawl_source(dict(_SOURCE)))
    assert result["status"] == "failed"
    assert result["message"] == message
    assert result["counts"]["found"] == 0


class _Run:
    def __init__(self):
        self.saved = []

    async def save(self, save_jobs, jobs, source_id, org_name, **_kwargs):
        self.saved.append(list(jobs))
        return {"inserted": 0, "updated": 0, "skipped": 0, "failed": 0}


def test_a_refusal_ends_the_job_pages(monkeypatch, caplog):
    page = FetchResult(200, {}, b"<html><body>listing</body></html>", "https://jobs.example/")
    crawler = _html_crawler(monkeypatch, page)
    crawler.geocoder = None
    crawler.quality_scorer = None
    rows = [{"title": f"Officer {n}", "apply_url": f"https://jobs.example/job/{n}/x"}
            for n in range(1, 5)]

    async def listing(html, url):
        return [dict(row) for row in rows], None

    opened = []

    async def detail(job, base_url):
        opened.append(job["apply_url"])
        current_budget().refuse("HTTP 403")
        return job

    monkeypatch.setattr(crawler, "_listing_jobs", listing)
    monkeypatch.setattr(crawler, "enrich_job_from_detail_page", detail)

    async def crawl():
        with crawl_budget():
            return await crawler.crawl_source(dict(_SOURCE), _Run())

    with caplog.at_level(logging.WARNING, logger="crawler_v2.simple_crawler"):
        result = asyncio.run(crawl())
    assert opened == ["https://jobs.example/job/1/x"]
    assert result["counts"]["found"] == 4
    assert "Job pages stopped (stopped after a refusal); 3 rows keep their listing fields" \
        in caplog.text
    assert result["status"] == "warn"
    assert result["message"] == "Found 4 jobs; job pages stopped: refused: HTTP 403"


def test_a_refusal_on_the_last_job_page_is_reported_too(monkeypatch):
    page = FetchResult(200, {}, b"<html><body>listing</body></html>", "https://jobs.example/")
    crawler = _html_crawler(monkeypatch, page)
    crawler.geocoder = None
    crawler.quality_scorer = None

    async def listing(html, url):
        return [{"title": "Officer", "apply_url": "https://jobs.example/job/1/x"}], None

    async def detail(job, base_url):
        current_budget().refuse("HTTP 429")
        return job

    monkeypatch.setattr(crawler, "_listing_jobs", listing)
    monkeypatch.setattr(crawler, "enrich_job_from_detail_page", detail)

    async def crawl():
        with crawl_budget():
            return await crawler.crawl_source(dict(_SOURCE), _Run())

    result = asyncio.run(crawl())
    assert (result["status"], result["message"]) == (
        "warn", "Found 1 jobs; job pages stopped: refused: HTTP 429"
    )


@pytest.mark.parametrize("answer", [
    FetchResult(200, {"cf-mitigated": "challenge"},
                b"<h1>Officer</h1><span>Location: Mars</span>", "https://jobs.example/job/1"),
    FetchResult(202, {}, b"<h1>Officer</h1><span>Location: Mars</span>",
                "https://jobs.example/job/1"),
    FetchError("robots.txt forbids this address"),
])
def test_a_refused_job_page_is_not_read(answer, monkeypatch):
    crawler = _html_crawler(monkeypatch, answer)
    row = {"title": "Officer", "apply_url": "https://jobs.example/job/1"}
    job = asyncio.run(crawler.enrich_job_from_detail_page(dict(row), "https://jobs.example/"))
    assert job == row


def test_the_same_job_page_answered_plainly_is_read(monkeypatch):
    page = FetchResult(200, {}, b"<h1>Officer</h1><span>Location: Mars</span>",
                       "https://jobs.example/job/1")
    crawler = _html_crawler(monkeypatch, page)
    row = {"title": "Officer", "apply_url": "https://jobs.example/job/1"}
    job = asyncio.run(crawler.enrich_job_from_detail_page(dict(row), "https://jobs.example/"))
    assert job["location_raw"] == "Mars"


@pytest.mark.parametrize("module, reader, call", [
    ("rss_crawler", "SimpleRSSCrawler", "fetch_feed"),
    ("api_crawler", "SimpleAPICrawler", "fetch_api"),
])
def test_a_challenged_feed_is_not_read(module, reader, call, monkeypatch):
    import importlib

    crawler_module = importlib.import_module(f"crawler_v2.{module}")

    async def challenged(url, **_kwargs):
        return FetchResult(200, {"x-amzn-waf-action": "challenge"},
                           b'{"jobs": [{"title": "x"}]}', url)

    monkeypatch.setattr(crawler_module, "fetch_url", challenged)
    crawler = getattr(crawler_module, reader)("postgresql://unused")
    assert asyncio.run(getattr(crawler, call)("https://jobs.example/feed")) is None


@pytest.mark.parametrize("module, reader", [
    ("rss_crawler", "SimpleRSSCrawler"), ("api_crawler", "SimpleAPICrawler"),
])
def test_a_refused_feed_says_so(module, reader, monkeypatch):
    import importlib

    crawler_module = importlib.import_module(f"crawler_v2.{module}")

    async def refused(url, **_kwargs):
        current_budget().refuse("HTTP 403")
        return FetchResult(403, {}, b"", url)

    monkeypatch.setattr(crawler_module, "fetch_url", refused)
    crawler = getattr(crawler_module, reader)("postgresql://unused")

    async def crawl():
        with crawl_budget():
            return await crawler.crawl_source(dict(_SOURCE, source_type="rss"), _Run())

    result = asyncio.run(crawl())
    assert (result["status"], result["message"]) == ("failed", "Refused: HTTP 403")


# The schedule -------------------------------------------------------------------------------

def _orchestrator():
    from orchestrator import CrawlerOrchestrator

    return CrawlerOrchestrator("postgresql://unused")


@pytest.mark.parametrize("refuse, raises", [(True, False), (True, True), (False, False)])
def test_the_run_records_a_refusal_whatever_the_crawler_returns(refuse, raises):
    orch = _orchestrator()

    async def crawl_source(source, run):
        if refuse:
            current_budget().refuse("HTTP 202 (AWS WAF challenge)")
        if raises:
            raise RuntimeError("reader broke")
        return {"status": "warn", "message": "Found 1 jobs", "counts": {"found": 1}}

    orch.html_crawler.crawl_source = crawl_source
    result = asyncio.run(orch.crawl_source(dict(_SOURCE), run=None))
    assert result.get("refused", False) is refuse
    assert current_budget() is None


class _SourceCursor:
    def __init__(self):
        self.statements = []

    def execute(self, sql, params=None):
        self.statements.append((" ".join(sql.split()), params))

    def fetchone(self):
        return ("active", 3, "ngo", 0, 0, "ok")


@pytest.mark.parametrize("outcome, run_status", [("fail", "failed"), ("success", "warn")])
def test_a_refused_source_waits_at_least_a_day_after_jitter_and_health(outcome, run_status):
    orch = _orchestrator()
    orch.compute_next_run = lambda *args, **kwargs: datetime.utcnow() + timedelta(hours=5)
    for refused, at_least in ((True, timedelta(hours=24)), (False, timedelta(hours=4))):
        cursor = _SourceCursor()
        before = datetime.utcnow()
        orch._update_source(cursor, "src-1", outcome=outcome, run_status=run_status,
                            message="m", counts={}, health=None, refused=refused)
        sql, params = cursor.statements[-1]
        assert sql.startswith("UPDATE sources SET")
        next_run_at = params[4]
        assert next_run_at - before >= at_least
        if not refused:
            assert next_run_at - before < timedelta(hours=6)
        assert params[2] == (1 if outcome == "fail" else 0)


class _FinishCursor(_SourceCursor):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def fetchone(self):
        sql = self.statements[-1][0]
        if sql.startswith("UPDATE crawl_logs"):
            return ("run-9",)
        return super().fetchone()


class _FinishConn:
    def __init__(self):
        self.cursor_obj = _FinishCursor()

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        return None


@pytest.mark.parametrize("refused", [True, False])
def test_the_finish_passes_the_refusal_to_the_schedule(refused):
    orch = _orchestrator()
    conn = _FinishConn()
    orch._get_db_conn = lambda: conn
    orch.health_score = lambda source_id: None
    orch.compute_next_run = lambda *args, **kwargs: datetime.utcnow() + timedelta(hours=5)
    result = {"status": "failed", "message": "Refused: HTTP 403", "counts": {},
              "duration_ms": 1}
    if refused:
        result["refused"] = True
    before = datetime.utcnow()
    assert asyncio.run(orch.finish_run(dict(_SOURCE), "run-9", result)) is True
    update = next(params for sql, params in conn.cursor_obj.statements
                  if sql.startswith("UPDATE sources SET"))
    waited = update[4] - before
    assert (waited >= timedelta(hours=24)) is refused


def test_the_real_schedule_with_jitter_is_still_floored():
    orch = _orchestrator()
    before = datetime.utcnow()
    for _ in range(50):
        cursor = _SourceCursor()
        orch._update_source(cursor, "src-1", outcome="success", run_status="warn",
                            message="m", counts={"inserted": 40}, health={
                                "score": 90, "components": {"activity": 90},
                                "recommended_frequency_days": 0.25},
                            refused=True)
        assert cursor.statements[-1][1][4] - before >= timedelta(hours=24)


# Contacts are not collected -----------------------------------------------------------------

def test_a_mailto_link_is_rejected_without_keeping_or_logging_the_address(caplog):
    from core.extraction_heuristics import score_link

    link = BeautifulSoup('<a href="mailto:recruiter@ngo.example">Apply</a>', "html.parser").a
    with caplog.at_level(logging.INFO):
        score, metadata = score_link(link, "https://ngo.example/jobs", "src-1")
    assert score == 0.0
    assert metadata == {"reason": "mailto_link"}
    assert "recruiter@ngo.example" not in caplog.text


def test_the_crawler_collects_no_contacts(caplog):
    from crawler_v2.simple_crawler import SimpleCrawler

    source = (BACKEND / "crawler_v2" / "simple_crawler.py").read_text(encoding="utf-8")
    assert "extract_contact_info" not in source
    crawler = SimpleCrawler("postgresql://unused")
    html = ('<div class="jobs"><a href="mailto:hr@ngo.example">Programme Officer vacancy</a>'
            '<p>Call +44 20 7946 0000 or write to hr@ngo.example</p>'
            '<a href="/job/12/programme-officer">Programme Officer job</a></div>')
    with caplog.at_level(logging.DEBUG):
        crawler._extract_from_links(BeautifulSoup(html, "html.parser"), "https://ngo.example/")
    assert "hr@ngo.example" not in caplog.text
    assert "7946" not in caplog.text


# Nothing else speaks for AidJobs ------------------------------------------------------------

_PRODUCTION = ["main.py", "orchestrator.py", "app", "contracts", "core", "crawler", "crawler_v2",
               "pipeline", "security"]


def _production_files():
    for name in _PRODUCTION:
        path = BACKEND / name
        if path.is_file():
            yield path
        elif path.is_dir():
            yield from sorted(p for p in path.rglob("*.py") if "__pycache__" not in p.parts)


def test_no_other_crawler_name_in_production_code():
    names = re.compile(r"Mozilla/|Chrome/|AidJobs/1\.0|AidJobsBot/|contact@aidjobs\.app")
    found = {
        path.relative_to(BACKEND).as_posix() for path in _production_files()
        if names.search(path.read_text(encoding="utf-8", errors="replace"))
    }
    assert found == {"contracts/outbound.py"}


def test_only_known_third_parties_are_called_outside_the_fetch_policy():
    clients = re.compile(r"httpx\.(?:AsyncClient|Client|get|post|request|stream)\b"
                         r"|requests\.(?:get|post|put|head|request|Session)\b"
                         r"|urllib\.request|aiohttp|urlopen")
    found = {
        path.relative_to(BACKEND).as_posix() for path in _production_files()
        if clients.search(path.read_text(encoding="utf-8", errors="replace"))
    }
    # Nominatim until the offline country lookup (W-27); OpenRouter for the old public search
    # helpers and the AI modules the crawler no longer calls (contract section 10 amendment).
    assert found <= {"core/geocoder.py", "app/ai_service.py", "core/ai_extractor.py",
                     "core/ai_normalizer.py", "pipeline/ai_fallback.py"}
    assert not (BACKEND / "core" / "net.py").exists()
    assert not (BACKEND / "core" / "robots.py").exists()
