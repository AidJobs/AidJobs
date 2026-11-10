"""A crawl run's lifecycle record (W-06): its completeness and whether it counts. No database."""
import asyncio
from datetime import datetime, timezone

import pytest

from contracts.identity import algorithm_a, algorithm_b
from contracts.lifecycle import counting_crawl, run_lifecycle
from contracts.persist import LOAD_COLUMNS, created_ids, persist_candidate
from crawler_v2.run_handle import RunHandle

TITLE = "Programme Officer"
URL = "https://example.org/jobs/1"
WHEN = datetime(2026, 11, 11, tzinfo=timezone.utc)
COMPLETE = {"pages": 4, "expected": 266, "complete": True, "stop": "no More Jobs link"}


def _counts(**overrides):
    rule = {
        "listing_complete": True,
        "valid": 266,
        "failed": 0,
        "unrecorded": 0,
        "active_at_start": 240,
        "matched_active": 232,
    }
    rule.update(overrides)
    return counting_crawl(**rule)


# ---------------------------------------------------------------------------
# The rule (growth plan, section 4.3; contract §6).
# ---------------------------------------------------------------------------


def test_a_complete_crawl_that_matched_its_catalogue_counts():
    assert _counts() is True


@pytest.mark.parametrize("complete", [False, None, "true", 1])
def test_only_a_listing_read_completely_counts(complete):
    assert _counts(listing_complete=complete) is False


@pytest.mark.parametrize("valid", [0, None, -1])
def test_a_complete_crawl_with_no_valid_job_never_counts(valid):
    assert _counts(valid=valid, active_at_start=0, matched_active=0) is False


@pytest.mark.parametrize("failed", [1, 5])
def test_a_complete_crawl_where_any_job_failed_to_save_does_not_count(failed):
    assert _counts(failed=failed) is False


@pytest.mark.parametrize("unrecorded", [1, 3])
def test_a_complete_crawl_with_a_listed_row_whose_sighting_was_not_recorded_does_not_count(
    unrecorded,
):
    assert _counts(unrecorded=unrecorded) is False


def test_fewer_than_half_of_the_open_jobs_matched_does_not_count():
    assert _counts(active_at_start=240, matched_active=119) is False
    assert _counts(active_at_start=3, matched_active=1) is False


def test_exactly_half_matched_counts():
    assert _counts(active_at_start=240, matched_active=120) is True
    assert _counts(active_at_start=4, matched_active=2) is True


def test_a_source_with_no_open_jobs_at_the_start_counts_on_its_valid_rows():
    assert _counts(active_at_start=0, matched_active=0) is True


def test_a_run_whose_start_was_not_recorded_never_counts():
    assert _counts(active_at_start=None) is False


# ---------------------------------------------------------------------------
# The record the run's finish stores.
# ---------------------------------------------------------------------------


def test_the_record_of_a_complete_crawl():
    result = {
        "status": "ok",
        "counts": {"found": 266, "inserted": 34, "updated": 232, "failed": 0},
        "listing": COMPLETE,
        "valid": 266,
    }
    assert run_lifecycle(result, active_at_start=240, matched_active=232) == {
        "listing_complete": True,
        "listing_expected": 266,
        "listing_stop": "no More Jobs link",
        "valid_count": 266,
        "failed_saves": 0,
        "unrecorded": 0,
        "matched_active": 232,
        "counted": True,
    }


def test_unrecorded_rows_are_recorded_and_stop_the_crawl_counting():
    result = {"counts": {"failed": 0, "unrecorded": 1}, "listing": COMPLETE, "valid": 266}
    record = run_lifecycle(result, active_at_start=240, matched_active=240)
    assert record["unrecorded"] == 1
    assert record["counted"] is False


def test_the_status_does_not_decide():
    result = {"status": "warn", "counts": {}, "listing": COMPLETE, "valid": 3}
    assert run_lifecycle(result, active_at_start=3, matched_active=3)["counted"] is True


@pytest.mark.parametrize(
    "result",
    [
        {"status": "fail", "message": "Timed out after 15 minutes", "counts": {}},
        {"status": "interrupted", "counts": {}},
        {"status": "ok", "counts": {"found": 32}, "listing": None, "valid": 12},
        {"status": "ok", "counts": {}, "valid": 12},
    ],
)
def test_a_result_without_a_listing_report_is_not_complete_and_never_counts(result):
    record = run_lifecycle(result, active_at_start=12, matched_active=12)
    assert record["listing_complete"] is None
    assert record["listing_expected"] is None
    assert record["listing_stop"] is None
    assert record["counted"] is False


