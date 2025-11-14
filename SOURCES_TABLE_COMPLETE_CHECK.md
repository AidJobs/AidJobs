# Complete Sources Table Requirements Check

## Database Schema (from `infra/supabase.sql`)

### All Columns in `sources` Table:
1. `id` (UUID, PRIMARY KEY) - ✅ Required
2. `org_name` (TEXT) - ✅ Optional
3. `careers_url` (TEXT, NOT NULL, UNIQUE) - ✅ Required
4. `source_type` (TEXT, DEFAULT 'html') - ✅ Required (values: 'html', 'rss', 'api')
5. `org_type` (TEXT) - ✅ Optional
6. `status` (TEXT, DEFAULT 'active') - ✅ Required
7. `crawl_frequency_days` (INT, DEFAULT 3) - ✅ Optional
8. `next_run_at` (TIMESTAMPTZ) - ✅ Required (for scheduling)
9. `last_crawled_at` (TIMESTAMPTZ) - ✅ Optional (tracking)
10. `last_crawl_status` (TEXT) - ✅ Optional (tracking)
11. `last_crawl_message` (TEXT) - ✅ Optional (error messages)
12. `consecutive_failures` (INT, DEFAULT 0) - ✅ Required (for adaptive scheduling)
13. `consecutive_nochange` (INT, DEFAULT 0) - ✅ Required (for adaptive scheduling)
14. `parser_hint` (TEXT) - ✅ Optional (for HTML/RSS selectors, API v1 schema)
15. `time_window` (TEXT) - ✅ Optional (for RSS feeds, e.g., "22:00-05:00")
16. `notes` (TEXT) - ✅ Optional (admin notes)
17. `created_at` (TIMESTAMPTZ, DEFAULT NOW()) - ✅ Auto-generated
18. `updated_at` (TIMESTAMPTZ, DEFAULT NOW()) - ✅ Auto-generated

## Usage by Source Type

### HTML Sources
**Required Fields:**
- `careers_url` (NOT NULL)
- `source_type` = 'html'

**Optional Fields:**
- `org_name` (used in job normalization)
- `org_type` (used for default crawl frequency)
- `parser_hint` (CSS selectors for job extraction)
- `crawl_frequency_days` (default: 3)
- `next_run_at` (for scheduling)
- `consecutive_failures` (for adaptive scheduling)
- `consecutive_nochange` (for adaptive scheduling)

**Used in:**
- `apps/backend/crawler/html_fetch.py`: `fetch_html_jobs(url, org_name, org_type, parser_hint)`
- `apps/backend/orchestrator.py`: `crawl_source()` for HTML type

### RSS Sources
**Required Fields:**
- `careers_url` (NOT NULL) - RSS feed URL
- `source_type` = 'rss'

**Optional Fields:**
- `org_name` (used in job normalization)
- `org_type` (used for default crawl frequency)
- `time_window` (string like "22:00-05:00" for time-based filtering)
- `crawl_frequency_days` (default: 3)
- `next_run_at` (for scheduling)
- `consecutive_failures` (for adaptive scheduling)
- `consecutive_nochange` (for adaptive scheduling)

**Used in:**
- `apps/backend/crawler/rss_fetch.py`: `fetch_rss_jobs(url, org_name, org_type, time_window_days)`
- `apps/backend/orchestrator.py`: `crawl_source()` for RSS type
- Note: `time_window` is stored as TEXT but `time_window_days` parameter is not currently used

### API Sources
**Required Fields:**
- `careers_url` (NOT NULL) - Base URL or endpoint
- `source_type` = 'api'
- `parser_hint` (REQUIRED) - Must be valid JSON v1 schema: `{"v": 1, "base_url": "...", "path": "...", ...}`

**Optional Fields:**
- `org_name` (used in job normalization)
- `org_type` (used for default crawl frequency)
- `crawl_frequency_days` (default: 3)
- `next_run_at` (for scheduling)
- `last_crawled_at` (used for incremental fetching with `since` parameter)
- `consecutive_failures` (for adaptive scheduling)
- `consecutive_nochange` (for adaptive scheduling)

**Used in:**
- `apps/backend/crawler/api_fetch.py`: `fetch_api(url, parser_hint, last_success_at)`
- `apps/backend/orchestrator.py`: `crawl_source()` for API type
- `apps/backend/app/sources.py`: `test_source()` validates JSON schema

## Backend Code Usage

### `apps/backend/app/sources.py`

**`list_sources()` SELECT:**
```sql
SELECT id::text, org_name, careers_url, source_type, org_type, status,
       crawl_frequency_days, next_run_at, last_crawled_at, last_crawl_status,
       parser_hint, time_window, consecutive_failures, consecutive_nochange,
       created_at, updated_at
FROM sources
```

