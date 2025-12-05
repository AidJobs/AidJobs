#!/usr/bin/env python3
"""
Apply migration to add country, country_iso, and city columns to jobs table.
"""

import os
import sys
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor

# Get database URL from command line argument, environment, or prompt
if len(sys.argv) > 1:
    DATABASE_URL = sys.argv[1]
elif os.getenv('SUPABASE_DB_URL'):
    DATABASE_URL = os.getenv('SUPABASE_DB_URL')
elif os.getenv('DATABASE_URL'):
    DATABASE_URL = os.getenv('DATABASE_URL')
else:
    print("ERROR: Database URL not provided")
    print("Usage: python apply_country_city_migration.py <database_url>")
    print("   OR: Set SUPABASE_DB_URL or DATABASE_URL environment variable")
    sys.exit(1)

# Get migration file path
script_dir = Path(__file__).parent
migration_file = script_dir.parent.parent.parent / 'infra' / 'migrations' / 'add_country_city_columns.sql'

if not migration_file.exists():
    print(f"ERROR: Migration file not found: {migration_file}")
    sys.exit(1)

print(f"📄 Reading migration from: {migration_file}")
sys.stdout.flush()
with open(migration_file, 'r', encoding='utf-8') as f:
    migration_sql = f.read()
print("✅ Migration file loaded")
sys.stdout.flush()

print("🔌 Connecting to database (10 second timeout)...")
db_host = DATABASE_URL.split('@')[1].split('/')[0] if '@' in DATABASE_URL else 'hidden'
print(f"   Host: {db_host}")
sys.stdout.flush()  # Force output immediately

conn = None
try:
    # Set short timeout to fail fast
    conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
    print("✅ Connected!")
    sys.stdout.flush()
    cur = conn.cursor()
    
    print("\n📝 Applying migration...")
    sys.stdout.flush()
    cur.execute(migration_sql)
    conn.commit()
    
    print("✅ Migration applied successfully!")
    sys.stdout.flush()
    
    # Verify columns exist
    cur.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'jobs' 
        AND column_name IN ('country', 'country_iso', 'city')
        ORDER BY column_name;
    """)
    columns = [row[0] for row in cur.fetchall()]
    
    if len(columns) == 3:
        print(f"✅ Verified: All columns exist: {', '.join(columns)}")
    else:
        print(f"⚠️  Warning: Only found {len(columns)} columns: {', '.join(columns)}")
    
    cur.close()
    conn.close()
    
except psycopg2.OperationalError as e:
    print(f"\n❌ ERROR: Database connection failed")
    print(f"   Error: {str(e)[:200]}")
    print("\n💡 TROUBLESHOOTING:")
    print("   1. Check if the database URL is correct")
    print("   2. Check Supabase IP allowlist (Settings → Database)")
    print("   3. Try running SQL directly in Supabase Dashboard (FASTEST)")
    print("\n📋 SQL to run in Supabase:")
    print("   ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country TEXT, country_iso TEXT, city TEXT;")
    sys.exit(1)
except Exception as e:
    print(f"ERROR: Migration failed: {e}")
    import traceback
    traceback.print_exc()
    if conn:
        conn.rollback()
    sys.exit(1)



