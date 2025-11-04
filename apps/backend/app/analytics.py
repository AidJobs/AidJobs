"""
Dev-only analytics module for tracking search performance and usage patterns.
"""
import time
from typing import Optional, List, Dict, Any
from collections import deque
from dataclasses import dataclass, asdict
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass
class SearchQuery:
    """Record of a single search query."""
    timestamp: str
    query: Optional[str]
    filters: Dict[str, Any]
    source: str  # 'meilisearch', 'database', 'fallback'
    total_results: int
    latency_ms: float
    page: int
    size: int


class AnalyticsTracker:
    """
    In-memory analytics tracker for dev environments.
    Tracks recent queries, latency, and hit rates.
    """
    
    def __init__(self, max_queries: int = 100):
        self.max_queries = max_queries
        self.queries: deque[SearchQuery] = deque(maxlen=max_queries)
        self.enabled = False
    
    def enable(self):
        """Enable analytics tracking (dev-only)."""
        self.enabled = True
        logger.info("[analytics] Analytics tracking enabled")
    
    def track_search(
        self,
        query: Optional[str],
        filters: Dict[str, Any],
        source: str,
        total_results: int,
        latency_ms: float,
        page: int = 1,
        size: int = 20,
    ):
        """Track a search query execution."""
        if not self.enabled:
            return
        
        search_query = SearchQuery(
            timestamp=datetime.utcnow().isoformat(),
            query=query,
            filters=filters,
            source=source,
            total_results=total_results,
            latency_ms=round(latency_ms, 2),
            page=page,
            size=size,
        )
        
        self.queries.append(search_query)
        
        # Log the query details
        filter_summary = ", ".join(
            f"{k}={v}" for k, v in filters.items() if v is not None
        )
        logger.info(
            f"[analytics] search: q={query!r} filters=[{filter_summary}] "
            f"source={source} total={total_results} latency={latency_ms:.2f}ms"
        )
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get aggregated metrics from tracked queries."""
        if not self.enabled or len(self.queries) == 0:
            return {
                "enabled": self.enabled,
                "last_20_queries": [],
                "avg_latency_ms": 0,
                "meili_hit_rate": 0,
                "db_fallback_rate": 0,
                "total_tracked": 0,
            }
        
        queries_list = list(self.queries)
        last_20 = queries_list[-20:]
        
        # Calculate metrics
        total_queries = len(queries_list)
        avg_latency = sum(q.latency_ms for q in queries_list) / total_queries
        
        meili_count = sum(1 for q in queries_list if q.source == "meilisearch")
        db_count = sum(1 for q in queries_list if q.source == "database")
        fallback_count = sum(1 for q in queries_list if q.source == "fallback")
        
        meili_hit_rate = (meili_count / total_queries * 100) if total_queries > 0 else 0
        db_fallback_rate = (
            (db_count + fallback_count) / total_queries * 100
        ) if total_queries > 0 else 0
        
        return {
            "enabled": True,
            "last_20_queries": [
                {
                    "timestamp": q.timestamp,
                    "query": q.query,
                    "filters": q.filters,
                    "source": q.source,
                    "total_results": q.total_results,
                    "latency_ms": q.latency_ms,
                    "page": q.page,
                    "size": q.size,
                }
                for q in last_20
            ],
            "avg_latency_ms": round(avg_latency, 2),
            "meili_hit_rate": round(meili_hit_rate, 2),
            "db_fallback_rate": round(db_fallback_rate, 2),
            "total_tracked": total_queries,
            "source_breakdown": {
                "meilisearch": meili_count,
                "database": db_count,
                "fallback": fallback_count,
            },
        }


# Global analytics tracker instance
analytics_tracker = AnalyticsTracker()
