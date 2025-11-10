# Test All Three: Database, Meilisearch, API Source Framework

This guide helps you test all three components:
1. **Database Connection** (Orchestrator)
2. **Meilisearch** (Search Indexing)
3. **API Source Framework** (Create and Test API Sources)

## Prerequisites

- Backend URL: `https://aidjobs-backend.onrender.com`
- Admin password (if testing admin endpoints)
- Python 3.11+ with `requests` library

## Quick Test Script

Run the comprehensive test script:

```bash
cd apps/backend
python scripts/test_all_three.py
```

Or set environment variables:

```bash
export BACKEND_URL="https://aidjobs-backend.onrender.com"
export ADMIN_PASSWORD="your-admin-password"
python scripts/test_all_three.py
```

## Manual Testing

### 1. Database Connection Test

**Public Endpoint:**
```bash
curl https://aidjobs-backend.onrender.com/api/db/status
```

**Expected Response:**
```json
{
  "connected": true,
  "job_count": 123
}
```

**What to Check:**
- ✅ `connected: true` - Database is accessible
- ✅ `job_count > 0` - Jobs exist in database
- ⚠️ If `connected: false`, check `SUPABASE_DB_URL` environment variable in Render

**Fix Database Connection:**
1. Check Render environment variables:
   - `SUPABASE_DB_URL` should be set (PostgreSQL connection string)
   - Format: `postgresql://user:password@host:port/database`
2. Verify Supabase database is running
3. Check network connectivity (IPv4 vs IPv6)
4. The orchestrator now has improved error handling and IPv4 resolution

### 2. Meilisearch Status Test

**Public Endpoint:**
```bash
curl https://aidjobs-backend.onrender.com/api/search/status
```

**Expected Response:**
```json
{
  "enabled": true,
  "index": {
    "name": "jobs_index",
    "stats": {
      "numberOfDocuments": 123,
      "isIndexing": false
    }
  }
}
```

**What to Check:**
- ✅ `enabled: true` - Meilisearch is configured
- ✅ `numberOfDocuments > 0` - Jobs are indexed
- ⚠️ If `numberOfDocuments: 0`, jobs need to be reindexed

**Reindex Jobs (Admin Required):**
```bash
# Login first
curl -X POST https://aidjobs-backend.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your-admin-password"}' \
  -c cookies.txt

# Reindex
curl -X POST https://aidjobs-backend.onrender.com/admin/search/reindex \
  -b cookies.txt
```

**Expected Response:**
```json
{
  "indexed": 123,
  "skipped": 0,
  "duration_ms": 1234
}
```

**Fix Meilisearch:**
1. Check Render environment variables:
   - `MEILISEARCH_URL` - Meilisearch server URL
   - `MEILISEARCH_KEY` - Meilisearch API key
   - `MEILI_INDEX_NAME` (optional) - Index name (default: `jobs_index`)
2. Verify Meilisearch server is running and accessible
3. Reindex jobs if index is empty

### 3. API Source Framework Test

**Test Presets (Admin Required):**
```bash
# Login first
curl -X POST https://aidjobs-backend.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your-admin-password"}' \
  -c cookies.txt

# Get presets
curl https://aidjobs-backend.onrender.com/admin/presets/sources \
  -b cookies.txt
```

**Expected Response:**
```json
{
  "presets": [
    {
      "name": "ReliefWeb Jobs",
      "description": "ReliefWeb Jobs API",
      "config": { ... }
    }
  ]
}
```

**Create API Source via Admin UI:**
1. Go to `https://www.aidjobs.app/admin/sources`
2. Click "Add Source"
3. Select "API" as source type
4. Choose a preset or enter JSON schema manually
5. Click "Test" to verify the API source
6. Click "Simulate" to see extracted jobs
7. Click "Save" to create the source

**Test API Source (Admin Required):**
```bash
# Create source (via admin UI or API)
# Then test it
curl -X POST https://aidjobs-backend.onrender.com/admin/sources/{source_id}/test \
  -b cookies.txt
```

