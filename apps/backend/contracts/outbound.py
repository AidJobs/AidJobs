"""Fetch a URL through the outbound address policy.

Each hop resolves DNS, rejects any prohibited answer, and opens a new
connection pool whose TCP connect uses only the pinned address. TLS SNI and
certificate verification keep the URL hostname.

Every request carries one honest identity, set here; is a GET or HEAD; is allowed by the
destination's robots.txt (RFC 9309), checked before each hop; and waits its turn for its host:
one request at a time, a few seconds apart. Inside a crawl (`crawl_budget`), the crawl's
request and time budget is spent here, and after a refusal or a challenge the crawl's later
requests fail without being sent (growth plan, section 4.2; ledger W-34).

`timeout` bounds each network step; `total_timeout` bounds the request's own hops, the body
included. Waiting for a host's turn and reading its robots.txt are not counted in it.
"""
from __future__ import annotations

import asyncio
import contextvars
import ipaddress
import logging
import math
import os
import re
import socket
import time
import weakref
import zlib
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager, contextmanager, nullcontext
from dataclasses import dataclass
from functools import cache
from urllib.parse import urljoin, urlsplit

import brotli
import httpcore

from contracts.fetch import hostname_permitted, pin_address, port_permitted, scheme_permitted
from contracts.refusal import refusal
from contracts.robots import crawl_delay, robots_verdict

logger = logging.getLogger(__name__)

# The crawler's one identity (growth plan, decision 2). AIDJOBS_CONTACT_EMAIL changes the contact
# address; nothing changes the name, which is the product token robots.txt is read for. The
# employer survey keeps its own published name (decided by the user, 7 November 2026).
DEFAULT_CONTACT = "aidjobz@gmail.com"
SURVEY_USER_AGENT = "AidJobsSurvey/0.1 (+mailto:aidjobz@gmail.com)"
_TOKENS = {"crawler": "aidjobsbot", "survey": "aidjobssurvey"}
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
_METHODS = frozenset({"GET", "HEAD"})
_SET_BY_POLICY = frozenset({"user-agent", "from"})

HOST_SPACING_SECONDS = 5.0
MAX_CRAWL_DELAY_SECONDS = 60.0
MAX_HOST_WAIT_SECONDS = 120.0
_HOSTS_KEPT = 1000

CRAWL_REQUEST_BUDGET = 100
CRAWL_TIME_BUDGET_SECONDS = 600.0

# Shared request budgets for recruitment-system hosts many employers share (growth plan §4.2;
# ledger W-34 leftover / W-38). Keys match Reader.budget_group. Spacing between hops on the
# same host still applies separately.
HOST_GROUP_BUDGET_REQUESTS = 12
HOST_GROUP_BUDGET_WINDOW_SECONDS = 60.0
HOST_GROUP_LIMITS: dict[str, tuple[int, float]] = {
    "workable": (HOST_GROUP_BUDGET_REQUESTS, HOST_GROUP_BUDGET_WINDOW_SECONDS),
    "greenhouse": (HOST_GROUP_BUDGET_REQUESTS, HOST_GROUP_BUDGET_WINDOW_SECONDS),
    "teamtailor": (HOST_GROUP_BUDGET_REQUESTS, HOST_GROUP_BUDGET_WINDOW_SECONDS),
    "lever": (HOST_GROUP_BUDGET_REQUESTS, HOST_GROUP_BUDGET_WINDOW_SECONDS),
    "personio": (HOST_GROUP_BUDGET_REQUESTS, HOST_GROUP_BUDGET_WINDOW_SECONDS),
}

# RFC 9309: follow at least five redirects, parse at least 500 KiB, keep an answer up to 24 hours.
ROBOTS_MAX_REDIRECTS = 5
ROBOTS_MAX_BYTES = 500 * 1024
ROBOTS_STEP_TIMEOUT_SECONDS = 10.0
ROBOTS_TOTAL_TIMEOUT_SECONDS = 20.0
ROBOTS_OVERALL_SECONDS = 60.0
ROBOTS_KEEP_SECONDS = 24 * 3600.0
ROBOTS_UNREACHABLE_KEEP_SECONDS = 600.0
_ROBOTS_ORIGINS_KEPT = 1000

