# Shadow Rollout Environment Variables

This document explains which environment variables to set for the shadow rollout of the new pipeline extractor.

## Overview

The shadow rollout allows you to test the new `pipeline.extractor` on selected domains without affecting production data. All extracted jobs are written to a shadow table (`jobs_side`) instead of the main `jobs` table.

## Environment Variables

### Required for Shadow Rollout

#### `EXTRACTION_USE_NEW_EXTRACTOR`
- **Type**: Boolean (string: `"true"` or `"false"`)
- **Default**: `"false"`
- **Description**: Enable the new pipeline extractor
- **Where to set**: Render (backend)
- **Example**: `EXTRACTION_USE_NEW_EXTRACTOR=true`

#### `EXTRACTION_SHADOW_MODE`
- **Type**: Boolean (string: `"true"` or `"false"`)
- **Default**: `"true"` (recommended for testing)
- **Description**: Write extracted jobs to shadow table (`jobs_side`) instead of production table
- **Where to set**: Render (backend)
- **Example**: `EXTRACTION_SHADOW_MODE=true`

#### `EXTRACTION_DOMAIN_ALLOWLIST`
- **Type**: String (comma-separated domains)
- **Default**: `""` (empty - no domains allowed)
- **Description**: Comma-separated list of domains to use new extractor for
- **Where to set**: Render (backend)
- **Example**: `EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org`
- **Note**: Domains are normalized (www. prefix removed, protocol removed)

#### `EXTRACTION_ROLLOUT_PERCENT`
- **Type**: Integer (0-100)
- **Default**: `0`
- **Description**: Percentage of URLs to use new extractor (0-100). 100 = all URLs in allowlist
- **Where to set**: Render (backend)
- **Example**: `EXTRACTION_ROLLOUT_PERCENT=100`

#### `EXTRACTION_SMOKE_LIMIT`
- **Type**: Integer
- **Default**: `50`
- **Description**: Maximum number of pages to process in smoke test
- **Where to set**: Render (backend) or local `.env`
- **Example**: `EXTRACTION_SMOKE_LIMIT=50`

### Optional (Already Configured)

#### `EXTRACTION_USE_STORAGE`
- **Type**: Boolean
- **Default**: `"false"`
- **Description**: Enable storage integration (for pipeline storage)
- **Where to set**: Render (backend)
- **Note**: Not required for shadow rollout, but can be enabled for testing

#### `OPENROUTER_API_KEY`
- **Type**: String
- **Default**: Not set
- **Description**: API key for OpenRouter (used by AI fallback extractor)
- **Where to set**: Render (backend)
- **Note**: Required if you want AI fallback extraction

## Where to Set Environment Variables

### Render (Backend)

1. Go to your Render dashboard
2. Select your backend service
3. Go to **Environment** tab
4. Add the following variables:

```
EXTRACTION_USE_NEW_EXTRACTOR=true
EXTRACTION_SHADOW_MODE=true
EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org
EXTRACTION_ROLLOUT_PERCENT=100
EXTRACTION_SMOKE_LIMIT=50
```

5. Click **Save Changes**
6. Render will automatically redeploy

### Vercel (Frontend)

**No environment variables needed for shadow rollout** - this is a backend-only feature.

However, if you need to configure frontend settings related to the new extractor (e.g., displaying shadow mode status), you can add:

```
NEXT_PUBLIC_EXTRACTION_SHADOW_MODE=true
```

But this is **not required** for the shadow rollout to work.

### Local Development

Add to your local `.env` file in the project root:

```bash
EXTRACTION_USE_NEW_EXTRACTOR=true
EXTRACTION_SHADOW_MODE=true
EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org
EXTRACTION_ROLLOUT_PERCENT=100
EXTRACTION_SMOKE_LIMIT=50
```

## Example Configuration

### Full Shadow Rollout (3 domains, 100% selection)

**Render Environment Variables:**
```
EXTRACTION_USE_NEW_EXTRACTOR=true
EXTRACTION_SHADOW_MODE=true
EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org
EXTRACTION_ROLLOUT_PERCENT=100
EXTRACTION_SMOKE_LIMIT=50
```

### Gradual Rollout (10% of URLs)

**Render Environment Variables:**
```
EXTRACTION_USE_NEW_EXTRACTOR=true
EXTRACTION_SHADOW_MODE=true
EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org
EXTRACTION_ROLLOUT_PERCENT=10
```

### Production Mode (after testing)

**Render Environment Variables:**
```
EXTRACTION_USE_NEW_EXTRACTOR=true
EXTRACTION_SHADOW_MODE=false
EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org
EXTRACTION_ROLLOUT_PERCENT=100
```

**⚠️ Warning**: Only set `EXTRACTION_SHADOW_MODE=false` after thorough testing!

## Running Smoke Test

After setting environment variables, run the smoke test locally:

```bash
cd apps/backend
python scripts/smoke_test_new_extractor.py
```

The report will be saved to `apps/backend/report/smoke_new.json`.

## Verifying Configuration

Check logs in Render to see if rollout config is loaded:

```
RolloutConfig: use_new=True, rollout=100%, shadow=True, domains=3, smoke_limit=50
```

If you see this log, the configuration is working correctly.

## Troubleshooting

### New extractor not being used

1. Check `EXTRACTION_USE_NEW_EXTRACTOR=true` is set
2. Check domain is in `EXTRACTION_DOMAIN_ALLOWLIST`
3. Check `EXTRACTION_ROLLOUT_PERCENT` is > 0
4. Check logs for "Using NEW pipeline extractor" message

### Jobs not appearing

1. Check `EXTRACTION_SHADOW_MODE=true` - jobs go to `jobs_side` table
2. Query shadow table: `SELECT * FROM jobs_side WHERE source_id = '...'`
3. Check extraction logs for errors

### Smoke test fails

1. Ensure database URL is set (`SUPABASE_DB_URL` or `DATABASE_URL`)
2. Check domain allowlist matches your sources
3. Check sources are active in database

