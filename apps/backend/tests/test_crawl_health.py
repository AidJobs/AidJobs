"""W-39 PR3: daily crawl-health composition, claim, and send (D1)."""
from __future__ import annotations

import inspect
from datetime import date, datetime, timezone
from unittest.mock import MagicMock

from app import crawl_health as ch
from orchestrator import CrawlerOrchestrator


def _row(**kwargs):
    base = {
        "org_name": "Example",
        "status": "active",
        "org_type": "un",
        "crawl_frequency_days": 3,
        "next_run_at": None,
        "last_crawl_status": "ok",
        "last_crawl_message": "Found 10",
        "listing_complete": True,
        "listing_stop": None,
        "counted": True,
        "matched_active": 10,
        "active_at_start": 10,
    }
    base.update(kwargs)
    return base


def test_classify_failed_partial_refused_overdue_half_matched():
    now = datetime(2026, 11, 22, 12, 0, tzinfo=timezone.utc)
    overdue_run = datetime(2026, 11, 20, 0, 0, tzinfo=timezone.utc)  # > 0.5d for un
    rows = [
        _row(org_name="FailedOrg", last_crawl_status="failed", listing_complete=None),
        _row(org_name="PartialOrg", last_crawl_status="warn", listing_complete=False),
        _row(
            org_name="RefusedOrg",
            last_crawl_status="failed",
            last_crawl_message="refused: HTTP 202 (AWS WAF challenge)",
            listing_complete=None,
        ),
        _row(org_name="OverdueOrg", next_run_at=overdue_run, org_type="un"),
        _row(
            org_name="HalfOrg",
            listing_complete=True,
            counted=False,
            matched_active=2,
            active_at_start=10,
        ),
        _row(org_name="DeletedOrg", status="deleted", last_crawl_status="failed"),
    ]
    buckets = ch.classify_sources(rows, now=now)
    assert buckets["failed"] == ["FailedOrg", "RefusedOrg"]
    assert "PartialOrg" in buckets["partial"]
    assert buckets["refused_challenge"] == ["RefusedOrg"]
    assert any(item.startswith("OverdueOrg") for item in buckets["overdue"])
    assert any(item.startswith("HalfOrg") for item in buckets["half_matched"])
    assert "DeletedOrg" not in str(buckets)


def test_compose_message_lists_none_when_empty():
    text = ch.compose_message(
        {
            "failed": [],
            "partial": ["Oxfam GB"],
            "refused_challenge": [],
            "overdue": [],
            "half_matched": [],
        },
        day=date(2026, 11, 22),
    )
    assert "AidJobs crawl health — 2026-11-22 UTC" in text
    assert "Partial (listing incomplete or warn):\n  - Oxfam GB" in text
    assert "Failed:\n  (none)" in text
    assert "No crawl-health issues" not in text


def test_compose_message_all_clear():
    text = ch.compose_message(
        {k: [] for k in ("failed", "partial", "refused_challenge", "overdue", "half_matched")},
        day=date(2026, 11, 22),
    )
    assert "No crawl-health issues for active sources today." in text


def test_run_crawl_health_skips_when_day_already_claimed(monkeypatch):
    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    cur.fetchone.return_value = None  # ON CONFLICT DO NOTHING

    assert ch.run_crawl_health_once(conn) is None
    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()


def test_run_crawl_health_log_only_without_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("AIDJOBS_HEALTH_TO", raising=False)
    monkeypatch.setattr(ch, "utc_today", lambda: date(2026, 11, 22))
    monkeypatch.setattr(ch, "load_source_health_rows", lambda cur: [])
    monkeypatch.setattr(
        ch,
        "send_resend",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("must not send")),
    )

    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    # claim returns a row, then finish_claim updates
    cur.fetchone.return_value = {"attempted_on": date(2026, 11, 22)}

    result = ch.run_crawl_health_once(conn)
    assert result["delivery"] == "log_only"
    assert result["http_status"] is None
    conn.commit.assert_called()
    # finish_claim should set delivery=log_only
    update_sql = cur.execute.call_args_list[-1][0][0]
    assert "UPDATE crawl_health_mail" in update_sql
    assert cur.execute.call_args_list[-1][0][1][0] == "log_only"


def test_run_crawl_health_sent_logs_status_only(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key_not_real_0123456789")
    monkeypatch.setenv("AIDJOBS_HEALTH_TO", "ops@example.org")
    monkeypatch.setattr(ch, "utc_today", lambda: date(2026, 11, 22))
    monkeypatch.setattr(ch, "load_source_health_rows", lambda cur: [])
    monkeypatch.setattr(ch, "send_resend", lambda **kwargs: 200)

    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    cur.fetchone.return_value = {"attempted_on": date(2026, 11, 22)}

    result = ch.run_crawl_health_once(conn)
    assert result["delivery"] == "sent"
    assert result["http_status"] == 200
    assert cur.execute.call_args_list[-1][0][1][0] == "sent"
    assert cur.execute.call_args_list[-1][0][1][1] == 200


def test_run_crawl_health_provider_failure_still_claims_day(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key_not_real_0123456789")
    monkeypatch.setenv("AIDJOBS_HEALTH_TO", "ops@example.org")
    monkeypatch.setattr(ch, "utc_today", lambda: date(2026, 11, 22))
    monkeypatch.setattr(ch, "load_source_health_rows", lambda cur: [])
    monkeypatch.setattr(ch, "send_resend", lambda **kwargs: 429)

    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    cur.fetchone.return_value = {"attempted_on": date(2026, 11, 22)}

    result = ch.run_crawl_health_once(conn)
    assert result["delivery"] == "failed"
    assert result["http_status"] == 429
    conn.commit.assert_called()


def test_send_resend_never_returns_body(monkeypatch):
    class _Resp:
        status = 202

        def read(self):
            return b'{"id":"secret-body"}'

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(ch.request, "urlopen", lambda *a, **k: _Resp())
    assert ch.send_resend(
        api_key="re_x",
        to_addr="a@b.c",
        from_addr=ch.DEFAULT_FROM,
        subject="s",
        text="t",
    ) == 202


def test_scheduler_calls_crawl_health_without_stopping_on_error():
    source = inspect.getsource(CrawlerOrchestrator.scheduler_loop)
    assert "crawl_health_once" in source
    assert "Crawl-health error" in source
