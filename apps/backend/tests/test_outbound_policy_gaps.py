"""The shared fetch policy's gaps closed: address ranges, ports, DNS time, total time, headers.

Fake DNS and a scripted transport, as in test_outbound_fetch. No live network: the only real
lookups are to a patched `socket.getaddrinfo`.
"""
import asyncio
import functools
import ipaddress
import threading
import time

import httpcore
import pytest

from contracts import fetch as policy
from contracts import outbound
from contracts.fetch import address_permitted, hostname_permitted, pin_address
from contracts.outbound import FetchError, PinnedBackend, fetch_url
from tests.test_outbound_fetch import (
    TEST_SSL_CONTEXT,
    TrackingPool,
    _header_names,
    _redirect,
    _response,
    _run,
    _world,
)


def _fails(url, responses=(), addresses=None, match=None, **kwargs):
    events, resolver, backend_factory, pool_factory = _world(list(responses), addresses)
    with pytest.raises(FetchError, match=match) as caught:
        asyncio.run(
            fetch_url(
                url,
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
                **kwargs,
            )
        )
    return events, str(caught.value)


def _connects(events):
    return [item for item in events if item[0] == "connect"]


async def _bounded(coro, seconds=15.0):
    """A missing limit fails the test with a plain TimeoutError instead of running for hours."""
    async with asyncio.timeout(seconds):
        return await coro


# Address ranges ---------------------------------------------------------------------------

REFUSED = [
    # Permitted by Python 3.11.9's own lists, which production runs
    "100.64.0.1",
    "100.100.100.200",
    "100.127.255.255",
    "::ffff:100.100.100.200",
    "fec0::1",
    "feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "2002:a00:1::",
    "2002:a9fe:a9fe::1",
    "2002:808:808::",
    "3fff::1",
    "3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff",
    # Already refused, and now by the tables too
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.9",
    "192.0.0.170",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::a00:1",
    "::ffff:10.0.0.1",
    "::ffff:0:a00:1",
    "64:ff9b::a00:1",
    "64:ff9b::808:808",
    "64:ff9b:1::a00:1",
    "100::1",
    "1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "2001::1",
    "2001:2::1",
    "2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff",
    "2001:db8::1",
    "4000::1",
    "5f00::1",
    "fc00::1",
    "fd00:ec2::254",
    "fe80::1",
    "ff02::1",
]

PERMITTED = [
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "100.63.255.255",
    "100.128.0.0",
    "172.32.0.1",
    "192.0.1.1",
    "198.17.255.255",
    "198.20.0.1",
    "223.255.255.254",
    "::ffff:8.8.8.8",
    "2000::1",
    "2001:200::1",
    "2001:4860:4860::8888",
    "2003::1",
    "2606:4700:4700::1111",
    "3ffe:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
]


@pytest.mark.parametrize("ip", REFUSED)
def test_special_purpose_addresses_are_refused(ip):
    assert address_permitted(ip) is False


@pytest.mark.parametrize("ip", PERMITTED)
def test_public_addresses_are_permitted(ip):
    assert address_permitted(ip) is True


@pytest.mark.parametrize("ip, expected", [(ip, False) for ip in REFUSED]
                         + [(ip, True) for ip in PERMITTED])
def test_the_tables_alone_decide_whatever_python_says(ip, expected):
    """The result does not depend on Python's `is_private` lists, which change between releases."""
    assert policy._listed_permitted(policy._unwrap(ipaddress.ip_address(ip))) is expected


@pytest.mark.parametrize("network", policy._BLOCKED_V4 + policy._BLOCKED_V6,
                         ids=lambda network: str(network))
def test_every_listed_range_is_refused_at_both_ends(network):
    assert address_permitted(str(network.network_address)) is False
    assert address_permitted(str(network.broadcast_address)) is False


def test_ipv6_outside_global_unicast_is_refused_at_both_edges():
    assert address_permitted("1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff") is False
    assert address_permitted("2000::") is True
    assert address_permitted("3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff") is True
    assert address_permitted("4000::") is False


