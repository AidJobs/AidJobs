"""Security stage 3: no new place may put exception text into an API response.

A static tripwire over app/ and main.py. Inside every `except ... as NAME:` block it finds where
NAME (or traceback.format_exc()) reaches a `raise HTTPException(...)`, a `return`, a
`JSONResponse(...)`, or, inside a route function, a dict entry, an error/message variable, or an
append/update, all of which are returned later. It is not a proof of absence; it stops the
pattern from growing.

ALLOWED lists what the stage 3 inventory found on 28 October 2026, per function. Phases 2 and 3
convert them and shrink this list to nothing. A converted function must be removed from it.
"""
import ast
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROUTE_METHODS = {"get", "post", "put", "delete", "patch"}

ALLOWED = {
    # Admin routes (session required); phase 2.
    "app/crawler_admin.py::backfill_quality_scores": 3,
    "app/crawler_admin.py::delete_jobs_by_org": 1,
    "app/crawler_admin.py::get_coverage_issues": 1,
    "app/crawler_admin.py::get_coverage_stats": 1,
    "app/crawler_admin.py::get_crawl_analytics_overview": 1,
    "app/crawler_admin.py::get_extraction_stats": 1,
    "app/crawler_admin.py::get_failed_inserts": 1,
    "app/crawler_admin.py::get_global_quality": 1,
    "app/crawler_admin.py::get_source_analytics": 1,
    "app/crawler_admin.py::get_source_coverage": 1,
    "app/crawler_admin.py::get_source_quality": 1,
    "app/crawler_admin.py::get_status": 1,
    "app/crawler_admin.py::get_validation_errors": 1,
    "app/crawler_admin.py::get_validation_stats": 1,
    "app/crawler_admin.py::sync_meilisearch": 1,
    "app/crawler_admin.py::undp_diagnostics": 1,
    "app/crawler_admin.py::unesco_diagnostics": 1,
    "app/crawler_admin.py::validate_job_link": 1,
    "app/crawler_admin.py::validate_links": 1,
    "app/job_management.py::bulk_delete_jobs": 2,
    "app/job_management.py::diagnose_job_id": 11,
    "app/job_management.py::diagnose_search_vs_db": 1,
    "app/job_management.py::export_jobs": 1,
    "app/job_management.py::get_deletion_impact": 1,
    "app/job_management.py::restore_jobs": 1,
    "app/job_management.py::search_jobs": 1,
    "app/presets.py::get_source_preset": 1,
    "app/presets.py::get_source_presets": 1,
    "app/search.py::get_search_settings": 1,
    "app/search.py::reindex_jobs": 1,
    "app/sources.py::create_source": 1,
    "app/sources.py::delete_source": 1,
    "app/sources.py::export_source": 1,
    "app/sources.py::get_source": 1,
    "app/sources.py::import_source": 2,
    "app/sources.py::list_organisations": 1,
    "app/sources.py::list_sources": 1,
    "app/sources.py::permanently_delete_source": 1,
    "app/sources.py::simulate_extract": 3,
    "app/sources.py::test_source": 5,
    "app/sources.py::update_source": 1,
    "main.py::admin_search_init": 1,
    # Internal-key routes; phase 2.
    "app/pipeline_api.py::get_extracted_job": 1,
    "app/pipeline_api.py::list_extracted_jobs": 1,
    # Not reachable in production today (router not mounted, or no caller); phase 3.
    "app/data_quality_logs.py::get_data_quality_logs": 1,
    "app/data_quality_logs.py::get_data_quality_stats": 1,
    "app/data_quality_logs.py::get_rejected_jobs": 1,
    "app/enrichment.py::batch_enrich_jobs": 1,
    "app/enrichment_consistency.py::check_consistency": 1,
    "app/enrichment_ground_truth.py::validate_enrichment_accuracy": 1,
    "app/shortlist.py::get_shortlist": 1,
    "app/shortlist.py::toggle_shortlist": 1,
    # Reviewed, not leaks: the except branch cannot run; only our own fixed fetch messages.
    "main.py::healthz": 1,
    "app/sources.py::_policy_head": 1,
}


def _refs(node, name):
    for sub in ast.walk(node):
        if isinstance(sub, ast.Name) and sub.id == name:
            return True
        if (isinstance(sub, ast.Attribute) and sub.attr == "format_exc"
                and isinstance(sub.value, ast.Name) and sub.value.id == "traceback"):
            return True
    return False


def _is_route(func):
    return any(
        isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)
        and d.func.attr in ROUTE_METHODS
        for d in getattr(func, "decorator_list", [])
    )


def _call_name(call):
    f = call.func
    return f.id if isinstance(f, ast.Name) else (f.attr if isinstance(f, ast.Attribute) else "")


def _stored(node, name):
    """In a route: error text kept for the response (dict entry, error variable, append)."""
    assigned = isinstance(node, (ast.Assign, ast.AnnAssign)) and node.value is not None
    if assigned and _refs(node.value, name):
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        for target in targets:
            if isinstance(target, ast.Subscript):
                return True
            words = ("error", "msg", "message")
            if isinstance(target, ast.Name) and any(w in target.id.lower() for w in words):
                return True
    return (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            and node.func.attr in {"append", "extend", "update"} and _refs(node, name))


def _reaches_response(node, name, route):
    if isinstance(node, ast.Raise) and isinstance(node.exc, ast.Call):
        return _call_name(node.exc) == "HTTPException" and _refs(node.exc, name)
    if isinstance(node, ast.Return):
        return node.value is not None and _refs(node.value, name)
    if isinstance(node, ast.Call) and _call_name(node) == "JSONResponse":
        return _refs(node, name)
    return route and _stored(node, name)


def findings():
    counts = Counter()
    files = [BACKEND / "main.py"] + sorted((BACKEND / "app").glob("*.py"))
    for path in files:
        rel = path.relative_to(BACKEND).as_posix()
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for func in ast.walk(tree):
            if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            route = _is_route(func)
            for handler in ast.walk(func):
                if not isinstance(handler, ast.ExceptHandler) or not handler.name:
                    continue
                for stmt in handler.body:
                    for node in ast.walk(stmt):
                        if _reaches_response(node, handler.name, route):
                            counts[f"{rel}::{func.name}"] += 1
    return counts


def test_no_new_exception_text_in_responses():
    found = findings()
    new = {k: v for k, v in found.items() if v > ALLOWED.get(k, 0)}
    assert not new, f"exception text reaches a response in new places (use InternalError): {new}"


def test_converted_functions_leave_the_allowlist():
    found = findings()
    stale = {k: v for k, v in ALLOWED.items() if found.get(k, 0) < v}
    assert not stale, f"fewer findings than allowed; lower or remove these entries: {stale}"
