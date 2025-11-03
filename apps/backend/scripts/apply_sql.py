#!/usr/bin/env python3
"""
Apply SQL schema and seed data to Supabase database.
Idempotent - safe to run multiple times.
"""
import os
import sys
import argparse
from pathlib import Path
from urllib.parse import urlparse

try:
    import psycopg2
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


def get_connection_params(supabase_url: str, service_key: str) -> dict:
    """Extract connection parameters from Supabase URL."""
    parsed = urlparse(supabase_url)
    
    if not parsed.hostname:
        raise ValueError(f"Invalid SUPABASE_URL: {supabase_url}")
    
    # Use password from URL if present, otherwise fall back to service key
    password = parsed.password if parsed.password else service_key
    
    return {
        "host": parsed.hostname,
        "port": parsed.port or 5432,
        "database": parsed.path.lstrip('/') or 'postgres',
        "user": parsed.username or 'postgres',
        "password": password,
    }


def execute_sql_file(cursor, filepath: Path, filename: str) -> tuple[bool, str]:
    """Execute a SQL file and return success status and message."""
    try:
        with open(filepath, 'r') as f:
            sql = f.read()
        
        cursor.execute(sql)
        return True, f"✓ Applied {filename}"
    except Exception as e:
        return False, f"✗ Failed to apply {filename}: {str(e)}"


def main():
    parser = argparse.ArgumentParser(description="Apply SQL schema to Supabase")
    parser.add_argument(
        "--seed",
        action="store_true",
        help="Also apply seed data (seed.sql)",
    )
    parser.add_argument(
        "--schema-only",
        action="store_true",
        help="Only apply schema, skip seed data even if --seed is specified",
    )
    args = parser.parse_args()

    # Prefer SUPABASE_DB_URL over SUPABASE_URL over DATABASE_URL (by design)
    supabase_db_url = os.getenv("SUPABASE_DB_URL")
    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY")
    database_url = os.getenv("DATABASE_URL")

    if not supabase_db_url and not supabase_url and not database_url:
        print("Error: No database connection configured")
        print("Please set one of:")
        print("  - SUPABASE_DB_URL: postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres (preferred)")
        print("  - SUPABASE_URL + SUPABASE_SERVICE_KEY")
        print("  - DATABASE_URL: postgresql://user:password@host:port/database")
        sys.exit(1)
    
    # Log if DATABASE_URL is set but ignored
    if database_url and (supabase_db_url or supabase_url):
        print("ℹ DATABASE_URL is set but ignored by design. Using Supabase for migrations.")
        print()

    # Locate SQL files
    project_root = Path(__file__).parent.parent.parent.parent
    schema_file = project_root / "infra" / "supabase.sql"
    seed_file = project_root / "infra" / "seed.sql"

    if not schema_file.exists():
        print(f"Error: Schema file not found: {schema_file}")
        sys.exit(1)

    print("AidJobs Database Setup")
    print("=" * 50)
    
    # Connect to database
    try:
        if supabase_db_url:
            # Prefer SUPABASE_DB_URL (connection pooler)
            cleaned_url = supabase_db_url.replace('[', '').replace(']', '')
            parsed = urlparse(cleaned_url)
            print(f"Database: {parsed.hostname}")
            print()
            
            # Parse URL and connect with individual parameters (more reliable than URL string)
            from urllib.parse import unquote
            conn_params = {
                "host": parsed.hostname,
                "port": parsed.port or 5432,
                "database": parsed.path.lstrip('/') or 'postgres',
                "user": parsed.username or 'postgres',
            }
            if parsed.password:
                conn_params["password"] = unquote(parsed.password)
            
            conn = psycopg2.connect(**conn_params)
            conn.autocommit = False
            cursor = conn.cursor()
        elif supabase_url:
            # Fallback to SUPABASE_URL
            print(f"Database: {urlparse(supabase_url).hostname}")
            print()
            
            conn_params = get_connection_params(supabase_url, service_key)
            conn = psycopg2.connect(**conn_params)
            conn.autocommit = False
            cursor = conn.cursor()
        else:
            # Final fallback to DATABASE_URL
            parsed = urlparse(database_url)
            print(f"Database: {parsed.hostname}")
            print()
            
            conn = psycopg2.connect(database_url)
            conn.autocommit = False
            cursor = conn.cursor()
        
        print("✓ Connected to database")
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        print("\nPlease verify your database credentials:")
        print("  - Check DATABASE_URL or SUPABASE_URL is correct")
        print("  - Ensure SUPABASE_SERVICE_KEY has sufficient permissions")
        sys.exit(1)

    results = []
    overall_success = True

    # Apply schema
    try:
        success, message = execute_sql_file(cursor, schema_file, "supabase.sql")
        results.append(message)
        
        if success:
            conn.commit()
        else:
            conn.rollback()
            overall_success = False
    except Exception as e:
        conn.rollback()
        results.append(f"✗ Schema application failed: {e}")
        overall_success = False

    # Apply seed data if requested and not schema-only
    if args.seed and not args.schema_only and overall_success:
        if seed_file.exists():
            try:
                success, message = execute_sql_file(cursor, seed_file, "seed.sql")
                results.append(message)
                
                if success:
                    conn.commit()
                else:
                    conn.rollback()
                    overall_success = False
            except Exception as e:
                conn.rollback()
                results.append(f"✗ Seed data failed: {e}")
                overall_success = False
        else:
            results.append(f"⚠ Seed file not found: {seed_file}")

    # Close connection
    cursor.close()
    conn.close()

    # Print summary
    print()
    print("Summary:")
    print("-" * 50)
    for result in results:
        print(result)
    
    print()
    if overall_success:
        print("✓ Database setup completed successfully")
        sys.exit(0)
    else:
        print("✗ Database setup failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
