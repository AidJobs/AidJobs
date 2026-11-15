"""Security stage 3, phase 3: crawl outcomes are stored masked, and a log line stays one line.

The Crawls and Sources pages show crawl_logs.message and sources.last_crawl_message; the failed
inserts list shows failed_inserts.error. Each site below stored the exception's text cut to length
and never masked, so a secret in it was shown, and one cut at the limit left a fragment that
masking would no longer recognise.

Every secret here is fake and assembled at runtime, so the secret scanner has nothing to match.
"""
import asyncio
import io
import logging

import psycopg2
import pytest

import orchestrator as orchestrator_module
from app import log_safety
from app.log_safety import (
    REQUEST_ID,
    TRACE_PREFIX,
    VALUE_MARK,
    RedactingFormatter,
    refresh_secrets,
    stored_text,
)
from orchestrator import CrawlerOrchestrator

FAKE_KEY = "fakekey-" + "Q7w2" + "zyxwvu9876"
FAKE_PASSWORD = "FAKEPW" + "8Hq" + "-5521x"
LEAK = (f"connect to postgresql://probe:{FAKE_PASSWORD}@db.example.invalid:5432/x failed; "
        f"key {FAKE_KEY}")
SOURCE = {"id": "src-1", "org_name": "Example", "careers_url": "https://example.org/careers"}


@pytest.fixture(autouse=True)
def fake_secrets():
    refresh_secrets({"FAKE_SERVICE_API_KEY": FAKE_KEY})
    yield
    refresh_secrets({})


def _clean(text):
    """No secret, and no fragment of one long enough to recognise."""
    for secret in (FAKE_KEY, FAKE_PASSWORD):
        assert secret[:5] not in text, text


def _crossing(limit):
    """An error whose text has the key starting five characters before the limit."""
    return RuntimeError("x" * (limit - 5) + FAKE_KEY)


# --- stored_text -------------------------------------------------------------------------


def test_stored_text_masks_before_it_cuts():
    error = _crossing(500)
    assert FAKE_KEY[:5] in str(error)[:500]  # main: the cut leaves a fragment...
    assert log_safety.redact_text(str(error)[:500]) == str(error)[:500]  # ...masking misses it
    text = stored_text(error, 500)
    _clean(text)
    assert len(text) <= 500 and text.startswith("x" * 495)


def test_stored_text_keeps_plain_text_and_web_addresses():
    message = "Timed out reading https://jobs.example.org/list?page=2"
    assert stored_text(RuntimeError(message)) == message
    assert stored_text(RuntimeError(message), 20) == message[:20]
    assert stored_text(TimeoutError()) == ""


def test_stored_text_masks_credentials_and_keeps_the_host():
    text = stored_text(RuntimeError(LEAK))
    _clean(text)
    assert VALUE_MARK in text and "db.example.invalid" in text


# --- the six storage sites --------------------------------------------------------------


class _Raising:
    def __init__(self, error):
        self.error = error

    async def crawl_source(self, source, run=None):
        raise self.error


@pytest.mark.parametrize("source_type", ["html", "rss", "api"])
@pytest.mark.parametrize("error", [RuntimeError(LEAK), _crossing(500)], ids=["leak", "crossing"])
def test_the_orchestrators_crawl_message_is_masked(source_type, error, caplog):
    orchestrator = CrawlerOrchestrator.__new__(CrawlerOrchestrator)
    orchestrator.html_crawler = orchestrator.rss_crawler = orchestrator.api_crawler = (
        _Raising(error))
    with caplog.at_level(logging.DEBUG):
        result = asyncio.run(orchestrator.crawl_source({**SOURCE, "source_type": source_type}))
    assert result["status"] == "fail"
    _clean(result["message"])
    assert len(result["message"]) <= 500
    for record in caplog.records:
        _clean(record.getMessage())


@pytest.mark.parametrize("error", [RuntimeError(LEAK), _crossing(500)], ids=["leak", "crossing"])
def test_a_run_that_fails_stores_a_masked_message(error, caplog):
    orchestrator = CrawlerOrchestrator.__new__(CrawlerOrchestrator)
    orchestrator._closing = set()
    closed = {}

    async def crawl_source(source, run):
        raise error

    async def close_run(source, run, result, mode):
        closed.update(result=result, mode=mode)

    orchestrator.crawl_source = crawl_source
    orchestrator._close_run = close_run

    async def scenario():
        deadline = asyncio.get_running_loop().time() + 30
        await orchestrator.execute_run(SOURCE, "run-1", deadline=deadline)

    with caplog.at_level(logging.DEBUG):
        asyncio.run(scenario())
    assert closed["mode"] == "normal" and closed["result"]["status"] == "fail"
    _clean(closed["result"]["message"])
    assert len(closed["result"]["message"]) <= 500
    for record in caplog.records:
        _clean(record.getMessage())


def _html_crawler(error):
    from crawler_v2.simple_crawler import SimpleCrawler

    crawler = SimpleCrawler("postgresql://example")

    async def fetch_page(url):
        raise error

    crawler._fetch_page = fetch_page
    return crawler, {**SOURCE, "source_type": "html"}


