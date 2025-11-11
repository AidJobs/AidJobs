# Quick Test Guide - API Source Framework

## 🚀 Quick Start (5 Minutes)

### Step 1: Test with a Simple Public API

1. **Open Admin Panel**
   - Go to `http://localhost:5000/admin/sources`
   - Click "Add Source"

2. **Fill in the form:**
   - **Organization Name**: "Test API"
   - **Careers URL**: `https://jsonplaceholder.typicode.com/posts`
   - **Source Type**: `api`
   - **Crawl Frequency**: `3` days
   - **Parser Hint** (paste this JSON):
   ```json
   {
     "v": 1,
     "base_url": "https://jsonplaceholder.typicode.com",
     "path": "/posts",
     "method": "GET",
     "auth": {"type": "none"},
     "headers": {},
     "query": {"_limit": 10},
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

3. **Click "Create Source"**

4. **Test the Configuration:**
   - Click the "Test" button next to the source
   - Should show: `✅ Successfully fetched X jobs`
   - Check the response for `count`, `first_ids`, etc.

5. **Simulate Extraction:**
   - Click the "Simulate" button
   - Should show 3 normalized job items
   - Verify fields are mapped correctly

6. **Run a Crawl:**
   - Click "Run Crawl" button
   - Wait for crawl to complete
   - Check `/admin/crawl` for logs
   - Verify jobs appear in database

### Step 2: Verify Results

1. **Check Database:**
   ```sql
   SELECT COUNT(*) FROM jobs WHERE source_id = 'your-source-id';
   SELECT title, description_snippet FROM jobs LIMIT 5;
   ```

2. **Check Search:**
   - Go to the main search page
   - Search for jobs
   - Verify jobs from the API source appear

3. **Check Crawl Logs:**
   - Go to `/admin/crawl`
   - Find your source in the logs
   - Verify: `found`, `inserted`, `updated` counts

## 🧪 Test Different Auth Methods

### Test Query Parameter Auth

1. **Set Environment Variable:**
   ```bash
   export EXAMPLE_API_KEY="your-api-key"
   ```

2. **Create Source with this schema:**
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

3. **Test:**
   - Click "Test" - should check for missing secrets
   - If secret missing: Error message shows which secrets are missing
   - If secret present: Test succeeds

### Test Bearer Token Auth

1. **Set Environment Variable:**
   ```bash
   export API_TOKEN="your-bearer-token"
   ```

2. **Create Source with this schema:**
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
     },
     "success_codes": [200]
   }
   ```

## 🔍 Troubleshooting

### Issue: "Missing required secrets"
**Solution:** Set the environment variable in your backend environment.

### Issue: "Invalid JSON in parser_hint"
**Solution:** Validate JSON syntax. Use a JSON validator or check for syntax errors.

### Issue: "No items found at data_path"
**Solution:** 
- Check the API response structure
- Try different `data_path` values (e.g., `"data"`, `"results"`, `"$"`)
- Use browser DevTools to inspect the API response

### Issue: Jobs not appearing
**Solution:**
1. Check if crawl completed successfully
2. Check database: `SELECT COUNT(*) FROM jobs WHERE source_id = '...'`
3. Check Meilisearch status: `/api/search/status`
4. Run reindex if needed: `/admin/search/reindex`

## 📋 Testing Checklist

- [ ] Create API source with no auth
- [ ] Test endpoint returns success
- [ ] Simulate endpoint returns normalized jobs
- [ ] Run crawl successfully
- [ ] Jobs appear in database
- [ ] Test with API key (query parameter)
- [ ] Test with Bearer token
- [ ] Test POST request
- [ ] Test pagination (offset, page, cursor)
- [ ] Test field mapping (nested, array)
- [ ] Test error handling (missing secrets, invalid JSON)

## 🎯 Next Steps

After testing Phase 1, you can:
1. Test with real APIs (ReliefWeb, etc.)
2. Test incremental fetching (since parameter)
3. Wait for Phase 2 (transforms, throttling, presets)
4. Create custom API source configurations

## 📚 More Examples

See `test_api_sources.json` for more example configurations including:
- ReliefWeb Jobs API
- APIs with different pagination methods
- APIs with POST requests
- APIs with complex field mapping

