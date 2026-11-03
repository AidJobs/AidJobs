"""Security stage 3, phase 3, PR 2: the last three guard entries, on public paths.

The health check's answer is unchanged; a failing AI or Meilisearch call logs its errors masked
and keeps no exception text (both behind the public parse, autocomplete and search routes).

Every secret here is fake and assembled at runtime, so the secret scanner has nothing to match.
"""
import json
import logging
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app import ai_service as ai_module
from app import search as search_module
from app.log_safety import refresh_secrets

FAKE_KEY = "fakekey-" + "Pub7" + "entries4242"
FAKE_PASSWORD = "FAKEPW" + "5Lq" + "-1188y"
LEAK = (f"connection refused by postgresql://probe:{FAKE_PASSWORD}@db.example.invalid:5432/x "
        f"key={FAKE_KEY}")


@pytest.fixture(autouse=True)
def fake_secrets():
    refresh_secrets({"FAKE_SERVICE_API_KEY": FAKE_KEY})
    yield
    refresh_secrets({})


def _clean(messages):
    joined = "\n".join(messages)
    for secret in (FAKE_KEY, FAKE_PASSWORD):
        assert secret[:6] not in joined, joined


def test_the_health_check_answers_exactly_as_before():
    import main

    response = TestClient(main.app).get("/api/healthz")
    assert response.status_code == 200
    assert response.content == b'{"status":"ok","message":"Service is running"}'


def _request():
    return httpx.Request("POST", "https://openrouter.example.invalid/api/v1/chat/completions")


def _raise(error):
    class Client:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def post(self, *args, **kwargs):
            if isinstance(error, Exception):
                raise error
            return error

    return Client


class _Answer:
    """A response whose body is the given object, or whose .json() raises."""

    def __init__(self, body, status=200):
        self.body, self.status_code = body, status

    def raise_for_status(self):
        pass

    def json(self):
        if isinstance(self.body, Exception):
            raise self.body
        return self.body


def _status_error(status):
    return httpx.HTTPStatusError(LEAK, request=_request(),
                                 response=httpx.Response(status, request=_request()))


@pytest.mark.parametrize("error", [
    httpx.ConnectError(LEAK, request=_request()),
    httpx.ReadTimeout(LEAK, request=_request()),
    _status_error(503),
    _status_error(401),
    RuntimeError(LEAK),
    _Answer(json.JSONDecodeError(LEAK, "doc", 0)),
    _Answer({"choices": [{"message": {"content": "{not json " + FAKE_KEY}}]}),
    _Answer({"unexpected": LEAK}),
], ids=["network", "timeout", "server-error", "client-error", "unexpected", "bad-json-body",
        "bad-json-content", "unexpected-shape"])
def test_a_failing_ai_call_logs_no_secret_and_returns_none(error, monkeypatch, caplog):
    service = ai_module.AIService()
    service.enabled = True
    service.api_key = FAKE_KEY
    monkeypatch.setattr(ai_module.httpx, "Client", _raise(error))
    monkeypatch.setattr(ai_module.time, "sleep", lambda seconds: None)
    with caplog.at_level(logging.DEBUG, logger="app.ai_service"):
        result = service._call_openrouter([{"role": "user", "content": "nurse"}],
                                          response_format={"type": "json_object"})
    assert result is None
    messages = [r.getMessage() for r in caplog.records]
    assert any("failed" in m or "error" in m for m in messages)
    _clean(messages)


def _search_service(index_error, reconnects):
    service = search_module.SearchService.__new__(search_module.SearchService)

    class Index:
        def search(self, *args, **kwargs):
            raise index_error

    class Client:
        def index(self, name):
            return Index()

    service.meili_client = Client()
    service.meili_index_name = "jobs"
    service._last_health_check = time.time()
    service._health_check_interval = 3600
    service._connection_retry_count = 0
    service._max_retries = 3
    service._init_meilisearch = lambda retry=False: reconnects.append(retry)
    return service


@pytest.mark.parametrize("text, reconnect", [(LEAK, True), (f"bad filter {FAKE_KEY}", False)])
def test_a_failing_meilisearch_search_logs_no_secret_and_falls_back(text, reconnect, monkeypatch,
                                                                   caplog):
    import asyncio

    reconnects = []
    service = _search_service(RuntimeError(text), reconnects)

    async def no_wait(seconds):
        return None

    monkeypatch.setattr(search_module.asyncio, "sleep", no_wait)
    with caplog.at_level(logging.DEBUG, logger="app.search"):
        result = asyncio.run(service._search_meilisearch("nurse", 1, 20, {}))
    assert result is None
    assert bool(reconnects) is reconnect
    messages = [r.getMessage() for r in caplog.records]
    assert any("falling back to database" in m for m in messages)
    _clean(messages)


@pytest.mark.parametrize("text, expected", [
    ("Connection refused", True), ("read TIMEOUT", True), ("host unreachable", True),
    ("connection reset by peer", True), ("invalid filter expression", False), ("", False),
])
def test_a_lost_connection_is_recognised_by_its_words(text, expected):
    assert search_module._connection_failure(RuntimeError(text)) is expected
