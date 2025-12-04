# How to Use Validation Errors API

## Endpoint

```
GET /api/admin/observability/validation-errors
```

## Parameters

- `source_id` (optional) - Filter by source ID (e.g., UNICEF source ID)
- `limit` (optional, default: 50) - Maximum number of results

## Authentication

Requires admin authentication. You must be logged in as admin.

## Methods to Access

### Method 1: Browser (Easiest)

1. **Login to admin** (if not already logged in)
2. **Open browser console** (F12 → Console tab)
3. **Run this JavaScript:**

```javascript
// Get validation errors for a specific source
fetch('/api/admin/observability/validation-errors?source_id=YOUR_SOURCE_ID&limit=50', {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => {
  console.log('Validation Errors:', data);
  console.table(data.data); // Nice table view
})
.catch(err => console.error('Error:', err));
```

**To get source_id:**
- Go to Admin → Sources
- Find UNICEF source
- Copy the source ID from the URL or source details

### Method 2: Direct Browser URL

1. **Login to admin first**
2. **Get your source ID** from Admin → Sources
3. **Open this URL in browser:**
```
https://your-backend-url.com/api/admin/observability/validation-errors?source_id=YOUR_SOURCE_ID&limit=50
```

### Method 3: Using curl (Command Line)

```bash
# Replace YOUR_BACKEND_URL and YOUR_SOURCE_ID
curl -X GET "https://YOUR_BACKEND_URL/api/admin/observability/validation-errors?source_id=YOUR_SOURCE_ID&limit=50" \
  -H "Content-Type: application/json" \
  -b "your-session-cookie" \
  --cookie-jar cookies.txt
```

### Method 4: From Frontend Code

```typescript
const response = await fetch('/api/admin/observability/validation-errors?source_id=YOUR_SOURCE_ID&limit=50', {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log('Validation Errors:', data);
```

## Response Format

```json
{
  "status": "ok",
  "data": [
    {
      "id": "uuid-here",
      "source_url": "https://jobs.unicef.org/...",
      "error": "Pre-upsert validation failed: Missing required field: title",
      "payload": {
        "title": "",
        "apply_url": "https://...",
        "location_raw": "...",
        "validation_error": "Missing required field: title"
      },
      "attempt_at": "2025-12-04T22:20:27.123Z",
      "operation": "validation",
      "source_id": "source-uuid-here"
    }
  ],
  "count": 10,
  "message": "Found 10 validation errors"
}
```

## Example: Get UNICEF Validation Errors

1. **Find UNICEF source ID:**
   - Go to Admin → Sources
   - Find UNICEF source
   - Note the source ID (UUID)

2. **Open browser console** (F12)

3. **Run:**
```javascript
// Replace YOUR_UNICEF_SOURCE_ID with actual ID
fetch('/api/admin/observability/validation-errors?source_id=YOUR_UNICEF_SOURCE_ID&limit=100', {
  credentials: 'include'
})
.then(res => res.json())
.then(data => {
  console.log(`Found ${data.count} validation errors`);
  data.data.forEach((error, idx) => {
    console.log(`\nError ${idx + 1}:`);
    console.log(`  Title: ${error.payload?.title || 'N/A'}`);
    console.log(`  URL: ${error.source_url}`);
    console.log(`  Error: ${error.error}`);
  });
});
```

## Quick Debugging

**To see why jobs aren't being inserted:**

1. Run a crawl for UNICEF
2. After crawl completes, run the API call above
3. Look at the `error` field - it will tell you exactly why each job failed
4. Common errors:
   - "Missing required field: title" - Title is empty
   - "Missing required field: apply_url" - URL is missing
   - "Title too short" - Title is less than 5 characters
   - "Invalid URL pattern" - URL is not http/https
   - "URL is login/application form" - URL is a login page (should be filtered by plugin)

## All Failed Inserts (Including Non-Validation)

```
GET /api/admin/observability/failed-inserts?operation=validation&source_id=YOUR_SOURCE_ID
```

This shows all failed inserts, filtered to only validation errors.

