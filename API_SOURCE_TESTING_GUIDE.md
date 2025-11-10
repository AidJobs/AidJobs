# API Source Framework - Testing Guide

## Overview
This guide walks you through testing the Phase 1 API Source framework implementation.

## Prerequisites

1. **Backend running** - Ensure the backend is running and accessible
2. **Frontend running** - Ensure the frontend is running on `http://localhost:5000`
3. **Database connected** - Ensure database connection is configured
4. **Admin access** - You need admin credentials to access `/admin/sources`

## Step 1: Set Up Environment Variables

For testing, you'll need to set up environment variables for secrets (if your API requires authentication).

### Example: Set API Key Secret
```bash
# Linux/Mac
export RELIEFWEB_API_KEY="your-api-key-here"

# Windows PowerShell
$env:RELIEFWEB_API_KEY="your-api-key-here"

# Windows CMD
set RELIEFWEB_API_KEY=your-api-key-here
```

### For Backend (Render/Production)
Add environment variables in your backend hosting platform (Render, etc.):
- `RELIEFWEB_API_KEY` (if testing ReliefWeb)
- `API_TOKEN` (for generic APIs)
- `API_USER` and `API_PASS` (for basic auth)

## Step 2: Test with a Simple Public API (No Auth)

Let's start with a simple public API that doesn't require authentication.

### Example: JSONPlaceholder (Test API)
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

**Steps:**
1. Go to `/admin/sources`
2. Click "Add Source"
3. Select `source_type: "api"`
4. Set `careers_url: "https://jsonplaceholder.typicode.com/posts"` (base URL)
5. Paste the JSON schema above into "Parser Hint"
6. Click "Create Source"
7. Click "Test" button - should return success with count
8. Click "Simulate" button - should return 3 normalized items
9. Click "Run Crawl" - should fetch and store jobs

## Step 3: Test with API Key Authentication

### Example: API with Query Parameter Auth
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
  "headers": {},
  "query": {
    "limit": 50
  },
  "pagination": {
    "type": "offset",
    "offset_param": "offset",
    "limit_param": "limit",
    "page_size": 50,
    "max_pages": 10
  },
  "data_path": "data.items",
  "map": {
    "title": "title",
    "apply_url": "url",
    "location_raw": "location",
    "description_snippet": "description"
  },
  "success_codes": [200]
}
```

**Environment Variable:**
```bash
export EXAMPLE_API_KEY="your-actual-api-key"
```

**Steps:**
1. Set the environment variable in your backend
2. Create source with the schema above
3. Test endpoint should check for missing secrets
4. If secret is missing, you'll see: `"Missing required secrets: ['EXAMPLE_API_KEY']"`
5. Once secret is set, test should succeed

## Step 4: Test with Bearer Token Authentication

### Example: API with Bearer Token
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
  "headers": {
    "Accept": "application/json"
  },
  "query": {},
  "pagination": {
    "type": "page",
    "page_param": "page",
    "limit_param": "per_page",
    "page_size": 25,
    "max_pages": 20
  },
  "data_path": "results",
  "map": {
    "title": "job_title",
    "apply_url": "application_url",
    "location_raw": "location.name",
    "description_snippet": "description"
  },
  "success_codes": [200]
}
```

## Step 5: Test with Custom Header Authentication

### Example: API with Custom Header
```json
{
  "v": 1,
  "base_url": "https://api.example.com",
  "path": "/v2/jobs",
  "method": "GET",
  "auth": {
    "type": "header",
    "header_name": "X-API-Key",
    "token": "{{SECRET:API_KEY}}"
  },
  "headers": {
    "Accept": "application/json"
  },
  "query": {},
  "data_path": "data",
  "map": {
    "title": "title",
    "apply_url": "link"
  },
  "success_codes": [200]
}
```

## Step 6: Test with POST Request

### Example: API with POST Method
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
  "query": {},
  "body": {
    "profile": "list",
    "limit": 100,
    "offset": 0
  },
  "pagination": {
    "type": "offset",
    "limit_param": "limit",
    "offset_param": "offset",
    "page_size": 100,
    "max_pages": 10
  },
  "data_path": "data",
  "map": {
    "title": "title",
    "apply_url": "url"
  },
  "success_codes": [200, 201]
}
```

## Step 7: Test Pagination

### Offset Pagination
```json
{
  "pagination": {
    "type": "offset",
    "offset_param": "skip",
    "limit_param": "take",
    "page_size": 50,
    "max_pages": 20,
    "until_empty": true
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
    "page_size": 100,
    "max_pages": 50
  }
}
```

## Step 8: Test Field Mapping

### Simple Field Mapping
```json
{
  "map": {
    "title": "title",
    "apply_url": "url",
    "location_raw": "location"
  }
}
```

### Nested Field Mapping (Dot Notation)
```json
{
  "map": {
    "title": "title",
    "org_name": "organization.name",
    "country": "location.country",
    "city": "location.city"
  }
}
```

### Array Field Mapping
```json
{
  "map": {
    "title": "title",
    "mission_tags": "tags[0]",
    "level_norm": "experience.level"
  }
}
```

### JSONPath Field Mapping
```json
{
  "map": {
    "title": "$.title",
    "org_name": "$.organization[0].name",
    "country": "$.location.country"
  }
}
```

## Step 9: Test Incremental Fetching (Since Parameter)

### Example: Since Parameter in Query
```json
{
  "since": {
    "enabled": true,
    "field": "updated_since",
    "format": "iso8601",
    "operator": ">=",
    "fallback_days": 14
  }
}
```

**Behavior:**
- First crawl: Fetches all jobs (or last 14 days if no `last_success_at`)
- Subsequent crawls: Only fetches jobs updated since `last_crawled_at`
- Format: ISO8601 (e.g., `2024-01-15T10:30:00Z`)

## Step 10: Test Error Handling

### Test Missing Secrets
1. Create source with `{{SECRET:MISSING_KEY}}`
2. Don't set the environment variable
3. Click "Test" - should return error: `"Missing required secrets: ['MISSING_KEY']"`

### Test Invalid JSON
1. Create source with invalid JSON in parser_hint
2. Frontend should show: `"Invalid JSON in parser_hint. Please check the syntax."`

### Test Invalid Schema Version
1. Create source with `{"v": 2, ...}`
2. Frontend should show: `"API sources must use v1 schema ({"v": 1, ...})"`

### Test API Errors
1. Create source with invalid API URL
2. Click "Test" - should return error with status code
3. Check logs for detailed error messages

## Step 11: Verify Results

### Check Database
```sql
-- Check if jobs were inserted
SELECT COUNT(*) FROM jobs WHERE source_id = 'your-source-id';

