# UNDP Next Steps - Complete Guide

## What We Fixed

✅ **Fixed UNDP extraction logic** to ensure each job gets a unique `apply_url`  
✅ **Added strict uniqueness validation** to prevent duplicate URLs  
✅ **Created diagnostic endpoint** to check UNDP crawl status  
✅ **Improved logging** to track link selection for each job  

## Step-by-Step Actions

### Step 1: Check Current UNDP Status

First, let's see the current state of UNDP jobs in your database:

**Option A: Using Browser (Easiest)**
1. Log in to your admin panel: `https://your-frontend.vercel.app/admin/login`
2. Open browser DevTools (F12)
3. Go to Console tab
4. Run:
```javascript
fetch('/api/admin/crawl/diagnostics/undp', {
  credentials: 'include'
})
.then(r => r.json())
.then(data => {
  console.log('UNDP Status:', JSON.stringify(data, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('Total Jobs:', data.jobs?.total);
  console.log('Unique URLs:', data.jobs?.unique_urls);
  console.log('Has Duplicates:', data.jobs?.has_duplicates);
  if (data.jobs?.has_duplicates) {
    console.log('⚠️ DUPLICATE URLs FOUND:', data.jobs.duplicate_urls);
  } else {
    console.log('✅ All jobs have unique URLs!');
  }
});
```

**Option B: Using PowerShell**
```powershell
# Login
$loginResponse = Invoke-WebRequest -Uri "https://aidjobs-backend.onrender.com/api/admin/login" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body '{"password":"YOUR_ADMIN_PASSWORD"}' `
    -SessionVariable session

# Check UNDP status
$response = Invoke-WebRequest -Uri "https://aidjobs-backend.onrender.com/api/admin/crawl/diagnostics/undp" `
    -Method GET `
    -WebSession $session

$data = $response.Content | ConvertFrom-Json
Write-Host "Total Jobs: $($data.jobs.total)"
Write-Host "Unique URLs: $($data.jobs.unique_urls)"
Write-Host "Has Duplicates: $($data.jobs.has_duplicates)"
```

### Step 2: Get UNDP Source ID

You need the UNDP source ID to trigger a crawl. From the diagnostic response above, you'll see:
```json
{
  "source": {
    "id": "abc123-def456-...",  // <-- This is what you need
    "org_name": "United Nations Development Programme",
    ...
  }
}
```

**OR** find it from the sources list:
1. Go to `/admin/sources` in your admin panel
2. Find "UNDP" or "United Nations Development Programme"
3. Copy the source ID

### Step 3: Re-run UNDP Crawl

Now trigger a new crawl with the fixed extraction logic:

**Option A: Using Browser Console**
```javascript
// Replace SOURCE_ID with the actual UNDP source ID from Step 2
const sourceId = "YOUR_UNDP_SOURCE_ID";

fetch('/api/admin/crawl/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ source_id: sourceId })
})
.then(r => r.json())
.then(data => {
  console.log('Crawl triggered:', data);
  console.log('⏳ Crawl is running in background. Check logs in a few minutes.');
});
```

**Option B: Using PowerShell**
```powershell
# Replace SOURCE_ID with actual UNDP source ID
$sourceId = "YOUR_UNDP_SOURCE_ID"

$response = Invoke-WebRequest -Uri "https://aidjobs-backend.onrender.com/api/admin/crawl/run" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body "{`"source_id`":`"$sourceId`"}" `
    -WebSession $session

$response.Content | ConvertFrom-Json
```

**Option C: Using Admin Panel (if available)**
1. Go to `/admin/sources`
2. Find UNDP source
3. Click "Run Crawl" or similar button (if available)

### Step 4: Wait for Crawl to Complete

- Crawl runs in the background (asynchronous)
- Usually takes 1-5 minutes depending on number of jobs
- Check logs to see progress

**Check Crawl Logs:**
```javascript
// In browser console
fetch('/api/admin/crawl/logs?source_id=YOUR_UNDP_SOURCE_ID&limit=5', {
  credentials: 'include'
})
.then(r => r.json())
.then(data => {
  console.log('Recent Crawl Logs:', data.data);
  const latest = data.data[0];
  console.log('Latest Status:', latest.status);
  console.log('Jobs Found:', latest.found);
  console.log('Jobs Inserted:', latest.inserted);
  console.log('Jobs Updated:', latest.updated);
});
```

### Step 5: Verify Results

After crawl completes, check again:

```javascript
fetch('/api/admin/crawl/diagnostics/undp', {
  credentials: 'include'
})
.then(r => r.json())
.then(data => {
  console.log('=== VERIFICATION ===');
  console.log('Total Jobs:', data.jobs.total);
  console.log('Unique URLs:', data.jobs.unique_urls);
  console.log('Has Duplicates:', data.jobs.has_duplicates);
  
  if (data.jobs.has_duplicates) {
    console.error('❌ STILL HAS DUPLICATES:', data.jobs.duplicate_urls);
  } else {
    console.log('✅ SUCCESS! All jobs have unique URLs');
    console.log('\nSample Jobs:');
    data.sample_jobs.slice(0, 5).forEach((job, i) => {
      console.log(`${i+1}. ${job.title}`);
      console.log(`   URL: ${job.apply_url}`);
    });
  }
});
```

### Step 6: Test Frontend "Apply Now" Buttons

1. Go to your frontend: `https://your-frontend.vercel.app`
2. Search for UNDP jobs
3. Click "Apply Now" on different jobs
4. **Verify**: Each job should open a different detail page URL

**What to Check:**
- ✅ Each "Apply Now" button opens a unique URL
- ✅ URLs are different for different jobs
- ✅ URLs look like job detail pages (not listing pages)
- ❌ If all buttons still go to the same page, the extraction needs more work

## Troubleshooting

### Issue: Still seeing duplicate URLs after crawl

**Possible causes:**
1. UNDP website structure changed
2. Extraction logic needs adjustment
3. Jobs actually share the same detail page (rare)

**Solutions:**
1. Check the diagnostic output - look at `duplicate_urls` array
2. Check backend logs for extraction warnings
3. Manually verify on UNDP website if those jobs really share URLs

### Issue: Crawl fails or returns 0 jobs

**Check:**
1. UNDP website is accessible
2. Source URL is correct in database
3. Backend logs for error messages
4. UNDP hasn't blocked your crawler

### Issue: "Apply Now" still goes to same page

**Verify:**
1. New crawl completed successfully
2. Jobs were updated (not just inserted)
3. Frontend is showing latest data (may need cache clear)
4. Check browser network tab to see what URL is being opened

## Expected Results

After successful crawl with fixes:

✅ **All UNDP jobs have unique `apply_url` values**  
✅ **No duplicate URLs in database**  
✅ **Each "Apply Now" button opens correct job detail page**  
✅ **Diagnostic shows `has_duplicates: false`**  

## Quick Reference

**Diagnostic Endpoint:** `GET /api/admin/crawl/diagnostics/undp`  
**Trigger Crawl:** `POST /api/admin/crawl/run` with `{"source_id": "..."}`  
**Check Logs:** `GET /api/admin/crawl/logs?source_id=...`  

## Need Help?

If issues persist:
1. Check backend logs on Render for detailed error messages
2. Use diagnostic endpoint to see exact duplicate URLs
3. Verify UNDP website structure hasn't changed
4. Check if extraction logic needs further refinement

