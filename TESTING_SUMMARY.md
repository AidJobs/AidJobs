# API Source Framework - Testing Summary

## Quick Start 🚀

### 1. Test with Simple Public API (5 minutes)

**Step 1:** Go to `/admin/sources` and click "Add Source"

**Step 2:** Fill in:
- **Source Type**: `api`
- **Careers URL**: `https://jsonplaceholder.typicode.com/posts`
- **Parser Hint** (JSON):
```json
{
  "v": 1,
  "base_url": "https://jsonplaceholder.typicode.com",
  "path": "/posts",
  "method": "GET",
  "auth": {"type": "none"},
  "data_path": "$",
  "map": {
    "title": "title",
    "description_snippet": "body"
  },
  "success_codes": [200]
}
```

**Step 3:** Click "Create Source"

**Step 4:** Click "Test" → Should show success with job count

**Step 5:** Click "Simulate" → Should show 3 normalized jobs

**Step 6:** Click "Run Crawl" → Should fetch and store jobs

**Step 7:** Verify jobs in database and search results

## Testing Endpoints

### 1. Test Endpoint
**URL:** `POST /api/admin/sources/{source_id}/test`

**What it does:**
- Validates v1 schema
- Checks for missing secrets
- Makes test API call (1 page only)
- Returns job count and sample IDs

**Response (Success):**
```json
{
  "ok": true,
  "status": 200,
  "host": "api.example.com",
  "count": 10,
  "first_ids": ["id1", "id2", ...],
  "headers_sanitized": {},
  "message": "Successfully fetched 10 jobs"
}
```

**Response (Error - Missing Secrets):**
```json
{
  "ok": false,
  "status": 0,
  "error": "Missing required secrets: EXAMPLE_API_KEY",
  "missing_secrets": ["EXAMPLE_API_KEY"]
}
```

### 2. Simulate Endpoint
**URL:** `POST /api/admin/sources/{source_id}/simulate_extract`

**What it does:**
- Fetches jobs from API
- Normalizes jobs (maps fields, applies transforms)
- Returns first 3 normalized jobs

**Response:**
```json
{
  "ok": true,
  "count": 10,
  "sample": [
    {
      "title": "Job Title",
      "apply_url": "https://...",
      "location_raw": "City, Country",
      "description_snippet": "...",
      "org_name": "Organization Name",
      ...
    },
    ...
  ]
}
```

## Example Configurations

### 1. Public API (No Auth)
```json
{
  "v": 1,
  "base_url": "https://api.example.com",
  "path": "/jobs",
  "method": "GET",
  "auth": {"type": "none"},
  "data_path": "data",
  "map": {
    "title": "title",
    "apply_url": "url"
  }
}
```

### 2. API with Query Parameter Auth
```json
{
  "v": 1,
  "base_url": "https://api.example.com",
  "path": "/v1/jobs",
  "method": "GET",
  "auth": {
    "type": "query",
    "query_name": "api_key",
    "token": "{{SECRET:EXAMPLE_API_KEY}}"
  },
  "data_path": "data.items",
  "map": {
    "title": "title",
    "apply_url": "url"
  }
}
```

### 3. API with Bearer Token
```json
{
  "v": 1,
  "base_url": "https://api.example.com",
  "path": "/jobs",
  "method": "GET",
  "auth": {
    "type": "bearer",
    "token": "{{SECRET:API_TOKEN}}"
  },
  "data_path": "results",
  "map": {
    "title": "job_title",
    "apply_url": "application_url"
  }
}
```

### 4. API with POST Request
```json
{
  "v": 1,
  "base_url": "https://api.example.com",
  "path": "/v1/jobs/search",
  "method": "POST",
  "auth": {
    "type": "bearer",
    "token": "{{SECRET:API_TOKEN}}"
  },
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "profile": "list",
    "limit": 100,
    "offset": 0
  },
  "pagination": {
    "type": "offset",
    "offset_param": "offset",
    "limit_param": "limit",
    "page_size": 100
  },
  "data_path": "data",
  "map": {
    "title": "title",
    "apply_url": "url"
  }
}
```

## Environment Variables

Set these in your backend environment:

```bash
# For API key auth
export EXAMPLE_API_KEY="your-api-key"

# For bearer token auth
export API_TOKEN="your-bearer-token"

# For basic auth
export API_USER="your-username"
export API_PASS="your-password"
```

## Field Mapping Examples

### Simple Fields
```json
{
  "map": {
    "title": "title",
    "apply_url": "url"
  }
}
```

### Nested Fields (Dot Notation)
```json
{
  "map": {
    "title": "title",
    "org_name": "organization.name",
    "country": "location.country"
  }
}
```

### Array Fields
```json
{
  "map": {
    "title": "title",
    "mission_tags": "tags[0]",
    "city": "location.city[0]"
  }
}
```

### JSONPath
```json
{
  "map": {
    "title": "$.title",
    "org_name": "$.organization[0].name"
  }
}
```

## Pagination Examples

### Offset Pagination
```json
{
  "pagination": {
    "type": "offset",
    "offset_param": "offset",
    "limit_param": "limit",
    "page_size": 50,
    "max_pages": 20
  }
}
```

### Page Pagination
```json
{
  "pagination": {
    "type": "page",
    "page_param": "page",
    "limit_param": "limit",
    "page_size": 25,
    "max_pages": 40
  }
}
```

### Cursor Pagination
```json
{
  "pagination": {
    "type": "cursor",
    "cursor_param": "cursor",
    "cursor_path": "meta.next_cursor",
    "page_size": 100
  }
}
```

## Verification Steps

1. **Check Test Endpoint:**
   - Click "Test" button
   - Should return success with job count

2. **Check Simulate Endpoint:**
   - Click "Simulate" button
   - Should return 3 normalized jobs

3. **Check Crawl:**
   - Click "Run Crawl" button
   - Check `/admin/crawl` for logs
   - Verify `found`, `inserted`, `updated` counts

4. **Check Database:**
   ```sql
   SELECT COUNT(*) FROM jobs WHERE source_id = 'your-source-id';
   SELECT title, apply_url FROM jobs LIMIT 5;
   ```

5. **Check Search:**
   - Go to main search page
   - Search for jobs
   - Verify jobs appear

## Troubleshooting

### ❌ "Missing required secrets"
**Solution:** Set environment variable in backend:
```bash
export SECRET_NAME="your-secret-value"
```

### ❌ "Invalid JSON in parser_hint"
**Solution:** Validate JSON syntax using a JSON validator.

### ❌ "No items found at data_path"
**Solution:** 
- Check API response structure
- Try different `data_path` values
- Use browser DevTools to inspect API response

### ❌ Jobs not appearing
**Solution:**
1. Check if crawl completed
2. Check database
3. Check Meilisearch status
4. Run reindex if needed

## Files to Reference

- `QUICK_TEST.md` - Quick 5-minute test guide
- `TEST_STEPS.md` - Detailed step-by-step guide
- `API_SOURCE_TESTING_GUIDE.md` - Comprehensive testing guide
- `test_api_sources.json` - Example configurations

## Success Criteria ✅

- [x] Can create API source with v1 schema
- [x] Test endpoint validates and returns success
- [x] Simulate endpoint returns normalized jobs
- [x] Crawl successfully fetches and stores jobs
- [x] Jobs appear in database and search
- [x] Authentication works
- [x] Pagination works
- [x] Field mapping works
- [x] Error handling works

## Next Steps

1. Test with real APIs (ReliefWeb, etc.)
2. Test incremental fetching (since parameter)
3. Wait for Phase 2 (transforms, throttling, presets)

