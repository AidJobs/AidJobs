# Debugging Dashboard Functionality

## 🔧 **IMPROVEMENTS MADE**

### 1. Enhanced Search Status Endpoint
- ✅ Added comprehensive error handling with try-catch blocks
- ✅ Added automatic retry with reinitialization on failure
- ✅ Added detailed logging for debugging
- ✅ Ensures always returns valid JSON (never empty response)
- ✅ Better error messages

### 2. Enhanced Database Status Endpoint
- ✅ Added try-catch wrapper in main.py
- ✅ Ensures always returns valid JSON
- ✅ Better error logging

### 3. Test Script Created
- ✅ `apps/backend/scripts/test_dashboard_endpoints.py`
- ✅ Tests all dashboard endpoints
- ✅ Provides detailed output for debugging

---

## 🧪 **HOW TO TEST FUNCTIONALITY**

### Option 1: Run Test Script (Recommended)

```bash
cd apps/backend
python scripts/test_dashboard_endpoints.py
```

Or with environment variables:
```bash
BACKEND_URL=https://aidjobs-backend.onrender.com \
ADMIN_PASSWORD=your_password \
python scripts/test_dashboard_endpoints.py
```

**What it tests:**
- ✅ `/api/db/status` - Database status
- ✅ `/api/search/status` - Search status
- ✅ `/api/admin/login` - Admin authentication
- ✅ `/admin/search/init` - Initialize index
- ✅ `/admin/search/reindex` - Reindex jobs

### Option 2: Manual Testing with curl

#### Test Database Status
```bash
curl https://aidjobs-backend.onrender.com/api/db/status
```

**Expected Response:**
```json
{
  "ok": true,
  "row_counts": {
    "jobs": 1234,
    "sources": 56
  }
}
```

#### Test Search Status
```bash
curl https://aidjobs-backend.onrender.com/api/search/status
```

**Expected Response:**
```json
{
  "enabled": true,
  "index": {
    "name": "jobs_index",
    "stats": {
      "numberOfDocuments": 1234,
      "isIndexing": false
    },
    "lastReindexedAt": "2024-01-15T10:30:00Z"
  }
}
```

**If Search Not Configured:**
```json
{
  "enabled": false,
  "error": "Meilisearch not configured"
}
```

#### Test Admin Login
```bash
curl -X POST https://aidjobs-backend.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your_password"}' \
  -c cookies.txt
```

#### Test Initialize Index (requires admin session)
```bash
curl -X POST https://aidjobs-backend.onrender.com/admin/search/init \
  -b cookies.txt
```

#### Test Reindex (requires admin session)
```bash
curl -X POST https://aidjobs-backend.onrender.com/admin/search/reindex \
  -b cookies.txt
```

---

## 🔍 **DEBUGGING STEPS**

### Issue: Search Status Returns Empty Response

**Symptoms:**
- Frontend shows "Expecting value: line 1 column 1 (char 0)"
- Browser console shows empty response

**Debugging Steps:**

1. **Check Backend Logs (Render)**
   - Go to Render Dashboard → Your Backend Service → Logs
   - Look for `[search_status]` log entries
   - Check for Meilisearch connection errors

2. **Test Endpoint Directly**
   ```bash
   curl -v https://aidjobs-backend.onrender.com/api/search/status
   ```
   - Check HTTP status code (should be 200)
   - Check Content-Type header (should be `application/json`)
   - Check response body (should be valid JSON)

3. **Check Environment Variables**
   - `MEILISEARCH_URL` - Should be set to your Meilisearch instance URL
   - `MEILISEARCH_KEY` - Should be set to your Meilisearch API key
   - Or legacy: `MEILI_HOST` and `MEILI_MASTER_KEY`

4. **Check Meilisearch Service**
   - Verify Meilisearch instance is running
   - Test Meilisearch health endpoint:
     ```bash
     curl https://your-meilisearch-url/health
     ```

5. **Check Network Connectivity**
   - Backend must be able to reach Meilisearch
   - Check firewall/network rules

### Issue: Database Status Shows "Disconnected"

**Symptoms:**
- Dashboard shows red alert icon for database
- Error message in database card

**Debugging Steps:**

1. **Check Environment Variables**
   - `SUPABASE_DB_URL` - Should be set to PostgreSQL connection string
   - Format: `postgresql://user:password@host:port/database`

2. **Test Database Connection**
   - Check Render logs for database connection errors
   - Look for `[search] Attempting database connection` log entries

3. **Verify Connection String**
   - Use Supabase connection pooler URL (recommended)
   - Format: `postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

4. **Check Database Access**
   - Verify database is accessible from Render
   - Check IP allowlist if applicable

### Issue: Initialize/Reindex Buttons Don't Work

**Symptoms:**
- Buttons show loading but fail
- 401/403 errors in console

**Debugging Steps:**

1. **Check Admin Authentication**
   - Verify you're logged in (check browser cookies)
   - Cookie name: `aidjobs_admin_session`

2. **Check Environment Variables**
   - `ADMIN_PASSWORD` - Must be set
   - `COOKIE_SECRET` - Must be set for session cookies

3. **Test Login**
   ```bash
   curl -X POST https://aidjobs-backend.onrender.com/api/admin/login \
     -H "Content-Type: application/json" \
     -d '{"password":"your_password"}' \
     -v
   ```
   - Check for `Set-Cookie` header in response
   - Verify cookie is being set

4. **Check Proxy Routes**
   - Verify `/api/admin/search/init` and `/api/admin/search/reindex` proxy routes exist
   - Check `apps/frontend/app/api/admin/search/init/route.ts`
   - Check `apps/frontend/app/api/admin/search/reindex/route.ts`

---

## 📊 **COMMON ISSUES & SOLUTIONS**

### Issue: "Meilisearch not configured"
**Solution:**
- Set `MEILISEARCH_URL` and `MEILISEARCH_KEY` environment variables
- Or set `MEILI_HOST` and `MEILI_MASTER_KEY` (legacy)

### Issue: "Database connection params missing"
**Solution:**
- Set `SUPABASE_DB_URL` environment variable
- Use Supabase connection pooler URL

### Issue: "Invalid credentials" on admin login
**Solution:**
- Verify `ADMIN_PASSWORD` is set correctly
- Check password in Render environment variables
- Try logging in again

### Issue: "COOKIE_SECRET not configured"
**Solution:**
- Set `COOKIE_SECRET` environment variable
- Generate a random secret: `python -c "import secrets; print(secrets.token_hex(32))"`

### Issue: Empty response from endpoints
**Solution:**
- Check backend logs for errors
- Verify endpoint is returning JSON (not HTML error page)
- Check CORS configuration
- Verify `NEXT_PUBLIC_API_URL` is set correctly

---

## ✅ **VERIFICATION CHECKLIST**

After deploying fixes, verify:

- [ ] Database status endpoint returns valid JSON
- [ ] Search status endpoint returns valid JSON (even if disabled)
- [ ] Admin login works and sets cookie
- [ ] Initialize index button works
- [ ] Reindex button works
- [ ] Dashboard displays all statuses correctly
- [ ] Error messages are user-friendly
- [ ] No empty responses or JSON parse errors

---

## 🚀 **NEXT STEPS**

1. **Deploy the fixes** to Render
2. **Run the test script** to verify endpoints
3. **Check browser console** for any remaining errors
4. **Test dashboard** in production
5. **Monitor logs** for any new issues

---

## 📝 **NOTES**

- All endpoints now have comprehensive error handling
- All endpoints always return valid JSON (never empty)
- Detailed logging added for easier debugging
- Test script provides comprehensive endpoint verification

