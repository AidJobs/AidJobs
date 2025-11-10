"""
Test script for all three tasks:
1. Database connection (orchestrator)
2. Meilisearch status and indexing
3. API Source framework
"""
import os
import sys
import asyncio
import requests
import json
from typing import Dict, Any

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Backend URL (change if needed)
BACKEND_URL = os.getenv("BACKEND_URL", "https://aidjobs-backend.onrender.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

def print_section(title: str):
    """Print a section header"""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def print_result(success: bool, message: str, details: Dict[str, Any] = None):
    """Print test result"""
    status = "[PASS]" if success else "[FAIL]"
    print(f"{status} {message}")
    if details:
        print(f"    Details: {json.dumps(details, indent=2)}")

def test_database_connection():
    """Test 1: Database connection status"""
    print_section("Test 1: Database Connection")
    
    try:
        # Test public database status endpoint
        response = requests.get(f"{BACKEND_URL}/api/db/status", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            job_count = data.get("job_count", 0)
            connected = data.get("connected", False)
            
            if connected:
                print_result(True, f"Database connected successfully. Job count: {job_count}")
                return True
            else:
                print_result(False, "Database connection failed", data)
                return False
        else:
            print_result(False, f"Database status endpoint returned {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result(False, f"Database connection test failed: {e}")
        return False

def test_meilisearch_status():
    """Test 2: Meilisearch status and indexing"""
    print_section("Test 2: Meilisearch Status")
    
    try:
        # Test public search status endpoint
        response = requests.get(f"{BACKEND_URL}/api/search/status", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            enabled = data.get("enabled", False)
            
            if enabled:
                index_stats = data.get("index", {}).get("stats", {})
                doc_count = index_stats.get("numberOfDocuments", 0)
                is_indexing = index_stats.get("isIndexing", False)
                
                print_result(True, f"Meilisearch is enabled. Documents: {doc_count}, Indexing: {is_indexing}")
                
                if doc_count == 0:
                    print("    WARNING: Meilisearch index is empty. Jobs need to be indexed.")
                    print(f"    To reindex: POST {BACKEND_URL}/admin/search/reindex (requires admin auth)")
                
                return True
            else:
                error = data.get("error", "Unknown error")
                print_result(False, f"Meilisearch is not enabled: {error}")
                return False
        else:
            print_result(False, f"Search status endpoint returned {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result(False, f"Meilisearch status test failed: {e}")
        return False

def test_meilisearch_reindex():
    """Test 2b: Meilisearch reindexing (requires admin auth)"""
    print_section("Test 2b: Meilisearch Reindexing (Admin)")
    
    if not ADMIN_PASSWORD:
        print("[SKIP] ADMIN_PASSWORD not set. Skipping reindex test.")
        return None
    
    try:
        # Login first
        login_response = requests.post(
            f"{BACKEND_URL}/api/admin/login",
            json={"password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if login_response.status_code != 200:
            print_result(False, f"Admin login failed: {login_response.status_code}")
            return False
        
        # Get session cookie
        cookies = login_response.cookies
        
        # Test reindex endpoint
        reindex_response = requests.post(
            f"{BACKEND_URL}/admin/search/reindex",
            cookies=cookies,
            timeout=60  # Reindexing can take time
        )
        
        if reindex_response.status_code == 200:
            data = reindex_response.json()
            indexed = data.get("indexed", 0)
            skipped = data.get("skipped", 0)
            duration_ms = data.get("duration_ms", 0)
            
            print_result(True, f"Reindex completed. Indexed: {indexed}, Skipped: {skipped}, Duration: {duration_ms}ms")
            return True
        else:
            print_result(False, f"Reindex failed: {reindex_response.status_code}", reindex_response.text)
            return False
    except Exception as e:
        print_result(False, f"Meilisearch reindex test failed: {e}")
        return False

def test_api_source_framework():
    """Test 3: API Source framework"""
    print_section("Test 3: API Source Framework")
    
    if not ADMIN_PASSWORD:
        print("[SKIP] ADMIN_PASSWORD not set. Skipping API Source test.")
        print("    To test API Sources, use the admin UI at https://www.aidjobs.app/admin/sources")
        return None
    
    try:
        # Login first
        login_response = requests.post(
            f"{BACKEND_URL}/api/admin/login",
            json={"password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if login_response.status_code != 200:
            print_result(False, f"Admin login failed: {login_response.status_code}")
            return False
        
        # Get session cookie
        cookies = login_response.cookies
        
        # Test presets endpoint
        presets_response = requests.get(
            f"{BACKEND_URL}/admin/presets/sources",
            cookies=cookies,
            timeout=10
        )
        
        if presets_response.status_code == 200:
            presets = presets_response.json()
            preset_count = len(presets.get("presets", []))
            print_result(True, f"Presets endpoint works. Available presets: {preset_count}")
            
            # List presets
            if preset_count > 0:
                print("    Available presets:")
                for preset in presets.get("presets", []):
                    print(f"      - {preset.get('name', 'Unknown')}: {preset.get('description', 'No description')}")
            
            return True
        else:
            print_result(False, f"Presets endpoint failed: {presets_response.status_code}", presets_response.text)
            return False
    except Exception as e:
        print_result(False, f"API Source framework test failed: {e}")
        return False

def test_api_source_create():
    """Test 3b: Create an API source (requires admin auth)"""
    print_section("Test 3b: Create API Source (Admin)")
    
    if not ADMIN_PASSWORD:
        print("[SKIP] ADMIN_PASSWORD not set. Skipping API source creation test.")
        return None
    
    try:
        # Login first
        login_response = requests.post(
            f"{BACKEND_URL}/api/admin/login",
            json={"password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if login_response.status_code != 200:
            print_result(False, f"Admin login failed: {login_response.status_code}")
            return False
        
        # Get session cookie
        cookies = login_response.cookies
        
        # Create a test API source (JSONPlaceholder)
        test_source = {
            "org_name": "Test API Source",
            "careers_url": "https://jsonplaceholder.typicode.com/posts",
            "source_type": "api",
            "org_type": "private",
            "parser_hint": json.dumps({
                "v": 1,
                "base_url": "https://jsonplaceholder.typicode.com",
                "path": "/posts",
                "method": "GET",
                "auth": {"type": "none"},
                "pagination": {
                    "type": "offset",
                    "limit_param": "_limit",
                    "offset_param": "_start",
                    "page_size": 10,
                    "max_pages": 1
                },
                "data_path": "$",
                "map": {
                    "id": "id",
                    "title": "title",
                    "description_snippet": "body"
                },
                "success_codes": [200]
            }),
            "crawl_frequency_days": 7,
            "status": "active"
        }
        
        # Create source
        create_response = requests.post(
            f"{BACKEND_URL}/admin/sources",
            json=test_source,
            cookies=cookies,
            timeout=10
        )
        
        if create_response.status_code in [200, 201]:
            source_data = create_response.json()
            source_id = source_data.get("id")
            print_result(True, f"API source created successfully. ID: {source_id}")
            
            # Test the source
            test_response = requests.post(
                f"{BACKEND_URL}/admin/sources/{source_id}/test",
                cookies=cookies,
                timeout=30
            )
            
            if test_response.status_code == 200:
                test_data = test_response.json()
                count = test_data.get("count", 0)
                print_result(True, f"API source test passed. Jobs found: {count}")
                
                # Clean up - delete the test source
                delete_response = requests.delete(
                    f"{BACKEND_URL}/admin/sources/{source_id}",
                    cookies=cookies,
                    timeout=10
                )
                
                if delete_response.status_code == 200:
                    print_result(True, "Test source deleted successfully")
                else:
                    print(f"    WARNING: Could not delete test source: {delete_response.status_code}")
                
                return True
            else:
                print_result(False, f"API source test failed: {test_response.status_code}", test_response.text)
                return False
        else:
            print_result(False, f"API source creation failed: {create_response.status_code}", create_response.text)
            return False
    except Exception as e:
        print_result(False, f"API source creation test failed: {e}")
        return False

def main():
    """Run all tests"""
    print("="*60)
    print("  AidJobs Integration Tests")
    print("="*60)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Admin Password: {'***' if ADMIN_PASSWORD else 'Not set'}")
    
    results = {
        "database": test_database_connection(),
        "meilisearch": test_meilisearch_status(),
        "meilisearch_reindex": test_meilisearch_reindex(),
        "api_source": test_api_source_framework(),
        "api_source_create": test_api_source_create(),
    }
    
    # Summary
    print_section("Test Summary")
    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    skipped = sum(1 for v in results.values() if v is None)
    
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Skipped: {skipped}")
    print(f"Total: {len(results)}")
    
    if failed == 0:
        print("\n[SUCCESS] All tests passed!")
        return 0
    else:
        print("\n[FAILURE] Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)

