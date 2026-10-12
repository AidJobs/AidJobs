"""Outbound fetch policy. Fake DNS and a fake transport. No live network."""
import ast
import asyncio
import gzip
import inspect
import zlib

import brotli
import httpcore
import pytest

from app.sources import _policy_head
from contracts.fetch import address_permitted, hostname_permitted, pin_address
from contracts.outbound import MAX_REDIRECTS, FetchError, PinnedBackend, fetch_url
from crawler_v2.api_crawler import SimpleAPICrawler
from crawler_v2.rss_crawler import SimpleRSSCrawler
from crawler_v2.simple_crawler import SimpleCrawler


def _response(
    status: int,
    body: bytes = b"",
    headers: dict | None = None,
    reason: str = "OK",
) -> bytes:
    fields = dict(headers or {})
    lowered = {key.lower() for key in fields}
    if "transfer-encoding" not in lowered and "content-length" not in lowered:
        fields["Content-Length"] = str(len(body))
    lines = [f"HTTP/1.1 {status} {reason}"]
    lines.extend(f"{key}: {value}" for key, value in fields.items())
    return ("\r\n".join(lines) + "\r\n\r\n").encode("ascii") + body


def _redirect(location: str) -> bytes:
    return _response(302, b"", {"Location": location}, reason="Found")


class RecordingStream(httpcore.AsyncMockStream):
    def __init__(self, buffer: list[bytes], events: list):
        super().__init__(buffer)
        self.events = events

    async def write(self, buffer: bytes, timeout: float | None = None) -> None:
        self.events.append(("write", buffer))

    async def start_tls(
        self,
        ssl_context,
        server_hostname: str | None = None,
        timeout: float | None = None,
    ):
        self.events.append(("sni", server_hostname))
        return await super().start_tls(ssl_context, server_hostname, timeout)

    async def aclose(self) -> None:
        self.events.append(("stream-close",))
        await super().aclose()


class ScriptedBackend(httpcore.AsyncNetworkBackend):
    def __init__(self, responses: list[bytes], events: list):
        self._responses = responses
        self.events = events

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        self.events.append(("connect", host))
        if not self._responses:
            raise AssertionError(f"unexpected connection to {host}")
        return RecordingStream([self._responses.pop(0)], self.events)

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):
        raise AssertionError("unix socket")

    async def sleep(self, seconds: float) -> None:
        return None


class TrackingPool:
    def __init__(self, inner, events: list):
        self._inner = inner
        self.events = events

    async def handle_async_request(self, request):
        return await self._inner.handle_async_request(request)

    async def aclose(self):
        self.events.append(("pool-close",))
        await self._inner.aclose()


def _world(responses, addresses=None):
    events: list = []
    scripted = ScriptedBackend(list(responses), events)
    addresses = addresses or {}

    async def resolver(host: str, port: int) -> list[str]:
        events.append(("dns", host))
        value = addresses.get(host, ["8.8.8.8"])
        if isinstance(value, BaseException):
            raise value
        return list(value)

    def backend_factory(pinned_ip: str):
        events.append(("pin", pinned_ip))
        return PinnedBackend(pinned_ip, scripted)

    def pool_factory(backend):
        pool = httpcore.AsyncConnectionPool(
            network_backend=backend,
            max_connections=1,
            max_keepalive_connections=0,
            keepalive_expiry=0.0,
            retries=0,
            http2=False,
        )
        return TrackingPool(pool, events)

    return events, resolver, backend_factory, pool_factory


def _run(url, responses, addresses=None, **kwargs):
    events, resolver, backend_factory, pool_factory = _world(responses, addresses)

    async def call():
        return await fetch_url(
            url,
            resolver=resolver,
            backend_factory=backend_factory,
            pool_factory=pool_factory,
            **kwargs,
        )

    return events, asyncio.run(call())


