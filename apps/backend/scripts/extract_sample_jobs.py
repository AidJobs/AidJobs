#!/usr/bin/env python3
"""
Extract sample jobs from jobs_side table for shadow test analysis.
Read-only script - does not modify any data.
"""
import os
import sys
import json
from pathlib import Path
from datetime import datetime

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2.extras import RealDictCursor

REPORT_DIR = Path(__file__).parent.parent / "report"
REPORT_DIR.mkdir(parents=True, exist_ok=True)


def get_db_url():
    """Get database URL from environment."""
    return os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")


def extract_sample_jobs(db_url: str, source_id: str, org_name: str, limit: int = 10):
    """Extract sample jobs from jobs_side table for a given source."""
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT 
                    title, 
                    apply_url, 
                    location_raw as location,
                    created_at
                FROM jobs_side
                WHERE source_id = %s
                ORDER BY created_at DESC
                LIMIT %s
            """, (source_id, limit))
            
            jobs = cur.fetchall()
            return [dict(job) for job in jobs]
    finally:
        conn.close()


def main():
    """Extract sample jobs for each domain."""
    db_url = get_db_url()
    if not db_url:
        print("ERROR: Database URL not configured")
        sys.exit(1)
    
    # Source IDs from the reports
    sources = [
        {
            'id': 'bdbba55a-b9cb-4fd5-99f1-6d9446b0c658',
            'org_name': 'UNDP Consultancies',
            'domain': 'jobs.undp.org',
            'output_file': 'samples_undp.json'
        },
        {
            'id': 'd8fb4848-7019-416d-b862-947ac890b69f',
            'org_name': 'Unicef',
            'domain': 'jobs.unicef.org',
            'output_file': 'samples_unicef.json'
        },
        {
            'id': '12b14bdb-53ea-4082-9ec8-211344115dd0',
            'org_name': 'UNESCO',
            'domain': 'careers.unesco.org',
            'output_file': 'samples_unesco.json'
        }
    ]
    
    all_samples = {}
    
    for source in sources:
        print(f"\n{'='*80}")
        print(f"Extracting samples for: {source['org_name']} ({source['domain']})")
        print(f"{'='*80}")
        
        jobs = extract_sample_jobs(db_url, source['id'], source['org_name'], limit=10)
        
        # Process jobs
        processed_jobs = []
        for job in jobs:
            processed = {
                'title': job.get('title', ''),
                'apply_url': job.get('apply_url', ''),
                'location': job.get('location', ''),
                'created_at': job.get('created_at').isoformat() if job.get('created_at') else None
            }
            
            # Check for mailto
            if processed['apply_url'] and processed['apply_url'].startswith('mailto:'):
                processed['mailto-contact'] = True
                processed['contact_email'] = processed['apply_url'].replace('mailto:', '')
            else:
                processed['mailto-contact'] = False
            
            processed_jobs.append(processed)
        
        # Save to file
        output_path = REPORT_DIR / source['output_file']
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump({
                'domain': source['domain'],
                'org_name': source['org_name'],
                'source_id': source['id'],
                'extracted_at': datetime.utcnow().isoformat() + 'Z',
                'sample_count': len(processed_jobs),
                'samples': processed_jobs
            }, f, indent=2, ensure_ascii=False)
        
        print(f"✓ Extracted {len(processed_jobs)} sample jobs")
        print(f"✓ Saved to: {output_path}")
        
        # Print first 10 samples
        print(f"\nFirst {min(10, len(processed_jobs))} sample jobs:")
        print("-" * 80)
        for i, job in enumerate(processed_jobs[:10], 1):
            print(f"\n{i}. {job['title'][:80]}")
            print(f"   URL: {job['apply_url'][:100]}")
            if job.get('mailto-contact'):
                print(f"   ⚠ MAILTO-CONTACT: {job.get('contact_email', '')}")
            if job.get('location'):
                print(f"   Location: {job['location']}")
        
        all_samples[source['domain']] = processed_jobs
    
    print(f"\n{'='*80}")
    print("EXTRACTION COMPLETE")
    print(f"{'='*80}")
    print(f"\nSample files saved:")
    for source in sources:
        print(f"  - {REPORT_DIR / source['output_file']}")


if __name__ == "__main__":
    main()

