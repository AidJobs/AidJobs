# Crawler Endpoints Verification

## Backend Endpoints (apps/backend/app/crawler_admin.py)

### 1. POST `/admin/crawl/run`
- **Purpose**: Manually trigger crawl for a specific source
- **Auth**: Required (admin_required)
- **Request Body**: `{ "source_id": "uuid" }`
- **Response**: `{ "status": "ok", "message": "Crawl queued for {org_name}" }`
- **Status**: ✅ Implemented
- **Frontend Proxy**: `apps/frontend/app/api/admin/crawl/run/route.ts` ✅

### 2. POST `/admin/crawl/run_due`
- **Purpose**: Manually trigger crawl for all due sources
- **Auth**: Required (admin_required)
- **Request Body**: None
- **Response**: `{ "status": "ok", "data": { "queued": int } }`
- **Status**: ✅ Implemented
- **Frontend Proxy**: `apps/frontend/app/api/admin/crawl/run_due/route.ts` ✅

### 3. GET `/admin/crawl/status`
- **Purpose**: Get crawler status (running, queued, active, available slots)
- **Auth**: Required (admin_required)
- **Query Params**: None
- **Response**: 
  ```json
  {
    "status": "ok",
    "data": {
      "running": bool,
      "pool": { "global_max": int, "available": int },
      "due_count": int,
      "locked": int,
      "in_flight": int
    }
  }
  ```
- **Status**: ✅ Implemented
- **Frontend Proxy**: `apps/frontend/app/api/admin/crawl/status/route.ts` ✅
- **Note**: Requires `crawl_locks` table (added to migration script ✅)

### 4. GET `/admin/crawl/logs`
- **Purpose**: Get crawl logs (recent activity)
- **Auth**: Required (admin_required)
- **Query Params**: 
  - `source_id` (optional): Filter by source
  - `limit` (optional, default: 20, max: 100): Number of logs to return
- **Response**: 
  ```json
  {
    "status": "ok",
    "data": [
      {
        "id": "uuid",
        "source_id": "uuid",
        "org_name": "string",
        "careers_url": "string",
        "found": int,
        "inserted": int,
        "updated": int,
        "skipped": int,
        "status": "string",
        "message": "string",
        "ran_at": "iso8601",
        "duration_ms": int
      }
    ]
  }
  ```
- **Status**: ✅ Implemented
- **Frontend Proxy**: `apps/frontend/app/api/admin/crawl/logs/route.ts` ✅

### 5. GET `/admin/robots/{host}`
- **Purpose**: Get robots.txt cache for a host
- **Auth**: Required (admin_required)
- **Path Params**: `host` (string)
- **Response**: `{ "status": "ok", "data": {...} | null }`
- **Status**: ✅ Implemented
- **Frontend Proxy**: ❌ Not used in crawler page (removed from UI)

### 6. GET `/admin/domain_policies/{host}`
- **Purpose**: Get domain policy for a host
- **Auth**: Required (admin_required)
- **Path Params**: `host` (string)
- **Response**: `{ "status": "ok", "data": {...} }` (returns defaults if not found)
- **Status**: ✅ Implemented
- **Frontend Proxy**: ❌ Not used in crawler page (removed from UI)

### 7. POST `/admin/domain_policies/{host}`
- **Purpose**: Create or update domain policy
- **Auth**: Required (admin_required)
- **Path Params**: `host` (string)
- **Request Body**: `{ "max_concurrency": int, "min_request_interval_ms": int, ... }`
- **Response**: `{ "status": "ok", "message": "Policy updated for {host}" }`
- **Status**: ✅ Implemented
- **Frontend Proxy**: ❌ Not used in crawler page (removed from UI)

## Router Registration

### Backend (apps/backend/main.py)
- ✅ `crawler_admin.router` registered as `/admin/crawl`
- ✅ `crawler_admin.robots_router` registered as `/admin/robots`
- ✅ `crawler_admin.policies_router` registered as `/admin/domain_policies`

## Frontend Usage

### Crawler Page (`apps/frontend/app/admin/crawl/page.tsx`)
- ✅ Uses `/api/admin/crawl/status` - GET status
- ✅ Uses `/api/admin/crawl/logs` - GET logs (limit=15)
- ✅ Uses `/api/admin/crawl/run_due` - POST run due sources
- ❌ Does NOT use `/api/admin/crawl/run` (used in Sources page instead)
- ❌ Does NOT use robots/domain_policies endpoints (removed from UI)

## Error Handling

### Backend
- ✅ All endpoints use `admin_required` dependency
- ✅ Database connection errors handled with try/finally
- ✅ HTTPException for 404 (source not found)
- ✅ Proper UUID casting (`id::text = %s`)

### Frontend Proxy Routes
- ✅ All routes handle 401 (redirect to login)
- ✅ All routes parse error responses
- ✅ URL normalization (removes trailing `/api`)
- ✅ Proper error messages in toasts

## Database Dependencies

### Required Tables
- ✅ `sources` - For source data
- ✅ `crawl_logs` - For crawl history
- ✅ `crawl_locks` - For lock tracking (added to migration ✅)
- ✅ `domain_policies` - For domain rate limiting (optional)
- ✅ `robots_cache` - For robots.txt caching (optional)

## Testing Checklist

### Manual Testing
- [ ] Test GET `/api/admin/crawl/status` - Should return status object
- [ ] Test GET `/api/admin/crawl/logs` - Should return array of logs
- [ ] Test GET `/api/admin/crawl/logs?source_id={uuid}` - Should filter by source
- [ ] Test POST `/api/admin/crawl/run_due` - Should queue due sources
- [ ] Test error handling - 401 should redirect to login
- [ ] Test error handling - Invalid source_id should show error message

### Integration Testing
- [ ] Open crawler page - Should load status and logs
- [ ] Click "Run due sources" - Should queue crawls and show success message
- [ ] Click "Refresh status" - Should update status and logs
- [ ] Verify tooltips are visible and positioned correctly
- [ ] Verify no console errors

## Known Issues Fixed

1. ✅ Missing `crawl_locks` table - Added to migration script
2. ✅ Tooltip positioning - Fixed to use `right-0` for top-right buttons
3. ✅ Error handling - Enhanced to show specific error messages
4. ✅ Auto-refresh removed - To save API quota on free tiers

## Next Steps

1. Run migration script to create `crawl_locks` table
2. Test all endpoints manually
3. Verify frontend-backend integration
4. Monitor for any runtime errors

