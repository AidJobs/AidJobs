#!/usr/bin/env python3
"""
Run database migration via the backend API endpoint.
This uses the backend's SUPABASE_DB_URL from Render environment variables.
"""
import os
import sys
import requests

def main():
    # Get backend URL from environment or use default
    backend_url = os.getenv("BACKEND_URL", "https://aidjobs-backend.onrender.com")
    
    # Remove trailing slash
    backend_url = backend_url.rstrip("/")
    
    # Migration endpoint (requires dev mode or admin auth)
    endpoint = f"{backend_url}/api/admin/database/migrate"
    
    print("Running Database Migration")
    print("=" * 60)
    print(f"Backend URL: {backend_url}")
    print(f"Endpoint: {endpoint}")
    print()
    
    try:
        # Make POST request
        response = requests.post(
            endpoint,
            timeout=60,  # Migration might take a while
            headers={
                "Content-Type": "application/json"
            }
        )
        
        # Check response
        if response.status_code == 200:
            result = response.json()
            
            if result.get("status") == "ok":
                data = result.get("data", {})
                print("✓ Migration completed successfully!")
                print()
                print("Results:")
                print("-" * 60)
                print(f"Tables before: {data.get('tables_before', [])}")
                print(f"Tables after: {data.get('tables_after', [])}")
                print(f"New tables: {data.get('new_tables', [])}")
                print()
                print("Table Row Counts:")
                for table, count in data.get('table_counts', {}).items():
                    print(f"  {table:30} {count} rows")
                print()
                print(f"Message: {data.get('message', '')}")
                sys.exit(0)
            else:
                error = result.get("error", "Unknown error")
                print(f"✗ Migration failed: {error}")
                sys.exit(1)
        elif response.status_code == 403:
            print("✗ Access denied. This endpoint requires:")
            print("  - AIDJOBS_ENV=dev, OR")
            print("  - Admin authentication")
            print()
            print("To run in dev mode, set AIDJOBS_ENV=dev in Render environment variables.")
            sys.exit(1)
        else:
            print(f"✗ Request failed with status {response.status_code}")
            print(f"Response: {response.text}")
            sys.exit(1)
            
    except requests.exceptions.Timeout:
        print("✗ Request timed out. Migration might still be running.")
        print("  Check the backend logs to verify completion.")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"✗ Request failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

