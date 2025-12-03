"""
Source health scoring system for adaptive scheduling.

Calculates health scores based on:
- Success/failure rate
- Job change rate
- User engagement (views, applications)
- Recent activity
- Data quality
"""
import logging
from typing import Dict, Optional
from datetime import datetime, timedelta
import psycopg2  # type: ignore
from psycopg2.extras import RealDictCursor  # type: ignore

logger = logging.getLogger(__name__)


class SourceHealthScorer:
    """Calculate health scores for sources"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    def calculate_health_score(
        self,
        source_id: str,
        source_data: Optional[Dict] = None
    ) -> Dict:
        """
        Calculate comprehensive health score for a source.
        
        Returns:
            {
                'score': float (0-100),
                'components': {
                    'reliability': float,
                    'activity': float,
                    'quality': float,
                    'engagement': float
                },
                'priority': int (1-10, higher = more important),
                'recommended_frequency_days': float
            }
        """
        conn = self._get_db_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Get source data if not provided
                if not source_data:
                    cur.execute("""
                        SELECT id, org_name, org_type, status, consecutive_failures,
                               consecutive_nochange, last_crawled_at, last_crawl_status,
                               crawl_frequency_days
                        FROM sources
                        WHERE id::text = %s
                    """, (source_id,))
                    source_data = cur.fetchone()
                
                if not source_data:
                    return {
                        'score': 0.0,
                        'components': {},
                        'priority': 1,
                        'recommended_frequency_days': 7.0
                    }
                
                # Component 1: Reliability (based on success rate)
                reliability = self._calculate_reliability(cur, source_id, source_data)
                
                # Component 2: Activity (based on job change rate)
                activity = self._calculate_activity(cur, source_id)
                
                # Component 3: Quality (based on data quality metrics)
                quality = self._calculate_quality(cur, source_id)
                
                # Component 4: Engagement (based on user views/applications - if tracked)
                engagement = self._calculate_engagement(cur, source_id)
                
                # Weighted overall score
                overall_score = (
                    reliability * 0.35 +  # Reliability is most important
                    activity * 0.30 +      # Activity is important
                    quality * 0.20 +       # Quality matters
                    engagement * 0.15      # Engagement is nice to have
                )
                
                # Calculate priority (1-10, higher = more important)
                priority = self._calculate_priority(overall_score, source_data, activity)
                
                # Recommend frequency based on health and activity
                recommended_freq = self._recommend_frequency(
                    overall_score, activity, source_data.get('org_type')
                )
                
                return {
                    'score': round(overall_score, 2),
                    'components': {
                        'reliability': round(reliability, 2),
                        'activity': round(activity, 2),
                        'quality': round(quality, 2),
                        'engagement': round(engagement, 2)
                    },
                    'priority': priority,
                    'recommended_frequency_days': round(recommended_freq, 1)
                }
        finally:
            conn.close()
    
    def _calculate_reliability(self, cur, source_id: str, source_data: Dict) -> float:
        """Calculate reliability score (0-100) based on success rate"""
        consecutive_failures = source_data.get('consecutive_failures', 0)
        last_crawl_status = source_data.get('last_crawl_status')
        
        # Get recent crawl success rate (last 10 crawls)
        cur.execute("""
            SELECT status, COUNT(*) as count
            FROM (
                SELECT status
                FROM crawl_logs
                WHERE source_id::text = %s
                AND ran_at >= NOW() - INTERVAL '30 days'
                ORDER BY ran_at DESC
                LIMIT 10
            ) recent_logs
            GROUP BY status
        """, (source_id,))
        recent_logs = cur.fetchall()
        
        if not recent_logs:
            # No history - assume neutral
            if consecutive_failures == 0:
                return 70.0
            else:
                return max(0.0, 70.0 - (consecutive_failures * 15))
        
        # Calculate success rate
        total_crawls = sum(log['count'] for log in recent_logs)
        success_count = sum(log['count'] for log in recent_logs if log['status'] == 'ok')
        
        if total_crawls == 0:
            return 50.0
        
        success_rate = (success_count / total_crawls) * 100
        
        # Penalize consecutive failures
        if consecutive_failures > 0:
            success_rate -= (consecutive_failures * 10)
        
        return max(0.0, min(100.0, success_rate))
    
    def _calculate_activity(self, cur, source_id: str) -> float:
        """Calculate activity score (0-100) based on job change rate"""
        # Get job change rate (inserts + updates) over last 30 days
        cur.execute("""
            SELECT 
                SUM(CASE WHEN status = 'ok' THEN found ELSE 0 END) as total_found,
                SUM(CASE WHEN status = 'ok' THEN inserted ELSE 0 END) as total_inserted,
                SUM(CASE WHEN status = 'ok' THEN updated ELSE 0 END) as total_updated
            FROM crawl_logs
            WHERE source_id::text = %s
            AND ran_at >= NOW() - INTERVAL '30 days'
        """, (source_id,))
        result = cur.fetchone()
        
        if not result or not result['total_found']:
            return 0.0
        
        total_changes = (result['total_inserted'] or 0) + (result['total_updated'] or 0)
        total_found = result['total_found'] or 0
        
        # Activity score based on change rate
        # High activity: >10 changes per crawl
        # Medium: 1-10 changes
        # Low: <1 change
        
        if total_found == 0:
            return 0.0
        
        changes_per_crawl = total_changes / max(1, total_found / max(1, total_changes))
        
        if changes_per_crawl >= 10:
            return 100.0
        elif changes_per_crawl >= 1:
            return 50.0 + (changes_per_crawl * 5)  # 50-95
        else:
            return changes_per_crawl * 50  # 0-50
    
    def _calculate_quality(self, cur, source_id: str) -> float:
        """Calculate quality score (0-100) based on data quality"""
        # Check for data quality issues
        cur.execute("""
            SELECT 
                COUNT(*) as total_jobs,
                COUNT(CASE WHEN apply_url IS NULL THEN 1 END) as null_urls,
                COUNT(CASE 
                    WHEN apply_url LIKE '%/jobs%' 
                    OR apply_url LIKE '%/careers%'
                    OR apply_url LIKE '%/vacancies%'
                    THEN 1 
                END) as listing_urls
            FROM jobs
            WHERE source_id::text = %s
            AND status = 'active'
        """, (source_id,))
        result = cur.fetchone()
        
        if not result or not result['total_jobs']:
            return 50.0  # Neutral if no jobs
        
        total = result['total_jobs']
        issues = (result['null_urls'] or 0) + (result['listing_urls'] or 0)
        
        quality_score = 100.0 - ((issues / total) * 100)
        return max(0.0, min(100.0, quality_score))
    
    def _calculate_engagement(self, cur, source_id: str) -> float:
        """Calculate engagement score (0-100) based on user interaction"""
        # For now, return neutral score (50)
        # Can be enhanced later with actual view/application tracking
        return 50.0
    
    def _calculate_priority(
        self,
        health_score: float,
        source_data: Dict,
        activity_score: float
    ) -> int:
        """
        Calculate priority (1-10) for scheduling.
        
        Higher priority = crawl more frequently
        """
        base_priority = 5
        
        # Boost priority for high health scores
        if health_score >= 80:
            base_priority += 2
        elif health_score >= 60:
            base_priority += 1
        elif health_score < 30:
            base_priority -= 2
        
        # Boost priority for high activity
        if activity_score >= 70:
            base_priority += 1
        elif activity_score < 20:
            base_priority -= 1
        
        # Boost priority for UN/INGO sources (typically more valuable)
        org_type = source_data.get('org_type', '').lower()
        if org_type in ['un', 'ingo']:
            base_priority += 1
        
        return max(1, min(10, base_priority))
    
    def _recommend_frequency(
        self,
        health_score: float,
        activity_score: float,
        org_type: Optional[str]
    ) -> float:
        """Recommend crawl frequency in days"""
        from orchestrator import DEFAULT_FREQ_DAYS
        
        # Start with org type default
        base_freq = DEFAULT_FREQ_DAYS.get(org_type, 3) if org_type else 3
        
        # Adjust based on health and activity
        if health_score >= 80 and activity_score >= 70:
            # High health + high activity = crawl more frequently
            return max(0.5, base_freq - 1)
        elif health_score < 50 or activity_score < 30:
            # Low health or low activity = crawl less frequently
            return min(14, base_freq + 2)
        else:
            return base_freq

