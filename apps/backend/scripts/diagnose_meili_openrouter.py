#!/usr/bin/env python3
"""
Diagnostic script to check Meilisearch and OpenRouter configuration and connectivity.
Run this to identify why Meilisearch or OpenRouter might not be working.
"""
import os
import sys

# Try to load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # dotenv not available, will use system environment variables
    pass

def print_section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def print_result(success, message, details=None):
    status = "✓" if success else "✗"
    print(f"{status} {message}")
    if details:
        for detail in details:
            print(f"    {detail}")

def check_meilisearch():
    """Check Meilisearch configuration and connectivity"""
    print_section("Meilisearch Configuration")
    
    # Check environment variables
    meili_url = os.getenv("MEILISEARCH_URL")
    meili_key = os.getenv("MEILISEARCH_KEY")
    meili_host = os.getenv("MEILI_HOST")
    meili_master_key = os.getenv("MEILI_MASTER_KEY")
    meili_api_key = os.getenv("MEILI_API_KEY")
    meili_index = os.getenv("MEILI_JOBS_INDEX", "jobs_index")
    enable_search = os.getenv("AIDJOBS_ENABLE_SEARCH", "true").lower()
    
    print("\nEnvironment Variables:")
    print_result(bool(meili_url), f"MEILISEARCH_URL: {'Set' if meili_url else 'NOT SET'}", 
                 [f"  Value: {meili_url}"] if meili_url else None)
    print_result(bool(meili_key), f"MEILISEARCH_KEY: {'Set' if meili_key else 'NOT SET'}", 
                 [f"  Value: {'*' * 20}...{meili_key[-10:]}" if meili_key else None])
    print_result(bool(meili_host), f"MEILI_HOST (legacy): {'Set' if meili_host else 'NOT SET'}", 
                 [f"  Value: {meili_host}"] if meili_host else None)
    print_result(bool(meili_master_key or meili_api_key), 
                 f"MEILI_MASTER_KEY/MEILI_API_KEY (legacy): {'Set' if (meili_master_key or meili_api_key) else 'NOT SET'}")
    print(f"  MEILI_JOBS_INDEX: {meili_index}")
    print(f"  AIDJOBS_ENABLE_SEARCH: {enable_search}")
    
    # Determine which config is being used
    has_new_config = bool(meili_url and meili_key)
    has_legacy_config = bool(meili_host and (meili_master_key or meili_api_key))
    
    print("\nConfiguration Status:")
    if has_new_config:
        print_result(True, "Using NEW configuration (MEILISEARCH_URL + MEILISEARCH_KEY)")
        host = meili_url
        key = meili_key
    elif has_legacy_config:
        print_result(True, "Using LEGACY configuration (MEILI_HOST + MEILI_MASTER_KEY/MEILI_API_KEY)")
        host = meili_host
        key = meili_master_key or meili_api_key
    else:
        print_result(False, "No valid Meilisearch configuration found!")
        print("  Either set MEILISEARCH_URL + MEILISEARCH_KEY")
        print("  OR set MEILI_HOST + MEILI_MASTER_KEY (or MEILI_API_KEY)")
        return False
    
    # Test connection
    print("\nTesting Connection:")
    try:
        import meilisearch
        client = meilisearch.Client(host, key)
        
        # Try to get health
        try:
            health = client.health()
            print_result(True, f"Meilisearch is reachable and healthy", 
                        [f"  Status: {health.get('status', 'unknown')}"])
        except Exception as e:
            print_result(False, f"Meilisearch health check failed: {e}")
            return False
        
        # Try to get index
        try:
            index = client.get_index(meili_index)
            stats = index.get_stats()
            doc_count = stats.get('numberOfDocuments', 0)
            is_indexing = stats.get('isIndexing', False)
            print_result(True, f"Index '{meili_index}' exists", 
                        [f"  Documents: {doc_count}",
                         f"  Currently indexing: {is_indexing}"])
            
            if doc_count == 0:
                print("\n  ⚠️  WARNING: Index is empty! You need to reindex jobs.")
                print("  Run: POST /admin/search/reindex (requires admin auth)")
            
        except Exception as e:
            print_result(False, f"Index '{meili_index}' not found or error: {e}")
            print("  You may need to initialize the index:")
            print("  Run: POST /admin/search/init (requires admin auth)")
            return False
        
        return True
        
    except ImportError:
        print_result(False, "meilisearch Python package not installed")
        print("  Install with: pip install meilisearch")
        return False
    except Exception as e:
        print_result(False, f"Failed to connect to Meilisearch: {e}")
        print(f"  Host: {host}")
        print(f"  Check if Meilisearch is running and accessible")
        return False

