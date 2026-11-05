#!/usr/bin/env python3
"""
Test script to verify dashboard endpoints are functional.
Tests all endpoints used by the admin dashboard.
"""

import os
import sys
import requests
import json
from typing import Dict, Any

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Get backend URL from environment or use default
BACKEND_URL = os.getenv("BACKEND_URL", "https://aidjobs-backend.onrender.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

def print_section(title: str):
    """Print a section header"""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def print_result(name: str, success: bool, details: Any = None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} - {name}")
    if details:
        if isinstance(details, dict):
            print(f"   Details: {json.dumps(details, indent=2)}")
        else:
            print(f"   Details: {details}")

def test_db_status() -> bool:
    """Public /api/db/status: exactly {"ok": true} (security stage 7), or a fixed failure."""
    print_section("Database Status Endpoint (public)")
    try:
        url = f"{BACKEND_URL}/api/db/status"
        print(f"Testing: GET {url}")
        
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_result("Database Status", False, f"HTTP {response.status_code}")
            return False
        
        try:
            data = response.json()
        except json.JSONDecodeError:
            print_result("Database Status", False, "Invalid JSON")
            return False
        
        if data == {"ok": True}:
            print_result("Database Status", True, data)
            return True
        if isinstance(data, dict) and data.get("ok") is False and set(data) == {"ok", "error"}:
            print_result("Database Status", False, f"Database not OK: {data['error']}")
            return False
        print_result("Database Status", False, f"Unexpected answer with keys {sorted(data) if isinstance(data, dict) else type(data).__name__}")
        return False
            
    except requests.exceptions.RequestException as e:
        print_result("Database Status", False, f"Request failed: {type(e).__name__}")
        return False


def test_admin_db_status(cookie: str) -> bool:
    """Admin /api/admin/db/status: the counts and the open jobs per source."""
    print_section("Database Status Endpoint (admin)")
    if not cookie:
        print("⚠️  No admin session, skipping")
        return False
    
    try:
        url = f"{BACKEND_URL}/api/admin/db/status"
        print(f"Testing: GET {url}")
        unsigned = requests.get(url, timeout=10)
        if unsigned.status_code != 401:
            print_result("Admin Database Status", False, f"Without a session: HTTP {unsigned.status_code}, expected 401")
            return False
        
        response = requests.get(url, cookies={"aidjobs_admin_session": cookie}, timeout=30)
        print(f"Status Code: {response.status_code}")
        if response.status_code != 200:
            print_result("Admin Database Status", False, f"HTTP {response.status_code}")
            return False
        
        data = response.json()
        counts = data.get("row_counts") or {}
        breakdown = data.get("source_breakdown")
        if data.get("ok") and {"jobs", "active_jobs", "sources"} <= set(counts) and isinstance(breakdown, list):
            print_result("Admin Database Status", True, {
                "jobs": counts["jobs"],
                "active_jobs": counts["active_jobs"],
                "sources": counts["sources"],
                "sources_listed": len(breakdown),
            })
            return True
        print_result("Admin Database Status", False, data.get("error", "Missing counts or per-source list"))
        return False
    except (requests.exceptions.RequestException, ValueError) as e:
        print_result("Admin Database Status", False, f"Request failed: {type(e).__name__}")
        return False

def test_search_status() -> bool:
    """Test /api/search/status endpoint"""
    print_section("Search Status Endpoint")
    try:
        url = f"{BACKEND_URL}/api/search/status"
        print(f"Testing: GET {url}")
        
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type', 'unknown')}")
        print(f"Content-Length: {len(response.content)} bytes")
        
        if response.status_code != 200:
            print_result("Search Status", False, f"HTTP {response.status_code}: {response.text[:200]}")
            return False
        
        # Check if response is empty
        if not response.text or len(response.text.strip()) == 0:
            print_result("Search Status", False, "Empty response body")
            return False
        
        try:
            data = response.json()
        except json.JSONDecodeError as e:
            print_result("Search Status", False, f"Invalid JSON: {e}")
            print(f"   Response text (first 500 chars): {response.text[:500]}")
            return False
        
        if not isinstance(data, dict):
            print_result("Search Status", False, f"Expected dict, got {type(data)}")
            return False
        
        # Check required fields
        has_enabled = "enabled" in data
        
        if data.get("enabled"):
            has_index = "index" in data
            has_stats = "index" in data and "stats" in data.get("index", {})
            has_docs = "index" in data and "stats" in data.get("index", {}) and "numberOfDocuments" in data.get("index", {}).get("stats", {})
            
            print_result("Search Status", True, {
                "enabled": data.get("enabled"),
                "index_name": data.get("index", {}).get("name", "N/A"),
                "documents": data.get("index", {}).get("stats", {}).get("numberOfDocuments", 0),
                "isIndexing": data.get("index", {}).get("stats", {}).get("isIndexing", False),
                "lastReindexedAt": data.get("index", {}).get("lastReindexedAt", "Not set")
            })
            return True
        else:
            error = data.get("error", "Unknown error")
            print_result("Search Status", False, f"Search not enabled: {error}")
            return False
            
    except requests.exceptions.RequestException as e:
        print_result("Search Status", False, f"Request failed: {e}")
        return False
    except Exception as e:
        print_result("Search Status", False, f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_admin_login() -> tuple[bool, str]:
    """Test admin login and return session cookie"""
    print_section("Admin Login")
    if not ADMIN_PASSWORD:
        print("⚠️  ADMIN_PASSWORD not set, skipping admin endpoints")
        return False, ""
    
    try:
        url = f"{BACKEND_URL}/api/admin/login"
        print(f"Testing: POST {url}")
        
        response = requests.post(
            url,
            json={"password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if response.status_code == 200:
            cookie = response.cookies.get("aidjobs_admin_session", "")
            print_result("Admin Login", True, "Login successful")
            return True, cookie
        else:
            print_result("Admin Login", False, f"HTTP {response.status_code}: {response.text[:200]}")
            return False, ""
    except Exception as e:
        print_result("Admin Login", False, f"Error: {e}")
        return False, ""

def test_search_init(cookie: str) -> bool:
    """Test /admin/search/init endpoint"""
    print_section("Initialize Search Index")
    if not cookie:
        print("⚠️  No admin session, skipping")
        return False
    
    try:
        url = f"{BACKEND_URL}/admin/search/init"
        print(f"Testing: POST {url}")
        
        response = requests.post(
            url,
            cookies={"aidjobs_admin_session": cookie},
            timeout=30
        )
        
        if response.status_code != 200:
            print_result("Initialize Index", False, f"HTTP {response.status_code}: {response.text[:200]}")
            return False
        
        try:
            data = response.json()
        except json.JSONDecodeError as e:
            print_result("Initialize Index", False, f"Invalid JSON: {e}")
            return False
        
        success = data.get("success", False)
        if success:
            print_result("Initialize Index", True, data.get("message", "Initialized"))
        else:
            print_result("Initialize Index", False, data.get("error", "Unknown error"))
        
        return success
        
    except Exception as e:
        print_result("Initialize Index", False, f"Error: {e}")
        return False

def test_search_reindex(cookie: str) -> bool:
    """Test /admin/search/reindex endpoint"""
    print_section("Reindex Search")
    if not cookie:
        print("⚠️  No admin session, skipping")
        return False
    
    try:
        url = f"{BACKEND_URL}/admin/search/reindex"
        print(f"Testing: POST {url}")
        print("   (This may take a while...)")
        
        response = requests.post(
            url,
            cookies={"aidjobs_admin_session": cookie},
            timeout=300  # 5 minutes for large reindex
        )
        
        if response.status_code != 200:
            print_result("Reindex", False, f"HTTP {response.status_code}: {response.text[:200]}")
            return False
        
        try:
            data = response.json()
        except json.JSONDecodeError as e:
            print_result("Reindex", False, f"Invalid JSON: {e}")
            return False
        
        if "error" in data:
            print_result("Reindex", False, data.get("error", "Unknown error"))
            return False
        
        indexed = data.get("indexed", 0)
        skipped = data.get("skipped", 0)
        duration = data.get("duration_ms", 0)
        
        print_result("Reindex", True, {
            "indexed": indexed,
            "skipped": skipped,
            "duration_ms": duration
        })
        return True
        
    except requests.exceptions.Timeout:
        print_result("Reindex", False, "Request timed out (may be indexing large dataset)")
        return False
    except Exception as e:
        print_result("Reindex", False, f"Error: {e}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("  DASHBOARD ENDPOINTS FUNCTIONALITY TEST")
    print("="*60)
    print(f"\nBackend URL: {BACKEND_URL}")
    print(f"Admin Password: {'Set' if ADMIN_PASSWORD else 'Not set'}")
    
    results = {
        "db_status": False,
        "search_status": False,
        "admin_login": False,
        "admin_db_status": False,
        "search_init": False,
        "search_reindex": False,
    }
    
    # Test public endpoints
    results["db_status"] = test_db_status()
    results["search_status"] = test_search_status()
    
    # Test admin endpoints (if password is set)
    if ADMIN_PASSWORD:
        login_success, cookie = test_admin_login()
        results["admin_login"] = login_success
        
        if login_success:
            results["admin_db_status"] = test_admin_db_status(cookie)
            results["search_init"] = test_search_init(cookie)
            # Only test reindex if user wants (it's slow)
            # results["search_reindex"] = test_search_reindex(cookie)
    
    # Summary
    print_section("Test Summary")
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    for name, success in results.items():
        status = "✅" if success else "❌"
        print(f"{status} {name.replace('_', ' ').title()}")
    
    print(f"\nResults: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Dashboard endpoints are functional.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the details above.")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)

