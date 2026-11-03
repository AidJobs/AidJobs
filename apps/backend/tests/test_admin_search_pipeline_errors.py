"""Security stage 3, phase 2, PRs 4 and 5: the admin search routes and the internal pipeline routes
return no exception text.

The walk reuses test_admin_crawler_errors.py's fresh process (production build, signed in through
a dependency override, real sockets and DNS refused). Meilisearch is made to look configured and to
fail, and the database driver fails, each with fake connection-string text. No database, no
network.
"""
import json
import re

import pytest

from tests.test_admin_crawler_errors import DSN_ERROR, FRAGMENT, _run

SID = "00000000-0000-0000-0000-000000000000"
KEY = "probe-" + "internal-key"

WALK = """
import psycopg2
from app import pipeline_api
from app.search import search_service
def refuse(*args, **kwargs):
    raise psycopg2.OperationalError(%(dsn)r)
def broken(*args, **kwargs):
    raise RuntimeError(%(dsn)r)
class BrokenClient:
    index = staticmethod(broken)
    health = staticmethod(broken)
psycopg2.connect = refuse
pipeline_api.INTERNAL_API_KEY = %(key)r
search_service.meili_enabled = True
search_service.meili_client = BrokenClient()
search_service._init_meilisearch = broken
calls = []
calls.append(call("POST", "/api/admin/search/init"))
calls.append(call("POST", "/api/admin/search/reindex"))
calls.append(call("GET", "/api/admin/search/settings"))
headers = {"X-Internal-API-Key": %(key)r}
calls.append(call("GET", "/_internal/jobs", headers=headers))
calls.append(call("GET", "/_internal/jobs/%(sid)s", headers=headers))
search_service.meili_enabled = False
search_service.meili_client = None
search_service.meili_error = %(dsn)r
stored = call("GET", "/api/admin/search/settings")
stored["route"] = "GET /api/admin/search/settings (stored error)"
calls.append(stored)
calls.append({"route": "network attempts", "status": len(_attempts), "body": json.dumps(_attempts),
              "request_id": None})
""" % {"dsn": DSN_ERROR, "key": KEY, "sid": SID}

ROUTES = ["POST /api/admin/search/init", "POST /api/admin/search/reindex",
          "GET /api/admin/search/settings", "GET /_internal/jobs", f"GET /_internal/jobs/{SID}",
          "GET /api/admin/search/settings (stored error)"]
LOGGED = ["POST /api/admin/search/init", "GET /_internal/jobs", f"GET /_internal/jobs/{SID}"]


@pytest.fixture(scope="module")
def walk():
    return _run(WALK)


def _body(calls, route):
    return json.loads(calls[route]["body"])


def test_no_route_reaches_a_network(walk):
    calls, _logs = walk
    assert calls["network attempts"]["status"] == 0, calls["network attempts"]["body"]
    assert set(calls) == set(ROUTES) | {"network attempts"}


def test_no_response_or_log_line_quotes_the_fake_password(walk):
    calls, logs = walk
    leaking = [route for route, c in calls.items() if FRAGMENT in c["body"]]
    assert not leaking, f"responses quoting the fake database password: {leaking}"
    assert FRAGMENT not in logs, [line for line in logs.splitlines() if FRAGMENT in line][:5]


def test_initialize_and_reindex_keep_their_shape_with_a_fixed_message(walk):
    calls, _logs = walk
    init = calls["POST /api/admin/search/init"]
    assert init["status"] == 200
    assert _body(calls, "POST /api/admin/search/init") == {
        "success": False, "error": f"Index initialization failed (ref {init['request_id'][:8]})"}
    reindex = calls["POST /api/admin/search/reindex"]
    body = _body(calls, "POST /api/admin/search/reindex")
    assert reindex["status"] == 200
    assert body["error"] == f"Reindex failed (ref {reindex['request_id'][:8]})"
    assert (body["indexed"], body["skipped"]) == (0, 0) and isinstance(body["duration_ms"], int)


def test_settings_name_the_service_unavailable_in_both_failures(walk):
    calls, _logs = walk
    for route in ("GET /api/admin/search/settings",
                  "GET /api/admin/search/settings (stored error)"):
        assert calls[route]["status"] == 200, route
        assert _body(calls, route) == {"enabled": False, "error": "Meilisearch unavailable"}, route


def test_internal_routes_return_a_fixed_message_with_a_reference(walk):
    calls, _logs = walk
    for route, message in (("GET /_internal/jobs", "Failed to list extracted jobs"),
                           (f"GET /_internal/jobs/{SID}", "Failed to get extracted job")):
        c = calls[route]
        request_id = c["request_id"]
        assert c["status"] == 500, (route, c["body"][:300])
        assert re.fullmatch(r"[0-9a-f]{32}", request_id or ""), route
        assert json.loads(c["body"]) == {
            "detail": f"{message} (ref {request_id[:8]})", "request_id": request_id}, route


def test_each_reference_leads_to_the_logged_cause(walk):
    calls, logs = walk
    causes = [line for line in logs.splitlines()
              if "RuntimeError" in line or "OperationalError" in line]
    for route in LOGGED + ["POST /api/admin/search/reindex"]:
        c = calls[route]
        assert any(line.startswith(f"[{c['request_id']}]") for line in causes), route


# In process ---------------------------------------------------------------------------------

def test_the_admin_search_routes_refuse_a_caller_without_a_session():
    from fastapi.testclient import TestClient

    from main import app

    anonymous = TestClient(app, raise_server_exceptions=False)
    for method, path in (("POST", "/api/admin/search/init"), ("POST", "/api/admin/search/reindex"),
                         ("GET", "/api/admin/search/settings")):
        assert anonymous.request(method, path).status_code == 401, path


@pytest.fixture
def internal(monkeypatch):
    from fastapi.testclient import TestClient

    from app import pipeline_api
    from main import app

    monkeypatch.setattr(pipeline_api, "INTERNAL_API_KEY", KEY)
    return TestClient(app, raise_server_exceptions=False)


def test_the_internal_routes_still_refuse_a_wrong_or_missing_key(internal):
    for path in ("/_internal/jobs", f"/_internal/jobs/{SID}"):
        assert internal.get(path).status_code == 401, path
        assert internal.get(path, headers={"X-Internal-API-Key": "wrong"}).status_code == 401, path


def test_not_configured_passes_through_instead_of_being_rewrapped(monkeypatch, internal):
    from app import pipeline_api

    monkeypatch.setattr(pipeline_api.db_config, "get_connection_params", lambda: None)
    for path in ("/_internal/jobs", f"/_internal/jobs/{SID}"):
        response = internal.get(path, headers={"X-Internal-API-Key": KEY})
        assert (response.status_code, response.json()) == (
            500, {"detail": "Database not configured"}), path
