"""Security stage 3: no new place may put exception text into an API response or a stored message.

A static tripwire over app/, main.py, the link validator and the crawl modules. Inside every
`except ... as NAME:` block, in any function, it finds where NAME (or traceback.format_exc())
reaches a `raise HTTPException(...)`, a `return`, a `JSONResponse(...)`, a dict entry or dict
literal, an error/message variable, an append/update, or a call that stores a crawl outcome
(STORING_CALLS). The dict, variable and append rules are counted in every function, not only
routes, because the facets leak was a helper's `base["error"] = str(e)` returned by a public route,
and the link validator's was a result dict returned later. It does not follow values through
other variables; it is not a proof of absence, and the runtime leak tests remain the proof.

ALLOWED lists what the stage 3 inventory found on 28 October 2026, per function. Phases 2 and 3
convert them and shrink this list to nothing. A converted function must be removed from it.

DESCRIBERS are reviewed functions that turn an exception into our own words by its type and never
repeat its text; a direct call DESCRIBER(NAME) is not a finding. MASKERS are reviewed functions
that keep an exception's text with its secrets masked, for stored crawl messages only; a direct
call MASKER(NAME) or MASKER(NAME, <whole number>) is not a finding.
"""
import ast
from collections import Counter
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]

ALLOWED = {
    # Reviewed, not a leak: the except branch cannot run.
    "main.py::healthz": 1,
    # Reviewed, internal: kept for logs or retries, never returned (ai_service returns None;
    # _search_meilisearch uses the text only for keyword matching).
    "app/ai_service.py::_call_openrouter": 6,
    "app/search.py::_search_meilisearch": 2,
}


DESCRIBERS = {
    "describe_check_failure": "app/job_management.py",
    "describe_failure": "app/sources.py",
    "describe_link_failure": "core/link_validator.py",
    "fetch_message": "contracts/outbound.py",
}

MASKERS = {
    "stored_text": "app/log_safety.py",
}

TRUSTED = {**DESCRIBERS, **MASKERS}

# Outside app/: modules that build admin responses from exception handling.
EXTRA_SCANNED = ["core/link_validator.py"]

# Modules that store crawl outcomes the Crawls and Sources pages show (crawl_logs.message,
# sources.last_crawl_message, failed_inserts.error). The only place a masker may be used.
CRAWL_SCANNED = ["orchestrator.py", "core/extraction_logger.py"]

# Calls whose arguments are stored as a crawl outcome.
STORING_CALLS = {"_failed_result", "log_failed_insert"}


def _crawl_files():
    return ([BACKEND / rel for rel in CRAWL_SCANNED]
            + sorted((BACKEND / "crawler_v2").glob("*.py")))


def _scanned_files():
    return ([BACKEND / "main.py"] + sorted((BACKEND / "app").glob("*.py"))
            + [BACKEND / rel for rel in EXTRA_SCANNED] + _crawl_files())


def _module(rel):
    return rel.removesuffix(".py").replace("/", ".")


def _call_name(call):
    f = call.func
    return f.id if isinstance(f, ast.Name) else (f.attr if isinstance(f, ast.Attribute) else "")


def _describes(node, name):
    """DESCRIBER(NAME), or MASKER(NAME) with at most a whole-number limit: nothing else goes in."""
    if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id in TRUSTED and not node.keywords and node.args
            and isinstance(node.args[0], ast.Name) and node.args[0].id == name):
        return False
    rest = node.args[1:]
    if node.func.id in MASKERS:
        return len(rest) <= 1 and all(
            isinstance(a, ast.Constant) and type(a.value) is int for a in rest)
    return not rest


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


# Their cause argument may hold the exception: it goes only to the log. Any other argument becomes
# the response's text.
CAUSE_ARGUMENT = {"InternalError": 1, "_item_error": 3, "_source_error": 2}