def check_openrouter():
    """Check OpenRouter configuration and connectivity"""
    print_section("OpenRouter Configuration")
    
    # Check environment variables
    api_key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    
    print("\nEnvironment Variables:")
    print_result(bool(api_key), f"OPENROUTER_API_KEY: {'Set' if api_key else 'NOT SET'}", 
                 [f"  Value: {api_key[:20]}...{api_key[-10:]}" if api_key else None])
    print(f"  OPENROUTER_MODEL: {model}")
    
    if not api_key:
        print_result(False, "OpenRouter API key not configured!")
        print("  Set OPENROUTER_API_KEY environment variable")
        print("  Get your key from: https://openrouter.ai/keys")
        return False
    
    # Test connection with a simple call
    print("\nTesting Connection:")
    try:
        import requests
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://aidjobs.app",
            "X-Title": "AidJobs Trinity Search",
        }
        
        payload = {
            "model": model,
            "messages": [
                {"role": "user", "content": "ping"}
            ],
            "max_tokens": 5
        }
        
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            print_result(True, f"OpenRouter API is reachable and working", 
                        [f"  Response: {content[:50]}",
                         f"  Model: {model}"])
            return True
        elif response.status_code == 401:
            print_result(False, "OpenRouter API key is invalid (401 Unauthorized)")
            print("  Check your OPENROUTER_API_KEY")
            return False
        else:
            print_result(False, f"OpenRouter API returned error: {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            return False
            
    except ImportError:
        print_result(False, "requests Python package not installed")
        print("  Install with: pip install requests")
        return False
    except Exception as e:
        print_result(False, f"Failed to connect to OpenRouter: {e}")
        print("  Check your internet connection and API key")
        return False

def check_backend_status():
    """Check backend status endpoints"""
    print_section("Backend Status Endpoints")
    
    base_url = os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:8000")
    if not base_url.startswith("http"):
        base_url = f"http://{base_url}"
    
    print(f"\nBackend URL: {base_url}")
    
    try:
        import requests
        
        # Check capabilities
        try:
            response = requests.get(f"{base_url}/api/capabilities", timeout=5)
            if response.status_code == 200:
                data = response.json()
                print_result(True, "Backend is reachable")
                print(f"  Search enabled: {data.get('search', False)}")
                print(f"  AI enabled: {data.get('ai', False)}")
            else:
                print_result(False, f"Backend returned {response.status_code}")
        except Exception as e:
            print_result(False, f"Cannot reach backend: {e}")
            print("  Make sure the backend server is running")
            return False
        
        # Check search status
        try:
            response = requests.get(f"{base_url}/api/search/status", timeout=5)
            if response.status_code == 200:
                data = response.json()
                enabled = data.get('enabled', False)
                error = data.get('error')
                if enabled:
                    stats = data.get('index', {}).get('stats', {})
                    doc_count = stats.get('numberOfDocuments', 0)
                    print_result(True, "Meilisearch status endpoint working", 
                                [f"  Enabled: {enabled}",
                                 f"  Documents: {doc_count}"])
                else:
                    print_result(False, f"Meilisearch not enabled: {error}")
            else:
                print_result(False, f"Search status endpoint returned {response.status_code}")
        except Exception as e:
            print_result(False, f"Cannot check search status: {e}")
        
    except ImportError:
        print_result(False, "requests package not available for backend check")
    except Exception as e:
        print_result(False, f"Error checking backend: {e}")

def main():
    print("\n" + "="*60)
    print("  Meilisearch & OpenRouter Diagnostic Tool")
    print("="*60)
    
    meili_ok = check_meilisearch()
    openrouter_ok = check_openrouter()
    check_backend_status()
    
    print_section("Summary")
    
    if meili_ok:
        print_result(True, "Meilisearch: ✓ Configured and working")
    else:
        print_result(False, "Meilisearch: ✗ Not working - see details above")
    
    if openrouter_ok:
        print_result(True, "OpenRouter: ✓ Configured and working")
    else:
        print_result(False, "OpenRouter: ✗ Not working - see details above")
    
    print("\n" + "="*60)
    print("\nNext Steps:")
    
    if not meili_ok:
        print("1. Set Meilisearch environment variables:")
        print("   - MEILISEARCH_URL (e.g., http://localhost:7700)")
        print("   - MEILISEARCH_KEY (your master key)")
        print("   OR use legacy:")
        print("   - MEILI_HOST")
        print("   - MEILI_MASTER_KEY")
        print("\n2. Make sure Meilisearch is running")
        print("3. Initialize index: POST /admin/search/init")
        print("4. Reindex jobs: POST /admin/search/reindex")
    
    if not openrouter_ok:
        print("\n1. Get API key from: https://openrouter.ai/keys")
        print("2. Set OPENROUTER_API_KEY environment variable")
        print("3. Optional: Set OPENROUTER_MODEL (default: openai/gpt-4o-mini)")
    
    print("\n" + "="*60 + "\n")

if __name__ == "__main__":
    main()

