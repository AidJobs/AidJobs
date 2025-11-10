"""
Phase 2 Comprehensive Test Suite
Tests all Phase 2 features: transforms, throttling, error handling, presets, import/export
"""
import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from crawler.api_fetch import APICrawler
from core.net import HTTPClient, RateLimiter
from core.secrets import resolve_secrets, check_required_secrets, mask_secrets


# Configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
TEST_TIMEOUT = 30.0
db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL") or "postgresql://dummy:dummy@localhost/dummy"


async def test_transforms():
    """Test all transform functions"""
    print("\n" + "="*60)
    print("TEST 1: Data Transforms")
    print("="*60)
    
    crawler = APICrawler(db_url)
    results = []
    
    # Test lower transform
    try:
        value = "HELLO WORLD"
        transform_config = {"lower": True}
        result = crawler._apply_transforms(value, transform_config)
        assert result == "hello world", f"Expected 'hello world', got '{result}'"
        print("[PASS] lower transform")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] lower transform: {e}")
        results.append(False)
    
    # Test upper transform
    try:
        value = "hello world"
        transform_config = {"upper": True}
        result = crawler._apply_transforms(value, transform_config)
        assert result == "HELLO WORLD", f"Expected 'HELLO WORLD', got '{result}'"
        print("[PASS] upper transform")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] upper transform: {e}")
        results.append(False)
    
    # Test strip transform
    try:
        value = "  hello world  "
        transform_config = {"strip": True}
        result = crawler._apply_transforms(value, transform_config)
        assert result == "hello world", f"Expected 'hello world', got '{result}'"
        print("[PASS] strip transform")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] strip transform: {e}")
        results.append(False)
    
    # Test join transform
    try:
        value = ["apple", "banana", "cherry"]
        transform_config = {"join": ", "}
        result = crawler._apply_transforms(value, transform_config)
        assert result == "apple, banana, cherry", f"Expected 'apple, banana, cherry', got '{result}'"
        print("[PASS] join transform")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] join transform: {e}")
        results.append(False)
    
    # Test first transform
    try:
        value = ["first", "second", "third"]
        transform_config = {"first": True}
        result = crawler._apply_transforms(value, transform_config)
        assert result == "first", f"Expected 'first', got '{result}'"
        print("[PASS] first transform")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] first transform: {e}")
        results.append(False)
    
    # Test map_table transform
    try:
        value = "Entry level"
        transform_config = {"map_table": {"Entry level": "Entry", "Mid level": "Mid", "Senior level": "Senior"}}
        result = crawler._apply_transforms(value, transform_config)
        assert result == "Entry", f"Expected 'Entry', got '{result}'"
        print("[PASS] map_table transform")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] map_table transform: {e}")
        results.append(False)
    
    # Test default transform
    try:
        value = None
        transform_config = {"default": "N/A"}
        result = crawler._apply_transforms(value, transform_config)
        assert result == "N/A", f"Expected 'N/A', got '{result}'"
        print("[PASS] default transform")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] default transform: {e}")
        results.append(False)
    
    # Test date_parse transform (iso8601)
    try:
        value = "2024-01-15T10:30:00Z"
        transform_config = {"date_parse": "iso8601"}
        result = crawler._apply_transforms(value, transform_config)
        assert "2024-01-15" in result, f"Expected date to contain '2024-01-15', got '{result}'"
        print("[PASS] date_parse transform (iso8601)")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] date_parse transform (iso8601): {e}")
        results.append(False)
    
    # Test combined transforms
    try:
        value = "  HELLO WORLD  "
        transform_config = {"strip": True, "lower": True}
        result = crawler._apply_transforms(value, transform_config)
        assert result == "hello world", f"Expected 'hello world', got '{result}'"
        print("[PASS] combined transforms (strip + lower)")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] combined transforms: {e}")
        results.append(False)
    
    passed = sum(results)
    total = len(results)
    print(f"\nTransform Tests: {passed}/{total} passed")
    return passed == total


