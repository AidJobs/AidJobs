"""Tests for W-40 PR 2: lifecycle columns on crawl logs and read-only crawl review."""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from psycopg2 import errors as psycopg2_errors

from main import app
from tests.signed_in import session_headers


class _FakeCursor:
    def __init__(self, responses):
        self._responses = list(responses)
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        if self._responses and isinstance(self._responses[0], Exception):
            raise self._responses.pop(0)

    def fetchone(self):
        return self._responses.pop(0) if self._responses else None

    def fetchall(self):
        return self._responses.pop(0) if self._responses else []


class _FakeConn:
    def __init__(self, responses):
        self.cursor_obj = _FakeCursor(responses)
        self.rolled_back = False
        self.closed = False

    def cursor(self, cursor_factory=None):
        return self.cursor_obj

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def test_crawl_review_requires_admin():
    client = TestClient(app)
    res = client.get(f"/api/admin/crawl/review/{uuid.uuid4()}")
    assert res.status_code == 401


def test_crawl_logs_include_lifecycle_columns(monkeypatch):
    log_id = uuid.uuid4()
    source_id = uuid.uuid4()
    ran_at = datetime(2026, 11, 27, 10, 0, 0, tzinfo=timezone.utc)

    fake_logs = [
        {
            "id": log_id,
            "source_id": source_id,
            "org_name": "UNICEF",
            "careers_url": "https://jobs.unicef.org/en-us/listing/",
            "found": 209,
            "inserted": 5,
            "updated": 10,
            "skipped": 194,
            "status": "ok",
            "message": "Found 209 jobs",
            "ran_at": ran_at,
            "duration_ms": 12400,
            "active_at_start": 204,
            "listing_complete": True,
            "listing_expected": 209,
            "listing_stop": None,
            "valid_count": 209,
            "failed_saves": 0,
            "unrecorded": 0,
            "matched_active": 200,
            "observed": 209,
            "counted": True,
            "expired": 4,
            "returned": 1,
        },
        {
            "id": uuid.uuid4(),
            "source_id": source_id,
            "org_name": "UNICEF",
            "careers_url": "https://jobs.unicef.org/en-us/listing/",
            "found": 120,
            "inserted": 120,
            "updated": 0,
            "skipped": 0,
            "status": "warn",
            "message": "Legacy row without lifecycle columns",
            "ran_at": ran_at,
            "duration_ms": None,
        },
    ]
    fake_counts = [{"source_id": source_id, "actual_job_count": 205}]
    conn = _FakeConn([fake_logs, fake_counts])

    headers = session_headers(monkeypatch)
    client = TestClient(app)
    with patch("app.crawler_admin.get_db_conn", return_value=conn):
        res = client.get("/api/admin/crawl/logs?limit=10", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert len(body["data"]) == 2

    first = body["data"][0]
    assert first["listing_complete"] is True
    assert first["listing_expected"] == 209
    assert first["listing_stop"] is None
    assert first["active_at_start"] == 204
    assert first["valid_count"] == 209
    assert first["failed_saves"] == 0
    assert first["unrecorded"] == 0
    assert first["matched_active"] == 200
    assert first["observed"] == 209
    assert first["counted"] is True
    assert first["expired"] == 4
    assert first["returned"] == 1
    assert first["actual_job_count"] == 205

    legacy = body["data"][1]
    assert legacy["listing_complete"] is None
    assert legacy["listing_expected"] is None
    assert legacy["counted"] is None
    assert legacy["expired"] is None


def test_crawl_review_invalid_uuid_returns_404(monkeypatch):
    headers = session_headers(monkeypatch)
    client = TestClient(app)
    res = client.get("/api/admin/crawl/review/not-a-uuid", headers=headers)
    assert res.status_code == 404


def test_crawl_review_missing_log_returns_404(monkeypatch):
    conn = _FakeConn([None])
    headers = session_headers(monkeypatch)
    client = TestClient(app)
    with patch("app.crawler_admin.get_db_conn", return_value=conn):
        res = client.get(f"/api/admin/crawl/review/{uuid.uuid4()}", headers=headers)
    assert res.status_code == 404


def test_crawl_review_returns_lifecycle_rejections_and_fill_rates(monkeypatch):
    log_id = uuid.uuid4()
    source_id = uuid.uuid4()
    ran_at = datetime(2026, 11, 27, 12, 0, 0, tzinfo=timezone.utc)

    log_row = {
        "id": log_id,
        "source_id": source_id,
        "org_name": "ICRC",
        "careers_url": "https://careers.icrc.org/go/Global-Opportunities/8821501/",
        "source_status": "active",
        "found": 32,
        "inserted": 2,
        "updated": 30,
        "skipped": 0,
        "status": "ok",
        "message": "Found 32 jobs",
        "ran_at": ran_at,
        "duration_ms": 45000,
        "active_at_start": 30,
        "listing_complete": True,
        "listing_expected": 32,
        "listing_stop": None,
        "valid_count": 32,
        "failed_saves": 0,
        "unrecorded": 0,
        "matched_active": 30,
        "observed": 32,
        "counted": True,
        "expired": 0,
        "returned": 0,
    }
    failed_rows = [
        {"operation": "validation", "error": "Missing title"},
        {"operation": "validation", "error": "Missing title"},
        {"operation": "insert", "error": "duplicate key value"},
    ]
    conn = _FakeConn([log_row, failed_rows])

    fake_quality = {
        "source_id": str(source_id),
        "total_jobs": 35,
        "quality_score": 98.5,
        "fill_rates": {
            "description": {"filled": 35, "total": 35, "rate": 100.0},
            "deadline": {"filled": 32, "total": 35, "rate": 91.4},
        },
    }

    headers = session_headers(monkeypatch)
    client = TestClient(app)
    with (
        patch("app.crawler_admin.get_db_conn", return_value=conn),
        patch("app.crawler_admin.get_db_url", return_value="postgresql://fake"),
        patch(
            "app.data_quality.DataQualityValidator.get_source_quality_report",
            return_value=fake_quality,
        ),
    ):
        res = client.get(f"/api/admin/crawl/review/{log_id}", headers=headers)

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    data = body["data"]
    assert data["org_name"] == "ICRC"
    assert data["found"] == 32
    assert data["listing_expected"] == 32
    assert data["listing_complete"] is True
    assert data["counted"] is True

    rej = data["rejections"]
    assert rej["total_in_window"] == 3
    assert rej["by_reason"] == [
        {"operation": "validation", "reason": "Missing title", "count": 2},
        {"operation": "insert", "reason": "duplicate key value", "count": 1},
    ]
    assert rej["window_start"] is not None
    assert rej["window_end"] is not None
    assert "no crawl run ID" in rej["attribution_note"]

    assert data["fill_rates"]["deadline"]["rate"] == 91.4
    assert data["fill_rates_total_jobs"] == 35
    assert "expired jobs" in data["fill_rates_note"]


def test_crawl_review_handles_missing_failed_inserts_table(monkeypatch):
    log_id = uuid.uuid4()
    source_id = uuid.uuid4()
    ran_at = datetime(2026, 11, 27, 12, 0, 0, tzinfo=timezone.utc)

    log_row = {
        "id": log_id,
        "source_id": source_id,
        "org_name": "Oxfam GB",
        "careers_url": "https://jobs.oxfam.org.uk/jobs/home/",
        "source_status": "active",
        "found": 3,
        "inserted": 1,
        "updated": 2,
        "skipped": 0,
        "status": "ok",
        "message": None,
        "ran_at": ran_at,
        "duration_ms": None,
    }
    conn = _FakeConn(
        [log_row, psycopg2_errors.UndefinedTable("relation failed_inserts does not exist")]
    )
    fake_quality = {"total_jobs": 3, "quality_score": 100.0, "fill_rates": {}}

    headers = session_headers(monkeypatch)
    client = TestClient(app)
    with (
        patch("app.crawler_admin.get_db_conn", return_value=conn),
        patch("app.crawler_admin.get_db_url", return_value="postgresql://fake"),
        patch(
            "app.data_quality.DataQualityValidator.get_source_quality_report",
            return_value=fake_quality,
        ),
    ):
        res = client.get(f"/api/admin/crawl/review/{log_id}", headers=headers)

    assert res.status_code == 200
    data = res.json()["data"]
    assert data["rejections"]["total_in_window"] == 0
    assert data["rejections"]["by_reason"] == []
    assert conn.rolled_back is True
