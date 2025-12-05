#!/usr/bin/env python3
"""
Fast migration script with immediate feedback and timeouts.
Apply migration to add country, country_iso, and city columns to jobs table.
"""

import os
import sys
from pathlib import Path
import signal

# Set timeout handler
def timeout_handler(signum, frame):
    print("\n❌ ERROR: Script timed out after 30 seconds")
    print("This usually means the database connection failed.")
    print("\n💡 RECOMMENDATION: Use Option 1 - Run SQL directly in Supabase Dashboard")
    sys.exit(1)

signal.signal(signal.SIGALRM, timeout_handler)

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("❌ ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# Get database URL from command line argument, environment, or prompt
if len(sys.argv) > 1:
    DATABASE_URL = sys.argv[1]
    print("✅ Using database URL from command line argument")
elif os.getenv('SUPABASE_DB_URL'):
    DATABASE_URL = os.getenv('SUPABASE_DB_URL')
    print("✅ Using database URL from SUPABASE_DB_URL environment variable")
elif os.getenv('DATABASE_URL'):
    DATABASE_URL = os.getenv('DATABASE_URL')
    print("✅ Using database URL from DATABASE_URL environment variable")
else:
    print("❌ ERROR: Database URL not provided")
    print("Usage: python apply_country_city_migration_fast.py <database_url>")
    print("   OR: Set SUPABASE_DB_URL or DATABASE_URL environment variable")
    sys.exit(1)

# Get migration file path
script_dir = Path(__file__).parent
migration_file = script_dir.parent.parent.parent / 'infra' / 'migrations' / 'add_country_city_columns.sql'

if not migration_file.exists():
    print(f"❌ ERROR: Migration file not found: {migration_file}")
    sys.exit(1)

print(f"📄 Reading migration from: {migration_file}")
try:
    with open(migration_file, 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    print("✅ Migration file read successfully")
except Exception as e:
    print(f"❌ ERROR: Failed to read migration file: {e}")
    sys.exit(1)

print("\n🔌 Connecting to database (10 second timeout)...")
print(f"   Database: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'hidden'}")

conn = None
try:
    # Set connection timeout to 10 seconds
    conn = psycopg2.connect(
        DATABASE_URL, 
        connect_timeout=10
    )
    print("✅ Database connection successful!")
    
    cur = conn.cursor()
    
    print("\n📝 Applying migration...")
    cur.execute(migration_sql)
    conn.commit()
    print("✅ Migration applied successfully!")
    
    # Verify columns exist
    print("\n🔍 Verifying columns...")
    cur.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'jobs' 
        AND column_name IN ('country', 'country_iso', 'city')
        ORDER BY column_name;
    """)
    columns = [row[0] for row in cur.fetchall()]
    
    if len(columns) == 3:
        print(f"✅ Verified: All 3 columns exist: {', '.join(columns)}")
    else:
        print(f"⚠️  Warning: Only found {len(columns)} columns: {', '.join(columns) if columns else 'none'}")
    
    cur.close()
    conn.close()
    print("\n🎉 Migration complete!")
    
except psycopg2.OperationalError as e:
    print(f"\n❌ ERROR: Database connection failed")
    print(f"   Error: {str(e)[:200]}")
    print("\n💡 TROUBLESHOOTING:")
    print("   1. Check if the database URL is correct")
    print("   2. Check if your IP is allowed in Supabase (Settings → Database → Connection Pooling)")
    print("   3. Try running the SQL directly in Supabase Dashboard (recommended)")
    if conn:
        conn.close()
    sys.exit(1)
except psycopg2.Error as e:
    print(f"\n❌ ERROR: Database error: {e}")
    if conn:
        conn.rollback()
        conn.close()
    sys.exit(1)
except Exception as e:
    print(f"\n❌ ERROR: Unexpected error: {e}")
    import traceback
    traceback.print_exc()
    if conn:
        conn.rollback()
        conn.close()
    sys.exit(1)