def _message_refs(call, name):
    position = CAUSE_ARGUMENT[_call_name(call)]
    return (any(_refs(arg, name) for i, arg in enumerate(call.args) if i != position)
            or any(_refs(kw.value, name) for kw in call.keywords if kw.arg != "cause"))


def _reaches_response(node, name):
    if isinstance(node, ast.Raise) and isinstance(node.exc, ast.Call):
        if _call_name(node.exc) in CAUSE_ARGUMENT:
            return _message_refs(node.exc, name)
        return _call_name(node.exc) == "HTTPException" and _refs(node.exc, name)
    if isinstance(node, ast.Return):
        return node.value is not None and _refs(node.value, name)
    if isinstance(node, ast.Call) and _call_name(node) in {"JSONResponse", *STORING_CALLS}:
        return _refs(node, name)
    # In any function, not only routes: the facets leak was a helper's dict entry
    # (base["error"] = str(e)) returned by a public route.
    return _stored(node, name)


def _dict_literal(node, name):
    """A dict literal (or dict(...) call) holding the text, e.g. result = {"error": str(e)}."""
    if isinstance(node, ast.Dict):
        return any(value is not None and _refs(value, name) for value in node.values)
    return (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id == "dict" and _refs(node, name))


def _count(node, name, covered=False):
    """Findings in one statement. A dict literal inside another finding is part of it."""
    found = _reaches_response(node, name)
    literal = not covered and not found and _dict_literal(node, name)
    inside = covered or found or literal
    return found + literal + sum(_count(child, name, inside)
                                 for child in ast.iter_child_nodes(node))


def findings():
    counts = Counter()
    for path in _scanned_files():
        rel = path.relative_to(BACKEND).as_posix()
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for func in ast.walk(tree):
            if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for handler in ast.walk(func):
                if not isinstance(handler, ast.ExceptHandler) or not handler.name:
                    continue
                for stmt in handler.body:
                    hits = _count(stmt, handler.name)
                    if hits:
                        counts[f"{rel}::{func.name}"] += hits
    return counts


def test_no_new_exception_text_in_responses():
    found = findings()
    new = {k: v for k, v in found.items() if v > ALLOWED.get(k, 0)}
    assert not new, f"exception text reaches a response in new places (use InternalError): {new}"


def _import_bindings(node):
    """An import of a describer from its reviewed home, under its own name, binds nothing new."""
    if isinstance(node, ast.Import):
        yield from (alias.asname or alias.name.split(".")[0] for alias in node.names)
        return
    for alias in node.names:
        if alias.name == "*":
            yield from TRUSTED  # the names it binds are unknown, so it binds every trusted name
            continue
        home = TRUSTED.get(alias.name)
        if alias.asname or home is None or node.level or node.module != _module(home):
            yield alias.asname or alias.name


def _bindings(tree):
    """Every name a module defines or binds, in any form, and names set by attribute or key."""
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            yield node.name
        elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            yield node.id  # assignment, unpacking, for, with, walrus, del
        elif isinstance(node, ast.arg):
            yield node.arg  # parameters, lambda arguments included
        elif isinstance(node, ast.ExceptHandler) and node.name:
            yield node.name
        elif isinstance(node, (ast.MatchAs, ast.MatchStar)) and node.name:
            yield node.name
        elif isinstance(node, ast.MatchMapping) and node.rest:
            yield node.rest
        elif isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store):
            yield node.attr  # builtins.NAME = ..., module.NAME = ...
        elif (isinstance(node, ast.Subscript) and isinstance(node.ctx, ast.Store)
              and isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str)):
            yield node.slice.value  # globals()["NAME"] = ...
        elif (isinstance(node, ast.Call) and _call_name(node) == "setattr" and len(node.args) > 1
              and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, str)):
            yield node.args[1].value
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            yield from _import_bindings(node)


def _describer_bindings(source):
    return Counter(name for name in _bindings(ast.parse(source)) if name in TRUSTED)


