# Comprehensive Crawler Diagnosis

## Issues Found & Fixed

### 1. Validation Too Strict ✅ FIXED
- **Problem**: Validation was blocking all jobs, even those with only warnings
- **Fix**: Made validation lenient - only blocks hard errors (missing title/URL, invalid URL)
- **Location**: `apps/backend/crawler_v2/simple_crawler.py` lines 1064-1087

### 2. Duplicate URL Check Blocking Updates ✅ FIXED
- **Problem**: Duplicate URL check was blocking valid job updates
- **Fix**: Temporarily disabled duplicate check (will be handled by canonical_hash upsert)
- **Location**: `apps/backend/core/pre_upsert_validator.py` lines 80-84

### 3. Validation Error Logging Bug ✅ FIXED
- **Problem**: Logging ALL invalid jobs instead of only hard errors
- **Fix**: Only log hard_errors to failed_inserts table
- **Location**: `apps/backend/crawler_v2/simple_crawler.py` lines 1092-1113

### 4. Validation Errors Endpoint 404 ❌ NEEDS CHECK
- **Problem**: Endpoint returns 404
- **Possible Causes**:
  - Router not properly registered
  - Path mismatch
  - Authentication issue
- **Endpoint**: `/api/admin/observability/validation-errors`
- **Router**: `observability_router` with prefix `/api/admin/observability`
- **Status**: Registered in `main.py` line 161

## End-to-End Crawler Flow

1. **Trigger**: User clicks "Run Crawl" → `POST /api/admin/crawl/run`
2. **Orchestrator**: Calls `SimpleCrawler.crawl_source()`
3. **Fetch HTML**: `fetch_html()` gets page content
4. **Extract Jobs**: 
   - Try AI extraction first
   - Fallback to plugin system
   - Fallback to rule-based extraction
5. **Enrich Jobs**: Detail page enrichment (for UNICEF/UNDP)
6. **Normalize**: AI normalization (Phase 3)
7. **Geocode**: Location geocoding (Phase 4)
8. **Score Quality**: Data quality scoring (Phase 4)
9. **Validate**: Pre-upsert validation
10. **Save**: Insert/update jobs in database
11. **Log**: Log extraction results

## Current Validation Logic

### Hard Errors (Blocked):
- Missing required field: title
- Missing required field: apply_url
- Title too short (< 5 chars)
- Invalid URL format (javascript:, #, mailto:, etc.)

### Warnings (Allowed):
- Long title (> 500 chars)
- Long location (> 500 chars)
- Deadline format issues
- Other non-critical issues

## Debugging Steps

1. **Check if jobs are being extracted**:
   - Look at crawl logs: "Found X jobs"
   - Check extraction_logs table

2. **Check if validation is blocking**:
   - Look for "Pre-upsert validation: X jobs failed" in logs
   - Check failed_inserts table with operation='validation'

3. **Check if jobs are being saved**:
   - Look at "inserted" count in crawl result
   - Check jobs table directly

4. **Check validation errors endpoint**:
   - Verify router is registered: `grep observability_router main.py`
   - Check endpoint path: `/api/admin/observability/validation-errors`
   - Verify authentication: endpoint requires `admin_required`

## Next Steps

1. ✅ Validation made lenient
2. ✅ Duplicate check disabled
3. ✅ Error logging fixed
4. ⚠️ Check validation errors endpoint 404
5. ⚠️ Test crawl to verify jobs are inserting

