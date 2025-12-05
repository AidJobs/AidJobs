"""
Unit tests for metrics module (fallback JSON mode).
"""
import os
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

# Add backend to path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from metrics import (
    incr_inserted, incr_updated, incr_skipped, incr_failed,
    get_metrics, _load_json_metrics, _save_json_metrics
)


class TestMetricsFallback(unittest.TestCase):
    """Test metrics fallback JSON mode."""
    
    def setUp(self):
        """Set up test with temporary metrics file."""
        # Create temporary file
        self.temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json')
        self.temp_file.close()
        self.metrics_file = Path(self.temp_file.name)
        
        # Patch METRICS_FILE to use temp file
        self.patcher = patch('metrics.METRICS_FILE', self.metrics_file)
        self.patcher.start()
        
        # Ensure file doesn't exist initially
        if self.metrics_file.exists():
            self.metrics_file.unlink()
    
    def tearDown(self):
        """Clean up temporary file."""
        self.patcher.stop()
        if self.metrics_file.exists():
            self.metrics_file.unlink()
    
    def test_initial_state(self):
        """Test initial metrics state."""
        data = _load_json_metrics()
        self.assertEqual(data['inserted'], 0)
        self.assertEqual(data['updated'], 0)
        self.assertEqual(data['skipped'], 0)
        self.assertEqual(data['failed'], 0)
        self.assertEqual(len(data['history']), 0)
    
    def test_increment_inserted(self):
        """Test incrementing inserted counter."""
        incr_inserted(5)
        
        data = _load_json_metrics()
        self.assertEqual(data['inserted'], 5)
        self.assertEqual(len(data['history']), 1)
        self.assertEqual(data['history'][0]['type'], 'inserted')
        self.assertEqual(data['history'][0]['count'], 5)
    
    def test_increment_all_counters(self):
        """Test incrementing all counters."""
        incr_inserted(10)
        incr_updated(5)
        incr_skipped(3)
        incr_failed(2)
        
        data = _load_json_metrics()
        self.assertEqual(data['inserted'], 10)
        self.assertEqual(data['updated'], 5)
        self.assertEqual(data['skipped'], 3)
        self.assertEqual(data['failed'], 2)
        self.assertEqual(len(data['history']), 4)
    
    def test_increment_zero_ignored(self):
        """Test that zero increments are ignored."""
        incr_inserted(0)
        incr_inserted(5)
        
        data = _load_json_metrics()
        self.assertEqual(data['inserted'], 5)
        self.assertEqual(len(data['history']), 1)  # Only one entry
    
    def test_increment_negative_ignored(self):
        """Test that negative increments are ignored."""
        incr_inserted(10)
        incr_inserted(-5)  # Should be ignored
        
        data = _load_json_metrics()
        self.assertEqual(data['inserted'], 10)
    
    def test_get_metrics(self):
        """Test get_metrics function."""
        incr_inserted(10)
        incr_updated(5)
        
        metrics = get_metrics()
        self.assertEqual(metrics['mode'], 'json')
        self.assertEqual(metrics['inserted'], 10)
        self.assertEqual(metrics['updated'], 5)
        self.assertIn('history', metrics)
    
    def test_history_limit(self):
        """Test that history is limited to 1000 entries."""
        # Add 1500 entries
        for i in range(1500):
            incr_inserted(1)
        
        data = _load_json_metrics()
        self.assertEqual(len(data['history']), 1000)
        self.assertEqual(data['inserted'], 1500)  # Total count still correct


class TestMetricsWithPrometheus(unittest.TestCase):
    """Test metrics with Prometheus available (mocked)."""
    
    @patch('metrics.PROMETHEUS_AVAILABLE', True)
    @patch('metrics.jobs_inserted')
    @patch('metrics.jobs_updated')
    @patch('metrics.jobs_skipped')
    @patch('metrics.jobs_failed')
    def test_prometheus_counters_called(self, mock_failed, mock_skipped, mock_updated, mock_inserted):
        """Test that Prometheus counters are called when available."""
        from metrics import incr_inserted, incr_updated, incr_skipped, incr_failed
        
        incr_inserted(5)
        mock_inserted.inc.assert_called_once_with(5)
        
        incr_updated(3)
        mock_updated.inc.assert_called_once_with(3)
        
        incr_skipped(2)
        mock_skipped.inc.assert_called_once_with(2)
        
        incr_failed(1)
        mock_failed.inc.assert_called_once_with(1)


if __name__ == '__main__':
    unittest.main()

