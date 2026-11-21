"""Growth plan A2: sync listing parse runs in worker threads."""
from __future__ import annotations

import asyncio
import time

import pytest

from contracts.reader import Response
from crawler_v2 import readers as readers_mod
from crawler_v2.readers import LISTING_STRATEGY, GeneralReader, RssFeedReader
from crawler_v2.simple_crawler import SimpleCrawler


@pytest.fixture
def crawler():
    return SimpleCrawler("postgresql://example")


async def _with_heartbeat(coro):
    gaps, stop = [], asyncio.Event()

    async def heartbeat():
        last = time.perf_counter()
        while not stop.is_set():
            await asyncio.sleep(0.02)
            now = time.perf_counter()
            gaps.append(now - last - 0.02)
            last = now

    beat = asyncio.create_task(heartbeat())
    await asyncio.sleep(0.05)
    result = await coro
    stop.set()
    await beat
    return result, max(gaps, default=0.0)


def test_listing_extract_keeps_event_loop_responsive(crawler, monkeypatch):
    real = crawler.extract_jobs_from_html
    calls = []

    def slow(html, base_url):
        time.sleep(1.1)
        calls.append(1)
        return real(html, base_url)

    monkeypatch.setattr(crawler, "extract_jobs_from_html", slow)
    html = (
        "<html><body><table><tr><td>"
        "<a href='https://example.org/job/1'>Programme Analyst</a>"
        "</td></tr></table></body></html>"
    )

    async def run():
        return await crawler._listing_jobs(html, "https://example.org/jobs")

    (_, _), worst = asyncio.run(_with_heartbeat(run()))
    assert calls, "extract should have run in a worker thread"
    assert worst < 0.5, f"event loop stalled {worst:.2f}s"


def test_rss_feed_parse_keeps_event_loop_responsive(monkeypatch):
    real = readers_mod._rss_feed_jobs
    calls = []

    def slow(body, careers_url):
        time.sleep(1.1)
        calls.append(1)
        return real(body, careers_url)

    monkeypatch.setattr(readers_mod, "_rss_feed_jobs", slow)
    body = (
        '<?xml version="1.0"?><rss version="2.0"><channel>'
        "<item><title>Officer</title>"
        "<link>https://example.org/job/1</link>"
        "<description>Nairobi</description></item>"
        "</channel></rss>"
    )

    async def run():
        return await RssFeedReader().read(
            Response(200, body), {"careers_url": "https://example.org/feed"}
        )

    result, worst = asyncio.run(_with_heartbeat(run()))
    assert calls, "RSS parse should have run in a worker thread"
    assert result.jobs
    assert worst < 0.5, f"event loop stalled {worst:.2f}s"


@pytest.mark.asyncio
async def test_general_reader_sets_strategy_contextvar(crawler):
    html = (
        "<html><body><table><tr><td>"
        "<a href='https://example.org/r/1'>Role A</a></td></tr></table></body></html>"
    )
    LISTING_STRATEGY.set(None)
    reader = GeneralReader(crawler)
    result = await reader.read(Response(200, html), {"careers_url": "https://example.org"})
    assert result.strategy
    assert LISTING_STRATEGY.get() == result.strategy