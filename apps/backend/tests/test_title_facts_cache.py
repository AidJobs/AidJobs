"""W-42 PR2: in-memory title-facts cache, attach, filter, and schedule."""
from __future__ import annotations

import pytest

from app import title_facts_cache as cache
from app.title_facts import DESCRIPTION_PREFIX_LIMIT, facts_of


@pytest.fixture(autouse=True)
def _clean_cache():
    cache._reset_cache_for_tests()
    yield
    cache._reset_cache_for_tests()


def test_open_jobs_predicate_matches_public_search():
    assert "status = 'active'" in cache.open_jobs_sql_predicate()
    assert "deleted_at IS NULL" in cache.open_jobs_sql_predicate()
    assert "deadline IS NULL OR deadline >= CURRENT_DATE" in cache.open_jobs_sql_predicate()


def test_description_prefix_limit_exported_for_sql():
    assert DESCRIPTION_PREFIX_LIMIT == 500


def test_attach_facts_uses_cache_when_present():
    cached = facts_of("Education Officer, P-3, Fixed Term")
    cache._reset_cache_for_tests({"job-1": cached})
    item = {"id": "job-1", "title": "Driver"}
    cache.attach_facts(item)
    assert item["facts"]["sectors"] == ["Education"]
    assert item["facts"]["grade"] == "P-3"


def test_attach_facts_title_only_on_cache_miss():
    item = {"id": "missing", "title": "National Consultant - Nutrition (11 months), Home-based"}
    cache.attach_facts(item)
    assert item["facts"]["contract"] == "Consultancy"
    assert item["facts"]["sectors"] == ["Nutrition"]
    assert item["facts"]["remote"] is True


def test_attach_facts_to_items_leaves_other_fields():
    items = [
        {"id": "a", "title": "Driver", "functional_role": ["x"], "sdgs": [1]},
        {"id": "b", "title": "Education Officer, P-3"},
    ]
    cache.attach_facts_to_items(items)
    assert items[0]["functional_role"] == ["x"]
    assert items[0]["sdgs"] == [1]
    assert "facts" in items[0]
    assert items[1]["facts"]["sectors"] == ["Education"]


def test_filter_jobs_pure_helper():
    items = [
        {"id": "1", "title": "Education Officer, P-3, Fixed Term"},
        {"id": "2", "title": "Driver"},
        {"id": "3", "title": "National Consultant - Nutrition, Home-based"},
    ]
    cache.attach_facts_to_items(items)
    only_edu = cache.filter_jobs(items, sectors=["Education"])
    assert [i["id"] for i in only_edu] == ["1"]
    remote = cache.filter_jobs(items, remote=True)
    assert [i["id"] for i in remote] == ["3"]
    mid = cache.filter_jobs(items, level="Mid-career")
    assert [i["id"] for i in mid] == ["1"]


def test_failed_rebuild_keeps_previous_map(monkeypatch):
    cache._reset_cache_for_tests({"keep": facts_of("Driver")})
    assert cache.cache_size() == 1

    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(cache, "_load_open_job_facts", boom)
    with pytest.raises(RuntimeError):
        cache.rebuild_sync()
    assert cache.get_cached_facts("keep") is not None
    assert cache.cache_size() == 1


def test_rebuild_swaps_whole_map(monkeypatch):
    cache._reset_cache_for_tests({"old": facts_of("Driver")})

    def load():
        return {"new": facts_of("Education Officer, P-3")}

    monkeypatch.setattr(cache, "_load_open_job_facts", load)
    assert cache.rebuild_sync() == 1
    assert cache.get_cached_facts("old") is None
    assert cache.get_cached_facts("new")["sectors"] == ["Education"]


def test_schedule_skips_when_finish_failed(monkeypatch):
    calls = []

    def boom():
        calls.append("rebuild")
        return 0

    monkeypatch.setattr(cache, "rebuild_sync", boom)
    cache.schedule_rebuild_after_finish(False)
    assert calls == []


def test_schedule_single_flight_queues_follow_up(monkeypatch):
    calls = []

    def load():
        calls.append("load")
        return {"j": facts_of("Driver")}

    monkeypatch.setattr(cache, "_load_open_job_facts", load)

    with cache._lock:
        cache._rebuilding = True
    cache.schedule_rebuild_after_finish(True)
    with cache._lock:
        assert cache._rebuild_pending is True
        # Simulate the in-flight rebuild finishing with a pending follow-up.
        cache._rebuilding = False
        pending = cache._rebuild_pending
        cache._rebuild_pending = False
    assert pending is True

    # No running loop: inline rebuild runs immediately.
    cache.schedule_rebuild_after_finish(True)
    assert calls == ["load"]
    assert cache.get_cached_facts("j") is not None


def test_closed_job_miss_is_title_only_not_error():
    # get_job_by_id for a closed job: no cache entry → title-only facts.
    item = {"id": "closed", "title": "Internship - Communication (Remote)"}
    cache.attach_facts(item)
    assert item["facts"]["contract"] == "Internship"
    assert item["facts"]["level"] == "Entry"
