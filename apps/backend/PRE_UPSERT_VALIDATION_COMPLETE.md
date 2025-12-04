# Pre-Upsert Validation - Complete ✅

## Implementation Summary

Pre-upsert validation has been implemented as per Master Plan 1.2 (Enhanced Data Quality Validation).

### What Was Added

1. **New Module**: `apps/backend/core/pre_upsert_validator.py`
   - `PreUpsertValidator` class
   - Validates jobs before database insertion
   - Batch validation support

2. **Integration**: Updated `apps/backend/crawler_v2/simple_crawler.py`
   - Integrated validator into `save_jobs()` method
   - Validates all jobs before processing
   - Logs validation failures

### Validations Implemented

#### ✅ Required Fields
- Title (must be present and non-empty)
- Apply URL (must be present and non-empty)

#### ✅ Title Validation
- Minimum length: 5 characters
- Maximum length: 500 characters (warning if longer)

#### ✅ URL Format Validation
- Must be http or https
- Must have valid domain
- Rejects: `#`, `javascript:`, `mailto:`, `tel:`, `data:`
- Maximum length: 2000 characters

#### ✅ Duplicate URL Detection
- Checks if same `apply_url` + `source_id` already exists
- Uses database query for accurate detection
- Handles updates vs new inserts correctly

#### ✅ Deadline Validation
- Validates format if present
- Warns if format is incorrect

#### ✅ Location Validation
- Warns if location is very long (>500 chars)

### How It Works

1. **Before Insert**: All jobs are validated using `PreUpsertValidator`
2. **Validation Result**: Returns valid jobs and invalid jobs with errors
3. **Processing**: Only valid jobs proceed to database insertion
4. **Logging**: Invalid jobs are logged with reasons
5. **Statistics**: Returns validation stats in response

### Integration Flow

```
crawl_source()
  ↓
extract_jobs_from_html()
  ↓
AI normalization (Phase 3)
  ↓
Geocoding (Phase 4)
  ↓
Quality scoring (Phase 4)
  ↓
save_jobs()
  ↓
Pre-upsert validation ← NEW
  ↓
Database insert/update
```

### Example Output

```python
{
    'valid_jobs': [...],  # Jobs that passed validation
    'invalid_jobs': [(job, error), ...],  # Jobs that failed
    'warnings': [...],  # Non-blocking warnings
    'stats': {
        'total': 100,
        'valid': 95,
        'invalid': 5,
        'warnings_count': 2
    }
}
```

### Benefits

1. **Prevents Bad Data**: Invalid jobs never enter database
2. **Early Detection**: Catches issues before database operations
3. **Better Logging**: Clear reasons for rejections
4. **Performance**: Batch validation is efficient
5. **Maintainable**: Centralized validation logic

### Next Steps

1. ✅ Pre-upsert validation - **DONE**
2. ⏳ Post-upsert validation (unique apply_url per source)
3. ⏳ Test Phase 4 features
4. ⏳ Link validation integration

### Testing

To test validation:
1. Run a crawl
2. Check logs for validation messages
3. Verify invalid jobs are skipped
4. Check `failed_inserts` table for validation failures

