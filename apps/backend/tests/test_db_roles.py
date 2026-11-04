"""The database roles of security plan stage 6: infra/roles/*.sql, the SCRAM statement helper,
and the read-only check. No database: the grants are checked against the backend's own SQL.

The application role, aidjobs_app, must hold exactly what the code uses: a table the code
starts to read or write without a grant fails here, and so does a grant the code no longer
needs. The read-only role, aidjobs_readonly, reads every production table but the personal
ones. tests/test_crawl_ownership.py runs the crawl as aidjobs_app against PostgreSQL in CI.
"""

import base64
import hashlib
import hmac
import importlib.util
import io
import re
from pathlib import Path

import pytest

from tests.role_grants import GRANTS_FILE, ROLES_DIR, privileges_by_role, table_grants

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parents[1]
INFRA = REPO / "infra"
CODE = [p for d in ("app", "core", "crawler_v2", "pipeline", "contracts", "security")
        for p in sorted((BACKEND / d).rglob("*.py"))]
CODE += [BACKEND / "main.py", BACKEND / "orchestrator.py"]

# Production's public tables, read only on 5 November 2026 (security plan, stage 6).
PRODUCTION_TABLES = frozenset("""
    benefits clusters contracts countries crawl_locks crawl_logs crisis_types domain_policies
    donors enrichment_feedback enrichment_ground_truth enrichment_history enrichment_reviews
    extraction_logs failed_inserts find_earn_submissions findearn_submissions functional
    job_deletion_audit jobs jobs_side levels link_validations missions org_types payments
    policy_flags raw_pages response_phases rewards robots_cache shortlists sources synonyms tags
    takedowns users work_modalities
""".split())
# Created in production before the schema was kept in infra/ (verified there, 5 November 2026).
TABLES_OUTSIDE_MIGRATIONS = frozenset({"jobs_side", "findearn_submissions"})
# Decided by the user, 5 November 2026: the read-only login never reads these.
PERSONAL_TABLES = frozenset({
    "users", "payments", "find_earn_submissions", "findearn_submissions",
})
# The application never uses these.
NOT_FOR_THE_APP = PERSONAL_TABLES | {"takedowns", "rewards", "job_deletion_audit"}
# The migrations before the roles existed; every later one grants its new tables itself.
BASELINE_MIGRATIONS = frozenset({
    "supabase.sql", "migration_fix_sources_table.sql", "add_country_city_columns.sql",
    "add_job_deletion_audit.sql", "add_operation_index.sql", "gate8_organisations.sql",
    "gate8_organisation_foreign_keys.sql", "phase2_observability.sql", "phase4_geocoding.sql",
    "phase4_quality_scoring.sql",
})
# SQL whose table is a variable: pipeline/db_insert.py writes self.jobs_table (JOBS_TABLE,
# default jobs; Render does not set it); app/pipeline_api.py reads jobs or, in shadow mode,
# jobs_side.
DYNAMIC_TABLES = {
    "pipeline/db_insert.py": {"jobs": {"SELECT", "INSERT", "UPDATE"}},
    "app/pipeline_api.py": {"jobs": {"SELECT"}, "jobs_side": {"SELECT"}},
}
ALLOWED_PRIVILEGES = {"SELECT", "INSERT", "UPDATE", "DELETE"}

# SQL in this code base is written in capitals; Python's own "from" and "import" are not.
_STATEMENTS = {
    "SELECT": re.compile(r"\b(?:FROM|JOIN)\s+(?:public\.)?([a-z_][a-z0-9_]*)\b"),
    "INSERT": re.compile(r"\bINSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\b"),
    "UPDATE": re.compile(
        r"\bUPDATE\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+(?:(?:AS\s+)?[a-z_]\w*\s+)?SET\b"),
    "DELETE": re.compile(r"\bDELETE\s+FROM\s+(?:public\.)?([a-z_][a-z0-9_]*)\b"),
    "TRUNCATE": re.compile(r"\bTRUNCATE\s+(?:TABLE\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\b"),
}
_UPSERT_UPDATE = re.compile(r"ON\s+CONFLICT\b[^;]*?\bDO\s+UPDATE\b", re.S)
# Row locks need UPDATE on the table they lock (PostgreSQL, SELECT, "The Locking Clause").
_ROW_LOCK = re.compile(r"\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b")
_DYNAMIC = re.compile(r"\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+\{")


