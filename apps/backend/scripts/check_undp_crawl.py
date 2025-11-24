#!/usr/bin/env python3
"""
Diagnostic script to check UNDP crawl status and verify extraction
"""
import os
import sys
import json
from urllib.parse import urlparse

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("ERROR: psycopg2 not installed. Install with: pip install psycopg2-binary")
    sys.exit(1)

def get_db_connection():
    """Get database connection from environment variables"""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL or DATABASE_URL not set")
        sys.exit(1)
    
    # Parse connection string
    parsed = urlparse(db_url)
    conn_params = {
        'host': parsed.hostname,
        'port': parsed.port or 5432,
        'database': parsed.path.lstrip('/'),
        'user': parsed.username,
        'password': parsed.password
    }
    
    try:
        conn = psycopg2.connect(**conn_params)
        return conn
    except Exception as e:
        print(f"ERROR: Failed to connect to database: {e}")
        sys.exit(1)

def check_undp_source(conn):
    """Find and display UNDP source configuration"""
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Find UNDP source
    cursor.execute("""
        SELECT id, org_name, careers_url, source_type, status, parser_hint,
               last_crawled_at, last_crawl_status, last_crawl_message,
               consecutive_failures, consecutive_nochange
        FROM sources
        WHERE org_name ILIKE '%UNDP%' OR careers_url ILIKE '%undp%'
        ORDER BY created_at DESC
        LIMIT 5
    """)
    
    sources = cursor.fetchall()
    
    if not sources:
        print("❌ No UNDP source found in database")
        return None
    
    print(f"\n{'='*60}")
    print("UNDP SOURCE CONFIGURATION")
    print(f"{'='*60}\n")
    
    for source in sources:
        print(f"Source ID: {source['id']}")
        print(f"Org Name: {source['org_name']}")
        print(f"Careers URL: {source['careers_url']}")
        print(f"Source Type: {source['source_type']}")
        print(f"Status: {source['status']}")
        print(f"Parser Hint: {source['parser_hint'] or 'None'}")
        print(f"Last Crawled: {source['last_crawled_at'] or 'Never'}")
        print(f"Last Status: {source['last_crawl_status'] or 'Unknown'}")
        if source['last_crawl_message']:
            print(f"Last Message: {source['last_crawl_message'][:200]}")
        print(f"Consecutive Failures: {source['consecutive_failures']}")
        print(f"Consecutive No Change: {source['consecutive_nochange']}")
        print(f"{'-'*60}\n")
    
    return sources[0] if sources else None

def check_undp_jobs(conn, source_id=None):
    """Check UNDP jobs in database and verify unique apply_urls"""
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    if source_id:
        query = """
            SELECT id, title, apply_url, fetched_at, last_seen_at
            FROM jobs
            WHERE source_id = %s
            ORDER BY fetched_at DESC
            LIMIT 50
        """
        cursor.execute(query, (source_id,))
    else:
        query = """
            SELECT j.id, j.title, j.apply_url, j.fetched_at, j.last_seen_at, s.org_name
            FROM jobs j
            JOIN sources s ON j.source_id = s.id
            WHERE s.org_name ILIKE '%UNDP%' OR s.careers_url ILIKE '%undp%'
            ORDER BY j.fetched_at DESC
            LIMIT 50
        """
        cursor.execute(query)
    
    jobs = cursor.fetchall()
    
    print(f"\n{'='*60}")
    print(f"UNDP JOBS IN DATABASE ({len(jobs)} found)")
    print(f"{'='*60}\n")
    
    if not jobs:
        print("❌ No UNDP jobs found in database")
        return
    
    # Check for duplicate apply_urls
    url_counts = {}
    url_to_titles = {}
    
    for job in jobs:
        url = job['apply_url'] or 'NO_URL'
        normalized_url = url.rstrip('/').split('#')[0].split('?')[0]
        
        url_counts[normalized_url] = url_counts.get(normalized_url, 0) + 1
        if normalized_url not in url_to_titles:
            url_to_titles[normalized_url] = []
        url_to_titles[normalized_url].append(job['title'])
    
    # Find duplicates
    duplicates = {url: count for url, count in url_counts.items() if count > 1}
    
    if duplicates:
        print(f"⚠️  WARNING: Found {len(duplicates)} duplicate apply_urls!\n")
        for url, count in list(duplicates.items())[:5]:
            print(f"  URL used {count} times: {url[:80]}")
            print(f"    Jobs: {', '.join(url_to_titles[url][:3])}")
            if len(url_to_titles[url]) > 3:
                print(f"    ... and {len(url_to_titles[url]) - 3} more")
            print()
    else:
        print(f"✅ All {len(jobs)} jobs have unique apply_urls\n")
    
    # Show sample jobs
    print("Sample jobs (first 10):")
    for i, job in enumerate(jobs[:10], 1):
        url = job['apply_url'] or 'NO_URL'
        print(f"  {i}. {job['title'][:60]}")
        print(f"     URL: {url[:80]}")
        print(f"     Fetched: {job['fetched_at']}")
        print()

def check_recent_crawl_logs(conn, source_id):
    """Check recent crawl logs for UNDP"""
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute("""
        SELECT id, status, message, duration_ms, stats, created_at
        FROM crawl_logs
        WHERE source_id = %s
        ORDER BY created_at DESC
        LIMIT 5
    """, (source_id,))
    
    logs = cursor.fetchall()
    
    print(f"\n{'='*60}")
    print("RECENT CRAWL LOGS")
    print(f"{'='*60}\n")
    
    if not logs:
        print("No crawl logs found")
        return
    
    for log in logs:
        status_icon = "✅" if log['status'] == 'success' else "❌" if log['status'] == 'failed' else "⚠️"
        print(f"{status_icon} {log['created_at']} - {log['status']}")
        if log['message']:
            print(f"   Message: {log['message'][:200]}")
        if log['stats']:
            stats = log['stats'] if isinstance(log['stats'], dict) else json.loads(log['stats']) if log['stats'] else {}
            print(f"   Stats: {stats}")
        print()

def main():
    print("\n" + "="*60)
    print("UNDP CRAWL DIAGNOSTIC")
    print("="*60)
    
    conn = get_db_connection()
    
    try:
        # Check source configuration
        source = check_undp_source(conn)
        
        if source:
            source_id = source['id']
            
            # Check recent crawl logs
            check_recent_crawl_logs(conn, source_id)
            
            # Check jobs
            check_undp_jobs(conn, source_id)
            
            print(f"\n{'='*60}")
            print("SUMMARY")
            print(f"{'='*60}\n")
            print(f"Source ID: {source_id}")
            print(f"Status: {source['status']}")
            print(f"Last Crawl: {source['last_crawled_at'] or 'Never'}")
            print(f"Last Status: {source['last_crawl_status'] or 'Unknown'}")
            print(f"\nTo trigger a new crawl, use:")
            print(f"  POST /api/admin/crawl/run")
            print(f"  Body: {{\"source_id\": \"{source_id}\"}}")
        else:
            print("\n❌ UNDP source not found. Cannot proceed with diagnostics.")
    
    finally:
        conn.close()

if __name__ == "__main__":
    main()

