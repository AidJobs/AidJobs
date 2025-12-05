# Job Insertion Diagnosis Summary

## Branch
`fix/insertion-diagnosis-20250105-210000`

## PR URL
https://github.com/AidJobs/AidJobs/pull/new/fix/insertion-diagnosis-20250105-210000

## Problem
Jobs are being found by the crawler but NOT inserted into the database (showing "Found X, Inserted 0").

## Root Causes Identified

### 1. **Validation Skipping Jobs** (Most Likely)
- **Location**: `apps/backend/crawler_v2/simple_crawler.py:1096-1124`
- **Issue**: Jobs are skipped if they don't have both `title` and `apply_url`, or if title is shorter than 3 characters
- **Impact**: Jobs missing these fields are silently skipped and counted as "skipped", not "failed"
- **Code**: 
  ```python
  if job.get('title') and job.get('apply_url') and len(job.get('title', '')) >= 3:
      valid_jobs.append(job)
  else:
      validation_skipped += 1
  ```

### 2. **Dedupe Logic Treating Jobs as Updates**
- **Location**: `apps/backend/crawler_v2/simple_crawler.py:1237-1340`
- **Issue**: If a job with the same `canonical_hash` already exists, it's UPDATED (counted as "updated"), not INSERTED
- **Impact**: If all jobs are duplicates, you'll see "Found X, Updated Y, Inserted 0"
- **Hash Computation**: `canonical_hash = md5(f"{title}|{apply_url}".lower())`

### 3. **SQL Construction Validation Errors**
- **Location**: `apps/backend/crawler_v2/simple_crawler.py:1429-1435`
- **Issue**: Field/value count mismatches cause insertion to fail with "INSERT has more target columns than expressions"
- **Impact**: Jobs fail to insert and are counted as "failed"
- **Error Example**: When `insert_fields` count != `insert_values` count (especially with NOW() placeholders)

### 4. **Shadow Mode Confusion** (Less Likely)
- **Note**: `EXTRACTION_SHADOW_MODE=true` only affects `pipeline.extractor`, NOT `SimpleCrawler.save_jobs()`
- **Clarification**: `SimpleCrawler.save_jobs()` always writes to `jobs` table, regardless of shadow mode

## Failing Steps in Flow

1. **Extraction** → Jobs extracted from HTML ✅
2. **Validation** → Jobs missing title/apply_url are skipped ❌
3. **Dedupe** → Existing jobs are updated instead of inserted ⚠️
4. **SQL Construction** → Field/value mismatches cause failures ❌
5. **DB Insert** → Errors caught and logged, job marked as "failed" ❌

## File Paths Involved

- `apps/backend/crawler_v2/simple_crawler.py` (lines 1083-1511) - `save_jobs` method
- `apps/backend/crawler_v2/simple_crawler.py` (lines 1054-1082) - `_validate_sql_construction` method
- `apps/backend/crawler_v2/simple_crawler.py` (line 2047) - `crawl_source` calls `save_jobs`
- `apps/backend/core/pre_upsert_validator.py` - Currently disabled (commented as "TEMPORARY")

## Recommended Fixes (Priority Order)

### Priority 1: Critical

1. **Add Detailed Logging Before Validation**
   - Log extracted jobs before validation to see what's being extracted
   - Location: `apps/backend/crawler_v2/simple_crawler.py:1090`
   - Action: Add `logger.info(f"Extracted {len(jobs)} jobs before validation: {[j.get('title', 'No title')[:50] for j in jobs[:5]]}")`

2. **Check Canonical Hash Deduplication**
   - Log canonical_hash values to check for hash collisions
   - Location: `apps/backend/crawler_v2/simple_crawler.py:1240`
   - Action: Add `logger.debug(f"Canonical hash: {canonical_hash} for job: {title[:50]}")`

3. **Verify SQL Construction**
   - Ensure SQL validation errors are properly logged
   - Location: `apps/backend/crawler_v2/simple_crawler.py:1429-1435`
   - Action: Validation already raises - ensure outer exception handler logs it

### Priority 2: Important

4. **Remove Duplicate Code**
   - Remove redundant `if not jobs:` check at line 1141
   - Location: `apps/backend/crawler_v2/simple_crawler.py:1141-1148`

5. **Enhance Validation Logging**
   - Log specific reason for each skipped job
   - Location: `apps/backend/crawler_v2/simple_crawler.py:1122-1124`

## Debugging Steps

1. **Check Render Logs** for:
   - `"Saving X jobs to database"` message
   - `"Successfully saved jobs: X inserted, Y updated, Z skipped, W failed"`
   - `"Skipping job - missing title/URL"` warnings

2. **Check Database Tables**:
   ```sql
   -- Check failed inserts
   SELECT * FROM failed_inserts 
   WHERE source_id = 'your-source-id' 
   ORDER BY attempt_at DESC LIMIT 10;
   
   -- Check extraction logs
   SELECT * FROM extraction_logs 
   WHERE source_id = 'your-source-id' 
   ORDER BY created_at DESC LIMIT 10;
   
   -- Check if jobs are being updated instead of inserted
   SELECT canonical_hash, COUNT(*) 
   FROM jobs 
   WHERE source_id = 'your-source-id' 
   GROUP BY canonical_hash 
   HAVING COUNT(*) > 1;
   ```

3. **Test with Single Job**:
   - Use `simulate_extract` endpoint to see extraction output
   - Verify job has `title` and `apply_url` fields

## Deliverables

- ✅ `apps/backend/report/insertion_diagnosis.json` - Comprehensive diagnosis report
- ✅ `apps/backend/scripts/diagnose_insertion_flow.py` - Diagnostic script for future use
- ✅ `apps/backend/INSERTION_DIAGNOSIS_SUMMARY.md` - This summary document

## Next Steps

1. Review the diagnosis report: `apps/backend/report/insertion_diagnosis.json`
2. Check Render logs for the specific error messages identified
3. Run the diagnostic script on a server with database access
4. Implement Priority 1 fixes to add detailed logging
5. Verify which step is actually failing (validation, dedupe, or SQL construction)

