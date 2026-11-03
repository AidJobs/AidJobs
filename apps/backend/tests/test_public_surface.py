"""Every route a caller can reach without credentials is listed here on purpose.

A new route is public only if it is added to PUBLIC_ROUTES in a reviewed change.

Every check runs in a fresh process that builds the app as production does: no .env file,
a minimal environment, and a database address that cannot be reached. If a guard ever stopped
refusing, the handler it exposed could not touch a real service.
"""
import functools
import inspect
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]

PUBLIC_ROUTES = {
    ("GET", "/api/healthz"),
    ("GET", "/api/capabilities"),
    ("GET", "/api/db/status"),
    ("GET", "/api/search/status"),
    ("GET", "/api/search/query"),
    ("GET", "/api/search/facets"),
    ("GET", "/api/search/autocomplete"),
    ("POST", "/api/search/parse"),
    ("GET", "/api/jobs/{job_id}"),
    ("POST", "/api/admin/login"),
    ("POST", "/api/admin/logout"),
    ("GET", "/api/admin/session"),
}
REFUSAL_DETAIL = {
    "admin": "Authentication required",
    "internal": "Invalid or missing internal API key",
}
GUARD_PRIORITY = ("admin", "internal")
COOKIE_SECRET = "test-secret-for-route-checks"
INTERNAL_KEY = "internal-key-for-route-checks"
UNREACHABLE_DB = "postgresql://probe@127.0.0.1:1/postgres"
DOC_PATHS = ("/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json")


def _guard_calls():
    """The guard functions themselves, matched by identity rather than by name."""
    from security.admin_auth import admin_required

    calls = [(admin_required, "admin")]
    try:
        from app.pipeline_api import verify_internal_api_key
    except ImportError:
        pass
    else:
        calls.append((verify_internal_api_key, "internal"))
    return calls


def _dependency_calls(dependant):
    for dep in dependant.dependencies:
        if dep.call is not None:
            yield dep.call
        yield from _dependency_calls(dep)


def _router_routes(router):
    """Normal routes plus, on newer FastAPI, the low-priority ones (router.frontend())."""
    return list(router.routes) + list(getattr(router, "_low_priority_routes", None) or [])


def _routes(routes, guard_calls, prefix="", inherited=()):
    """(method, full path, guard) for every registered route, in any FastAPI version.

    Fails closed: a route that is not a FastAPI APIRoute, or that has no methods (mounts,
    websockets, raw ASGI apps), is reported as public so the allowlist has to name it.
    """
    from fastapi.routing import APIRoute

    for route in routes:
        if type(route).__name__ == "_IncludedRouter":
            context = route.include_context
            extra = getattr(context, "dependencies", None) or []
            calls = list(inherited) + [d.dependency for d in extra]
            yield from _routes(
                _router_routes(route.original_router),
                guard_calls,
                prefix + (getattr(context, "prefix", "") or ""),
                tuple(calls),
            )
            continue
        path = prefix + getattr(route, "path", getattr(route, "path_format", "?"))
        methods = getattr(route, "methods", None)
        if not methods:
            yield "*", path, "public"
            continue
        calls = []
        if isinstance(route, APIRoute):
            calls = list(inherited) + list(_dependency_calls(route.dependant))
        found = {name for call in calls for fn, name in guard_calls if call is fn}
        guard = next((g for g in GUARD_PRIORITY if g in found), "public")
        for method in sorted(methods if methods == {"HEAD"} else methods - {"HEAD"}):
            yield method, path, guard


def _concrete(path):
    return re.sub(r"\{[^}]+\}", "00000000-0000-0000-0000-000000000000", path)


def _leaf_types(routes):
    """Class names of every route the walker above reaches, through included routers."""
    for route in routes:
        if type(route).__name__ == "_IncludedRouter":
            yield from _leaf_types(_router_routes(route.original_router))
        else:
            yield type(route).__name__


def _fastapi_listing(routes):
    """(method, full path) for every route, as FastAPI's public route listing reports them."""
    from fastapi.routing import iter_route_contexts

    for context in iter_route_contexts(routes):
        methods = context.methods
        if not methods:
            yield "*", context.path
            continue
        for method in sorted(methods if methods == {"HEAD"} else methods - {"HEAD"}):
            yield method, context.path


PROBE_PREAMBLE = "\n".join(
    [
        "import json, sys, types",
        "import dotenv",
        "dotenv.load_dotenv = lambda *args, **kwargs: False",
        "from fastapi.testclient import TestClient",
        "from main import app",
        f"GUARD_PRIORITY = {GUARD_PRIORITY!r}",
        f"COOKIE_SECRET = {COOKIE_SECRET!r}",
        f"INTERNAL_KEY = {INTERNAL_KEY!r}",
        f"DOC_PATHS = {DOC_PATHS!r}",
        "import re",
    ]
    + [
        inspect.getsource(f)
        for f in (
            _guard_calls, _dependency_calls, _router_routes, _routes, _concrete,
            _leaf_types, _fastapi_listing,
        )
    ]
    + ["ROUTES = sorted(set(_routes(_router_routes(app.router), _guard_calls())))"]
)

ROUTES_PROBE = """
print(json.dumps({
    "routes": ROUTES,
    "fastapi": sorted(set(_fastapi_listing(_router_routes(app.router)))),
    "leaf_types": sorted(set(_leaf_types(_router_routes(app.router)))),
}))
"""