MAX_RESPONSE_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 20
TOTAL_TIMEOUT_SECONDS = 60.0
# Two tries of glibc's default 5-second resolver timeout, so one lost packet still resolves
DNS_TIMEOUT_SECONDS = 10.0
DNS_WORKERS = 8
_REDIRECTS = {301, 302, 303, 307, 308}
# Sent again after a redirect to another origin; any other header (a key, a token) is dropped.
# The policy's own User-Agent and From are added to every hop.
_CROSS_ORIGIN_HEADERS = frozenset({
    "accept",
    "accept-language",
    "accept-encoding",
    "connection",
})
_TIMEOUTS = (
    httpcore.ConnectTimeout,
    httpcore.ReadTimeout,
    httpcore.WriteTimeout,
    httpcore.PoolTimeout,
)

Resolver = Callable[[str, int], Awaitable[list[str]]]
BackendFactory = Callable[[str], httpcore.AsyncNetworkBackend]
PoolFactory = Callable[[httpcore.AsyncNetworkBackend], httpcore.AsyncConnectionPool]


class FetchError(Exception):
    """The URL was not fetched. Callers keep their existing failure results."""


# FetchError's messages in this module: fixed text we wrote. Anything else is not repeated.
FETCH_MESSAGES = frozenset({
    "unix sockets are not used",
    "DNS resolution failed",
    "DNS resolution timed out",
    "URL scheme or host is not permitted",
    "destination host is not permitted",
    "destination port is not permitted",
    "destination address is not permitted",
    "response exceeds size limit",
    "content encoding failed",
    "content encoding is not permitted",
    "timeout",
    "time limit",
    "redirect limit",
    "redirect destination is missing",
    "redirect destination is not permitted",
    "method is not permitted",
    "identity is not permitted",
    "user agent is set by the policy",
    "robots.txt forbids this address",
    "robots.txt refused the crawler",
    "robots.txt unreachable",
    "robots.txt asks for too long a delay",
    "host busy",
    "shared host budget wait",
    "stopped after a refusal",
    "request budget used up",
    "time budget used up",
})
# The stops of the politeness rules, as opposed to network failures.
POLITENESS_STOPS = frozenset({
    "robots.txt forbids this address",
    "robots.txt refused the crawler",
    "robots.txt unreachable",
    "robots.txt asks for too long a delay",
    "host busy",
    "shared host budget wait",
    "stopped after a refusal",
    "request budget used up",
    "time budget used up",
})

def fetch_message(error: BaseException) -> str | None:
    """A FetchError's message when it is one of the fixed messages above; otherwise None."""
    reason = str(error)
    return reason if isinstance(error, FetchError) and reason in FETCH_MESSAGES else None


@dataclass(frozen=True)
class FetchResult:
    status_code: int
    headers: dict[str, str]
    body: bytes
    url: str
    redirects: int = 0

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


# --- identity --------------------------------------------------------------------------------

_contact_warned = False


def contact_email() -> str:
    """AIDJOBS_CONTACT_EMAIL when it is one email address; otherwise the default."""
    global _contact_warned
    value = os.getenv("AIDJOBS_CONTACT_EMAIL", "").strip()
    if not value:
        return DEFAULT_CONTACT
    if _EMAIL.fullmatch(value):
        return value
    if not _contact_warned:
        _contact_warned = True
        logger.warning("AIDJOBS_CONTACT_EMAIL is not one email address; the default is used")
    return DEFAULT_CONTACT


def user_agent(identity: str = "crawler") -> str:
    """The User-Agent the policy sends for `identity` ('crawler' or 'survey')."""
    if identity == "survey":
        return SURVEY_USER_AGENT
    return f"AidJobsBot/1.0 (+mailto:{contact_email()})"


