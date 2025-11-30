# UNESCO Extraction Test Guide

## Option 1: Test via Diagnostic Endpoint (Recommended)

The UNESCO diagnostic endpoint is now available at:
```
GET /api/admin/crawl/diagnostics/unesco
```

### Steps to Test:

1. **Ensure you're logged in as admin** (the endpoint requires admin authentication)

2. **Test via Browser/Postman:**
   ```
   GET https://aidjobs-backend.onrender.com/api/admin/crawl/diagnostics/unesco
   ```
   Include your admin session cookie in the request.

3. **Test via Frontend Admin Panel:**
   - Navigate to your admin panel
   - The diagnostic endpoint can be called from the admin interface
   - Or add a test button in the admin UI

4. **Test via cURL (if you have admin session cookie):**
   ```bash
   curl -X GET "https://aidjobs-backend.onrender.com/api/admin/crawl/diagnostics/unesco" \
     -H "Cookie: aidjobs_admin_session=YOUR_SESSION_COOKIE" \
     -H "Content-Type: application/json"
   ```

### Expected Response:

```json
{
  "status": "ok",
  "source": {
    "id": "...",
    "org_name": "UNESCO",
    "careers_url": "https://careers.unesco.org/...",
    "source_type": "html",
    "parser_hint": null,
    "status": "active",
    "last_crawled_at": "...",
    "last_crawl_status": "...",
    "last_crawl_message": "..."
  },
  "extraction_test": {
    "html_size_bytes": 125090,
    "jobs_extracted": 15,
    "has_jobs": true,
    "sample_jobs": [
      {
        "title": "Job Title 1",
        "apply_url": "https://careers.unesco.org/job/123",
        "location": "Paris, France"
      },
      ...
    ]
  },
  "existing_jobs": {
    "total": 10,
    "sample": [...]
  },
  "recent_logs": [...]
}
```

### What to Look For:

✅ **Success Indicators:**
- `extraction_test.jobs_extracted > 0` - Jobs were found
- `extraction_test.has_jobs: true` - Extraction succeeded
- `extraction_test.sample_jobs` - Shows actual extracted jobs with titles and URLs

❌ **Failure Indicators:**
- `extraction_test.jobs_extracted: 0` - No jobs found
- `extraction_test.has_jobs: false` - Extraction failed
- Error message in response

---

## Option 2: Test via Manual Crawl

1. Go to Admin Panel → Sources
2. Find the UNESCO source
3. Click "Run Now" or trigger a crawl
4. Check the crawl logs to see if jobs were extracted

---

## Option 3: Test Locally (if dependencies installed)

If you have Python dependencies installed locally:

```bash
cd apps/backend
python scripts/test_unesco_extraction.py
```

**Note:** Requires:
- `SUPABASE_DB_URL` or `DATABASE_URL` environment variable
- Optional: `UNESCO_TEST_URL` environment variable (defaults to UNESCO careers page)
- All Python dependencies installed (`pip install -r requirements.txt`)

---

## Troubleshooting

### If extraction returns 0 jobs:

1. **Check the HTML structure:**
   - The UNESCO page might have changed
   - Page might require JavaScript (check if content loads dynamically)
   - Page might require authentication

2. **Try adding a parser_hint:**
   - Inspect the UNESCO page HTML
   - Find the CSS selector for job listings
   - Add it as `parser_hint` in the source configuration

3. **Check logs:**
   - Review the extraction logs in the diagnostic response
   - Look for which extraction pattern was attempted
   - Check for any error messages

4. **Verify URL:**
   - Ensure the UNESCO careers URL is correct
   - Test the URL manually in a browser
   - Check if the page is accessible

---

## Next Steps After Testing

1. **If extraction works:**
   - Run a full crawl for UNESCO
   - Monitor the crawl logs
   - Verify jobs are being saved to database

2. **If extraction fails:**
   - Review the diagnostic output
   - Check which extraction pattern was used
   - Consider adding a custom `parser_hint` CSS selector
   - Report the issue with the diagnostic output

