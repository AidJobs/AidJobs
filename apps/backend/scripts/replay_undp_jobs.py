#!/usr/bin/env python3
"""
Replay UNDP jobs from jobs_side table to jobs table.
Idempotent - skips duplicates, sets status='pending' for review.
"""
import os
import sys
import json
import hashlib
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Optional
from urllib.parse import urlparse

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2.extras import RealDictCursor

REPORT_DIR = Path(__file__).parent.parent / "report"
REPORT_DIR.mkdir(parents=True, exist_ok=True)


def get_db_url():
    """Get database URL from environment."""
    return os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")


def is_mailto_link(url: str) -> bool:
    """Check if URL is a mailto link."""
    return url and url.strip().lower().startswith('mailto:')


def normalize_title(title: str) -> str:
    """Normalize job title."""
    if not title:
        return ''
    return title.strip()


def parse_deadline(deadline_str: Optional[str]) -> Optional[str]:
    """Parse deadline string to ISO date format."""
    if not deadline_str:
        return None
    
    # Try dateutil if available
    try:
        from dateutil import parser as date_parser
        parsed = date_parser.parse(deadline_str)
        return parsed.strftime('%Y-%m-%d')
    except ImportError:
        pass
    except Exception:
        pass
    
    # Fallback: check if already in YYYY-MM-DD format
    if re.match(r'^\d{4}-\d{2}-\d{2}$', deadline_str):
        return deadline_str
    
    return None


def get_canonical_hash(title: str, apply_url: Optional[str], reference: Optional[str] = None) -> str:
    """Compute canonical hash for deduplication."""
    parts = [title.strip().lower() if title else '']
    
    if apply_url:
        parts.append(apply_url.strip().lower())
    elif reference:
        parts.append(reference.strip().lower())
    
    canonical_text = '|'.join(parts).strip('|')
    return hashlib.md5(canonical_text.encode()).hexdigest()