def test_one_refused_answer_rejects_the_whole_resolution():
    assert pin_address(["8.8.8.8", "100.100.100.200"]) is None
    assert pin_address(["2001:4860:4860::8888", "2002:a00:1::"]) is None
    assert pin_address(["8.8.8.8", "2001:4860:4860::8888"]) == "8.8.8.8"


@pytest.mark.parametrize("literal", ["100.100.100.200", "fec0::1", "2002:a00:1::", "3fff::1"])
def test_address_literals_in_urls_are_refused_before_dns(literal):
    assert hostname_permitted(literal) is False
    host = f"[{literal}]" if ":" in literal else literal
    events, message = _fails(f"http://{host}/latest/meta-data/", [_response(200, b"secret")])
    assert message == "destination host is not permitted"
    assert not any(item[0] in {"dns", "connect"} for item in events)


@pytest.mark.parametrize("answer", ["100.100.100.200", "100.64.0.9", "fec0::9", "2002:a00:1::"])
def test_a_name_resolving_into_a_closed_range_never_connects(answer):
    events, message = _fails("https://jobs.example/", [_response(200, b"x")],
                             {"jobs.example": [answer]})
    assert message == "destination address is not permitted"
    assert _connects(events) == []


def test_a_redirect_whose_name_resolves_into_a_closed_range_stops_there():
    events, message = _fails(
        "https://jobs.example/",
        [_redirect("https://next.example/"), _response(200, b"metadata")],
        {"jobs.example": ["8.8.8.8"], "next.example": ["100.100.100.200"]},
    )
    assert message == "destination address is not permitted"
    assert _connects(events) == [("connect", "8.8.8.8")]


# Ports ------------------------------------------------------------------------------------

@pytest.mark.parametrize("url", [
    "https://jobs.example:8443/",
    "http://jobs.example:8080/",
    "https://jobs.example:22/",
    "http://jobs.example:6379/",
    "http://jobs.example:0/",
    "https://jobs.example:65535/",
    "https://jobs.example:99999/",
    "https://jobs.example:port/",
])
def test_other_ports_are_refused_before_dns(url):
    events, message = _fails(url, [_response(200, b"x")])
    assert message == "destination port is not permitted"
    assert not any(item[0] in {"dns", "connect"} for item in events)


@pytest.mark.parametrize("url", [
    "https://jobs.example/",
    "https://jobs.example:443/",
    "http://jobs.example/",
    "http://jobs.example:80/",
])
def test_the_two_web_ports_are_permitted(url):
    events, result = _run(url, [_response(200, b"ok")])
    assert result.body == b"ok"
    assert _connects(events) == [("connect", "8.8.8.8")]


@pytest.mark.parametrize("location", [
    "https://next.example:8443/",
    "http://next.example:25/",
    "https://next.example:99999/",
])
def test_a_redirect_to_another_port_is_refused_before_it_is_opened(location):
    events, message = _fails("https://jobs.example/", [_redirect(location), _response(200)])
    assert message == "destination port is not permitted"
    assert _connects(events) == [("connect", "8.8.8.8")]
    assert ("dns", "next.example") not in events


def _patched(monkeypatch, target, responses=(), addresses=None):
    events, resolver, backend_factory, pool_factory = _world(list(responses), addresses)
    monkeypatch.setattr(target, "fetch_url", functools.partial(
        outbound.fetch_url, resolver=resolver, backend_factory=backend_factory,
        pool_factory=pool_factory))
    return events


def test_the_admin_source_test_names_a_refused_port(monkeypatch):
    from app.sources import _policy_head

    events = _patched(monkeypatch, outbound, [_response(200)])
    result = asyncio.run(_policy_head("https://jobs.example:8443/careers"))
    assert result == {"ok": False, "status": 0, "error": "destination port is not permitted"}
    assert _connects(events) == []


def test_link_validation_names_a_refused_port(monkeypatch):
    from core import link_validator

    events = _patched(monkeypatch, link_validator, [_response(200)])
    validator = link_validator.LinkValidator("postgresql://unused")
    monkeypatch.setattr(validator, "_get_cached_validation", lambda url: None)
    monkeypatch.setattr(validator, "_cache_validation", lambda url, result, ttl_hours=24: None)
    result = asyncio.run(validator.validate_url("https://jobs.example:8443/apply", use_cache=False))
    assert result["valid"] is False
    assert result["error"] == "Validation error: destination port is not permitted"
    assert _connects(events) == []


