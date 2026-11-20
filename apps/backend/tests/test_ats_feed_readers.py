"""W-38: Workable and Greenhouse public feed readers, first_request, host groups."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from contracts.admission import admit_batch
from contracts.outbound import (
    HOST_GROUP_BUDGET_REQUESTS,
    HOST_GROUP_BUDGET_WINDOW_SECONDS,
    HOST_GROUP_LIMITS,
    crawl_budget,
    host_group,
)
from contracts.reader import CANDIDATE_FIELDS, UNSAVED_FIELDS, Request, Response
from crawler_v2 import ats_feeds
from crawler_v2.readers import (
    GREENHOUSE_DETAIL_CAP,
    GreenhouseFeedReader,
    JsonApiReader,
    WorkableFeedReader,
    api_readers,
    read_listing,
    resolve_feed_request,
)
from crawler_v2.simulate import simulate_api

_FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _body(system: str, name: str = "sample") -> str:
    return (_FIXTURES / system / f"{name}.json").read_text(encoding="utf-8")


def _record(system: str, name: str = "sample") -> dict:
    return json.loads(
        (_FIXTURES / system / f"{name}.jobs.json").read_text(encoding="utf-8")
    )


def test_api_readers_order_puts_ats_before_generic():
    names = [reader.name for reader in api_readers()]
    assert names == ["workable-feed", "greenhouse-feed", "json-api"]
    assert [type(r) for r in api_readers()] == [
        WorkableFeedReader,
        GreenhouseFeedReader,
        JsonApiReader,
    ]


def test_workable_first_request_maps_board_to_widget():
    reader = WorkableFeedReader()
    req = reader.first_request({"careers_url": "https://apply.workable.com/example-aid/"})
    assert req == Request(
        "https://apply.workable.com/api/v1/widget/accounts/example-aid?details=true",
        accept="application/json",
    )
    assert reader.first_request({"careers_url": "https://jobs.example.org/"}) is None
    assert reader.budget_group == "workable"


def test_greenhouse_first_request_maps_board_to_api():
    reader = GreenhouseFeedReader()
    req = reader.first_request(
        {"careers_url": "https://job-boards.greenhouse.io/exampleaid"}
    )
    assert req == Request(
        "https://boards-api.greenhouse.io/v1/boards/exampleaid/jobs?content=true",
        accept="application/json",
    )
    assert reader.budget_group == "greenhouse"
    assert "greenhouse" in HOST_GROUP_LIMITS


def test_resolve_feed_request_picks_workable():
    reader, req = resolve_feed_request(
        api_readers(), {"careers_url": "https://apply.workable.com/cimmyt-1/"}
    )
    assert reader.name == "workable-feed"
    assert "widget/accounts/cimmyt-1" in req.url


def test_workable_reader_matches_fixture_and_groups_locations():
    record = _record("workable")
    result = asyncio.run(
        read_listing(
            api_readers(),
            Response(200, _body("workable")),
            {"careers_url": record["url"]},
        )
    )
    assert result.reader == "workable-feed"
    assert result.report() is None
    assert result.jobs == record["jobs"]
    for job in result.jobs:
        assert set(job) <= (CANDIDATE_FIELDS | UNSAVED_FIELDS | {"record_class"})


def test_workable_jobs_admit_with_location():
    jobs = [dict(job) for job in _record("workable")["jobs"]]
    admitted, rejected = admit_batch(jobs, "api")
    assert len(admitted) == 2
    assert rejected == []


def test_greenhouse_reader_matches_fixture_without_detail_fetch():
    record = _record("greenhouse")
    result = asyncio.run(
        read_listing(
            api_readers(),
            Response(200, _body("greenhouse")),
            {"careers_url": record["url"]},
            fetch=None,
        )
    )
    assert result.reader == "greenhouse-feed"
    assert result.report() == record["report"]
    assert result.jobs == record["jobs"]
    # Listing omitted first_published on job 4002; without fetch it stays unset.
    assert "posted_on" not in result.jobs[1]


def test_greenhouse_detail_cap_fills_first_published_only():
    record = _record("greenhouse")
    detail = (_FIXTURES / "greenhouse" / "job_4002.json").read_text(encoding="utf-8")
    calls: list[str] = []

    async def fetch(request: Request) -> Response:
        calls.append(request.url)
        assert "/jobs/4002" in request.url
        return Response(200, detail, content_type="application/json")

    result = asyncio.run(
        GreenhouseFeedReader().read(
            Response(200, _body("greenhouse")),
            {"careers_url": record["url"]},
            fetch=fetch,
        )
    )
    assert len(calls) == 1
    assert result.jobs[1]["posted_on"] == "2026-11-05"
    # Never invent from updated_at on the list row.
    assert result.jobs[0]["posted_on"] == "2026-11-01"


def test_greenhouse_detail_stops_after_refusal():
    record = _record("greenhouse")
    # Two jobs missing posted_on.
    data = json.loads(_body("greenhouse"))
    for item in data["jobs"]:
        item.pop("first_published", None)
    calls: list[str] = []

    async def fetch(request: Request) -> Response:
        calls.append(request.url)
        return Response(429, "", stop="HTTP 429")

    result = asyncio.run(
        GreenhouseFeedReader().read(
            Response(200, json.dumps(data)),
            {"careers_url": record["url"]},
            fetch=fetch,
        )
    )
    assert len(calls) == 1
    assert all(not job.get("posted_on") for job in result.jobs)


def test_greenhouse_detail_stops_on_akamai_challenge_at_200():
    record = _record("greenhouse")
    data = json.loads(_body("greenhouse"))
    for item in data["jobs"]:
        item.pop("first_published", None)
    calls: list[str] = []

    async def fetch(request: Request) -> Response:
        calls.append(request.url)
        return Response(200, "", stop="HTTP 200 (Akamai)")

    result = asyncio.run(
        GreenhouseFeedReader().read(
            Response(200, json.dumps(data)),
            {"careers_url": record["url"]},
            fetch=fetch,
        )
    )
    assert len(calls) == 1
    assert all(not job.get("posted_on") for job in result.jobs)


def test_greenhouse_detail_continues_after_404():
    record = _record("greenhouse")
    data = json.loads(_body("greenhouse"))
    for item in data["jobs"]:
        item.pop("first_published", None)
    detail = (_FIXTURES / "greenhouse" / "job_4002.json").read_text(encoding="utf-8")
    calls: list[str] = []

    async def fetch(request: Request) -> Response:
        calls.append(request.url)
        if "4001" in request.url:
            return Response(404, "", stop="HTTP 404")
        return Response(200, detail, content_type="application/json")

    result = asyncio.run(
        GreenhouseFeedReader().read(
            Response(200, json.dumps(data)),
            {"careers_url": record["url"]},
            fetch=fetch,
        )
    )
    assert len(calls) == 2
    assert "posted_on" not in result.jobs[0]
    assert result.jobs[1]["posted_on"] == "2026-11-05"


def test_greenhouse_detail_cap_limits_fetches():
    record = _record("greenhouse")
    jobs = []
    for index in range(15):
        jobs.append(
            {
                "id": 5000 + index,
                "title": f"Role {index}",
                "location": {"name": "Remote"},
                "absolute_url": (
                    f"https://job-boards.greenhouse.io/exampleaid/jobs/{5000 + index}"
                ),
                "content": "Text",
            }
        )
    data = {"jobs": jobs, "meta": {"total": 15}}
    calls: list[str] = []

    async def fetch(request: Request) -> Response:
        calls.append(request.url)
        job_id = request.url.rstrip("/").rsplit("/", 1)[-1]
        return Response(
            200,
            json.dumps(
                {
                    "id": int(job_id),
                    "title": "Role",
                    "first_published": "2026-11-01T00:00:00Z",
                    "absolute_url": request.url,
                }
            ),
        )

    result = asyncio.run(
        GreenhouseFeedReader().read(
            Response(200, json.dumps(data)),
            {"careers_url": record["url"]},
            fetch=fetch,
        )
    )
    assert len(calls) == GREENHOUSE_DETAIL_CAP
    filled = sum(1 for job in result.jobs if job.get("posted_on"))
    assert filled == GREENHOUSE_DETAIL_CAP


def test_greenhouse_detail_cap_constant():
    assert GREENHOUSE_DETAIL_CAP == 10
    assert HOST_GROUP_BUDGET_REQUESTS == 12
    assert HOST_GROUP_BUDGET_WINDOW_SECONDS == 60.0
    assert HOST_GROUP_LIMITS["workable"] == (12, 60.0)
    assert HOST_GROUP_LIMITS["greenhouse"] == (12, 60.0)


def test_greenhouse_jobs_admit_with_location():
    jobs = [dict(job) for job in _record("greenhouse")["jobs"]]
    admitted, rejected = admit_batch(jobs, "api")
    assert len(admitted) == 2
    assert rejected == []


def test_simulate_api_names_workable_reader():
    record = _record("workable")
    result = asyncio.run(simulate_api(_body("workable"), record["url"]))
    assert result["ok"] is True
    assert result["reader"] == "workable-feed"
    assert result["admitted"] == 2


def test_generic_json_still_used_when_address_is_not_ats():
    result = asyncio.run(
        read_listing(
            api_readers(),
            Response(200, (_FIXTURES / "json_api" / "sample.json").read_text()),
            {"careers_url": "https://boards.example.org/jobs.json"},
        )
    )
    assert result.reader == "json-api"


def test_ats_url_helpers():
    assert ats_feeds.workable_account("https://apply.workable.com/iita/") == "iita"
    assert (
        ats_feeds.greenhouse_token("https://job-boards.greenhouse.io/givedirectly")
        == "givedirectly"
    )
    assert ats_feeds.workable_account("https://boards.example.org/") is None


@pytest.mark.politeness
def test_host_group_budget_limits_shared_requests(monkeypatch):
    import contracts.outbound as outbound

    slept: list[float] = []
    now = {"t": 1000.0}

    def fake_monotonic():
        return now["t"]

    async def fake_sleep(seconds: float):
        slept.append(seconds)
        now["t"] += seconds

    monkeypatch.setattr(outbound.time, "monotonic", fake_monotonic)
    monkeypatch.setattr(outbound, "_sleep", fake_sleep)
    monkeypatch.setattr(outbound, "HOST_GROUP_LIMITS", {"workable": (2, 60.0)})
    outbound._group_hits.clear()

    async def take_three():
        with crawl_budget(seconds=120):
            with host_group("workable"):
                await outbound._take_group_slot("workable", outbound.current_budget())
                await outbound._take_group_slot("workable", outbound.current_budget())
                await outbound._take_group_slot("workable", outbound.current_budget())

    asyncio.run(take_three())
    assert slept, "third request in the group should wait for the window"
    assert slept[0] > 0