def _migration_files():
    return [INFRA / "supabase.sql", INFRA / "migration_fix_sources_table.sql",
            *sorted((INFRA / "migrations").glob("*.sql"))]


def _created_tables(sql):
    return {m.group(1).lower() for m in re.finditer(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\"?([a-z_][a-z0-9_]*)", sql, re.I)}


def _migration_tables():
    tables = set()
    for path in _migration_files():
        tables |= _created_tables(path.read_text(encoding="utf-8"))
    return tables


def _code_needs():
    """{table: {privilege}} from the code's SQL, for production tables."""
    needs: dict[str, set[str]] = {}
    for path in CODE:
        text = path.read_text(encoding="utf-8")
        for privilege, pattern in _STATEMENTS.items():
            for m in pattern.finditer(text):
                table = m.group(1)
                if table not in PRODUCTION_TABLES:
                    continue
                needs.setdefault(table, set()).add(privilege)
                if privilege == "INSERT":
                    tail = text[m.end():m.end() + 1500]
                    tail = re.split(r'"""|INSERT\s+INTO', tail, maxsplit=1)[0]
                    if _UPSERT_UPDATE.search(tail):
                        needs[table].add("UPDATE")
        for m in _ROW_LOCK.finditer(text):
            head = text[max(0, m.start() - 800):m.start()]
            head = head[head.rfind("SELECT"):] if "SELECT" in head else ""
            for t in _STATEMENTS["SELECT"].findall(head):
                if t in PRODUCTION_TABLES:
                    needs.setdefault(t, set()).add("UPDATE")
        relative = path.relative_to(BACKEND).as_posix()
        for table, privileges in DYNAMIC_TABLES.get(relative, {}).items():
            needs.setdefault(table, set()).update(privileges)
    for privileges in needs.values():
        privileges.add("SELECT")  # WHERE and RETURNING read the rows they write
    return needs


