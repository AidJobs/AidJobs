"""
Tests for admin/normalize endpoints.

Ensures that the normalization report, preview, and reindex endpoints
return proper response structures.
"""

import pytest
import os
from fastapi.testclient import TestClient
from main import app

os.environ["AIDJOBS_ENV"] = "dev"

client = TestClient(app)


def test_normalize_report_shape():
    """Test that /admin/normalize/report returns expected shape."""
    response = client.get("/admin/normalize/report")
    
    assert response.status_code in [200, 403]
    
    if response.status_code == 200:
        data = response.json()
        
        assert "ok" in data
        assert isinstance(data["ok"], bool)
        
        if data["ok"]:
            assert "totals" in data
            assert "jobs" in data["totals"]
            assert "sources" in data["totals"]
            
            assert "country" in data
            assert "normalized" in data["country"]
            assert "unknown" in data["country"]
            assert "top_unknown" in data["country"]
            
            assert "level_norm" in data
            assert "normalized" in data["level_norm"]
            assert "unknown" in data["level_norm"]
            assert "top_unknown" in data["level_norm"]
            
            assert "international_eligible" in data
            assert "true_count" in data["international_eligible"]
            assert "false_count" in data["international_eligible"]
            assert "null_count" in data["international_eligible"]
            
            assert "mission_tags" in data
            assert "normalized" in data["mission_tags"]
            assert "unknown" in data["mission_tags"]
            assert "top_unknown" in data["mission_tags"]
            
            assert "mapping_tables" in data
            assert "countries" in data["mapping_tables"]
            assert "levels" in data["mapping_tables"]
            assert "tags" in data["mapping_tables"]
            
            assert "notes" in data
            assert "fallback_used" in data["notes"]
        else:
            assert "error" in data


def test_normalize_preview_limit():
    """Test that /admin/normalize/preview respects limit parameter."""
    response = client.get("/admin/normalize/preview?limit=3")
    
    assert response.status_code in [200, 403]
    
    if response.status_code == 200:
        data = response.json()
        
        assert "total" in data
        assert isinstance(data["total"], int)
        
        assert "previews" in data
        assert isinstance(data["previews"], list)
        assert len(data["previews"]) <= 3
        
        if len(data["previews"]) > 0:
            preview = data["previews"][0]
            assert "job_id" in preview
            assert "raw" in preview
            assert "normalized" in preview
            assert "dropped_fields" in preview


def test_normalize_reindex_returns_numeric():
    """Test that /admin/normalize/reindex returns numeric counts."""
    response = client.post("/admin/normalize/reindex")
    
    assert response.status_code in [200, 403]
    
    if response.status_code == 200:
        data = response.json()
        
        assert "indexed" in data
        assert isinstance(data["indexed"], int)
        
        assert "skipped" in data
        assert isinstance(data["skipped"], int)
        
        assert "duration_ms" in data
        assert isinstance(data["duration_ms"], int)


def test_normalize_report_not_500():
    """Test that /admin/normalize/report never returns 500."""
    response = client.get("/admin/normalize/report")
    
    assert response.status_code != 500
    
    data = response.json()
    
    if response.status_code == 200:
        assert "ok" in data
    else:
        assert response.status_code == 403


def test_normalize_preview_not_500():
    """Test that /admin/normalize/preview never returns 500."""
    response = client.get("/admin/normalize/preview?limit=5")
    
    assert response.status_code != 500
    
    if response.status_code != 403:
        data = response.json()
        assert "previews" in data


def test_normalize_reindex_not_500():
    """Test that /admin/normalize/reindex never returns 500."""
    response = client.post("/admin/normalize/reindex")
    
    assert response.status_code != 500
    
    if response.status_code == 200:
        data = response.json()
        assert "indexed" in data or "error" in data