def _identity_headers(identity: str) -> dict[str, str]:
    contact = DEFAULT_CONTACT if identity == "survey" else contact_email()
    return {"User-Agent": user_agent(identity), "From": contact}


# --- the crawl's budget ----------------------------------------------------------------------


class CrawlBudget:
    """One crawl's requests and time, and whether the source refused it. Shared by every task of
    the crawl through a context variable; spent and checked only by this module."""

    def __init__(self, requests: int, seconds: float):
        self.requests_left = requests
        self.deadline = time.monotonic() + seconds
        self.used = 0
        self.refused = ""

    def seconds_left(self) -> float:
        return self.deadline - time.monotonic()

    def stopped(self) -> str:
        """Why the crawl may send nothing more, in fixed words; '' while it may."""
        if self.refused:
            return "stopped after a refusal"
        if self.requests_left <= 0:
            return "request budget used up"
        if self.seconds_left() <= 0:
            return "time budget used up"
        return ""

    def check(self) -> None:
        if self.refused:
            raise FetchError("stopped after a refusal")
        if self.requests_left <= 0:
            raise FetchError("request budget used up")
        if self.seconds_left() <= 0:
            raise FetchError("time budget used up")

    def take(self) -> None:
        self.check()
        self.requests_left -= 1
        self.used += 1

    def refuse(self, reason: str) -> None:
        if not self.refused:
            self.refused = reason


_BUDGET: contextvars.ContextVar[CrawlBudget | None] = contextvars.ContextVar(
    "aidjobs_crawl_budget", default=None
)


@contextmanager
def crawl_budget(requests: int = CRAWL_REQUEST_BUDGET, seconds: float = CRAWL_TIME_BUDGET_SECONDS):
    """Run a crawl inside its own budget. The orchestrator sets one around every crawl."""
    budget = CrawlBudget(requests, seconds)
    token = _BUDGET.set(budget)
    try:
        yield budget
    finally:
        _BUDGET.reset(token)


def current_budget() -> CrawlBudget | None:
    return _BUDGET.get()


# --- one request at a time per host ----------------------------------------------------------

_sleep = asyncio.sleep
# When each host last answered. Kept at module level, so the spacing holds across event loops
# (the survey starts one per request); the locks belong to their loop.
_last_answer: OrderedDict[str, float] = OrderedDict()
_host_locks: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()
# Timestamps of requests that spent a shared ATS host-group slot (W-38).
_group_hits: dict[str, list[float]] = {}

# Optional host-group for the current fetch (Reader.budget_group); set by crawl callers.
_HOST_GROUP: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "aidjobs_host_group", default=None
)


@contextmanager
def host_group(group: str | None):
    """Spend shared ATS host-group budget on fetches inside this block (ledger W-38)."""
    token = _HOST_GROUP.set(group or None)
    try:
        yield
    finally:
        _HOST_GROUP.reset(token)


def current_host_group() -> str | None:
    return _HOST_GROUP.get()


def _lock_for(host: str) -> asyncio.Lock:
    locks = _host_locks.setdefault(asyncio.get_running_loop(), {})
    lock = locks.get(host)
    if lock is None:
        if len(locks) >= _HOSTS_KEPT:
            for name in [n for n, held in locks.items()
                         if not held.locked() and not getattr(held, "_waiters", None)]:
                del locks[name]
        lock = locks[host] = asyncio.Lock()
    return lock


def _answered(host: str) -> None:
    _last_answer[host] = time.monotonic()
    _last_answer.move_to_end(host)
    while len(_last_answer) > _HOSTS_KEPT:
        _last_answer.popitem(last=False)


