"""
Migration script to create link_validations table.

This script creates the link_validations table for caching URL validation results.
Safe to run multiple times (idempotent).
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables from .env file if it exists
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
        print(f"Loaded .env file from {env_path}")
    except ImportError:
        # dotenv not available, use system environment variables
        print("Note: python-dotenv not available, using system environment variables")
        pass
else:
    print(f"Note: .env file not found at {env_path}, using system environment variables")

import psycopg2
from psycopg2.extras import RealDictCursor

def get_db_url():
    """Get database URL from environment"""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("No database URL found. Set SUPABASE_DB_URL or DATABASE_URL")
    return db_url

def get_db_conn():
    """Get database connection"""
    return psycopg2.connect(get_db_url())

def run_migration():
    """Run the migration"""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            print("Creating link_validations table...")
            
            # Create table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS link_validations (
                    url TEXT PRIMARY KEY,
                    is_valid BOOLEAN NOT NULL,
                    status_code INT,
                    final_url TEXT,
                    redirect_count INT DEFAULT 0,
                    error_message TEXT,
                    validated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            
            # Create index
            print("Creating index...")
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_link_validations_validated_at 
                ON link_validations(validated_at)
            """)
            
            conn.commit()
            print("✅ Migration completed successfully!")
            
            # Verify
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'link_validations'
                )
            """)
            exists = cur.fetchone()['exists']
            
            if exists:
                print("✅ Table verified: link_validations exists")
            else:
                print("⚠️  Warning: Table creation may have failed")
            
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    print("=" * 80)
    print("Link Validations Table Migration")
    print("=" * 80)
    print()
    
    try:
        run_migration()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

