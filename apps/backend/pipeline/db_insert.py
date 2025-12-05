"""
Database insertion for extraction pipeline.

Handles saving ExtractionResult objects to the jobs table with shadow mode support.
Reuses existing save_jobs logic from SimpleCrawler.
"""

import os
import logging
import hashlib
import re
from typing import Dict, Optional, Any, List
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

from .extractor import ExtractionResult

logger = logging.getLogger(__name__)

# Field mapping: ExtractionResult field -> jobs table column
FIELD_MAP = {
    'title': 'title',
    'employer': 'org_name',
    'location': 'location_raw',
    'deadline': 'deadline',
    'description': 'description_snippet',
    'application_url': 'apply_url',
    'posted_on': 'fetched_at',
    'requirements': 'raw_metadata',  # Store as JSONB
}

# Default values
DEFAULT_USE_STORAGE = os.getenv('EXTRACTION_USE_STORAGE', 'false').lower() == 'true'
DEFAULT_SHADOW_MODE = os.getenv('EXTRACTION_SHADOW_MODE', 'true').lower() == 'true'
DEFAULT_JOBS_TABLE = os.getenv('JOBS_TABLE', 'jobs')


class DBInsert:
    """Handles database insertion for extracted jobs."""
    
    def __init__(self, db_url: str, use_storage: Optional[bool] = None, 
                 shadow_mode: Optional[bool] = None, jobs_table: Optional[str] = None):
        """
        Initialize DB insertion handler.
        
        Args:
            db_url: PostgreSQL connection string
            use_storage: Enable storage (default: EXTRACTION_USE_STORAGE env var)
            shadow_mode: Use shadow table (default: EXTRACTION_SHADOW_MODE env var)
            jobs_table: Table name (default: JOBS_TABLE env var or 'jobs')
        """
        self.db_url = db_url
        self.use_storage = use_storage if use_storage is not None else DEFAULT_USE_STORAGE
        self.shadow_mode = shadow_mode if shadow_mode is not None else DEFAULT_SHADOW_MODE
        self.jobs_table = jobs_table or DEFAULT_JOBS_TABLE
        self.shadow_table = f"{self.jobs_table}_side" if self.shadow_mode else self.jobs_table
        
        logger.info(
            f"DBInsert initialized: use_storage={self.use_storage}, "
            f"shadow_mode={self.shadow_mode}, table={self.shadow_table}"
        )
    
    def _get_db_conn(self):
        """Get database connection."""
        try:
            # Parse connection string
            if self.db_url.startswith('postgresql://') or self.db_url.startswith('postgres://'):
                # Use psycopg2 connection string directly
                return psycopg2.connect(self.db_url, connect_timeout=5)
            else:
                # Try to parse as dict (legacy support)
                import json
                params = json.loads(self.db_url) if isinstance(self.db_url, str) else self.db_url
                return psycopg2.connect(**params, connect_timeout=5)
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def _extract_result_to_job_dict(self, result: ExtractionResult, 
                                   source_id: Optional[str] = None,
                                   org_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Convert ExtractionResult to job dictionary for database insertion.
        
        Args:
            result: ExtractionResult object
            source_id: Optional source ID
            org_name: Optional organization name
        
        Returns:
            Dictionary matching jobs table schema
        """
        job = {}
        
        # Map fields using FIELD_MAP
        for extractor_field, db_column in FIELD_MAP.items():
            field_result = result.get_field(extractor_field)
            if field_result and field_result.value:
                if db_column == 'raw_metadata':
                    # Store requirements as JSONB
                    job['raw_metadata'] = {'requirements': field_result.value}
                elif db_column == 'fetched_at':
                    # Parse posted_on date
                    posted_date = self._parse_date(field_result.value)
                    if posted_date:
                        job[db_column] = posted_date
                else:
                    job[db_column] = field_result.value
        
        # Required fields
        if not job.get('title'):
            title_field = result.get_field('title')
            if title_field and title_field.value:
                job['title'] = title_field.value
        
        if not job.get('apply_url'):
            app_url_field = result.get_field('application_url')
            if app_url_field and app_url_field.value:
                job['apply_url'] = app_url_field.value
            else:
                # Fallback to result URL
                job['apply_url'] = result.url
        
        # Metadata
        if source_id:
            job['source_id'] = source_id
        if org_name:
            job['org_name'] = org_name
        
        # Canonical hash (use result's dedupe_hash if available)
        if result.dedupe_hash:
            job['canonical_hash'] = result.dedupe_hash
        else:
            # Generate from title + URL
            title = job.get('title', '')
            url = job.get('apply_url', result.url)
            canonical_text = f"{title}|{url}".lower()
            job['canonical_hash'] = hashlib.md5(canonical_text.encode()).hexdigest()
        
        # Status
        job['status'] = 'active'
        
        # Timestamps
        job['fetched_at'] = datetime.utcnow()
        job['last_seen_at'] = datetime.utcnow()
        
        return job
    
    def _parse_date(self, date_str: Any) -> Optional[datetime]:
        """Parse date string to datetime."""
        if not date_str:
            return None
        
        if isinstance(date_str, datetime):
            return date_str
        
        if isinstance(date_str, str):
            # Try ISO format first
            try:
                return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            except:
                pass
            
            # Try common formats
            for fmt in ['%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%d/%m/%Y', '%m/%d/%Y']:
                try:
                    return datetime.strptime(date_str, fmt)
                except:
                    continue
        
        return None
    
    def _ensure_shadow_table(self, cursor):
        """Ensure shadow table exists (create if not)."""
        try:
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS {self.shadow_table} (LIKE {self.jobs_table} INCLUDING ALL)
            """)
            logger.debug(f"Ensured shadow table {self.shadow_table} exists")
        except Exception as e:
            logger.warning(f"Could not create shadow table (may already exist): {e}")
    
    def insert_job(self, result: ExtractionResult, source_id: Optional[str] = None,
                   org_name: Optional[str] = None, shadow: Optional[bool] = None) -> Dict[str, Any]:
        """
        Insert a single extracted job into the database.
        
        Args:
            result: ExtractionResult object
            source_id: Optional source ID
            org_name: Optional organization name
            shadow: Override shadow mode (default: use instance setting)
        
        Returns:
            Dict with status: {success: bool, job_id: Optional[str], error: Optional[str]}
        """
        if not self.use_storage:
            logger.debug("Storage disabled, skipping insertion")
            return {'success': False, 'job_id': None, 'error': 'Storage disabled'}
        
        shadow_mode = shadow if shadow is not None else self.shadow_mode
        table_name = f"{self.jobs_table}_side" if shadow_mode else self.jobs_table
        
        # Convert to job dict
        try:
            job = self._extract_result_to_job_dict(result, source_id, org_name)
        except Exception as e:
            logger.error(f"Failed to convert ExtractionResult to job dict: {e}")
            return {'success': False, 'job_id': None, 'error': str(e)}
        
        # Validate required fields
        if not job.get('title') or not job.get('apply_url'):
            error = f"Missing required fields: title={bool(job.get('title'))}, url={bool(job.get('apply_url'))}"
            logger.warning(f"Skipping job insertion: {error}")
            return {'success': False, 'job_id': None, 'error': error}
        
        # Insert/update
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Check if exists
                canonical_hash = job['canonical_hash']
                cur.execute(
                    f"SELECT id FROM {table_name} WHERE canonical_hash = %s",
                    (canonical_hash,)
                )
                existing = cur.fetchone()
                
                if existing:
                    # Update existing
                    job_id = existing['id']
                    update_fields = []
                    update_values = []
                    
                    for key, value in job.items():
                        if key not in ['id', 'canonical_hash', 'created_at']:
                            update_fields.append(f"{key} = %s")
                            update_values.append(value)
                    
                    update_values.append(canonical_hash)
                    
                    # Ensure shadow table exists
                    if shadow_mode:
                        self._ensure_shadow_table(cur)
                    
                    cur.execute(
                        f"""
                        UPDATE {table_name}
                        SET {', '.join(update_fields)}, updated_at = NOW(), last_seen_at = NOW()
                        WHERE canonical_hash = %s
                        RETURNING id
                        """,
                        update_values
                    )
                    conn.commit()
                    logger.debug(f"Updated job {job_id} in {table_name}")
                    return {'success': True, 'job_id': str(job_id), 'error': None, 'action': 'updated'}
                else:
                    # Ensure shadow table exists
                    if shadow_mode:
                        self._ensure_shadow_table(cur)
                    
                    # Insert new
                    insert_fields = list(job.keys())
                    insert_placeholders = ['%s'] * len(insert_fields)
                    insert_values = [job[f] for f in insert_fields]
                    
                    cur.execute(
                        f"""
                        INSERT INTO {table_name} ({', '.join(insert_fields)})
                        VALUES ({', '.join(insert_placeholders)})
                        RETURNING id
                        """,
                        insert_values
                    )
                    result_row = cur.fetchone()
                    job_id = result_row['id']
                    conn.commit()
                    logger.debug(f"Inserted job {job_id} into {table_name}")
                    return {'success': True, 'job_id': str(job_id), 'error': None, 'action': 'inserted'}
        
        except psycopg2.IntegrityError as e:
            logger.warning(f"Integrity error inserting job: {e}")
            if conn:
                conn.rollback()
            return {'success': False, 'job_id': None, 'error': f'Integrity error: {str(e)}'}
        except Exception as e:
            logger.error(f"Error inserting job: {e}", exc_info=True)
            if conn:
                conn.rollback()
            return {'success': False, 'job_id': None, 'error': str(e)}
        finally:
            if conn:
                conn.close()
    
    def insert_jobs_batch(self, results: List[ExtractionResult], 
                         source_id: Optional[str] = None,
                         org_name: Optional[str] = None,
                         shadow: Optional[bool] = None) -> Dict[str, Any]:
        """
        Insert multiple extracted jobs in a batch.
        
        Args:
            results: List of ExtractionResult objects
            source_id: Optional source ID
            org_name: Optional organization name
            shadow: Override shadow mode
        
        Returns:
            Dict with counts: {inserted, updated, failed, total}
        """
        if not self.use_storage:
            return {'inserted': 0, 'updated': 0, 'failed': 0, 'total': len(results)}
        
        inserted = 0
        updated = 0
        failed = 0
        
        for result in results:
            status = self.insert_job(result, source_id, org_name, shadow)
            if status['success']:
                if status.get('action') == 'inserted':
                    inserted += 1
                elif status.get('action') == 'updated':
                    updated += 1
            else:
                failed += 1
        
        return {
            'inserted': inserted,
            'updated': updated,
            'failed': failed,
            'total': len(results)
        }

