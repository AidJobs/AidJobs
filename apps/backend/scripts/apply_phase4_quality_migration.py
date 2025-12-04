"""
Apply Phase 4 Quality Scoring database migration.
"""

import os
import sys
import psycopg2
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def apply_migration():
    """Apply Phase 4 Quality Scoring migration"""
    # Get database URL from environment
    db_url = os.getenv('SUPABASE_DB_URL') or os.getenv('DATABASE_URL')
    
    if not db_url:
        print("ERROR: SUPABASE_DB_URL or DATABASE_URL environment variable is not set")
        sys.exit(1)
    
    # Read migration SQL
    migration_file = Path(__file__).parent.parent.parent.parent / 'infra' / 'migrations' / 'phase4_quality_scoring.sql'
    
    if not migration_file.exists():
        print(f"ERROR: Migration file not found: {migration_file}")
        sys.exit(1)
    
    with open(migration_file, 'r') as f:
        migration_sql = f.read()
    
    # Connect to database
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        print("Applying Phase 4 Quality Scoring migration...")
        cur.execute(migration_sql)
        conn.commit()
        
        print("✅ Phase 4 Quality Scoring migration applied successfully!")
        
        # Verify columns were added
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'jobs' 
            AND column_name IN ('quality_score', 'quality_grade', 'quality_factors', 'quality_issues', 'needs_review', 'quality_scored_at')
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

