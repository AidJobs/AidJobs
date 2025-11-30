#!/usr/bin/env python3
"""
Apply the job deletion audit migration step by step.
This script applies the migration with detailed progress reporting.
"""
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

# Load environment variables from .env file if it exists
try:
    from dotenv import load_dotenv
    # Load from project root
    project_root = Path(__file__).parent.parent.parent.parent
    env_file = project_root / ".env"
    if env_file.exists():
        load_dotenv(env_file)
    else:
        # Try loading from current directory
        load_dotenv()
except ImportError:
    pass  # dotenv not available, rely on system env vars

import psycopg2  # type: ignore
from psycopg2.extras import RealDictCursor  # type: ignore

def get_db_connection(db_url: str = None):
    """Get database connection from environment or provided URL"""
    # If URL provided as argument, use it
    if db_url:
        cleaned_url = db_url.replace('[', '').replace(']', '')
        parsed = urlparse(cleaned_url)
        print(f"📡 Connecting to: {parsed.hostname}:{parsed.port or 5432}")
        try:
            conn = psycopg2.connect(cleaned_url, connect_timeout=10)
            return conn
        except Exception as e:
            print(f"❌ Failed to connect: {e}")
            sys.exit(1)
    
    # Try to use db_config module first (loads .env automatically)
    try:
        # Add parent directory to path to import db_config
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from app.db_config import db_config
        
        conn_params = db_config.get_connection_params()
        if conn_params:
            print(f"📡 Connecting to: {conn_params.get('host')}:{conn_params.get('port', 5432)}")
            try:
                conn = psycopg2.connect(**conn_params, connect_timeout=10)
                return conn
            except Exception as e:
                print(f"❌ Failed to connect using db_config: {e}")
                # Fall through to direct env var method
    except Exception as e:
        print(f"⚠️  Could not use db_config module: {e}")
        print("   Trying direct environment variable access...")
    
    # Fallback: direct environment variable access
    supabase_db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    if not supabase_db_url:
        print("❌ Error: SUPABASE_DB_URL or DATABASE_URL environment variable is not set")
        print()
        print("Current environment variables:")
        print(f"  SUPABASE_DB_URL: {'SET' if os.getenv('SUPABASE_DB_URL') else 'NOT SET'}")
        print(f"  DATABASE_URL: {'SET' if os.getenv('DATABASE_URL') else 'NOT SET'}")
        print()
        print("To get your connection string:")
        print("  1. Go to Supabase Dashboard → Settings → Database")
        print("  2. Under 'Connection string', select 'Connection pooling'")
        print("  3. Choose 'Transaction' mode")
        print("  4. Copy the connection string")
        print()
        print("Or for Render:")
        print("  1. Go to your Render PostgreSQL database")
        print("  2. Copy the Internal Database URL")
        print()
        sys.exit(1)
    
    # Clean up the URL by removing any square brackets around hostname
    cleaned_url = supabase_db_url.replace('[', '').replace(']', '')
    parsed = urlparse(cleaned_url)
    
    print(f"📡 Connecting to: {parsed.hostname}:{parsed.port or 5432}")
    
    try:
        conn = psycopg2.connect(cleaned_url, connect_timeout=10)
        return conn
    except Exception as e:
        print(f"❌ Failed to connect: {e}")
        sys.exit(1)

def check_table_exists(cursor, table_name):
    """Check if a table exists"""
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = %s
        ) as exists
    """, (table_name,))
    result = cursor.fetchone()
    # Handle both dict (RealDictCursor) and tuple results
    if isinstance(result, dict):
        return result.get('exists', False)
    return result[0] if result else False

def check_column_exists(cursor, table_name, column_name):
    """Check if a column exists in a table"""
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = %s 
            AND column_name = %s
        ) as exists
    """, (table_name, column_name))
    result = cursor.fetchone()
    # Handle both dict (RealDictCursor) and tuple results
    if isinstance(result, dict):
        return result.get('exists', False)
    return result[0] if result else False