**Expected Response:**
```json
{
  "ok": true,
  "status": 200,
  "count": 10,
  "first_ids": ["1", "2", "3"],
  "message": "Successfully fetched 10 jobs"
}
```

**Simulate API Source (Admin Required):**
```bash
curl -X POST https://aidjobs-backend.onrender.com/admin/sources/{source_id}/simulate_extract \
  -b cookies.txt
```

**Expected Response:**
```json
{
  "jobs": [
    {
      "id": "1",
      "title": "Job Title",
      "org_name": "Organization Name",
      ...
    }
  ],
  "count": 3
}
```

## Admin UI Testing

### Test Database Connection
1. Go to `https://www.aidjobs.app/admin`
2. Check the status dashboard
3. Look for "Database" status (should be green)

### Test Meilisearch
1. Go to `https://www.aidjobs.app/admin`
2. Check the status dashboard
3. Look for "Search" status (should be green)
4. Check document count
5. If 0 documents, go to Search Management and click "Reindex"

### Test API Source Framework
1. Go to `https://www.aidjobs.app/admin/sources`
2. Click "Add Source"
3. Select "API" as source type
4. Choose "ReliefWeb Jobs" preset
5. Click "Test" - should show job count
6. Click "Simulate" - should show 3 normalized jobs
7. Click "Save" to create the source
8. Go to "Crawl Management" and run the source
9. Check if jobs appear in search results

## Troubleshooting

### Database Connection Issues

**Error: "Network is unreachable"**
- **Cause:** IPv6 connection issue or network configuration
- **Fix:** The orchestrator now tries IPv4 resolution first
- **Check:** Verify `SUPABASE_DB_URL` is correct in Render
- **Workaround:** Disable scheduler temporarily: `AIDJOBS_DISABLE_SCHEDULER=true`

**Error: "Connection refused"**
- **Cause:** Database server is not running or not accessible
- **Fix:** Check Supabase database status
- **Check:** Verify database URL and credentials

### Meilisearch Issues

**Error: "Index not found"**
- **Cause:** Meilisearch index doesn't exist
- **Fix:** Initialize index: `POST /admin/search/init`
- **Check:** Verify `MEILISEARCH_URL` and `MEILISEARCH_KEY` are set

**Error: "Empty index"**
- **Cause:** Jobs haven't been indexed yet
- **Fix:** Reindex jobs: `POST /admin/search/reindex`
- **Check:** Verify database has jobs to index

### API Source Issues

**Error: "Invalid schema"**
- **Cause:** JSON schema doesn't match v1 format
- **Fix:** Check schema includes `"v": 1` and required fields
- **Check:** Use a preset or validate JSON schema

**Error: "Authentication failed"**
- **Cause:** API credentials are incorrect
- **Fix:** Check `{{SECRET:NAME}}` patterns in schema
- **Check:** Verify secrets are set in environment variables

**Error: "No jobs found"**
- **Cause:** API endpoint returns no data or wrong data path
- **Fix:** Check `data_path` in schema matches API response structure
- **Check:** Test API endpoint directly with curl

## Environment Variables Checklist

### Database (Required)
- `SUPABASE_DB_URL` - PostgreSQL connection string

### Meilisearch (Required)
- `MEILISEARCH_URL` - Meilisearch server URL
- `MEILISEARCH_KEY` - Meilisearch API key

### Admin (Required)
- `COOKIE_SECRET` - Session cookie secret
- `ADMIN_PASSWORD` - Admin password (optional in dev mode)
- `AIDJOBS_ENV` - Environment (dev/production)

### API Sources (Optional)
- `SECRET:*` - API secrets for sources (e.g., `SECRET:API_KEY`)

## Next Steps

After testing all three components:

1. **Database**: Verify jobs are being stored correctly
2. **Meilisearch**: Verify jobs are being indexed and searchable
3. **API Source**: Create and test API sources in admin UI

## Support

If you encounter issues:

1. Check backend logs in Render
2. Check environment variables in Render
3. Test endpoints directly with curl
4. Check admin UI for error messages
5. Review test script output for details

