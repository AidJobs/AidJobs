#!/usr/bin/env python3
"""
Diagnostic script to compare actual job counts in database vs crawl_logs statistics.
Helps identify why crawl drawer shows incorrect statistics.
"""
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2.extras import RealDictCursor

REPORT_DIR = Path(__file__).parent.parent / "report"
REPORT_DIR.mkdir(parents=True, exist_ok=True)


def get_db_url():
    """Get database URL from environment."""
    return os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")


def diagnose_statistics(db_url: str):
    """Compare actual job counts vs crawl_logs statistics."""
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. Get actual job counts from jobs table
            cur.execute("""
                SELECT 
                    COUNT(*) as total_jobs,
                    COUNT(*) FILTER (WHERE deleted_at IS NULL) as active_jobs,
                    COUNT(*) FILTER (WHERE status = 'active') as status_active_jobs,
                    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted_jobs
                FROM jobs
            """)
            job_counts = cur.fetchone()
            
            # 2. Get aggregated statistics from crawl_logs
            cur.execute("""
                SELECT 
                    COUNT(*) as total_crawls,
                    SUM(found) as total_found,
                    SUM(inserted) as total_inserted,
                    SUM(updated) as total_updated,
                    SUM(skipped) as total_skipped,
                    MAX(ran_at) as last_crawl_time
                FROM crawl_logs
            """)
            log_stats = cur.fetchone()
            
            # 3. Get per-source breakdown
            cur.execute("""
                SELECT 
                    s.id,
                    s.org_name,
                    s.careers_url,
                    COUNT(DISTINCT j.id) FILTER (WHERE j.deleted_at IS NULL) as actual_job_count,
                    COUNT(cl.id) as crawl_count,
                    SUM(cl.found) as log_found,
                    SUM(cl.inserted) as log_inserted,
                    SUM(cl.updated) as log_updated,
                    MAX(cl.ran_at) as last_crawl
                FROM sources s
                LEFT JOIN jobs j ON s.id = j.source_id
                LEFT JOIN crawl_logs cl ON s.id = cl.source_id
                WHERE s.status = 'active'
                GROUP BY s.id, s.org_name, s.careers_url
                ORDER BY actual_job_count DESC
                LIMIT 20
            """)
            source_breakdown = cur.fetchall()
            
            # 4. Get recent crawl logs
            cur.execute("""
                SELECT 
                    cl.id,
                    cl.source_id,
                    s.org_name,
                    cl.found,
                    cl.inserted,
                    cl.updated,
                    cl.skipped,
                    cl.status,
                    cl.message,
                    cl.ran_at
                FROM crawl_logs cl
                JOIN sources s ON cl.source_id = s.id
                ORDER BY cl.ran_at DESC
                LIMIT 20
            """)
            recent_logs = cur.fetchall()
            
            return {
                'job_counts': dict(job_counts),
                'log_stats': dict(log_stats),
                'source_breakdown': [dict(row) for row in source_breakdown],
                'recent_logs': [dict(row) for row in recent_logs],
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
    finally:
        conn.close()


def main():
    """Main diagnostic function."""
    db_url = get_db_url()
    if not db_url:
        print("ERROR: Database URL not configured")
        sys.exit(1)
    
    print("="*80)
    print("CRAWL STATISTICS DIAGNOSTIC")
    print("="*80)
    
    data = diagnose_statistics(db_url)
    
    # Print summary
    print(f"\n📊 ACTUAL JOB COUNTS (from jobs table):")
    print(f"  Total jobs: {data['job_counts']['total_jobs']}")
    print(f"  Active jobs (not deleted): {data['job_counts']['active_jobs']}")
    print(f"  Status='active' jobs: {data['job_counts']['status_active_jobs']}")
    print(f"  Deleted jobs: {data['job_counts']['deleted_jobs']}")
    
    print(f"\n📋 CRAWL LOGS AGGREGATE:")
    print(f"  Total crawls: {data['log_stats']['total_crawls']}")
    print(f"  Total found: {data['log_stats']['total_found']}")
    print(f"  Total inserted: {data['log_stats']['total_inserted']}")
    print(f"  Total updated: {data['log_stats']['total_updated']}")
    print(f"  Total skipped: {data['log_stats']['total_skipped']}")
    print(f"  Last crawl: {data['log_stats']['last_crawl_time']}")
    
    # Calculate discrepancy
    actual_count = data['job_counts']['active_jobs']
    log_inserted = data['log_stats']['total_inserted'] or 0
    log_updated = data['log_stats']['total_updated'] or 0
    
    print(f"\n🔍 DISCREPANCY ANALYSIS:")
    print(f"  Actual jobs in DB: {actual_count}")
    print(f"  Logs say inserted: {log_inserted}")
    print(f"  Logs say updated: {log_updated}")
    print(f"  Difference: {actual_count - log_inserted}")
    
    if actual_count != log_inserted:
        print(f"\n  ⚠️  MISMATCH DETECTED!")
        print(f"     The actual job count ({actual_count}) doesn't match")
        print(f"     the sum of inserted jobs from logs ({log_inserted}).")
        print(f"     This could be due to:")
        print(f"     - Jobs inserted outside of crawl_logs")
        print(f"     - Jobs deleted after insertion")
        print(f"     - Missing crawl_logs entries")
        print(f"     - Manual database changes")
    
    print(f"\n📈 TOP SOURCES (by actual job count):")
    for i, source in enumerate(data['source_breakdown'][:10], 1):
        actual = source['actual_job_count'] or 0
        log_inserted = source['log_inserted'] or 0
        mismatch = "⚠️" if actual != log_inserted else "✓"
        print(f"  {i}. {mismatch} {source['org_name']}: {actual} actual, {log_inserted} from logs")
    
    # Save report
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    report_file = REPORT_DIR / f"crawl_statistics_diagnostic_{timestamp}.json"
    
    import json
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)
    
    print(f"\n✓ Report saved: {report_file}")


if __name__ == "__main__":
    main()

