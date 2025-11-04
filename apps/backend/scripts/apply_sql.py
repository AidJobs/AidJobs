#!/usr/bin/env python3
"""
Apply SQL schema and seed data to Supabase database.
Idempotent - safe to run multiple times.
"""
import os
import sys
import argparse
from pathlib import Path
from urllib.parse import urlparse, unquote

try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


def get_table_summary(cursor) -> dict:
    """Get summary of tables and their row counts."""
    cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
    """)
    tables = [row[0] for row in cursor.fetchall()]
    
    summary = {}
    for table in tables:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = cursor.fetchone()[0]
        summary[table] = count
    
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Apply SQL schema and seed data to Supabase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python apply_sql.py              # Apply schema only
  python apply_sql.py --seed       # Apply schema and seed data
        """
    )
    parser.add_argument(
        "--seed",
        action="store_true",
        help="Also apply seed data after schema",
    )
    args = parser.parse_args()

    # Check for SUPABASE_DB_URL
    supabase_db_url = os.getenv("SUPABASE_DB_URL")
    
    if not supabase_db_url:
        print("Error: SUPABASE_DB_URL environment variable is not set")
        print()
        print("To get your connection string:")
        print("  1. Go to Supabase Dashboard → Settings → Database")
        print("  2. Under 'Connection string', select 'Connection pooling'")
        print("  3. Choose 'Transaction' mode")
        print("  4. Copy the connection string")
        print()
        print("Then add it to your Replit Secrets:")
        print("  Key: SUPABASE_DB_URL")
        print("  Value: postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres")
        sys.exit(1)

    # Locate SQL files
    project_root = Path(__file__).parent.parent.parent.parent
    schema_file = project_root / "infra" / "supabase.sql"
    taxonomy_file = project_root / "infra" / "seed_taxonomy.sql"
    seed_file = project_root / "infra" / "seed.sql"

    if not schema_file.exists():
        print(f"Error: Schema file not found: {schema_file}")
        sys.exit(1)

    print("AidJobs Database Setup")
    print("=" * 60)
    
    # Parse and clean URL
    cleaned_url = supabase_db_url.replace('[', '').replace(']', '')
    parsed = urlparse(cleaned_url)
    
    print(f"Connecting to: {parsed.hostname}:{parsed.port}")
    
    # Connect to database
    try:
        conn_params = {
            "host": parsed.hostname,
            "port": parsed.port or 6543,
            "database": parsed.path.lstrip('/') or 'postgres',
            "user": parsed.username or 'postgres',
        }
        if parsed.password:
            conn_params["password"] = unquote(parsed.password)
        
        conn = psycopg2.connect(**conn_params, connect_timeout=10)
        cursor = conn.cursor()
        print("✓ Connected successfully\n")
    except Exception as e:
        print(f"✗ Connection failed: {e}\n")
        print("Please verify:")
        print("  - SUPABASE_DB_URL is correct")
        print("  - Password is URL-encoded if it contains special characters")
        print("  - Your Supabase project is active")
        sys.exit(1)

    try:
        # Get initial state
        print("Checking current database state...")
        initial_tables = get_table_summary(cursor)
        initial_count = len(initial_tables)
        print(f"  Found {initial_count} existing table(s)\n")

        # Apply schema
        print("Applying schema (infra/supabase.sql)...")
        with open(schema_file, 'r') as f:
            schema_sql = f.read()
        
        cursor.execute(schema_sql)
        conn.commit()
        
        # Get state after schema
        after_schema_tables = get_table_summary(cursor)
        new_tables = set(after_schema_tables.keys()) - set(initial_tables.keys())
        
        if new_tables:
            print(f"✓ Created {len(new_tables)} new table(s): {', '.join(sorted(new_tables))}")
        else:
            print(f"✓ All tables already exist (idempotent)")
        
        # Apply taxonomy seed data (always run - idempotent)
        if taxonomy_file.exists():
            print(f"\nApplying taxonomy data (infra/seed_taxonomy.sql)...")
            before_taxonomy = get_table_summary(cursor)
            
            with open(taxonomy_file, 'r') as f:
                taxonomy_sql = f.read()
            
            cursor.execute(taxonomy_sql)
            conn.commit()
            
            after_taxonomy = get_table_summary(cursor)
            
            # Show lookup table summary
            lookup_tables = ['countries', 'levels', 'missions', 'functional', 'work_modalities', 
                           'contracts', 'org_types', 'crisis_types', 'clusters', 'response_phases',
                           'benefits', 'policy_flags', 'donors', 'synonyms']
            
            print("✓ Taxonomy data applied")
            print("\nLookup Table Summary:")
            print("-" * 60)
            for table in lookup_tables:
                if table in after_taxonomy:
                    before = before_taxonomy.get(table, 0)
                    after = after_taxonomy[table]
                    added = after - before
                    
                    status = f"{after:3d} row(s)"
                    if added > 0:
                        status += f" (+{added} new)"
                    
                    print(f"  {table:30} {status}")
        
        # Apply seed data if requested
        if args.seed:
            if not seed_file.exists():
                print(f"\n⚠ Warning: Seed file not found: {seed_file}")
            else:
                print(f"\nApplying seed data (infra/seed.sql)...")
                with open(seed_file, 'r') as f:
                    seed_sql = f.read()
                
                cursor.execute(seed_sql)
                conn.commit()
                
                # Get final state
                final_tables = get_table_summary(cursor)
                
                print("✓ Seed data applied")
                
                # Show row counts
                print("\nDatabase Summary:")
                print("-" * 60)
                for table, count in sorted(final_tables.items()):
                    before = initial_tables.get(table, 0)
                    after = count
                    added = after - before
                    
                    status = f"{count} row(s)"
                    if added > 0:
                        status += f" (+{added} new)"
                    
                    print(f"  {table:30} {status}")
        else:
            # Get final state after taxonomy
            final_summary = get_table_summary(cursor)
            print("\nDatabase Summary:")
            print("-" * 60)
            for table, count in sorted(final_summary.items()):
                print(f"  {table:30} {count} row(s)")
        
        print("\n" + "=" * 60)
        print("✓ Database setup completed successfully")
        
    except Exception as e:
        conn.rollback()
        print(f"\n✗ Error: {e}")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