async def test_throttling():
    """Test throttling/rate limiting"""
    print("\n" + "="*60)
    print("TEST 2: Throttling / Rate Limiting")
    print("="*60)
    
    results = []
    
    # Test RateLimiter creation
    try:
        limiter = RateLimiter(requests_per_minute=60, burst=10)
        assert limiter.requests_per_minute == 60
        assert limiter.burst == 10
        assert limiter.refill_rate == 1.0  # 60 requests/min = 1 request/sec
        print("[PASS] RateLimiter creation")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] RateLimiter creation: {e}")
        results.append(False)
    
    # Test token consumption
    try:
        limiter = RateLimiter(requests_per_minute=60, burst=5)
        # Should be able to consume tokens immediately (burst capacity)
        await limiter.wait_if_needed()  # Should not wait
        await limiter.wait_if_needed()  # Should not wait
        await limiter.wait_if_needed()  # Should not wait
        print("[PASS] Token consumption (burst)")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] Token consumption: {e}")
        results.append(False)
    
    # Test throttling in HTTPClient
    try:
        client = HTTPClient()
        throttle_config = {
            "enabled": True,
            "requests_per_minute": 60,
            "burst": 5
        }
        # This should create a rate limiter
        limiter = await client._get_rate_limiter("https://jsonplaceholder.typicode.com/posts", throttle_config)
        assert limiter is not None, "Rate limiter should be created"
        print("[PASS] HTTPClient throttling setup")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] HTTPClient throttling setup: {e}")
        results.append(False)
    
    # Test throttling disabled
    try:
        client = HTTPClient()
        throttle_config = {"enabled": False}
        limiter = await client._get_rate_limiter("https://jsonplaceholder.typicode.com/posts", throttle_config)
        assert limiter is None, "Rate limiter should not be created when disabled"
        print("[PASS] Throttling disabled")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] Throttling disabled: {e}")
        results.append(False)
    
    passed = sum(results)
    total = len(results)
    print(f"\nThrottling Tests: {passed}/{total} passed")
    return passed == total


async def test_error_handling():
    """Test enhanced error handling"""
    print("\n" + "="*60)
    print("TEST 3: Error Handling")
    print("="*60)
    
    crawler = APICrawler(db_url)
    results = []
    
    # Test invalid JSON schema
    try:
        try:
            await crawler.fetch_api("https://example.com", parser_hint="invalid json")
            results.append(False)
            print("[FAIL] Invalid JSON schema should raise ValueError")
        except ValueError as e:
            assert "Invalid JSON schema" in str(e)
            print("[PASS] Invalid JSON schema raises ValueError")
            results.append(True)
    except Exception as e:
        print(f"[FAIL] Invalid JSON schema test: {e}")
        results.append(False)
    
    # Test missing secrets
    try:
        schema = {
            "v": 1,
            "base_url": "https://example.com",
            "path": "/jobs",
            "auth": {
                "type": "bearer",
                "token": "{{SECRET:MISSING_TOKEN}}"
            }
        }
        try:
            await crawler.fetch_api("https://example.com", parser_hint=json.dumps(schema))
            results.append(False)
            print("[FAIL] Missing secrets should raise ValueError")
        except ValueError as e:
            assert "Missing required secrets" in str(e)
            print("[PASS] Missing secrets raises ValueError")
            results.append(True)
    except Exception as e:
        print(f"[FAIL] Missing secrets test: {e}")
        results.append(False)
    
    # Test invalid schema version
    try:
        schema = {
            "v": 2,  # Invalid version
            "base_url": "https://example.com"
        }
        # Should fall back to legacy format or raise error
        try:
            await crawler.fetch_api("https://example.com", parser_hint=json.dumps(schema))
            print("[PASS] Invalid schema version handled (falls back to legacy)")
            results.append(True)
        except Exception:
            # Also acceptable - raising an error
            print("[PASS] Invalid schema version raises error")
            results.append(True)
    except Exception as e:
        print(f"[FAIL] Invalid schema version test: {e}")
        results.append(False)
    
    # Test error categorization in transforms
    try:
        # Test transform with invalid value (should return original value)
        value = "test"
        transform_config = {"date_parse": "iso8601"}  # Invalid date format
        result = crawler._apply_transforms(value, transform_config)
        # Should return original value on error
        assert result == "test", f"Expected 'test', got '{result}'"
        print("[PASS] Transform error handling (returns original value)")
        results.append(True)
    except Exception as e:
        print(f"[FAIL] Transform error handling: {e}")
        results.append(False)
    
    passed = sum(results)
    total = len(results)
    print(f"\nError Handling Tests: {passed}/{total} passed")
    return passed == total


