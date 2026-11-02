"""Fetch a URL through the outbound address policy.

Each hop resolves DNS, rejects any prohibited answer, and opens a new
connection pool whose TCP connect uses only the pinned address. TLS SNI and
certificate verification keep the URL hostname.

`timeout` bounds each network step; `total_timeout` bounds the whole fetch,
every hop and the body included.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
import zlib
from collections.abc import Awaitable, Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import brotli
import httpcore

from contracts.fetch import hostname_permitted, pin_address, port_permitted, scheme_permitted

MAX_RESPONSE_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 20
TOTAL_TIMEOUT_SECONDS = 60.0
DNS_TIMEOUT_SECONDS = 5.0
DNS_WORKERS = 8
_REDIRECTS = {301, 302, 303, 307, 308}
# Sent again after a redirect to another origin; any other header (a key, a token) is dropped.
_CROSS_ORIGIN_HEADERS = frozenset({
    "user-agent",
    "accept",
    "accept-language",
    "accept-encoding",
    "cache-control",
    "connection",
    "upgrade-insecure-requests",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user",
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


def _default_pool_factory(backend: httpcore.AsyncNetworkBackend) -> httpcore.AsyncConnectionPool:
    return httpcore.AsyncConnectionPool(
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
) -> FetchResult:
    """Fetch one URL. The initial request is not counted as a redirect.

    Running out of `total_timeout` raises FetchError("time limit"). A caller's own deadline
    expiring first is not converted: its cancellation reaches the caller unchanged.
    """
    try:
        async with asyncio.timeout(total_timeout) as limit:
            return await _follow(
                url,
                method,
                dict(headers or {}),
                timeout,
                dns_timeout,
                max_bytes,
                max_redirects,
                resolver or _default_resolver,
                backend_factory or _default_backend_factory,
                pool_factory or _default_pool_factory,
            )
    except TimeoutError as exc:
        if limit.expired():
            raise FetchError("time limit") from exc
        raise


async def _follow(
    url: str,
    method: str,
    request_headers: dict[str, str],
    timeout: float,
    dns_timeout: float,
    max_bytes: int,
    max_redirects: int,
    resolve: Resolver,
    backends: BackendFactory,
    pools: PoolFactory,
) -> FetchResult:
    current = url
    followed = 0
    while True:
        status, mapped, body, location = await _hop(
            current,
            method,
            request_headers,
            timeout,
            max_bytes,
            resolve,
            backends,
            pools,
            dns_timeout,
        )
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
