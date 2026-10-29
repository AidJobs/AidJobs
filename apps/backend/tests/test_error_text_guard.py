"""Security stage 3: no new place may put exception text into an API response.

A static tripwire over app/ and main.py. Inside every `except ... as NAME:` block, in any
function, it finds where NAME (or traceback.format_exc()) reaches a `raise HTTPException(...)`, a
`return`, a `JSONResponse(...)`, a dict entry, an error/message variable, or an append/update.
The last three are counted in every function, not only routes, because the facets leak was a
helper's `base["error"] = str(e)` returned by a public route. It does not follow values through
other variables; it is not a proof of absence, and the runtime leak tests remain the proof.

ALLOWED lists what the stage 3 inventory found on 28 October 2026, per function. Phases 2 and 3
convert them and shrink this list to nothing. A converted function must be removed from it.

DESCRIBERS are reviewed functions that turn an exception into our own words by its type and never
repeat its text; a direct call DESCRIBER(NAME) is not a finding.
"""
import ast
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]

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
    "app/data_quality.py::validate_job": 1,  # a job URL's parse error, in the quality report
    "app/search.py::get_search_settings": 1,
    "app/search.py::reindex_jobs": 1,
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
    # Reviewed, not a leak: the except branch cannot run.
    "main.py::healthz": 1,
    # Reviewed, internal: kept for logs or retries, never returned (ai_service returns None;
    # _search_meilisearch uses the text only for keyword matching).
    "app/ai_service.py::_call_openrouter": 6,
    "app/search.py::_search_meilisearch": 2,
}


DESCRIBERS = {"describe_failure": "app/sources.py", "fetch_message": "app/sources.py"}


def _call_name(call):
    f = call.func
    return f.id if isinstance(f, ast.Name) else (f.attr if isinstance(f, ast.Attribute) else "")


def _describes(node, name):
    """A direct call DESCRIBER(NAME): the exception goes in, only our own words come out."""
    return (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id in DESCRIBERS and not node.keywords
            and [type(a) for a in node.args] == [ast.Name] and node.args[0].id == name)


def _refs(node, name):
    if _describes(node, name):
        return False
    if isinstance(node, ast.Name) and node.id == name:
        return True
    if (isinstance(node, ast.Attribute) and node.attr == "format_exc"
            and isinstance(node.value, ast.Name) and node.value.id == "traceback"):
        return True
    return any(_refs(child, name) for child in ast.iter_child_nodes(node))


def _stored(node, name):
    """Error text kept for later: a dict entry, an error/message variable, an append/update."""
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


def _reaches_response(node, name):
    if isinstance(node, ast.Raise) and isinstance(node.exc, ast.Call):
        return _call_name(node.exc) == "HTTPException" and _refs(node.exc, name)
    if isinstance(node, ast.Return):
        return node.value is not None and _refs(node.value, name)
    if isinstance(node, ast.Call) and _call_name(node) == "JSONResponse":
        return _refs(node, name)
    # In any function, not only routes: the facets leak was a helper's dict entry
    # (base["error"] = str(e)) returned by a public route.
    return _stored(node, name)


def findings():
    counts = Counter()
    files = [BACKEND / "main.py"] + sorted((BACKEND / "app").glob("*.py"))
    for path in files:
        rel = path.relative_to(BACKEND).as_posix()
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for func in ast.walk(tree):
            if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for handler in ast.walk(func):
                if not isinstance(handler, ast.ExceptHandler) or not handler.name:
                    continue
                for stmt in handler.body:
                    for node in ast.walk(stmt):
                        if _reaches_response(node, handler.name):
                            counts[f"{rel}::{func.name}"] += 1
    return counts


def test_no_new_exception_text_in_responses():
    found = findings()
    new = {k: v for k, v in found.items() if v > ALLOWED.get(k, 0)}
    assert not new, f"exception text reaches a response in new places (use InternalError): {new}"


def test_each_describer_is_the_reviewed_one():
    """Each trusted name is defined once, where it was reviewed, and bound nowhere else."""
    defined = Counter()
    for path in [BACKEND / "main.py"] + sorted((BACKEND / "app").glob("*.py")):
        rel = path.relative_to(BACKEND).as_posix()
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                names = [node.name]
            elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                names = [t.id for t in targets if isinstance(t, ast.Name)]
            elif isinstance(node, ast.ImportFrom) and node.module != "app.sources":
                names = [alias.asname or alias.name for alias in node.names]
            elif isinstance(node, ast.Import):
                names = [alias.asname or alias.name for alias in node.names]
            else:
                continue
            for name in names:
                if name in DESCRIBERS:
                    defined[(name, rel)] += 1
    assert defined == Counter({(name, where): 1 for name, where in DESCRIBERS.items()})


def test_converted_functions_leave_the_allowlist():
    found = findings()
    stale = {k: v for k, v in ALLOWED.items() if found.get(k, 0) < v}
    assert not stale, f"fewer findings than allowed; lower or remove these entries: {stale}"
