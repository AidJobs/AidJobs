# What Does Pipeline Storage Integration Do?

## Quick Answer

**This does NOT replace your current job insertion system.** Your crawler already inserts jobs using `SimpleCrawler.save_jobs()` - that still works exactly the same.

## Two Different Systems

### 1. **Current System (What You're Using Now)** ✅
- **Crawler**: `SimpleCrawler` (in `crawler_v2/simple_crawler.py`)
- **Extraction**: Built into `SimpleCrawler` (AI + rule-based)
- **Insertion**: `SimpleCrawler.save_jobs()` method
- **Status**: ✅ **Working and inserting jobs right now**

### 2. **New Pipeline System (Optional/Future)** 🔄
- **Extractor**: `pipeline.extractor.Extractor` (new extraction pipeline)
- **Extraction**: 7-stage pipeline (JSON-LD → meta → DOM → heuristics → regex → AI)
- **Insertion**: `pipeline.db_insert.DBInsert` (NEW - what we just added)
- **Status**: ⚠️ **Not currently used by crawler, but available if needed**

## What Pipeline Storage Integration Does

The pipeline storage integration (`EXTRACTION_USE_STORAGE=true`) enables:

1. **Automatic insertion** when using `pipeline.extractor.Extractor` directly
2. **Shadow mode testing** - writes to `jobs_side` table instead of `jobs`
3. **Read-only API** - access extracted jobs via `/_internal/jobs` endpoints

## When Would You Use This?

### Scenario 1: Testing New Extraction Pipeline
```python
from pipeline.extractor import Extractor

extractor = Extractor(
    db_url=db_url,
    enable_storage=True,  # This enables automatic insertion
    shadow_mode=True       # Safe testing in jobs_side table
)

result = await extractor.extract_from_html(html, url)
# Job automatically inserted if result.is_job == True
```

### Scenario 2: Using Pipeline Extractor in Custom Scripts
If you write custom scripts that use the new pipeline extractor, this integration saves jobs automatically.

### Scenario 3: Future Migration
If you decide to migrate from `SimpleCrawler` to `pipeline.extractor.Extractor`, this integration makes the transition seamless.

## Current Status

**Your crawler is NOT using the pipeline extractor yet.** It's still using `SimpleCrawler`, which:
- ✅ Extracts jobs
- ✅ Inserts jobs via `save_jobs()`
- ✅ Works perfectly

## Do You Need to Enable It?

### **No, you don't need to enable it right now** because:
1. Your crawler uses `SimpleCrawler`, not the pipeline extractor
2. Jobs are already being inserted successfully
3. This is for future use or custom scripts

### **Yes, enable it if:**
1. You want to test the new pipeline extractor
2. You're writing custom extraction scripts
3. You plan to migrate to the pipeline extractor in the future

## Summary

| Feature | Current System | Pipeline Storage |
|---------|---------------|------------------|
| **Used by crawler?** | ✅ Yes | ❌ No (optional) |
| **Inserts jobs?** | ✅ Yes (`save_jobs()`) | ✅ Yes (if enabled) |
| **Status** | ✅ Active | 🔄 Available |
| **Need to enable?** | ✅ Already working | ❌ Optional |

## Bottom Line

**Your jobs are already being inserted.** The pipeline storage integration is an **optional feature** for the new extraction pipeline, which isn't currently used by your crawler. You can safely ignore it for now, or enable it if you want to experiment with the new pipeline extractor.