def _load_script(name):
    spec = importlib.util.spec_from_file_location(name, BACKEND / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# The grants against the code.
# ---------------------------------------------------------------------------


def test_every_grant_statement_in_the_file_is_read():
    text = re.sub(r"--[^\n]*", "", GRANTS_FILE.read_text(encoding="utf-8"))
    assert text.count("GRANT ") == len(table_grants()) + 1  # + USAGE ON SCHEMA public
    assert re.search(r"GRANT USAGE ON SCHEMA public TO aidjobs_app, aidjobs_readonly;", text)
    revoke = "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM aidjobs_app, aidjobs_readonly;"
    assert text.index(revoke) < text.index("GRANT ")
    assert text.strip().startswith("BEGIN;") and text.strip().endswith("COMMIT;")


def test_the_code_scan_finds_the_tables_it_is_known_to_use():
    needs = _code_needs()
    assert needs["jobs"] == {"SELECT", "INSERT", "UPDATE", "DELETE"}
    # UPDATE: a takeover locks the row FOR UPDATE.
    assert needs["crawl_locks"] == {"SELECT", "INSERT", "UPDATE", "DELETE"}
    assert needs["robots_cache"] == {"SELECT", "INSERT", "UPDATE"}  # an upsert
    assert needs["shortlists"] == {"SELECT"}
    assert "contracts" not in needs  # Python's "from contracts.x import" is not SQL
    assert not any("TRUNCATE" in p for p in needs.values())


def test_the_application_role_holds_exactly_what_the_code_uses():
    granted = privileges_by_role()["aidjobs_app"]
    needs = _code_needs()
    missing = {t: sorted(p - granted.get(t, set()))
               for t, p in needs.items() if p - granted.get(t, set())}
    extra = {t: sorted(p - needs.get(t, set()))
             for t, p in granted.items() if p - needs.get(t, set())}
    assert not missing, f"the code uses these without a grant in 02_grants.sql: {missing}"
    assert not extra, f"02_grants.sql grants what the code does not use: {extra}"


def test_sql_with_a_variable_table_is_only_where_it_is_known():
    found = {p.relative_to(BACKEND).as_posix()
             for p in CODE if _DYNAMIC.search(p.read_text(encoding="utf-8"))}
    assert found == set(DYNAMIC_TABLES)


def test_the_application_role_has_nothing_on_personal_or_unused_tables():
    assert not NOT_FOR_THE_APP & set(privileges_by_role()["aidjobs_app"])


def test_the_read_only_role_reads_every_production_table_but_the_personal_ones():
    granted = privileges_by_role()["aidjobs_readonly"]
    assert set(granted) == PRODUCTION_TABLES - PERSONAL_TABLES
    assert all(p == {"SELECT"} for p in granted.values())
    assert not PERSONAL_TABLES & set(granted)


def test_only_select_insert_update_and_delete_are_granted():
    for privileges, _, roles in table_grants():
        assert privileges <= ALLOWED_PRIVILEGES
        assert set(roles) <= {"aidjobs_app", "aidjobs_readonly"}
    text = GRANTS_FILE.read_text(encoding="utf-8")
    for refused in (r"GRANT\s+ALL", r"DEFAULT\s+PRIVILEGES", r"ON\s+SEQUENCE", r"ON\s+FUNCTION",
                    r"ON\s+ALL\s+(?:SEQUENCES|FUNCTIONS|ROUTINES)",
                    r"GRANT\s+[^;]*\bTO\s+(?:PUBLIC|anon|authenticated)\b"):
        assert not re.search(refused, text), refused


def test_grants_name_only_production_tables_from_the_migrations():
    granted = set().union(*(set(t) for t in privileges_by_role().values()))
    known = _migration_tables() | TABLES_OUTSIDE_MIGRATIONS
    assert granted <= PRODUCTION_TABLES
    assert granted <= known, f"granted but in no migration: {sorted(granted - known)}"


def test_production_tables_are_the_migrations_tables():
    migrations = _migration_tables()
    assert PRODUCTION_TABLES <= migrations | TABLES_OUTSIDE_MIGRATIONS
    assert not TABLES_OUTSIDE_MIGRATIONS & migrations  # once in a migration, drop it from the list
    assert migrations - PRODUCTION_TABLES == {"organisations"}  # Gate 8, not applied in production


def test_a_new_migration_grants_its_own_tables_as_02_does():
    granted = privileges_by_role()
    for path in sorted((INFRA / "migrations").glob("*.sql")):
        if path.name in BASELINE_MIGRATIONS:
            continue
        sql = path.read_text(encoding="utf-8")
        in_migration = privileges_by_role(sql)
        for table in _created_tables(sql):
            readable = table in granted["aidjobs_readonly"] or table in PERSONAL_TABLES
            assert readable, (path.name, table)
            for role in ("aidjobs_app", "aidjobs_readonly"):
                assert in_migration[role].get(table, set()) == granted[role].get(table, set()), (
                    f"{path.name}: the grants on {table} to {role} must match 02_grants.sql")


def test_the_ci_stub_tables_are_the_production_tables():
    sql = (BACKEND / "tests" / "sql" / "role_stub_tables.sql").read_text(encoding="utf-8")
    assert _created_tables(sql) == PRODUCTION_TABLES
    assert sql.count("ENABLE ROW LEVEL SECURITY") == len(PRODUCTION_TABLES)


# ---------------------------------------------------------------------------
# The role files.
# ---------------------------------------------------------------------------


def test_no_role_file_holds_a_password():
    for path in sorted(ROLES_DIR.glob("*.sql")):
        assert not re.search(r"\bPASSWORD\s+'", path.read_text(encoding="utf-8"), re.I), path.name


def test_the_roles_have_the_planned_attributes_and_settings():
    sql = re.sub(r"--[^\n]*", "", (ROLES_DIR / "01_create_roles.sql").read_text(encoding="utf-8"))
    flat = " ".join(sql.split())
    for role, limit in (("aidjobs_app", 15), ("aidjobs_readonly", 2)):
        created = re.search(rf"CREATE ROLE {role} WITH ([^;]+);", flat).group(1).split()
        assert {"LOGIN", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOINHERIT",
                "NOREPLICATION", "BYPASSRLS"} <= set(created)
        assert f"LIMIT {limit}" in " ".join(created)
        altered = re.search(rf"ALTER ROLE {role} WITH ([^;]+);", flat).group(1)
        assert "SUPERUSER" not in altered  # refused from a non-superuser on PostgreSQL 16 and later
        assert f"CONNECTION LIMIT {limit}" in altered and "BYPASSRLS" in altered
    settings = dict(re.findall(r"ALTER ROLE (aidjobs_\w+ SET \w+) = ([^;]+);", flat))
    assert settings == {
        "aidjobs_app SET statement_timeout": "'60s'",
        "aidjobs_app SET idle_in_transaction_session_timeout": "'5min'",
        "aidjobs_readonly SET default_transaction_read_only": "on",
        "aidjobs_readonly SET statement_timeout": "'15s'",
        "aidjobs_readonly SET idle_in_transaction_session_timeout": "'30s'",
    }


def test_the_verify_file_only_reads():
    sql = re.sub(r"--[^\n]*", "", (ROLES_DIR / "03_verify.sql").read_text(encoding="utf-8"))
    code = re.sub(r"'[^']*'", "''", sql)  # privilege names such as 'INSERT' are only text here
    assert code.lstrip().startswith("WITH")
    assert code.count(";") == 1
    writes = r"\b(INSERT|UPDATE|DELETE|GRANT|REVOKE|ALTER|CREATE|DROP|SET|TRUNCATE)\b"
    assert not re.search(writes, code)


def test_the_rollback_revokes_before_it_drops():
    sql = (ROLES_DIR / "04_rollback.sql").read_text(encoding="utf-8")
    assert sql.index("REVOKE ALL ON ALL TABLES") < sql.index("DROP ROLE")
    assert "IF EXISTS (SELECT 1 FROM pg_roles" in sql


# ---------------------------------------------------------------------------
# The password helper.
# ---------------------------------------------------------------------------

# PostgreSQL 17.6's own verifier for this made-up password (CREATE ROLE ... PASSWORD, read from
# pg_authid in a throwaway local cluster, 5 November 2026).
VECTOR_TEXT = "FakeVectorOnly0000000000AidJobs0"
VECTOR = ("SCRAM-SHA-256$4096:BELu4QTYF/UMVJxq79slPA=="  # gitleaks:allow
          "$g1mYikvg544x+RXsoZ8l9MSDq/FwVCDIe5MZzIepNHc="  # gitleaks:allow
          ":UnsxPBgZqAi9a2p+MnUGZRJtvXj9tTLOBCs/3Fu2Wr0=")  # gitleaks:allow


def test_the_verifier_matches_postgresqls_own():
    helper = _load_script("db_role_password")
    salt = base64.b64decode(VECTOR.split(":", 1)[1].split("$", 1)[0])
    assert helper.scram_verifier(VECTOR_TEXT, salt) == VECTOR


def test_the_verifier_is_rfc_5802():
    helper = _load_script("db_role_password")
    salt = bytes(range(16))
    head, keys = helper.scram_verifier("A" * 30, salt, 4096).split("$", 2)[1:]
    assert head == "4096:" + base64.b64encode(salt).decode()
    salted = hashlib.pbkdf2_hmac("sha256", b"A" * 30, salt, 4096)
    stored, server = (base64.b64decode(k) for k in keys.split(":"))
    client = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
    assert stored == hashlib.sha256(client).digest()
    assert server == hmac.new(salted, b"Server Key", hashlib.sha256).digest()


def test_the_statement_never_holds_the_password_and_uses_a_fresh_salt():
    helper = _load_script("db_role_password")
    secret = "Zq" * 20
    first = helper.statement("aidjobs_readonly", secret)
    second = helper.statement("aidjobs_readonly", secret)
    assert secret not in first
    shape = r"ALTER ROLE aidjobs_readonly WITH PASSWORD 'SCRAM-SHA-256\$4096:[^']+';"
    assert re.fullmatch(shape, first)
    assert first != second


@pytest.mark.parametrize("bad", [
    "short1", "x" * 23, "has space" + "x" * 20, "punct!" + "x" * 30, "é" * 30, "x" * 129,
])
def test_the_helper_refuses_a_password_outside_letters_and_digits(bad):
    helper = _load_script("db_role_password")
    with pytest.raises(ValueError):
        helper.statement("aidjobs_app", bad)


def test_the_helper_refuses_another_role():
    helper = _load_script("db_role_password")
    with pytest.raises(ValueError):
        helper.statement("postgres", "A" * 30)


def test_the_helper_prints_only_the_statement(capsys):
    helper = _load_script("db_role_password")
    secret = "Mx7" * 12
    assert helper.main(["--role", "aidjobs_app"], stdin=io.StringIO(secret + "\n")) == 0
    out, err = capsys.readouterr()
    assert secret not in out + err
    assert re.fullmatch(r"ALTER ROLE aidjobs_app WITH PASSWORD 'SCRAM-SHA-256\$[^']+';\n", out)
    piped = io.StringIO("\ufeff" + secret + "\r\n")  # Windows PowerShell's byte-order mark
    assert helper.main(["--role", "aidjobs_app"], stdin=piped) == 0
    assert capsys.readouterr().out.startswith("ALTER ROLE aidjobs_app WITH PASSWORD 'SCRAM-")
    assert helper.main(["--role", "aidjobs_app"], stdin=io.StringIO("short\n")) == 2
    out, err = capsys.readouterr()
    assert out == "" and "short" not in err.replace("refused", "")


# ---------------------------------------------------------------------------
# The read-only check.
# ---------------------------------------------------------------------------

FAKE_TEXT = "fake-" + "not-a-password"  # made up, and built at run time
FAKE_URL = f"postgresql://aidjobs_readonly.example:{FAKE_TEXT}@db.example.invalid:5432/postgres"


class _Cursor:
    def __init__(self, conn):
        self.conn = conn
        self.result = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql):
        assert self.conn.read_only_set, "a query ran before set_session(readonly=True)"
        self.conn.executed.append(sql)
        if self.conn.fail_on and self.conn.fail_on in sql:
            raise RuntimeError("relation at db.example.invalid does not exist")
        answers = {"SHOW transaction_read_only": self.conn.read_only,
                   "SELECT current_user": self.conn.role,
                   "SHOW default_transaction_read_only": "on"}
        self.result = answers.get(sql, 7)

    def fetchone(self):
        return (self.result,)


