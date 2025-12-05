# Pipeline Storage Integration Runbook

## Overview

This document describes how to use the pipeline storage integration, which automatically saves extracted jobs to the database and exposes them via read-only API endpoints.

## Architecture

```
Extractor.extract_from_html()
    ↓
ExtractionResult (with fields)
    ↓
DBInsert.insert_job() [if enabled]
    ↓
jobs table (or jobs_side for shadow mode)
    ↓
/_internal/jobs API endpoints
```

## Configuration

### Environment Variables

```bash
# Enable storage (default: false)
EXTRACTION_USE_STORAGE=true

# Shadow mode (default: true)
# When true, writes to jobs_side table instead of jobs
EXTRACTION_SHADOW_MODE=true

# Internal API key (required for read endpoints)
INTERNAL_API_KEY=your-secret-key-here

# Override jobs table name (optional)
JOBS_TABLE=jobs
```

### Default Behavior

- **Storage**: Disabled by default (`EXTRACTION_USE_STORAGE=false`)
- **Shadow Mode**: Enabled by default (`EXTRACTION_SHADOW_MODE=true`)
- **Production Writes**: Opt-in only (must explicitly enable)

## Monitoring & Alerting

### Metrics Collection

The system automatically tracks job insertion metrics for monitoring and alerting.

#### Metrics Mode

**Default (JSON Fallback):**
- Metrics are written to `/tmp/aidjobs_metrics.json` (configurable via `AIDJOBS_METRICS_FILE`)
- Tracks: `inserted`, `updated`, `skipped`, `failed` counters
- Maintains history of last 1000 operations with timestamps
- No external dependencies required

**Prometheus Mode (Optional):**
- Install `prometheus_client`: `pip install prometheus-client`
- Metrics automatically exposed as Prometheus counters:
  - `aidjobs_jobs_inserted_total`
  - `aidjobs_jobs_updated_total`
  - `aidjobs_jobs_skipped_total`
  - `aidjobs_jobs_failed_total`
- Expose metrics endpoint in your FastAPI app:
  ```python
  from prometheus_client import generate_latest
  from fastapi.responses import Response
  
  @app.get("/metrics")
  def metrics():
      return Response(content=generate_latest(), media_type="text/plain")
  ```

#### Alerting Script

The `check_insert_failure_rate.py` script monitors insertion failure rates and creates incident files when thresholds are exceeded.

**Configuration:**
- Failure rate threshold: 5% (configurable in script)
- Minimum total runs: 10 (to avoid false positives)
- Time window: Last 60 minutes

**Usage:**

```bash
# Run manually
python3 apps/backend/scripts/check_insert_failure_rate.py

# Set up cron job (every 5-15 minutes)
*/10 * * * * cd /path/to/app && python3 apps/backend/scripts/check_insert_failure_rate.py
```

**Prometheus Alerting (Alternative):**

If using Prometheus, configure Alertmanager rules instead:

```yaml
groups:
  - name: aidjobs_alerts
    rules:
      - alert: HighJobInsertionFailureRate
        expr: |
          rate(aidjobs_jobs_failed_total[5m]) / 
          (rate(aidjobs_jobs_inserted_total[5m]) + 
           rate(aidjobs_jobs_updated_total[5m]) + 
           rate(aidjobs_jobs_skipped_total[5m]) + 
           rate(aidjobs_jobs_failed_total[5m])) > 0.05
        for: 5m
        annotations:
          summary: "Job insertion failure rate exceeds 5%"
          description: "{{ $value | humanizePercentage }} of job operations are failing"
```

**Incident Files:**

When failure rate exceeds threshold, incident files are created in `apps/backend/incidents/`:
- Format: `new_extractor_insert_failure_YYYYMMDD_HHMMSS.md`
- Contains: timestamp, failure rate, metrics summary, recommended actions
- Exit code: 0 (normal), 1 (incident created)

**Verification:**

```bash
# Check metrics are being collected
python3 -c "from apps.backend.metrics import get_metrics; print(get_metrics())"

# Test alerting script
python3 apps/backend/scripts/check_insert_failure_rate.py
echo $?  # Should be 0 if no incident, 1 if incident created

# View recent incidents
ls -lt apps/backend/incidents/ | head -5
```

## Usage

### 1. Enable Storage

```python
from pipeline.extractor import Extractor

# Enable storage with shadow mode (safe for testing)
extractor = Extractor(
    db_url="postgresql://user:pass@host/db",
    enable_storage=True,  # Enable automatic insertion
    shadow_mode=True       # Use jobs_side table
)

# Extract and automatically save
result = await extractor.extract_from_html(html, url)
# Job is automatically inserted if result.is_job == True
```

### 2. Shadow Mode Testing

Shadow mode writes to a separate `jobs_side` table, allowing safe testing without affecting production data.

```sql
-- Check shadow table
SELECT COUNT(*) FROM jobs_side WHERE created_at > NOW() - INTERVAL '1 hour';

-- Compare shadow vs production
SELECT 
    (SELECT COUNT(*) FROM jobs_side) as shadow_count,
    (SELECT COUNT(*) FROM jobs) as production_count;
```

