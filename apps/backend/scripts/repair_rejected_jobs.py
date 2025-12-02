"""
Repair jobs that were previously rejected due to data quality issues.

This script finds jobs with quality_score = 0 and attempts to repair them,
then re-validates and updates their scores.
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

# Add parent directory to path to import core modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.data_quality import data_quality_validator


def repair_rejected_jobs(db_url: str, batch_size: int = 100, dry_run: bool = False):
    """Repair jobs that were previously rejected."""
    conn = None
    cursor = None
    
    try:
        logger.info("Connecting to database...")
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Count rejected jobs (score = 0)
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM jobs
            WHERE data_quality_score = 0 AND deleted_at IS NULL
        """)
        total_jobs = cursor.fetchone()['count']
        logger.info(f"Found {total_jobs} rejected jobs to repair")
        
        if total_jobs == 0:
            logger.info("No rejected jobs found!")
            return
        
        if dry_run:
            logger.info("DRY RUN MODE - No changes will be made")
        
        # Process in batches
        offset = 0
        processed = 0
        repaired_count = 0
        restored_count = 0
        
        while offset < total_jobs:
            cursor.execute("""
                SELECT 
                    id::text,
                    title,
                    location_raw,
                    deadline,
                    apply_url,
                    org_name,
                    description_snippet
                FROM jobs
                WHERE data_quality_score = 0 AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """, (batch_size, offset))
            
            jobs = cursor.fetchall()
            if not jobs:
                break
            
            logger.info(f"Processing batch: {offset + 1} to {offset + len(jobs)} of {total_jobs}")
            
            for job in jobs:
                processed += 1
                
                # Build job dict for repair
                job_dict = {
                    'title': job.get('title', ''),
                    'location_raw': job.get('location_raw', ''),
                    'deadline': job.get('deadline'),
                    'apply_url': job.get('apply_url', ''),
                    'org_name': job.get('org_name', ''),
                    'description_snippet': job.get('description_snippet', '')
                }
                
                # Attempt repair and re-validate
                quality_result = data_quality_validator.validate_and_score(job_dict, attempt_repair=True)
                
                # If repairs were made, use repaired job
                if quality_result.get('repaired', False) and quality_result.get('repaired_job'):
                    job_dict = quality_result['repaired_job']
                    repaired_count += 1
                    logger.info(f"Job {job['id']} repaired: {', '.join(quality_result.get('repair_log', [])[:2])}")
                
                # If job is now valid, update it
                if quality_result['valid']:
                    restored_count += 1
                    logger.info(f"Job {job['id']} restored (score: {quality_result['score']}/100)")
                    
                    if not dry_run:
                        # Update job with repaired data and new score
                        cursor.execute("""
                            UPDATE jobs
                            SET 
                                title = %s,
                                location_raw = %s,
                                deadline = %s,
                                data_quality_score = %s,
                                data_quality_issues = %s
                            WHERE id::text = %s
                        """, (
                            job_dict.get('title'),
                            job_dict.get('location_raw'),
                            job_dict.get('deadline'),
                            quality_result['score'],
                            json.dumps(quality_result['issues'] + quality_result['warnings']),
                            job['id']
                        ))
                else:
                    logger.warning(f"Job {job['id']} still invalid after repair: {quality_result.get('rejected_reason')}")
            
            if not dry_run:
                conn.commit()
                logger.info(f"Committed batch. Repaired: {repaired_count}, Restored: {restored_count} so far")
            
            offset += batch_size
        
        logger.info("\nRepair complete!")
        logger.info(f"  Total processed: {processed}")
        logger.info(f"  Repaired: {repaired_count}")
        logger.info(f"  Restored (now valid): {restored_count}")
        
        if dry_run:
            logger.info("\nRun without --dry-run to apply changes")
        
        return {
            'processed': processed,
            'repaired': repaired_count,
            'restored': restored_count
        }
        
    except Exception as e:
        logger.error(f"Repair failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    
    if not db_url:
        logger.error("❌ No database URL found in environment variables")
        logger.error("Please set SUPABASE_DB_URL or DATABASE_URL")
        sys.exit(1)
    
    # Mask URL in logs
    try:
        from urllib.parse import urlparse
        parsed = urlparse(db_url)
        masked_url = f"{parsed.scheme}://***@{parsed.hostname}:{parsed.port or 5432}{parsed.path}"
        logger.info(f"Database: {masked_url}")
    except:
        logger.info("Database: [connection string from environment]")
    
    # Check for flags
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    
    try:
        repair_rejected_jobs(db_url, batch_size=100, dry_run=dry_run)
        logger.info("\n✅ Repair completed successfully!")
    except Exception as e:
        logger.error(f"\n❌ Repair failed: {e}")
        sys.exit(1)

