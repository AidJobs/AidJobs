#!/usr/bin/env python3
"""
Apply Phase 2 observability migration to database.
Idempotent - safe to run multiple times.
"""
import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


def main():
    # Check for SUPABASE_DB_URL
    supabase_db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    if not supabase_db_url:
        print("Error: SUPABASE_DB_URL or DATABASE_URL environment variable is not set")
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
    
    # Locate migration file
    project_root = Path(__file__).parent.parent.parent.parent
    migration_file = project_root / "infra" / "migrations" / "phase2_observability.sql"
    
    if not migration_file.exists():
        print(f"Error: Migration file not found: {migration_file}")
        sys.exit(1)
    
    print("Phase 2 Observability Migration")
    print("=" * 60)
    print(f"Migration file: {migration_file}")
    print()
    
    # Connect to database
    try:
        conn = psycopg2.connect(supabase_db_url)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        print("✓ Connected to database")
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)
    
    try:
        # Read migration file
        print("Reading migration file...")
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
        
        # Check existing tables
        print("Checking existing tables...")
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('raw_pages', 'extraction_logs', 'failed_inserts')
            ORDER BY table_name
        """)
        existing_tables = [row[0] for row in cursor.fetchall()]
        
        if existing_tables:
            print(f"  Found {len(existing_tables)} existing table(s): {', '.join(existing_tables)}")
        else:
            print("  No existing tables found")
        
        print()
        print("Applying migration...")
        
        # Execute migration
        cursor.execute(migration_sql)
        
        # Check tables after migration
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('raw_pages', 'extraction_logs', 'failed_inserts')
            ORDER BY table_name
        """)
        after_tables = [row[0] for row in cursor.fetchall()]
        
        new_tables = set(after_tables) - set(existing_tables)
        
        if new_tables:
            print(f"✓ Created {len(new_tables)} new table(s): {', '.join(sorted(new_tables))}")
        else:
            print("✓ All tables already exist (idempotent)")
        
        # Check indexes
        cursor.execute("""
            SELECT indexname 
            FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND tablename IN ('raw_pages', 'extraction_logs', 'failed_inserts')
            ORDER BY tablename, indexname
        """)
        indexes = [row[0] for row in cursor.fetchall()]
        print(f"✓ Created/verified {len(indexes)} index(es)")
        
        print()
        print("Migration completed successfully!")
        print()
        print("Next steps:")
        print("  1. Configure HTML_STORAGE_TYPE environment variable")
        print("  2. Run a crawl to test the new logging")
        print("  3. Check observability endpoints: /api/admin/observability/*")
        
    except Exception as e:
        print(f"Error applying migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()

