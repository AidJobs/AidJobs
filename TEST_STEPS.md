# Step-by-Step Testing Guide

## Prerequisites ✅

1. **Backend is running** (check `http://localhost:8000/api/healthz`)
2. **Frontend is running** (check `http://localhost:5000`)
3. **You have admin access** (can access `/admin/sources`)

## Test 1: Simple Public API (No Authentication)

### Step 1: Navigate to Admin Sources
1. Open browser: `http://localhost:5000/admin/sources`
2. Click **"Add Source"** button

### Step 2: Fill in the Form
1. **Organization Name**: `Test API Source`
2. **Careers URL**: `https://jsonplaceholder.typicode.com/posts`
3. **Source Type**: Select `api` from dropdown
4. **Organization Type**: (leave empty or select)
5. **Crawl Frequency (days)**: `3`
6. **Parser Hint**: Paste this JSON (switch to textarea since source_type is 'api'):
```json
{
  "v": 1,
  "base_url": "https://jsonplaceholder.typicode.com",
  "path": "/posts",
  "method": "GET",
  "auth": {
    "type": "none"
  },
  "headers": {},
  "query": {
    "_limit": 10
  },
  "pagination": {
    "type": "offset",
    "offset_param": "_start",
    "limit_param": "_limit",
    "page_size": 10,
    "max_pages": 1
  },
  "data_path": "$",
  "map": {
    "title": "title",
    "description_snippet": "body"
  },
  "success_codes": [200]
}
```
7. **Time Window**: (leave empty - not needed for API sources)

### Step 3: Create the Source
1. Click **"Create Source"** button
2. You should see a success toast: "Source created and queued for crawl"
3. The source should appear in the sources list

### Step 4: Test the Source
1. Find your source in the list
2. Click the **"Test"** button (should be next to the source)
3. **Expected Result:**
   ```json
   {
     "ok": true,
     "status": 200,
     "host": "jsonplaceholder.typicode.com",
     "count": 10,
     "first_ids": [...],
     "headers_sanitized": {},
     "message": "Successfully fetched 10 jobs"
   }
   ```

### Step 5: Simulate Extraction
1. Click the **"Simulate"** button
2. **Expected Result:**
   ```json
   {
     "ok": true,
     "count": 10,
     "sample": [
       {
         "title": "sunt aut facere repellat...",
         "description_snippet": "quia et suscipit...",
         "org_name": "Test API Source",
         ...
       },
       ...
     ]
   }
   ```

### Step 6: Run a Crawl
1. Click the **"Run Crawl"** button
2. Wait for the crawl to complete (check `/admin/crawl` for status)
3. **Expected Result:**
   - Crawl status shows "completed"
   - Jobs are inserted into database
   - Jobs appear in search results

### Step 7: Verify Results
1. **Check Database:**
   - Go to your database
   - Run: `SELECT COUNT(*) FROM jobs WHERE source_id = 'your-source-id';`
   - Should show 10 jobs (or however many were fetched)

2. **Check Search:**
   - Go to main search page: `http://localhost:5000`
   - Search for jobs
   - Verify jobs from API source appear

3. **Check Crawl Logs:**
   - Go to `/admin/crawl`
   - Find your source in the logs
   - Verify: `found: 10`, `inserted: 10`, `updated: 0`, `skipped: 0`

## Test 2: API with Authentication

### Step 1: Set Environment Variable
**In your backend environment** (Render, local, etc.):
```bash
export EXAMPLE_API_KEY="your-actual-api-key-here"
```

### Step 2: Create Source with Auth
1. Go to `/admin/sources`
2. Click "Add Source"
3. Fill in:
   - **Source Type**: `api`
   - **Careers URL**: `https://api.example.com/v1/jobs`
   - **Parser Hint**:
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
     },
     "success_codes": [200]
   }
   ```

### Step 3: Test the Source
1. Click "Test" button
2. **If secret is missing:**
   ```json
   {
     "ok": false,
     "status": 0,
     "error": "Missing required secrets: EXAMPLE_API_KEY",
     "missing_secrets": ["EXAMPLE_API_KEY"]
   }
   ```
3. **If secret is set:**
   - Should return success with job count

## Test 3: Error Handling

### Test Invalid JSON
1. Create source with invalid JSON in parser_hint
2. **Expected:** Frontend shows error: "Invalid JSON in parser_hint. Please check the syntax."

### Test Wrong Schema Version
1. Create source with `{"v": 2, ...}`
2. **Expected:** Frontend shows error: "API sources must use v1 schema ({"v": 1, ...})"

### Test Missing Secrets
1. Create source with `{{SECRET:MISSING_KEY}}`
2. Don't set the environment variable
3. Click "Test"
4. **Expected:** Error showing missing secrets

### Test Invalid API URL
1. Create source with invalid API URL
2. Click "Test"
3. **Expected:** Error with status code or connection error

## Test 4: Pagination

### Test Offset Pagination
```json
{
  "pagination": {
    "type": "offset",
    "offset_param": "skip",
    "limit_param": "take",
    "page_size": 50,
    "max_pages": 20
  }
}
```

### Test Page Pagination
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

### Test Cursor Pagination
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

## Test 5: Field Mapping

### Simple Mapping
```json
{
  "map": {
    "title": "title",
    "apply_url": "url"
  }
}
```

### Nested Mapping
```json
{
  "map": {
    "title": "title",
    "org_name": "organization.name",
    "country": "location.country"
  }
}
```

### Array Mapping
```json
{
  "map": {
    "title": "title",
    "mission_tags": "tags[0]",
    "city": "location.city[0]"
  }
}
```

## Common Issues

### ❌ "Missing required secrets"
**Fix:** Set the environment variable in your backend:
```bash
export SECRET_NAME="your-secret-value"
```

### ❌ "Invalid JSON in parser_hint"
**Fix:** Validate JSON syntax using a JSON validator.

### ❌ "No items found at data_path"
**Fix:** 
1. Check API response structure
2. Try different `data_path` values
3. Use browser DevTools to inspect API response

### ❌ Jobs not appearing
**Fix:**
1. Check if crawl completed
2. Check database: `SELECT COUNT(*) FROM jobs WHERE source_id = '...'`
3. Check Meilisearch: `/api/search/status`
4. Run reindex: `/admin/search/reindex`

## Success Criteria ✅

- [x] Can create API source with v1 schema
- [x] Test endpoint validates schema and returns success
- [x] Simulate endpoint returns normalized jobs
- [x] Crawl successfully fetches and stores jobs
- [x] Jobs appear in database
- [x] Jobs appear in search results
- [x] Authentication works (query, bearer, header)
- [x] Pagination works (offset, page, cursor)
- [x] Field mapping works (simple, nested, array)
- [x] Error handling works (missing secrets, invalid JSON)

## Next Steps

1. Test with real APIs (ReliefWeb, etc.)
2. Test incremental fetching (since parameter)
3. Test with different authentication methods
4. Test with POST requests
5. Wait for Phase 2 (transforms, throttling, presets)

## Support

If you encounter issues:
1. Check backend logs for detailed error messages
2. Check browser console for frontend errors
3. Verify environment variables are set correctly
4. Test API endpoint manually (using curl or Postman)
5. Check API documentation for required parameters

