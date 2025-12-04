"""
Apply Phase 4 database migration (Location Geocoding).
"""

import os
import sys
import psycopg2
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def apply_migration():
    """Apply Phase 4 migration"""
    # Get database URL from environment
    db_url = os.getenv('SUPABASE_DB_URL') or os.getenv('DATABASE_URL')
    
    if not db_url:
        print("ERROR: SUPABASE_DB_URL or DATABASE_URL environment variable is not set")
        sys.exit(1)
    
    # Read migration SQL
    migration_file = Path(__file__).parent.parent.parent.parent / 'infra' / 'migrations' / 'phase4_geocoding.sql'
    
    if not migration_file.exists():
        print(f"ERROR: Migration file not found: {migration_file}")
        sys.exit(1)
    
    with open(migration_file, 'r') as f:
        migration_sql = f.read()
    
    # Connect to database
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        print("Applying Phase 4 migration (Location Geocoding)...")
        cur.execute(migration_sql)
        conn.commit()
        
        print("✅ Phase 4 migration applied successfully!")
        
        # Verify columns were added
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'jobs' 
            AND column_name IN ('latitude', 'longitude', 'geocoded_at', 'geocoding_source', 'is_remote')
            ORDER BY column_name
        """)
        
        columns = [row[0] for row in cur.fetchall()]
        print(f"✅ Verified columns: {', '.join(columns)}")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"ERROR: Migration failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    apply_migration()