async def _take_group_slot(group: str | None, budget: CrawlBudget | None) -> None:
    """Wait until this ATS group has a free request in its rolling window, then record one."""
    if not group:
        return
    limits = HOST_GROUP_LIMITS.get(group)
    if limits is None:
        return
    max_req, window = limits
    lock = _lock_for(f"__group__:{group}")
    while True:
        wait = 0.0
        async with lock:
            now = time.monotonic()
            hits = _group_hits.setdefault(group, [])
            hits[:] = [stamp for stamp in hits if now - stamp < window]
            if len(hits) < max_req:
                hits.append(now)
                return
            wait = window - (now - hits[0]) + 0.01
        bound = MAX_HOST_WAIT_SECONDS
        if budget is not None:
            left = budget.seconds_left()
            if left <= 0:
                raise FetchError("time budget used up")
            bound = min(bound, left)
        if wait > bound:
            raise FetchError("shared host budget wait")
        await _sleep(wait)


@asynccontextmanager
async def _host_slot(host: str, delay: float | None, budget: CrawlBudget | None):
    """Hold `host` for one hop, at least the spacing (or a longer Crawl-delay) after its last
    answer. The wait is capped, and inside a crawl it is spent from the crawl's time."""
    bound = MAX_HOST_WAIT_SECONDS
    by_budget = False
    if budget is not None and budget.seconds_left() < bound:
        bound, by_budget = max(budget.seconds_left(), 0.0), True
    lock = _lock_for(host)
    spacing = max(HOST_SPACING_SECONDS, delay or 0.0)
    try:
        async with asyncio.timeout(bound) as waited:
            await lock.acquire()
            try:
                wait = _last_answer.get(host, -math.inf) + spacing - time.monotonic()
                if wait > 0:
                    await _sleep(wait)
            except BaseException:
                lock.release()
                raise
    except TimeoutError as exc:
        if waited.expired() and by_budget:
            raise FetchError("time budget used up") from exc
        if waited.expired():
            raise FetchError("host busy") from exc
        raise
    try:
        yield
    finally:
        _answered(host)
        lock.release()


# --- robots.txt ------------------------------------------------------------------------------


@dataclass(frozen=True)
class _RobotsAnswer:
    status: int | None
    text: str
    fetched: float


_robots: OrderedDict[tuple[str, str, int], _RobotsAnswer] = OrderedDict()
_robots_flights: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()


def _unreachable(status: int | None) -> bool:
    return status is None or status >= 500 or (status < 400 and status != 200)


def _remember_robots(origin, status: int | None, text: str) -> _RobotsAnswer:
    answer = _RobotsAnswer(status, text, time.monotonic())
    _robots[origin] = answer
    _robots.move_to_end(origin)
    while len(_robots) > _ROBOTS_ORIGINS_KEPT:
        _robots.popitem(last=False)
    return answer


def _cached_robots(origin) -> _RobotsAnswer | None:
    answer = _robots.get(origin)
    if answer is None:
        return None
    keep = ROBOTS_UNREACHABLE_KEEP_SECONDS if _unreachable(answer.status) else ROBOTS_KEEP_SECONDS
    if time.monotonic() - answer.fetched > keep:
        _robots.pop(origin, None)
        return None
    return answer


def _robots_url(origin) -> str:
    scheme, host, port = origin
    name = f"[{host}]" if ":" in host else host
    default = 443 if scheme == "https" else 80
    return f"{scheme}://{name}{'' if port == default else f':{port}'}/robots.txt"


def _robots_request(url: str, method: str) -> bool:
    parts = urlsplit(url)
    return method == "GET" and parts.path == "/robots.txt" and not parts.query


@dataclass(frozen=True)
class _Net:
    resolve: Resolver
    backends: BackendFactory
    pools: PoolFactory
    dns_timeout: float


