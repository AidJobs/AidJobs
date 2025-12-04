# Critical Architecture Issue Discovered

## The Problem

**We have TWO separate crawler systems, and we've been adding features to the WRONG one!**

### System 1: Legacy Crawler (`apps/backend/crawler/`)
- **Used by**: Orchestrator (the actual scheduler)
- **Class**: `HTMLCrawler` in `crawler/html_fetch.py`
- **Has**: Plugin system (UNICEF, UNDP, etc.)
- **Status**: This is what's ACTUALLY running

### System 2: New Crawler (`apps/backend/crawler_v2/`)
- **Used by**: ??? (Not used by orchestrator!)
- **Class**: `SimpleCrawler` in `crawler_v2/simple_crawler.py`
- **Has**: All our Phase 1-4 features (AI extraction, geocoding, quality scoring)
- **Status**: We've been building features here, but it's NOT being used!

## The Evidence

1. **Orchestrator uses legacy crawler:**
   ```python
   # orchestrator.py line 14
   from crawler.html_fetch import HTMLCrawler
   self.html_crawler = HTMLCrawler(db_url)
   ```

2. **Admin endpoints use legacy crawler:**
   ```python
   # crawler_admin.py line 231
   from crawler.html_fetch import HTMLCrawler
   crawler = HTMLCrawler(db_url)
   ```

3. **We've been adding features to SimpleCrawler:**
   - Phase 1: JSON-LD priority, dateparser
   - Phase 2: HTML storage, extraction logging
   - Phase 3: AI normalizer
   - Phase 4: Geocoding, quality scoring
   - Pre-upsert validation

## Why This Explains Everything

1. **UNICEF found 0 jobs**: Legacy crawler uses plugin system, but we haven't been maintaining it
2. **Quality scores not showing**: Jobs were crawled with legacy crawler (no Phase 4 features)
3. **Frustration**: We've been building on the wrong foundation!

## The Solution

**We need to decide:**

### Option A: Migrate Orchestrator to SimpleCrawler (Recommended)
- Move all Phase 1-4 features to legacy HTMLCrawler
- OR update orchestrator to use SimpleCrawler
- **Pros**: Keep all our work
- **Cons**: Need to merge/port features

### Option B: Port Features to Legacy Crawler
- Move Phase 1-4 features from SimpleCrawler to HTMLCrawler
- Keep plugin system
- **Pros**: Uses existing architecture
- **Cons**: Duplicate work

### Option C: Replace Legacy with New
- Make SimpleCrawler the default
- Update orchestrator to use SimpleCrawler
- **Pros**: Clean slate
- **Cons**: Need to ensure plugin system works

## Recommendation

**Option A: Update Orchestrator to use SimpleCrawler**

Why:
1. SimpleCrawler has all our new features
2. We can integrate plugin system into SimpleCrawler (already started)
3. Less duplication
4. One codebase to maintain

## Immediate Action

1. **Check which crawler the admin UI is calling**
2. **Update orchestrator to use SimpleCrawler**
3. **Ensure plugin system works in SimpleCrawler**
4. **Test with UNICEF**

This explains why nothing is working - we've been building features that aren't being executed!

