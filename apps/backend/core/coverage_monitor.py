"""
Coverage Monitoring Module
Compares discovered URLs vs inserted rows to identify extraction issues.
"""

import logging
import psycopg2
from typing import Dict, List, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class CoverageMonitor:
    """Monitors extraction coverage and identifies mismatches"""
    
    def __init__(self, db_url: str):
        """
        Initialize coverage monitor.
        
        Args:
            db_url: PostgreSQL connection string
        """
        self.db_url = db_url
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    def get_coverage_stats(
        self,
        source_id: Optional[str] = None,
        hours: int = 24
    ) -> Dict:
        """
        Get coverage statistics comparing discovered URLs vs inserted rows.
        
        Args:
            source_id: Optional source ID to filter by
            hours: Number of hours to look back
            
        Returns:
            Dictionary with coverage statistics
        """
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                # Get extraction logs (discovered URLs)
                if source_id:
                    cur.execute("""
                        SELECT 
                            COUNT(*) as total_extractions,
                            COUNT(*) FILTER (WHERE status = 'OK') as ok_extractions,
                            COUNT(*) FILTER (WHERE status = 'PARTIAL') as partial_extractions,
                            COUNT(*) FILTER (WHERE status = 'EMPTY') as empty_extractions,
                            COUNT(*) FILTER (WHERE status = 'DB_FAIL') as db_fail_extractions,
                            SUM((extracted_fields->>'job_count')::INT) as total_jobs_found
                        FROM extraction_logs
                        WHERE source_id = %s
                          AND created_at >= NOW() - INTERVAL '%s hours'
                    """, (source_id, hours))
                else:
                    cur.execute("""
                        SELECT 
                            COUNT(*) as total_extractions,
                            COUNT(*) FILTER (WHERE status = 'OK') as ok_extractions,
                            COUNT(*) FILTER (WHERE status = 'PARTIAL') as partial_extractions,
                            COUNT(*) FILTER (WHERE status = 'EMPTY') as empty_extractions,
                            COUNT(*) FILTER (WHERE status = 'DB_FAIL') as db_fail_extractions,
                            SUM((extracted_fields->>'job_count')::INT) as total_jobs_found
                        FROM extraction_logs
                        WHERE created_at >= NOW() - INTERVAL '%s hours'
                    """, (hours,))
                
                extraction_row = cur.fetchone()
                total_extractions = extraction_row[0] or 0
                ok_extractions = extraction_row[1] or 0
                partial_extractions = extraction_row[2] or 0
                empty_extractions = extraction_row[3] or 0
                db_fail_extractions = extraction_row[4] or 0
                total_jobs_found = extraction_row[5] or 0
                
                # Get inserted jobs count
                if source_id:
                    cur.execute("""
                        SELECT COUNT(*)
                        FROM jobs
                        WHERE source_id = %s
                          AND fetched_at >= NOW() - INTERVAL '%s hours'
                    """, (source_id, hours))
                else:
                    cur.execute("""
                        SELECT COUNT(*)
                        FROM jobs
                        WHERE fetched_at >= NOW() - INTERVAL '%s hours'
                    """, (hours,))
                
                inserted_jobs = cur.fetchone()[0] or 0
                
                # Get failed inserts count
                if source_id:
                    cur.execute("""
                        SELECT COUNT(*)
                        FROM failed_inserts
                        WHERE source_id = %s
                          AND attempt_at >= NOW() - INTERVAL '%s hours'
                          AND resolved_at IS NULL
                    """, (source_id, hours))
                else:
                    cur.execute("""
                        SELECT COUNT(*)
                        FROM failed_inserts
                        WHERE attempt_at >= NOW() - INTERVAL '%s hours'
                          AND resolved_at IS NULL
                    """, (hours,))
                
                failed_inserts = cur.fetchone()[0] or 0
                
                # Calculate coverage metrics
                mismatch = total_jobs_found - inserted_jobs - failed_inserts
                mismatch_percent = (mismatch / total_jobs_found * 100) if total_jobs_found > 0 else 0
                
                # Determine health status
                health_status = 'healthy'
                if mismatch_percent > 10:
                    health_status = 'critical'
                elif mismatch_percent > 5:
                    health_status = 'warning'
                elif db_fail_extractions > 0:
                    health_status = 'warning'
                
                return {
                    'total_extractions': total_extractions,
                    'ok_extractions': ok_extractions,
                    'partial_extractions': partial_extractions,
                    'empty_extractions': empty_extractions,
                    'db_fail_extractions': db_fail_extractions,
                    'total_jobs_found': total_jobs_found,
                    'inserted_jobs': inserted_jobs,
                    'failed_inserts': failed_inserts,
                    'mismatch': mismatch,
                    'mismatch_percent': round(mismatch_percent, 2),
                    'health_status': health_status,
                    'hours': hours
                }
        
        except Exception as e:
            logger.error(f"Error getting coverage stats: {e}")
            return {
                'total_extractions': 0,
                'ok_extractions': 0,
                'partial_extractions': 0,
                'empty_extractions': 0,
                'db_fail_extractions': 0,
                'total_jobs_found': 0,
                'inserted_jobs': 0,
                'failed_inserts': 0,
                'mismatch': 0,
                'mismatch_percent': 0,
                'health_status': 'unknown',
                'hours': hours
            }
        finally:
            if conn:
                conn.close()
    
    def get_source_coverage(
        self,
        limit: int = 50
    ) -> List[Dict]:
        """
        Get coverage statistics per source.
        
        Args:
            limit: Maximum number of sources to return
            
        Returns:
            List of source coverage dictionaries
        """
        conn = None
        try:
            conn = self._get_db_conn()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        s.id,
                        s.org_name,
                        s.careers_url,
                        COUNT(DISTINCT el.id) as extraction_count,
                        SUM((el.extracted_fields->>'job_count')::INT) as jobs_found,
                        COUNT(DISTINCT j.id) as jobs_inserted,
                        COUNT(DISTINCT fi.id) as failed_inserts,
                        MAX(el.created_at) as last_extraction
                    FROM sources s
                    LEFT JOIN extraction_logs el ON s.id = el.source_id
                        AND el.created_at >= NOW() - INTERVAL '24 hours'
                    LEFT JOIN jobs j ON s.id = j.source_id
                        AND j.fetched_at >= NOW() - INTERVAL '24 hours'
                    LEFT JOIN failed_inserts fi ON s.id = fi.source_id
                        AND fi.attempt_at >= NOW() - INTERVAL '24 hours'
                        AND fi.resolved_at IS NULL
                    WHERE s.status = 'active'
                    GROUP BY s.id, s.org_name, s.careers_url
                    HAVING COUNT(DISTINCT el.id) > 0
                    ORDER BY last_extraction DESC NULLS LAST
                    LIMIT %s
                """, (limit,))
                
                results = []
                for row in cur.fetchall():
                    source_id, org_name, careers_url, extraction_count, jobs_found, jobs_inserted, failed_inserts, last_extraction = row
                    
                    jobs_found = jobs_found or 0
                    jobs_inserted = jobs_inserted or 0
                    failed_inserts = failed_inserts or 0
                    
                    mismatch = jobs_found - jobs_inserted - failed_inserts
                    mismatch_percent = (mismatch / jobs_found * 100) if jobs_found > 0 else 0
                    
                    health_status = 'healthy'
                    if mismatch_percent > 10:
                        health_status = 'critical'
                    elif mismatch_percent > 5:
                        health_status = 'warning'
                    
                    results.append({
                        'source_id': str(source_id),
                        'org_name': org_name,
                        'careers_url': careers_url,
                        'extraction_count': extraction_count or 0,
                        'jobs_found': jobs_found,
                        'jobs_inserted': jobs_inserted,
                        'failed_inserts': failed_inserts,
                        'mismatch': mismatch,
                        'mismatch_percent': round(mismatch_percent, 2),
                        'health_status': health_status,
                        'last_extraction': last_extraction.isoformat() if last_extraction else None
                    })
                
                return results
        
        except Exception as e:
            logger.error(f"Error getting source coverage: {e}")
            return []
        finally:
            if conn:
                conn.close()
    
    def flag_sources_with_issues(
        self,
        mismatch_threshold: float = 5.0
    ) -> List[Dict]:
        """
        Flag sources with coverage issues.
        
        Args:
            mismatch_threshold: Percentage threshold for flagging (default 5%)
            
        Returns:
            List of sources with issues
        """
        sources = self.get_source_coverage(limit=1000)
        flagged = [
            source for source in sources
            if source['mismatch_percent'] > mismatch_threshold
            or source['health_status'] in ['critical', 'warning']
        ]
        return flagged