REFUSALS_PROBE = """
from security import admin_auth
try:
    import app.pipeline_api as pipeline_api
    pipeline_api.INTERNAL_API_KEY = INTERNAL_KEY
except ImportError:
    pass
wrong_secret = admin_auth.create_session_token("admin", "not-the-server-secret")
hours = admin_auth.SESSION_DURATION_HOURS
admin_auth.SESSION_DURATION_HOURS = -1
expired = admin_auth.create_session_token("admin", COOKIE_SECRET)
admin_auth.SESSION_DURATION_HOURS = hours
attempts = {
    "admin": {
        "no session": {},
        "malformed session": {"X-Aidjobs-Admin-Session": "v1.e30.invalid"},
        "session signed with another secret": {"X-Aidjobs-Admin-Session": wrong_secret},
        "expired session": {"X-Aidjobs-Admin-Session": expired},
    },
    "internal": {"no key": {}, "wrong key": {"X-Internal-Api-Key": "wrong-key"}},
}
client = TestClient(app, raise_server_exceptions=False)
results = []
for method, path, guard in ROUTES:
    if guard == "public":
        continue
    for name, headers in attempts[guard].items():
        response = client.request(method, _concrete(path), headers=headers)
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = None
        results.append([method, path, guard, name, response.status_code, detail])
shortlist = [
    client.get("/api/shortlist", params={"user_id": "x"}).status_code,
    client.post("/api/shortlist/job-1", params={"user_id": "x"}).status_code,
]
print(json.dumps({"results": results, "shortlist": shortlist}))
"""

DOCS_PROBE = """
client = TestClient(app)
print(json.dumps({"docs": {p: client.get(p).status_code for p in DOC_PATHS}}))
"""

_ENV_KEPT = (
    "PATH", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR",
    "TEMP", "TMP", "HOME", "USERPROFILE", "PYTHONPATH",
)


@functools.lru_cache(maxsize=None)
def _probe(body, env_value):
    """Run code against a freshly built app, as main.py builds it for that AIDJOBS_ENV."""
    env = {k: os.environ[k] for k in _ENV_KEPT if k in os.environ}
    env.update(
        SUPABASE_DB_URL=UNREACHABLE_DB,
        AIDJOBS_DISABLE_SCHEDULER="true",
        COOKIE_SECRET=COOKIE_SECRET,
        PYTHONIOENCODING="utf-8",
    )
    if env_value is not None:
        env["AIDJOBS_ENV"] = env_value
    result = subprocess.run(
        [sys.executable, "-c", PROBE_PREAMBLE + "\n" + body],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
    )
    output = [line for line in result.stdout.splitlines() if line.startswith("{")]
    assert result.returncode == 0 and output, result.stderr[-3000:]
    return json.loads(output[-1])


def _production_routes():
    return {tuple(r) for r in _probe(ROUTES_PROBE, "production")["routes"]}


def test_checked_routes_are_exactly_what_fastapi_registers():
    """The walker reads FastAPI internals; FastAPI's public listing must agree with it exactly."""
    listing = _probe(ROUTES_PROBE, "production")
    walked = {(m, p) for m, p, _ in listing["routes"]}
    registered = {tuple(r) for r in listing["fastapi"]}
    assert walked == registered, (
        f"registered but not checked: {sorted(registered - walked)}; "
        f"checked but not registered: {sorted(walked - registered)}"
    )
    assert ("GET", "/api/admin/sources") in walked
    assert ("GET", "/_internal/jobs") in walked


def test_every_route_is_a_kind_the_guard_check_understands():
    assert _probe(ROUTES_PROBE, "production")["leaf_types"] == ["APIRoute"]


def test_public_routes_are_exactly_the_reviewed_list():
    public = {(m, p) for m, p, g in _production_routes() if g == "public"}
    assert public == PUBLIC_ROUTES, (
        f"unreviewed public routes: {sorted(public - PUBLIC_ROUTES)}; "
        f"listed but missing: {sorted(PUBLIC_ROUTES - public)}"
    )


def test_server_shortlist_is_not_mounted():
    assert not [p for _, p, _ in _production_routes() if p.startswith("/api/shortlist")]
    assert _probe(REFUSALS_PROBE, "production")["shortlist"] == [404, 404]


def test_every_protected_route_refuses_callers_without_valid_credentials():
    results = _probe(REFUSALS_PROBE, "production")["results"]
    assert any(guard == "admin" for _, _, guard, _, _, _ in results)
    failures = [
        f"{method} {path} ({guard}, {attempt}) -> {status} {detail!r}"
        for method, path, guard, attempt, status, detail in results
        if status != 401 or detail != REFUSAL_DETAIL[guard]
    ]
    assert not failures, failures


def test_internal_routes_are_checked_when_mounted():
    internal = [r for r in _probe(REFUSALS_PROBE, "production")["results"] if r[2] == "internal"]
    if not internal:
        pytest.skip("no internal-key routes are mounted")
    assert {attempt for _, _, _, attempt, _, _ in internal} == {"no key", "wrong key"}


@pytest.mark.parametrize("env_value", ["production", "", None])
def test_api_docs_are_not_served_outside_development(env_value):
    assert _probe(DOCS_PROBE, env_value)["docs"] == {p: 404 for p in DOC_PATHS}


def test_api_docs_are_served_in_development():
    assert _probe(DOCS_PROBE, "dev")["docs"] == {p: 200 for p in DOC_PATHS}
