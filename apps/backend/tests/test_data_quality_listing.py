"""UX-04: listing-page classification in the Data Quality reports."""
import inspect
import re

import pytest

import app.data_quality as data_quality
from app.data_quality import DataQualityValidator, is_listing_url

JOBS = [
    # Real shapes from the live database, 24 October 2026.
    "https://jobs.unicef.org/en-us/job/596262/consultant-elaboration-de-la-politique",
    "https://careers.icrc.org/job/Geneva-Field-Officer/1234567801/",
    "https://jobs.oxfam.org.uk/jobs/vacancy/finance-officer-south-sudan/12345/description/",
    # A job link that ends in a listing-like word stays a job.
    "https://example.org/job/12345/search",
    "https://example.org/jobs/98765/all",
    "https://example.org/vacancy/REQ-4411/home",
    # Capitals, query strings, trailing slashes, and page extensions do not change the answer.
    "HTTPS://JOBS.UNICEF.ORG/EN-US/JOB/596262/OFFICER",
    "https://jobs.unicef.org/en-us/job/596262/officer?src=rss&page=2",
    "https://careers.icrc.org/job/Geneva-Field-Officer/1234567801",
    "https://example.org/positions/a1b2c3d4e5f6/view.html",
]

LISTINGS = [
    # Real listing pages.
    "https://jobs.unicef.org/en-us/listing/",
    "https://jobs.unicef.org/en-us/listing/?page=7&page-items=20",
    "https://jobs.oxfam.org.uk/jobs/home/",
    "https://www.unicef.org/careers",
    "https://www.unicef.org/careers/internships",
    # No path at all.
    "https://careers.icrc.org",
    "https://careers.icrc.org/",
    "https://example.org/?q=officer",
    # A job marker with no identifier after it is not a job.
    "https://example.org/job/search/",
    "https://example.org/jobs/",
    "https://example.org/JOBS/ALL",
    "https://example.org/careers.html",
    "https://example.org/en/vacancies/index.php",
]

NOT_LISTINGS = [
    # "jobs" or "careers" in the host name alone proves nothing.
    "https://jobs.example.org/about-us/our-story",
    "https://careers.example.org/news/annual-report",
    # Pages that are neither a job nor a listing are not flagged.
    "https://www.unicef.org/careers/working-in-a-humanitarian-crisis",
    "https://careers.icrc.org/go/Global-Opportunities/8821501/",
    "https://twitter.com/unicef",
]

UNCLASSIFIABLE = [
    None, "", "   ", "not a url", "/jobs/", "jobs.unicef.org/en-us/listing/",
    "javascript:void(0)", "mailto:jobs@example.org", "https://", "http://[::1",
]


@pytest.mark.parametrize("url", JOBS)
def test_job_links_are_not_listings(url):
    assert is_listing_url(url) is False


@pytest.mark.parametrize("url", LISTINGS)
def test_listing_pages_are_listings(url):
    assert is_listing_url(url) is True


@pytest.mark.parametrize("url", NOT_LISTINGS)
def test_other_pages_and_host_names_are_not_listings(url):
    assert is_listing_url(url) is False


@pytest.mark.parametrize("url", UNCLASSIFIABLE)
def test_values_that_are_not_web_addresses_are_not_classified(url):
    assert is_listing_url(url) is False


def test_the_per_job_check_uses_the_rule():
    validator = DataQualityValidator("unused")
    job = {"title": "Finance Officer", "canonical_hash": "abcdef123456"}
    _, errors = validator.validate_job({**job, "apply_url": JOBS[0]})
    assert not any("listing page" in e for e in errors)
    _, errors = validator.validate_job({**job, "apply_url": LISTINGS[0]})
    assert any("listing page" in e for e in errors)


class _Cursor:
    """Answers the report queries from fixed rows; any write would fail the test."""

    def __init__(self, rows):
        self.rows = rows
        self.last = ""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, sql, params=None):
        assert not re.search(r"\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b", sql.upper())
        self.last = " ".join(sql.split())

    def fetchone(self):
        if "FROM sources" in self.last:
            return {"id": "s1", "org_name": "UNICEF", "careers_url": "https://jobs.unicef.org/en-us/listing/"}
        if "COUNT(DISTINCT source_id)" in self.last:
            active = [r for r in self.rows if r["status"] == "active"]
            return {"total_sources": 1, "total_jobs": len(active), "unique_urls": len(active),
                    "null_urls": sum(1 for r in active if r["apply_url"] is None)}
        return {"total_jobs": len(self.rows), "unique_urls": len(self.rows),
                "null_urls": sum(1 for r in self.rows if r["apply_url"] is None),
                "missing_titles": 0, "short_titles": 0}

    def fetchall(self):
        if self.last.startswith("SELECT apply_url, COUNT(*)"):
            return []
        if "status = 'active'" in self.last:
            return [r for r in self.rows if r["status"] == "active"]
        return list(self.rows)


class _Conn:
    def __init__(self, rows):
        self.rows = rows

    def cursor(self, cursor_factory=None):
        return _Cursor(self.rows)

    def close(self):
        pass


ROWS = (
    [{"source_id": "s1", "apply_url": u, "status": "active"} for u in JOBS[:3]]
    + [{"source_id": "s1", "apply_url": LISTINGS[3], "status": "active"}]
    + [{"source_id": "s1", "apply_url": None, "status": "active"}]
)


def test_both_reports_count_listing_pages_with_the_rule(monkeypatch):
    monkeypatch.setattr(DataQualityValidator, "_get_db_conn", lambda self: _Conn(ROWS))
    validator = DataQualityValidator("unused")

    source = validator.get_source_quality_report("s1")
    assert source["listing_page_urls"] == 1
    assert source["null_urls"] == 1

    report = validator.get_global_quality_report()
    assert report["listing_page_urls"] == 1
    assert report["top_issue_sources"] == [{"source_id": "s1", "issue_count": 2}]
    # 5 jobs: one without a link (30 points x 1/5) and one listing page (25 points x 1/5).
    assert report["global_quality_score"] == round(100 - 30 / 5 - 25 / 5, 2)


def test_reports_no_longer_match_text_in_sql():
    source = inspect.getsource(data_quality.DataQualityValidator)
    assert "LIKE '%/jobs%'" not in source
    assert "LIKE '%/careers%'" not in source