def get_undp_jobs_side_rows(db_url: str) -> List[Dict]:
    """Get UNDP jobs from jobs_side table."""
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Get UNDP source ID
            cur.execute("""
                SELECT id FROM sources 
                WHERE org_name ILIKE '%undp%' AND status = 'active'
                LIMIT 1
            """)
            source_row = cur.fetchone()
            if not source_row:
                return []
            
            source_id = str(source_row['id'])
            
            # Get jobs from jobs_side
            cur.execute("""
                SELECT 
                    id, source_id, org_name, title, apply_url, location_raw,
                    created_at
                FROM jobs_side
                WHERE source_id = %s
                ORDER BY created_at DESC
            """, (source_id,))
            
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def replay_jobs(db_url: str, jobs_side_rows: List[Dict]) -> Dict:
    """Replay jobs from jobs_side to jobs table."""
    conn = psycopg2.connect(db_url)
    
    inserted_count = 0
    duplicate_skipped_count = 0
    failed_count = 0
    failed_errors = []
    inserted_jobs = []
    
    try:
        for row in jobs_side_rows:
            try:
                title = normalize_title(row.get('title', ''))
                apply_url = row.get('apply_url', '').strip() if row.get('apply_url') else None
                location_raw = row.get('location_raw', '').strip() if row.get('location_raw') else None
                source_id = str(row.get('source_id', ''))
                org_name = row.get('org_name', 'UNDP')
                
                # Clean mailto links - reject them (no contact_email column)
                if apply_url and is_mailto_link(apply_url):
                    # Skip jobs with only mailto links (they're contact info, not jobs)
                    failed_count += 1
                    failed_errors.append(f"Job '{title[:50]}' has mailto apply_url - skipping (contact info only)")
                    continue
                
                # Check if title is problematic
                needs_review = False
                if not title or len(title) < 3 or title.upper() == 'GLOBAL':
                    needs_review = True
                
                # If no apply_url, skip
                if not apply_url:
                    failed_count += 1
                    failed_errors.append(f"Job '{title[:50]}' has no apply_url")
                    continue
                
                # Compute canonical hash
                canonical_hash = get_canonical_hash(title, apply_url)
                
                # Check for duplicates
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id FROM jobs 
                        WHERE canonical_hash = %s AND deleted_at IS NULL
                        LIMIT 1
                    """, (canonical_hash,))
                    
                    if cur.fetchone():
                        duplicate_skipped_count += 1
                        continue
                    
                    # Insert new job
                    insert_fields = [
                        'source_id', 'org_name', 'title', 'canonical_hash',
                        'status', 'needs_review', 'fetched_at', 'last_seen_at'
                    ]
                    insert_values = [
                        source_id, org_name, title[:500], canonical_hash,
                        'pending', needs_review, 'NOW()', 'NOW()'
                    ]
                    
                    placeholders = []
                    sql_values = []
                    for i, val in enumerate(insert_values):
                        if val == 'NOW()':
                            placeholders.append('NOW()')
                        else:
                            placeholders.append('%s')
                            sql_values.append(val)
                    
                    # Add optional fields
                    if apply_url:
                        insert_fields.append('apply_url')
                        insert_values.append(apply_url[:500])
                        placeholders.append('%s')
                        sql_values.append(apply_url[:500])
                    
                    if location_raw:
                        insert_fields.append('location_raw')
                        insert_values.append(location_raw[:200])
                        placeholders.append('%s')
                        sql_values.append(location_raw[:200])
                    
                    # Execute insert
                    cur.execute(f"""
                        INSERT INTO jobs ({', '.join(insert_fields)})
                        VALUES ({', '.join(placeholders)})
                        RETURNING id, title
                    """, sql_values)
                    
                    result = cur.fetchone()
                    inserted_count += 1
                    inserted_jobs.append({
                        'id': str(result[0]),
                        'title': result[1][:100]
                    })
                    
                    conn.commit()
            
            except Exception as e:
                conn.rollback()
                failed_count += 1
                error_msg = str(e)[:200]
                failed_errors.append(f"Error inserting '{title[:50]}': {error_msg}")
                if len(failed_errors) > 10:
                    break  # Limit error collection
    
    finally:
        conn.close()
    
    return {
        'total_rows_processed': len(jobs_side_rows),
        'inserted_count': inserted_count,
        'duplicate_skipped_count': duplicate_skipped_count,
        'failed_count': failed_count,
        'failed_errors': failed_errors[:10],
        'inserted_jobs': inserted_jobs[:20]
    }


def main():
    """Main replay function."""
    db_url = get_db_url()
    if not db_url:
        print("ERROR: Database URL not configured")
        sys.exit(1)
    
    print("="*80)
    print("UNDP JOBS REPLAY")
    print("="*80)
    
    # Get jobs from jobs_side
    print("\nFetching UNDP jobs from jobs_side table...")
    jobs_side_rows = get_undp_jobs_side_rows(db_url)
    print(f"✓ Found {len(jobs_side_rows)} jobs in jobs_side")
    
    if not jobs_side_rows:
        print("No jobs found in jobs_side. Exiting.")
        sys.exit(0)
    
    # Replay jobs
    print("\nReplaying jobs to jobs table...")
    result = replay_jobs(db_url, jobs_side_rows)
    
    # Generate report
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    report_file = REPORT_DIR / f"replay_undp_{timestamp}.json"
    
    report_data = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'result': result
    }
    
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(report_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✓ Report saved: {report_file}")
    print(f"\nSummary:")
    print(f"  Total rows processed: {result['total_rows_processed']}")
    print(f"  Inserted: {result['inserted_count']}")
    print(f"  Duplicate skipped: {result['duplicate_skipped_count']}")
    print(f"  Failed: {result['failed_count']}")
    
    if result['inserted_jobs']:
        print(f"\nFirst {min(10, len(result['inserted_jobs']))} inserted jobs:")
        for i, job in enumerate(result['inserted_jobs'][:10], 1):
            print(f"  {i}. [{job['id']}] {job['title']}")


if __name__ == "__main__":
    main()