def test_each_describer_is_the_reviewed_one():
    """Each trusted name is defined once, where it was reviewed, and bound nowhere else."""
    defined = Counter()
    homes = [BACKEND / rel for rel in sorted(set(TRUSTED.values()))]
    for path in sorted(set(_scanned_files()) | set(homes)):
        rel = path.relative_to(BACKEND).as_posix()
        for name, count in _describer_bindings(path.read_text(encoding="utf-8")).items():
            defined[(name, rel)] += count
    assert defined == Counter({(name, where): 1 for name, where in TRUSTED.items()})


@pytest.mark.parametrize("source", [
    "def describe_failure(error):\n    return str(error)\n",
    "async def describe_failure(error):\n    return str(error)\n",
    "class describe_failure:\n    pass\n",
    "describe_failure = str\n",
    "describe_failure: object = str\n",
    "describe_failure, other = str, 1\n",
    "[describe_failure] = [str]\n",
    "for describe_failure in [str]:\n    pass\n",
    "with open('x') as describe_failure:\n    pass\n",
    "if (describe_failure := str):\n    pass\n",
    "def route(describe_failure=str):\n    pass\n",
    "route = lambda describe_failure: describe_failure\n",
    "try:\n    pass\nexcept Exception as describe_failure:\n    pass\n",
    "match value:\n    case [*describe_failure]:\n        pass\n",
    "from app.helpers import describe_failure\n",
    "from contracts.outbound import fetch_message as describe_failure\n",
    "from app.sources import describe_failure as describe_failure\n",
    "from .sources import describe_failure\n",
    "from app.sources import *\n",
    "import describe_failure\n",
    "import app.helpers as describe_failure\n",
    "globals()['describe_failure'] = str\n",
    "import builtins\nbuiltins.describe_failure = str\n",
    "import builtins\nsetattr(builtins, 'describe_failure', str)\n",
])
def test_a_second_binding_of_a_describer_is_found(source):
    assert _describer_bindings(source)["describe_failure"] >= 1


def test_an_import_from_the_reviewed_home_binds_nothing_new():
    assert _describer_bindings("from app.sources import describe_failure\n") == Counter()
    assert _describer_bindings("from contracts.outbound import fetch_message\n") == Counter()
    assert _describer_bindings("from contracts.outbound import fetch_message as fm\n") == Counter()


def test_exception_text_in_an_internal_error_message_is_found():
    source = (
        "def route():\n"
        "    try:\n"
        "        work()\n"
        "    except Exception as e:\n"
        "        raise InternalError(f'Failed to work: {e}', cause=e)\n"
    )
    assert _findings_in(source) == {"core/link_validator.py::route": 1}
    helper = source.replace("InternalError(f'Failed to work: {e}', cause=e)",
                            "_item_error(f'Failed: {e}', 'job', job_id, e)")
    assert _findings_in(helper) == {"core/link_validator.py::route": 1}
    safe = source.replace("f'Failed to work: {e}'", "'Failed to work'")
    assert _findings_in(safe) == {}
    positional = source.replace("cause=e", "e")
    assert _findings_in(positional.replace("f'Failed to work: {e}'", "'Failed to work'")) == {}
    keyword = source.replace("InternalError(f'Failed to work: {e}', cause=e)",
                             "InternalError(message=f'Failed to work: {e}', cause=e)")
    assert _findings_in(keyword) == {"core/link_validator.py::route": 1}
    status = source.replace("InternalError(f'Failed to work: {e}', cause=e)",
                            "InternalError('Failed to work', cause=e, status_code=len(str(e)))")
    assert _findings_in(status) == {"core/link_validator.py::route": 1}


def _findings_in(source, rel="core/link_validator.py"):
    """findings() over one in-memory source, for the tests of the rules themselves."""
    counts = Counter()
    for func in ast.walk(ast.parse(source)):
        if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for handler in ast.walk(func):
            if isinstance(handler, ast.ExceptHandler) and handler.name:
                for stmt in handler.body:
                    counts[f"{rel}::{func.name}"] += _count(stmt, handler.name)
    return +counts


