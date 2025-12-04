"""
Backfill quality scores for existing jobs that don't have scores.
This allows existing jobs to show quality scores in the UI.
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from pathlib import Path
import json

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.data_quality import get_quality_scorer


def backfill_quality_scores(limit: int = 1000, dry_run: bool = False):
    """
    Backfill quality scores for jobs without scores.
    
    Args:
        limit: Maximum number of jobs to process
        dry_run: If True, don't update database
    """
    # Get database URL
    db_url = os.getenv('SUPABASE_DB_URL') or os.getenv('DATABASE_URL')
    
    if not db_url:
        print("ERROR: SUPABASE_DB_URL or DATABASE_URL environment variable is not set")
        sys.exit(1)
    
    # Initialize quality scorer
    scorer = get_quality_scorer()
    
    # Connect to database
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Find jobs without quality scores
        cur.execute("""
            SELECT id, title, apply_url, location_raw, deadline, 
                   org_name, description_snippet, country, country_iso, city,
                   latitude, longitude, is_remote
            FROM jobs
            WHERE quality_score IS NULL
            AND status = 'active'
            AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))
        
        jobs = cur.fetchall()
        print(f"Found {len(jobs)} jobs without quality scores")
        
        if dry_run:
            print("DRY RUN MODE - No updates will be made")
        
        updated = 0
        for job in jobs:
            try:
                # Convert to dict format expected by scorer
                job_dict = {
                    'title': job.get('title', ''),
                    'apply_url': job.get('apply_url', ''),
                    'location_raw': job.get('location_raw', ''),
                    'deadline': str(job.get('deadline')) if job.get('deadline') else None,
                    'org_name': job.get('org_name', ''),
                    'description_snippet': job.get('description_snippet', ''),
                    'country': job.get('country', ''),
                    'country_iso': job.get('country_iso', ''),
                    'city': job.get('city', ''),
                    'latitude': job.get('latitude'),
                    'longitude': job.get('longitude'),
                    'is_remote': job.get('is_remote', False)
                }
                
                # Score the job
                result = scorer.score_job(job_dict)
                
                if not dry_run:
                    # Update job with quality score
                    cur.execute("""
                        UPDATE jobs
                        SET quality_score = %s,
                            quality_grade = %s,
                            quality_factors = %s::jsonb,
                            quality_issues = %s,
                            needs_review = %s,
                            quality_scored_at = NOW()
                        WHERE id = %s
                    """, (
                        result['score'],
                        result['grade'],
                        json.dumps(result['factors']),
                        result['issues'],
                        result['needs_review'],
                        job['id']
                    ))
                    updated += 1
                else:
                    print(f"Would update: {job.get('title', 'Unknown')[:50]} - Score: {result['score']:.2f}, Grade: {result['grade']}")
                    updated += 1
                
            except Exception as e:
                print(f"Error processing job {job.get('id')}: {e}")
                continue
        
        if not dry_run:
            conn.commit()
            print(f"✅ Updated {updated} jobs with quality scores")
        else:
            print(f"✅ Would update {updated} jobs with quality scores")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Backfill quality scores for existing jobs')
    parser.add_argument('--limit', type=int, default=1000, help='Maximum number of jobs to process')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode (no database updates)')
    
    args = parser.parse_args()
    
    backfill_quality_scores(limit=args.limit, dry_run=args.dry_run)
