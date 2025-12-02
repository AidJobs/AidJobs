"""
Database migration: Add data quality columns to jobs table.

This script adds:
- data_quality_score (INTEGER)
- data_quality_issues (JSONB)
- Index for quality filtering
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migration(db_url: str):
    """Run the data quality migration."""
    conn = None
    cursor = None
    
    try:
        # Parse connection string
        # Format: postgresql://user:password@host:port/database
        logger.info("Connecting to database...")
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        logger.info("Starting data quality migration...")
        
        # 1. Add data_quality_score column
        logger.info("Adding data_quality_score column...")
        cursor.execute("""
            ALTER TABLE jobs
            ADD COLUMN IF NOT EXISTS data_quality_score INTEGER;
        """)
        logger.info("✓ Added data_quality_score column")
        
        # 2. Add data_quality_issues column
        logger.info("Adding data_quality_issues column...")
        cursor.execute("""
            ALTER TABLE jobs
            ADD COLUMN IF NOT EXISTS data_quality_issues JSONB;
        """)
        logger.info("✓ Added data_quality_issues column")
        
        # 3. Create index for quality filtering
        logger.info("Creating index for quality filtering...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_jobs_quality_score 
            ON jobs(data_quality_score) 
            WHERE data_quality_score IS NOT NULL;
        """)
        logger.info("✓ Created quality score index")
        
        # 4. Add comments for documentation
        logger.info("Adding column comments...")
        cursor.execute("""
            COMMENT ON COLUMN jobs.data_quality_score IS 
            'Data quality score (0-100) calculated during extraction';
        """)
        cursor.execute("""
            COMMENT ON COLUMN jobs.data_quality_issues IS 
            'JSON array of data quality issues and warnings';
        """)
        logger.info("✓ Added column comments")
        
        # Commit changes
        conn.commit()
        logger.info("✓ Migration completed successfully!")
        
        # Verify migration
        cursor.execute("""
            SELECT 
                column_name, 
                data_type,
                is_nullable
            FROM information_schema.columns
            WHERE table_name = 'jobs'
            AND column_name IN ('data_quality_score', 'data_quality_issues')
            ORDER BY column_name;
        """)
        columns = cursor.fetchall()
        
        logger.info("\nVerification:")
        for col in columns:
            logger.info(f"  - {col['column_name']}: {col['data_type']} (nullable: {col['is_nullable']})")
        
        # Check index
        cursor.execute("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'jobs'
            AND indexname = 'idx_jobs_quality_score';
        """)
        index = cursor.fetchone()
        if index:
            logger.info(f"  - Index created: {index['indexname']}")
        
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    # SECURITY: Only use environment variables - never accept URL as command line argument
    # This prevents URLs from appearing in shell history or process lists
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    if not db_url:
        logger.error("❌ No database URL found in environment variables")
        logger.error("")
        logger.error("Please set one of the following environment variables:")
        logger.error("  - SUPABASE_DB_URL (preferred)")
        logger.error("  - DATABASE_URL (fallback)")
        logger.error("")
        logger.error("Example:")
        logger.error("  export SUPABASE_DB_URL='postgresql://user:pass@host:port/db'")
        logger.error("  python scripts/migrate_data_quality.py")
        logger.error("")
        logger.error("Or create a .env file in apps/backend/ with:")
        logger.error("  SUPABASE_DB_URL=postgresql://user:pass@host:port/db")
        sys.exit(1)
    
    # Mask URL in logs (show only host) for security
    try:
        from urllib.parse import urlparse
        parsed = urlparse(db_url)
        masked_url = f"{parsed.scheme}://***@{parsed.hostname}:{parsed.port or 5432}{parsed.path}"
        logger.info(f"Database: {masked_url}")
    except:
        logger.info("Database: [connection string from environment]")
    
    try:
        run_migration(db_url)
        logger.info("\n✅ Migration completed successfully!")
    except Exception as e:
        logger.error(f"\n❌ Migration failed: {e}")
        sys.exit(1)