def _rss_crawler(error, monkeypatch):
    from crawler_v2 import rss_crawler as mod
    from crawler_v2.rss_crawler import SimpleRSSCrawler

    crawler = SimpleRSSCrawler("postgresql://example")

    async def fetch_feed_response(self, url):
        raise error

    monkeypatch.setattr(mod.SimpleRSSCrawler, "fetch_feed_response", fetch_feed_response)
    return crawler, {**SOURCE, "source_type": "rss"}


def _api_crawler(error, monkeypatch):
    from crawler_v2 import api_crawler as mod
    from crawler_v2.api_crawler import SimpleAPICrawler

    crawler = SimpleAPICrawler("postgresql://example")

    async def fetch_api_response(self, url, headers=None):
        raise error

    monkeypatch.setattr(mod.SimpleAPICrawler, "fetch_api_response", fetch_api_response)
    return crawler, {**SOURCE, "source_type": "api"}


@pytest.mark.parametrize("make", [_html_crawler, _rss_crawler, _api_crawler],
                         ids=["html", "rss", "api"])
@pytest.mark.parametrize("error", [RuntimeError(LEAK), _crossing(200)], ids=["leak", "crossing"])
def test_each_crawlers_failure_message_is_masked(make, error, caplog, monkeypatch):
    # HTML helper takes only the error; RSS/API need monkeypatch for the shared fetch methods.
    crawler, source = (
        make(error, monkeypatch) if make is not _html_crawler else make(error)
    )
    with caplog.at_level(logging.DEBUG):
        result = asyncio.run(crawler.crawl_source(source))
    assert result["status"] == "failed"
    _clean(result["message"])
    assert len(result["message"]) <= 200
    for record in caplog.records:
        _clean(record.getMessage())


class _Cursor:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, *args, **kwargs):
        pass


class _Connection:
    def cursor(self):
        return _Cursor()

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


class _ExplodingText(str):
    """A field whose clean-up raises, before the job's savepoint, as an unexpected error would."""

    def strip(self, *args):
        raise RuntimeError(LEAK)


def test_a_failed_job_save_is_recorded_masked(monkeypatch, caplog):
    from crawler_v2 import simple_crawler

    crawler = simple_crawler.SimpleCrawler("postgresql://example")
    crawler._get_db_conn = _Connection
    recorded = []

    class Recorder:
        def log_failed_insert(self, **fields):
            recorded.append(fields)

    crawler.extraction_logger = Recorder()
    monkeypatch.setattr(simple_crawler, "confirm_running", lambda *args, **kwargs: None)
    monkeypatch.setattr(simple_crawler, "commit_and_schedule", lambda *args, **kwargs: None)
    job = {"title": "Officer", "apply_url": "https://example.org/jobs/1",
           "deadline": _ExplodingText("soon")}
    with caplog.at_level(logging.DEBUG):
        counts = crawler.save_jobs([job], "src-1", "Example", run_token="run-1")
    assert counts["failed"] == 1
    assert len(recorded) == 1 and recorded[0]["operation"] == "process"
    error = recorded[0]["error"]
    assert error.startswith("Unexpected error processing job: ")
    _clean(error)
    assert VALUE_MARK in error
    for record in caplog.records:
        _clean(record.getMessage())


# --- database failure log lines ---------------------------------------------------------


@pytest.mark.parametrize("prefix", ["", "Network is unreachable (2406:da18::1); "])
def test_the_crawlers_connection_errors_are_logged_masked(prefix, monkeypatch, caplog):
    orchestrator = CrawlerOrchestrator.__new__(CrawlerOrchestrator)
    orchestrator.db_url = f"postgresql://probe:{FAKE_PASSWORD}@127.0.0.1:1/postgres"

    def connect(**params):
        raise psycopg2.OperationalError(
            f'{prefix}invalid dsn: "{params["dsn"]}" password={FAKE_PASSWORD} key={FAKE_KEY}')

    monkeypatch.setattr(orchestrator_module.psycopg2, "connect", connect)
    monkeypatch.setattr(orchestrator_module.time, "sleep", lambda seconds: None)
    with caplog.at_level(logging.DEBUG), pytest.raises(psycopg2.OperationalError):
        orchestrator._get_db_conn(retries=2)
    messages = [r.getMessage() for r in caplog.records]
    assert any("attempt 1/2 failed" in m for m in messages)
    for message in messages:
        _clean(message)


def test_the_failed_insert_logger_logs_its_own_failure_masked(monkeypatch, caplog):
    from core.extraction_logger import ExtractionLogger

    extraction_logger = ExtractionLogger("postgresql://example")

    def connect():
        raise psycopg2.OperationalError(LEAK)

    extraction_logger._get_db_conn = connect
    with caplog.at_level(logging.DEBUG):
        assert extraction_logger.log_failed_insert(source_url="https://example.org/j/1",
                                                   error="Duplicate job") is None
    messages = [r.getMessage() for r in caplog.records]
    assert any("Error logging failed insert" in m for m in messages)
    for message in messages:
        _clean(message)


