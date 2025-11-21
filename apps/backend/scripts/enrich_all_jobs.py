#!/usr/bin/env python3
"""
Enrich all existing jobs in the database.
This script will enrich all active jobs with impact domain, functional role, experience level, and SDGs.
"""
import os
import sys
import argparse
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from app.db_config import db_config
    from app.enrichment import batch_enrich_jobs
except ImportError as e:
    print(f"Error: Required dependencies not available: {e}")
    print("Make sure you're in the backend directory and dependencies are installed")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Enrich all existing jobs in the database")
    parser.add_argument('--yes', '-y', action='store_true', help='Skip confirmation prompt')
    args = parser.parse_args()
    
    print("AidJobs Job Enrichment")
    print("=" * 60)
    
    # Check for OpenRouter API key
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("Error: OPENROUTER_API_KEY environment variable is not set")
        print("Please set it before running enrichment:")
        print("  export OPENROUTER_API_KEY='your-key-here'")
        print("  Or add it to your .env file")
        sys.exit(1)
    
    print(f"OpenRouter API Key: {api_key[:20]}...{api_key[-10:]}")
    model = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    print(f"Model: {model}\n")
    
    # Get connection params
    conn_params = db_config.get_connection_params()
    
    if not conn_params:
        print("Error: Database not configured")
        print("Please set SUPABASE_DB_URL environment variable")
        sys.exit(1)
    
    print(f"Connecting to: {conn_params['host']}:{conn_params['port']}")
    
    # Connect to database
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=10)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        print("[OK] Connected to database\n")
    except psycopg2.OperationalError as e:
        print(f"[ERROR] Connection failed: {e}")
        sys.exit(1)
    
    try:
        # Get all active job IDs
        print("Fetching active jobs...")
        cursor.execute("""
            SELECT id::text, title, org_name
            FROM jobs
            WHERE status = 'active'
            ORDER BY created_at DESC
        """)
        
        jobs = cursor.fetchall()
        job_ids = [job['id'] for job in jobs]
        
        print(f"Found {len(job_ids)} active job(s)\n")
        
        if len(job_ids) == 0:
            print("No jobs to enrich.")
            return
        
        # Ask for confirmation (unless --yes flag is used)
        if not args.yes:
            print(f"This will enrich {len(job_ids)} job(s) using OpenRouter API.")
            print("This may take several minutes and will consume API credits.")
            try:
                response = input("Continue? (yes/no): ").strip().lower()
                if response != 'yes':
                    print("Cancelled.")
                    return
            except (EOFError, KeyboardInterrupt):
                print("\nCancelled (non-interactive mode). Use --yes flag to skip confirmation.")
                return
        else:
            print(f"Enriching {len(job_ids)} job(s) using OpenRouter API...")
        
        # Enrich in batches
        print(f"\nEnriching jobs in batches of 10...")
        result = batch_enrich_jobs(job_ids, batch_size=10)
        
        print("\n" + "=" * 60)
        print("Enrichment Results:")
        print(f"  Success: {result['success_count']}")
        print(f"  Errors: {result['error_count']}")
        
        if result['errors']:
            print(f"\nFirst 10 errors:")
            for error in result['errors'][:10]:
                print(f"  - {error}")
        
        print("\n[OK] Enrichment completed")
        
    except Exception as e:
        print(f"\n[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()

