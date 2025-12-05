# Integration: Pipeline Storage & Read-Only API

## Summary

This PR integrates the extraction pipeline with database storage and exposes read-only API endpoints for extracted jobs. All changes are **non-invasive** and **opt-in** via environment variables.

## Audit Findings

See `report/integration-audit.json` for complete details.

### Key Findings

1. **Jobs table exists**: Comprehensive `jobs` table in `infra/supabase.sql` with all needed columns
2. **Insertion code exists**: `SimpleCrawler.save_jobs()` handles upserts with validation
3. **Pipeline exists**: `Extractor` class with `extract_from_html/rss/json` methods
4. **API endpoints exist**: Job search/details endpoints already available
5. **Missing**: Automatic storage integration and read-only endpoints for extracted jobs

## Changes

### 1. Database Integration (`pipeline/db_insert.py`)

- New module wrapping `save_jobs` logic with shadow mode support
- Maps `ExtractionResult` fields to `jobs` table columns
- Respects `EXTRACTION_USE_STORAGE` and `EXTRACTION_SHADOW_MODE` env vars
- Uses existing `canonical_hash` for deduplication

### 2. Pipeline Integration

- Added optional insertion hook to `Extractor` class
- Wires `db_insert` after successful extraction
- Only runs if `EXTRACTION_USE_STORAGE=true`
- Logs to `extraction_logs` table

### 3. Read-Only API (`app/pipeline_api.py`)

- New endpoints: `GET /_internal/jobs` and `GET /_internal/jobs/:id`
- Returns `ExtractionResult` schema (not jobs table format)
- Protected by `INTERNAL_API_KEY` header token
- Default: disabled (requires env var)

### 4. Configuration (`config/integrations.yaml`)

- Field mapping: `ExtractionResult` → `jobs` table
- Example: `application_url` → `apply_url`
- Allows future customization without code changes

### 5. Tests

- Unit tests: `tests/test_db_insert.py`
- Integration tests: `tests/test_pipeline_integration.py`
- Verifies shadow mode, field mapping, deduplication

### 6. Documentation (`docs/INTEGRATION_RUNBOOK.md`)

- How to enable storage
- Shadow mode instructions
- API usage examples
- Rollback steps

## Safety

- **Default**: Storage disabled (`EXTRACTION_USE_STORAGE=false`)
- **Shadow mode**: Default true (`EXTRACTION_SHADOW_MODE=true`)
- **Production writes**: Opt-in only
- **No frontend changes**: All changes backend-only
- **Backward compatible**: Existing code unchanged

## Environment Variables

```bash
# Enable storage (default: false)
EXTRACTION_USE_STORAGE=true

# Shadow mode (default: true)
EXTRACTION_SHADOW_MODE=true

# Internal API key (required for read endpoints)
INTERNAL_API_KEY=your-secret-key

# Override jobs table name (optional)
JOBS_TABLE=jobs
```

## Verification

### SQL (Shadow Mode)
```sql
SELECT COUNT(*) FROM jobs_side WHERE created_at > NOW() - INTERVAL '1 hour';
```

### API (Read Endpoints)
```bash
curl -H "X-Internal-Api-Key: your-key" \
  https://api.example.com/_internal/jobs?limit=10
```

## Testing

```bash
# Unit tests
pytest tests/test_db_insert.py -v

# Integration tests
pytest tests/test_pipeline_integration.py -v
```

## Rollback

1. Set `EXTRACTION_USE_STORAGE=false`
2. Remove `INTERNAL_API_KEY` to disable API
3. No database changes (uses existing tables)
