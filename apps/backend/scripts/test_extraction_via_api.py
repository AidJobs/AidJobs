"""
Test extraction via API endpoints.

This script uses the existing API endpoints to test extraction,
avoiding dependency issues.
"""

import os
import sys
import requests
import json
from typing import Dict, List, Optional

# Get API URL from environment or use default
API_URL = os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:8000").replace("/api", "")

def get_admin_cookie():
    """Get admin session cookie from environment or prompt"""
    # In production, you'd get this from your admin session
    # For testing, you might need to authenticate first
    cookie = os.getenv("ADMIN_SESSION_COOKIE")
    if not cookie:
        print("Note: ADMIN_SESSION_COOKIE not set. You may need to authenticate first.")
        print("Visit the admin login page and copy your session cookie.")
    return cookie

def test_unesco_extraction():
    """Test UNESCO extraction via diagnostic endpoint"""
    print("=" * 80)
    print("Testing UNESCO Extraction via API")
    print("=" * 80)
    print()
    
    cookie = get_admin_cookie()
    headers = {}
    if cookie:
        headers["Cookie"] = cookie
    
    try:
        response = requests.get(
            f"{API_URL}/api/admin/crawl/diagnostics/unesco",
            headers=headers,
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ UNESCO Extraction Test Results:")
            print(json.dumps(data, indent=2))
            return data
        elif response.status_code == 401:
            print("❌ Authentication required. Please set ADMIN_SESSION_COOKIE or login first.")
            return None
        else:
            print(f"❌ Error: HTTP {response.status_code}")
            print(response.text)
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        print(f"   Make sure the backend is running at {API_URL}")
        return None

def test_undp_extraction():
    """Test UNDP extraction via diagnostic endpoint"""
    print("=" * 80)
    print("Testing UNDP Extraction via API")
    print("=" * 80)
    print()
    
    cookie = get_admin_cookie()
    headers = {}
    if cookie:
        headers["Cookie"] = cookie
    
    try:
        response = requests.get(
            f"{API_URL}/api/admin/crawl/diagnostics/undp",
            headers=headers,
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ UNDP Extraction Test Results:")
            print(json.dumps(data, indent=2))
            return data
        elif response.status_code == 401:
            print("❌ Authentication required. Please set ADMIN_SESSION_COOKIE or login first.")
            return None
        else:
            print(f"❌ Error: HTTP {response.status_code}")
            print(response.text)
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        print(f"   Make sure the backend is running at {API_URL}")
        return None

def run_crawl_for_source(org_name: str):
    """Run a crawl for a specific source"""
    print("=" * 80)
    print(f"Running Crawl for {org_name}")
    print("=" * 80)
    print()
    
    # First, get the source ID
    cookie = get_admin_cookie()
    headers = {}
    if cookie:
        headers["Cookie"] = cookie
    
    try:
        # Get sources list (you might need to implement this endpoint or query DB directly)
        # For now, let's use the run endpoint directly if we know the source ID
        print(f"Note: To run a crawl, you need the source ID.")
        print(f"   You can find it in the admin UI or database.")
        print()
        print(f"To trigger a crawl via API:")
        print(f"  POST {API_URL}/api/admin/crawl/run")
        print(f"  Body: {{'source_id': '<source_id>'}}")
        print()
        
    except Exception as e:
        print(f"❌ Error: {e}")

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Test extraction via API')
    parser.add_argument('--org', type=str, choices=['unesco', 'undp', 'both'], 
                       default='both', help='Organization to test')
    parser.add_argument('--api-url', type=str, help='API base URL')
    args = parser.parse_args()
    
    global API_URL
    if args.api_url:
        API_URL = args.api_url.replace("/api", "")
    
    print(f"Using API URL: {API_URL}")
    print()
    
    results = {}
    
    if args.org in ['unesco', 'both']:
        results['unesco'] = test_unesco_extraction()
        print()
    
    if args.org in ['undp', 'both']:
        results['undp'] = test_undp_extraction()
        print()
    
    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    for org, result in results.items():
        if result:
            if 'jobs_found' in result:
                print(f"{org.upper()}: Found {result.get('jobs_found', 0)} jobs")
            elif 'status' in result:
                print(f"{org.upper()}: {result.get('status', 'unknown')}")
        else:
            print(f"{org.upper()}: Failed to test")
    
    print()
    print("Note: For detailed results, check the JSON output above.")
    print("      If authentication failed, login to admin UI first.")

if __name__ == '__main__':
    main()