def check_function_exists(cursor, function_name):
    """Check if a function exists"""
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM pg_proc 
            WHERE proname = %s
        ) as exists
    """, (function_name,))
    result = cursor.fetchone()
    # Handle both dict (RealDictCursor) and tuple results
    if isinstance(result, dict):
        return result.get('exists', False)
    return result[0] if result else False

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Run job deletion audit migration")
    parser.add_argument(
        "--db-url",
        type=str,
        help="PostgreSQL connection string (SUPABASE_DB_URL or DATABASE_URL format)"
    )
    args = parser.parse_args()
    
    print("=" * 70)
    print("Enterprise Job Deletion System - Migration")
    print("=" * 70)
    print()
    
    # Step 1: Connect to database
    print("Step 1: Connecting to database...")
    conn = get_db_connection(args.db_url)
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    print("✅ Connected successfully")
    print()
    
    # Step 2: Create audit table
    print("Step 2: Creating job_deletion_audit table...")
    if check_table_exists(cursor, 'job_deletion_audit'):
        print("⚠️  Table 'job_deletion_audit' already exists - skipping")
    else:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS job_deletion_audit (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
                deleted_by TEXT NOT NULL,
                deletion_type TEXT NOT NULL CHECK (deletion_type IN ('hard', 'soft', 'batch')),
                jobs_count INT NOT NULL,
                deletion_reason TEXT,
                metadata JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        print("✅ Created job_deletion_audit table")
    print()
    
    # Step 3: Create indexes
    print("Step 3: Creating indexes...")
    indexes = [
        ("idx_job_deletion_audit_source_id", "CREATE INDEX IF NOT EXISTS idx_job_deletion_audit_source_id ON job_deletion_audit(source_id, created_at DESC)"),
        ("idx_job_deletion_audit_deleted_by", "CREATE INDEX IF NOT EXISTS idx_job_deletion_audit_deleted_by ON job_deletion_audit(deleted_by)"),
        ("idx_job_deletion_audit_created_at", "CREATE INDEX IF NOT EXISTS idx_job_deletion_audit_created_at ON job_deletion_audit(created_at DESC)"),
    ]
    
    for idx_name, sql in indexes:
        cursor.execute(sql)
        print(f"✅ Created index: {idx_name}")
    print()
    
    # Step 4: Add soft delete columns to jobs table
    print("Step 4: Adding soft delete columns to jobs table...")
    columns = [
        ("deleted_at", "TIMESTAMPTZ"),
        ("deleted_by", "TEXT"),
        ("deletion_reason", "TEXT"),
    ]
    
    for col_name, col_type in columns:
        if check_column_exists(cursor, 'jobs', col_name):
            print(f"⚠️  Column 'jobs.{col_name}' already exists - skipping")
        else:
            cursor.execute(f"ALTER TABLE jobs ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
            print(f"✅ Added column: jobs.{col_name}")
    print()
    
    # Step 5: Create index for soft-deleted jobs
    print("Step 5: Creating index for soft-deleted jobs...")
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at 
        ON jobs(deleted_at) 
        WHERE deleted_at IS NOT NULL
    """)
    print("✅ Created index: idx_jobs_deleted_at")
    print()
    
    # Step 6: Create impact analysis function
    print("Step 6: Creating get_deletion_impact function...")
    if check_function_exists(cursor, 'get_deletion_impact'):
        print("⚠️  Function 'get_deletion_impact' already exists - replacing")
    
    cursor.execute("""
        CREATE OR REPLACE FUNCTION get_deletion_impact(source_uuid UUID)
        RETURNS TABLE (
            total_jobs INT,
            active_jobs INT,
            shortlists_count INT,
            enrichment_reviews_count INT,
            enrichment_history_count INT,
            enrichment_feedback_count INT,
            ground_truth_count INT
        ) AS $$
        BEGIN
            RETURN QUERY
            SELECT 
                COUNT(*)::INT as total_jobs,
                COUNT(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL)::INT as active_jobs,
                (SELECT COUNT(*)::INT FROM shortlists s 
                 INNER JOIN jobs j ON s.job_id = j.id 
                 WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as shortlists_count,
                (SELECT COUNT(*)::INT FROM enrichment_reviews er
                 INNER JOIN jobs j ON er.job_id = j.id
                 WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as enrichment_reviews_count,
                (SELECT COUNT(*)::INT FROM enrichment_history eh
                 INNER JOIN jobs j ON eh.job_id = j.id
                 WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as enrichment_history_count,
                (SELECT COUNT(*)::INT FROM enrichment_feedback ef
                 INNER JOIN jobs j ON ef.job_id = j.id
                 WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as enrichment_feedback_count,
                (SELECT COUNT(*)::INT FROM enrichment_ground_truth egt
                 INNER JOIN jobs j ON egt.job_id = j.id
                 WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as ground_truth_count
            FROM jobs
            WHERE source_id = source_uuid AND deleted_at IS NULL;
        END;
        $$ LANGUAGE plpgsql;
    """)
    print("✅ Created function: get_deletion_impact")
    print()
    
    # Commit all changes
    print("Step 7: Committing changes...")
    conn.commit()
    print("✅ All changes committed")
    print()
    
    # Step 8: Verification
    print("Step 8: Verifying migration...")
    verification_passed = True
    
    # Check audit table
    if check_table_exists(cursor, 'job_deletion_audit'):
        print("✅ job_deletion_audit table exists")
    else:
        print("❌ job_deletion_audit table missing")
        verification_passed = False
    
    # Check columns
    for col_name, _ in columns:
        if check_column_exists(cursor, 'jobs', col_name):
            print(f"✅ jobs.{col_name} column exists")
        else:
            print(f"❌ jobs.{col_name} column missing")
            verification_passed = False
    
    # Check function
    if check_function_exists(cursor, 'get_deletion_impact'):
        print("✅ get_deletion_impact function exists")
    else:
        print("❌ get_deletion_impact function missing")
        verification_passed = False
    
    # Test the function with a sample query
    try:
        cursor.execute("SELECT COUNT(*) as count FROM sources LIMIT 1")
        result = cursor.fetchone()
        source_count = result.get('count', 0) if isinstance(result, dict) else (result[0] if result else 0)
        if source_count > 0:
            cursor.execute("SELECT id FROM sources LIMIT 1")
            test_result = cursor.fetchone()
            test_source_id = test_result.get('id') if isinstance(test_result, dict) else (test_result[0] if test_result else None)
            if test_source_id:
                cursor.execute("SELECT * FROM get_deletion_impact(%s)", (test_source_id,))
                impact_result = cursor.fetchone()
                if impact_result:
                    print("✅ get_deletion_impact function works correctly")
                else:
                    print("⚠️  get_deletion_impact function returned no result (may be normal if no jobs)")
        else:
            print("⚠️  No sources found to test function")
    except Exception as e:
        print(f"⚠️  Could not test function: {e}")
    
    print()
    
    if verification_passed:
        print("=" * 70)
        print("✅ Migration completed successfully!")
        print("=" * 70)
        print()
        print("Next steps:")
        print("  1. Go to Admin → Sources")
        print("  2. Click the red trash icon (Delete Jobs) next to a source")
        print("  3. Review impact analysis and run dry-run first")
        print("  4. Proceed with deletion when ready")
    else:
        print("=" * 70)
        print("⚠️  Migration completed with warnings")
        print("=" * 70)
        print("Please review the verification results above")
    
    cursor.close()
    conn.close()

if __name__ == "__main__":
    main()

