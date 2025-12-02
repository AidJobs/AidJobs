"""
Delete invalid jobs identified by data quality validator.

This script deletes jobs with quality_score = 0, which are jobs that should have been
rejected during extraction (dates as titles, locations as titles, field contamination, etc.).
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to load .env file
try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
        logger.info(f"Loaded .env file from {env_path}")
except ImportError:
    # Fallback: manually parse .env file
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        value = value.strip().strip('"').strip("'")
                        os.environ[key.strip()] = value
            logger.info(f"Loaded .env file manually from {env_path}")
        except Exception as e:
            logger.warning(f"Failed to load .env file: {e}")


def delete_invalid_jobs(db_url: str, dry_run: bool = False):
    """Delete jobs with quality_score = 0 (invalid jobs)."""
    conn = None
    cursor = None
    
    try:
        logger.info("Connecting to database...")
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Count invalid jobs
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM jobs
            WHERE data_quality_score = 0
        """)
        total_invalid = cursor.fetchone()['count']
        logger.info(f"Found {total_invalid} invalid jobs (quality_score = 0)")
        
        if total_invalid == 0:
            logger.info("No invalid jobs to delete!")
            return
        
        # Get sample of invalid jobs to show
        cursor.execute("""
            SELECT 
                id::text,
                title,
                location_raw,
                data_quality_issues
            FROM jobs
            WHERE data_quality_score = 0
            ORDER BY created_at DESC
            LIMIT 10
        """)
        sample_jobs = cursor.fetchall()
        
        logger.info("\nSample of invalid jobs to be deleted:")
        for job in sample_jobs:
            issues = job.get('data_quality_issues')
            issue_text = 'Unknown issue'
            if issues:
                if isinstance(issues, str):
                    import json
                    try:
                        issues_list = json.loads(issues)
                        if isinstance(issues_list, list) and len(issues_list) > 0:
                            issue_text = ', '.join(str(i) for i in issues_list[:2])
                    except:
                        issue_text = str(issues)[:100]
                elif isinstance(issues, list) and len(issues) > 0:
                    issue_text = ', '.join(str(i) for i in issues[:2])
            
            title = job.get('title') or 'N/A'
            location = job.get('location_raw') or 'N/A'
            logger.info(f"  - {title[:50]}... (Location: {location[:30]}) - {issue_text}")
        
        if dry_run:
            logger.info(f"\nDRY RUN MODE - Would delete {total_invalid} invalid jobs")
            logger.info("Run without --dry-run to actually delete them")
            return
        
        # Confirm deletion
        logger.warning(f"\n⚠️  WARNING: About to DELETE {total_invalid} invalid jobs!")
        logger.warning("This will permanently remove these jobs from the database.")
        
        # Get IDs of jobs to delete (for Meilisearch cleanup)
        cursor.execute("""
            SELECT id::text
            FROM jobs
            WHERE data_quality_score = 0
        """)
        job_ids_to_delete = [row['id'] for row in cursor.fetchall()]
        
        # Delete invalid jobs (HARD DELETE - they're bad data)
        logger.info("Deleting invalid jobs...")
        cursor.execute("""
            DELETE FROM jobs
            WHERE data_quality_score = 0
        """)
        deleted_count = cursor.rowcount
        
        # Commit
        conn.commit()
        logger.info(f"✓ Deleted {deleted_count} invalid jobs")
        
        # Try to remove from Meilisearch if available
        if job_ids_to_delete:
            try:
                import meilisearch
                meili_host = os.getenv("MEILISEARCH_URL") or os.getenv("MEILI_HOST")
                meili_key = os.getenv("MEILISEARCH_KEY") or os.getenv("MEILI_API_KEY")
                meili_index_name = os.getenv("MEILI_JOBS_INDEX", "jobs_index")
                
                if meili_host and meili_key:
                    client = meilisearch.Client(meili_host, meili_key)
                    index = client.index(meili_index_name)
                    
                    # Delete in batches of 100 (Meilisearch limit)
                    batch_size = 100
                    for i in range(0, len(job_ids_to_delete), batch_size):
                        batch = job_ids_to_delete[i:i + batch_size]
                        try:
                            index.delete_documents(batch)
                            logger.info(f"Deleted {len(batch)} jobs from Meilisearch index")
                        except Exception as e:
                            logger.warning(f"Failed to delete some jobs from Meilisearch: {e}")
            except ImportError:
                logger.info("Meilisearch not available, skipping index cleanup")
            except Exception as e:
                logger.warning(f"Failed to update Meilisearch: {e}")
        
        return {
            'deleted': deleted_count,
            'total_invalid': total_invalid
        }
        
    except Exception as e:
        logger.error(f"Deletion failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    # Get database URL from environment
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    if not db_url:
        logger.error("❌ No database URL found in environment variables")
        logger.error("Please set SUPABASE_DB_URL or DATABASE_URL")
        sys.exit(1)
    
    # Check for dry-run flag
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    
    # Mask URL in logs
    try:
        from urllib.parse import urlparse
        parsed = urlparse(db_url)
        masked_url = f"{parsed.scheme}://***@{parsed.hostname}:{parsed.port or 5432}{parsed.path}"
        logger.info(f"Database: {masked_url}")
    except:
        logger.info("Database: [connection string from environment]")
    
    try:
        delete_invalid_jobs(db_url, dry_run=dry_run)
        logger.info("\n✅ Deletion completed successfully!")
    except Exception as e:
        logger.error(f"\n❌ Deletion failed: {e}")
        sys.exit(1)

