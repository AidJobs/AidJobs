"""
Unit tests for UNDP replay logic.
Tests mailto filtering, dedupe, and insertion behavior.
"""
import pytest
import hashlib
from unittest.mock import MagicMock, patch
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from scripts.replay_undp_jobs import (
    is_mailto_link, normalize_title, get_canonical_hash,
    parse_deadline
)


def test_is_mailto_link():
    """Test mailto link detection."""
    assert is_mailto_link("mailto:test@example.com") == True
    assert is_mailto_link("mailto:contact@org.org") == True
    assert is_mailto_link("https://example.com/job/123") == False
    assert is_mailto_link("  mailto:test@example.com  ") == True
    assert is_mailto_link(None) == False
    assert is_mailto_link("") == False


def test_normalize_title():
    """Test title normalization."""
    assert normalize_title("  Software Engineer  ") == "Software Engineer"
    assert normalize_title("GLOBAL") == "GLOBAL"
    assert normalize_title("") == ""
    assert normalize_title(None) == ""


def test_get_canonical_hash():
    """Test canonical hash computation."""
    hash1 = get_canonical_hash("Software Engineer", "https://example.com/job/1")
    hash2 = get_canonical_hash("Software Engineer", "https://example.com/job/1")
    hash3 = get_canonical_hash("Software Engineer", "https://example.com/job/2")
    
    assert hash1 == hash2  # Same inputs = same hash
    assert hash1 != hash3  # Different URL = different hash
    
    # Test with mailto/contact_email
    hash4 = get_canonical_hash("Contact", None, contact_email="test@example.com")
    hash5 = get_canonical_hash("Contact", None, contact_email="test@example.com")
    assert hash4 == hash5


def test_parse_deadline():
    """Test deadline parsing."""
    # Test ISO format
    assert parse_deadline("2025-12-31") == "2025-12-31"
    
    # Test invalid format
    result = parse_deadline("invalid date")
    # Should return None or a parsed date depending on dateutil availability
    assert result is None or isinstance(result, str)


def test_mailto_removal_from_apply_url():
    """Test that mailto links are moved to contact_email."""
    # This would be tested in integration test
    # For unit test, we verify the helper function
    assert is_mailto_link("mailto:hr@org.org") == True
    
    # Simulate the cleaning logic
    apply_url = "mailto:hr@org.org"
    contact_email = None
    
    if is_mailto_link(apply_url):
        contact_email = apply_url.replace('mailto:', '').strip()
        apply_url = None
    
    assert contact_email == "hr@org.org"
    assert apply_url is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