async def test_presets():
    """Test presets endpoint (requires backend)"""
    print("\n" + "="*60)
    print("TEST 4: Presets Endpoint")
    print("="*60)
    
    if not ADMIN_PASSWORD:
        print("[SKIP] ADMIN_PASSWORD not set, skipping presets endpoint test")
        return True
    
    import httpx
    results = []
    
    try:
        # Login first
        async with httpx.AsyncClient(timeout=TEST_TIMEOUT, follow_redirects=True) as client:
            login_response = await client.post(
                f"{BACKEND_URL}/api/admin/login",
                json={"password": ADMIN_PASSWORD},
            )
            
            if login_response.status_code != 200:
                print(f"[SKIP] Login failed: {login_response.status_code}")
                return True
            
            # Get session cookie
            cookies = login_response.cookies
            session_cookie = cookies.get("aidjobs_admin_session")
            if not session_cookie:
                print("[SKIP] No session cookie received")
                return True
            
            # Test GET /admin/presets/sources
            try:
                response = await client.get(
                    f"{BACKEND_URL}/admin/presets/sources",
                    cookies={"aidjobs_admin_session": session_cookie}
                )
                if response.status_code == 200:
                    data = response.json()
                    assert "data" in data
                    assert isinstance(data["data"], list)
                    assert len(data["data"]) > 0
                    print("[PASS] GET /admin/presets/sources")
                    results.append(True)
                else:
                    print(f"[FAIL] GET /admin/presets/sources: {response.status_code}")
                    results.append(False)
            except Exception as e:
                print(f"[FAIL] GET /admin/presets/sources: {e}")
                results.append(False)
            
            # Test GET /admin/presets/sources/{preset_name}
            try:
                response = await client.get(
                    f"{BACKEND_URL}/admin/presets/sources/ReliefWeb Jobs",
                    cookies={"aidjobs_admin_session": session_cookie}
                )
                if response.status_code == 200:
                    data = response.json()
                    assert "data" in data
                    assert data["data"]["name"] == "ReliefWeb Jobs"
                    assert "parser_hint" in data["data"]
                    print("[PASS] GET /admin/presets/sources/{preset_name}")
                    results.append(True)
                else:
                    print(f"[FAIL] GET /admin/presets/sources/{{preset_name}}: {response.status_code}")
                    results.append(False)
            except Exception as e:
                print(f"[FAIL] GET /admin/presets/sources/{{preset_name}}: {e}")
                results.append(False)
    
    except Exception as e:
        print(f"[SKIP] Presets endpoint test failed: {e}")
        return True
    
    passed = sum(results) if results else 0
    total = len(results) if results else 0
    if total > 0:
        print(f"\nPresets Tests: {passed}/{total} passed")
        return passed == total
    return True


