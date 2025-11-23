# Meilisearch Troubleshooting Guide

## Understanding the URLs

### ❌ Wrong: Accessing Meilisearch directly
```
https://aidjobs-meili-dev.onrender.com/api/search/status
```
This won't work because:
- `aidjobs-meili-dev.onrender.com` is your **Meilisearch instance** (search engine)
- `/api/search/status` is a **backend endpoint** (not a Meilisearch endpoint)

### ✅ Correct: Two separate services

1. **Meilisearch Instance** (Render):
   - URL: `https://aidjobs-meili-dev.onrender.com`
   - Purpose: Search engine (used by backend)
   - Health check: `https://aidjobs-meili-dev.onrender.com/health` (Meilisearch native endpoint)

2. **Backend API** (Render):
   - URL: `https://your-backend.onrender.com` (different service)
   - Purpose: FastAPI backend that uses Meilisearch
   - Status check: `https://your-backend.onrender.com/api/search/status`

## How to Verify

### Step 1: Check Meilisearch Health (Direct)
```bash
curl https://aidjobs-meili-dev.onrender.com/health
```
Should return:
```json
{"status":"available"}
```

### Step 2: Check Backend Search Status
```bash
curl https://your-backend-url.onrender.com/api/search/status
```
Should return:
```json
{
  "enabled": true,
  "index": "jobs_index",
  "document_count": 287,
  ...
}
```

## Common Issues

### Issue 1: Meilisearch URL is wrong
**Symptom**: Backend can't connect to Meilisearch

**Check**:
1. Go to Render dashboard
2. Find your Meilisearch service
3. Check the actual URL (might be different port or path)
4. Verify it's accessible: `curl https://aidjobs-meili-dev.onrender.com/health`

### Issue 2: Master Key is wrong
**Symptom**: Backend connects but gets authentication errors

**Check**:
1. In Render, go to your Meilisearch service
2. Check Environment Variables
3. Find `MEILI_MASTER_KEY` or `MEILI_ENV_MASTER_KEY`
4. Copy the exact value

### Issue 3: Backend environment variables not set
**Symptom**: `/api/search/status` shows `"enabled": false`

**Check**:
1. Go to Render dashboard
2. Find your **backend service** (not Meilisearch service)
3. Go to Environment tab
4. Verify these are set:
   ```
   MEILI_HOST=https://aidjobs-meili-dev.onrender.com
   MEILI_MASTER_KEY=your-actual-key
   MEILI_JOBS_INDEX=jobs_index
   ```

## Finding Your Backend URL

Your backend is a **separate service** on Render. To find it:

1. Go to Render dashboard: https://dashboard.render.com
2. Look for your backend service (FastAPI/Python service)
3. The URL will be something like:
   - `https://aidjobs-backend.onrender.com`
   - `https://aidjobs-api.onrender.com`
   - Or whatever you named it

## Quick Test Commands

```bash
# 1. Test Meilisearch directly
curl https://aidjobs-meili-dev.onrender.com/health

# 2. Test backend (replace with your actual backend URL)
curl https://your-backend-url.onrender.com/api/search/status

# 3. Test backend health
curl https://your-backend-url.onrender.com/api/healthz
```

## Next Steps

1. **Find your backend URL** on Render
2. **Verify Meilisearch is accessible**: `curl https://aidjobs-meili-dev.onrender.com/health`
3. **Check backend environment variables** are set correctly
4. **Test backend search status**: `curl https://your-backend-url/api/search/status`


