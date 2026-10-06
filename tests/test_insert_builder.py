"""
Unit tests for DB insert builder logic.
Tests field/placeholder alignment, especially with quality scoring fields.
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))


def build_insert_fields_and_placeholders(job_data: dict, include_quality: bool = False) -> tuple:
    """
    Simulates the insert builder logic from simple_crawler.py.
    Returns (fields, placeholders, sql_values) tuple.
    """
    insert_fields = []
    insert_values = []
    
    def append_field_value(field_name, value):
        """Helper to ensure field/value pairs stay aligned."""
        insert_fields.append(field_name)
        insert_values.append(value)
    
    # Required fields
    append_field_value("source_id", job_data.get("source_id", "test-source-id"))
    append_field_value("org_name", job_data.get("org_name", "Test Org"))
    append_field_value("title", job_data.get("title", "Test Job"))
    append_field_value("apply_url", job_data.get("apply_url", "https://example.com/job"))
    append_field_value("location_raw", job_data.get("location_raw"))
    append_field_value("canonical_hash", job_data.get("canonical_hash", "test-hash"))
    append_field_value("status", "active")
    append_field_value("fetched_at", "NOW()")
    append_field_value("last_seen_at", "NOW()")
    
    # Optional deadline
    if job_data.get("deadline"):
        append_field_value("deadline", job_data["deadline"])
    
    # Quality scoring fields (if enabled)
    if include_quality:
        has_quality = False
        if job_data.get("quality_score") is not None:
            append_field_value("quality_score", job_data["quality_score"])
            has_quality = True
        if job_data.get("quality_grade"):
            append_field_value("quality_grade", job_data["quality_grade"])
            has_quality = True
        if job_data.get("quality_factors"):
            import json
            append_field_value("quality_factors", json.dumps(job_data["quality_factors"]))
            has_quality = True
        if job_data.get("quality_issues"):
            append_field_value("quality_issues", job_data["quality_issues"])
            has_quality = True
        if job_data.get("needs_review") is not None:
            append_field_value("needs_review", job_data["needs_review"])
            has_quality = True
        # Add quality_scored_at only if we have any quality data
        if has_quality:
            append_field_value("quality_scored_at", "NOW()")
    
    # Construct placeholders and sql_values
    placeholders = []
    sql_values = []
    for v in insert_values:
        if v == "NOW()":
            placeholders.append("NOW()")
            # NOW() doesn't go into sql_values
        else:
            placeholders.append("%s")
            sql_values.append(v)
    
    return insert_fields, placeholders, sql_values


def test_insert_builder_basic():
    """Test basic insert without quality fields."""
    job_data = {
        "source_id": "test-123",
        "org_name": "Test Org",
        "title": "Software Engineer",
        "apply_url": "https://example.com/job/1",
        "location_raw": "New York",
        "canonical_hash": "hash123"
    }
    
    fields, placeholders, sql_values = build_insert_fields_and_placeholders(job_data, include_quality=False)
    
    # Assert field/placeholder count match
    assert len(fields) == len(placeholders), f"Field count ({len(fields)}) != placeholder count ({len(placeholders)})"
    
    # Assert placeholder/sql_values count (accounting for NOW() placeholders)
    now_count = sum(1 for p in placeholders if p == "NOW()")
    expected_sql_values = len(placeholders) - now_count
    assert len(sql_values) == expected_sql_values, f"SQL values count ({len(sql_values)}) != expected ({expected_sql_values})"
    
    # Verify all fields have placeholders
    assert len(fields) == len(placeholders)
    
    # Verify NOW() placeholders don't have corresponding sql_values
    assert placeholders.count("NOW()") == 2  # fetched_at and last_seen_at
    assert "%s" in placeholders


def test_insert_builder_with_quality_fields():
    """Test insert with quality scoring fields."""
    job_data = {
        "source_id": "test-123",
        "org_name": "Test Org",
        "title": "Software Engineer",
        "apply_url": "https://example.com/job/1",
        "location_raw": "New York",
        "canonical_hash": "hash123",
        "quality_score": 0.85,
        "quality_grade": "high",
        "quality_factors": {"title": 1.0, "location": 0.8},
        "quality_issues": [],
        "needs_review": False
    }
    
    fields, placeholders, sql_values = build_insert_fields_and_placeholders(job_data, include_quality=True)
    
    # Assert field/placeholder count match
    assert len(fields) == len(placeholders), f"Field count ({len(fields)}) != placeholder count ({len(placeholders)})"
    
    # Assert placeholder/sql_values count (accounting for NOW() placeholders)
    now_count = sum(1 for p in placeholders if p == "NOW()")
    expected_sql_values = len(placeholders) - now_count
    assert len(sql_values) == expected_sql_values, f"SQL values count ({len(sql_values)}) != expected ({expected_sql_values})"
    
    # Verify quality fields are present
    assert "quality_score" in fields
    assert "quality_grade" in fields
    assert "quality_factors" in fields
    assert "quality_issues" in fields
    assert "needs_review" in fields
    assert "quality_scored_at" in fields
    
    # Verify quality_scored_at has NOW() placeholder
    quality_scored_at_idx = fields.index("quality_scored_at")
    assert placeholders[quality_scored_at_idx] == "NOW()"
    
    # Verify all quality fields (except quality_scored_at) have %s placeholders
    quality_field_indices = [i for i, f in enumerate(fields) if f.startswith("quality_") or f == "needs_review"]
    for idx in quality_field_indices:
        if fields[idx] != "quality_scored_at":
            assert placeholders[idx] == "%s", f"Field {fields[idx]} should have %s placeholder"


def test_insert_builder_partial_quality_fields():
    """Test insert with only some quality fields."""
    job_data = {
        "source_id": "test-123",
        "org_name": "Test Org",
        "title": "Software Engineer",
        "apply_url": "https://example.com/job/1",
        "location_raw": "New York",
        "canonical_hash": "hash123",
        "quality_score": 0.5,
        "quality_grade": "medium"
        # Missing quality_factors, quality_issues, needs_review
    }
    
    fields, placeholders, sql_values = build_insert_fields_and_placeholders(job_data, include_quality=True)
    
    # Assert field/placeholder count match
    assert len(fields) == len(placeholders), f"Field count ({len(fields)}) != placeholder count ({len(placeholders)})"
    
    # Assert placeholder/sql_values count
    now_count = sum(1 for p in placeholders if p == "NOW()")
    expected_sql_values = len(placeholders) - now_count
    assert len(sql_values) == expected_sql_values, f"SQL values count ({len(sql_values)}) != expected ({expected_sql_values})"
    
    # Verify only present quality fields are included
    assert "quality_score" in fields
    assert "quality_grade" in fields
    assert "quality_scored_at" in fields  # Should be added if any quality field exists
    assert "quality_factors" not in fields
    assert "quality_issues" not in fields
    assert "needs_review" not in fields


def test_insert_builder_no_quality_fields():
    """Test insert with quality flag enabled but no quality data."""
    job_data = {
        "source_id": "test-123",
        "org_name": "Test Org",
        "title": "Software Engineer",
        "apply_url": "https://example.com/job/1",
        "location_raw": "New York",
        "canonical_hash": "hash123"
        # No quality fields
    }
    
    fields, placeholders, sql_values = build_insert_fields_and_placeholders(job_data, include_quality=True)
    
    # Assert field/placeholder count match
    assert len(fields) == len(placeholders), f"Field count ({len(fields)}) != placeholder count ({len(placeholders)})"
    
    # Verify no quality fields are included
    assert "quality_score" not in fields
    assert "quality_grade" not in fields
    assert "quality_scored_at" not in fields


def test_insert_builder_sql_statement_format():
    """Test that the generated SQL statement would be valid."""
    job_data = {
        "source_id": "test-123",
        "org_name": "Test Org",
        "title": "Software Engineer",
        "apply_url": "https://example.com/job/1",
        "location_raw": "New York",
        "canonical_hash": "hash123",
        "quality_score": 0.85,
        "quality_grade": "high"
    }
    
    fields, placeholders, sql_values = build_insert_fields_and_placeholders(job_data, include_quality=True)
    
    # Construct SQL statement (simulating what cur.execute would receive)
    sql = f"INSERT INTO jobs ({', '.join(fields)}) VALUES ({', '.join(placeholders)})"
    
    # Verify SQL is well-formed
    assert "INSERT INTO jobs" in sql
    assert "VALUES" in sql
    assert len(fields) == placeholders.count("%s") + placeholders.count("NOW()")
    
    # Verify field count matches placeholder count
    assert len(fields) == len(placeholders)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

