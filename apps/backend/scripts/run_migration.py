#!/usr/bin/env python3
"""
Run database migration to add missing columns to sources table.
Idempotent - safe to run multiple times.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    from app.db_config import db_config
except ImportError as e:
    print(f"Error: Required dependencies not available: {e}")
    print("Make sure you're in the backend directory and dependencies are installed")
    sys.exit(1)


def main():
    print("AidJobs Sources Table Migration")
    print("=" * 60)
    
    # Get connection params using db_config
    conn_params = db_config.get_connection_params()
    
    if not conn_params:
        print("Error: Database not configured")
        print("Please set SUPABASE_DB_URL environment variable")
        sys.exit(1)
    
    print(f"Connecting to: {conn_params['host']}:{conn_params['port']}")
    
    # Connect to database
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=10)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        print("✓ Connected to database\n")
    except psycopg2.OperationalError as e:
        print(f"✗ Connection failed: {e}")
        sys.exit(1)
    
    try:
        # Check current columns
        print("Checking current columns...")
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'sources'
            ORDER BY column_name
        """)
        existing_columns = {row[0] for row in cursor.fetchall()}
        print(f"  Found {len(existing_columns)} existing column(s)")
        
        # Migration SQL
        migration_sql = """
        -- Add org_type column (used in admin sources - INSERT/UPDATE/SELECT)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS org_type TEXT;
        
        -- Add notes column (used in find_earn.py when creating sources from submissions)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS notes TEXT;
        """
        
        print("\nRunning migration...")
        cursor.execute(migration_sql)
        
        # Verify columns were added
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'sources'
            ORDER BY column_name
        """)
        new_columns = {row[0] for row in cursor.fetchall()}
        
        added_columns = new_columns - existing_columns
        
        if 'org_type' in new_columns and 'notes' in new_columns:
            if added_columns:
                print(f"✓ Added {len(added_columns)} column(s): {', '.join(sorted(added_columns))}")
            else:
                print("✓ All required columns already exist (idempotent)")
        else:
            missing = []
            if 'org_type' not in new_columns:
                missing.append('org_type')
            if 'notes' not in new_columns:
                missing.append('notes')
            print(f"⚠ Warning: Columns still missing: {', '.join(missing)}")
        
        # Show final column list
        print("\nFinal columns in sources table:")
        print("-" * 60)
        for col in sorted(new_columns):
            marker = "✓" if col in ['org_type', 'notes'] else " "
            print(f"  {marker} {col}")
        
        print("\n" + "=" * 60)
        print("✓ Migration completed successfully")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()

