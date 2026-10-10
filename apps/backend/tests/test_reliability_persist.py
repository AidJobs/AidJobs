"""RSS and API persistence failures must surface. Healthy empty saves stay quiet."""
import inspect

import pytest

from crawler_v2.api_crawler import SimpleAPICrawler
from crawler_v2.rss_crawler import SimpleRSSCrawler


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


def _crawler(cls, conn):
    crawler = cls("postgresql://example")
    crawler._get_db_conn = lambda: conn
    return crawler


@pytest.mark.parametrize("cls", [SimpleRSSCrawler, SimpleAPICrawler])
def test_save_jobs_rolls_back_and_reraises(cls):
    conn = RaisingConn()
    crawler = _crawler(cls, conn)
    job = {"title": "Officer", "apply_url": "https://example.org/jobs/1", "admitted": True}
    with pytest.raises(RuntimeError, match="persist failed"):
        crawler.save_jobs([job], "src-1", "Example")
    assert conn.rolled_back is True
    assert conn.closed is True


@pytest.mark.parametrize("cls", [SimpleRSSCrawler, SimpleAPICrawler])
def test_empty_save_jobs_returns_before_sql(cls):
    crawler = cls("postgresql://example")

    def connect():
        raise AssertionError("empty save must not open a connection")

    crawler._get_db_conn = connect
    assert crawler.save_jobs([], "src-1", "Example") == {
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
    }


def test_success_status_and_found_stay_pre_admission():
    for cls in (SimpleRSSCrawler, SimpleAPICrawler):
        source = inspect.getsource(cls.crawl_source)
        assert "'ok' if jobs else 'warn'" in source
        assert "'found': len(jobs)" in source
