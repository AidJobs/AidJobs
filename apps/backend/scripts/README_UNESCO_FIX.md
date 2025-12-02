# UNESCO Extraction Fix

## Problem
UNESCO jobs were not showing correct location (Duty Station) or deadline (Application Deadline) in the admin UI or user-facing pages, even though this data is clearly visible on UNESCO's website.

## Root Causes Identified

1. **Header Detection Issues**: The extraction wasn't correctly identifying which table row contained the column headers
2. **Column Name Mismatches**: UNESCO uses specific terms like "Duty Station" instead of "Location" and "Application Deadline" instead of "Deadline"
3. **No Fallback Extraction**: If header mapping failed, the system gave up instead of searching all cells for location/deadline patterns
4. **Strict Validation**: Overly strict validation was rejecting valid locations/deadlines

## Solutions Implemented

### 1. Enhanced Header Detection (`field_extractors.py`)
- Added recognition for UNESCO-specific column names:
  - "Duty Station" → location
  - "Application Deadline" → deadline
  - "Closing Date for Application" → deadline
- Checks `<thead>` element first (more reliable)
- Expanded keyword matching for better header detection

### 2. Fallback Extraction Methods
- **Location Fallback**: If header map fails, searches all cells for:
  - City, Country patterns (e.g., "Paris, France")
  - Known UNESCO duty stations
  - Validates against job title keywords to avoid contamination
  
- **Deadline Fallback**: If header map fails, searches all cells for:
  - Date patterns (DD-MM-YYYY, DD MMM YYYY, etc.)
  - Uses fuzzy date parsing

### 3. Improved UNESCO Plugin (`unesco.py`)
- Better header row detection (checks thead, then first 10 rows)
- More comprehensive header keyword matching
- Debug logging when extraction fails
- Better header row skipping logic

### 4. Diagnostic Tool
- `diagnose_unesco_extraction.py`: Test extraction and analyze HTML structure
- Helps identify issues with specific UNESCO pages

## Testing

To test the fix:

```bash
# Run diagnostic script
python apps/backend/scripts/diagnose_unesco_extraction.py

# Or trigger a crawl of UNESCO source
# The extraction should now correctly capture location and deadline
```

## Expected Results

After this fix:
- ✅ All UNESCO jobs should have correct "Duty Station" (location)
- ✅ All UNESCO jobs should have correct "Application Deadline" (deadline)
- ✅ Data appears correctly in admin UI
- ✅ Data appears correctly in user-facing pages

## Next Steps

1. **Re-crawl UNESCO source**: Trigger a new crawl to extract jobs with the improved logic
2. **Backfill existing jobs**: Run backfill script to re-extract location/deadline for existing UNESCO jobs
3. **Monitor logs**: Check extraction logs to ensure location/deadline are being found

## Files Changed

- `apps/backend/core/field_extractors.py` - Enhanced extraction with fallbacks
- `apps/backend/crawler/plugins/unesco.py` - Improved header detection
- `apps/backend/scripts/diagnose_unesco_extraction.py` - Diagnostic tool

