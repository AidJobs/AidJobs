"""
Regression tests for normalization system.

Ensures that falsy-but-valid normalized values ([], False, None) are 
properly handled and not replaced with raw values during validation.
"""

import pytest
from app.normalizer import Normalizer, normalize_job_data
from app.validator import validator


def test_normalizer_to_iso_country():
    """Test country normalization."""
    assert Normalizer.to_iso_country("India") == "IN"
    assert Normalizer.to_iso_country("Kenya") == "KE"
    assert Normalizer.to_iso_country("United States") == "US"
    assert Normalizer.to_iso_country("Unknown Country") is None


def test_normalizer_norm_level():
    """Test level normalization."""
    assert Normalizer.norm_level("mid-level") == "Mid"
    assert Normalizer.norm_level("senior") == "Senior"
    assert Normalizer.norm_level("entry") == "Junior"
    assert Normalizer.norm_level("unknown") is None


def test_normalizer_norm_tags():
    """Test tag normalization with synonym mapping."""
    assert Normalizer.norm_tags(["Health", "WASH"]) == ["health", "wash"]
    assert Normalizer.norm_tags(["healthcare", "water"]) == ["health", "wash"]
    assert Normalizer.norm_tags(["unknown", "health"]) == ["health"]
    assert Normalizer.norm_tags(["unknown1", "unknown2"]) == []


def test_normalizer_norm_tags_empty_result():
    """Regression: Empty tag list should be preserved, not treated as falsy."""
    result = Normalizer.norm_tags(["unknown-tag", "invalid-tag"])
    assert result == []
    assert isinstance(result, list)


def test_normalizer_to_bool():
    """Test boolean parsing."""
    assert Normalizer.to_bool("true") is True
    assert Normalizer.to_bool("false") is False
    assert Normalizer.to_bool(1) is True
    assert Normalizer.to_bool(0) is False
    assert Normalizer.to_bool("yes") is True
    assert Normalizer.to_bool("no") is False
    assert Normalizer.to_bool(None) is None


def test_normalizer_to_bool_false_preserved():
    """Regression: False boolean should be preserved, not treated as falsy."""
    result = Normalizer.to_bool(0)
    assert result is False
    assert isinstance(result, bool)


def test_normalize_job_data():
    """Test complete job data normalization."""
    raw = {
        "country": "India",
        "level_norm": "mid-level",
        "mission_tags": ["Health", "WASH"],
        "international_eligible": "yes"
    }
    
    normalized = normalize_job_data(raw)
    
    assert normalized["country_iso"] == "IN"
    assert normalized["level_norm"] == "Mid"
    assert normalized["mission_tags"] == ["health", "wash"]
    assert normalized["international_eligible"] is True


def test_normalize_job_data_with_empty_tags():
    """Regression: Normalization that produces empty tags should preserve empty list."""
    raw = {
        "country": "India",
        "level_norm": "senior",
        "mission_tags": ["unknown-tag", "invalid-tag"],
        "international_eligible": True
    }
    
    normalized = normalize_job_data(raw)
    
    assert normalized["country_iso"] == "IN"
    assert normalized["level_norm"] == "Senior"
    assert normalized["mission_tags"] == []
    assert normalized["international_eligible"] is True


def test_normalize_job_data_with_false_boolean():
    """Regression: False boolean should be preserved during normalization."""
    raw = {
        "country": "Kenya",
        "level_norm": "Junior",
        "mission_tags": ["health"],
        "international_eligible": 0
    }
    
    normalized = normalize_job_data(raw)
    
    assert normalized["country_iso"] == "KE"
    assert normalized["level_norm"] == "Junior"
    assert normalized["mission_tags"] == ["health"]
    assert normalized["international_eligible"] is False


def test_validator_accepts_empty_tags():
    """Regression: Validator should accept empty mission_tags list."""
    result = validator.validate_job({
        "country_iso": "IN",
        "level_norm": "Mid",
        "mission_tags": [],
        "international_eligible": True
    })
    
    assert result["valid"] is True
    assert result["errors"] == []


def test_validator_accepts_false_boolean():
    """Regression: Validator should accept False for international_eligible."""
    result = validator.validate_job({
        "country_iso": "KE",
        "level_norm": "Senior",
        "mission_tags": ["health"],
        "international_eligible": False
    })
    
    assert result["valid"] is True
    assert result["errors"] == []


def test_validator_accepts_none_country():
    """Regression: Validator should accept None for optional country_iso."""
    result = validator.validate_job({
        "country_iso": None,
        "level_norm": "Mid",
        "mission_tags": ["health"],
        "international_eligible": True
    })
    
    assert result["valid"] is True
    assert result["errors"] == []


def test_validator_rejects_invalid_data():
    """Test that validator properly rejects invalid data."""
    result = validator.validate_job({
        "country_iso": "XX",
        "level_norm": "InvalidLevel",
        "mission_tags": ["invalid-tag"],
        "international_eligible": "not-a-bool"
    })
    
    assert result["valid"] is False
    assert len(result["errors"]) == 4
    
    errors_str = " ".join(result["errors"])
    assert "Invalid country_iso: XX" in errors_str
    assert "Invalid level_norm: InvalidLevel" in errors_str
    assert "Invalid mission_tags: ['invalid-tag']" in errors_str
    assert "Invalid international_eligible" in errors_str