-- Check job data
SELECT title, apply_url, location_raw, created_at 
FROM jobs 
WHERE source_id = 'your-source-id' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Meilisearch (if enabled)
1. Go to `/admin/search/status`
2. Check `numberOfDocuments` - should include new jobs
3. Search for jobs in the frontend

### Check Crawl Logs
1. Go to `/admin/crawl`
2. Check logs for your source
3. Verify: `found`, `inserted`, `updated`, `skipped` counts

## Step 12: Test Real API - ReliefWeb Jobs (Example)

### ReliefWeb API Schema
```json
{
  "v": 1,
  "base_url": "https://api.reliefweb.int",
  "path": "/v1/jobs",
  "method": "POST",
  "auth": {
    "type": "none"
  },
  "headers": {
    "Content-Type": "application/json"
  },
  "query": {},
  "body": {
    "appname": "aidjobs",
    "profile": "list",
    "query": {
      "value": "status:open"
    },
    "limit": 100,
    "offset": 0,
    "fields": {
      "include": [
        "id",
        "title",
        "url",
        "country",
        "city",
        "theme",
        "experience",
        "date",
        "body-html"
      ]
    }
  },
  "pagination": {
    "type": "offset",
    "offset_param": "offset",
    "limit_param": "limit",
    "page_size": 100,
    "max_pages": 10,
    "until_empty": true
  },
  "since": {
    "enabled": true,
    "field": "query.value",
    "format": "iso8601",
    "operator": ">=",
    "fallback_days": 30
  },
  "data_path": "data",
  "map": {
    "id": "id",
    "title": "fields.title",
    "apply_url": "fields.url",
    "location_raw": "fields.city[0]",
    "country": "fields.country[0].name",
    "country_iso": "fields.country[0].iso3",
    "mission_tags": "fields.theme[].name",
    "level_norm": "fields.experience[0].name",
    "deadline": "fields.date.closing",
    "description_snippet": "fields.body-html"
  },
  "transforms": {
    "level_norm": {
      "map_table": {
        "Entry level": "Entry",
        "Mid level": "Mid",
        "Senior level": "Senior"
      }
    },
    "mission_tags": {
      "lower": true
    }
  },
  "success_codes": [200]
}
```

**Note:** This is a complex example. For Phase 1, basic field mapping works, but transforms (like `map_table`, `lower`) will be available in Phase 2.

## Testing Checklist

- [ ] Create API source with no auth
- [ ] Test endpoint returns success
- [ ] Simulate endpoint returns normalized jobs
- [ ] Run crawl successfully
- [ ] Jobs appear in database
- [ ] Test with API key (query parameter)
- [ ] Test with Bearer token
- [ ] Test with custom header
- [ ] Test POST request
- [ ] Test offset pagination
- [ ] Test page pagination
- [ ] Test cursor pagination
- [ ] Test field mapping (simple, nested, array)
- [ ] Test incremental fetching (since parameter)
- [ ] Test error handling (missing secrets, invalid JSON)
- [ ] Verify jobs in search results

## Common Issues and Solutions

### Issue: "Missing required secrets"
**Solution:** Set the environment variable in your backend:
```bash
export SECRET_NAME="your-secret-value"
```

### Issue: "Invalid JSON in parser_hint"
**Solution:** Validate JSON syntax using a JSON validator or paste into the textarea and check for syntax errors.

### Issue: "Non-success status" in test
**Solution:** 
1. Check API URL is correct
2. Check authentication credentials
3. Check API documentation for required parameters
4. Check if API requires specific headers

### Issue: "No items found at data_path"
**Solution:**
1. Check `data_path` matches the API response structure
2. Use browser DevTools to inspect API response
3. Try different `data_path` values (e.g., `"data"`, `"results"`, `"items"`)

### Issue: Jobs not appearing in search
**Solution:**
1. Check if Meilisearch is enabled and running
2. Check if jobs were inserted into database
3. Run reindex: `/admin/search/reindex`
4. Check Meilisearch status: `/api/search/status`

## Next Steps

After testing Phase 1, you can proceed to Phase 2 which includes:
- Data transforms (lowercase, join, date parsing, map_table)
- Throttling (rate limits, backoff)
- Enhanced error handling
- Presets endpoint
- Import/Export functionality
- Advanced UI features

## Support

If you encounter issues:
1. Check backend logs for detailed error messages
2. Check browser console for frontend errors
3. Verify environment variables are set correctly
4. Test API endpoint manually (using curl or Postman)
5. Check API documentation for required parameters

