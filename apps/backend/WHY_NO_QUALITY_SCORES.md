# Why You're Seeing "No Score" in UI

## ✅ UI Changes ARE Implemented

The UI changes are **complete and correct**:
- ✅ `DataQualityBadge` component exists
- ✅ It's displayed in the jobs table
- ✅ It shows quality scores, grades, issues, etc.
- ✅ Backend returns `quality_score`, `quality_grade`, etc.

## ❌ Why You See "No Score"

**The jobs in your database don't have quality scores yet!**

### Root Cause

1. **Jobs were crawled BEFORE Phase 4 was implemented**
   - Phase 4 added quality scoring to `SimpleCrawler`
   - But orchestrator was using `HTMLCrawler` (legacy)
   - So new crawls didn't get quality scores

2. **We just fixed this** (in this session):
   - Updated orchestrator to use `SimpleCrawler`
   - Now new crawls WILL have quality scores

## ✅ Solution

### Option 1: Re-crawl Sources (Recommended)
1. Go to admin UI → Sources
2. Select sources (e.g., UNICEF, UNDP)
3. Click "Run Now"
4. New jobs will have quality scores

### Option 2: Backfill Existing Jobs
Run the backfill script to score existing jobs:
```bash
cd apps/backend
python scripts/backfill_quality_scores.py --limit 1000
```

## What to Expect After Re-crawl

- ✅ Quality scores (0-100)
- ✅ Quality grades (High/Medium/Low/Very Low)
- ✅ Quality issues (if any)
- ✅ "Needs Review" flag
- ✅ Geocoding status (green pin if geocoded)
- ✅ Remote job indicator (gray pin)

## Verification

After re-crawling, check:
1. **New jobs** should show quality scores
2. **Old jobs** will still show "No score" until backfilled
3. **Quality column** should display badges with scores

## Next Steps

1. ✅ **Re-crawl UNICEF** - Test the new system
2. ✅ **Check quality scores** - Should appear in UI
3. ⏳ **Backfill old jobs** - If you want scores on existing jobs

The UI is ready - we just need data with quality scores!

