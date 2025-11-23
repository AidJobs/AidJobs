"""
Enrichment Quality Dashboard Service.
Provides real-time metrics and quality insights.
"""
import logging
from typing import Dict, Any
import psycopg2
from psycopg2.extras import RealDictCursor

from app.db_config import db_config

logger = logging.getLogger(__name__)


def get_enrichment_quality_dashboard() -> Dict[str, Any]:
    """
    Get comprehensive enrichment quality metrics.
    
    Returns metrics including:
    - Distribution of experience levels
    - Distribution of impact domains
    - Confidence score distribution
    - Low-confidence job count
    - Review queue size
    - Success/error rates
    - Average processing metrics
    """
    conn_params = db_config.get_connection_params()
    if not conn_params:
        logger.error("[enrichment_dashboard] Database not configured")
        return {}
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        metrics = {}
        
        # Overall statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total_jobs,
                COUNT(experience_level) as jobs_with_experience,
                COUNT(impact_domain) as jobs_with_impact_domain,
                COUNT(confidence_overall) as jobs_with_confidence,
                AVG(confidence_overall) as avg_confidence,
                AVG(experience_confidence) as avg_experience_confidence,
                COUNT(CASE WHEN confidence_overall < 0.60 THEN 1 END) as low_confidence_count,
                COUNT(CASE WHEN low_confidence = TRUE THEN 1 END) as flagged_low_confidence,
                COUNT(CASE WHEN LENGTH(description_snippet) < 50 OR description_snippet IS NULL THEN 1 END) as short_desc_count
            FROM jobs
            WHERE status = 'active'
        """)
        overall = cursor.fetchone()
        metrics["overall"] = dict(overall) if overall else {}
        
        # Experience level distribution
        cursor.execute("""
            SELECT 
                experience_level,
                COUNT(*) as count,
                AVG(confidence_overall) as avg_confidence,
                AVG(experience_confidence) as avg_exp_confidence
            FROM jobs
            WHERE experience_level IS NOT NULL AND status = 'active'
            GROUP BY experience_level
            ORDER BY count DESC
        """)
        exp_levels = cursor.fetchall()
        metrics["experience_levels"] = {
            "distribution": {row["experience_level"]: row["count"] for row in exp_levels},
            "details": [dict(row) for row in exp_levels]
        }
        
        # Impact domain distribution
        cursor.execute("""
            SELECT 
                unnest(impact_domain) as domain,
                COUNT(*) as count
            FROM jobs
            WHERE impact_domain IS NOT NULL 
                AND array_length(impact_domain, 1) > 0
                AND status = 'active'
            GROUP BY domain
            ORDER BY count DESC
            LIMIT 20
        """)
        domains = cursor.fetchall()
        metrics["impact_domains"] = {
            "distribution": {row["domain"]: row["count"] for row in domains},
            "top_domains": [dict(row) for row in domains[:10]]
        }
        
        # Confidence score distribution
        cursor.execute("""
            SELECT 
                CASE
                    WHEN confidence_overall >= 0.90 THEN '0.90-1.00'
                    WHEN confidence_overall >= 0.80 THEN '0.80-0.89'
                    WHEN confidence_overall >= 0.70 THEN '0.70-0.79'
                    WHEN confidence_overall >= 0.60 THEN '0.60-0.69'
                    WHEN confidence_overall >= 0.50 THEN '0.50-0.59'
                    ELSE '<0.50'
                END as confidence_range,
                COUNT(*) as count
            FROM jobs
            WHERE confidence_overall IS NOT NULL AND status = 'active'
            GROUP BY confidence_range
            ORDER BY confidence_range DESC
        """)
        conf_dist = cursor.fetchall()
        metrics["confidence_distribution"] = {
            row["confidence_range"]: row["count"] for row in conf_dist
        }
        
        # Review queue statistics
        cursor.execute("""
            SELECT 
                status,
                COUNT(*) as count
            FROM enrichment_reviews
            GROUP BY status
        """)
        reviews = cursor.fetchall()
        metrics["review_queue"] = {
            "by_status": {row["status"]: row["count"] for row in reviews},
            "pending_count": sum(row["count"] for row in reviews if row["status"] == "pending")
        }
        
        # Recent enrichment activity (last 7 days)
        cursor.execute("""
            SELECT 
                DATE(enriched_at) as date,
                COUNT(*) as count,
                AVG(confidence_overall) as avg_confidence
            FROM jobs
            WHERE enriched_at >= NOW() - INTERVAL '7 days'
                AND enriched_at IS NOT NULL
            GROUP BY DATE(enriched_at)
            ORDER BY date DESC
        """)
        recent = cursor.fetchall()
        metrics["recent_activity"] = [dict(row) for row in recent]
        
        cursor.close()
        conn.close()
        
        return metrics
        
    except Exception as e:
        logger.error(f"[enrichment_dashboard] Failed to get dashboard metrics: {e}", exc_info=True)
        return {}

