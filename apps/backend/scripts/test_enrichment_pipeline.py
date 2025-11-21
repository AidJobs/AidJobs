#!/usr/bin/env python3
"""
Test the full enrichment pipeline with a real job from the database.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from app.db_config import db_config
    from app.enrichment import enrich_and_save_job
except ImportError as e:
    print(f"Error: {e}")
    sys.exit(1)


def main():
    print("Testing Enrichment Pipeline")
    print("=" * 60)
    
    # Check API key
    if not os.getenv("OPENROUTER_API_KEY"):
        print("ERROR: OPENROUTER_API_KEY not set")
        sys.exit(1)
    
    # Get connection
    conn_params = db_config.get_connection_params()
    if not conn_params:
        print("ERROR: Database not configured")
        sys.exit(1)
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=10)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get one active job
        cursor.execute("""
            SELECT id::text, title, description_snippet, org_name, location_raw, functional_tags
            FROM jobs
            WHERE status = 'active'
            LIMIT 1
        """)
        
        job = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not job:
            print("No active jobs found in database")
            return
        
        print(f"Testing with job: {job['title']}")
        print(f"Org: {job.get('org_name', 'N/A')}")
        print()
        
        # Enrich the job
        functional_role_hint = None
        if job.get("functional_tags"):
            functional_role_hint = " ".join(job["functional_tags"][:3])
        
        print("Enriching job...")
        success = enrich_and_save_job(
            job_id=job["id"],
            title=job["title"],
            description=job.get("description_snippet") or "",
            org_name=job.get("org_name"),
            location=job.get("location_raw"),
            functional_role_hint=functional_role_hint,
        )
        
        if success:
            print("SUCCESS: Job enriched and saved to database")
            
            # Verify it was saved
            conn = psycopg2.connect(**conn_params, connect_timeout=10)
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT impact_domain, functional_role, experience_level, sdgs, confidence_overall, enriched_at
                FROM jobs
                WHERE id::text = %s
            """, (job["id"],))
            
            enriched = cursor.fetchone()
            cursor.close()
            conn.close()
            
            print()
            print("Saved enrichment data:")
            print(f"  Impact Domain: {enriched.get('impact_domain', [])}")
            print(f"  Functional Role: {enriched.get('functional_role', [])}")
            print(f"  Experience Level: {enriched.get('experience_level', 'N/A')}")
            print(f"  SDGs: {enriched.get('sdgs', [])}")
            print(f"  Confidence: {enriched.get('confidence_overall', 'N/A')}")
            print(f"  Enriched At: {enriched.get('enriched_at', 'N/A')}")
        else:
            print("ERROR: Enrichment failed")
            sys.exit(1)
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