# DNS time -----------------------------------------------------------------------------------

def _resolving_world(resolve):
    events, _resolver, backend_factory, pool_factory = _world([_response(200, b"x")])
    return events, resolve, backend_factory, pool_factory


def test_a_slow_lookup_times_out_and_never_connects():
    async def stalls(host, port):
        await asyncio.sleep(60)

    events, resolver, backend_factory, pool_factory = _resolving_world(stalls)
    started = time.monotonic()
    with pytest.raises(FetchError, match="^DNS resolution timed out$"):
        asyncio.run(_bounded(fetch_url(
            "https://jobs.example/", dns_timeout=0.2, resolver=resolver,
            backend_factory=backend_factory, pool_factory=pool_factory)))
    assert time.monotonic() - started < 20
    assert _connects(events) == []


def test_a_resolver_reporting_its_own_timeout_is_a_failed_lookup():
    async def gives_up(host, port):
        raise TimeoutError("resolver gave up")

    _events, resolver, backend_factory, pool_factory = _resolving_world(gives_up)
    with pytest.raises(FetchError, match="^DNS resolution failed$"):
        asyncio.run(fetch_url("https://jobs.example/", resolver=resolver,
                              backend_factory=backend_factory, pool_factory=pool_factory))


def _addrinfo(ip):
    import socket

    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]


def test_lookups_run_on_their_own_threads(monkeypatch):
    names = []

    def lookup(host, port, *args, **kwargs):
        names.append(threading.current_thread().name)
        return _addrinfo("93.184.216.34")

    monkeypatch.setattr(outbound.socket, "getaddrinfo", lookup)
    assert asyncio.run(outbound._default_resolver("jobs.example", 443)) == ["93.184.216.34"]
    assert names and names[0].startswith("aidjobs-dns")


def test_hung_lookups_time_out_and_leave_the_shared_threads_free(monkeypatch):
    """Every DNS thread stuck: each fetch fails on time, and the crawler's threads still run."""
    release = threading.Event()

    def hangs(host, port, *args, **kwargs):
        release.wait(30)
        raise OSError("released")

    monkeypatch.setattr(outbound.socket, "getaddrinfo", hangs)
    _events, _resolver, backend_factory, pool_factory = _world([])

    async def scenario():
        fetches = [
            fetch_url(f"https://host{i}.example/", dns_timeout=0.3,
                      backend_factory=backend_factory, pool_factory=pool_factory)
            for i in range(outbound.DNS_WORKERS + 2)
        ]
        outcomes = await asyncio.gather(*fetches, return_exceptions=True)
        database_step = await asyncio.wait_for(asyncio.to_thread(lambda: "saved"), timeout=5)
        return outcomes, database_step

    try:
        started = time.monotonic()
        outcomes, database_step = asyncio.run(scenario())
        elapsed = time.monotonic() - started
    finally:
        release.set()
    assert database_step == "saved"
    assert all(isinstance(item, FetchError) for item in outcomes), outcomes
    assert {str(item) for item in outcomes} == {"DNS resolution timed out"}
    assert elapsed < 20


# Total time ---------------------------------------------------------------------------------

class _Dripping(httpcore.AsyncMockStream):
    """Headers at once, then one byte at a time, each well inside the per-step timeout."""

    def __init__(self, events, delay=0.05):
        super().__init__([b"HTTP/1.1 200 OK\r\nContent-Length: 1000000\r\n\r\n"])
        self.events = events
        self.delay = delay

    async def read(self, max_bytes, timeout=None):
        if self._buffer:
            return await super().read(max_bytes, timeout)
        await asyncio.sleep(self.delay)
        return b"x"

    async def write(self, buffer, timeout=None):
        return None

    async def aclose(self):
        self.events.append(("stream-close",))


class _Recording(httpcore.AsyncMockStream):
    def __init__(self, response, events):
        super().__init__([response])
        self.events = events

    async def aclose(self):
        self.events.append(("stream-close",))


