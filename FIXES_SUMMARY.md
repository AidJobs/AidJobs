# Admin Dashboard Fixes Summary

## Issues Fixed

### 1. ✅ Crawler HTTP 404 Error
**Problem**: Proxy routes were calling wrong backend URLs  
**Fix**: Updated all crawler proxy routes to use `/api/admin/crawl/*` instead of `/admin/crawl/*`

**Files Fixed**:
- `apps/frontend/app/api/admin/crawl/status/route.ts`
- `apps/frontend/app/api/admin/crawl/run_due/route.ts`
- `apps/frontend/app/api/admin/crawl/logs/route.ts`
- `apps/frontend/app/api/admin/crawl/run/route.ts`
- `apps/frontend/app/api/admin/crawl/cleanup_expired/route.ts`

### 2. ✅ UNDP Jobs Still Showing After Deletion
**Problem**: Queries didn't filter soft-deleted jobs  
**Fix**: Added `deleted_at IS NULL` filter to all job queries

**Files Fixed**:
- `apps/backend/app/search.py` (6 queries)
- `apps/backend/app/enrichment_dashboard.py` (4 queries)

### 3. ✅ Analytics HTTP 500 Error
**Problem**: Inconsistent environment variable usage in proxy routes  
**Fix**: Standardized to use `NEXT_PUBLIC_API_URL` and added proper error handling

**Files Fixed**:
- `apps/frontend/app/api/admin/crawl/analytics/overview/route.ts`
- `apps/frontend/app/api/admin/crawl/analytics/source/[sourceId]/route.ts`

### 4. ✅ Crawler Status Unavailable
**Problem**: Same as #1 - wrong proxy URL  
**Fix**: Fixed proxy route URL

### 5. ✅ Enrichment No Data
**Problem**: Enrichment queries didn't filter deleted jobs  
**Fix**: Added `deleted_at IS NULL` to all enrichment queries

**Files Fixed**:
- `apps/backend/app/enrichment_dashboard.py` (4 queries)

### 6. ✅ Data Quality HTTP 500 Error
**Problem**: 
- Inconsistent environment variable (`NEXT_PUBLIC_BACKEND_URL` vs `NEXT_PUBLIC_API_URL`)
- Queries didn't filter deleted jobs
- Missing error logging

**Fix**: 
- Standardized to use `NEXT_PUBLIC_API_URL`
- Added `deleted_at IS NULL` filters to all data quality queries
- Added better error logging

**Files Fixed**:
- `apps/frontend/app/api/admin/data-quality/global/route.ts`
- `apps/frontend/app/api/admin/data-quality/source/[sourceId]/route.ts`
- `apps/backend/app/data_quality.py` (3 queries)
- `apps/backend/app/crawler_admin.py` (error logging)

## Environment Variable Standardization

All proxy routes now use:
```typescript
const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api$/, '');
```

This ensures:
- Consistent environment variable usage
- Proper URL construction (removes trailing `/api` if present)
- Correct backend endpoint paths

## Database Query Updates

All job queries now include:
```sql
WHERE status = 'active'
AND deleted_at IS NULL
```

This ensures soft-deleted jobs are excluded from:
- Search results
- Facet counts
- Enrichment metrics
- Data quality reports
- Analytics data

## Next Steps

1. **Wait for Render Deployment** - Changes need to deploy to production
2. **Clear Browser Cache** - Old cached responses might cause issues
3. **Check Backend Logs** - If errors persist, check Render logs for specific errors
4. **Verify Environment Variables** - Ensure `NEXT_PUBLIC_API_URL` is set correctly in Render

## Testing Checklist

After deployment, verify:
- [ ] Admin → Crawler page loads without 404
- [ ] Deleted UNDP jobs don't appear on homepage
- [ ] Admin → Analytics loads without 500 error
- [ ] Admin Dashboard shows crawler status
- [ ] Admin → Enrichment shows data (if jobs are enriched)
- [ ] Admin → Data Quality loads without 500 error

## If Issues Persist

1. Check browser console for specific error messages
2. Check Render backend logs for detailed errors
3. Verify `NEXT_PUBLIC_API_URL` environment variable is set correctly
4. Ensure backend has deployed the latest changes
5. Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

