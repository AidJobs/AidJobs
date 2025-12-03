"""
Quick script to check UNESCO/UNDP sources in database.
No dependencies required - just psycopg2.
"""

import os
import sys

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

def get_db_url():
    """Get database URL from environment"""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: SUPABASE_DB_URL or DATABASE_URL not set")
        sys.exit(1)
    return db_url

def check_sources():
    """Check UNESCO/UNDP sources"""
    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT 
                    id,
                    org_name,
                    careers_url,
                    source_type,
                    status,
                    last_crawl_status,
                    last_crawl_message,
                    last_crawled_at,
                    consecutive_failures
                FROM sources
                WHERE (org_name ILIKE '%unesco%' OR org_name ILIKE '%undp%')
                AND status = 'active'
                ORDER BY org_name
            """)
            
            sources = cur.fetchall()
            
            if not sources:
                print("No active UNESCO/UNDP sources found in database.")
                return
            
            print("=" * 80)
            print("UNESCO/UNDP Sources Found")
            print("=" * 80)
            print()
            
            for source in sources:
                print(f"Organization: {source['org_name']}")
                print(f"  Source ID: {source['id']}")
                print(f"  URL: {source['careers_url']}")
                print(f"  Type: {source['source_type']}")
                print(f"  Status: {source['status']}")
                print(f"  Last Crawl: {source['last_crawl_status'] or 'Never'}")
                if source['last_crawl_message']:
                    print(f"  Message: {source['last_crawl_message'][:100]}")
                if source['consecutive_failures']:
                    print(f"  Consecutive Failures: {source['consecutive_failures']}")
                print()
            
            print("=" * 80)
            print("To test extraction:")
            print("  1. Use admin UI: Go to Sources page and click 'Run Crawl'")
            print("  2. Use API: POST /api/admin/crawl/run with {'source_id': '<id>'}")
            print("  3. Check diagnostics: GET /api/admin/crawl/diagnostics/unesco or /undp")
            print("=" * 80)
            
    finally:
        conn.close()

if __name__ == '__main__':
    check_sources()

