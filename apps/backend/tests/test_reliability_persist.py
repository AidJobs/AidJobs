"""RSS and API persistence failures must surface. Healthy empty saves stay quiet."""
import inspect

import pytest

from contracts.run_ownership import OwnershipLost, save_failure_outcome
from crawler_v2.api_crawler import SimpleAPICrawler
from crawler_v2.rss_crawler import SimpleRSSCrawler
from crawler_v2.run_handle import RunHandle
from crawler_v2.simple_crawler import SimpleCrawler


class RaisingConn:
    def __init__(self):
        self.rolled_back = False
        self.closed = False

    def cursor(self):
        raise RuntimeError("persist failed")

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def _patch_shared_save(monkeypatch, conn):
    """W-35 3b: RSS/API save through SimpleCrawler.save_jobs; patch that connection."""
    monkeypatch.setattr(SimpleCrawler, "_get_db_conn", lambda self: conn)


@pytest.mark.parametrize("cls", [SimpleRSSCrawler, SimpleAPICrawler])
def test_save_jobs_rolls_back_and_reraises(cls, monkeypatch):
    conn = RaisingConn()
    _patch_shared_save(monkeypatch, conn)
    crawler = cls("postgresql://example")
    job = {"title": "Officer", "apply_url": "https://example.org/jobs/1", "admitted": True}
    with pytest.raises(RuntimeError, match="persist failed"):
        crawler.save_jobs([job], "src-1", "Example", run_token="run-1")
    assert conn.rolled_back is True
    assert conn.closed is True


@pytest.mark.parametrize("cls", [SimpleRSSCrawler, SimpleAPICrawler])
def test_empty_save_jobs_returns_before_sql(cls, monkeypatch):
    def connect(self):
        raise AssertionError("empty save must not open a connection")

    monkeypatch.setattr(SimpleCrawler, "_get_db_conn", connect)
    crawler = cls("postgresql://example")
    assert crawler.save_jobs([], "src-1", "Example", run_token="run-1") == {
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "failed": 0,
        "validated": 0,
    }


@pytest.mark.parametrize("cls", [SimpleRSSCrawler, SimpleAPICrawler])
def test_save_jobs_without_a_run_token_writes_nothing(cls, monkeypatch):
    def connect(self):
        raise AssertionError("a save without a token must not open a connection")

    monkeypatch.setattr(SimpleCrawler, "_get_db_conn", connect)
    crawler = cls("postgresql://example")
    job = {"title": "Officer", "apply_url": "https://example.org/jobs/1", "admitted": True}
    with pytest.raises(OwnershipLost):
        crawler.save_jobs([job], "src-1", "Example")


def test_a_raw_page_connection_failure_does_not_fail_the_crawl():
    from crawler_v2.simple_crawler import SimpleCrawler

    class Storage:
        def store(self, url, html, source_id):
            return "pages/1.html"

    crawler = SimpleCrawler("postgresql://example")
    crawler.html_storage = Storage()

    def unreachable():
        raise RuntimeError("connection refused")

    crawler._get_db_conn = unreachable
    assert crawler._record_raw_page("https://example.org/jobs", 200, "<html></html>", "s") is None


def test_every_job_failed_counts_only_the_jobs_that_reached_their_write():
    counts = {"inserted": 0, "failed": 8, "validated": 10, "attempted": 8}
    assert save_failure_outcome("ok", "Found 10 jobs", counts)[0] == "fail"
    counts = {"inserted": 1, "failed": 7, "validated": 10, "attempted": 8}
    status, message = save_failure_outcome("ok", "Found 10 jobs", counts)
    assert status == "warn" and "7 of 8 jobs failed to save" in message
    assert save_failure_outcome("ok", "Found 3 jobs", {"failed": 0, "validated": 3}) == (
        "ok",
        "Found 3 jobs",
    )


def test_a_run_handle_needs_its_token():
    for token in (None, ""):
        with pytest.raises(ValueError):
            RunHandle(token, "src-1")


def test_success_status_and_found_stay_pre_admission():
    # W-35 3b: status from _listing_outcome (empty → warn); found is still the listing size.
    for cls in (SimpleRSSCrawler, SimpleAPICrawler):
        source = inspect.getsource(cls.crawl_source)
        assert "_listing_outcome" in source
        assert '"found": len(jobs)' in source