async def _fetch_robots(
    origin, identity: str, net: _Net, budget: CrawlBudget | None,
) -> _RobotsAnswer | None:
    """Read robots.txt, every redirect hop included. Inside a crawl (`budget` set) each hop is
    charged to that crawl and the fetch ends with the crawl's time. A fetch the budget ends is
    not an answer: it returns None, is not kept, and the next asker reads it again."""
    # The crawl's own deadline, on the same clock as CrawlBudget, so "timer expired" and
    # "budget stopped" agree exactly.
    timer = asyncio.timeout_at(budget.deadline) if budget is not None else None
    try:
        # Its hops' own time is limited by ROBOTS_TOTAL_TIMEOUT_SECONDS; this bounds the whole
        # fetch, the waits for the host included.
        async with asyncio.timeout(ROBOTS_OVERALL_SECONDS):
            async with timer if timer is not None else nullcontext():
                result = await _follow(
                    _robots_url(origin), "GET", {"Accept": "text/plain,*/*;q=0.8"}, identity,
                    ROBOTS_STEP_TIMEOUT_SECONDS, ROBOTS_TOTAL_TIMEOUT_SECONDS, ROBOTS_MAX_BYTES,
                    ROBOTS_MAX_REDIRECTS, net, budget, check_robots=False,
                )
    except Exception:  # noqa: BLE001  any failure to read it, the address policy's included
        if budget is not None and (timer.expired() or budget.stopped()):
            return None
        return _remember_robots(origin, None, "")
    return _remember_robots(origin, result.status_code, result.text)


async def _robots_answer(origin, identity: str, budget: CrawlBudget | None, net: _Net):
    """One fetch per origin at a time; others wait for it. It runs outside the asking crawl's
    context, so cancelling that crawl does not cancel the fetch the others wait for. A fetch
    charged to another crawl's budget and cut by it gives no answer: the asker starts its own,
    unless its own budget is spent too."""
    loop = asyncio.get_running_loop()
    flights = _robots_flights.setdefault(loop, {})
    while True:
        task = flights.get(origin)
        if task is None:
            task = loop.create_task(
                _fetch_robots(origin, identity, net, budget), context=contextvars.Context(),
            )
            flights[origin] = task

            def landed(done, origin=origin, flights=flights):
                if flights.get(origin) is done:
                    del flights[origin]

            task.add_done_callback(landed)
        if budget is None:
            answer = await asyncio.shield(task)
        else:
            try:
                async with asyncio.timeout(max(budget.seconds_left(), 0.0)) as limit:
                    answer = await asyncio.shield(task)
            except TimeoutError as exc:
                if limit.expired():
                    raise FetchError("time budget used up") from exc
                raise
        if answer is not None:
            return answer
        if budget is not None:
            budget.check()  # raises the crawl's own fixed message when it has stopped
        if flights.get(origin) is task:
            del flights[origin]


async def _robots_gate(
    url: str, method: str, identity: str, budget: CrawlBudget | None, net: _Net
):
    """Raise unless robots.txt lets `identity` fetch `url`; return its Crawl-delay, if any.
    Only robots.txt itself, asked for plainly, is not checked against robots.txt."""
    if _robots_request(url, method):
        return None
    origin = _origin(url)
    answer = _cached_robots(origin) or await _robots_answer(origin, identity, budget, net)
    token = _TOKENS[identity]
    verdict = robots_verdict(answer.status, answer.text, url, token)
    if verdict == "refused":
        if budget is not None:
            budget.refuse(f"robots.txt answered HTTP {answer.status}")
        raise FetchError("robots.txt refused the crawler")
    if verdict == "unreachable":
        raise FetchError("robots.txt unreachable")
    if verdict == "forbidden":
        raise FetchError("robots.txt forbids this address")
    delay = crawl_delay(answer.text, token) if answer.status == 200 else None
    if delay is not None and delay > MAX_CRAWL_DELAY_SECONDS:
        raise FetchError("robots.txt asks for too long a delay")
    return delay


class PinnedBackend(httpcore.AsyncNetworkBackend):
    """Open TCP to one already validated address. Leave TLS hostname alone."""

    def __init__(self, pinned_ip: str, inner: httpcore.AsyncNetworkBackend):
        self._pinned_ip = pinned_ip
        self._inner = inner

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options=None,
    ) -> httpcore.AsyncNetworkStream:
        return await self._inner.connect_tcp(
            self._pinned_ip,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options=None,
    ):
        raise FetchError("unix sockets are not used")

    async def sleep(self, seconds: float) -> None:
        await self._inner.sleep(seconds)


