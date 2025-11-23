# Meilisearch Verification Steps

## Your Services

- **Backend**: `https://aidjobs-backend.onrender.com`
- **Meilisearch**: `https://aidjobs-meili-dev.onrender.com`

## Step 1: Test Meilisearch Health

```bash
curl https://aidjobs-meili-dev.onrender.com/health
```

**Expected**: `{"status":"available"}`

## Step 2: Test Backend Search Status

```bash
curl https://aidjobs-backend.onrender.com/api/search/status
```

**Expected** (if configured correctly):
```json
{
  "enabled": true,
  "index": "jobs_index",
  "document_count": 0,
  ...
}
```

**If not configured**:
```json
{
  "enabled": false,
  "error": "Meilisearch not configured"
}
```

## Step 3: Verify Environment Variables in Render

Go to Render dashboard → Your backend service → Environment tab

**Required variables**:
```
MEILI_HOST=https://aidjobs-meili-dev.onrender.com
MEILI_MASTER_KEY=4ff5624f0a04f098bc30963d9d6c3326
MEILI_JOBS_INDEX=jobs_index
```

**OR** (newer format, both work):
```
MEILISEARCH_URL=https://aidjobs-meili-dev.onrender.com
MEILISEARCH_KEY=4ff5624f0a04f098bc30963d9d6c3326
MEILI_JOBS_INDEX=jobs_index
```

## Step 4: Restart Backend (if you just added env vars)

After setting environment variables, restart your backend service in Render.

## Step 5: Reindex Jobs

Once Meilisearch is enabled, reindex all jobs:

**Via Admin Dashboard**:
- Go to `https://aidjobs.app/admin` (or your frontend URL)
- Click "Reindex" button

**Via API**:
```bash
curl -X POST https://aidjobs-backend.onrender.com/admin/search/reindex
```

**Via Script** (if running locally):
```bash
python apps/backend/scripts/reindex_with_enrichment.py
```

## Troubleshooting

### If `/api/search/status` shows `"enabled": false`:

1. **Check environment variables are set** in Render backend service
2. **Verify Meilisearch is accessible**: `curl https://aidjobs-meili-dev.onrender.com/health`
3. **Check backend logs** in Render for connection errors
4. **Restart backend** after setting environment variables

### If Meilisearch health check fails:

1. **Check Meilisearch service** is running in Render
2. **Verify the URL** is correct
3. **Check firewall/network** restrictions