class _Conn:
    def __init__(self, read_only="on", role="aidjobs_readonly", fail_on=None):
        self.read_only, self.role, self.fail_on = read_only, role, fail_on
        self.read_only_set = False
        self.executed = []
        self.closed = self.rolled_back = False

    def set_session(self, readonly=None):
        assert readonly is True
        self.read_only_set = True

    def cursor(self):
        return _Cursor(self)

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def _check(conn=None, environ=None, connect=None):
    check = _load_script("db_readonly_check")
    lines = []
    connect = connect or (lambda url, **kwargs: conn)
    environ = {"AIDJOBS_READONLY_DB_URL": FAKE_URL} if environ is None else environ
    code = check.main(environ=environ, connect=connect, out=lines.append)
    text = "\n".join(lines)
    assert FAKE_TEXT not in text and "example" not in text
    return code, lines


def test_the_check_prints_counts_after_proving_the_session_read_only():
    conn = _Conn()
    code, lines = _check(conn)
    assert code == 0
    assert lines == [
        "transaction_read_only: on", "role: aidjobs_readonly", "role default read-only: on",
        "crawl locks: 7", "running runs: 7", "jobs: 7", "open jobs: 7", "sources: 7",
    ]
    assert conn.executed[:2] == ["SHOW transaction_read_only", "SELECT current_user"]
    allowed = ("SHOW", "SELECT", "SET LOCAL statement_timeout")
    assert all(s.startswith(allowed) for s in conn.executed)
    assert conn.rolled_back and conn.closed


