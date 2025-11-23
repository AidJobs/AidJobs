# Meilisearch & OpenRouter Setup Guide

## Problem
Both Meilisearch and OpenRouter are not working because environment variables are not configured.

## Solution

### 1. Meilisearch Configuration

You need to set **one of these** environment variable pairs in Render:

#### Option A: New Format (Recommended)
```
MEILISEARCH_URL=https://your-meilisearch-instance.com
MEILISEARCH_KEY=your-master-key-here
```

#### Option B: Legacy Format
```
MEILI_HOST=https://your-meilisearch-instance.com
MEILI_MASTER_KEY=your-master-key-here
```

**Additional settings:**
```
MEILI_JOBS_INDEX=jobs_index
AIDJOBS_ENABLE_SEARCH=true
```

### 2. OpenRouter Configuration

Set these environment variables in Render:
```
OPENROUTER_API_KEY=your-openrouter-api-key-here
OPENROUTER_MODEL=openai/gpt-4o-mini
```

**Get your OpenRouter API key:**
1. Go to https://openrouter.ai/keys
2. Sign up or log in
3. Create a new API key
4. Copy the key and set it as `OPENROUTER_API_KEY` in Render

### 3. Setting Environment Variables in Render

1. Go to your Render dashboard
2. Select your backend service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add each variable listed above
6. Save changes
7. **Redeploy** your service (Render will automatically redeploy when you save env vars)

### 4. After Configuration

Once you've set the environment variables and redeployed:

#### For Meilisearch:
1. **Initialize the index:**
   ```bash
   POST /admin/search/init
   ```
   (Requires admin authentication)

2. **Reindex all jobs:**
   ```bash
   POST /admin/search/reindex
   ```
   (Requires admin authentication)

#### For OpenRouter:
- No additional setup needed - it will work automatically once the API key is set

### 5. Verify Configuration

Run the diagnostic script to verify everything is working:

```bash
cd apps/backend
python scripts/diagnose_meili_openrouter.py
```

Or check the status endpoints:
- `GET /api/capabilities` - Shows if search and AI are enabled
- `GET /api/search/status` - Shows Meilisearch status
- `GET /api/healthz` - General health check

### 6. Common Issues

#### Meilisearch Issues:

**"Meilisearch not configured"**
- Check that you've set either the new format (MEILISEARCH_URL + MEILISEARCH_KEY) OR legacy format (MEILI_HOST + MEILI_MASTER_KEY)
- Make sure the values are correct (no extra spaces, correct URLs)

**"Index not found"**
- Run `POST /admin/search/init` to create the index
- Then run `POST /admin/search/reindex` to populate it

**"Cannot connect to Meilisearch"**
- Verify Meilisearch is running and accessible
- Check the URL is correct (include http:// or https://)
- If using a hosted Meilisearch service, check firewall/network settings

#### OpenRouter Issues:

**"OpenRouter API key not configured"**
- Make sure `OPENROUTER_API_KEY` is set in Render
- Check for typos in the variable name
- Verify the API key is valid (get a new one from openrouter.ai/keys if needed)

**"401 Unauthorized"**
- Your API key is invalid or expired
- Get a new key from https://openrouter.ai/keys

**"Failed to connect"**
- Check your internet connection
- Verify OpenRouter service is accessible
- Check if there are any firewall restrictions

### 7. Testing

After configuration, test the services:

**Test Meilisearch:**
```bash
curl http://your-backend-url/api/search/status
```

**Test OpenRouter (via enrichment):**
```bash
# Enrich a single job (requires admin auth)
POST /admin/jobs/{job_id}/enrich
```

### 8. Quick Checklist

- [ ] Meilisearch environment variables set in Render
- [ ] OpenRouter API key set in Render
- [ ] Service redeployed after setting env vars
- [ ] Meilisearch index initialized (`/admin/search/init`)
- [ ] Jobs reindexed (`/admin/search/reindex`)
- [ ] Diagnostic script shows all green checkmarks

### 9. Need Help?

If you're still having issues:

1. Run the diagnostic script: `python apps/backend/scripts/diagnose_meili_openrouter.py`
2. Check Render logs for any error messages
3. Verify environment variables are set correctly (no typos, correct values)
4. Make sure you've redeployed after setting environment variables

