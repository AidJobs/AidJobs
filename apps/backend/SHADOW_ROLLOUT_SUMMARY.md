# Shadow Rollout Implementation Summary

## Branch
`fix/shadow-rollout-domains-20250105-200000`

## What Was Implemented

### 1. Rollout Configuration (`core/rollout_config.py`)
- `RolloutConfig` class manages rollout settings
- Domain allowlist filtering
- Rollout percentage control (0-100%)
- Shadow mode enforcement
- Singleton pattern for global access

### 2. SimpleCrawler Integration
- Added rollout check before extraction
- Uses new `pipeline.extractor.Extractor` for allowed domains
- Falls back to existing extraction if not in allowlist
- Logs when new extractor is used

### 3. Smoke Test Script (`scripts/smoke_test_new_extractor.py`)
- Collects test pages from allowed domains
- Runs new extractor on each page
- Generates comprehensive report with:
  - Field extraction success rates
  - Low confidence count
  - Example extractions (first 20)
  - Incorrect examples (top 10)
- Saves snapshots to `snapshots/new_extractor_side/`
- Limits AI calls to 200

### 4. ExtractionResult Enhancement
- Added `get_overall_confidence()` method
- Computes average confidence from all extracted fields

### 5. Documentation
- `docs/SHADOW_ROLLOUT_ENV_VARS.md` - Complete guide for environment variables
- Updated `env.example` with rollout config

## Environment Variables Required

### Render (Backend) - Required

```bash
EXTRACTION_USE_NEW_EXTRACTOR=true
EXTRACTION_SHADOW_MODE=true
EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org
EXTRACTION_ROLLOUT_PERCENT=100
EXTRACTION_SMOKE_LIMIT=50
```

### Vercel (Frontend) - Not Required
No frontend changes needed for shadow rollout.

## How It Works

1. **Domain Check**: When `SimpleCrawler` processes a URL, it checks if the domain is in `EXTRACTION_DOMAIN_ALLOWLIST`
2. **Rollout Percentage**: If domain matches, checks rollout percentage (hash-based selection)
3. **New Extractor**: If selected, uses `pipeline.extractor.Extractor` instead of default extraction
4. **Shadow Mode**: All extracted jobs are written to `jobs_side` table (if `EXTRACTION_SHADOW_MODE=true`)
5. **Fallback**: If new extractor fails or domain not in allowlist, uses existing extraction

## Safety Features

✅ **Shadow Mode**: Default `true` - writes to `jobs_side` table, not production
✅ **Domain Limited**: Only processes URLs from allowlist
✅ **Rollout Control**: Can start with 10% and gradually increase
✅ **Error Handling**: Falls back to existing extraction on errors
✅ **Logging**: Clear logs when new extractor is used

## Running Smoke Test

```bash
cd apps/backend
python scripts/smoke_test_new_extractor.py
```

Report will be saved to: `apps/backend/report/smoke_new.json`

## Next Steps

1. **Set Environment Variables in Render**:
   - Add the 5 environment variables listed above
   - Wait for Render to redeploy

2. **Run Smoke Test Locally**:
   ```bash
   cd apps/backend
   python scripts/smoke_test_new_extractor.py
   ```

3. **Review Report**:
   - Check `report/smoke_new.json`
   - Review field extraction success rates
   - Check incorrect examples

4. **Verify Shadow Table**:
   ```sql
   SELECT COUNT(*) FROM jobs_side;
   SELECT * FROM jobs_side LIMIT 10;
   ```

5. **Monitor Logs**:
   - Look for "Using NEW pipeline extractor" messages
   - Check for any errors

6. **After Testing**:
   - If results are good, increase rollout percentage or add more domains
   - When ready for production, set `EXTRACTION_SHADOW_MODE=false`

## PR Information

**Title**: `chore: shadow rollout new extractor for selected domains + smoke test`

**Files Changed**:
- `apps/backend/core/rollout_config.py` (new)
- `apps/backend/crawler_v2/simple_crawler.py` (modified)
- `apps/backend/pipeline/extractor.py` (modified)
- `apps/backend/pipeline/integration.py` (modified)
- `apps/backend/scripts/smoke_test_new_extractor.py` (new)
- `apps/backend/docs/SHADOW_ROLLOUT_ENV_VARS.md` (new)
- `apps/backend/report/smoke_new.json` (placeholder)
- `env.example` (updated)

**Report Location**: `apps/backend/report/smoke_new.json` (after running smoke test)

