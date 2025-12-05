# Legacy Scrapers Removed

## Summary

All legacy scrapers have been removed and replaced with enterprise-grade scrapers.

## Changes Made

### ✅ Files Deleted
- `apps/backend/crawler/html_fetch.py` - Legacy HTMLCrawler
- `apps/backend/crawler/rss_fetch.py` - Legacy RSSCrawler  
- `apps/backend/crawler/api_fetch.py` - Legacy APICrawler

### ✅ Files Updated
- `apps/backend/app/crawler_admin.py` - Now uses `SimpleCrawler`
- `apps/backend/app/crawl.py` - Now uses `SimpleCrawler`, `SimpleRSSCrawler`, `SimpleAPICrawler`
- `apps/backend/app/sources.py` - Now uses new scrapers
- `apps/backend/scripts/test_extraction.py` - Updated to use new scrapers
- `apps/backend/scripts/test_unesco_extraction_simple.py` - Updated to use `SimpleCrawler`

### ✅ UI Checked
- No references to legacy scrapers found in frontend code

## New Scrapers (Enterprise-Grade)

### 1. SimpleCrawler (`crawler_v2/simple_crawler.py`)
- **Replaces:** HTMLCrawler
- **Features:**
  - AI-powered extraction (OpenRouter/Claude)
  - Multi-strategy fallback (JSON-LD, meta tags, DOM selectors)
  - Phase 1-4 features (geocoding, quality scoring, validation)
  - Plugin system for site-specific logic
  - Browser rendering support (Playwright)

### 2. SimpleRSSCrawler (`crawler_v2/rss_crawler.py`)
- **Replaces:** RSSCrawler
- **Features:**
  - RSS/Atom feed parsing
  - Automatic job extraction
  - Location and deadline extraction from descriptions

### 3. SimpleAPICrawler (`crawler_v2/api_crawler.py`)
- **Replaces:** APICrawler
- **Features:**
  - JSON API parsing
  - Automatic field mapping
  - Common API pattern detection

## Migration Notes

### Method Changes

**HTMLCrawler → SimpleCrawler:**
- `fetch_html()` returns `(status, html)` instead of `(status, headers, html, size)`
- `extract_jobs()` → `extract_jobs_from_html()`
- `normalize_job()` → Not needed, jobs are normalized in `save_jobs()`
- `upsert_jobs()` → `save_jobs()`

**RSSCrawler → SimpleRSSCrawler:**
- `fetch_feed()` → Same method name
- `normalize_job()` → Not needed, jobs are normalized in `save_jobs()`

**APICrawler → SimpleAPICrawler:**
- `fetch_api()` → Same method name (but simpler signature)
- `extract_jobs_from_json()` → New method name

### Usage Example

**Old (Legacy):**
```python
from crawler.html_fetch import HTMLCrawler
crawler = HTMLCrawler(db_url)
status, headers, html, size = await crawler.fetch_html(url)
jobs = crawler.extract_jobs(html, url, parser_hint)
normalized = [crawler.normalize_job(job, org_name) for job in jobs]
counts = await crawler.upsert_jobs(normalized, source_id)
```

**New (Enterprise):**
```python
from crawler_v2.simple_crawler import SimpleCrawler
import os
use_ai = bool(os.getenv('OPENROUTER_API_KEY'))
crawler = SimpleCrawler(db_url, use_ai=use_ai)
status, html = await crawler.fetch_html(url)
if status == 200:
    jobs = crawler.extract_jobs_from_html(html, url)
    counts = crawler.save_jobs(jobs, source_id, org_name)
```

**Or use the high-level method:**
```python
result = await crawler.crawl_source({
    'id': source_id,
    'careers_url': url,
    'org_name': org_name,
    'source_type': 'html'
})
```

## Benefits

1. **Single Source of Truth** - Only one set of scrapers to maintain
2. **Enterprise Features** - All Phase 1-4 features (geocoding, quality scoring, validation)
3. **AI-Powered** - Better extraction accuracy with AI fallback
4. **Simpler API** - Cleaner method signatures
5. **Better Error Handling** - Improved logging and error messages

## Testing

After migration, test:
- ✅ HTML source crawling
- ✅ RSS source crawling  
- ✅ API source crawling
- ✅ Admin crawl endpoints
- ✅ Source simulation
- ✅ Test scripts

