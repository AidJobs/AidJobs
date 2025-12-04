# Validation Error Logging

## Internal Error Logs

Validation errors are now logged to the `failed_inserts` table with `operation='validation'`. This provides internal error logs that are more reliable than Render logs.

## How It Works

1. **During Crawl:**
   - Jobs that fail pre-upsert validation are logged to `failed_inserts`
   - Each error includes: title, URL, validation error message, payload
   - Operation type is set to `'validation'`

2. **Viewing Errors:**
   - Use the observability endpoint: `GET /api/admin/observability/validation-errors`
   - Filter by source_id to see errors for a specific source
   - Errors are sorted by most recent first

## API Endpoints

### Get Validation Errors
```
GET /api/admin/observability/validation-errors?source_id=<id>&limit=50
```

Returns:
```json
{
  "status": "ok",
  "data": [
    {
      "id": "...",
      "source_url": "https://...",
      "error": "Pre-upsert validation failed: Missing required field: title",
      "payload": {
        "title": "",
        "apply_url": "https://...",
        "validation_error": "..."
      },
      "attempt_at": "2025-12-04T...",
      "operation": "validation",
      "source_id": "..."
    }
  ],
  "count": 10,
  "message": "Found 10 validation errors"
}
```

### Get All Failed Inserts (including validation)
```
GET /api/admin/observability/failed-inserts?operation=validation&source_id=<id>
```

## Benefits

1. **Persistent** - Errors stored in database, not lost in logs
2. **Queryable** - Can filter by source, date, operation type
3. **Detailed** - Includes full payload for debugging
4. **Trackable** - Can mark as resolved when fixed

## Next Steps

1. Add UI to view validation errors in admin panel
2. Add ability to mark errors as resolved
3. Add summary statistics (most common errors, etc.)

