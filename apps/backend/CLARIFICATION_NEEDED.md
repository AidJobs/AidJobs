# Critical Clarification Needed

## Your Question: "Should I have used new crawl or legacy crawl?"

**Answer: You should use the REGULAR crawl (which uses `HTMLCrawler`).**

There is NO "new crawl" vs "legacy crawl" in the admin UI. There's only ONE crawl system, and it uses `HTMLCrawler`.

## What We Discovered

1. **`HTMLCrawler`** (`crawler/html_fetch.py`) - **THIS IS WHAT'S RUNNING**
   - Used by orchestrator ✅
   - Has plugin system ✅
   - Has data quality validation ✅
   - Missing: Phase 1-4 enhancements

2. **`SimpleCrawler`** (`crawler_v2/simple_crawler.py`) - **NOT USED BY ORCHESTRATOR**
   - Has all Phase 1-4 features ✅
   - But orchestrator doesn't call it ❌

## The Real Issues

### Issue 1: UNICEF Plugin Not Finding Jobs
- Plugin system exists and is being called
- UNICEF plugin exists
- But it's returning 0 jobs
- **Need to debug**: Why is UNICEF plugin not finding jobs?

### Issue 2: Quality Scores Not Showing
- `HTMLCrawler` has `data_quality_score` but not `quality_score`/`quality_grade`
- Phase 4 added `quality_score`/`quality_grade` to `SimpleCrawler`
- But `SimpleCrawler` isn't being used!
- **Solution**: Port Phase 4 quality scoring to `HTMLCrawler`

## What We Need to Do

### Immediate (Today):
1. **Debug UNICEF plugin** - Why is it returning 0 jobs?
2. **Port Phase 4 quality scoring** to `HTMLCrawler.upsert_jobs()`
3. **Port Phase 4 geocoding** to `HTMLCrawler.upsert_jobs()`

### Short-term (This Week):
4. Port Phase 1 features (JSON-LD priority, dateparser)
5. Port Phase 2 features (HTML storage, extraction logging)
6. Port Phase 3 features (AI normalizer)

## Why This Happened

We built features in `SimpleCrawler` thinking it would replace `HTMLCrawler`, but:
- The orchestrator still uses `HTMLCrawler`
- The admin UI still uses `HTMLCrawler`
- We never updated the orchestrator to use `SimpleCrawler`

## The Fix

**Port all Phase 1-4 features from `SimpleCrawler` to `HTMLCrawler`**

This is the RIGHT approach because:
1. `HTMLCrawler` is what's actually running
2. It already has plugin system
3. We just need to add the missing features
4. Less disruption than replacing the entire system

## Next Steps

1. **First**: Debug why UNICEF plugin returns 0 jobs
2. **Then**: Port Phase 4 features (geocoding, quality scoring)
3. **Finally**: Port remaining phases

This will make everything work as expected!