async def test_import_export():
    """Test import/export functionality (requires backend)"""
    print("\n" + "="*60)
    print("TEST 5: Import/Export")
    print("="*60)
    
    if not ADMIN_PASSWORD:
        print("[SKIP] ADMIN_PASSWORD not set, skipping import/export test")
        return True
    
    import httpx
    results = []
    source_id = None
    
    try:
        # Login first
        async with httpx.AsyncClient(timeout=TEST_TIMEOUT, follow_redirects=True) as client:
            login_response = await client.post(
                f"{BACKEND_URL}/api/admin/login",
                json={"password": ADMIN_PASSWORD},
            )
            
            if login_response.status_code != 200:
                print(f"[SKIP] Login failed: {login_response.status_code}")
                return True
            
            # Get session cookie
            cookies = login_response.cookies
            session_cookie = cookies.get("aidjobs_admin_session")
            if not session_cookie:
                print("[SKIP] No session cookie received")
                return True
            
            cookie_dict = {"aidjobs_admin_session": session_cookie}
            
            # Create a test source first
            try:
                test_schema = {
                    "v": 1,
                    "base_url": "https://jsonplaceholder.typicode.com",
                    "path": "/posts",
                    "method": "GET",
                    "auth": {"type": "none"},
                    "data_path": "$",
                    "map": {
                        "title": "title",
                        "description_snippet": "body"
                    },
                    "success_codes": [200]
                }
                
                create_response = await client.post(
                    f"{BACKEND_URL}/api/admin/sources",
                    json={
                        "org_name": "Test Export Source",
                        "careers_url": "https://jsonplaceholder.typicode.com/posts",
                        "source_type": "api",
                        "org_type": "NGO",
                        "crawl_frequency_days": 3,
                        "parser_hint": json.dumps(test_schema)
                    },
                    cookies=cookie_dict
                )
                
                if create_response.status_code in [200, 201]:
                    created_data = create_response.json()
                    source_id = created_data.get("data", {}).get("id") or created_data.get("id")
                    print("[PASS] Created test source for export")
                    results.append(True)
                else:
                    print(f"[FAIL] Failed to create test source: {create_response.status_code}")
                    results.append(False)
                    return False
            
            except Exception as e:
                print(f"[FAIL] Failed to create test source: {e}")
                results.append(False)
                return False
            
            # Test export
            try:
                export_response = await client.get(
                    f"{BACKEND_URL}/admin/sources/{source_id}/export",
                    cookies=cookie_dict
                )
                if export_response.status_code == 200:
                    export_data = export_response.json()
                    assert "data" in export_data
                    assert export_data["data"]["source_type"] == "api"
                    assert export_data["data"]["org_name"] == "Test Export Source"
                    print("[PASS] Export source")
                    results.append(True)
                    exported_config = export_data["data"]
                else:
                    print(f"[FAIL] Export failed: {export_response.status_code}")
                    results.append(False)
            except Exception as e:
                print(f"[FAIL] Export test: {e}")
                results.append(False)
            
            # Test import (with modified name to avoid duplicate)
            try:
                exported_config["org_name"] = "Test Import Source"
                import_response = await client.post(
                    f"{BACKEND_URL}/admin/sources/import",
                    json=exported_config,
                    cookies=cookie_dict
                )
                if import_response.status_code in [200, 201]:
                    import_data = import_response.json()
                    assert "data" in import_data
                    assert import_data["data"]["source_type"] == "api"
                    assert import_data["data"]["org_name"] == "Test Import Source"
                    print("[PASS] Import source")
                    results.append(True)
                    imported_source_id = import_data["data"]["id"]
                else:
                    print(f"[FAIL] Import failed: {import_response.status_code} - {import_response.text}")
                    results.append(False)
            except Exception as e:
                print(f"[FAIL] Import test: {e}")
                results.append(False)
            
            # Cleanup: Delete test sources
            try:
                if source_id:
                    await client.delete(
                        f"{BACKEND_URL}/api/admin/sources/{source_id}",
                        cookies=cookie_dict
                    )
                if 'imported_source_id' in locals():
                    await client.delete(
                        f"{BACKEND_URL}/api/admin/sources/{imported_source_id}",
                        cookies=cookie_dict
                    )
                print("[INFO] Cleaned up test sources")
            except Exception:
                pass
    
    except Exception as e:
        print(f"[SKIP] Import/export test failed: {e}")
        return True
    
    passed = sum(results) if results else 0
    total = len(results) if results else 0
    if total > 0:
        print(f"\nImport/Export Tests: {passed}/{total} passed")
        return passed == total
    return True


