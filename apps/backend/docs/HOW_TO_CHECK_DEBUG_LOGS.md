# How to Check Debug Logs in Render

## Quick Steps

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Select your backend service** (e.g., "aidjobs-backend")
3. **Click "Logs" tab**
4. **Search for these terms**:
   - `DEBUG: Extracted` - Shows extracted jobs before validation
   - `canonical_hash` - Shows hash values for dedupe
   - `Skipping job` - Shows why jobs are being skipped

## Log Messages to Look For

### 1. Extracted Jobs (INFO level)
```
INFO: DEBUG: Extracted 37 jobs before validation: ['Program Officer - Climate', 'Data Analyst', ...]
```
**What it shows**: Number of jobs extracted and first 5 job titles

### 2. Canonical Hash (DEBUG level)
```
DEBUG: DEBUG: canonical_hash=abc123def456... title=Program Officer apply_url=https://jobs.example.com/123
```
**What it shows**: Hash value, title, and apply_url for each job (for dedupe diagnosis)

### 3. Validation Skips (WARNING level)
```
WARNING: Skipping job: title_missing=False, apply_url_missing=True, title_len=25
```
**What it shows**: Specific reason why a job was skipped (title missing, URL missing, or title too short)

### 4. Final Summary (INFO level)
```
INFO: Successfully saved jobs: 10 inserted, 5 updated, 2 skipped, 0 failed
```
**What it shows**: Final counts after processing

## Enabling DEBUG Logs

If you don't see DEBUG logs:

1. Go to **Render Dashboard → Your Service → Environment**
2. Add environment variable: `LOG_LEVEL=DEBUG`
3. Or add: `PYTHONUNBUFFERED=1` (ensures logs are flushed immediately)
4. **Save** and wait for redeploy

## Filtering Logs

In Render logs, you can:
- **Search**: Type `DEBUG: Extracted` or `canonical_hash` in the search box
- **Filter by level**: Click on log level badges (INFO, WARNING, ERROR)
- **Time range**: Use the time selector to see recent logs

## Example Workflow

1. **Run a crawl** from admin UI (e.g., UNICEF source)
2. **Immediately go to Render logs**
3. **Search for**: `DEBUG: Extracted`
4. **Check the count**: Does it match "Found X" from the crawl?
5. **Search for**: `Skipping job`
6. **Count skips**: How many jobs are being skipped and why?
7. **Search for**: `Successfully saved jobs`
8. **Check final counts**: inserted vs updated vs skipped vs failed

## Troubleshooting

**Problem**: Can't see DEBUG logs
- **Solution**: Add `LOG_LEVEL=DEBUG` to Render environment variables

**Problem**: Logs are delayed
- **Solution**: Add `PYTHONUNBUFFERED=1` to force immediate log flushing

**Problem**: Too many logs
- **Solution**: Use search/filter to focus on specific messages

## What Each Log Tells You

| Log Message | What It Means | Action If Issue |
|------------|---------------|-----------------|
| `DEBUG: Extracted 0 jobs` | No jobs extracted | Check extraction logic |
| `DEBUG: Extracted 37 jobs` | Jobs extracted successfully | Good - proceed to validation |
| `Skipping job: title_missing=True` | Job has no title | Check extraction for title field |
| `Skipping job: apply_url_missing=True` | Job has no apply URL | Check extraction for URL field |
| `Skipping job: title_len=2` | Title too short (< 3 chars) | Check extraction quality |
| `canonical_hash=abc123...` | Hash computed | Check if hash already exists (duplicate) |
| `inserted=0, updated=10` | All jobs are duplicates | Check dedupe logic |
| `inserted=0, failed=10` | All jobs failed to insert | Check SQL errors in logs |

