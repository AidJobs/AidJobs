#!/usr/bin/env python3
"""
Alerting script to check job insertion failure rate.
Creates incident files if failure rate exceeds threshold.
"""
import os
import sys
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from metrics import get_metrics
except ImportError:
    print("ERROR: Could not import metrics module")
    sys.exit(1)

# Configuration
FAILURE_RATE_THRESHOLD = 0.05  # 5% failure rate
MIN_TOTAL_RUNS = 10
INCIDENTS_DIR = Path(__file__).parent.parent / "incidents"
INCIDENTS_DIR.mkdir(exist_ok=True)

# Prometheus endpoint (if available)
PROMETHEUS_ENDPOINT = os.getenv("PROMETHEUS_ENDPOINT", "http://localhost:9090")


def query_prometheus_metrics() -> Optional[Dict]:
    """Query Prometheus for metrics if available."""
    try:
        import requests
        
        # Query for last 60 minutes
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(minutes=60)
        
        queries = {
            'inserted': 'aidjobs_jobs_inserted_total',
            'updated': 'aidjobs_jobs_updated_total',
            'skipped': 'aidjobs_jobs_skipped_total',
            'failed': 'aidjobs_jobs_failed_total'
        }
        
        results = {}
        for key, query in queries.items():
            try:
                response = requests.get(
                    f"{PROMETHEUS_ENDPOINT}/api/v1/query",
                    params={
                        'query': f'increase({query}[60m])',
                        'time': end_time.timestamp()
                    },
                    timeout=5
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get('status') == 'success' and data.get('data', {}).get('result'):
                        # Sum all values
                        total = sum(float(r['value'][1]) for r in data['data']['result'])
                        results[key] = int(total)
                    else:
                        results[key] = 0
                else:
                    results[key] = 0
            except Exception as e:
                print(f"Warning: Could not query Prometheus for {key}: {e}")
                results[key] = 0
        
        return results
    except ImportError:
        return None
    except Exception as e:
        print(f"Warning: Prometheus query failed: {e}")
        return None


def calculate_failure_rate_from_json(metrics_data: Dict, minutes: int = 60) -> tuple:
    """Calculate failure rate from JSON metrics history."""
    history = metrics_data.get('history', [])
    if not history:
        return 0.0, 0, 0, 0, 0
    
    # Filter to last N minutes
    cutoff_time = datetime.utcnow() - timedelta(minutes=minutes)
    
    recent_entries = []
    for entry in history:
        try:
            entry_time = datetime.fromisoformat(entry['timestamp'].replace('Z', '+00:00'))
            if entry_time >= cutoff_time:
                recent_entries.append(entry)
        except Exception:
            continue
    
    # Aggregate counts
    inserted = sum(e['count'] for e in recent_entries if e['type'] == 'inserted')
    updated = sum(e['count'] for e in recent_entries if e['type'] == 'updated')
    skipped = sum(e['count'] for e in recent_entries if e['type'] == 'skipped')
    failed = sum(e['count'] for e in recent_entries if e['type'] == 'failed')
    
    total_operations = inserted + updated + skipped + failed
    
    if total_operations == 0:
        return 0.0, total_operations, inserted, updated, skipped, failed
    
    failure_rate = failed / total_operations
    return failure_rate, total_operations, inserted, updated, skipped, failed


def create_incident(failure_rate: float, total_ops: int, inserted: int, updated: int, skipped: int, failed: int):
    """Create an incident file."""
    timestamp = datetime.utcnow()
    incident_file = INCIDENTS_DIR / f"new_extractor_insert_failure_{timestamp.strftime('%Y%m%d_%H%M%S')}.md"
    
    content = f"""# Job Insertion Failure Alert

**Timestamp:** {timestamp.isoformat()}Z
**Failure Rate:** {failure_rate:.2%} ({failed} failures out of {total_ops} total operations)
**Threshold:** {FAILURE_RATE_THRESHOLD:.2%}

## Metrics Summary

- **Total Operations:** {total_ops}
- **Inserted:** {inserted}
- **Updated:** {updated}
- **Skipped:** {skipped}
- **Failed:** {failed}

## Recommended Actions

1. **Investigate Recent Errors:**
   - Check application logs for SQL errors or validation failures
   - Review `failed_inserts` table in database
   - Check for recent code deployments or configuration changes

2. **Check Logs:**
   - Review crawler logs for extraction errors
   - Check database connection issues
   - Verify schema changes haven't broken inserts

3. **Consider Rollback:**
   - If using new extractor, consider rolling back to previous version
   - Check if specific sources are failing (review by source_id)

4. **Re-run Failed Inserts:**
   - After fixing root cause, consider re-running failed_inserts
   - Use backfill script if available

## Next Steps

- Monitor failure rate after remediation
- If failure rate continues, escalate to development team
- Document root cause in this incident file
"""
    
    with open(incident_file, 'w') as f:
        f.write(content)
    
    print(f"⚠️  INCIDENT CREATED: {incident_file}")
    return incident_file


def main():
    """Main alerting logic."""
    print("Checking job insertion failure rate...")
    
    metrics_data = get_metrics()
    
    if metrics_data.get('mode') == 'prometheus':
        # Try to query Prometheus
        prom_data = query_prometheus_metrics()
        if prom_data:
            total_ops = prom_data.get('inserted', 0) + prom_data.get('updated', 0) + \
                       prom_data.get('skipped', 0) + prom_data.get('failed', 0)
            failed = prom_data.get('failed', 0)
            
            if total_ops == 0:
                print("✓ No operations in last 60 minutes")
                return 0
            
            failure_rate = failed / total_ops if total_ops > 0 else 0.0
            
            print(f"Metrics (last 60m): inserted={prom_data.get('inserted', 0)}, "
                  f"updated={prom_data.get('updated', 0)}, skipped={prom_data.get('skipped', 0)}, "
                  f"failed={failed}")
            print(f"Failure rate: {failure_rate:.2%} ({failed}/{total_ops})")
            
            if failure_rate > FAILURE_RATE_THRESHOLD and total_ops >= MIN_TOTAL_RUNS:
                create_incident(
                    failure_rate, total_ops,
                    prom_data.get('inserted', 0), prom_data.get('updated', 0),
                    prom_data.get('skipped', 0), failed
                )
                return 1
            else:
                print("✓ Failure rate within acceptable threshold")
                return 0
        else:
            print("⚠️  Prometheus mode enabled but query failed, falling back to JSON")
            # Fall through to JSON mode
    
    # JSON fallback mode
    failure_rate, total_ops, inserted, updated, skipped, failed = calculate_failure_rate_from_json(metrics_data, minutes=60)
    
    if total_ops == 0:
        print("✓ No operations in last 60 minutes")
        return 0
    
    print(f"Metrics (last 60m): inserted={inserted}, updated={updated}, skipped={skipped}, failed={failed}")
    print(f"Failure rate: {failure_rate:.2%} ({failed}/{total_ops})")
    
    if failure_rate > FAILURE_RATE_THRESHOLD and total_ops >= MIN_TOTAL_RUNS:
        create_incident(failure_rate, total_ops, inserted, updated, skipped, failed)
        return 1
    else:
        print("✓ Failure rate within acceptable threshold")
        return 0


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)

