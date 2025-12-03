"""
Diagnostic script to check why crawl is not working.
Checks logs, source status, and tests extraction.
"""

import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env if available
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        pass

import psycopg2
from psycopg2.extras import RealDictCursor

def get_db_url():
    """Get database URL"""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("SUPABASE_DB_URL or DATABASE_URL not set")
    return db_url

def diagnose():
    """Run diagnostics"""
    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            print("=" * 80)
            print("CRAWL DIAGNOSTICS")
            print("=" * 80)
            print()
            
            # 1. Check sources
            print("1. SOURCES STATUS")
            print("-" * 80)
            cur.execute("""
                SELECT 
                    id, org_name, careers_url, source_type, status,
                    last_crawl_status, last_crawl_message,
                    consecutive_failures, consecutive_nochange,
                    last_crawled_at, next_run_at
                FROM sources
                WHERE status != 'deleted'
                ORDER BY created_at DESC
                LIMIT 10
            """)
            
            sources = cur.fetchall()
            if not sources:
                print("❌ No active sources found!")
                return
            
            for source in sources:
                print(f"\nSource: {source['org_name']}")
                print(f"  ID: {source['id']}")
                print(f"  URL: {source['careers_url']}")
                print(f"  Type: {source['source_type']}")
                print(f"  Status: {source['status']}")
                print(f"  Last Crawl: {source['last_crawl_status'] or 'Never'}")
                if source['last_crawl_message']:
                    print(f"  Message: {source['last_crawl_message']}")
                if source['consecutive_failures']:
                    print(f"  ⚠️  Consecutive Failures: {source['consecutive_failures']}")
            
            # 2. Check recent crawl logs
            print("\n" + "=" * 80)
            print("2. RECENT CRAWL LOGS")
            print("-" * 80)
            cur.execute("""
                SELECT 
                    cl.id, cl.status, cl.message, cl.duration_ms,
                    cl.ran_at, s.org_name
                FROM crawl_logs cl
                JOIN sources s ON cl.source_id = s.id
                ORDER BY cl.ran_at DESC
                LIMIT 10
            """)
            
            logs = cur.fetchall()
            if not logs:
                print("No crawl logs found")
            else:
                for log in logs:
                    print(f"\n[{log['ran_at']}] {log['org_name']}")
                    print(f"  Status: {log['status']}")
                    print(f"  Message: {log['message'] or 'N/A'}")
                    if log.get('duration_ms'):
                        print(f"  Duration: {log['duration_ms']}ms")
            
            # 3. Check jobs
            print("\n" + "=" * 80)
            print("3. JOBS IN DATABASE")
            print("-" * 80)
            cur.execute("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE deleted_at IS NULL) as active,
                    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted
                FROM jobs
            """)
            job_stats = cur.fetchone()
            print(f"Total Jobs: {job_stats['total']}")
            print(f"Active: {job_stats['active']}")
            print(f"Deleted: {job_stats['deleted']}")
            
            # 4. Check for UNESCO source specifically
            print("\n" + "=" * 80)
            print("4. UNESCO SOURCE DETAILS")
            print("-" * 80)
            cur.execute("""
                SELECT 
                    id, org_name, careers_url, source_type, status,
                    last_crawl_status, last_crawl_message,
                    consecutive_failures, parser_hint
                FROM sources
                WHERE org_name ILIKE '%unesco%' OR careers_url ILIKE '%unesco%'
                ORDER BY created_at DESC
                LIMIT 1
            """)
            
            unesco = cur.fetchone()
            if unesco:
                print(f"Found UNESCO source:")
                print(f"  ID: {unesco['id']}")
                print(f"  URL: {unesco['careers_url']}")
                print(f"  Status: {unesco['status']}")
                print(f"  Last Crawl: {unesco['last_crawl_status'] or 'Never'}")
                print(f"  Message: {unesco['last_crawl_message'] or 'N/A'}")
                print(f"  Failures: {unesco['consecutive_failures'] or 0}")
                
                # Check jobs for this source
                cur.execute("""
                    SELECT COUNT(*) as count
                    FROM jobs
                    WHERE source_id = %s AND deleted_at IS NULL
                """, (unesco['id'],))
                job_count = cur.fetchone()
                print(f"  Active Jobs: {job_count['count']}")
            else:
                print("❌ No UNESCO source found")
            
            # 5. Check for errors in logs
            print("\n" + "=" * 80)
            print("5. ERROR PATTERNS IN LOGS")
            print("-" * 80)
            cur.execute("""
                SELECT 
                    status, message, COUNT(*) as count
                FROM crawl_logs
                WHERE status IN ('failed', 'warn', 'error')
                GROUP BY status, message
                ORDER BY count DESC
                LIMIT 10
            """)
            
            errors = cur.fetchall()
            if errors:
                for error in errors:
                    print(f"{error['status']}: {error['message']} (x{error['count']})")
            else:
                print("No errors found in logs")
            
            print("\n" + "=" * 80)
            print("DIAGNOSTICS COMPLETE")
            print("=" * 80)
            
    finally:
        conn.close()

if __name__ == '__main__':
    try:
        diagnose()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

