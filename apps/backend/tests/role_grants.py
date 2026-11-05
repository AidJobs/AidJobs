"""Reads infra/roles/02_grants.sql (security plan, stage 6): used by tests/test_db_roles.py and,
to give the test database the same grants, by tests/test_crawl_ownership.py."""

import re
from pathlib import Path

ROLES_DIR = Path(__file__).resolve().parents[3] / "infra" / "roles"
GRANTS_FILE = ROLES_DIR / "02_grants.sql"
ROLES = ("aidjobs_app", "aidjobs_readonly")

_GRANT = re.compile(
    r"GRANT\s+(?P<privileges>[A-Z ,]+?)\s+ON\s+TABLE\s+(?P<tables>[a-z_., \n]+?)\s+TO\s+"
    r"(?P<roles>[a-z_, ]+?)\s*;",
    re.S,
)


def _strip_comments(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


Grant = tuple[frozenset[str], tuple[str, ...], tuple[str, ...]]


def table_grants(sql: str | None = None) -> list[Grant]:
    """(privileges, tables without the public. prefix, roles) for each GRANT ... ON TABLE."""
    text = _strip_comments(GRANTS_FILE.read_text(encoding="utf-8") if sql is None else sql)
    grants = []
    for m in _GRANT.finditer(text):
        privileges = frozenset(p.strip() for p in m.group("privileges").split(","))
        tables = tuple(t.strip().removeprefix("public.") for t in m.group("tables").split(","))
        roles = tuple(r.strip() for r in m.group("roles").split(","))
        grants.append((privileges, tables, roles))
    return grants


def privileges_by_role(sql: str | None = None) -> dict[str, dict[str, set[str]]]:
    """{role: {table: {privilege, ...}}} granted on tables."""
    result: dict[str, dict[str, set[str]]] = {role: {} for role in ROLES}
    for privileges, tables, roles in table_grants(sql):
        for role in roles:
            for table in tables:
                result.setdefault(role, {}).setdefault(table, set()).update(privileges)
    return result


def statements_for_tables(existing: set[str]) -> list[str]:
    """The file's statements, with each GRANT ON TABLE narrowed to the tables in `existing`
    (a test database holds only some of production's tables). BEGIN and COMMIT are left out:
    the caller runs them on an autocommit connection."""
    text = _strip_comments(GRANTS_FILE.read_text(encoding="utf-8"))
    statements = []
    for raw in text.split(";"):
        statement = " ".join(raw.split())
        if not statement or statement in ("BEGIN", "COMMIT"):
            continue
        m = _GRANT.fullmatch(statement + ";")
        if m:
            privileges, tables, roles = table_grants(statement + ";")[0]
            kept = [t for t in tables if t in existing]
            if not kept:
                continue
            statement = (f"GRANT {', '.join(sorted(privileges))} ON TABLE "
                         f"{', '.join('public.' + t for t in kept)} TO {', '.join(roles)}")
        statements.append(statement)
    return statements
