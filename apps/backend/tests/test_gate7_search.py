"""Gate 7 search projection. Fakes only: no live Postgres and no live Meilisearch."""
import asyncio
import inspect
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.search import SearchService
from app.search_projection import (
    commit_and_schedule,
    compose_public_page,
    project_committed_jobs,
    projection_actions,
    stale_document_ids,
)
from contracts.identity import algorithm_a, algorithm_b
from contracts.persist import LOAD_COLUMNS, persist_candidate

ROOT = Path(__file__).resolve().parents[1]
TITLE = "Programme Officer"
URL = "https://example.org/jobs/1"
WHEN = datetime(2026, 10, 5, tzinfo=timezone.utc)


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.statements = []
        self._sql = ""

    def execute(self, sql, params=None):
        self.statements.append((sql, params))
        self._sql = sql

    def fetchall(self):
        if self._sql.lstrip().upper().startswith("SELECT"):
            return list(self.rows)
        return []


class Conn:
    def __init__(self, fail=False):
        self.fail = fail
        self.committed = False

    def commit(self):
        if self.fail:
            raise RuntimeError("commit failed")
        self.committed = True


def _stored(**overrides):
    row = {name: None for name in LOAD_COLUMNS}
    row.update(
        {
            "id": "row-1",
            "canonical_hash": algorithm_a(TITLE, URL),
            "title": TITLE,
            "apply_url": URL,
            "status": "active",
        }
    )
    row.update(overrides)
    return row


def _candidate(**overrides):
    payload = {"title": TITLE, "apply_url": URL, "admitted": True}
    payload.update(overrides)
    return payload


def _record(cursor, **kwargs):
    recorded = []
    outcome = persist_candidate(
        cursor,
        _candidate(**kwargs),
        observed_at=WHEN,
        heuristics=False,
        recorded=recorded,
    )
    return outcome, recorded, cursor.statements


def test_projection_actions_follow_the_commit_outcome():
    project_ids, remove_ids = projection_actions(
        [
            {"outcome": "created", "job_id": "c"},
            {"outcome": "updated", "job_id": "u"},
            {"outcome": "seen_again", "job_id": "s"},
            {"outcome": "unchanged", "job_id": "n"},
            {"outcome": "rejected", "job_id": "r"},
            {"outcome": "identity_conflict", "job_id": "x"},
        ]
    )
    assert project_ids == ["c", "u"]
    assert remove_ids == ["s"]


def test_created_records_the_inserted_row_id():
    outcome, recorded, statements = _record(FakeCursor([]))
    assert outcome == "created"
    insert_params = next(params for sql, params in statements if sql.startswith("INSERT"))
    assert recorded == [{"outcome": "created", "job_id": str(insert_params[0])}]


def test_updated_and_seen_again_record_the_stored_row_id():
    updated, recorded, _statements = _record(
        FakeCursor([_stored(city="Nairobi")]),
        city="Mombasa",
        id="candidate-id",
    )
    assert updated == "updated"
    assert recorded == [{"outcome": "updated", "job_id": "row-1"}]

    seen, recorded, statements = _record(
        FakeCursor([_stored(deleted_at=WHEN, city="Nairobi")]),
        city="Mombasa",
        id="candidate-id",
    )
    assert seen == "seen_again"
    assert recorded == [{"outcome": "seen_again", "job_id": "row-1"}]
    assert all(not sql.startswith("INSERT") for sql, _params in statements)


def test_unchanged_rejected_and_conflict_are_not_projected():
    unchanged, recorded, _statements = _record(FakeCursor([_stored()]))
    assert unchanged == "unchanged"
    assert recorded == []

    rejected, recorded, statements = _record(
        FakeCursor([]),
        apply_url="https://placeholder.missing-url/abc",
    )
    assert rejected == "rejected"
    assert recorded == []
    assert statements == []

    first = _stored(id="row-1", canonical_hash=algorithm_a(TITLE, URL))
    second = _stored(id="row-2", canonical_hash=algorithm_b(TITLE, URL, "REF-1"))
    cursor = FakeCursor([first, second])
    outcome = persist_candidate(
        cursor,
        _candidate(),
        observed_at=WHEN,
        heuristics=True,
        reference="REF-1",
        recorded=(recorded := []),
    )
    assert outcome == "identity_conflict"
    assert recorded == []


def test_commit_happens_before_projection_is_scheduled():
    order = []
    conn = Conn()

    async def projector(project_ids, remove_ids):
        order.append(("project", conn.committed, list(project_ids), list(remove_ids)))

    async def run():
        import app.search_projection as projection

        original = projection.project_committed_jobs
        projection.project_committed_jobs = projector
        try:
            commit_and_schedule(
                conn,
                [{"outcome": "created", "job_id": "job-1"}],
            )
            await asyncio.sleep(0)
        finally:
            projection.project_committed_jobs = original

    asyncio.run(run())
    assert order == [("project", True, ["job-1"], [])]
    source = inspect.getsource(commit_and_schedule)
    assert source.index("conn.commit()") < source.index("schedule_after_commit")