### 3. Production Deployment

When ready for production:

```bash
# Disable shadow mode
EXTRACTION_SHADOW_MODE=false

# Enable storage
EXTRACTION_USE_STORAGE=true
```

**Important**: Test thoroughly in shadow mode before disabling it.

## API Endpoints

### List Extracted Jobs

```bash
curl -H "X-Internal-Api-Key: your-key" \
  "https://api.example.com/_internal/jobs?limit=10&offset=0"
```

**Response:**
```json
{
  "status": "ok",
  "data": {
    "items": [
      {
        "url": "https://example.com/job/123",
        "canonical_id": "abc123",
        "fields": {
          "title": {"value": "Software Engineer", "source": "database", "confidence": 1.0},
          "employer": {"value": "Example Org", "source": "database", "confidence": 1.0},
          ...
        },
        "is_job": true,
        "classifier_score": 1.0
      }
    ],
    "total": 100,
    "limit": 10,
    "offset": 0,
    "shadow_mode": false
  }
}
```

### Get Single Job

```bash
curl -H "X-Internal-Api-Key: your-key" \
  "https://api.example.com/_internal/jobs/{job_id}?shadow_mode=false"
```

### Query Parameters

- `limit`: Number of results (1-100, default: 10)
- `offset`: Pagination offset (default: 0)
- `source_id`: Filter by source ID (optional)
- `shadow_mode`: Query shadow table (default: false)

## Field Mapping

ExtractionResult fields are mapped to jobs table columns:

| ExtractionResult Field | Jobs Table Column |
|------------------------|-------------------|
| `title` | `title` |
| `employer` | `org_name` |
| `location` | `location_raw` |
| `deadline` | `deadline` |
| `description` | `description_snippet` |
| `application_url` | `apply_url` |
| `posted_on` | `fetched_at` |
| `requirements` | `raw_metadata` (JSONB) |

See `config/integrations.yaml` for full mapping configuration.

## Deduplication

Jobs are deduplicated using `canonical_hash` (MD5 of `title|application_url`).

- **New job**: Inserted with new UUID
- **Existing job**: Updated (if canonical_hash matches)
- **Deleted job**: Restored and updated

## Monitoring

### Check Insertion Status

```sql
-- Recent insertions
SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour
FROM jobs_side;

-- Failed insertions (from extraction_logs)
SELECT status, COUNT(*) 
FROM extraction_logs 
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY status;
```

### Logs

The extractor logs insertion status:

```
INFO: Inserted job into database: abc-123-uuid
WARNING: Failed to insert job: Missing required fields
```

## Troubleshooting

### Storage Not Working

1. **Check environment variables:**
   ```bash
   echo $EXTRACTION_USE_STORAGE
   echo $EXTRACTION_SHADOW_MODE
   ```

2. **Check logs:**
   ```bash
   grep "DB insertion" logs/app.log
   ```

3. **Verify database connection:**
   ```python
   from pipeline.db_insert import DBInsert
   insert = DBInsert(db_url)
   # Should not raise exception
   ```

### API Returns 401

- Verify `INTERNAL_API_KEY` is set
- Check header name: `X-Internal-Api-Key` (not `Authorization`)
- Ensure key matches environment variable

### Jobs Not Appearing

1. **Check shadow mode:**
   ```sql
   SELECT COUNT(*) FROM jobs_side;
   ```

2. **Verify extraction:**
   ```python
   result = await extractor.extract_from_html(html, url)
   print(result.is_job)  # Should be True
   ```

3. **Check validation:**
   - Jobs with missing `title` or `apply_url` are skipped
   - Check `extraction_logs` for validation failures

## Rollback

### Disable Storage

```bash
# Set environment variable
EXTRACTION_USE_STORAGE=false

# Or in code
extractor = Extractor(db_url, enable_storage=False)
```

### Disable API

```bash
# Remove or unset API key
unset INTERNAL_API_KEY
```

### Clean Shadow Table

```sql
-- Only if needed (shadow table is safe to delete)
DROP TABLE IF EXISTS jobs_side;
```

## Safety Checklist

Before enabling in production:

- [ ] Tested in shadow mode for at least 48 hours
- [ ] Verified field mapping is correct
- [ ] Checked deduplication logic
- [ ] Monitored insertion success rate
- [ ] Verified API authentication
- [ ] Tested rollback procedure
- [ ] Documented any custom field mappings

## Performance

### Batch Insertion

For multiple jobs, use batch insertion:

```python
results = [result1, result2, result3]
counts = db_insert.insert_jobs_batch(results, source_id="...", org_name="...")
# Returns: {inserted: 2, updated: 1, failed: 0, total: 3}
```

### Connection Pooling

The current implementation creates a new connection per insertion. For high-volume scenarios, consider:

1. Connection pooling (e.g., `psycopg2.pool`)
2. Batch transactions
3. Async database driver (e.g., `asyncpg`)

## Related Documentation

- `apps/backend/PR_SUMMARY.md` - PR summary and changes
- `report/integration-audit.json` - Audit findings
- `config/integrations.yaml` - Field mapping configuration
- `apps/backend/pipeline/db_insert.py` - Implementation details