class _Backend(httpcore.AsyncNetworkBackend):
    """Each connection gets `make_stream(events)`, after an optional delay."""

    def __init__(self, make_stream, events, connect_delay=0.0):
        self.make_stream = make_stream
        self.events = events
        self.connect_delay = connect_delay

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        self.events.append(("connect", host))
        if self.connect_delay:
            await asyncio.sleep(self.connect_delay)
        return self.make_stream(self.events)

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):
        raise AssertionError("unix socket")

    async def sleep(self, seconds):
        return None


def _timed_world(make_stream=None, connect_delay=0.0, backend_class=_Backend):
    events = []
    backend = backend_class(make_stream, events, connect_delay)

    async def resolver(host, port):
        return ["8.8.8.8"]

    def backend_factory(pinned):
        return PinnedBackend(pinned, backend)

    def pool_factory(network_backend):
        return TrackingPool(httpcore.AsyncConnectionPool(
            ssl_context=TEST_SSL_CONTEXT,
            network_backend=network_backend, max_connections=1, max_keepalive_connections=0,
            keepalive_expiry=0.0, retries=0, http2=False), events)

    return events, {"resolver": resolver, "backend_factory": backend_factory,
                    "pool_factory": pool_factory}


def test_a_body_sent_a_byte_at_a_time_stops_at_the_total_limit():
    events, world = _timed_world(_Dripping)
    started = time.monotonic()
    with pytest.raises(FetchError, match="^time limit$"):
        asyncio.run(_bounded(
            fetch_url("https://jobs.example/", timeout=10.0, total_timeout=1.0, **world)))
    assert time.monotonic() - started < 20
    assert events.count(("stream-close",)) == 1
    assert events.count(("pool-close",)) == 1


def _hops():
    pending = [_redirect(f"https://hop{i}.example/") for i in range(1, 4)]
    pending.append(_response(200, b"end"))
    return lambda events: _Recording(pending.pop(0), events)


def test_the_limit_covers_every_hop_together():
    """Each hop is quick; together they pass the limit. Without it the same fetch succeeds."""
    events, world = _timed_world(_hops(), connect_delay=1.0)
    with pytest.raises(FetchError, match="^time limit$"):
        asyncio.run(fetch_url("https://hop0.example/", timeout=10.0, total_timeout=2.5, **world))
    assert 1 <= len(_connects(events)) < 4
    assert events.count(("pool-close",)) == len(_connects(events))

    _events, world = _timed_world(_hops(), connect_delay=1.0)
    result = asyncio.run(fetch_url("https://hop0.example/", timeout=10.0, total_timeout=60.0,
                                   **world))
    assert result.body == b"end" and result.redirects == 3


def test_the_limit_covers_dns():
    async def stalls(host, port):
        await asyncio.sleep(60)

    _events, _resolver, backend_factory, pool_factory = _world([])
    with pytest.raises(FetchError, match="^time limit$"):
        asyncio.run(fetch_url("https://jobs.example/", dns_timeout=30.0, total_timeout=0.3,
                              resolver=stalls, backend_factory=backend_factory,
                              pool_factory=pool_factory))


def test_a_callers_own_deadline_reaches_the_caller_unchanged():
    """A crawl's deadline expiring mid-fetch stays the crawl's timeout, not a fetch failure."""
    events, world = _timed_world(_Dripping)

    async def crawl():
        async with asyncio.timeout(0.5):
            await fetch_url("https://jobs.example/", timeout=10.0, total_timeout=30.0, **world)

    with pytest.raises(TimeoutError) as caught:
        asyncio.run(crawl())
    assert not isinstance(caught.value, FetchError)
    assert events.count(("pool-close",)) == 1


def test_a_cancelled_fetch_stays_cancelled():
    events, world = _timed_world(_Dripping)

    async def cancel_it():
        task = asyncio.ensure_future(
            fetch_url("https://jobs.example/", timeout=10.0, total_timeout=30.0, **world))
        await asyncio.sleep(0.3)
        task.cancel()
        await task

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(cancel_it())
    assert events.count(("pool-close",)) == 1


class _RaisesOwnTimeout(_Backend):
    async def connect_tcp(self, *args, **kwargs):
        raise TimeoutError("socket timed out")


