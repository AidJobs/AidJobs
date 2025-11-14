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
    import psycopg2  # pyright: ignore[reportMissingModuleSource]
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT  # pyright: ignore[reportMissingModuleSource]
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
        print("[OK] Connected to database\n")
    except psycopg2.OperationalError as e:
        print(f"[ERROR] Connection failed: {e}")
        sys.exit(1)
    
    try:
        # Check current columns in sources table
        print("Checking current columns in sources table...")
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'sources'
            ORDER BY column_name
        """)
        existing_sources_columns = {row[0] for row in cursor.fetchall()}
        print(f"  Found {len(existing_sources_columns)} existing column(s) in sources")
        
        # Check current columns in jobs table
        print("Checking current columns in jobs table...")
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'jobs'
            ORDER BY column_name
        """)
        existing_jobs_columns = {row[0] for row in cursor.fetchall()}
        print(f"  Found {len(existing_jobs_columns)} existing column(s) in jobs")
        
        # Check if robots_cache table exists
        print("Checking robots_cache table...")
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'robots_cache'
            )
        """)
        robots_cache_exists = cursor.fetchone()[0]
        print(f"  robots_cache table exists: {robots_cache_exists}")
        
        # Check if domain_policies table exists
        print("Checking domain_policies table...")
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'domain_policies'
            )
        """)
        domain_policies_exists = cursor.fetchone()[0]
        print(f"  domain_policies table exists: {domain_policies_exists}")
        
        # Migration SQL
        migration_sql = """
        -- Add org_type column (used in admin sources - INSERT/UPDATE/SELECT)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS org_type TEXT;
        
        -- Add notes column (used in find_earn.py when creating sources from submissions)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS notes TEXT;
        
        -- Add time_window column (used for RSS feed time window configuration)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS time_window TEXT;
        
        -- Add next_run_at column (used for scheduling crawls)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
        
        -- Add last_crawl_message column (used for storing crawl error messages)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS last_crawl_message TEXT;
        
        -- Add consecutive_failures column (used for tracking failed crawls)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS consecutive_failures INT DEFAULT 0;
        
        -- Add consecutive_nochange column (used for tracking unchanged crawls)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS consecutive_nochange INT DEFAULT 0;
        
        -- Add taxonomy columns to jobs table (required for search functionality)
        ALTER TABLE jobs
            ADD COLUMN IF NOT EXISTS org_type TEXT,
            ADD COLUMN IF NOT EXISTS career_type TEXT,
            ADD COLUMN IF NOT EXISTS contract_type TEXT,
            ADD COLUMN IF NOT EXISTS work_modality TEXT,
            ADD COLUMN IF NOT EXISTS country_name TEXT,
            ADD COLUMN IF NOT EXISTS region_code TEXT,
            ADD COLUMN IF NOT EXISTS level_norm TEXT,
            ADD COLUMN IF NOT EXISTS mission_tags TEXT[],
            ADD COLUMN IF NOT EXISTS crisis_type TEXT[],
            ADD COLUMN IF NOT EXISTS response_phase TEXT,
            ADD COLUMN IF NOT EXISTS humanitarian_cluster TEXT[],
            ADD COLUMN IF NOT EXISTS benefits TEXT[],
            ADD COLUMN IF NOT EXISTS policy_flags TEXT[],
            ADD COLUMN IF NOT EXISTS donor_context TEXT[],
            ADD COLUMN IF NOT EXISTS international_eligible BOOLEAN;
        
        -- Create robots_cache table if it doesn't exist (required for HTML crawler)
        CREATE TABLE IF NOT EXISTS robots_cache (
            host TEXT PRIMARY KEY,
            robots_txt TEXT,
            fetched_at TIMESTAMPTZ,
            crawl_delay_ms INT,
            disallow JSONB
        );
        
        -- Create domain_policies table if it doesn't exist (required for domain rate limiting)
        CREATE TABLE IF NOT EXISTS domain_policies (
            host TEXT PRIMARY KEY,
            max_concurrency INT DEFAULT 1,
            min_request_interval_ms INT DEFAULT 3000,
            max_pages INT DEFAULT 10,
            max_kb_per_page INT DEFAULT 1024,
            allow_js BOOLEAN DEFAULT FALSE,
            last_seen_status TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Create crawl_logs table if it doesn't exist (required for crawl history tracking)
        CREATE TABLE IF NOT EXISTS crawl_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
            ran_at TIMESTAMPTZ DEFAULT NOW(),
            duration_ms INT,
            found INT DEFAULT 0,
            inserted INT DEFAULT 0,
            updated INT DEFAULT 0,
            skipped INT DEFAULT 0,
            status TEXT NOT NULL,
            message TEXT
        );
        
        -- Add duration_ms column to crawl_logs if missing (idempotent)
        ALTER TABLE crawl_logs ADD COLUMN IF NOT EXISTS duration_ms INT;
        
        -- Create index for crawl_logs table if it doesn't exist
        CREATE INDEX IF NOT EXISTS idx_crawl_logs_source_id ON crawl_logs(source_id, ran_at DESC);
        
        -- Add potential future columns to sources table (for analytics and management)
        ALTER TABLE sources 
            ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS total_crawls INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_jobs_found INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS avg_crawl_duration_ms INT,
            ADD COLUMN IF NOT EXISTS last_error TEXT,
            ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS enabled_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS tags TEXT[],
            ADD COLUMN IF NOT EXISTS metadata JSONB;
        
        -- Add potential future columns to jobs table (for analytics and features)
        ALTER TABLE jobs
            ADD COLUMN IF NOT EXISTS priority_score NUMERIC,
            ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS apply_count INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS bookmark_count INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS salary_range_text TEXT,
            ADD COLUMN IF NOT EXISTS remote_eligible BOOLEAN,
            ADD COLUMN IF NOT EXISTS visa_sponsorship BOOLEAN,
            ADD COLUMN IF NOT EXISTS language_requirements TEXT[],
            ADD COLUMN IF NOT EXISTS education_level TEXT,
            ADD COLUMN IF NOT EXISTS experience_years INT,
            ADD COLUMN IF NOT EXISTS source_priority INT,
            ADD COLUMN IF NOT EXISTS quality_score NUMERIC,
            ADD COLUMN IF NOT EXISTS normalized_at TIMESTAMPTZ;
        
        -- Add potential future columns to crawl_logs table (for better debugging)
        ALTER TABLE crawl_logs
            ADD COLUMN IF NOT EXISTS error_type TEXT,
            ADD COLUMN IF NOT EXISTS http_status INT,
            ADD COLUMN IF NOT EXISTS content_size_bytes INT,
            ADD COLUMN IF NOT EXISTS retry_attempt INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS crawler_version TEXT;
        """
        
        print("\nRunning migration...")
        cursor.execute(migration_sql)
        
        # Verify columns were added to sources table
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'sources'
            ORDER BY column_name
        """)
        new_sources_columns = {row[0] for row in cursor.fetchall()}
        
        added_sources_columns = new_sources_columns - existing_sources_columns
        
        required_sources_columns = {
            'org_type', 'notes', 'time_window', 'next_run_at',
            'last_crawl_message', 'consecutive_failures', 'consecutive_nochange'
        }
        if required_sources_columns.issubset(new_sources_columns):
            if added_sources_columns:
                print(f"[OK] Added {len(added_sources_columns)} column(s) to sources: {', '.join(sorted(added_sources_columns))}")
            else:
                print("[OK] All required columns already exist in sources (idempotent)")
        else:
            missing = required_sources_columns - new_sources_columns
            print(f"[WARN] Warning: Columns still missing in sources: {', '.join(sorted(missing))}")
        
        # Verify columns were added to jobs table
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'jobs'
            ORDER BY column_name
        """)
        new_jobs_columns = {row[0] for row in cursor.fetchall()}
        
        added_jobs_columns = new_jobs_columns - existing_jobs_columns
        
        required_jobs_columns = {
            'org_type', 'career_type', 'contract_type', 'work_modality',
            'country_name', 'region_code', 'level_norm', 'mission_tags',
            'crisis_type', 'response_phase', 'humanitarian_cluster',
            'benefits', 'policy_flags', 'donor_context', 'international_eligible'
        }
        if required_jobs_columns.issubset(new_jobs_columns):
            if added_jobs_columns:
                print(f"[OK] Added {len(added_jobs_columns)} column(s) to jobs: {', '.join(sorted(added_jobs_columns))}")
            else:
                print("[OK] All required columns already exist in jobs (idempotent)")
        else:
            missing = required_jobs_columns - new_jobs_columns
            print(f"[WARN] Warning: Columns still missing in jobs: {', '.join(sorted(missing))}")
        
        # Show final column lists
        print("\nFinal columns in sources table:")
        print("-" * 60)
        for col in sorted(new_sources_columns):
            marker = "[OK]" if col in required_sources_columns else "   "
            print(f"  {marker} {col}")
        
        print("\nFinal columns in jobs table (showing taxonomy columns):")
        print("-" * 60)
        for col in sorted(new_jobs_columns):
            marker = "[OK]" if col in required_jobs_columns else "   "
            print(f"  {marker} {col}")
        
        # Verify robots_cache table was created
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'robots_cache'
            )
        """)
        robots_cache_exists_after = cursor.fetchone()[0]
        if robots_cache_exists_after:
            if not robots_cache_exists:
                print("\n[OK] Created robots_cache table")
            else:
                print("\n[OK] robots_cache table already exists")
        else:
            print("\n[WARN] robots_cache table was not created")
        
        # Verify domain_policies table was created
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'domain_policies'
            )
        """)
        domain_policies_exists_after = cursor.fetchone()[0]
        if domain_policies_exists_after:
            if not domain_policies_exists:
                print("[OK] Created domain_policies table")
            else:
                print("[OK] domain_policies table already exists")
        else:
            print("[WARN] domain_policies table was not created")
        
        # Verify crawl_logs table was created
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'crawl_logs'
            )
        """)
        crawl_logs_exists_after = cursor.fetchone()[0]
        if crawl_logs_exists_after:
            print("[OK] crawl_logs table exists")
            
            # Verify duration_ms column exists in crawl_logs
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'crawl_logs' AND column_name = 'duration_ms'
                )
            """)
            duration_ms_exists = cursor.fetchone()[0]
            if duration_ms_exists:
                print("[OK] duration_ms column exists in crawl_logs")
            else:
                print("[WARN] duration_ms column missing in crawl_logs")
        else:
            print("[WARN] crawl_logs table was not created")
        
        # Count newly added future columns
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'sources' 
            AND column_name IN ('priority', 'last_success_at', 'total_crawls', 'total_jobs_found', 
                                'avg_crawl_duration_ms', 'last_error', 'retry_count', 'enabled_at', 
                                'disabled_at', 'tags', 'metadata')
        """)
        new_sources_future_cols = [row['column_name'] for row in cursor.fetchall()]
        if new_sources_future_cols:
            print(f"\n[OK] Added {len(new_sources_future_cols)} future column(s) to sources: {', '.join(sorted(new_sources_future_cols))}")
        
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'jobs' 
            AND column_name IN ('priority_score', 'view_count', 'apply_count', 'bookmark_count', 
                                'expired_at', 'featured', 'verified', 'salary_range_text', 
                                'remote_eligible', 'visa_sponsorship', 'language_requirements', 
                                'education_level', 'experience_years', 'source_priority', 
                                'quality_score', 'normalized_at')
        """)
        new_jobs_future_cols = [row['column_name'] for row in cursor.fetchall()]
        if new_jobs_future_cols:
            print(f"[OK] Added {len(new_jobs_future_cols)} future column(s) to jobs: {', '.join(sorted(new_jobs_future_cols))}")
        
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'crawl_logs' 
            AND column_name IN ('error_type', 'http_status', 'content_size_bytes', 
                                'retry_attempt', 'crawler_version')
        """)
        new_logs_future_cols = [row['column_name'] for row in cursor.fetchall()]
        if new_logs_future_cols:
            print(f"[OK] Added {len(new_logs_future_cols)} future column(s) to crawl_logs: {', '.join(sorted(new_logs_future_cols))}")
        
        print("\n" + "=" * 60)
        print("[OK] Migration completed successfully")
        
    except Exception as e:
        print(f"\n[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()