**`create_source()` INSERT:**
```sql
INSERT INTO sources (
    org_name, careers_url, source_type, org_type,
    crawl_frequency_days, parser_hint, time_window,
    status, next_run_at
)
VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', NOW())
```

**`update_source()` UPDATE:**
- Updates any of: `org_name`, `careers_url`, `source_type`, `org_type`, `status`, `crawl_frequency_days`, `parser_hint`, `time_window`
- Always updates `updated_at = NOW()`

**`simulate_extract()` SELECT:**
```sql
SELECT id::text, org_name, careers_url, source_type, org_type,
       parser_hint, time_window
FROM sources
WHERE id = %s
```

### `apps/backend/orchestrator.py`

**`get_due_sources()` SELECT:**
```sql
SELECT id, org_name, careers_url, source_type, org_type,
       parser_hint, crawl_frequency_days, consecutive_failures,
       consecutive_nochange, last_crawled_at
FROM sources
WHERE status = 'active'
AND (next_run_at IS NULL OR next_run_at <= NOW())
```

**`update_source_after_crawl()` UPDATE:**
```sql
UPDATE sources SET
    last_crawled_at = NOW(),
    last_crawl_status = %s,
    last_crawl_message = %s,
    consecutive_failures = %s,
    consecutive_nochange = %s,
    next_run_at = %s,
    status = %s,
    updated_at = NOW()
WHERE id = %s
```

## Migration Status

### ✅ Already Added (via migration):
- `org_type` (TEXT)
- `notes` (TEXT)
- `time_window` (TEXT)
- `next_run_at` (TIMESTAMPTZ)
- `last_crawl_message` (TEXT)
- `consecutive_failures` (INT DEFAULT 0)
- `consecutive_nochange` (INT DEFAULT 0)

### ✅ Already in Schema (from initial CREATE TABLE):
- `id`, `org_name`, `careers_url`, `source_type`, `status`
- `crawl_frequency_days`, `last_crawled_at`, `last_crawl_status`
- `parser_hint`, `created_at`, `updated_at`

## Verification Checklist

### All Required Columns Present:
- ✅ `id` (UUID, PRIMARY KEY)
- ✅ `careers_url` (TEXT, NOT NULL, UNIQUE)
- ✅ `source_type` (TEXT, DEFAULT 'html')
- ✅ `status` (TEXT, DEFAULT 'active')
- ✅ `next_run_at` (TIMESTAMPTZ) - **CRITICAL for scheduling**
- ✅ `consecutive_failures` (INT DEFAULT 0) - **CRITICAL for adaptive scheduling**
- ✅ `consecutive_nochange` (INT DEFAULT 0) - **CRITICAL for adaptive scheduling**

### All Optional Columns Present:
- ✅ `org_name` (TEXT)
- ✅ `org_type` (TEXT)
- ✅ `crawl_frequency_days` (INT DEFAULT 3)
- ✅ `last_crawled_at` (TIMESTAMPTZ)
- ✅ `last_crawl_status` (TEXT)
- ✅ `last_crawl_message` (TEXT)
- ✅ `parser_hint` (TEXT)
- ✅ `time_window` (TEXT)
- ✅ `notes` (TEXT)
- ✅ `created_at` (TIMESTAMPTZ)
- ✅ `updated_at` (TIMESTAMPTZ)

## Potential Issues

### 1. Missing Indexes
The schema includes indexes for:
- `idx_sources_status` on `status`
- `idx_sources_next_run_at` on `next_run_at`
- `idx_sources_org_type` on `org_type`
- `idx_sources_careers_url` (UNIQUE) on `careers_url`

**Status:** ✅ All indexes are in the schema

### 2. Find & Earn Source Creation
In `apps/backend/app/find_earn.py`, sources are created with:
```sql
INSERT INTO sources (org_name, careers_url, source_type, status, notes)
VALUES (%s, %s, %s, 'active', 'Created from Find & Earn submission')
```

**Issue:** This doesn't set `next_run_at`, so sources created via Find & Earn won't be scheduled until manually updated.

**Recommendation:** Update Find & Earn to set `next_run_at = NOW()` when creating sources.

### 3. API Source Validation
The frontend validates that `parser_hint` is required and valid JSON for API sources, but the backend should also validate this.

**Status:** ✅ Backend validates in `create_source()` and `import_source()`

## Summary

**All required columns are present in the database schema and migration script.**

The migration script (`apps/backend/scripts/run_migration.py`) now includes:
- ✅ `org_type`
- ✅ `notes`
- ✅ `time_window`
- ✅ `next_run_at`
- ✅ `last_crawl_message`
- ✅ `consecutive_failures`
- ✅ `consecutive_nochange`

**No additional columns are needed for the current functionality.**

