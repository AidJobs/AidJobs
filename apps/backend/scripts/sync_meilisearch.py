"""
Sync Meilisearch with database - remove orphaned job IDs.

This script removes job IDs from Meilisearch that no longer exist in the database
(due to hard deletes or other reasons).
"""

import os
import sys
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    import meilisearch
except ImportError:
    logger.error("meilisearch package not installed")
    sys.exit(1)

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    logger.error("psycopg2 not installed")
    sys.exit(1)


def get_meili_client():
    """Get Meilisearch client"""
    host = os.getenv("MEILISEARCH_URL") or os.getenv("MEILI_HOST")
    key = os.getenv("MEILISEARCH_KEY") or os.getenv("MEILI_API_KEY") or os.getenv("MEILI_MASTER_KEY")
    index_name = os.getenv("MEILI_JOBS_INDEX", "jobs_index")
    
    if not host or not key:
        logger.error("Meilisearch not configured (need MEILISEARCH_URL/MEILISEARCH_KEY or MEILI_HOST/MEILI_API_KEY)")
        return None, None
    
    try:
        client = meilisearch.Client(host, key)
        index = client.index(index_name)
        return client, index
    except Exception as e:
        logger.error(f"Failed to connect to Meilisearch: {e}")
        return None, None


def get_db_conn():
    """Get database connection"""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        logger.error("No database URL configured (need SUPABASE_DB_URL or DATABASE_URL)")
        return None
    
    try:
        return psycopg2.connect(db_url)
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return None


def sync_meilisearch(dry_run=True):
    """
    Remove job IDs from Meilisearch that don't exist in database.
    
    Args:
        dry_run: If True, only report what would be deleted, don't actually delete
    """
    client, index = get_meili_client()
    if not client or not index:
        return
    
    conn = get_db_conn()
    if not conn:
        return
    
    try:
        # Get all job IDs from Meilisearch
        logger.info("Fetching all job IDs from Meilisearch...")
        meili_jobs = index.get_documents({"limit": 10000})  # Adjust limit if needed
        meili_ids = {job['id'] for job in meili_jobs.get('results', [])}
        logger.info(f"Found {len(meili_ids)} jobs in Meilisearch")
        
        # Get all job IDs from database
        logger.info("Fetching all job IDs from database...")
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT id::text FROM jobs")
        db_ids = {row['id'] for row in cursor.fetchall()}
        logger.info(f"Found {len(db_ids)} jobs in database")
        
        # Find orphaned IDs (in Meilisearch but not in database)
        orphaned_ids = meili_ids - db_ids
        logger.info(f"Found {len(orphaned_ids)} orphaned job IDs in Meilisearch")
        
        if not orphaned_ids:
            logger.info("✅ Meilisearch is in sync with database - no orphaned jobs found")
            return
        
        # Show sample of orphaned IDs
        sample = list(orphaned_ids)[:10]
        logger.info(f"Sample orphaned IDs: {sample}")
        
        if dry_run:
            logger.info("🔍 DRY RUN - Would delete these orphaned jobs from Meilisearch")
            logger.info(f"Run with --execute to actually delete them")
        else:
            # Delete in batches of 100 (Meilisearch limit)
            orphaned_list = list(orphaned_ids)
            deleted_count = 0
            
            for i in range(0, len(orphaned_list), 100):
                batch = orphaned_list[i:i+100]
                try:
                    index.delete_documents(batch)
                    deleted_count += len(batch)
                    logger.info(f"Deleted batch {i//100 + 1}: {len(batch)} jobs (total: {deleted_count}/{len(orphaned_list)})")
                except Exception as e:
                    logger.error(f"Failed to delete batch: {e}")
            
            logger.info(f"✅ Successfully deleted {deleted_count} orphaned jobs from Meilisearch")
        
    except Exception as e:
        logger.error(f"Error syncing Meilisearch: {e}", exc_info=True)
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Sync Meilisearch with database")
    parser.add_argument("--execute", action="store_true", help="Actually delete orphaned jobs (default is dry-run)")
    
    args = parser.parse_args()
    
    sync_meilisearch(dry_run=not args.execute)

