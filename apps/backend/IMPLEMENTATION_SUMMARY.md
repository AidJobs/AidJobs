# Plugin Implementation Summary

## New Plugins Created

### 1. UNICEF Plugin (`apps/backend/crawler/plugins/unicef.py`)
- **Priority**: 90 (high)
- **Purpose**: Extract jobs from UNICEF career pages while filtering out category pages
- **Features**:
  - Filters out category pages (Learning and development, Where we work, etc.)
  - Extracts title, location, deadline, and apply URL
  - Multiple extraction strategies (containers, structured data, headings)
  - Comprehensive exclusion patterns for non-job content

### 2. Amnesty International Plugin (`apps/backend/crawler/plugins/amnesty.py`)
- **Priority**: 85
- **Purpose**: Extract jobs from Amnesty International (JavaScript-heavy site)
- **Features**:
  - Handles JavaScript-rendered content
  - Extracts from dynamic job listings
  - Filters out navigation and non-job content

### 3. Save the Children Plugin (`apps/backend/crawler/plugins/save_the_children.py`)
- **Priority**: 85
- **Purpose**: Extract jobs from Save the Children ATS (UltiPro/PageUp)
- **Features**:
  - Handles third-party ATS systems
  - Browser rendering support for JavaScript-heavy pages
  - Extracts from various job listing structures

## Browser Crawler Utility

### `apps/backend/crawler/browser_crawler.py`
- **Purpose**: Render JavaScript-heavy pages using Playwright
- **Features**:
  - Headless browser rendering
  - Network monitoring for API endpoints
  - Realistic browser headers
  - Timeout handling

## Integration Updates

### 1. Plugin Registry (`apps/backend/crawler/plugins/registry.py`)
- Registered all new plugins automatically
- Plugins are loaded in priority order

### 2. Simple Crawler (`apps/backend/crawler_v2/simple_crawler.py`)
- Added browser rendering support
- Auto-detects JavaScript-heavy sites
- Falls back to browser rendering when needed

## Dependencies

Added to `requirements.txt`:
- `playwright==1.48.0` - For browser rendering

**Note**: After installing, run `playwright install chromium` to install browser binaries.

## Testing

To test the plugins:

1. **UNICEF**: 
   - URL: https://jobs.unicef.org/en-us/listing/
   - Should extract actual jobs and filter out category pages

2. **Amnesty**:
   - URL: https://careers.amnesty.org/jobs/vacancy/find/results/
   - Requires browser rendering (Playwright)

3. **Save the Children**:
   - URL: https://recruiting.ultipro.com/SAV1002STCF/JobBoard/...
   - Requires browser rendering (Playwright)

## Next Steps

1. Install Playwright: `pip install playwright && playwright install chromium`
2. Test each plugin with actual URLs
3. Monitor extraction accuracy
4. Create additional plugins for other problematic sources as needed

## Notes

- Browser rendering is optional - if Playwright is not installed, the system falls back to HTTP fetching
- Plugins are automatically registered on import
- Priority determines which plugin is tried first (higher = tried first)

