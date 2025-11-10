"""
End-to-End Test Script for API Source Framework (Phase 1)
Tests the full stack: Admin API → APICrawler → Database
"""
import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import httpx
from crawler.api_fetch import APICrawler
from core.secrets import resolve_secrets, check_required_secrets


# Configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
TEST_TIMEOUT = 30.0


class E2ETester:
    """End-to-end tester for API Source framework"""
    
    def __init__(self, backend_url: str, admin_password: str):
        self.backend_url = backend_url.rstrip("/")
        self.admin_password = admin_password
        self.session_cookie = None
        self.client = httpx.AsyncClient(timeout=TEST_TIMEOUT, follow_redirects=True)
    
    async def login(self) -> bool:
        """Login to admin and get session cookie"""
        print("\n[TEST] Admin Login...")
        try:
            response = await self.client.post(
                f"{self.backend_url}/api/admin/login",
                json={"password": self.admin_password},
            )
            
            if response.status_code == 200:
                # Get session cookie from response
                cookies = response.cookies
                if "aidjobs_admin_session" in cookies:
                    self.session_cookie = cookies["aidjobs_admin_session"]
                    # Set cookie for future requests
                    self.client.cookies.set("aidjobs_admin_session", self.session_cookie)
                    print("[PASS] Login successful")
                    return True
                else:
                    print("[FAIL] No session cookie in response")
                    return False
            else:
                print(f"[FAIL] Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"[FAIL] Login error: {e}")
            return False
    
    async def create_test_source(self) -> Optional[str]:
        """Create a test API source"""
        print("\n[TEST] Creating API Source...")
        
        test_schema = {
            "v": 1,
            "base_url": "https://jsonplaceholder.typicode.com",
            "path": "/posts",
            "method": "GET",
            "auth": {"type": "none"},
            "headers": {},
            "query": {"_limit": 10},
            "pagination": {
                "type": "offset",
                "offset_param": "_start",
                "limit_param": "_limit",
                "page_size": 10,
                "max_pages": 1
            },
            "data_path": "$",
            "map": {
                "title": "title",
                "description_snippet": "body"
            },
            "success_codes": [200]
        }
        
        try:
            response = await self.client.post(
                f"{self.backend_url}/api/admin/sources",
                json={
                    "org_name": "Test API Source (E2E)",
                    "careers_url": "https://jsonplaceholder.typicode.com/posts",
                    "source_type": "api",
                    "org_type": "NGO",
                    "crawl_frequency_days": 3,
                    "parser_hint": json.dumps(test_schema),
                    "time_window": None
                },
                cookies={"aidjobs_admin_session": self.session_cookie} if self.session_cookie else None,
            )
            
            if response.status_code in [200, 201]:
                result = response.json()
                source_id = result.get("id") or result.get("data", {}).get("id")
                print(f"[PASS] Source created: {source_id}")
                return source_id
            else:
                print(f"[FAIL] Create source failed: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"[FAIL] Create source error: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    async def test_source(self, source_id: str) -> bool:
        """Test the API source"""
        print(f"\n[TEST] Testing Source {source_id}...")
        
        try:
            response = await self.client.post(
                f"{self.backend_url}/api/admin/sources/{source_id}/test",
                cookies={"aidjobs_admin_session": self.session_cookie} if self.session_cookie else None,
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("ok"):
                    print(f"[PASS] Test successful: {result.get('count', 0)} jobs found")
                    print(f"   Status: {result.get('status')}")
                    print(f"   Host: {result.get('host')}")
                    return True
                else:
                    print(f"[FAIL] Test failed: {result.get('error')}")
                    return False
            else:
                print(f"[FAIL] Test endpoint failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"[FAIL] Test error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def simulate_source(self, source_id: str) -> bool:
        """Simulate extraction from the API source"""
        print(f"\n[TEST] Simulating Source {source_id}...")
        
        try:
            response = await self.client.post(
                f"{self.backend_url}/api/admin/sources/{source_id}/simulate_extract",
                cookies={"aidjobs_admin_session": self.session_cookie} if self.session_cookie else None,
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("ok"):
                    count = result.get("count", 0)
                    sample = result.get("sample", [])
                    print(f"[PASS] Simulation successful: {count} jobs found")
                    print(f"   Sample items: {len(sample)}")
                    if sample:
                        print(f"   First job title: {sample[0].get('title', 'N/A')[:50]}...")
                    return True
                else:
                    print(f"[FAIL] Simulation failed: {result.get('error')}")
                    return False
            else:
                print(f"[FAIL] Simulate endpoint failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"[FAIL] Simulate error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def run_crawl(self, source_id: str) -> bool:
        """Run a crawl for the source"""
        print(f"\n[TEST] Running Crawl for Source {source_id}...")
        
        try:
            # First, activate the source
            response = await self.client.patch(
                f"{self.backend_url}/api/admin/sources/{source_id}",
                json={"status": "active"},
                cookies={"aidjobs_admin_session": self.session_cookie} if self.session_cookie else None,
            )
            
            if response.status_code != 200:
                print(f"[WARN] Failed to activate source: {response.status_code}")
            
            # Then trigger crawl
            response = await self.client.post(
                f"{self.backend_url}/api/admin/crawl/run",
                json={"source_id": source_id},
                cookies={"aidjobs_admin_session": self.session_cookie} if self.session_cookie else None,
            )
            
            if response.status_code == 200:
                print("[PASS] Crawl triggered successfully")
                print("   Note: Crawl runs asynchronously, check /admin/crawl for status")
                return True
            else:
                print(f"[FAIL] Crawl trigger failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"[FAIL] Crawl error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def cleanup_test_source(self, source_id: str) -> bool:
        """Delete test source"""
        print(f"\n[TEST] Cleaning up test source {source_id}...")
        
        try:
            response = await self.client.delete(
                f"{self.backend_url}/api/admin/sources/{source_id}",
                cookies={"aidjobs_admin_session": self.session_cookie} if self.session_cookie else None,
            )
            
            if response.status_code in [200, 204]:
                print("[PASS] Test source deleted")
                return True
            else:
                print(f"[WARN] Failed to delete test source: {response.status_code}")
                return False
        except Exception as e:
            print(f"[WARN] Cleanup error: {e}")
            return False
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()


async def test_backend_direct():
    """Test backend APICrawler directly (unit test)"""
    print("\n" + "="*60)
    print("BACKEND DIRECT TEST (Unit Test)")
    print("="*60)
    
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL") or "postgresql://dummy:dummy@localhost/dummy"
    crawler = APICrawler(db_url)
    
    schema = {
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
    
    try:
        jobs = await crawler.fetch_api(
            "https://jsonplaceholder.typicode.com/posts",
            json.dumps(schema),
            last_success_at=None
        )
        
        print(f"[PASS] Backend test: Fetched {len(jobs)} jobs")
        if jobs:
            print(f"   First job: {jobs[0].get('title', 'N/A')[:50]}...")
        return True
    except Exception as e:
        print(f"[FAIL] Backend test error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_e2e_workflow():
    """Test end-to-end workflow through admin API"""
    print("\n" + "="*60)
    print("END-TO-END TEST (Full Stack)")
    print("="*60)
    
    if not ADMIN_PASSWORD:
        print("[SKIP] ADMIN_PASSWORD not set, skipping E2E tests")
        print("   Set ADMIN_PASSWORD environment variable to run E2E tests")
        return True
    
    tester = E2ETester(BACKEND_URL, ADMIN_PASSWORD)
    results = []
    source_id = None
    
    try:
        # Test 1: Login
        if await tester.login():
            results.append(("Login", True))
        else:
            results.append(("Login", False))
            print("[FAIL] Cannot continue without login")
            return False
        
        # Test 2: Create source
        source_id = await tester.create_test_source()
        if source_id:
            results.append(("Create Source", True))
        else:
            results.append(("Create Source", False))
            print("[FAIL] Cannot continue without source")
            return False
        
        # Test 3: Test source
        if await tester.test_source(source_id):
            results.append(("Test Source", True))
        else:
            results.append(("Test Source", False))
        
        # Test 4: Simulate source
        if await tester.simulate_source(source_id):
            results.append(("Simulate Source", True))
        else:
            results.append(("Simulate Source", False))
        
        # Test 5: Run crawl (optional - might take time)
        print("\n[INFO] Running crawl (this may take a while)...")
        if await tester.run_crawl(source_id):
            results.append(("Run Crawl", True))
        else:
            results.append(("Run Crawl", False))
        
        # Cleanup (optional - comment out to keep source for manual testing)
        # await tester.cleanup_test_source(source_id)
        
    finally:
        await tester.close()
    
    # Print summary
    print("\n" + "="*60)
    print("E2E TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("[SUCCESS] All E2E tests passed!")
        return True
    else:
        print("[WARNING] Some E2E tests failed")
        return False


async def run_all_tests():
    """Run all tests"""
    print("\n" + "="*60)
    print("PHASE 1 - COMPREHENSIVE TEST SUITE")
    print("="*60)
    
    results = []
    
    # Test 1: Backend direct test
    try:
        result = await test_backend_direct()
        results.append(("Backend Direct Test", result))
    except Exception as e:
        print(f"[FAIL] Backend test exception: {e}")
        results.append(("Backend Direct Test", False))
    
    # Test 2: E2E workflow test (requires admin password)
    try:
        result = await test_e2e_workflow()
        results.append(("E2E Workflow Test", result))
    except Exception as e:
        print(f"[FAIL] E2E test exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("E2E Workflow Test", False))
    
    # Print final summary
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
        print("[SUCCESS] All tests passed!")
        return 0
    else:
        print("[WARNING] Some tests failed or were skipped")
        return 1


if __name__ == "__main__":
    print("\n" + "="*60)
    print("API SOURCE FRAMEWORK - PHASE 1 E2E TESTS")
    print("="*60)
    print(f"\nBackend URL: {BACKEND_URL}")
    print(f"Admin Password: {'*' * len(ADMIN_PASSWORD) if ADMIN_PASSWORD else 'NOT SET'}")
    print("\nNote: Set ADMIN_PASSWORD environment variable to run E2E tests")
    print("      E2E tests require backend to be running and accessible")
    print("="*60)
    
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)