def test_a_partial_listing_is_recorded_and_does_not_count():
    partial = {"pages": 6, "expected": 270, "complete": False, "stop": "refused: HTTP 202"}
    result = {"status": "warn", "counts": {"failed": 0}, "listing": partial, "valid": 120}
    record = run_lifecycle(result, active_at_start=200, matched_active=110)
    assert record["listing_complete"] is False
    assert record["listing_expected"] == 270
    assert record["listing_stop"] == "refused: HTTP 202"
    assert record["counted"] is False


def test_save_failures_are_recorded_and_stop_the_crawl_counting():
    result = {"status": "warn", "counts": {"failed": 2}, "listing": COMPLETE, "valid": 266}
    record = run_lifecycle(result, active_at_start=240, matched_active=240)
    assert record["failed_saves"] == 2
    assert record["counted"] is False


@pytest.mark.parametrize("expected", [None, True, "266", 266.0, -1, 2**31, 10**12])
def test_a_stated_total_is_kept_only_as_a_whole_number_the_column_can_hold(expected):
    listing = {**COMPLETE, "expected": expected}
    result = {"counts": {}, "listing": listing, "valid": 1}
    record = run_lifecycle(result, active_at_start=0, matched_active=0)
    assert record["listing_expected"] is None
    assert record["counted"] is True, "the stated total does not decide"


@pytest.mark.parametrize("expected", [0, 266, 2**31 - 1])
def test_a_stated_total_within_the_column_is_kept(expected):
    result = {"counts": {}, "listing": {**COMPLETE, "expected": expected}, "valid": 1}
    record = run_lifecycle(result, active_at_start=0, matched_active=0)
    assert record["listing_expected"] == expected


@pytest.mark.parametrize("complete", ["true", 1, "yes"])
def test_a_completeness_that_is_not_true_or_false_is_stored_empty(complete):
    result = {"counts": {}, "listing": {**COMPLETE, "complete": complete}, "valid": 1}
    record = run_lifecycle(result, active_at_start=0, matched_active=0)
    assert record["listing_complete"] is None
    assert record["counted"] is False


class _RecordingCursor:
    def __init__(self):
        self.statements = []

    def execute(self, sql, params=None):
        self.statements.append((" ".join(sql.split()), params))


def test_the_stored_stop_text_is_masked_and_capped():
    from orchestrator import CrawlerOrchestrator

    marker = "z" * 16
    stop = f"refused: HTTP 202 on https://jobs.example.org/?page=7&token={marker} " + "x" * 400
    cursor = _RecordingCursor()
    result = {"counts": {}, "listing": {**COMPLETE, "stop": stop}, "valid": 1}
    CrawlerOrchestrator("postgresql://example")._record_lifecycle(
        cursor, "run-1", result, active_at_start=0
    )
    (sql, params), = cursor.statements
    assert sql.startswith("UPDATE crawl_logs SET listing_complete = %s")
    stored = params[2]
    assert marker not in stored
    assert "<redacted>" in stored
    assert len(stored) == 300
    assert params[-1] == "run-1"


# ---------------------------------------------------------------------------
# The writer reports the open jobs a crawl matched.
# ---------------------------------------------------------------------------


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self._sql = ""

    def execute(self, sql, params=None):
        self._sql = sql

    def fetchall(self):
        if self._sql.lstrip().upper().startswith("SELECT"):
            return list(self.rows)
        return []


def _stored(**overrides):
    row = {name: None for name in LOAD_COLUMNS}
    row.update(
        {
            "id": "row-1",
            "canonical_hash": algorithm_a(TITLE, URL),
            "title": TITLE,
            "apply_url": URL,
            "status": "active",
            "source_id": "src-1",
            "org_name": "Example",
        }
    )
    row.update(overrides)
    return row


def _persist(rows, *, source_id="src-1", **candidate):
    seen = []
    outcome = persist_candidate(
        FakeCursor(rows),
        {"title": TITLE, "apply_url": URL, "admitted": True, **candidate},
        observed_at=WHEN,
        heuristics=False,
        source_id=source_id,
        seen=seen,
    )
    return outcome, seen


def test_an_unchanged_open_job_is_reported_seen():
    assert _persist([_stored()]) == ("unchanged", ["row-1"])


def test_an_updated_open_job_is_reported_seen():
    assert _persist([_stored()], location_raw="Nairobi, Kenya") == ("updated", ["row-1"])


