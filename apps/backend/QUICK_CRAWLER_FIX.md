# Quick Crawler Fix

## Issue
Crawler not working - jobs not being inserted.

## Likely Causes
1. **Validation too strict** - Pre-upsert validation blocking all jobs
2. **Missing fields** - Jobs missing required title/URL
3. **URL validation failing** - URLs not passing format checks

## Quick Fix Options

### Option 1: Temporarily Disable Validation (Fastest)
Comment out validation in `simple_crawler.py` line 1064-1071:
```python
# Temporarily disable validation
# from core.pre_upsert_validator import get_validator
# validator = get_validator(db_connection=conn)
# validation_result = validator.validate_batch(jobs, source_id)
# jobs = validation_result['valid_jobs']
# validation_skipped = len(validation_result['invalid_jobs'])

# Use all jobs (skip validation)
validation_result = {'valid_jobs': jobs, 'invalid_jobs': [], 'warnings': []}
validation_skipped = 0
```

### Option 2: Make Validation More Lenient
In `pre_upsert_validator.py`:
- Reduce title minimum from 5 to 3 characters
- Allow more URL patterns
- Make duplicate check optional

### Option 3: Check Validation Errors
Use the "View Validation Errors" button in the UI to see what's failing.

## Recommended Action
1. Check validation errors first (use UI button)
2. If too many failures, temporarily disable validation (Option 1)
3. Fix the root cause (missing titles/URLs in extraction)
4. Re-enable validation with fixes

