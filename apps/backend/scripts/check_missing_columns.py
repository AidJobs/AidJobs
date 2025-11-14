#!/usr/bin/env python3
"""
Check for missing columns in database tables.
Compares schema definition with actual database columns.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from app.db_config import db_config
except ImportError as e:
    print(f"Error: Required dependencies not available: {e}")
    sys.exit(1)


def get_schema_columns():
    """Get expected columns from schema definition"""
    sources_schema = {
        'id', 'org_name', 'careers_url', 'source_type', 'org_type', 'status',
        'crawl_frequency_days', 'next_run_at', 'last_crawled_at', 'last_crawl_status',
        'last_crawl_message', 'consecutive_failures', 'consecutive_nochange',
        'parser_hint', 'time_window', 'notes', 'created_at', 'updated_at'
    }
    
    jobs_schema = {
        'id', 'source_id', 'org_name', 'title', 'location_raw', 'country', 'country_iso',
        'city', 'level_norm', 'mission_tags', 'international_eligible', 'deadline',
        'apply_url', 'description_snippet', 'canonical_hash', 'fetched_at', 'last_seen_at',
        'status', 'created_at', 'updated_at', 'search_tsv',
        # Taxonomy columns
        'org_type', 'career_type', 'contract_type', 'work_modality', 'country_name',
        'region_code', 'functional_tags', 'benefits', 'policy_flags', 'donor_context',
        'project_modality', 'procurement_vehicle', 'crisis_type', 'response_phase',
        'humanitarian_cluster', 'surge_required', 'deployment_timeframe',
        'duty_station_hardship', 'work_hours', 'contract_duration_months',
        'contract_urgency', 'application_window', 'compensation_visible',
        'compensation_type', 'compensation_min_usd', 'compensation_max_usd',
        'compensation_currency', 'compensation_confidence', 'data_provenance',
        'freshness_days', 'duplicate_of', 'raw_metadata'
    }
    
    crawl_logs_schema = {
        'id', 'source_id', 'ran_at', 'duration_ms', 'found', 'inserted', 'updated',
        'skipped', 'status', 'message'
    }
    
    return {
        'sources': sources_schema,
        'jobs': jobs_schema,
        'crawl_logs': crawl_logs_schema
    }


def get_db_columns(cursor, table_name):
    """Get actual columns from database"""
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = %s
        ORDER BY column_name
    """, (table_name,))
    rows = cursor.fetchall()
    return {row['column_name'] for row in rows}


def main():
    print("AidJobs Missing Columns Checker")
    print("=" * 60)
    
    conn_params = db_config.get_connection_params()
    if not conn_params:
        print("Error: Database not configured")
        print("Please set SUPABASE_DB_URL environment variable")
        sys.exit(1)
    
    print(f"Connecting to: {conn_params['host']}:{conn_params['port']}")
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=10)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        print("[OK] Connected to database\n")
    except psycopg2.OperationalError as e:
        print(f"[ERROR] Connection failed: {e}")
        sys.exit(1)
    
    try:
        schema_columns = get_schema_columns()
        all_missing = {}
        all_extra = {}
        
        for table_name in ['sources', 'jobs', 'crawl_logs']:
            print(f"\nChecking {table_name} table...")
            print("-" * 60)
            
            db_columns = get_db_columns(cursor, table_name)
            expected_columns = schema_columns[table_name]
            
            missing = expected_columns - db_columns
            extra = db_columns - expected_columns
            
            if missing:
                all_missing[table_name] = missing
                print(f"[MISSING] {len(missing)} column(s) missing:")
                for col in sorted(missing):
                    print(f"  - {col}")
            else:
                print(f"[OK] All expected columns exist")
            
            if extra:
                all_extra[table_name] = extra
                print(f"[EXTRA] {len(extra)} column(s) in DB but not in schema:")
                for col in sorted(extra):
                    print(f"  + {col}")
        
        # Summary
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        
        total_missing = sum(len(cols) for cols in all_missing.values())
        if total_missing > 0:
            print(f"\n[MISSING] Total missing columns: {total_missing}")
            for table, cols in all_missing.items():
                print(f"  {table}: {len(cols)} column(s)")
        else:
            print("\n[OK] No missing columns found!")
        
        total_extra = sum(len(cols) for cols in all_extra.values())
        if total_extra > 0:
            print(f"\n[EXTRA] Total extra columns: {total_extra}")
            for table, cols in all_extra.items():
                print(f"  {table}: {len(cols)} column(s)")
        
        # Suggest potential future columns
        print("\n" + "=" * 60)
        print("POTENTIAL FUTURE COLUMNS (Not in schema, but could be useful)")
        print("=" * 60)
        
        potential_sources = {
            'priority': 'INT DEFAULT 0',  # For prioritizing sources
            'last_success_at': 'TIMESTAMPTZ',  # Last successful crawl
            'total_crawls': 'INT DEFAULT 0',  # Total crawl count
            'total_jobs_found': 'INT DEFAULT 0',  # Total jobs found across all crawls
            'avg_crawl_duration_ms': 'INT',  # Average crawl duration
            'last_error': 'TEXT',  # Last error message (separate from last_crawl_message)
            'retry_count': 'INT DEFAULT 0',  # Number of retries
            'enabled_at': 'TIMESTAMPTZ',  # When source was enabled
            'disabled_at': 'TIMESTAMPTZ',  # When source was disabled
            'tags': 'TEXT[]',  # Tags for categorizing sources
            'metadata': 'JSONB',  # Flexible metadata storage
        }
        
        potential_jobs = {
            'priority_score': 'NUMERIC',  # For ranking/relevance
            'view_count': 'INT DEFAULT 0',  # Track job views
            'apply_count': 'INT DEFAULT 0',  # Track job applications
            'bookmark_count': 'INT DEFAULT 0',  # Track bookmarks
            'expired_at': 'TIMESTAMPTZ',  # When job expired
            'featured': 'BOOLEAN DEFAULT FALSE',  # Featured jobs
            'verified': 'BOOLEAN DEFAULT FALSE',  # Verified jobs
            'salary_range_text': 'TEXT',  # Human-readable salary range
            'remote_eligible': 'BOOLEAN',  # Remote work eligibility
            'visa_sponsorship': 'BOOLEAN',  # Visa sponsorship available
            'language_requirements': 'TEXT[]',  # Required languages
            'education_level': 'TEXT',  # Education requirements
            'experience_years': 'INT',  # Years of experience required
            'source_priority': 'INT',  # Priority from source
            'quality_score': 'NUMERIC',  # Data quality score
            'normalized_at': 'TIMESTAMPTZ',  # When job was normalized
        }
        
        potential_crawl_logs = {
            'error_type': 'TEXT',  # Type of error (network, parse, etc.)
            'http_status': 'INT',  # HTTP status code
            'content_size_bytes': 'INT',  # Size of fetched content
            'retry_attempt': 'INT DEFAULT 0',  # Retry attempt number
            'crawler_version': 'TEXT',  # Crawler version used
        }
        
        print("\nSources table potential columns:")
        for col, col_type in potential_sources.items():
            print(f"  - {col} ({col_type})")
        
        print("\nJobs table potential columns:")
        for col, col_type in potential_jobs.items():
            print(f"  - {col} ({col_type})")
        
        print("\nCrawl_logs table potential columns:")
        for col, col_type in potential_crawl_logs.items():
            print(f"  - {col} ({col_type})")
        
        print("\n" + "=" * 60)
        print("[OK] Column check completed")
        
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

