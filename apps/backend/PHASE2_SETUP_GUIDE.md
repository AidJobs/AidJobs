# Phase 2 Setup Guide - Step by Step

## Step 1: Apply Database Migration

### Option A: Using Python Script (Recommended)

```bash
# Make sure SUPABASE_DB_URL is set
python apps/backend/scripts/apply_phase2_migration.py
```

### Option B: Using psql directly

```bash
# If you have psql installed
psql $SUPABASE_DB_URL -f infra/migrations/phase2_observability.sql
```

### Option C: Via Supabase Dashboard

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `infra/migrations/phase2_observability.sql`
3. Paste and run in SQL Editor

## Step 2: Verify Migration

Check that tables were created:

```sql
-- Run this in Supabase SQL Editor or psql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('raw_pages', 'extraction_logs', 'failed_inserts')
ORDER BY table_name;
```

Expected output:
```
raw_pages
extraction_logs
failed_inserts
```

## Step 3: Configure HTML Storage (Optional)

By default, HTML storage uses filesystem. To change:

**For Filesystem (default - no config needed):**
- HTML will be stored in `raw-html/` directory
- Works out of the box

**For Supabase Storage:**
```bash
export HTML_STORAGE_TYPE=supabase
export HTML_STORAGE_PATH=raw-html
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Note:** Filesystem is fine for testing. Supabase Storage is better for production.

## Step 4: Test the System

### 4.1 Run a Crawl

Trigger a crawl for any source via the admin UI or API:

```bash
# Via API (replace SOURCE_ID and get admin cookie first)
curl -X POST "http://localhost:8000/api/admin/crawl/run" \
  -H "Content-Type: application/json" \
  -H "Cookie: aidjobs_admin_session=..." \
  -d '{"source_id": "YOUR_SOURCE_ID"}'
```

### 4.2 Check Extraction Logs

```sql
-- View recent extraction logs
SELECT 
    el.id,
    el.url,
    el.status,
    el.reason,
    el.created_at,
    s.org_name
FROM extraction_logs el
LEFT JOIN sources s ON el.source_id = s.id
ORDER BY el.created_at DESC
LIMIT 10;
```

### 4.3 Check Raw Pages

```sql
-- View stored HTML pages
SELECT 
    rp.id,
    rp.url,
    rp.status,
    rp.storage_path,
    rp.content_length,
    rp.fetched_at,
    s.org_name
FROM raw_pages rp
LEFT JOIN sources s ON rp.source_id = s.id
ORDER BY rp.fetched_at DESC
LIMIT 10;
```

### 4.4 Check Failed Inserts (if any)

```sql
-- View failed inserts
SELECT 
    fi.id,
    fi.source_url,
    fi.error,
    fi.operation,
    fi.attempt_at,
    s.org_name
FROM failed_inserts fi
LEFT JOIN sources s ON fi.source_id = s.id
WHERE fi.resolved_at IS NULL
ORDER BY fi.attempt_at DESC
LIMIT 10;
```

## Step 5: Test API Endpoints

### 5.1 Get Coverage Statistics

```bash
curl -X GET "http://localhost:8000/api/admin/observability/coverage?hours=24" \
  -H "Cookie: aidjobs_admin_session=..."
```

Expected response:
```json
{
  "status": "ok",
  "data": {
    "total_extractions": 10,
    "ok_extractions": 8,
    "partial_extractions": 1,
    "empty_extractions": 1,
    "db_fail_extractions": 0,
    "total_jobs_found": 150,
    "inserted_jobs": 145,
    "failed_inserts": 3,
    "mismatch": 2,
    "mismatch_percent": 1.33,
    "health_status": "healthy",
    "hours": 24
  }
}
```

### 5.2 Get Per-Source Coverage

```bash
curl -X GET "http://localhost:8000/api/admin/observability/coverage/sources?limit=10" \
  -H "Cookie: aidjobs_admin_session=..."
```

### 5.3 Get Failed Inserts

```bash
curl -X GET "http://localhost:8000/api/admin/observability/failed-inserts?limit=20" \
  -H "Cookie: aidjobs_admin_session=..."
```

## Step 6: Verify Everything Works

### Checklist:

- [ ] Migration applied successfully (tables exist)
- [ ] Ran at least one crawl
- [ ] Extraction logs are being created
- [ ] Raw pages are being stored (check filesystem or Supabase Storage)
- [ ] API endpoints return data
- [ ] Coverage statistics show reasonable numbers

## Troubleshooting

### Migration fails with "permission denied"

- Make sure you're using the service role connection string
- Check that your database user has CREATE TABLE permissions

### No extraction logs after crawl

- Check that `extraction_logger` initialized in crawler logs
- Verify database connection is working
- Check for errors in backend logs

### HTML storage not working

- For filesystem: Check that `raw-html/` directory is writable
- For Supabase: Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
- Check backend logs for storage errors

### API endpoints return 401

- Make sure you're logged in as admin
- Check that `aidjobs_admin_session` cookie is set
- Verify `ADMIN_PASSWORD` is configured

## Next Steps After Setup

1. **Monitor Coverage** - Check `/api/admin/observability/coverage` regularly
2. **Investigate Issues** - Use failed inserts to debug problems
3. **Review Logs** - Check extraction_logs for patterns
4. **Optimize** - Use coverage data to improve extraction

## Support

If you encounter issues:
1. Check backend logs for errors
2. Verify environment variables are set
3. Test database connection directly
4. Review migration SQL for syntax errors

