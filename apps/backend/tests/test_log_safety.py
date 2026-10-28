"""Security stage 3, phase 1: redaction, request IDs, and safe 5xx responses.

Every secret here is fake and assembled at runtime, so the secret scanner has nothing to match.
"""
import asyncio
import io
import logging

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app import log_safety
from app.errors import (
    REQUEST_ID_HEADER,
    InternalError,
    RequestIdMiddleware,
    internal_error_handler,
)
from app.log_safety import (
    REQUEST_ID,
    VALUE_MARK,
    RedactingFormatter,
    redact_exception,
    redact_text,
    refresh_secrets,
)

FAKE_PASSWORD = "FAKEPW7Q" + "/dz#k" + "-9341"
FAKE_KEY = "fakekey-" + "x9Q2" + "abcdef1234"
FAKE_DB_URL = "postgresql://probe:" + "FAKEPW7Q%2Fdz%23k-9341" + "@db.example.invalid:5432/postgres"


@pytest.fixture(autouse=True)
def fake_secrets():
    refresh_secrets({
        "SUPABASE_DB_URL": FAKE_DB_URL,
        "FAKE_SERVICE_API_KEY": FAKE_KEY,
        "SHORT_TOKEN": "abc12",
        "FLAG_SECRET": "true",
        "AIDJOBS_ENV": "production",
    })
    yield
    refresh_secrets({})


def test_known_secret_values_are_replaced_in_every_form():
    for text in (FAKE_KEY, FAKE_PASSWORD, "FAKEPW7Q%2Fdz%23k-9341", FAKE_DB_URL):
        line = redact_text(f"calling with {text} now")
        assert "FAKEPW7Q" not in line and FAKE_KEY not in line
        assert VALUE_MARK in line


def test_short_and_boolean_values_are_not_secrets():
    assert redact_text("abc12 is true") == "abc12 is true"


@pytest.mark.parametrize(
    "message",
    [
        'invalid dsn: invalid percent-encoded token: "FAKE%zzOTHERPW99"',
        'invalid dsn: missing "=" after "OTHERPW99xyz" in connection info string',
        'invalid integer value "OTHERPW99" for connection option "port"',
        "Port could not be cast to integer value as 'OTHERPW99'",
        "connect to postgresql://user:OTHER/PW99@db.example.invalid:5432/x failed",
        "password=OTHERPW99 host=db.example.invalid",
        "Authorization: Bearer OTHERPW99abcdefgh",
        "GET https://maps.example.invalid/geocode?address=Nairobi&key=OTHERPW99xyz",
        "using sk-or-" + "v1-OTHERPW99abcdefghij",
    ],
)
def test_demonstrated_secret_shapes_are_redacted(message):
    assert "OTHERPW99" not in redact_text(message)


def test_redact_exception_keeps_pr50_markers():
    fake = "fake" + "-test-value"
    address = "postgresql" + "://user:" + fake + "@db.example.internal:5432/postgres"
    text = redact_exception(RuntimeError(f'invalid dsn: "{address}" password={fake}'))
    assert text.startswith("RuntimeError: ")
    assert "<redacted-url>" in text
    assert fake not in text


def _logger_writing_to(stream, formatter=None):
    logger = logging.getLogger(f"stage3-test-{id(stream)}")
    logger.handlers.clear()
    logger.propagate = False
    handler = logging.StreamHandler(stream)
    handler.setFormatter(RedactingFormatter(formatter or logging.Formatter("%(message)s")))
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    return logger


def test_the_finished_line_is_redacted_including_args_and_tracebacks():
    stream = io.StringIO()
    logger = _logger_writing_to(stream)
    logger.info("connecting with %s", FAKE_KEY)
    try:
        raise ValueError(f"Port could not be cast to integer value as '{FAKE_PASSWORD[:8]}'")
    except ValueError:
        logger.exception("parse failed")
    output = stream.getvalue()
    assert FAKE_KEY not in output and "FAKEPW7Q" not in output
    assert "Traceback" in output and "parse failed" in output


def test_uvicorn_access_formatter_still_works_when_wrapped():
    from uvicorn.logging import AccessFormatter

    formatter = RedactingFormatter(
        AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s', use_colors=False)
    )
    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
        ("203.0.113.9:4321", "GET", "/api/x?token=" + "OTHERPW99abc", "1.1", 200), None,
    )
    line = formatter.format(record)
    assert "GET /api/x?token=" + VALUE_MARK in line and "OTHERPW99" not in line