def test_address_and_hostname_rules():
    assert address_permitted("8.8.8.8") is True
    assert address_permitted("0.0.0.0") is False
    assert address_permitted("224.0.0.1") is False
    assert address_permitted("::ffff:127.0.0.1") is False
    assert address_permitted("::ffff:8.8.8.8") is True
    assert hostname_permitted("localhost") is False
    assert hostname_permitted("metadata.google.internal") is False
    assert hostname_permitted("jobs.example") is True
    assert pin_address(["2001:4860:4860::8888", "8.8.8.8"]) == "8.8.8.8"
    assert pin_address(["2001:4860:4860::8888"]) == "2001:4860:4860::8888"
    assert pin_address(["8.8.8.8", "10.0.0.1"]) is None
    assert pin_address([]) is None


def test_public_destination_connects_to_pinned_address_and_keeps_sni():
    events, result = _run("https://jobs.example/listing", [_response(200, b"ok")])
    assert result.status_code == 200
    assert result.body == b"ok"
    assert ("connect", "8.8.8.8") in events
    assert ("sni", "jobs.example") in events
    assert ("connect", "jobs.example") not in events
    assert events.count(("stream-close",)) == 1
    assert events.count(("pool-close",)) == 1


def test_ipv4_is_preferred_and_lone_ipv6_is_used():
    events, _result = _run(
        "https://jobs.example/",
        [_response(200, b"a")],
        {"jobs.example": ["2001:4860:4860::8888", "8.8.8.8"]},
    )
    assert ("connect", "8.8.8.8") in events
    events, _result = _run(
        "https://v6.example/",
        [_response(200, b"b")],
        {"v6.example": ["2001:4860:4860::8888"]},
    )
    assert ("connect", "2001:4860:4860::8888") in events
    assert ("sni", "v6.example") in events


def test_prohibited_or_failed_dns_never_connects():
    cases = [
        {"bad.example": ["8.8.8.8", "10.0.0.1"]},
        {"bad.example": []},
        {"bad.example": OSError("dns failed")},
    ]
    for addresses in cases:
        events, resolver, backend_factory, pool_factory = _world([_response(200, b"x")], addresses)
        with pytest.raises(FetchError):
            asyncio.run(
                fetch_url(
                    "https://bad.example/",
                    resolver=resolver,
                    backend_factory=backend_factory,
                    pool_factory=pool_factory,
                )
            )
        assert ("connect", "8.8.8.8") not in events
        assert ("connect", "10.0.0.1") not in events


