import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_env():
    env_vars = [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "MEILI_HOST",
        "MEILI_MASTER_KEY",
        "OPENROUTER_API_KEY",
        "CV_MAX_FILE_MB",
        "CV_TRANSIENT_HOURS",
        "PAYPAL_CLIENT_ID",
        "PAYPAL_CLIENT_SECRET",
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "AIDJOBS_ENABLE_SEARCH",
        "AIDJOBS_ENABLE_CV",
        "AIDJOBS_ENABLE_FINDEARN",
        "AIDJOBS_ENABLE_PAYMENTS",
    ]
    for var in env_vars:
        if var in os.environ:
            del os.environ[var]
    yield


def test_capabilities_endpoint_returns_correct_shape(client):
    response = client.get("/api/capabilities")
    
    assert response.status_code == 200
    data = response.json()
    
    assert "search" in data
    assert "cv" in data
    assert "payments" in data
    assert "findearn" in data
    
    assert isinstance(data["search"], bool)
    assert isinstance(data["cv"], bool)
    assert isinstance(data["payments"], bool)
    assert isinstance(data["findearn"], bool)


def test_capabilities_with_no_env_returns_false(client):
    response = client.get("/api/capabilities")
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["search"] is False
    assert data["cv"] is False
    assert data["payments"] is False
    assert data["findearn"] is True


def test_capabilities_never_500_on_missing_env(client):
    response = client.get("/api/capabilities")
    
    assert response.status_code == 200
    assert response.status_code != 500
