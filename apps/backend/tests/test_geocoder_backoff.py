"""Nominatim refusals pause lookups, and failed lookups are not repeated. No network."""
import asyncio

import pytest

import core.geocoder as geocoder_module
from core.geocoder import Geocoder


class _Response:
    def __init__(self, status_code, data=None, headers=None):
        self.status_code = status_code
        self._data = data
        self.headers = headers or {}

    def json(self):
        return self._data


_FOUND = _Response(
    200,
    [{"lat": "31.9", "lon": "35.9", "display_name": "Jordan", "address": {"country": "Jordan"}}],
)


@pytest.fixture
def nominatim(monkeypatch):
    """Answer Nominatim requests from a queue and control the clock."""
    state = {"now": 1_000.0, "answers": [], "asked": []}

    class _Client:
        def __init__(self, *_args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def get(self, url, params=None, headers=None):
            state["asked"].append(params["q"])
            if not state["answers"]:
                raise AssertionError(f"unexpected Nominatim request for {params['q']}")
            return state["answers"].pop(0)

    monkeypatch.setattr(geocoder_module.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(geocoder_module.time, "time", lambda: state["now"])
    geocoder = Geocoder()
    geocoder._nominatim_delay = 0
    return geocoder, state


def _geocode(geocoder, location):
    return asyncio.run(geocoder.geocode(location))


@pytest.mark.parametrize("status", [429, 403])
def test_a_refusal_pauses_nominatim_for_an_hour(status, nominatim, caplog):
    geocoder, state = nominatim
    state["answers"] = [_Response(status)]
    with caplog.at_level("WARNING", logger="core.geocoder"):
        assert _geocode(geocoder, "Jordan") is None
    assert f"HTTP {status}" in caplog.text
    assert _geocode(geocoder, "Kenya") is None
    assert _geocode(geocoder, "Nepal") is None
    assert state["asked"] == ["Jordan"]

    state["now"] += 3_601
    state["answers"] = [_FOUND]
    assert _geocode(geocoder, "Kenya")["country"] == "Jordan"
    assert state["asked"] == ["Jordan", "Kenya"]


def test_a_longer_retry_after_is_honoured(nominatim):
    geocoder, state = nominatim
    state["answers"] = [_Response(429, headers={"retry-after": "7200"})]
    assert _geocode(geocoder, "Jordan") is None
    state["now"] += 3_601
    assert _geocode(geocoder, "Kenya") is None
    assert state["asked"] == ["Jordan"]
    state["now"] += 3_600
    state["answers"] = [_FOUND]
    assert _geocode(geocoder, "Kenya") is not None
    assert state["asked"] == ["Jordan", "Kenya"]


@pytest.mark.parametrize("answer", [_Response(500), _Response(200, [])], ids=["error", "empty"])
def test_a_failed_lookup_is_not_repeated_within_an_hour(answer, nominatim):
    geocoder, state = nominatim
    state["answers"] = [answer]
    assert _geocode(geocoder, "Jordan") is None
    assert _geocode(geocoder, "jordan ") is None
    assert state["asked"] == ["Jordan"]

    state["now"] += 3_601
    state["answers"] = [_FOUND]
    assert _geocode(geocoder, "Jordan") is not None
    assert state["asked"] == ["Jordan", "Jordan"]


def test_a_lookup_skipped_during_a_pause_is_not_remembered_as_failed(nominatim):
    geocoder, state = nominatim
    state["answers"] = [_Response(429)]
    _geocode(geocoder, "Jordan")
    assert _geocode(geocoder, "Kenya") is None
    assert not geocoder._recently_failed("Kenya")


def test_a_success_is_still_cached(nominatim):
    geocoder, state = nominatim
    state["answers"] = [_FOUND]
    first = _geocode(geocoder, "Jordan")
    second = _geocode(geocoder, "Jordan")
    assert first == second
    assert first["latitude"] == pytest.approx(31.9)
    assert state["asked"] == ["Jordan"]


def test_remote_locations_never_call_nominatim(nominatim):
    geocoder, state = nominatim
    assert _geocode(geocoder, "Remote / home based")["is_remote"] is True
    assert state["asked"] == []
