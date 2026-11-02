"""Security stage 3, phase 2, PR 2: link validation uses the shared outbound policy (contract 9).

The real `fetch_url` runs with a fake resolver and a scripted transport. Real sockets and DNS are
replaced by functions that record the attempt and fail, so even `main`'s plain-httpx validator
cannot reach a network from here. The cache is faked: no database.
"""
import asyncio
import functools
import logging
import socket
import ssl
import threading

import httpcore
import httpx
import pytest

from app.log_safety import REQUEST_ID
from contracts import outbound
from contracts.outbound import FetchError, PinnedBackend
from core import link_validator
from core.link_validator import MAX_REDIRECT_HOPS, LinkValidator, describe_link_failure

FRAGMENT = "FAKEPW3k"
RESULT_KEYS = {"valid", "status_code", "final_url", "redirect_count", "error", "cached",
               "validated_at"}


_LOOP = []


def _run(coro):
    return _LOOP[0].run_until_complete(coro)


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Any real connection or DNS lookup is recorded and refused.

    Only the loopback socket pair that a new event loop (or the test client) makes on Windows may
    connect, and only from inside socket.socketpair.
    """
    _LOOP[:] = [asyncio.new_event_loop()]
    attempts = []
    pairing = threading.local()
    real_connect = socket.socket.connect
    real_pair = socket.socketpair

    def pair(*args, **kwargs):
        pairing.on = True
        try:
            return real_pair(*args, **kwargs)
        finally:
            pairing.on = False

    def refuse(*args, **kwargs):
        if getattr(pairing, "on", False):
            return real_connect(*args, **kwargs)
        attempts.append(args[:2])
        raise AssertionError(f"real network use attempted: {args[:2]!r}")

    async def refuse_async(self, *args, **kwargs):
        attempts.append(args[1:3])
        raise AssertionError(f"real network use attempted: {args[1:3]!r}")

    # Windows' proactor loop connects without socket.connect, so the loop's own entry points too.
    monkeypatch.setattr(asyncio.base_events.BaseEventLoop, "create_connection", refuse_async)
    monkeypatch.setattr(asyncio.base_events.BaseEventLoop, "sock_connect", refuse_async)
    monkeypatch.setattr(socket, "socketpair", pair)
    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    yield attempts
    monkeypatch.undo()
    _LOOP.pop().close()
    assert not attempts, attempts


def _response(status, headers=None):
    fields = {"Content-Length": "0", **(headers or {})}
    lines = [f"HTTP/1.1 {status} X"] + [f"{k}: {v}" for k, v in fields.items()]
    return ("\r\n".join(lines) + "\r\n\r\n").encode("ascii")


def _redirect(location):
    return _response(302, {"Location": location})


class _Stream(httpcore.AsyncMockStream):
    def __init__(self, buffer, events):
        super().__init__(buffer)
        self.events = events

    async def write(self, buffer, timeout=None):
        self.events.append(("write", buffer))


class _Backend(httpcore.AsyncNetworkBackend):
    def __init__(self, responses, events, failure=None):
        self.responses = responses
        self.events = events
        self.failure = failure

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        self.events.append(("connect", host))
        if self.failure is not None:
            raise self.failure
        if not self.responses:
            raise AssertionError(f"unexpected connection to {host}")
        return _Stream([self.responses.pop(0)], self.events)

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):
        raise AssertionError("unix socket")

    async def sleep(self, seconds):
        return None


def _validator(monkeypatch, responses=(), addresses=None, failure=None, fake_cache=True):
    """A LinkValidator whose fetches use the real policy over fake DNS and a scripted transport."""
    events = []
    addresses = addresses or {}
    backend = _Backend(list(responses), events, failure)

    async def resolver(host, port):
        events.append(("dns", host))
        return list(addresses.get(host, ["93.184.216.34"]))

    def backend_factory(pinned_ip):
        events.append(("pin", pinned_ip))
        return PinnedBackend(pinned_ip, backend)

    def pool_factory(network_backend):
        return httpcore.AsyncConnectionPool(network_backend=network_backend, max_connections=1,
                                            max_keepalive_connections=0, retries=0)

    monkeypatch.setattr(link_validator, "fetch_url", functools.partial(
        outbound.fetch_url, resolver=resolver, backend_factory=backend_factory,
        pool_factory=pool_factory))
    validator = LinkValidator("postgresql://unused")
    cached = []
    if fake_cache:
        monkeypatch.setattr(validator, "_get_cached_validation", lambda url: None)
        monkeypatch.setattr(validator, "_cache_validation",
                            lambda url, result, ttl_hours=24: cached.append((url, result)))
    return validator, events, cached


def _validate(validator, url):
    return _run(validator.validate_url(url, use_cache=False))


def _connects(events):
    return [e for e in events if e[0] == "connect"]


def test_the_network_guard_records_and_refuses_every_route_out(no_network):
    """Plain sockets and the event loop are both covered; aimed at loopback, so nothing leaves."""
    async def through_the_loop():
        async with httpx.AsyncClient() as client:
            await client.head("http://127.0.0.1:9/")

    with pytest.raises(BaseException):
        _run(through_the_loop())
    assert no_network, "the event-loop path was not refused"
    no_network.clear()
    with pytest.raises(AssertionError):
        socket.create_connection(("127.0.0.1", 9), timeout=1)
    with pytest.raises(AssertionError):
        socket.socket().connect(("127.0.0.1", 9))
    assert len(no_network) == 2
    no_network.clear()


def test_the_route_refuses_a_blocked_url_through_the_real_validator(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app import crawler_admin

    validator, events, _cached = _validator(monkeypatch, [_response(200)])
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://probe@127.0.0.1:1/postgres")
    monkeypatch.setattr(link_validator, "get_link_validator", lambda db_url: validator)
    app = FastAPI()
    app.include_router(crawler_admin.link_validation_router)
    app.dependency_overrides[crawler_admin.admin_required] = lambda: "test-admin"
    urls = ["http://169.254.169.254/latest/meta-data/", "http://localhost:8000/admin"]
    response = TestClient(app).post("/api/admin/link-validation/validate", json={"urls": urls})
    body = response.json()
    assert response.status_code == 200
    assert (body["total"], body["valid"], body["invalid"]) == (2, 0, 2)
    assert {r["error"] for r in body["results"].values()} <= {
        "Validation error: destination address is not permitted",
        "Validation error: destination host is not permitted",
    }
    assert _connects(events) == []


@pytest.mark.parametrize("url, addresses", [
    ("http://127.0.0.1/", None),
    ("http://10.0.0.5/admin", None),
    ("http://172.16.0.1/", None),
    ("http://192.168.1.1/", None),
    ("http://169.254.169.254/latest/meta-data/", None),
    ("http://[::1]/", None),
    ("http://[::ffff:10.0.0.1]/", None),
    ("http://localhost:8000/", None),
    ("http://metadata.google.internal/computeMetadata/v1/", None),
    ("https://jobs.example/apply", {"jobs.example": ["93.184.216.34", "10.0.0.7"]}),
    ("https://inside.example/", {"inside.example": ["169.254.169.254"]}),
])
def test_prohibited_destinations_are_refused_before_any_connection(monkeypatch, url, addresses):
    validator, events, cached = _validator(monkeypatch, [_response(200)], addresses)
    result = _validate(validator, url)
    assert set(result) == RESULT_KEYS
    assert result["valid"] is False and result["status_code"] is None
    assert result["error"] in {
        "Validation error: destination address is not permitted",
        "Validation error: destination host is not permitted",
    }
    assert _connects(events) == []
    assert cached and cached[0][1]["error"] == result["error"]


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://files.example/x",
                                 "gopher://files.example/"])
def test_other_schemes_are_refused(monkeypatch, url):
    validator, events, _cached = _validator(monkeypatch, [_response(200)])
    result = _validate(validator, url)
    assert result["valid"] is False
    assert result["error"] in {"Invalid URL format",
                               "Validation error: URL scheme or host is not permitted"}
    assert _connects(events) == []


@pytest.mark.parametrize("target", ["http://169.254.169.254/latest/meta-data/",
                                    "http://localhost/", "http://10.1.2.3/"])
def test_a_redirect_into_the_network_is_refused_at_that_hop(monkeypatch, target):
    validator, events, _cached = _validator(monkeypatch, [_redirect(target), _response(200)])
    result = _validate(validator, "https://jobs.example/apply")
    assert result["valid"] is False
    assert result["error"] in {
        "Validation error: redirect destination is not permitted",
        "Validation error: destination address is not permitted",
        "Validation error: destination host is not permitted",
    }
    assert _connects(events) == [("connect", "93.184.216.34")]


def test_a_redirect_whose_name_resolves_inside_is_refused(monkeypatch):
    validator, events, _cached = _validator(
        monkeypatch, [_redirect("https://next.example/"), _response(200)],
        {"next.example": ["10.0.0.9"]})
    result = _validate(validator, "https://jobs.example/apply")
    assert result["error"] == "Validation error: destination address is not permitted"
    assert _connects(events) == [("connect", "93.184.216.34")]


def test_up_to_the_limit_redirects_are_followed_and_counted(monkeypatch):
    hops = [f"https://hop{i}.example/" for i in range(MAX_REDIRECT_HOPS + 1)]
    script = [_redirect(hops[i + 1]) for i in range(MAX_REDIRECT_HOPS)] + [_response(200)]
    validator, events, _cached = _validator(monkeypatch, script)
    result = _validate(validator, hops[0])
    assert MAX_REDIRECT_HOPS == 10
    assert result == {**result, "valid": True, "status_code": 200, "final_url": hops[-1],
                      "redirect_count": MAX_REDIRECT_HOPS, "error": None, "cached": False}
    assert len(_connects(events)) == MAX_REDIRECT_HOPS + 1


def test_one_redirect_more_than_the_limit_is_invalid(monkeypatch):
    script = [_redirect(f"https://hop{i}.example/") for i in range(1, MAX_REDIRECT_HOPS + 2)]
    validator, events, _cached = _validator(monkeypatch, script)
    result = _validate(validator, "https://hop0.example/")
    assert result["valid"] is False
    assert result["error"] == "Validation error: redirect limit"
    assert len(_connects(events)) == MAX_REDIRECT_HOPS + 1


def test_a_redirect_without_a_location_is_invalid(monkeypatch):
    validator, _events, _cached = _validator(monkeypatch, [_response(302)])
    result = _validate(validator, "https://jobs.example/apply")
    assert result["error"] == "Validation error: redirect destination is missing"


def test_a_working_link_keeps_its_result_shape_and_uses_head(monkeypatch):
    validator, events, cached = _validator(
        monkeypatch, [_redirect("/jobs/42"), _response(200)])
    result = _validate(validator, "https://jobs.example/apply?id=42")
    assert set(result) == RESULT_KEYS
    assert result["valid"] is True and result["status_code"] == 200
    assert result["final_url"] == "https://jobs.example/jobs/42"
    assert result["redirect_count"] == 1 and result["error"] is None
    writes = [e[1] for e in events if e[0] == "write" and e[1]]
    assert len(writes) == 2 and all(w.startswith(b"HEAD ") for w in writes)
    assert cached[0][0] == "https://jobs.example/apply?id=42"


def test_an_error_status_keeps_its_message(monkeypatch):
    validator, _events, _cached = _validator(monkeypatch, [_response(404)])
    result = _validate(validator, "https://jobs.example/gone")
    assert result["valid"] is False and result["status_code"] == 404
    assert result["error"] == "Invalid status code: 404"


@pytest.mark.parametrize("url", ["", "   ", "jobs.example/apply", "https://", "http://:80/",
                                 "https://jobs.example:99999/", "https://jobs.example:port/",
                                 "https://" + "a" * 64 + ".example/", "http://[::1/"])
def test_malformed_urls_are_named_without_their_text(monkeypatch, url):
    validator, events, _cached = _validator(monkeypatch)
    result = _validate(validator, url)
    assert result["valid"] is False
    assert result["error"] in {"URL is empty", "Invalid URL format"}
    assert _connects(events) == []


@pytest.fixture
def request_id():
    token = REQUEST_ID.set("abcdef1234567890abcdef1234567890")
    yield "abcdef12"
    REQUEST_ID.reset(token)


def _tls_failure():
    try:
        try:
            raise ssl.SSLCertVerificationError("certificate verify failed for " + FRAGMENT)
        except ssl.SSLError as exc:
            raise httpcore.ConnectError("TLS handshake with " + FRAGMENT) from exc
    except httpcore.ConnectError as wrapped:
        return wrapped


@pytest.mark.parametrize("failure, expected", [
    (ConnectionRefusedError("[Errno 111] refused by " + FRAGMENT),
     "Validation error: connection failed"),
    (httpcore.ConnectError("All connection attempts failed " + FRAGMENT),
     "Validation error: connection failed"),
    (_tls_failure(), "Validation error: TLS error"),
    (httpcore.ConnectTimeout("timed out " + FRAGMENT), "Validation error: timeout"),
])
def test_ordinary_connection_failures_keep_a_category(monkeypatch, failure, expected):
    validator, _events, _cached = _validator(monkeypatch, failure=failure)
    result = _validate(validator, "https://jobs.example/apply")
    assert result["error"] == expected
    assert FRAGMENT not in repr(result)


@pytest.mark.parametrize("error, expected", [
    (FetchError("timeout"), "Validation error: timeout"),
    (FetchError("upstream said " + FRAGMENT), "Validation error: fetch failed"),
    (httpcore.ReadTimeout("read timed out " + FRAGMENT), "Validation error: timeout"),
    (httpcore.ReadError("reset by " + FRAGMENT), "Validation error: connection failed"),
    (httpcore.RemoteProtocolError("bad status line " + FRAGMENT),
     "Validation error: invalid response"),
    (httpcore.LocalProtocolError("Illegal target characters " + FRAGMENT),
     "Validation error: invalid URL"),
    (httpcore.ProtocolError("protocol " + FRAGMENT), "Validation error: invalid response"),
    (TimeoutError("deadline passed " + FRAGMENT), "Validation error: timeout"),
    (socket.timeout("timed out " + FRAGMENT), "Validation error: timeout"),
    (ssl.SSLError("handshake " + FRAGMENT), "Validation error: TLS error"),
    (ConnectionResetError("reset " + FRAGMENT), "Validation error: connection failed"),
    (ValueError("Port out of range " + FRAGMENT), "Validation error: invalid URL"),
    (UnicodeError("label too long " + FRAGMENT), "Validation error: invalid URL"),
    (RuntimeError("password=" + FRAGMENT), "Validation error: unexpected error (ref abcdef12)"),
])
def test_failures_are_described_by_type_never_by_their_text(request_id, error, expected):
    described = describe_link_failure(error)
    assert described == expected
    assert FRAGMENT not in described


def test_an_unexpected_failure_is_logged_redacted_with_its_reference(monkeypatch, caplog,
                                                                     request_id):
    async def explode(*args, **kwargs):
        raise RuntimeError("postgresql://probe:" + FRAGMENT + "@db.example/x")

    validator, _events, _cached = _validator(monkeypatch)
    monkeypatch.setattr(link_validator, "fetch_url", explode)
    with caplog.at_level(logging.WARNING, logger="core.link_validator"):
        result = _validate(validator, "https://jobs.example/apply")
    assert result["error"] == "Validation error: unexpected error (ref abcdef12)"
    logged = [r for r in caplog.records if "Unexpected failure checking" in r.getMessage()]
    assert logged and logged[0].exc_info and logged[0].exc_info[0] is RuntimeError
    assert all(FRAGMENT not in r.getMessage() for r in caplog.records)


def test_an_expected_failure_logs_no_traceback(monkeypatch, caplog):
    validator, _events, _cached = _validator(monkeypatch, failure=httpcore.ConnectError("x"))
    with caplog.at_level(logging.WARNING, logger="core.link_validator"):
        _validate(validator, "https://jobs.example/apply")
    assert not any(r.exc_info for r in caplog.records)


def test_an_unreachable_cache_is_a_miss_and_a_skipped_write(monkeypatch, caplog):
    import psycopg2

    def refuse(*args, **kwargs):
        raise psycopg2.OperationalError('invalid dsn: missing "=" after "' + FRAGMENT + '"')

    monkeypatch.setattr(link_validator.psycopg2, "connect", refuse)
    validator = LinkValidator("postgresql://unused")
    with caplog.at_level(logging.WARNING, logger="core.link_validator"):
        assert validator._get_cached_validation("https://jobs.example/") is None
        validator._cache_validation("https://jobs.example/", {
            "valid": False, "status_code": None, "final_url": None, "redirect_count": 0,
            "error": "URL is empty", "validated_at": None})
    messages = [r.getMessage() for r in caplog.records]
    assert any("Error reading cache" in m for m in messages)
    assert any("Error caching validation" in m for m in messages)
    assert all(FRAGMENT not in m for m in messages)


def test_a_batch_keeps_every_url_when_the_cache_is_down(monkeypatch):
    import psycopg2

    def refuse(*args, **kwargs):
        raise psycopg2.OperationalError("cache down")

    validator, _events, _cached = _validator(monkeypatch, [_response(200), _response(404)],
                                             fake_cache=False)
    monkeypatch.setattr(link_validator.psycopg2, "connect", refuse)
    urls = ["https://one.example/", "https://two.example/"]
    results = _run(validator.validate_batch(urls, use_cache=True, max_concurrent=1))
    assert sorted(results) == urls
    assert {u: r["status_code"] for u, r in results.items()} == {urls[0]: 200, urls[1]: 404}