def test_blocked_hostname_does_not_resolve():
    events, resolver, backend_factory, pool_factory = _world([_response(200, b"x")])
    with pytest.raises(FetchError):
        asyncio.run(
            fetch_url(
                "https://metadata.google.internal/",
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )
    assert ("dns", "metadata.google.internal") not in events
    assert not any(item[0] == "connect" for item in events)


def test_two_hops_use_two_pinned_addresses():
    events, result = _run(
        "https://one.example/start",
        [_redirect("https://two.example/next"), _response(200, b"done")],
        {"one.example": ["1.1.1.1"], "two.example": ["8.8.8.8"]},
    )
    assert result.body == b"done"
    assert [item for item in events if item[0] == "connect"] == [
        ("connect", "1.1.1.1"),
        ("connect", "8.8.8.8"),
    ]
    assert events.count(("pool-close",)) == 2
    assert events.count(("stream-close",)) == 2


def test_exactly_twenty_redirects_are_followed_and_the_twenty_first_is_not():
    hops = [f"https://hop{i}.example/" for i in range(MAX_REDIRECTS + 1)]
    allowed = [_redirect(hops[i + 1]) for i in range(MAX_REDIRECTS)]
    allowed.append(_response(200, b"end"))
    events, result = _run(hops[0], allowed)
    assert result.body == b"end"
    assert result.url == hops[MAX_REDIRECTS]
    assert sum(item[0] == "connect" for item in events) == MAX_REDIRECTS + 1

    blocked = [_redirect(f"https://hop{i}.example/") for i in range(1, MAX_REDIRECTS + 2)]
    events, resolver, backend_factory, pool_factory = _world(blocked)
    with pytest.raises(FetchError, match="redirect limit"):
        asyncio.run(
            fetch_url(
                "https://start.example/",
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )
    connects = [item for item in events if item[0] == "connect"]
    assert len(connects) == MAX_REDIRECTS + 1
    assert events.count(("pool-close",)) == len(connects)
    assert events.count(("stream-close",)) == len(connects)


def test_private_redirect_does_not_connect_or_read_its_body():
    events, resolver, backend_factory, pool_factory = _world(
        [_redirect("https://secret.example/hidden"), _response(200, b"secret-body")],
        {"ok.example": ["8.8.8.8"], "secret.example": ["169.254.169.254"]},
    )
    with pytest.raises(FetchError):
        asyncio.run(
            fetch_url(
                "https://ok.example/",
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )
    assert [item for item in events if item[0] == "connect"] == [("connect", "8.8.8.8")]
    writes = b"".join(item[1] for item in events if item[0] == "write")
    assert b"secret-body" not in writes
    assert events.count(("pool-close",)) == 1


def test_https_to_http_redirect_is_allowed():
    events, result = _run(
        "https://secure.example/a",
        [_redirect("http://secure.example/b"), _response(200, b"plain")],
    )
    assert result.body == b"plain"
    assert result.url == "http://secure.example/b"
    assert sum(item[0] == "connect" for item in events) == 2


def test_missing_redirect_location_fails():
    events, resolver, backend_factory, pool_factory = _world([_response(302, b"", reason="Found")])
    with pytest.raises(FetchError, match="missing"):
        asyncio.run(
            fetch_url(
                "https://jobs.example/",
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )
    assert events.count(("pool-close",)) == 1
    assert sum(item[0] == "connect" for item in events) == 1


def _header_names(raw: bytes) -> set[str]:
    names = set()
    for line in raw.decode("latin-1").split("\r\n")[1:]:
        if ":" not in line:
            continue
        names.add(line.split(":", 1)[0].strip().lower())
    return names


def test_head_redirect_stays_head_and_drops_authorization_across_hosts():
    events, result = _run(
        "https://one.example/a",
        [_redirect("https://two.example/b"), _response(200, b"")],
        method="HEAD",
        headers={
            "Authorization": "Bearer auth-token",
            "Proxy-Authorization": "Basic proxy-token",
            "Cookie": "session=cookie-token",
            "User-Agent": "AidJobs",
        },
    )
    writes = [item[1] for item in events if item[0] == "write" and b"HEAD " in item[1]]
    assert len(writes) == 2
    first = _header_names(writes[0])
    second = _header_names(writes[1])
    assert {"authorization", "proxy-authorization", "cookie", "user-agent"} <= first
    assert b"auth-token" in writes[0]
    assert b"proxy-token" in writes[0]
    assert b"cookie-token" in writes[0]
    assert b"AidJobs" in writes[0]
    assert {"authorization", "proxy-authorization", "cookie"}.isdisjoint(second)
    assert "user-agent" in second
    assert b"auth-token" not in writes[1]
    assert b"proxy-token" not in writes[1]
    assert b"cookie-token" not in writes[1]
    assert b"AidJobs" in writes[1]
    assert result.status_code == 200


def test_size_limit_ignores_content_length_and_closes():
    huge = b"x" * 64
    events, resolver, backend_factory, pool_factory = _world(
        [_response(200, huge, {"Content-Length": str(len(huge))})]
    )
    with pytest.raises(FetchError, match="size"):
        asyncio.run(
            fetch_url(
                "https://jobs.example/",
                max_bytes=16,
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )
    chunked = (
        b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
        + b"10\r\n"
        + (b"y" * 16)
        + b"\r\n0\r\n\r\n"
    )
    events, resolver, backend_factory, pool_factory = _world([chunked])
    with pytest.raises(FetchError, match="size"):
        asyncio.run(
            fetch_url(
                "https://jobs.example/",
                max_bytes=8,
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )
    assert events.count(("stream-close",)) == 1
    assert events.count(("pool-close",)) == 1


def _fetch_body(response: bytes, max_bytes: int = 1024) -> bytes:
    _events, resolver, backend_factory, pool_factory = _world([response])
    result = asyncio.run(
        fetch_url(
            "https://jobs.example/",
            max_bytes=max_bytes,
            resolver=resolver,
            backend_factory=backend_factory,
            pool_factory=pool_factory,
        )
    )
    return result.body


def test_gzip_and_brotli_bodies_are_decoded():
    page = b"<html>one job</html>"
    gzip_body = _fetch_body(
        _response(200, gzip.compress(page), {"Content-Encoding": "gzip"})
    )
    brotli_body = _fetch_body(
        _response(200, brotli.compress(page), {"Content-Encoding": "br"})
    )
    deflate_body = _fetch_body(
        _response(
            200,
            zlib.compress(page),
            {"Content-Encoding": "deflate"},
        )
    )
    assert gzip_body == page
    assert brotli_body == page
    assert deflate_body == page


def test_empty_encoded_body_stays_empty():
    body = _fetch_body(_response(200, b"", {"Content-Encoding": "gzip"}))
    assert body == b""


def test_plain_body_without_encoding_is_unchanged():
    page = b"<html>plain</html>"
    assert _fetch_body(_response(200, page)) == page


def test_corrupt_and_stacked_encodings_fail_closed():
    events, resolver, backend_factory, pool_factory = _world(
        [_response(200, b"not-gzip", {"Content-Encoding": "gzip"})]
    )
    with pytest.raises(FetchError, match="content encoding"):
        asyncio.run(
            fetch_url(
                "https://jobs.example/",
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )
    stacked = _response(200, b"abc", {"Content-Encoding": "gzip, br"})
    events, resolver, backend_factory, pool_factory = _world([stacked])
    with pytest.raises(FetchError, match="content encoding"):
        asyncio.run(
            fetch_url(
                "https://jobs.example/",
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )


def test_decoded_body_over_the_cap_fails_closed():
    page = b"a" * 4000
    payload = gzip.compress(page)
    assert len(payload) < 200
    events, resolver, backend_factory, pool_factory = _world(
        [_response(200, payload, {"Content-Encoding": "gzip"})]
    )
    with pytest.raises(FetchError, match="size"):
        asyncio.run(
            fetch_url(
                "https://jobs.example/",
                max_bytes=200,
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )
    brotli_payload = brotli.compress(page)
    assert len(brotli_payload) < 200
    events, resolver, backend_factory, pool_factory = _world(
        [_response(200, brotli_payload, {"Content-Encoding": "br"})]
    )
    with pytest.raises(FetchError, match="size"):
        asyncio.run(
            fetch_url(
                "https://jobs.example/",
                max_bytes=200,
                resolver=resolver,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )


def test_decoded_cap_allows_exact_length_and_rejects_one_extra_byte():
    cap = 64
    page = b"a" * cap
    over = b"a" * (cap + 1)
    codecs = (
        ("gzip", gzip.compress),
        ("deflate", zlib.compress),
        ("br", brotli.compress),
    )
    for encoding, compress in codecs:
        exact_payload = compress(page)
        over_payload = compress(over)
        assert len(exact_payload) < cap
        assert len(over_payload) < cap
        assert (
            _fetch_body(
                _response(200, exact_payload, {"Content-Encoding": encoding}),
                max_bytes=cap,
            )
            == page
        )
        _events, resolver, backend_factory, pool_factory = _world(
            [_response(200, over_payload, {"Content-Encoding": encoding})]
        )
        with pytest.raises(FetchError, match="size"):
            asyncio.run(
                fetch_url(
                    "https://jobs.example/",
                    max_bytes=cap,
                    resolver=resolver,
                    backend_factory=backend_factory,
                    pool_factory=pool_factory,
                )
            )


def test_timeout_and_exception_close_the_pool():
    events: list = []

    class TimeoutBackend(httpcore.AsyncNetworkBackend):
        async def connect_tcp(
            self, host, port, timeout=None, local_address=None, socket_options=None
        ):
            events.append(("connect", host))
            raise httpcore.ConnectTimeout()

        async def connect_unix_socket(self, path, timeout=None, socket_options=None):
            raise AssertionError("unix")

        async def sleep(self, seconds: float) -> None:
            return None

    def backend_factory(pinned):
        return PinnedBackend(pinned, TimeoutBackend())

    def pool_factory(backend):
        pool = httpcore.AsyncConnectionPool(
            network_backend=backend,
            max_connections=1,
            max_keepalive_connections=0,
            retries=0,
            http2=False,
        )
        return TrackingPool(pool, events)

    async def resolve(host, port):
        return ["8.8.8.8"]

    with pytest.raises(FetchError, match="timeout"):
        asyncio.run(
            fetch_url(
                "https://jobs.example/",
                resolver=resolve,
                backend_factory=backend_factory,
                pool_factory=pool_factory,
            )
        )
    assert events.count(("pool-close",)) == 1

    events.clear()

    class BoomBackend(TimeoutBackend):
        async def connect_tcp(
            self, host, port, timeout=None, local_address=None, socket_options=None
        ):
            raise RuntimeError("boom")

    def boom_factory(pinned):
        return PinnedBackend(pinned, BoomBackend())

    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(
            fetch_url(
                "https://jobs.example/",
                resolver=resolve,
                backend_factory=boom_factory,
                pool_factory=pool_factory,
            )
        )
    assert events.count(("pool-close",)) == 1


def test_read_timeout_during_body_fails_closed(monkeypatch):
    """A body read timeout fails the fetch and leaves nothing for a parser."""
    marker = b"NOT-A-DOCUMENT"
    events: list = []

    class BodyTimeoutStream(RecordingStream):
        def __init__(self):
            header = (
                b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n" + marker
            )
            super().__init__([header], events)

        async def read(self, max_bytes: int, timeout: float | None = None) -> bytes:
            if self._buffer:
                return await super().read(max_bytes, timeout)
            raise httpcore.ReadTimeout()

    class BodyTimeoutBackend(httpcore.AsyncNetworkBackend):
        async def connect_tcp(
            self, host, port, timeout=None, local_address=None, socket_options=None
        ):
            events.append(("connect", host))
            return BodyTimeoutStream()

        async def connect_unix_socket(self, path, timeout=None, socket_options=None):
            raise AssertionError("unix")

        async def sleep(self, seconds: float) -> None:
            return None

    def backend_factory(pinned):
        return PinnedBackend(pinned, BodyTimeoutBackend())

    def pool_factory(backend):
        pool = httpcore.AsyncConnectionPool(
            network_backend=backend,
            max_connections=1,
            max_keepalive_connections=0,
            keepalive_expiry=0.0,
            retries=0,
            http2=False,
        )
        return TrackingPool(pool, events)

    async def resolve(host, port):
        return ["8.8.8.8"]

    async def controlled(url, **kwargs):
        return await fetch_url(
            url,
            resolver=resolve,
            backend_factory=backend_factory,
            pool_factory=pool_factory,
            **kwargs,
        )

    with pytest.raises(FetchError, match="timeout") as caught:
        asyncio.run(controlled("https://jobs.example/doc"))
    assert marker.decode() not in str(caught.value)
    assert events.count(("stream-close",)) == 1
    assert events.count(("pool-close",)) == 1

    parsed: list[str] = []

    class _Feedparser:
        @staticmethod
        def parse(*_args, **_kwargs):
            parsed.append("feed")
            raise AssertionError("feed parsed after timeout")

    class _Json:
        @staticmethod
        def loads(*_args, **_kwargs):
            parsed.append("json")
            raise AssertionError("json parsed after timeout")

    monkeypatch.setattr("crawler_v2.rss_crawler.fetch_url", controlled)
    monkeypatch.setattr("crawler_v2.rss_crawler.feedparser", _Feedparser)
    monkeypatch.setattr("crawler_v2.api_crawler.fetch_url", controlled)
    monkeypatch.setattr("crawler_v2.api_crawler.json", _Json)
    monkeypatch.setattr("crawler_v2.simple_crawler.fetch_url", controlled)

    events.clear()
    feed = asyncio.run(SimpleRSSCrawler("postgresql://example").fetch_feed("https://jobs.example/rss"))
    api = asyncio.run(SimpleAPICrawler("postgresql://example").fetch_api("https://jobs.example/api"))
    status, html = asyncio.run(
        SimpleCrawler("postgresql://example").fetch_html("https://jobs.example/page")
    )
    assert feed is None
    assert api is None
    assert status == 0
    assert html == ""
    assert parsed == []
    assert events.count(("stream-close",)) == 3
    assert events.count(("pool-close",)) == 3


def test_fetch_html_does_not_call_the_browser(monkeypatch):
    assert "BrowserCrawler" not in inspect.getsource(SimpleCrawler.fetch_html)

    async def fake_fetch(url, **kwargs):
        return type("R", (), {"status_code": 200, "text": "javascript required please wait"})()

    monkeypatch.setattr("crawler_v2.simple_crawler.fetch_url", fake_fetch)
    status, html = asyncio.run(
        SimpleCrawler("postgresql://example").fetch_html("https://jobs.example/", use_browser=True)
    )
    assert status == 200
    assert "javascript required" in html


def test_rss_api_and_admin_head_use_the_shared_fetch(monkeypatch):
    calls = []

    async def fake_fetch(url, **kwargs):
        calls.append((url, kwargs.get("method", "GET")))
        if kwargs.get("method") == "HEAD":
            body = b""
        elif url.endswith("/api"):
            body = b'{"jobs": []}'
        else:
            body = b"<rss></rss>"
        return type(
            "R",
            (),
            {
                "status_code": 200,
                "text": body.decode(),
                "body": body,
                "headers": {"content-length": "0", "etag": "e", "last-modified": "today"},
            },
        )()

    monkeypatch.setattr("crawler_v2.rss_crawler.fetch_url", fake_fetch)
    monkeypatch.setattr("crawler_v2.api_crawler.fetch_url", fake_fetch)
    monkeypatch.setattr("contracts.outbound.fetch_url", fake_fetch)
    rss = asyncio.run(SimpleRSSCrawler("postgresql://example").fetch_feed("https://jobs.example/rss"))
    api = asyncio.run(SimpleAPICrawler("postgresql://example").fetch_api("https://jobs.example/api"))
    headed = asyncio.run(_policy_head("https://jobs.example/listing"))
    assert rss is not None
    assert api == {"jobs": []}
    assert headed["status"] == 200
    assert ("https://jobs.example/rss", "GET") in calls
    assert ("https://jobs.example/api", "GET") in calls
    assert ("https://jobs.example/listing", "HEAD") in calls
    assert "fetch_url" in inspect.getsource(_policy_head)
    from app import sources as source_routes

    assert _policy_head_calls(source_routes.test_source) == 2


def _policy_head_calls(func) -> int:
    tree = ast.parse(inspect.getsource(func))
    return sum(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "_policy_head"
        for node in ast.walk(tree)
    )


def _dependency_calls(dependant) -> list:
    calls = []
    for dep in dependant.dependencies:
        calls.append(dep.call)
        calls.extend(_dependency_calls(dep))
    return calls


def _iter_routes(routes):
    for route in routes:
        if type(route).__name__ == "_IncludedRouter":
            yield from _iter_routes(route.original_router.routes)
        else:
            yield route


def test_admin_source_test_route_is_test_source():
    from app import sources
    from main import app

    def posted(routes):
        return [
            route
            for route in _iter_routes(routes)
            if getattr(route, "path", None) == "/api/admin/sources/{source_id}/test"
            and "POST" in (getattr(route, "methods", None) or set())
        ]

    matches = posted(app.routes)
    assert len(matches) == 1
    route = matches[0]
    assert route.endpoint is sources.test_source
    mounted = posted(sources.router.routes)
    assert len(mounted) == 1
    assert mounted[0].endpoint is sources.test_source
    registered = {
        item.endpoint for item in _iter_routes(app.routes) if hasattr(item, "endpoint")
    }
    assert sources._policy_head not in registered
    assert sources.admin_required in _dependency_calls(route.dependant)
    assert _policy_head_calls(sources.test_source) == 2
