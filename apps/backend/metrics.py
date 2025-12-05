"""
Lightweight metrics helper for job insertion monitoring.
Supports Prometheus if available, falls back to JSON file metrics.
"""
import os
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import Prometheus client
try:
    from prometheus_client import Counter
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False
    Counter = None

# Metrics file path (fallback mode)
METRICS_FILE = Path(os.getenv("AIDJOBS_METRICS_FILE", "/tmp/aidjobs_metrics.json"))

# Prometheus counters (if available)
if PROMETHEUS_AVAILABLE:
    jobs_inserted = Counter('aidjobs_jobs_inserted_total', 'Total jobs inserted')
    jobs_updated = Counter('aidjobs_jobs_updated_total', 'Total jobs updated')
    jobs_skipped = Counter('aidjobs_jobs_skipped_total', 'Total jobs skipped')
    jobs_failed = Counter('aidjobs_jobs_failed_total', 'Total jobs failed')
else:
    jobs_inserted = None
    jobs_updated = None
    jobs_skipped = None
    jobs_failed = None


def _load_json_metrics() -> dict:
    """Load metrics from JSON file."""
    if not METRICS_FILE.exists():
        return {
            'inserted': 0,
            'updated': 0,
            'skipped': 0,
            'failed': 0,
            'history': []
        }
    
    try:
        with open(METRICS_FILE, 'r') as f:
            data = json.load(f)
            # Ensure all keys exist
            for key in ['inserted', 'updated', 'skipped', 'failed', 'history']:
                if key not in data:
                    data[key] = 0 if key != 'history' else []
            return data
    except Exception as e:
        logger.warning(f"Error loading metrics file: {e}, starting fresh")
        return {
            'inserted': 0,
            'updated': 0,
            'skipped': 0,
            'failed': 0,
            'history': []
        }


def _save_json_metrics(data: dict):
    """Save metrics to JSON file."""
    try:
        # Ensure directory exists
        METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
        
        with open(METRICS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving metrics file: {e}")


def _add_to_history(data: dict, metric_type: str, count: int):
    """Add a timestamped entry to history (keep last 1000 entries)."""
    if 'history' not in data:
        data['history'] = []
    
    data['history'].append({
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'type': metric_type,
        'count': count
    })
    
    # Keep only last 1000 entries
    if len(data['history']) > 1000:
        data['history'] = data['history'][-1000:]


def incr_inserted(n: int = 1):
    """Increment inserted jobs counter."""
    if n <= 0:
        return
    
    if PROMETHEUS_AVAILABLE and jobs_inserted:
        jobs_inserted.inc(n)
    else:
        data = _load_json_metrics()
        data['inserted'] = data.get('inserted', 0) + n
        _add_to_history(data, 'inserted', n)
        _save_json_metrics(data)


def incr_updated(n: int = 1):
    """Increment updated jobs counter."""
    if n <= 0:
        return
    
    if PROMETHEUS_AVAILABLE and jobs_updated:
        jobs_updated.inc(n)
    else:
        data = _load_json_metrics()
        data['updated'] = data.get('updated', 0) + n
        _add_to_history(data, 'updated', n)
        _save_json_metrics(data)


def incr_skipped(n: int = 1):
    """Increment skipped jobs counter."""
    if n <= 0:
        return
    
    if PROMETHEUS_AVAILABLE and jobs_skipped:
        jobs_skipped.inc(n)
    else:
        data = _load_json_metrics()
        data['skipped'] = data.get('skipped', 0) + n
        _add_to_history(data, 'skipped', n)
        _save_json_metrics(data)


def incr_failed(n: int = 1):
    """Increment failed jobs counter."""
    if n <= 0:
        return
    
    if PROMETHEUS_AVAILABLE and jobs_failed:
        jobs_failed.inc(n)
    else:
        data = _load_json_metrics()
        data['failed'] = data.get('failed', 0) + n
        _add_to_history(data, 'failed', n)
        _save_json_metrics(data)


def get_metrics() -> dict:
    """Get current metrics (for alerting script)."""
    if PROMETHEUS_AVAILABLE:
        # If Prometheus is available, we'd need to query it via HTTP
        # For now, return a placeholder - alerting script will handle Prometheus queries
        return {
            'mode': 'prometheus',
            'note': 'Query Prometheus endpoint directly for metrics'
        }
    else:
        data = _load_json_metrics()
        return {
            'mode': 'json',
            'inserted': data.get('inserted', 0),
            'updated': data.get('updated', 0),
            'skipped': data.get('skipped', 0),
            'failed': data.get('failed', 0),
            'history': data.get('history', [])
        }