class _StepTimeout(_Backend):
    async def connect_tcp(self, *args, **kwargs):
        raise httpcore.ConnectTimeout()


class _ToLoopback(httpcore.AsyncNetworkBackend):
    """The real AnyIO backend, sent to a test server on loopback whatever the pinned address."""

    def __init__(self, port):
        self.port = port
        self.inner = httpcore.AnyIOBackend()

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        return await self.inner.connect_tcp("127.0.0.1", self.port, timeout=timeout)

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):
        raise AssertionError("unix socket")

    async def sleep(self, seconds):
        await self.inner.sleep(seconds)


async def _with_server(send_body, fetch):
    """A loopback server: headers at once, then `send_body(writer)`."""
    async def handle(reader, writer):
        await reader.readuntil(b"\r\n\r\n")
        writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 1000000\r\n\r\n")
        await writer.drain()
        try:
            await send_body(writer)
        except (ConnectionError, asyncio.CancelledError):
            pass
        finally:
            writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]

    async def resolver(host, _port):
        return ["93.184.216.34"]

    try:
        return await fetch(dict(resolver=resolver,
                                backend_factory=lambda pinned: _ToLoopback(port)))
    finally:
        server.close()
        await server.wait_closed()


async def _drip(writer):
    while True:
        writer.write(b"x")
        await writer.drain()
        await asyncio.sleep(0.05)


async def _stall(writer):
    await asyncio.sleep(60)


def test_the_real_backend_stops_a_dripping_body_at_the_total_limit():
    async def fetch(world):
        return await fetch_url("http://jobs.example/", timeout=10.0, total_timeout=1.0, **world)

    started = time.monotonic()
    with pytest.raises(FetchError, match="^time limit$"):
        asyncio.run(_bounded(_with_server(_drip, fetch)))
    assert time.monotonic() - started < 20


def test_the_real_backend_keeps_a_callers_own_deadline():
    async def fetch(world):
        async with asyncio.timeout(1.0):
            await fetch_url("http://jobs.example/", timeout=10.0, total_timeout=30.0, **world)

    with pytest.raises(TimeoutError) as caught:
        asyncio.run(_with_server(_drip, fetch))
    assert not isinstance(caught.value, FetchError)


def test_the_real_backend_still_reports_a_stalled_read_as_timeout():
    async def fetch(world):
        return await fetch_url("http://jobs.example/", timeout=0.5, total_timeout=30.0, **world)

    with pytest.raises(FetchError, match="^timeout$"):
        asyncio.run(_with_server(_stall, fetch))


def test_a_transport_timeout_of_its_own_is_not_called_the_limit():
    _events, world = _timed_world(backend_class=_RaisesOwnTimeout)
    with pytest.raises(TimeoutError) as caught:
        asyncio.run(fetch_url("https://jobs.example/", total_timeout=30.0, **world))
    assert not isinstance(caught.value, FetchError)


def test_a_per_step_timeout_is_still_called_timeout():
    _events, world = _timed_world(backend_class=_StepTimeout)
    with pytest.raises(FetchError, match="^timeout$"):
        asyncio.run(fetch_url("https://jobs.example/", **world))


# Headers after a redirect -------------------------------------------------------------------

def _writes(events):
    return [item[1] for item in events if item[0] == "write" and item[1][:4] in {b"GET ", b"HEAD"}]


def _crawler_headers():
    from crawler_v2.simple_crawler import _html_request_headers

    return _html_request_headers("AidJobsBot/1.0")


def test_a_redirect_to_another_site_keeps_the_crawler_headers_and_drops_any_other():
    headers = {**_crawler_headers(), "X-Api-Key": "key-token", "Authorization": "Bearer t-token",
               "Cookie": "session=c-token", "X-Custom": "custom-token"}
    events, result = _run(
        "https://careers.example/jobs",
        [_redirect("https://ats.example/board"), _response(200, b"board")],
        headers=headers,
    )
    assert result.body == b"board"
    first, second = _writes(events)
    crawler = {name.lower() for name in _crawler_headers()}
    assert crawler | {"x-api-key", "authorization", "cookie", "x-custom"} <= _header_names(first)
    assert crawler <= _header_names(second)
    assert {"x-api-key", "authorization", "cookie", "x-custom"}.isdisjoint(_header_names(second))
    for token in (b"key-token", b"t-token", b"c-token", b"custom-token"):
        assert token in first and token not in second