# --- one log line per message ------------------------------------------------------------


def _logger(formatter=None):
    stream = io.StringIO()
    logger = logging.getLogger(f"phase3-test-{id(stream)}")
    logger.handlers.clear()
    logger.propagate = False
    handler = logging.StreamHandler(stream)
    inner = formatter or logging.Formatter("%(levelname)s %(message)s")
    handler.setFormatter(RedactingFormatter(inner))
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    return logger, stream


@pytest.mark.parametrize("brk", ["\n", "\r\n", "\r", "\x0b", "\x0c", "\x1c", "\x1d", "\x1e",
                                 "\x85", "\u2028", "\u2029"])
def test_a_line_break_in_a_message_cannot_start_a_new_line(brk):
    logger, stream = _logger()
    logger.info("Saved job %s", f"Officer{brk}ERROR [orchestrator] forged")
    output = stream.getvalue()
    assert output.count("\n") == 1 and output.endswith("\n")
    assert len(output.splitlines()) == 1
    assert output.startswith("INFO Saved job Officer") and "ERROR [orchestrator] forged" in output


def test_a_traceback_stays_on_its_own_prefixed_lines():
    logger, stream = _logger()
    try:
        raise ValueError(f"bad title\nERROR [orchestrator] forged {FAKE_KEY}"
                         "\rINFO second\u2028INFO third")
    except ValueError:
        logger.exception("Crawl failed for %s", "Example\nINFO forged too")
    lines = stream.getvalue().splitlines()
    assert lines[0] == "ERROR Crawl failed for Example\\nINFO forged too"
    assert len(lines) > 3 and all(line.startswith(TRACE_PREFIX) for line in lines[1:])
    assert lines[1] == TRACE_PREFIX + "Traceback (most recent call last):"
    assert (TRACE_PREFIX + "ERROR [orchestrator] forged " + VALUE_MARK
            + "\\rINFO second\\u2028INFO third") in lines
    _clean(stream.getvalue())


def test_a_secret_holding_a_line_break_is_masked_before_escaping(fake_secrets):
    """A key kept in the environment with line breaks (a PEM key, say) must still match."""
    pem = "-----BEGIN FAKE KEY-----\n" + "MIIfake" + "Q29tcGFyZQ" + "\n-----END FAKE KEY-----"
    refresh_secrets({"FAKE_SIGNING_KEY": pem})
    logger, stream = _logger()
    try:
        raise RuntimeError(f"signing with {pem} failed")
    except RuntimeError:
        logger.exception("Using %s", pem)
    output = stream.getvalue()
    assert "MIIfake" not in output
    assert output.splitlines()[0] == "ERROR Using " + VALUE_MARK


def test_stack_information_is_prefixed_too():
    logger, stream = _logger()
    logger.info("checkpoint", stack_info=True)
    lines = stream.getvalue().splitlines()
    assert lines[0] == "INFO checkpoint"
    assert len(lines) > 1 and all(line.startswith(TRACE_PREFIX) for line in lines[1:])


def test_the_record_is_left_unchanged_for_the_next_handler():
    logger, first = _logger()
    second = io.StringIO()
    plain = logging.StreamHandler(second)
    plain.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(plain)
    try:
        raise ValueError("boom")
    except ValueError:
        logger.exception("one\ntwo")
    assert first.getvalue().splitlines()[0] == "ERROR one\\ntwo"
    assert second.getvalue().startswith("one\ntwo\nTraceback (most recent call last):")
    assert "ValueError: boom" in second.getvalue()


def test_the_request_id_still_leads_the_line():
    logger, stream = _logger()
    token = REQUEST_ID.set("run-42")
    try:
        logger.warning("a\nb")
    finally:
        REQUEST_ID.reset(token)
    assert stream.getvalue() == "[run-42] WARNING a\\nb\n"


def test_uvicorns_formatters_still_work_with_tracebacks():
    from uvicorn.logging import AccessFormatter, DefaultFormatter

    default = RedactingFormatter(DefaultFormatter("%(levelprefix)s %(message)s", use_colors=False))
    try:
        raise RuntimeError("Exception in ASGI application")
    except RuntimeError:
        import sys

        record = logging.LogRecord("uvicorn.error", logging.ERROR, "", 0, "Exception in %s",
                                   ("ASGI application",), sys.exc_info())
    text = default.format(record)
    lines = text.splitlines()
    assert lines[0].startswith("ERROR:") and lines[0].endswith("Exception in ASGI application")
    assert all(line.startswith(TRACE_PREFIX) for line in lines[1:])
    assert record.exc_text is None and record.args == ("ASGI application",)

    access = RedactingFormatter(
        AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s', use_colors=False))
    line = access.format(logging.LogRecord(
        "uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
        ("203.0.113.9:4321", "GET", "/api/jobs?q=a%0Ab", "1.1", 200), None))
    assert line == '203.0.113.9:4321 - "GET /api/jobs?q=a%0Ab HTTP/1.1" 200 OK'