def _default_backend_factory(pinned_ip: str) -> httpcore.AsyncNetworkBackend:
    return PinnedBackend(pinned_ip, httpcore.AnyIOBackend())


@cache
def _tls_context():
    """httpcore's default context, built once: building it loads the whole certificate bundle."""
    return httpcore.default_ssl_context()


def _default_pool_factory(backend: httpcore.AsyncNetworkBackend) -> httpcore.AsyncConnectionPool:
    return httpcore.AsyncConnectionPool(
        ssl_context=_tls_context(),
        network_backend=backend,
        max_connections=1,
        max_keepalive_connections=0,
        keepalive_expiry=0.0,
        retries=0,
        http2=False,
    )


# A lookup cannot be stopped once it starts, so lookups get their own threads: a slow resolver
# then cannot hold up the threads the crawler uses for its database steps.
_dns_pool = ThreadPoolExecutor(max_workers=DNS_WORKERS, thread_name_prefix="aidjobs-dns")


async def _default_resolver(host: str, port: int) -> list[str]:
    def lookup() -> list[str]:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        ips: list[str] = []
        for info in infos:
            ip = info[4][0]
            if ip not in ips:
                ips.append(ip)
        return ips

    try:
        return await asyncio.get_running_loop().run_in_executor(_dns_pool, lookup)
    except OSError as exc:
        raise FetchError("DNS resolution failed") from exc


def _port(scheme: str, parts) -> int:
    try:
        port = parts.port
    except ValueError as exc:
        raise FetchError("destination port is not permitted") from exc
    if port is None:
        port = 443 if scheme == "https" else 80
    if not port_permitted(port):
        raise FetchError("destination port is not permitted")
    return port


def _split(url: str) -> tuple[str, str, int, bytes]:
    parts = urlsplit(url)
    if not scheme_permitted(parts.scheme) or not parts.hostname:
        raise FetchError("URL scheme or host is not permitted")
    host = parts.hostname
    if not hostname_permitted(host):
        raise FetchError("destination host is not permitted")
    port = _port(parts.scheme, parts)
    path = parts.path or "/"
    if parts.query:
        path = f"{path}?{parts.query}"
    return parts.scheme, host, port, path.encode("utf-8")


def _host_bytes(host: str) -> bytes:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return host.encode("idna")
    return host.encode("ascii")


def _header_map(headers: list[tuple[bytes, bytes]]) -> dict[str, str]:
    mapped: dict[str, str] = {}
    for key, value in headers:
        mapped[key.decode("latin-1").lower()] = value.decode("latin-1")
    return mapped


def _origin(url: str) -> tuple[str, str, int]:
    """Scheme, host and port of a URL that `_split` has already accepted."""
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").rstrip(".").lower()
    return scheme, host, _port(scheme, parts)


def _cross_origin_headers(headers: dict[str, str]) -> dict[str, str]:
    return {key: value for key, value in headers.items() if key.lower() in _CROSS_ORIGIN_HEADERS}


def _raw_headers(host: str, headers: dict[str, str]) -> list[tuple[bytes, bytes]]:
    raw = [(b"host", _host_bytes(host))]
    for key, value in headers.items():
        if key.lower() == "host":
            continue
        raw.append((key.encode("ascii"), value.encode("latin-1")))
    return raw


