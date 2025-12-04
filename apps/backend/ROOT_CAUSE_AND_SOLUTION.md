# Root Cause Analysis & Solution

## The Problem

**We have TWO crawlers, and we've been building features in the WRONG one:**

1. **`HTMLCrawler`** (`crawler/html_fetch.py`) - **THIS IS WHAT'S RUNNING**
   - Used by orchestrator (the scheduler)
   - Has plugin system ✅
   - Missing: Phase 1-4 features ❌

2. **`SimpleCrawler`** (`crawler_v2/simple_crawler.py`) - **NOT USED**
   - Has all Phase 1-4 features ✅
   - Missing: Integration with orchestrator ❌

## Why This Explains Everything

1. **UNICEF found 0 jobs**: Plugin system exists but may need debugging
2. **Quality scores not showing**: Jobs crawled with `HTMLCrawler` which doesn't have Phase 4 features
3. **Frustration**: We've been building features that aren't being executed!

## The Solution

**Port Phase 1-4 features from `SimpleCrawler` to `HTMLCrawler`**

### Phase 1 Features to Port:
- JSON-LD priority extraction
- Enhanced date parsing with `dateparser`
- Failed insert logging

### Phase 2 Features to Port:
- HTML storage (raw_pages table)
- Extraction logging (extraction_logs table)
- Coverage monitoring

### Phase 3 Features to Port:
- AI normalizer for ambiguous fields

### Phase 4 Features to Port:
- Location geocoding
- Data quality scoring
- Pre-upsert validation

## Implementation Plan

### Step 1: Port Core Features (Priority)
1. Add Phase 1 improvements to `HTMLCrawler.extract_jobs()`
2. Add Phase 4 geocoding and quality scoring to `HTMLCrawler.upsert_jobs()`
3. Add pre-upsert validation

### Step 2: Add Observability (Phase 2)
1. Integrate HTML storage
2. Add extraction logging
3. Update `upsert_jobs` to log failures

### Step 3: Add AI Normalization (Phase 3)
1. Integrate AI normalizer into normalization pipeline

## Why This Approach

1. **HTMLCrawler is what's running** - We need to fix what's actually executing
2. **Plugin system already works** - Just needs debugging for UNICEF
3. **Less disruption** - Port features rather than replace entire system
4. **Faster** - Don't need to rebuild everything

## Immediate Actions

1. ✅ Port Phase 1 features (JSON-LD, dateparser)
2. ✅ Port Phase 4 features (geocoding, quality scoring)
3. ✅ Add pre-upsert validation
4. ✅ Fix UNICEF plugin (debug why it's not finding jobs)
5. ✅ Test with real crawl

## Timeline

- **Today**: Port critical features (Phase 1 + Phase 4)
- **Tomorrow**: Add observability (Phase 2) and AI normalization (Phase 3)
- **Testing**: Verify with UNICEF, UNDP, and other sources

This is the RIGHT approach - fix what's actually running, not what we wish was running.

