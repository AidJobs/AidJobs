"""
Monitoring hooks for Prometheus/StatsD.

Tracks extraction metrics for observability.
"""

import logging
from typing import Dict, Optional
from collections import defaultdict

logger = logging.getLogger(__name__)


class MetricsCollector:
    """Collects extraction metrics."""
    
    def __init__(self, enable_prometheus: bool = False, enable_statsd: bool = False):
        self.enable_prometheus = enable_prometheus
        self.enable_statsd = enable_statsd
        
        # In-memory counters (should use proper metrics backend in production)
        self.counters = defaultdict(int)
        self.gauges = defaultdict(float)
        self.histograms = defaultdict(list)
        
        # Initialize Prometheus if enabled
        if enable_prometheus:
            try:
                from prometheus_client import Counter, Gauge, Histogram
                self.prom_counter = Counter(
                    'extraction_total',
                    'Total extractions',
                    ['field', 'source', 'status']
                )
                self.prom_gauge = Gauge(
                    'extraction_confidence',
                    'Extraction confidence',
                    ['field', 'source']
                )
                self.prom_histogram = Histogram(
                    'extraction_duration_seconds',
                    'Extraction duration'
                )
            except ImportError:
                logger.warning("Prometheus client not available")
                self.enable_prometheus = False
        
        # Initialize StatsD if enabled
        if enable_statsd:
            try:
                from statsd import StatsClient
                self.statsd_client = StatsClient()
            except ImportError:
                logger.warning("StatsD client not available")
                self.enable_statsd = False
    
    def record_field_extraction(self, field_name: str, source: str, 
                               confidence: float, success: bool = True):
        """Record a field extraction."""
        status = 'success' if success else 'failure'
        
        # In-memory counter
        key = f"{field_name}:{source}:{status}"
        self.counters[key] += 1
        
        # Prometheus
        if self.enable_prometheus:
            try:
                self.prom_counter.labels(field=field_name, source=source, status=status).inc()
                if success:
                    self.prom_gauge.labels(field=field_name, source=source).set(confidence)
            except Exception as e:
                logger.debug(f"Prometheus recording failed: {e}")
        
        # StatsD
        if self.enable_statsd:
            try:
                self.statsd_client.increment(
                    f'extraction.{field_name}.{source}.{status}',
                    value=1
                )
                if success:
                    self.statsd_client.gauge(
                        f'extraction.{field_name}.{source}.confidence',
                        value=confidence
                    )
            except Exception as e:
                logger.debug(f"StatsD recording failed: {e}")
    
    def record_low_confidence(self, field_name: str, confidence: float):
        """Record low confidence extraction."""
        self.counters['low_confidence'] += 1
        
        if self.enable_prometheus:
            try:
                self.prom_counter.labels(field=field_name, source='any', status='low_confidence').inc()
            except Exception:
                pass
        
        if self.enable_statsd:
            try:
                self.statsd_client.increment('extraction.low_confidence')
            except Exception:
                pass
    
    def record_ai_call(self, success: bool = True):
        """Record AI extraction call."""
        status = 'success' if success else 'failure'
        self.counters[f'ai_call:{status}'] += 1
        
        if self.enable_statsd:
            try:
                self.statsd_client.increment(f'extraction.ai.{status}')
            except Exception:
                pass
    
    def record_playwright_failure(self, url: str):
        """Record Playwright/browser failure."""
        self.counters['playwright_failure'] += 1
        
        if self.enable_statsd:
            try:
                self.statsd_client.increment('extraction.playwright.failure')
            except Exception:
                pass
    
    def get_stats(self) -> Dict:
        """Get current statistics."""
        return {
            'counters': dict(self.counters),
            'gauges': dict(self.gauges),
            'histogram_counts': {k: len(v) for k, v in self.histograms.items()}
        }


# Global metrics instance
_metrics: Optional[MetricsCollector] = None


def get_metrics() -> MetricsCollector:
    """Get global metrics collector."""
    global _metrics
    if _metrics is None:
        _metrics = MetricsCollector(
            enable_prometheus=bool(os.getenv('ENABLE_PROMETHEUS')),
            enable_statsd=bool(os.getenv('ENABLE_STATSD'))
        )
    return _metrics


import os