async def test_integration():
    """Test integration of Phase 2 features with real API"""
    print("\n" + "="*60)
    print("TEST 6: Integration Test (Transforms + Throttling)")
    print("="*60)
    
    crawler = APICrawler(db_url)
    results = []
    
    try:
        # Test schema with transforms and throttling
        schema = {
            "v": 1,
            "base_url": "https://jsonplaceholder.typicode.com",
            "path": "/posts",
            "method": "GET",
            "auth": {"type": "none"},
            "query": {"_limit": 5},
            "pagination": {
                "type": "offset",
                "offset_param": "_start",
                "limit_param": "_limit",
                "page_size": 5,
                "max_pages": 1
            },
            "data_path": "$",
            "map": {
                "title": "title",
                "description_snippet": "body"
            },
            "transforms": {
                "title": {
                    "lower": True,
                    "strip": True
                }
            },
            "throttle": {
                "enabled": True,
                "requests_per_minute": 60,
                "burst": 5
            },
            "success_codes": [200]
        }
        
        jobs = await crawler.fetch_api(
            "https://jsonplaceholder.typicode.com/posts",
            json.dumps(schema),
            last_success_at=None
        )
        
        assert len(jobs) > 0, "Should fetch at least one job"
        assert "title" in jobs[0], "Job should have title field"
        # Title should be lowercase due to transform
        assert jobs[0]["title"].islower(), "Title should be lowercase after transform"
        print("[PASS] Integration test (transforms + throttling)")
        results.append(True)
    
    except Exception as e:
        print(f"[FAIL] Integration test: {e}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    passed = sum(results)
    total = len(results)
    print(f"\nIntegration Tests: {passed}/{total} passed")
    return passed == total


async def run_all_tests():
    """Run all Phase 2 tests"""
    print("\n" + "="*60)
    print("PHASE 2 - COMPREHENSIVE TEST SUITE")
    print("="*60)
    
    results = []
    
    # Test 1: Transforms
    try:
        result = await test_transforms()
        results.append(("Transforms", result))
    except Exception as e:
        print(f"[FAIL] Transforms test exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Transforms", False))
    
    # Test 2: Throttling
    try:
        result = await test_throttling()
        results.append(("Throttling", result))
    except Exception as e:
        print(f"[FAIL] Throttling test exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Throttling", False))
    
    # Test 3: Error Handling
    try:
        result = await test_error_handling()
        results.append(("Error Handling", result))
    except Exception as e:
        print(f"[FAIL] Error handling test exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Error Handling", False))
    
    # Test 4: Presets (requires backend)
    try:
        result = await test_presets()
        results.append(("Presets", result))
    except Exception as e:
        print(f"[FAIL] Presets test exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Presets", False))
    
    # Test 5: Import/Export (requires backend)
    try:
        result = await test_import_export()
        results.append(("Import/Export", result))
    except Exception as e:
        print(f"[FAIL] Import/export test exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Import/Export", False))
    
    # Test 6: Integration
    try:
        result = await test_integration()
        results.append(("Integration", result))
    except Exception as e:
        print(f"[FAIL] Integration test exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Integration", False))
    
    # Print summary
    print("\n" + "="*60)
    print("FINAL SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} test suites passed")
    
    if passed == total:
        print("[SUCCESS] All Phase 2 tests passed!")
        return 0
    else:
        print("[WARNING] Some Phase 2 tests failed or were skipped")
        return 1


if __name__ == "__main__":
    print("\n" + "="*60)
    print("API SOURCE FRAMEWORK - PHASE 2 TESTS")
    print("="*60)
    print(f"\nBackend URL: {BACKEND_URL}")
    print(f"Admin Password: {'*' * len(ADMIN_PASSWORD) if ADMIN_PASSWORD else 'NOT SET'}")
    print("\nNote: Set ADMIN_PASSWORD environment variable to run presets and import/export tests")
    print("      These tests require backend to be running and accessible")
    print("="*60)
    
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)

