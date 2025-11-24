# How to Check UNDP Crawl Status

## Problem
The local diagnostic script requires database credentials that are only available in Render, not on your local machine.

## Solution
Use the backend API endpoint that runs on Render and has access to all environment variables.

## Method 1: Using the Backend API Directly

### Step 1: Get Admin Session Cookie
First, log in to get a session cookie:

```powershell
# Login to get session cookie
$loginResponse = Invoke-WebRequest -Uri "https://aidjobs-backend.onrender.com/api/admin/login" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body '{"password":"YOUR_ADMIN_PASSWORD"}' `
    -SessionVariable session

# The session cookie is now stored in $session
```

### Step 2: Check UNDP Diagnostics
Then call the diagnostic endpoint:

```powershell
# Check UNDP crawl status
$response = Invoke-WebRequest -Uri "https://aidjobs-backend.onrender.com/api/admin/crawl/diagnostics/undp" `
    -Method GET `
    -WebSession $session

# Parse and display results
$data = $response.Content | ConvertFrom-Json
$data | ConvertTo-Json -Depth 10
```

## Method 2: Using curl (if you have it)

```bash
# Login
curl -X POST https://aidjobs-backend.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_ADMIN_PASSWORD"}' \
  -c cookies.txt

# Check UNDP diagnostics
curl -X GET https://aidjobs-backend.onrender.com/api/admin/crawl/diagnostics/undp \
  -b cookies.txt | jq
```

## Method 3: Using Browser (After Logging In)

1. Log in to your admin panel
2. Open browser DevTools (F12)
3. Go to Console tab
4. Run:

```javascript
fetch('/api/admin/crawl/diagnostics/undp', {
  credentials: 'include'
})
.then(r => r.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
```

## What the Response Shows

The endpoint returns:

- **source**: UNDP source configuration (ID, URL, status, last crawl time)
- **jobs**: 
  - Total number of jobs
  - Number of unique URLs
  - Whether duplicates exist
  - List of duplicate URLs (if any)
- **recent_logs**: Last 5 crawl logs
- **sample_jobs**: First 10 jobs with their titles and apply_urls

## Interpreting Results

### ✅ Good Signs:
- `jobs.has_duplicates: false`
- `jobs.unique_urls == jobs.total`
- Recent logs show `status: "success"`

### ⚠️ Warning Signs:
- `jobs.has_duplicates: true`
- `jobs.duplicate_count > 0`
- Recent logs show `status: "failed"`

## Next Steps

If you find duplicate URLs:
1. Check the `duplicate_urls` array to see which URLs are shared
2. Re-run the UNDP crawl: `POST /api/admin/crawl/run` with `{"source_id": "<undp_source_id>"}`
3. Check the logs to see if the extraction is working correctly

