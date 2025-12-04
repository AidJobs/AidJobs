"""
Extraction Logger Module
Logs every extraction attempt with status and extracted fields for monitoring.
"""

import logging
import psycopg2
from typing import Dict, List, Optional
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class ExtractionLogger:
    """Logs extraction attempts and results"""
    
    def __init__(self, db_url: str):
        """
        Initialize extraction logger.
        
        Args:
            db_url: PostgreSQL connection string
        """
        self.db_url = db_url
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    def log_extraction(
        self,
        url: str,
        status: str,
        source_id: Optional[str] = None,
        raw_page_id: Optional[str] = None,
        reason: Optional[str] = None,
        extracted_fields: Optional[Dict] = None,
        job_count: int = 0
    ) -> Optional[str]:
        """
        Log an extraction attempt.
        
        Args:
            url: The URL that was extracted
            status: Extraction status (OK, PARTIAL, EMPTY, DB_FAIL)
            source_id: Optional source ID
            raw_page_id: Optional raw page ID (from raw_pages table)
            reason: Optional reason for status
            extracted_fields: Optional extracted fields (for analysis)
            job_count: Number of jobs extracted
            
        Returns:
            Log entry ID if successful, None otherwise
        """
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                # Prepare extracted_fields JSONB
                fields_json = None
                if extracted_fields:
                    # Limit size of extracted_fields to avoid huge JSONB
                    limited_fields = {}
                    for key, value in extracted_fields.items():
                        if isinstance(value, str) and len(value) > 500:
                            limited_fields[key] = value[:500] + "..."
                        else:
                            limited_fields[key] = value
                    fields_json = json.dumps(limited_fields)
                
                # Insert log entry
                cur.execute("""
                    INSERT INTO extraction_logs (
                        url, raw_page_id, status, reason,
                        extracted_fields, source_id, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s::JSONB, %s, NOW())
                    RETURNING id
                """, (
                    url,
                    raw_page_id,
                    status,
                    reason,
                    fields_json,
                    source_id
                ))
                
                log_id = cur.fetchone()[0]
                conn.commit()
                
                logger.debug(f"Logged extraction: {status} for {url[:50]}...")
                return str(log_id)
        
        except Exception as e:
            logger.error(f"Error logging extraction: {e}")
            if conn:
                conn.rollback()
            return None
        finally:
            if conn:
                conn.close()
    
    def log_failed_insert(
        self,
        source_url: str,
        error: str,
        source_id: Optional[str] = None,
        raw_page_id: Optional[str] = None,
        payload: Optional[Dict] = None,
        operation: str = "insert"
    ) -> Optional[str]:
        """
        Log a failed insert attempt.
        
        Args:
            source_url: The URL of the job that failed
            error: Error message
            source_id: Optional source ID
            raw_page_id: Optional raw page ID
            payload: Optional job payload that failed
            operation: Operation type (insert, update, process)
            
        Returns:
            Log entry ID if successful, None otherwise
        """
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                # Prepare payload JSONB
                payload_json = None
                if payload:
                    # Limit size of payload to avoid huge JSONB
                    limited_payload = {}
                    for key, value in payload.items():
                        if isinstance(value, str) and len(value) > 500:
                            limited_payload[key] = value[:500] + "..."
                        else:
                            limited_payload[key] = value
                    payload_json = json.dumps(limited_payload)
                
                # Insert failed insert log
                cur.execute("""
                    INSERT INTO failed_inserts (
                        source_url, error, payload, raw_page_id,
                        source_id, attempt_at, operation
                    )
                    VALUES (%s, %s, %s::JSONB, %s, %s, NOW(), %s)
                    RETURNING id
                """, (
                    source_url,
                    error,
                    payload_json,
                    raw_page_id,
                    source_id,
                    operation
                ))
                
                log_id = cur.fetchone()[0]
                conn.commit()
                
                logger.debug(f"Logged failed insert: {error[:50]}... for {source_url[:50]}...")
                return str(log_id)
        
        except Exception as e:
            logger.error(f"Error logging failed insert: {e}")
            if conn:
                conn.rollback()
            return None
        finally:
            if conn:
                conn.close()
    
    def get_extraction_stats(
        self,
        source_id: Optional[str] = None,
        hours: int = 24
    ) -> Dict:
        """
        Get extraction statistics for monitoring.
        
        Args:
            source_id: Optional source ID to filter by
            hours: Number of hours to look back
            
        Returns:
            Dictionary with statistics
        """
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                # Build query
                if source_id:
                    cur.execute("""
                        SELECT 
                            status,
                            COUNT(*) as count
                        FROM extraction_logs
                        WHERE source_id = %s
                          AND created_at >= NOW() - INTERVAL '%s hours'
                        GROUP BY status
                    """, (source_id, hours))
                else:
                    cur.execute("""
                        SELECT 
                            status,
                            COUNT(*) as count
                        FROM extraction_logs
                        WHERE created_at >= NOW() - INTERVAL '%s hours'
                        GROUP BY status
                    """, (hours,))
                
                results = cur.fetchall()
                
                stats = {
                    'ok': 0,
                    'partial': 0,
                    'empty': 0,
                    'db_fail': 0,
                    'total': 0
                }
                
                for status, count in results:
                    status_lower = status.lower()
                    if status_lower in stats:
                        stats[status_lower] = count
                    stats['total'] += count
                
                return stats
        
        except Exception as e:
            logger.error(f"Error getting extraction stats: {e}")
            return {'ok': 0, 'partial': 0, 'empty': 0, 'db_fail': 0, 'total': 0}
        finally:
            if conn:
                conn.close()
    
    def get_failed_inserts(
        self,
        source_id: Optional[str] = None,
        limit: int = 50,
        unresolved_only: bool = True
    ) -> List[Dict]:
        """
        Get failed insert logs.
        
        Args:
            source_id: Optional source ID to filter by
            limit: Maximum number of results
            unresolved_only: Only return unresolved failures
            
        Returns:
            List of failed insert dictionaries
        """
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                # Build query
                query = """
                    SELECT 
                        id, source_url, error, payload, attempt_at, operation
                    FROM failed_inserts
                    WHERE 1=1
                """
                params = []
                
                if source_id:
                    query += " AND source_id = %s"
                    params.append(source_id)
                
                if unresolved_only:
                    query += " AND resolved_at IS NULL"
                
                query += " ORDER BY attempt_at DESC LIMIT %s"
                params.append(limit)
                
                cur.execute(query, params)
                
                results = []
                for row in cur.fetchall():
                    results.append({
                        'id': str(row[0]),
                        'source_url': row[1],
                        'error': row[2],
                        'payload': row[3],
                        'attempt_at': row[4].isoformat() if row[4] else None,
                        'operation': row[5]
                    })
                
                return results
        
        except Exception as e:
            logger.error(f"Error getting failed inserts: {e}")
            return []
        finally:
            if conn:
                conn.close()