def test_a_hidden_job_seen_again_is_not_reported():
    assert _persist([_stored(deleted_at=WHEN)]) == ("seen_again", [])


def test_an_expired_job_matched_is_not_reported():
    outcome, seen = _persist([_stored(status="expired")])
    assert outcome == "unchanged"
    assert seen == []


def test_a_new_job_a_rejected_row_and_a_conflict_are_not_reported():
    assert _persist([]) == ("created", [])
    rejected = []
    assert persist_candidate(
        FakeCursor([_stored()]),
        {"title": TITLE, "apply_url": URL},
        observed_at=WHEN,
        heuristics=False,
        seen=rejected,
    ) == "rejected"
    assert rejected == []
    two = [_stored(), _stored(id="row-2", canonical_hash=algorithm_b(TITLE, URL, None))]
    assert _persist(two) == ("identity_conflict", [])


def test_another_sources_job_matched_by_identity_is_not_reported():
    outcome, seen = _persist([_stored(source_id="src-other")])
    assert outcome == "unchanged"
    assert seen == []


def test_a_row_without_a_source_reports_nothing():
    assert _persist([_stored()], source_id=None) == ("unchanged", [])


def test_created_ids_are_read_from_what_the_writer_records():
    recorded = [
        {"outcome": "created", "job_id": "new-1"},
        {"outcome": "updated", "job_id": "old-1"},
        {"outcome": "seen_again", "job_id": "hidden-1"},
        {"outcome": "created", "job_id": "new-2"},
    ]
    assert created_ids(recorded) == ["new-1", "new-2"]
    assert created_ids([]) == []
    assert created_ids(None) == []


def test_without_a_list_the_writer_behaves_as_before():
    outcome = persist_candidate(
        FakeCursor([_stored()]),
        {"title": TITLE, "apply_url": URL, "admitted": True},
        observed_at=WHEN,
        heuristics=False,
    )
    assert outcome == "unchanged"


# ---------------------------------------------------------------------------
# The run handle keeps the matched ids of every completed save, once each.
# ---------------------------------------------------------------------------


def test_the_run_handle_collects_matched_ids_across_saves_once_each():
    batches = iter([["a", "b"], ["b", "c"]])

    def save_jobs(jobs, source_id, org_name, *, run_token, loop):
        return {"inserted": 0, "updated": 1, "skipped": 0, "failed": 0,
                "seen_active": next(batches)}

    def failing(jobs, source_id, org_name, *, run_token, loop):
        raise RuntimeError("database down")

    async def scenario():
        run = RunHandle("run-1", "src-1")
        await run.save(save_jobs, [], "src-1", "Example")
        await run.save(save_jobs, [], "src-1", "Example")
        with pytest.raises(RuntimeError):
            await run.save(failing, [], "src-1", "Example")
        await run.wait_for_saves()
        return run

    run = asyncio.run(scenario())
    assert run.seen_active == {"a", "b", "c"}
    assert run.saved["updated"] == 2
    assert run.matched_active() == 3


def test_jobs_the_run_created_are_not_matches_of_the_catalogue():
    def save_jobs(jobs, source_id, org_name, *, run_token, loop):
        return {"inserted": 1, "updated": 0, "skipped": 0, "failed": 0,
                "seen_active": ["old-1", "new-1"], "created_ids": ["new-1"]}

    async def scenario():
        run = RunHandle("run-1", "src-1")
        await run.save(save_jobs, [], "src-1", "Example")
        return run

    run = asyncio.run(scenario())
    assert run.created == {"new-1"}
    assert run.matched_active() == 1


def test_the_run_handle_adds_up_unrecorded_rows_across_saves():
    batches = iter([1, 2])

    def save_jobs(jobs, source_id, org_name, *, run_token, loop):
        return {"inserted": 0, "updated": 0, "skipped": 0, "failed": 0,
                "unrecorded": next(batches)}

    async def scenario():
        run = RunHandle("run-1", "src-1")
        await run.save(save_jobs, [], "src-1", "Example")
        await run.save(save_jobs, [], "src-1", "Example")
        return run

    assert asyncio.run(scenario()).saved["unrecorded"] == 3


def test_a_save_that_reports_no_matches_adds_none():
    def save_jobs(jobs, source_id, org_name, *, run_token, loop):
        return {"inserted": 1, "updated": 0, "skipped": 0, "failed": 0}

    async def scenario():
        run = RunHandle("run-1", "src-1")
        await run.save(save_jobs, [], "src-1", "Example")
        return run

    assert asyncio.run(scenario()).seen_active == set()
