"""The scheduler quality query must bind one parameter.

psycopg2 treats a single % as a placeholder. LIKE wildcards have to be
written as %% or execute() raises IndexError before PostgreSQL sees the query.
"""
from app.source_health import SourceHealthScorer


class _Cursor:
    def __init__(self):
        self.query = None
        self.params = None

    def execute(self, query, params=None):
        self.query = query
        self.params = params

    def fetchone(self):
        return {"total_jobs": 0, "null_urls": 0, "listing_urls": 0}


def _placeholder_count(sql: str) -> int:
    count = 0
    index = 0
    while index < len(sql):
        if sql[index] != "%":
            index += 1
            continue
        if index + 1 < len(sql) and sql[index + 1] == "%":
            index += 2
            continue
        count += 1
        index += 1
    return count


def test_quality_query_has_one_bound_placeholder():
    cursor = _Cursor()
    score = SourceHealthScorer("postgres://unused")._calculate_quality(cursor, "source-1")

    assert score == 50.0
    assert cursor.params == ("source-1",)
    assert _placeholder_count(cursor.query) == 1
    assert "LIKE '%%/jobs%%'" in cursor.query
    assert "LIKE '%%/careers%%'" in cursor.query
    assert "LIKE '%%/vacancies%%'" in cursor.query
    assert "source_id::text = %s" in cursor.query


def test_null_org_type_does_not_raise_in_priority():
    """SQL NULL arrives as None. A missing type gets no UN/INGO boost."""
    scorer = SourceHealthScorer("postgres://unused")
    priority = scorer._calculate_priority(50, {"org_type": None}, 50)
    assert priority == 5
