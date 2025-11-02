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