def test_the_check_stops_when_the_session_is_not_read_only():
    conn = _Conn(read_only="off")
    code, lines = _check(conn)
    assert code == 1 and lines[-1] == "refused: the session is not read-only"
    assert conn.executed == ["SHOW transaction_read_only"] and conn.closed


def test_the_check_stops_when_signed_in_as_another_role():
    conn = _Conn(role="postgres")
    code, lines = _check(conn)
    assert code == 1 and lines[-1] == "refused: signed in as postgres, not aidjobs_readonly"
    assert not any("COUNT" in s for s in conn.executed)


def test_the_check_needs_the_variable_and_reads_no_env_file():
    code, lines = _check(environ={}, connect=lambda *a, **k: pytest.fail("connected"))
    assert code == 2 and "AIDJOBS_READONLY_DB_URL is not set" in lines[0]
    source = (BACKEND / "scripts" / "db_readonly_check.py").read_text(encoding="utf-8")
    assert "dotenv" not in source and ".env" not in source.replace("os.environ", "")


def test_the_check_shows_no_error_text():
    def refuse(url, **kwargs):
        raise RuntimeError(f"could not connect to server at {url}")

    assert _check(connect=refuse) == (1, ["could not connect (RuntimeError)"])
    conn = _Conn(fail_on="FROM jobs")
    code, lines = _check(conn)
    assert code == 1 and lines[-1] == "check failed (RuntimeError)" and conn.closed
