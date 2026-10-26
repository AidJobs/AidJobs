"""Every route a caller can reach without credentials is listed here on purpose.

A new route is public only if it is added to PUBLIC_ROUTES in a reviewed change.
"""
import functools
import inspect
import json
import os
import re
import subprocess
import sys
import types
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# data_quality_logs (imported by main) needs app.db, which is not in this repository.
if "app.db" not in sys.modules:
    _db_stub = types.ModuleType("app.db")
    _db_stub.get_db_conn = lambda: None
    sys.modules["app.db"] = _db_stub

from main import app

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
GUARDS = {"admin_required": "admin", "verify_internal_api_key": "internal"}


def _dependency_names(dependant):
    for dep in dependant.dependencies:
        if dep.call is not None:
            yield getattr(dep.call, "__name__", "")
        yield from _dependency_names(dep)


def _routes(routes, prefix="", inherited=frozenset()):
    """Registered routes with their full path, for FastAPI versions that copy or nest routers."""
    for route in routes:
        if type(route).__name__ == "_IncludedRouter":
            context = route.include_context
            names = set(inherited)
            for dep in getattr(context, "dependencies", None) or []:
                names.add(getattr(dep.dependency, "__name__", ""))
            yield from _routes(
                route.original_router.routes,
                prefix + (getattr(context, "prefix", "") or ""),
                frozenset(names),
            )
            continue
        methods = getattr(route, "methods", None)
        if not methods:
            continue
        names = set(inherited)
        if getattr(route, "dependant", None) is not None:
            names.update(_dependency_names(route.dependant))
        guard = next((GUARDS[n] for n in names if n in GUARDS), "public")
        for method in sorted(methods - {"HEAD"}):
            yield method, prefix + route.path, guard


def _registered():
    """Routes of this process's app. Other test modules may add routes of their own."""
    return {(m, p, g) for m, p, g in _routes(app.routes)}


PROBE_PREAMBLE = """
import json, sys, types
sys.modules.setdefault("app.db", types.ModuleType("app.db")).get_db_conn = lambda: None
from fastapi.testclient import TestClient
from main import app
"""


def _probe(body, env_value):
    """Run code against a freshly imported app, as main.py builds it for that AIDJOBS_ENV."""
    env = dict(os.environ)
    env.pop("AIDJOBS_ENV", None)
    if env_value is not None:
        env["AIDJOBS_ENV"] = env_value
    env["SUPABASE_DB_URL"] = "postgresql://probe@127.0.0.1:1/postgres"
    env["AIDJOBS_DISABLE_SCHEDULER"] = "true"
    result = subprocess.run(
        [sys.executable, "-c", PROBE_PREAMBLE + body],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert result.returncode == 0, result.stderr[-2000:]
    return json.loads(result.stdout.strip().splitlines()[-1])


ROUTES_PROBE = "\n".join(
    [
        f"GUARDS = {GUARDS!r}",
        inspect.getsource(_dependency_names),
        inspect.getsource(_routes),
        "print(json.dumps(sorted(set(_routes(app.routes)))))",
    ]
)


@functools.lru_cache(maxsize=None)
def _production_routes():
    return {tuple(r) for r in _probe(ROUTES_PROBE, "production")}


def test_public_routes_are_exactly_the_reviewed_list():
    public = {(m, p) for m, p, g in _production_routes() if g == "public"}
    assert public == PUBLIC_ROUTES, (
        f"unreviewed public routes: {sorted(public - PUBLIC_ROUTES)}; "
        f"listed but missing: {sorted(PUBLIC_ROUTES - public)}"
    )


def test_server_shortlist_is_not_mounted():
    assert not [p for _, p, _ in _production_routes() if p.startswith("/api/shortlist")]
    client = TestClient(app)
    assert client.get("/api/shortlist", params={"user_id": "x"}).status_code == 404
    assert client.post("/api/shortlist/job-1", params={"user_id": "x"}).status_code == 404


def _concrete(path):
    return re.sub(r"\{[^}]+\}", "00000000-0000-0000-0000-000000000000", path)


def test_every_protected_route_refuses_a_caller_without_credentials(monkeypatch):
    protected = sorted((m, p, g) for m, p, g in _registered() if g != "public")
    assert len(protected) > 50
    monkeypatch.setenv("COOKIE_SECRET", "test-secret-for-route-checks")
    client = TestClient(app, raise_server_exceptions=False)
    refused = {"admin": {401}, "internal": {401, 503}}
    failures = []
    for method, path, guard in protected:
        response = client.request(method, _concrete(path))
        if response.status_code not in refused[guard]:
            failures.append(f"{method} {path} -> {response.status_code}")
    assert not failures, failures


def test_admin_routes_refuse_an_invalid_session(monkeypatch):
    monkeypatch.setenv("COOKIE_SECRET", "test-secret-for-route-checks")
    client = TestClient(app, raise_server_exceptions=False)
    headers = {"X-Aidjobs-Admin-Session": "v1.e30.invalid"}
    admin = sorted((m, p) for m, p, g in _registered() if g == "admin")
    failures = [
        f"{m} {p} -> {status}"
        for m, p in admin
        if (status := client.request(m, _concrete(p), headers=headers).status_code) != 401
    ]
    assert not failures, failures


DOCS_PROBE = """
client = TestClient(app)
print(json.dumps({p: client.get(p).status_code for p in ["/docs", "/redoc", "/openapi.json"]}))
"""


def _docs_status(env_value):
    return _probe(DOCS_PROBE, env_value)


@pytest.mark.parametrize("env_value", ["production", "", None])
def test_api_docs_are_not_served_outside_development(env_value):
    assert _docs_status(env_value) == {"/docs": 404, "/redoc": 404, "/openapi.json": 404}


def test_api_docs_are_served_in_development():
    assert _docs_status("dev") == {"/docs": 200, "/redoc": 200, "/openapi.json": 200}
