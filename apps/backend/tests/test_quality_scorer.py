"""The crawl's quality scorer (core/data_quality.py) scores every job, deadline or not."""
from datetime import date, timedelta

from core.data_quality import DataQualityScorer

JOB = {"title": "Programme Officer", "apply_url": "https://example.org/jobs/1",
       "org_name": "Example", "location_raw": "Kenya", "country_iso": "KE"}


def test_a_job_with_a_deadline_is_scored():
    result = DataQualityScorer().score_job(dict(JOB, deadline="2099-12-31"))
    assert result["factors"]["deadline"] == 1.0
    assert result["score"] == 0.9
    assert result["grade"] == "high"
    assert result["issues"] == []


def test_a_stored_date_counts_as_a_deadline():
    result = DataQualityScorer().score_job(dict(JOB, deadline=date(2099, 12, 31)))
    assert result["factors"]["deadline"] == 1.0


def test_a_past_deadline_is_an_issue():
    past = (date.today() - timedelta(days=1)).isoformat()
    result = DataQualityScorer().score_job(dict(JOB, deadline=past))
    assert "Deadline in the past" in result["issues"]
    assert result["needs_review"] is True


def test_an_unreadable_deadline_text_is_not_an_error():
    result = DataQualityScorer().score_job(dict(JOB, deadline="2099-31-12"))
    assert result["factors"]["deadline"] == 1.0
    assert "Deadline in the past" not in result["issues"]


def test_a_stored_row_with_empty_columns_is_scored():
    row = {"title": "Programme Officer", "apply_url": "https://example.org/jobs/1",
           "org_name": None, "location_raw": None, "description_snippet": None,
           "deadline": None, "country": None, "country_iso": None}
    result = DataQualityScorer().score_job(row)
    assert result["score"] == 0.4
    assert set(result["missing_fields"]) >= {"location", "deadline", "description", "org_name"}
