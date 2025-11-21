#!/usr/bin/env python3
"""
Test enrichment with a small batch of jobs (default: 10).
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from app.db_config import db_config
    from app.enrichment import batch_enrich_jobs
except ImportError as e:
    print(f"Error: {e}")
    sys.exit(1)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Test enrichment with a small batch")
    parser.add_argument('--limit', '-n', type=int, default=10, help='Number of jobs to enrich (default: 10)')
    args = parser.parse_args()
    
    print("AidJobs Job Enrichment - Test Batch")
    print("=" * 60)
    
    # Check API key
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("Error: OPENROUTER_API_KEY environment variable is not set")
        sys.exit(1)
    
    print(f"OpenRouter API Key: {api_key[:20]}...{api_key[-10:]}")
    model = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    print(f"Model: {model}\n")
    
    # Get connection
    conn_params = db_config.get_connection_params()
    if not conn_params:
        print("Error: Database not configured")
        sys.exit(1)
    
    print(f"Connecting to: {conn_params['host']}:{conn_params['port']}")
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=10)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        print("[OK] Connected to database\n")
        
        # Get limited number of active jobs
        print(f"Fetching {args.limit} active job(s)...")
        cursor.execute("""
            SELECT id::text, title, org_name, description_snippet
            FROM jobs
            WHERE status = 'active'
            ORDER BY created_at DESC
            LIMIT %s
        """, (args.limit,))
        
        jobs = cursor.fetchall()
        job_ids = [job['id'] for job in jobs]
        
        print(f"Found {len(job_ids)} job(s) to enrich:\n")
        for i, job in enumerate(jobs, 1):
            print(f"  {i}. {job['title']} ({job.get('org_name', 'N/A')})")
        
        print(f"\nEnriching {len(job_ids)} job(s) in batches of 5...")
        print("-" * 60)
        
        # Enrich in smaller batches for testing
        result = batch_enrich_jobs(job_ids, batch_size=5)
        
        print("\n" + "=" * 60)
        print("Enrichment Results:")
        print(f"  [OK] Success: {result['success_count']}")
        print(f"  [ERROR] Errors: {result['error_count']}")
        
        if result['errors']:
            print(f"\nErrors encountered:")
            for error in result['errors'][:5]:  # Show first 5 errors
                print(f"  - {error}")
        
        # Verify enriched jobs
        print("\n" + "=" * 60)
        print("Verifying enriched jobs...")
        cursor.execute("""
            SELECT id::text, title, impact_domain, functional_role, experience_level, 
                   sdgs, confidence_overall, enriched_at
            FROM jobs
            WHERE id::text = ANY(%s)
            ORDER BY enriched_at DESC NULLS LAST
        """, (job_ids,))
        
        enriched_jobs = cursor.fetchall()
        
        print(f"\nEnrichment Status:")
        for job in enriched_jobs:
            status = "[OK] Enriched" if job.get('enriched_at') else "[SKIP] Not enriched"
            print(f"  {status}: {job['title'][:50]}")
            if job.get('enriched_at'):
                print(f"    Impact: {job.get('impact_domain', [])[:2]}")
                print(f"    Role: {job.get('functional_role', [])[:2]}")
                print(f"    Level: {job.get('experience_level', 'N/A')}")
                print(f"    SDGs: {job.get('sdgs', [])}")
                print(f"    Confidence: {job.get('confidence_overall', 'N/A')}")
        
        cursor.close()
        conn.close()
        
        print("\n" + "=" * 60)
        if result['success_count'] > 0:
            print(f"[OK] Test batch enrichment completed successfully!")
            print(f"   {result['success_count']} out of {len(job_ids)} jobs enriched")
        else:
            print("[ERROR] Test batch enrichment failed")
            print("   Check errors above for details")
        
    except Exception as e:
        print(f"\n[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

