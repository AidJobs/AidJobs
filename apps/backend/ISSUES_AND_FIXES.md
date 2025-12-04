# Issues and Fixes

## Issue 1: Quality Scores Not Showing in UI

### Problem
All jobs show "No score" in the Quality column in the admin UI.

### Root Cause
Jobs were crawled BEFORE Phase 4 was implemented, so they don't have `quality_score` values in the database.

### Solution
1. **Backfill existing jobs** - Run the backfill script to score existing jobs
2. **Re-crawl sources** - New crawls will automatically include quality scores

### How to Fix

**Option 1: Backfill Existing Jobs (Recommended)**
```bash
cd apps/backend
python scripts/backfill_quality_scores.py --limit 1000
```

**Option 2: Re-crawl Sources**
- Go to admin UI → Sources
- Select sources and click "Run Now"
- New jobs will have quality scores

---

## Issue 2: UNICEF Crawl Found 0 Jobs

### Problem
UNICEF crawl returns "No jobs found" even though jobs exist on the site.

### Root Cause
The `simple_crawler.py` was not using the plugin system. It was using the old `extract_jobs_from_html` method which doesn't have UNICEF-specific logic.

### Solution
✅ **FIXED** - Integrated plugin system into `simple_crawler.py`

Now the crawler will:
1. Try plugin system first (UNICEF plugin has priority 90)
2. Fall back to rule-based extraction if plugin fails

### How to Test

1. **Re-run UNICEF crawl:**
   - Go to admin UI → Crawl
   - Select UNICEF source
   - Click "Run Now"

2. **Check logs:**
   - Should see "Plugin extraction successful: X jobs found"
   - Or "UNICEF extraction found X jobs"

3. **Verify jobs:**
   - Check admin UI → Jobs
   - Should see UNICEF jobs with quality scores

---

## Additional Notes

### Plugin System Integration

The plugin system is now integrated into `simple_crawler.py`:
- Tries plugin system first (UNICEF, UNDP, UNESCO, etc.)
- Falls back to rule-based extraction if plugin fails
- Maintains backward compatibility

### Quality Score Backfill

The backfill script:
- Processes jobs without quality scores
- Scores them using the same logic as new crawls
- Updates database with scores, grades, and issues
- Can run in dry-run mode for testing

### Next Steps

1. ✅ Run backfill script for existing jobs
2. ✅ Re-crawl UNICEF to test plugin integration
3. ✅ Verify quality scores appear in UI
4. ✅ Test other sources (UNDP, UNESCO, etc.)