def test_a_result_dict_with_exception_text_is_found():
    """Link validation's shape on main: the text in a dict literal, returned after the except."""
    source = (
        "def validate_url(url):\n"
        "    try:\n"
        "        check(url)\n"
        "    except Exception as e:\n"
        "        result = {'valid': False, 'error': f'Validation error: {str(e)}'}\n"
        "        return result\n"
    )
    assert _findings_in(source) == {"core/link_validator.py::validate_url": 1}
    described = source.replace("f'Validation error: {str(e)}'", "describe_link_failure(e)")
    assert _findings_in(described) == {}


def test_a_dict_inside_a_finding_is_counted_once():
    source = (
        "def route():\n"
        "    try:\n"
        "        work()\n"
        "    except Exception as e:\n"
        "        return {'error': str(e), 'nested': {'why': str(e)}}\n"
    )
    assert _findings_in(source) == {"core/link_validator.py::route": 1}


def test_the_link_validator_is_scanned():
    assert BACKEND / "core/link_validator.py" in _scanned_files()
    assert not {k for k in findings() if k.startswith("core/link_validator.py::")}


def test_the_crawl_modules_are_scanned():
    scanned = set(_scanned_files())
    crawl = set(_crawl_files())
    assert BACKEND / "orchestrator.py" in crawl and BACKEND / "core/extraction_logger.py" in crawl
    assert {BACKEND / "crawler_v2" / f"{n}.py" for n in ("simple_crawler", "rss_crawler",
                                                       "api_crawler")} <= crawl
    assert crawl <= scanned
    rels = {p.relative_to(BACKEND).as_posix() for p in crawl}
    assert not {k for k in findings() if k.split("::")[0] in rels}


def _masker_calls(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return [node.lineno for node in ast.walk(tree)
            if isinstance(node, ast.Call) and _call_name(node) in MASKERS]


def test_a_masker_is_used_only_where_crawl_outcomes_are_stored():
    """Responses get fixed text (InternalError); only stored crawl outcomes keep masked text."""
    crawl = set(_crawl_files())
    outside = {path.relative_to(BACKEND).as_posix(): _masker_calls(path)
               for path in _scanned_files() if path not in crawl}
    assert not {rel: lines for rel, lines in outside.items() if lines}
    assert sum(len(_masker_calls(path)) for path in crawl) == 6


@pytest.mark.parametrize("stored, found", [
    ("result = _failed_result(str(exc)[:500])", 1),
    ("result = _failed_result(stored_text(exc, 500))", 0),
    ("result = _failed_result(f'Failed: {stored_text(exc)}')", 0),
    ("result = _failed_result(stored_text(exc, len(str(exc))))", 1),
    ("result = _failed_result(stored_text(exc, limit=500))", 1),
    ("result = _failed_result(stored_text(exc, 500, exc))", 1),
    ("result = _failed_result(stored_text(str(exc), 500))", 1),
    ("result = _failed_result(describe_failure(exc, 500))", 1),
    ("logger.log_failed_insert(source_url=url, error=str(exc))", 1),
    ("return {'status': 'failed', 'message': str(exc)[:200]}", 1),
    ("return {'status': 'failed', 'message': stored_text(exc, 200)}", 0),
    ("error_msg = f'Unexpected error processing job: {str(exc)}'", 1),
    ("error_msg = f'Unexpected error processing job: {stored_text(exc)}'", 0),
])
def test_stored_crawl_outcomes_are_found_unless_masked(stored, found):
    source = (
        "def crawl(source):\n"
        "    try:\n"
        "        work()\n"
        "    except Exception as exc:\n"
        f"        {stored}\n"
    )
    assert sum(_findings_in(source, "orchestrator.py").values()) == found


def test_converted_functions_leave_the_allowlist():
    found = findings()
    stale = {k: v for k, v in ALLOWED.items() if found.get(k, 0) < v}
    assert not stale, f"fewer findings than allowed; lower or remove these entries: {stale}"
