#!/usr/bin/env python3
"""
Quick migration script to add missing columns to sources table.
Uses SUPABASE_DB_URL from environment or can accept it as argument.
"""
import os
import sys
from urllib.parse import urlparse, unquote

try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


def run_migration(db_url: str = None):
    """Run migration to add org_type and notes columns"""
    if not db_url:
        db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    if not db_url:
        print("Error: SUPABASE_DB_URL not found in environment")
        print("Please provide it as argument or set SUPABASE_DB_URL environment variable")
        return False
    
    # Parse URL
    cleaned_url = db_url.replace('[', '').replace(']', '')
    parsed = urlparse(cleaned_url)
    
    print("AidJobs Sources Table Migration")
    print("=" * 60)
    print(f"Connecting to: {parsed.hostname}:{parsed.port}")
    
    try:
        conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            database=parsed.path.lstrip('/') or 'postgres',
            user=parsed.username or 'postgres',
            password=unquote(parsed.password) if parsed.password else None,
            connect_timeout=10
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        print("✓ Connected\n")
        
        # Check existing columns
        cursor.execute("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'sources' ORDER BY column_name
        """)
        existing = {row[0] for row in cursor.fetchall()}
        print(f"Current columns: {len(existing)}")
        
        # Run migration
        print("\nAdding missing columns...")
        cursor.execute("ALTER TABLE sources ADD COLUMN IF NOT EXISTS org_type TEXT;")
        cursor.execute("ALTER TABLE sources ADD COLUMN IF NOT EXISTS notes TEXT;")
        
        # Verify
        cursor.execute("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'sources' ORDER BY column_name
        """)
        new_columns = {row[0] for row in cursor.fetchall()}
        
        if 'org_type' in new_columns and 'notes' in new_columns:
            added = new_columns - existing
            if added:
                print(f"✓ Successfully added: {', '.join(sorted(added))}")
            else:
                print("✓ Columns already exist")
            print("\n✓ Migration completed successfully!")
            return True
        else:
            print("✗ Migration failed - columns not found")
            return False
            
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


if __name__ == "__main__":
    # Allow passing DB URL as argument
    db_url = sys.argv[1] if len(sys.argv) > 1 else None
    success = run_migration(db_url)
    sys.exit(0 if success else 1)