async def _read_capped(stream, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in stream:
        if not chunk:
            continue
        total += len(chunk)
        if total > max_bytes:
            raise FetchError("response exceeds size limit")
        chunks.append(chunk)
    return b"".join(chunks)


def _encoding_name(headers: dict[str, str]) -> str:
    return headers.get("content-encoding", "").strip().lower()


def _inflate(body: bytes, wbits: int, max_decoded: int) -> bytes:
    """Decode a zlib stream. Stop once the output passes max_decoded."""
    decoder = zlib.decompressobj(wbits)
    pending = body
    parts: list[bytes] = []
    total = 0
    try:
        while True:
            room = max_decoded - total + 1
            piece = decoder.decompress(pending, max(room, 1))
            pending = decoder.unconsumed_tail
            total += len(piece)
            if total > max_decoded:
                raise FetchError("response exceeds size limit")
            if piece:
                parts.append(piece)
            if decoder.eof:
                break
            if not pending:
                raise FetchError("content encoding failed")
        trailer = decoder.flush()
    except zlib.error as exc:
        raise FetchError("content encoding failed") from exc
    total += len(trailer)
    if total > max_decoded:
        raise FetchError("response exceeds size limit")
    if trailer:
        parts.append(trailer)
    return b"".join(parts)


def _inflate_brotli(body: bytes, max_decoded: int) -> bytes:
    """Decode brotli. Each output buffer stops at the decoded cap."""
    decoder = brotli.Decompressor()
    pending = body
    parts: list[bytes] = []
    total = 0
    try:
        while True:
            piece = decoder.process(pending, output_buffer_limit=max_decoded + 1)
            pending = b""
            total += len(piece)
            if total > max_decoded:
                raise FetchError("response exceeds size limit")
            if piece:
                parts.append(piece)
            if decoder.is_finished():
                break
            if decoder.can_accept_more_data():
                raise FetchError("content encoding failed")
    except brotli.error as exc:
        raise FetchError("content encoding failed") from exc
    return b"".join(parts)


def _decode_content(body: bytes, headers: dict[str, str], max_decoded: int) -> bytes:
    """Return the decoded entity. An empty body is unchanged."""
    if not body:
        return body
    encoding = _encoding_name(headers)
    if not encoding or encoding == "identity":
        return body
    if "," in encoding or encoding not in {"gzip", "deflate", "br"}:
        raise FetchError("content encoding is not permitted")
    if encoding == "gzip":
        return _inflate(body, 16 + zlib.MAX_WBITS, max_decoded)
    if encoding == "deflate":
        return _inflate(body, zlib.MAX_WBITS, max_decoded)
    return _inflate_brotli(body, max_decoded)


async def _resolve(resolver: Resolver, host: str, port: int, dns_timeout: float) -> list[str]:
    try:
        async with asyncio.timeout(dns_timeout) as limit:
            return await resolver(host, port)
    except TimeoutError as exc:
        if limit.expired():
            raise FetchError("DNS resolution timed out") from exc
        raise FetchError("DNS resolution failed") from exc
    except OSError as exc:
        raise FetchError("DNS resolution failed") from exc


async def _hop(
    url: str,
    method: str,
    headers: dict[str, str],
    timeout: float,
    max_bytes: int,
    resolver: Resolver,
    backend_factory: BackendFactory,
    pool_factory: PoolFactory,
    dns_timeout: float,
) -> tuple[int, dict[str, str], bytes | None, str | None]:
    scheme, host, port, target = _split(url)
    addresses = await _resolve(resolver, host, port, dns_timeout)
    pinned = pin_address(addresses)
    if pinned is None:
        raise FetchError("destination address is not permitted")
    pool = pool_factory(backend_factory(pinned))
    response = None
    try:
        request = httpcore.Request(
            method=method.upper().encode("ascii"),
            url=httpcore.URL(
                scheme=scheme.encode("ascii"),
                host=_host_bytes(host),
                port=port,
                target=target,
            ),
            headers=_raw_headers(host, headers),
            content=b"",
            extensions={
                "timeout": {
                    "connect": timeout,
                    "read": timeout,
                    "write": timeout,
                    "pool": timeout,
                }
            },
        )
        try:
            response = await pool.handle_async_request(request)
        except _TIMEOUTS as exc:
            raise FetchError("timeout") from exc
        mapped = _header_map(response.headers)
        if response.status in _REDIRECTS:
            return response.status, mapped, None, mapped.get("location", "")
        try:
            body = await _read_capped(response.stream, max_bytes)
        except _TIMEOUTS as exc:
            raise FetchError("timeout") from exc
        return response.status, mapped, body, None
    finally:
        if response is not None:
            await response.aclose()
        await pool.aclose()


async def fetch_url(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
    total_timeout: float = TOTAL_TIMEOUT_SECONDS,
    dns_timeout: float = DNS_TIMEOUT_SECONDS,
    max_bytes: int = MAX_RESPONSE_BYTES,
    max_redirects: int = MAX_REDIRECTS,
    resolver: Resolver | None = None,
    backend_factory: BackendFactory | None = None,
    pool_factory: PoolFactory | None = None,
    identity: str = "crawler",
) -> FetchResult:
    """Fetch one URL. The initial request is not counted as a redirect.

    Running out of `total_timeout` raises FetchError("time limit"). A caller's own deadline
    expiring first is not converted: its cancellation reaches the caller unchanged.
    The policy sets User-Agent and From for `identity`; a caller may not set either.
    """
    method = method.upper()
    if method not in _METHODS:
        raise FetchError("method is not permitted")
    if identity not in _TOKENS:
        raise FetchError("identity is not permitted")
    request_headers = dict(headers or {})
    if any(str(key).lower() in _SET_BY_POLICY for key in request_headers):
        raise FetchError("user agent is set by the policy")
    net = _Net(
        resolver or _default_resolver,
        backend_factory or _default_backend_factory,
        pool_factory or _default_pool_factory,
        dns_timeout,
    )
    budget = _BUDGET.get()
    await _take_group_slot(_HOST_GROUP.get(), budget)
    result = await _follow(
        url, method, request_headers, identity, timeout, total_timeout, max_bytes,
        max_redirects, net, budget, check_robots=True,
    )
    # A caller's own robots.txt answer serves the policy too (the survey's), so the host is not
    # asked twice; only a real answer within the policy's size limit, never a failure.
    if _robots_request(url, method) and len(result.body) <= ROBOTS_MAX_BYTES:
        _remember_robots(_origin(url), result.status_code, result.text)
    if budget is not None:
        reason = refusal(
            result.status_code, result.headers,
            result.body[:30000].decode("utf-8", errors="replace"),
        )
        if reason:
            budget.refuse(reason)
    return result


async def _follow(
    url: str,
    method: str,
    request_headers: dict[str, str],
    identity: str,
    timeout: float,
    total_timeout: float,
    max_bytes: int,
    max_redirects: int,
    net: _Net,
    budget: CrawlBudget | None,
    *,
    check_robots: bool,
) -> FetchResult:
    current = url
    followed = 0
    remaining = total_timeout
    while True:
        _, host, _, _ = _split(current)
        if budget is not None:
            budget.check()
        delay = (
            await _robots_gate(current, method, identity, budget, net) if check_robots else None
        )
        if budget is not None:
            budget.take()
        async with _host_slot(host.rstrip(".").lower(), delay, budget):
            started = time.monotonic()
            try:
                async with asyncio.timeout(remaining) as limit:
                    status, mapped, body, location = await _hop(
                        current,
                        method,
                        {**request_headers, **_identity_headers(identity)},
                        timeout,
                        max_bytes,
                        net.resolve,
                        net.backends,
                        net.pools,
                        net.dns_timeout,
                    )
            except TimeoutError as exc:
                if limit.expired():
                    raise FetchError("time limit") from exc
                raise
            remaining -= time.monotonic() - started
        if location is None:
            decoded = _decode_content(body or b"", mapped, max_bytes)
            return FetchResult(status, mapped, decoded, current, followed)
        followed += 1
        if followed > max_redirects:
            raise FetchError("redirect limit")
        if not location.strip():
            raise FetchError("redirect destination is missing")
        try:
            nxt = urljoin(current, location)
        except ValueError as exc:
            raise FetchError("redirect destination is not permitted") from exc
        _split(nxt)
        if _origin(current) != _origin(nxt):
            request_headers = _cross_origin_headers(request_headers)
        current = nxt
