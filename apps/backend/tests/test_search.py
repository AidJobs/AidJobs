import os
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


class TestSearchQuery:
    def test_query_basic_200(self):
        response = client.get("/api/search/query")
        assert response.status_code == 200

    def test_query_response_structure(self):
        response = client.get("/api/search/query?q=engineer")
        data = response.json()
        assert "status" in data
        assert "data" in data
        assert "error" in data
        assert "request_id" in data
        assert data["status"] == "ok"
        assert data["error"] is None

    def test_query_data_structure(self):
        response = client.get("/api/search/query?q=engineer")
        data = response.json()
        assert "items" in data["data"]
        assert "total" in data["data"]
        assert "page" in data["data"]
        assert "size" in data["data"]
        assert isinstance(data["data"]["items"], list)
        assert isinstance(data["data"]["total"], int)

    def test_query_param_clamping_page_min(self):
        response = client.get("/api/search/query?page=0")
        data = response.json()
        assert data["data"]["page"] == 1

    def test_query_param_clamping_page_negative(self):
        response = client.get("/api/search/query?page=-5")
        data = response.json()
        assert data["data"]["page"] == 1

    def test_query_param_clamping_size_min(self):
        response = client.get("/api/search/query?size=0")
        data = response.json()
        assert data["data"]["size"] == 1

    def test_query_param_clamping_size_max(self):
        response = client.get("/api/search/query?size=200")
        data = response.json()
        assert data["data"]["size"] == 100

    def test_query_param_clamping_size_negative(self):
        response = client.get("/api/search/query?size=-10")
        data = response.json()
        assert data["data"]["size"] == 1

    def test_query_default_pagination(self):
        response = client.get("/api/search/query")
        data = response.json()
        assert data["data"]["page"] == 1
        assert data["data"]["size"] == 20

    def test_query_with_all_params(self):
        response = client.get(
            "/api/search/query?q=engineer&page=2&size=50&country=Kenya"
            "&level_norm=mid&international_eligible=true"
            "&mission_tags=health&mission_tags=education"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    def test_query_fallback_returns_empty_items(self):
        response = client.get("/api/search/query?q=test")
        data = response.json()
        assert isinstance(data["data"]["items"], list)
        assert data["data"]["total"] == 0

    def test_query_never_500_on_missing_env(self):
        response = client.get("/api/search/query?q=test")
        assert response.status_code == 200

    @pytest.mark.skipif(
        not os.getenv("SUPABASE_DB_URL"),
        reason="Requires SUPABASE_DB_URL to be set"
    )
    def test_db_fallback_returns_seeded_data(self):
        """Test database fallback returns at least one item after seed data is loaded"""
        # Disable search to force database fallback
        original_search = os.getenv("AIDJOBS_ENABLE_SEARCH")
        os.environ["AIDJOBS_ENABLE_SEARCH"] = "false"
        
        try:
            # Search for something that should match seed data (e.g., 'health')
            response = client.get("/api/search/query?q=health")
            assert response.status_code == 200
            
            data = response.json()
            assert data["status"] == "ok"
            assert "data" in data
            assert "items" in data["data"]
            assert data["data"]["fallback"] is True
            
            # Should have at least one result from seed data
            assert len(data["data"]["items"]) >= 1
            assert data["data"]["total"] >= 1
            
            # Verify item structure
            if len(data["data"]["items"]) > 0:
                item = data["data"]["items"][0]
                assert "id" in item
                assert "org_name" in item
                assert "title" in item
                assert "location_raw" in item
                assert "country" in item
                assert "level_norm" in item
                assert "apply_url" in item
                assert "last_seen_at" in item
        finally:
            # Restore original setting
            if original_search is not None:
                os.environ["AIDJOBS_ENABLE_SEARCH"] = original_search
            else:
                os.environ.pop("AIDJOBS_ENABLE_SEARCH", None)

    @pytest.mark.skipif(
        not os.getenv("SUPABASE_DB_URL"),
        reason="Requires SUPABASE_DB_URL to be set"
    )
    def test_db_fallback_filters_by_country(self):
        """Test database fallback applies country filter correctly"""
        original_search = os.getenv("AIDJOBS_ENABLE_SEARCH")
        os.environ["AIDJOBS_ENABLE_SEARCH"] = "false"
        
        try:
            response = client.get("/api/search/query?country=KE")
            assert response.status_code == 200
            
            data = response.json()
            assert data["status"] == "ok"
            
            # If results exist, all should be from Kenya
            for item in data["data"]["items"]:
                assert item["country"] == "KE"
        finally:
            if original_search is not None:
                os.environ["AIDJOBS_ENABLE_SEARCH"] = original_search
            else:
                os.environ.pop("AIDJOBS_ENABLE_SEARCH", None)

    @pytest.mark.skipif(
        not os.getenv("SUPABASE_DB_URL"),
        reason="Requires SUPABASE_DB_URL to be set"
    )
    def test_db_fallback_filters_by_level(self):
        """Test database fallback applies level filter correctly"""
        original_search = os.getenv("AIDJOBS_ENABLE_SEARCH")
        os.environ["AIDJOBS_ENABLE_SEARCH"] = "false"
        
        try:
            response = client.get("/api/search/query?level_norm=mid")
            assert response.status_code == 200
            
            data = response.json()
            assert data["status"] == "ok"
            
            # If results exist, all should be mid-level
            for item in data["data"]["items"]:
                assert item["level_norm"] == "mid"
        finally:
            if original_search is not None:
                os.environ["AIDJOBS_ENABLE_SEARCH"] = original_search
            else:
                os.environ.pop("AIDJOBS_ENABLE_SEARCH", None)

    @pytest.mark.skipif(
        not os.getenv("SUPABASE_DB_URL"),
        reason="Requires SUPABASE_DB_URL to be set"
    )
    def test_db_fallback_pagination(self):
        """Test database fallback pagination works correctly"""
        original_search = os.getenv("AIDJOBS_ENABLE_SEARCH")
        os.environ["AIDJOBS_ENABLE_SEARCH"] = "false"
        
        try:
            # Get first page
            response = client.get("/api/search/query?page=1&size=5")
            assert response.status_code == 200
            
            data = response.json()
            assert data["data"]["page"] == 1
            assert data["data"]["size"] == 5
            assert len(data["data"]["items"]) <= 5
        finally:
            if original_search is not None:
                os.environ["AIDJOBS_ENABLE_SEARCH"] = original_search
            else:
                os.environ.pop("AIDJOBS_ENABLE_SEARCH", None)


class TestSearchFacets:
    def test_facets_basic_200(self):
        response = client.get("/api/search/facets")
        assert response.status_code == 200

    def test_facets_disabled_structure(self):
        response = client.get("/api/search/facets")
        data = response.json()
        assert "enabled" in data

    def test_facets_never_500_on_missing_env(self):
        response = client.get("/api/search/facets")
        assert response.status_code == 200

    @pytest.mark.skipif(
        not os.getenv("SUPABASE_DB_URL"),
        reason="Requires SUPABASE_DB_URL to be set"
    )
    def test_db_facets_returns_counts(self):
        """Test database facets returns count data after seed is loaded"""
        original_search = os.getenv("AIDJOBS_ENABLE_SEARCH")
        os.environ["AIDJOBS_ENABLE_SEARCH"] = "false"
        
        try:
            response = client.get("/api/search/facets")
            assert response.status_code == 200
            
            data = response.json()
            assert data["enabled"] is True
            assert "facets" in data
            
            facets = data["facets"]
            assert "country" in facets
            assert "level_norm" in facets
            assert "mission_tags" in facets
            assert "international_eligible" in facets
            
            # Each facet should be a dict
            assert isinstance(facets["country"], dict)
            assert isinstance(facets["level_norm"], dict)
            assert isinstance(facets["mission_tags"], dict)
            assert isinstance(facets["international_eligible"], dict)
            
        finally:
            if original_search is not None:
                os.environ["AIDJOBS_ENABLE_SEARCH"] = original_search
            else:
                os.environ.pop("AIDJOBS_ENABLE_SEARCH", None)

    @pytest.mark.skipif(
        not os.getenv("SUPABASE_DB_URL"),
        reason="Requires SUPABASE_DB_URL to be set"
    )
    def test_db_facets_mission_tags_limited_to_10(self):
        """Test mission_tags facet is limited to top 10"""
        original_search = os.getenv("AIDJOBS_ENABLE_SEARCH")
        os.environ["AIDJOBS_ENABLE_SEARCH"] = "false"
        
        try:
            response = client.get("/api/search/facets")
            data = response.json()
            
            # Mission tags should have at most 10 entries
            assert len(data["facets"]["mission_tags"]) <= 10
            
        finally:
            if original_search is not None:
                os.environ["AIDJOBS_ENABLE_SEARCH"] = original_search
            else:
                os.environ.pop("AIDJOBS_ENABLE_SEARCH", None)

    @pytest.mark.skipif(
        not os.getenv("SUPABASE_DB_URL"),
        reason="Requires SUPABASE_DB_URL to be set"
    )
    def test_db_facets_country_limited_to_50(self):
        """Test country facet is limited to 50 buckets"""
        original_search = os.getenv("AIDJOBS_ENABLE_SEARCH")
        os.environ["AIDJOBS_ENABLE_SEARCH"] = "false"
        
        try:
            response = client.get("/api/search/facets")
            data = response.json()
            
            # Country should have at most 50 entries
            assert len(data["facets"]["country"]) <= 50
            
        finally:
            if original_search is not None:
                os.environ["AIDJOBS_ENABLE_SEARCH"] = original_search
            else:
                os.environ.pop("AIDJOBS_ENABLE_SEARCH", None)
