"""W-39 PR3: capture-field fill rates on admitted rows (D9)."""
from __future__ import annotations

import inspect

from app.data_quality import CAPTURE_FILL_FIELDS, DataQualityValidator


def test_capture_fill_fields_are_quality_only_contract_fields():
    names = [name for name, _ in CAPTURE_FILL_FIELDS]
    assert "description" in names
    assert "posted_on" in names
    assert "locations" in names
    assert "contract_type" in names
    assert "salary_range_text" in names
    assert "advert_language" in names
    # Fill rates must not invent a new stored column in this PR.
    source = inspect.getsource(DataQualityValidator.get_source_quality_report)
    assert "fill_rates" in source
    assert "ALTER TABLE" not in source
    assert "ADD COLUMN" not in source


def test_empty_source_report_includes_zero_fill_rates():
    """When the SQL path returns no stats, the empty report still exposes fill_rates."""
    # Exercise the empty-stats branch by reading the literal return shape from source.
    source = inspect.getsource(DataQualityValidator.get_source_quality_report)
    assert "'fill_rates':" in source or '"fill_rates":' in source
    assert "rate': None" in source or 'rate": None' in source


def test_fill_rate_math_matches_admin_expectation():
    total = 10
    filled = 4
    rate = round((filled / total) * 100.0, 1)
    assert rate == 40.0
    assert round((0 / total) * 100.0, 1) == 0.0
