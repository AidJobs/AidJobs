#!/usr/bin/env python3
"""
Temporary diagnostic script to check job insertion status in the database.
"""
import os
import sys
from pathlib import Path

# Add backend to sys.path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Try to load .env file if it exists (simple parser)
env_file = Path(__file__).parent.parent.parent / ".env"
if env_file.exists():
    try:
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    # Only set if not already in environment
                    if key and key not in os.environ:
                        os.environ[key] = value
    except Exception as e:
        print(f"Warning: Could not load .env file: {e}")

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("ERROR: psycopg2 not installed. Please install it first.")
    sys.exit(1)

def get_db_url():
    """Get database URL from environment variables (same logic as backend)."""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL or DATABASE_URL not set in environment")
        print("       Please set it in your .env file or environment variables")
        print(f"       Checked .env file at: {env_file}")
        sys.exit(1)
    return db_url

def print_section(title):
    """Print a clear section header."""
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)

def run_query(conn, query, description):
    """Run a query and print results."""
    print(f"\n{description}")
    print("-" * 80)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query)
            results = cur.fetchall()
            
            if not results:
                print("  (No results)")
                return results
            
            # Print column headers
            if results:
                columns = list(results[0].keys())
                header = " | ".join(f"{col:20}" for col in columns)
                print(f"  {header}")
                print("  " + "-" * len(header))
                
                # Print rows
                for row in results:
                    values = []
                    for col in columns:
                        val = row[col]
                        if val is None:
                            val = "NULL"
                        elif isinstance(val, str) and len(val) > 50:
                            val = val[:47] + "..."
                        else:
                            val = str(val)
                        values.append(f"{val:20}")
                    print(f"  {' | '.join(values)}")
            
            return results
    except Exception as e:
        print(f"  ERROR: {e}")
        return None

def main():
    """Run database diagnostic checks."""
    print_section("DATABASE DIAGNOSTIC: Job Insertion Status")
    
    db_url = get_db_url()
    print(f"\nDatabase URL: {db_url[:50]}...")
    
    conn = None
    try:
        conn = psycopg2.connect(db_url, connect_timeout=5)
        print("✓ Database connection successful")
        
        # Query A: Total jobs
        print_section("QUERY A: Total Jobs Count")
        result = run_query(
            conn,
            "SELECT COUNT(*) AS total_jobs FROM jobs",
            "Total jobs in database:"
        )
        if result:
            total = result[0]['total_jobs']
            print(f"\n  → Total jobs: {total}")
        
        # Query B: Latest inserted jobs
        print_section("QUERY B: Latest Inserted Jobs (Last 20)")
        run_query(
            conn,
            """
            SELECT 
                id, 
                created_at, 
                title, 
                apply_url, 
                source_id
            FROM jobs
            ORDER BY created_at DESC
            LIMIT 20
            """,
            "Most recently created jobs:"
        )
        
        # Query C: Check if failed_inserts table exists
        print_section("QUERY C: Failed Inserts Table Check")
        table_check = run_query(
            conn,
            """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'failed_inserts'
            """,
            "Checking if failed_inserts table exists:"
        )
        
        if table_check and len(table_check) > 0:
            print("\n  ✓ failed_inserts table exists")
            print_section("QUERY C (continued): Recent Failed Inserts")
            run_query(
                conn,
                """
                SELECT * 
                FROM failed_inserts 
                ORDER BY attempt_at DESC 
                LIMIT 20
                """,
                "Most recent failed insert attempts:"
            )
        else:
            print("\n  ⚠ failed_inserts table does not exist")
        
        # Additional check: Jobs by source
        print_section("BONUS: Jobs Count by Source")
        run_query(
            conn,
            """
            SELECT 
                s.org_name,
                s.id as source_id,
                COUNT(j.id) as job_count,
                MAX(j.created_at) as latest_job_created
            FROM sources s
            LEFT JOIN jobs j ON j.source_id = s.id
            GROUP BY s.id, s.org_name
            ORDER BY job_count DESC
            LIMIT 20
            """,
            "Job counts per source:"
        )
        
        # Additional check: Recent crawl logs
        print_section("BONUS: Recent Crawl Logs")
        run_query(
            conn,
            """
            SELECT 
                cl.id,
                cl.source_id,
                s.org_name,
                cl.ran_at,
                cl.found,
                cl.inserted,
                cl.updated,
                cl.skipped,
                cl.status,
                cl.message
            FROM crawl_logs cl
            LEFT JOIN sources s ON s.id = cl.source_id
            ORDER BY cl.ran_at DESC
            LIMIT 20
            """,
            "Most recent crawl executions:"
        )
        
        print_section("DIAGNOSTIC COMPLETE")
        print("\n✓ All checks completed successfully")
        
    except psycopg2.Error as e:
        print(f"\n❌ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        if conn:
            conn.close()
            print("\n✓ Database connection closed")

if __name__ == "__main__":
    main()