def test_lines_inside_a_request_carry_its_id():
    stream = io.StringIO()
    logger = _logger_writing_to(stream)
    token = REQUEST_ID.set("abc123")
    try:
        logger.info("inside")
    finally:
        REQUEST_ID.reset(token)
    logger.info("outside")
    assert stream.getvalue().splitlines() == ["[abc123] inside", "outside"]


def test_worker_threads_keep_the_request_id():
    async def scenario():
        REQUEST_ID.set("thread-check")
        return await asyncio.to_thread(REQUEST_ID.get)

    assert asyncio.run(scenario()) == "thread-check"


def test_install_wraps_every_handler_once_and_quiets_httpx(monkeypatch):
    added = []
    for name in log_safety.HANDLED_LOGGERS:
        handler = logging.StreamHandler(io.StringIO())
        logging.getLogger(name).addHandler(handler)
        added.append((name, handler))
    original_last_resort = logging.lastResort.formatter
    try:
        log_safety.install()
        log_safety.install()
        for _name, handler in added:
            assert isinstance(handler.formatter, RedactingFormatter)
            assert not isinstance(handler.formatter.inner, RedactingFormatter)
        assert isinstance(logging.lastResort.formatter, RedactingFormatter)
        assert logging.getLogger("httpx").level == logging.WARNING
    finally:
        for name, handler in added:
            logging.getLogger(name).removeHandler(handler)
        logging.lastResort.setFormatter(original_last_resort)


def test_install_covers_uvicorns_own_logging_configuration():
    """Applies the installed uvicorn's LOGGING_CONFIG, as uvicorn does at start-up (CI: 0.32)."""
    import copy
    import logging.config

    from uvicorn.config import LOGGING_CONFIG

    names = ("uvicorn", "uvicorn.access", "uvicorn.error")
    saved = {
        n: (list(logging.getLogger(n).handlers), logging.getLogger(n).propagate) for n in names
    }
    original_last_resort = logging.lastResort.formatter
    try:
        logging.config.dictConfig(copy.deepcopy(LOGGING_CONFIG))
        log_safety.install()
        wrapped = [h for n in names for h in logging.getLogger(n).handlers]
        assert wrapped, "uvicorn's configuration created no handlers"
        assert all(isinstance(h.formatter, RedactingFormatter) for h in wrapped)
        stream = io.StringIO()
        logging.getLogger("uvicorn.access").handlers[0].setStream(stream)
        path = "/x?key=" + "OTHERPW99abc"
        logging.getLogger("uvicorn.access").info(
            '%s - "%s %s HTTP/%s" %d', "203.0.113.9:1", "GET", path, "1.1", 200
        )
        assert "OTHERPW99" not in stream.getvalue() and "key=" + VALUE_MARK in stream.getvalue()
    finally:
        for name, (handlers, propagate) in saved.items():
            logger = logging.getLogger(name)
            logger.handlers[:] = handlers
            logger.propagate = propagate
        logging.lastResort.setFormatter(original_last_resort)


def _app():
    app = FastAPI()

    @app.get("/ok")
    def ok():
        return {"ok": True}

    @app.get("/missing")
    def missing():
        raise HTTPException(status_code=404, detail="Job not found")

    @app.get("/broken")
    def broken():
        raise InternalError("Failed to load things", RuntimeError("password=" + "OTHERPW99zz"))

    app.add_middleware(RequestIdMiddleware)
    app.add_exception_handler(InternalError, internal_error_handler)
    return app


def test_every_response_gets_a_new_server_generated_id():
    client = TestClient(_app())
    first = client.get("/ok", headers={REQUEST_ID_HEADER: "chosen-by-caller"})
    second = client.get("/missing")
    ids = [first.headers[REQUEST_ID_HEADER], second.headers[REQUEST_ID_HEADER]]
    assert "chosen-by-caller" not in ids
    assert all(len(i) == 32 for i in ids) and ids[0] != ids[1]
    assert second.status_code == 404 and second.json() == {"detail": "Job not found"}


def test_internal_errors_return_a_fixed_message_with_a_reference(caplog):
    client = TestClient(_app(), raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR, logger="app.errors"):
        response = client.get("/broken")
    request_id = response.headers[REQUEST_ID_HEADER]
    assert response.status_code == 500
    assert response.json() == {
        "detail": f"Failed to load things (ref {request_id[:8]})",
        "request_id": request_id,
    }
    assert "OTHERPW99" not in response.text
    assert "Failed to load things: RuntimeError: password=<redacted>" in caplog.text
    assert "OTHERPW99" not in caplog.messages[0]