@pytest.mark.parametrize("location", [
    "/next",
    "https://careers.example:443/next",
    "https://CAREERS.example./next",
])
def test_a_redirect_within_the_same_origin_keeps_every_header(location):
    events, _result = _run(
        "https://careers.example/jobs",
        [_redirect(location), _response(200, b"ok")],
        headers={"User-Agent": "AidJobs", "X-Api-Key": "key-token"},
    )
    _first, second = _writes(events)
    assert b"key-token" in second


@pytest.mark.parametrize("location", [
    "http://careers.example/next",
    "https://careers.example:80/next",
    "https://jobs.careers.example/next",
])
def test_a_change_of_scheme_port_or_host_counts_as_another_origin(location):
    events, _result = _run(
        "https://careers.example/jobs",
        [_redirect(location), _response(200, b"ok")],
        headers={"user-agent": "AidJobs", "Authorization": "Bearer t-token",
                 "X-Api-Key": "key-token"},
    )
    _first, second = _writes(events)
    assert b"AidJobs" in second
    assert b"t-token" not in second and b"key-token" not in second


def test_headers_dropped_once_stay_dropped_on_a_later_hop_home():
    events, _result = _run(
        "https://careers.example/jobs",
        [_redirect("https://ats.example/x"), _redirect("https://careers.example/back"),
         _response(200, b"ok")],
        headers={"User-Agent": "AidJobs", "X-Api-Key": "key-token"},
    )
    writes = _writes(events)
    assert len(writes) == 3
    assert b"key-token" in writes[0]
    assert all(b"key-token" not in write for write in writes[1:])


# Callers and values -------------------------------------------------------------------------

def test_the_approved_values():
    assert outbound.TOTAL_TIMEOUT_SECONDS == 60.0
    assert outbound.DNS_TIMEOUT_SECONDS == 10.0
    assert outbound.DNS_WORKERS == 8
    assert policy._PERMITTED_PORTS == {80, 443}


def _spy(monkeypatch, target, body=b""):
    calls = []

    async def fake_fetch(url, **kwargs):
        calls.append(kwargs)
        return outbound.FetchResult(200, {}, body, url)

    monkeypatch.setattr(target, "fetch_url", fake_fetch)
    return calls


def test_admin_checks_get_twenty_seconds_in_all(monkeypatch):
    from app import sources
    from core import link_validator

    calls = _spy(monkeypatch, outbound)
    asyncio.run(sources._policy_head("https://jobs.example/"))
    assert sources.SOURCE_CHECK_TOTAL_SECONDS == 20.0
    assert calls[-1]["total_timeout"] == 20.0

    calls = _spy(monkeypatch, link_validator)
    validator = link_validator.LinkValidator("postgresql://unused")
    asyncio.run(validator._check_url("https://jobs.example/apply"))
    assert link_validator.CHECK_TOTAL_SECONDS == 20.0
    assert calls[-1]["total_timeout"] == 20.0


def test_crawl_fetches_use_the_default_limit(monkeypatch):
    from crawler_v2 import api_crawler, rss_crawler, simple_crawler

    url = "https://a.example/"
    rss = _spy(monkeypatch, rss_crawler, b"<rss></rss>")
    asyncio.run(rss_crawler.SimpleRSSCrawler("postgresql://x").fetch_feed(url))
    api = _spy(monkeypatch, api_crawler, b"{}")
    asyncio.run(api_crawler.SimpleAPICrawler("postgresql://x").fetch_api(url))
    html = _spy(monkeypatch, simple_crawler, b"<html></html>")
    crawler = simple_crawler.SimpleCrawler("postgresql://x")
    asyncio.run(crawler.fetch_html(url))
    asyncio.run(crawler._fetch_listing_page(url + "?page=2"))
    calls = rss + api + html
    assert (len(rss), len(api), len(html)) == (1, 1, 2)
    assert all("total_timeout" not in kwargs for kwargs in calls)
