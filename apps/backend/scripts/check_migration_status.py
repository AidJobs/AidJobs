#!/usr/bin/env python3
"""
Check if enrichment tables have been migrated to Supabase.
"""
import os
import sys
from urllib.parse import urlparse

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


def check_tables_exist(cursor):
    """Check if enrichment tables exist."""
    enrichment_tables = [
        'enrichment_reviews',
        'enrichment_history',
        'enrichment_feedback',
        'enrichment_ground_truth'
    ]
    
    cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ANY(%s)
        ORDER BY table_name
    """, (enrichment_tables,))
    
    existing = [row[0] for row in cursor.fetchall()]
    missing = set(enrichment_tables) - set(existing)
    
    return existing, missing


def main():
    # Check for SUPABASE_DB_URL
    supabase_db_url = os.getenv("SUPABASE_DB_URL")
    
    if not supabase_db_url:
        print("Error: SUPABASE_DB_URL environment variable is not set")
        print()
        print("To get your connection string:")
        print("  1. Go to Supabase Dashboard → Settings → Database")
        print("  2. Under 'Connection string', select 'Connection pooling'")
        print("  3. Choose 'Transaction' mode")
        print("  4. Copy the connection string")
        print()
        print("Then set it as an environment variable:")
        print("  export SUPABASE_DB_URL='postgresql://...'")
        sys.exit(1)
    
    # Parse and clean URL
    cleaned_url = supabase_db_url.replace('[', '').replace(']', '')
    parsed = urlparse(cleaned_url)
    
    print("Checking Migration Status")
    print("=" * 60)
    print(f"Connecting to: {parsed.hostname}:{parsed.port}")
    print()
    
    # Connect to database
    try:
        conn = psycopg2.connect(cleaned_url, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
    except Exception as e:
        print(f"✗ Error connecting to database: {e}")
        sys.exit(1)
    
    try:
        # Check if tables exist
        existing, missing = check_tables_exist(cursor)
        
        print("Enrichment Tables Status:")
        print("-" * 60)
        
        for table in ['enrichment_reviews', 'enrichment_history', 
                     'enrichment_feedback', 'enrichment_ground_truth']:
            if table in existing:
                # Get row count
                cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
                count = cursor.fetchone()['count']
                print(f"  ✓ {table:30} EXISTS ({count} rows)")
            else:
                print(f"  ✗ {table:30} MISSING")
        
        print()
        
        if missing:
            print("⚠ Migration Required!")
            print()
            print("To apply the migration, run:")
            print("  python apps/backend/scripts/apply_sql.py")
            print()
            print("Or manually apply the SQL from infra/supabase.sql")
            print("(The script is idempotent - safe to run multiple times)")
            sys.exit(1)
        else:
            print("✓ All enrichment tables exist - migration complete!")
            sys.exit(0)
            
    except Exception as e:
        print(f"✗ Error checking tables: {e}")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()

