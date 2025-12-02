"""
Backfill data quality scores for existing jobs.

This script validates and scores all existing jobs in the database that don't have
quality scores yet. It updates their data_quality_score and data_quality_issues.
"""

import os
import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from typing import Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    # Load .env from apps/backend directory
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
                        # Remove quotes if present
                        value = value.strip().strip('"').strip("'")
                        os.environ[key.strip()] = value
                        logger.debug(f"Set env var: {key.strip()}")
            logger.info(f"Loaded .env file manually from {env_path}")
            # Verify it was loaded
            if 'SUPABASE_DB_URL' in os.environ:
                logger.info("SUPABASE_DB_URL found in environment")
            else:
                logger.warning("SUPABASE_DB_URL not found after loading .env")
        except Exception as e:
            logger.warning(f"Failed to load .env file: {e}")

# Add parent directory to path to import core modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.data_quality import data_quality_validator


def backfill_quality_scores(db_url: str, batch_size: int = 100, dry_run: bool = False, force_rescore: bool = False):
    """Backfill quality scores for existing jobs."""
    conn = None
    cursor = None
    
    try:
        logger.info("Connecting to database...")
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        if force_rescore:
            # Count all active jobs for re-scoring
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM jobs
                WHERE deleted_at IS NULL
            """)
            total_jobs = cursor.fetchone()['count']
            logger.info(f"🔄 FORCE MODE: Found {total_jobs} active jobs to re-score with updated validation")
        else:
            # Count jobs without quality scores
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM jobs
                WHERE data_quality_score IS NULL
            """)
            total_jobs = cursor.fetchone()['count']
            logger.info(f"Found {total_jobs} jobs without quality scores")
        
        if total_jobs == 0 and not force_rescore:
            logger.info("All jobs already have quality scores!")
            logger.info("💡 Tip: Use --force or --rescore to re-score all jobs with updated validation")
            return
        
        if dry_run:
            logger.info("DRY RUN MODE - No changes will be made")
        
        # Process in batches
        offset = 0
        processed = 0
        updated = 0
        rejected_count = 0
        
        while offset < total_jobs:
            # Fetch batch of jobs
            if force_rescore:
                cursor.execute("""
                    SELECT 
                        id::text,
                        title,
                        location_raw,
                        deadline,
                        apply_url,
                        org_name
                    FROM jobs
                    WHERE deleted_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """, (batch_size, offset))
            else:
                cursor.execute("""
                    SELECT 
                        id::text,
                        title,
                        location_raw,
                        deadline,
                        apply_url,
                        org_name
                    FROM jobs
                    WHERE data_quality_score IS NULL
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """, (batch_size, offset))
            
            jobs = cursor.fetchall()
            if not jobs:
                break
            
            logger.info(f"Processing batch: {offset + 1} to {offset + len(jobs)} of {total_jobs}")
            
            for job in jobs:
                processed += 1
                
                # Build job dict for validator
                job_dict = {
                    'title': job.get('title', ''),
                    'location_raw': job.get('location_raw', ''),
                    'deadline': job.get('deadline'),
                    'apply_url': job.get('apply_url', ''),
                    'org_name': job.get('org_name', '')
                }
                
                # Validate and score (with repair enabled)
                quality_result = data_quality_validator.validate_and_score(job_dict, attempt_repair=True)
                
                # If repairs were made, use the repaired job
                if quality_result.get('repaired', False) and quality_result.get('repaired_job'):
                    job_dict = quality_result['repaired_job']
                    logger.info(f"Job {job['id']} repaired: {', '.join(quality_result.get('repair_log', [])[:2])}")
                
                if not quality_result['valid']:
                    # Job should have been rejected - mark it
                    rejected_count += 1
                    logger.warning(f"Job {job['id']} should be rejected: {quality_result['rejected_reason']}")
                    
                    if not dry_run:
                        # Mark as rejected by setting score to 0
                        cursor.execute("""
                            UPDATE jobs
                            SET 
                                data_quality_score = 0,
                                data_quality_issues = %s
                            WHERE id::text = %s
                        """, (
                            json.dumps([quality_result['rejected_reason']]),
                            job['id']
                        ))
                        updated += 1
                else:
                    # Update with quality score
                    if not dry_run:
                        cursor.execute("""
                            UPDATE jobs
                            SET 
                                data_quality_score = %s,
                                data_quality_issues = %s
                            WHERE id::text = %s
                        """, (
                            quality_result['score'],
                            json.dumps(quality_result['issues'] + quality_result['warnings']) if (quality_result['issues'] or quality_result['warnings']) else None,
                            job['id']
                        ))
                        updated += 1
                
                # Log progress every 50 jobs
                if processed % 50 == 0:
                    logger.info(f"Processed {processed}/{total_jobs} jobs...")
            
            offset += batch_size
            
            # Commit batch
            if not dry_run:
                conn.commit()
                logger.info(f"Committed batch. Updated: {updated} jobs so far")
        
        logger.info(f"\n{'DRY RUN - ' if dry_run else ''}Backfill complete!")
        logger.info(f"  Total processed: {processed}")
        logger.info(f"  Updated: {updated}")
        logger.info(f"  Should be rejected: {rejected_count}")
        
        if dry_run:
            logger.info("\nRun without --dry-run to apply changes")
        
        return {
            'processed': processed,
            'updated': updated,
            'rejected': rejected_count
        }
        
    except Exception as e:
        logger.error(f"Backfill failed: {e}")
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
    
    # Check for flags
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    force_rescore = '--force' in sys.argv or '--rescore' in sys.argv
    
    # Mask URL in logs
    try:
        from urllib.parse import urlparse
        parsed = urlparse(db_url)
        masked_url = f"{parsed.scheme}://***@{parsed.hostname}:{parsed.port or 5432}{parsed.path}"
        logger.info(f"Database: {masked_url}")
    except:
        logger.info("Database: [connection string from environment]")
    
    try:
        backfill_quality_scores(db_url, batch_size=100, dry_run=dry_run, force_rescore=force_rescore)
        logger.info("\n✅ Backfill completed successfully!")
    except Exception as e:
        logger.error(f"\n❌ Backfill failed: {e}")
        sys.exit(1)