def test_failed_commit_does_not_schedule_projection():
    called = []

    async def projector(project_ids, remove_ids):
        called.append(project_ids)

    async def run():
        import app.search_projection as projection

        original = projection.project_committed_jobs
        projection.project_committed_jobs = projector
        try:
            conn = Conn(fail=True)
            with pytest.raises(RuntimeError, match="commit failed"):
                commit_and_schedule(conn, [{"outcome": "updated", "job_id": "job-1"}])
            assert conn.committed is False
            await asyncio.sleep(0)
        finally:
            projection.project_committed_jobs = original

    asyncio.run(run())
    assert called == []


def test_projection_failure_does_not_raise_or_write_jobs():
    writes = []

    async def projector(project_ids, remove_ids):
        writes.append("ran")
        raise RuntimeError("meili down")

    async def run():
        import app.search_projection as projection

        original = projection.project_committed_jobs
        projection.project_committed_jobs = projector
        try:
            commit_and_schedule(Conn(), [{"outcome": "created", "job_id": "job-9"}])
            await asyncio.sleep(0)
        finally:
            projection.project_committed_jobs = original

    asyncio.run(run())
    assert writes == ["ran"]
    # The stand-in raised. The scheduled task swallowed it, so this test returned.
    source = inspect.getsource(project_committed_jobs)
    assert "UPDATE" not in source
    assert "DELETE FROM" not in source
    assert "INSERT" not in source
    committed = inspect.getsource(SearchService.project_committed)
    assert "UPDATE " not in committed
    assert "INSERT " not in committed
    assert "DELETE FROM" not in committed


def test_stale_meili_cannot_hide_or_expose_a_job():
    hidden = {"id": "suppressed", "title": "Old role"}
    visible = {"id": "new", "title": "New Role"}
    page = compose_public_page([hidden], set(), [visible], 20)
    assert page == [visible]

    closed = compose_public_page([hidden], None, [visible], 20)
    assert closed == [visible]

    kept = compose_public_page([visible], {"new"}, [], 20)
    assert kept == [visible]


def test_search_query_uses_eligibility_and_sql_supplement():
    class Stub:
        meili_enabled = True
        db_enabled = True

        def _normalize_filters(self, **_kwargs):
            return {}

        async def _search_meilisearch(self, *_args, **_kwargs):
            return {"items": [{"id": "suppressed", "title": "Old role"}], "facets": {}}

        async def _search_database(self, *_args, **_kwargs):
            return {
                "items": [{"id": "new", "title": "New Role"}],
                "total": 1,
                "page": 1,
                "size": 20,
            }

        async def _eligible_ids(self, hit_ids):
            assert hit_ids == ["suppressed"]
            return set()

    result = asyncio.run(SearchService.search_query(Stub(), q="New Role"))
    items = result["data"]["items"]
    assert [item["id"] for item in items] == ["new"]
    assert result["data"]["source"] == "meili"
    assert result["data"]["total"] == 1

    class Closed(Stub):
        async def _eligible_ids(self, hit_ids):
            return None

    closed = asyncio.run(SearchService.search_query(Closed(), q="New Role"))
    assert [item["id"] for item in closed["data"]["items"]] == ["new"]
    assert closed["data"]["source"] == "db"

    meili_source = inspect.getsource(SearchService._search_meilisearch)
    assert "include all results" not in meili_source
    assert "deleted_at IS NULL" not in meili_source


def test_rebuild_deletes_stale_documents_without_wiping_first():
    class Index:
        def __init__(self):
            self.deleted = []
            self.wiped = False

        def delete_all_documents(self):
            self.wiped = True

        def get_documents(self, _params):
            return {"results": [{"id": "keep"}, {"id": "stale"}]}

        def delete_documents(self, ids):
            self.deleted.extend(ids)

    index = Index()
    service = SearchService.__new__(SearchService)
    removed = service._remove_stale_documents(index, ["keep"])
    assert removed == 1
    assert index.deleted == ["stale"]
    assert index.wiped is False
    assert stale_document_ids(["keep", "stale"], []) == ["keep", "stale"]

    source = inspect.getsource(SearchService.reindex_jobs)
    assert "delete_all" not in source
    assert source.index("add_documents") < source.index("_remove_stale_documents")
    assert "UPDATE " not in source
    assert "DELETE FROM" not in source


def test_crawlers_schedule_projection_after_commit_and_do_not_reindex():
    projection = (ROOT / "app" / "search_projection.py").read_text(encoding="utf-8")
    assert "UPDATE" not in projection
    assert "DELETE FROM" not in projection
    commit = projection.split("def commit_and_schedule", 1)[1]
    commit = commit.split("def schedule_after_commit", 1)[0]
    assert commit.index("conn.commit()") < commit.index("schedule_after_commit")

    for name in ("simple_crawler.py", "rss_crawler.py", "api_crawler.py"):
        text = (ROOT / "crawler_v2" / name).read_text(encoding="utf-8")
        assert "commit_and_schedule" in text
        assert "reindex_jobs" not in text
        assert "recorded=recorded" in text
    orchestrator = (ROOT / "orchestrator.py").read_text(encoding="utf-8")
    assert "reindex_jobs" not in orchestrator
