"""
Check if all required migrations have been applied.
"""
import os
import sys
import psycopg2
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def check_migrations():
    """Check if all required migrations have been applied"""
    # Get database URL from environment
    db_url = os.getenv('SUPABASE_DB_URL') or os.getenv('DATABASE_URL')
    
    if not db_url:
        print("ERROR: SUPABASE_DB_URL or DATABASE_URL environment variable is not set")
        sys.exit(1)
    
    # Connect to database
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        print("Checking required migrations...\n")
        
        # Check Phase 2: Observability tables
        print("Phase 2: Observability Tables")
        print("-" * 50)
        tables = ['raw_pages', 'extraction_logs', 'failed_inserts']
        for table in tables:
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = %s
                )
            """, (table,))
            exists = cur.fetchone()[0]
            status = "✅" if exists else "❌ MISSING"
            print(f"  {status} {table}")
        
        # Check Phase 4: Geocoding columns
        print("\nPhase 4: Geocoding Columns")
        print("-" * 50)
        geocoding_columns = ['latitude', 'longitude', 'geocoded_at', 'geocoding_source', 'is_remote']
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'jobs' 
            AND column_name = ANY(%s)
            ORDER BY column_name
        """, (geocoding_columns,))
        existing = [row[0] for row in cur.fetchall()]
        for col in geocoding_columns:
            status = "✅" if col in existing else "❌ MISSING"
            print(f"  {status} {col}")
        
        # Check Phase 4: Quality Scoring columns
        print("\nPhase 4: Quality Scoring Columns")
        print("-" * 50)
        quality_columns = ['quality_score', 'quality_grade', 'quality_factors', 'quality_issues', 'needs_review', 'quality_scored_at']
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'jobs' 
            AND column_name = ANY(%s)
            ORDER BY column_name
        """, (quality_columns,))
        existing = [row[0] for row in cur.fetchall()]
        for col in quality_columns:
            status = "✅" if col in existing else "❌ MISSING"
            print(f"  {status} {col}")
        
        # Check country/city columns (used in code but might be in base schema)
        print("\nCountry/City Columns (used in code)")
        print("-" * 50)
        location_columns = ['country', 'country_iso', 'city']
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'jobs' 
            AND column_name = ANY(%s)
            ORDER BY column_name
        """, (location_columns,))
        existing = [row[0] for row in cur.fetchall()]
        for col in location_columns:
            status = "✅" if col in existing else "⚠️  MISSING (may cause INSERT errors)"
            print(f"  {status} {col}")
        
        # Check operation index
        print("\nIndexes")
        print("-" * 50)
        cur.execute("""
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'failed_inserts' 
            AND indexname = 'idx_failed_inserts_operation'
        """)
        index_exists = cur.fetchone() is not None
        status = "✅" if index_exists else "⚠️  MISSING (optional but recommended)"
        print(f"  {status} idx_failed_inserts_operation")
        
        cur.close()
        conn.close()
        
        print("\n" + "=" * 50)
        print("Migration check complete!")
        print("\nIf any columns are missing, run the appropriate migration:")
        print("  - Phase 2: python scripts/apply_phase2_migration.py")
        print("  - Phase 4: python scripts/apply_phase4_migration.py")
        print("  - Operation index: Run add_operation_index.sql manually")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    check_migrations()



