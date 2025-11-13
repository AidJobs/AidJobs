# Quick Dashboard Testing Guide

## 🚀 **IMMEDIATE TESTING STEPS**

### Step 1: Test Backend Endpoints (5 minutes)

#### Option A: Using the Test Script (Easiest)

```bash
cd apps/backend
python scripts/test_dashboard_endpoints.py
```

**What you need:**
- Python 3.11+
- `requests` library: `pip install requests`
- Environment variables (optional):
  ```bash
  export BACKEND_URL=https://aidjobs-backend.onrender.com
  export ADMIN_PASSWORD=your_password_here
  ```

#### Option B: Manual Browser Testing

1. **Open your browser's Developer Tools** (F12)
2. **Go to Console tab**
3. **Test Database Status:**
   ```javascript
   fetch('https://aidjobs-backend.onrender.com/api/db/status')
     .then(r => r.json())
     .then(console.log)
     .catch(console.error)
   ```

4. **Test Search Status:**
   ```javascript
   fetch('https://aidjobs-backend.onrender.com/api/search/status')
     .then(r => r.text())
     .then(text => {
       console.log('Response length:', text.length);
       console.log('Response:', text);
       try {
         const json = JSON.parse(text);
         console.log('Parsed JSON:', json);
       } catch(e) {
         console.error('JSON Parse Error:', e);
       }
     })
     .catch(console.error)
   ```

### Step 2: Test Admin Dashboard (5 minutes)

1. **Go to:** `https://www.aidjobs.app/admin/login`
2. **Login** with your admin password
3. **Check Dashboard:**
   - ✅ Database card should show green dot (if DB connected)
   - ✅ Search card should show status (enabled/disabled)
   - ✅ Quick Stats should show numbers
   - ✅ No "Expecting value" errors

4. **Test Initialize Index** (if search is disabled):
   - Click the "Initialize Index" button
   - Should see loading spinner
   - Should see success toast
   - Search status should update

5. **Test Reindex** (if search is enabled):
   - Click the "Reindex Now" button
   - Should see loading spinner
   - Should see success toast with count
   - Document count should update

### Step 3: Check Browser Console (2 minutes)

1. **Open Developer Tools** (F12)
2. **Go to Console tab**
3. **Look for:**
   - ✅ No red errors
   - ✅ No "Expecting value" errors
   - ✅ API calls returning 200 status
   - ⚠️ Any warnings (check if they're important)

4. **Go to Network tab:**
   - Filter by "status"
   - Check `/api/db/status` - should be 200
   - Check `/api/search/status` - should be 200
   - Check response bodies are JSON (not empty)

---

## 🔍 **WHAT TO LOOK FOR**

### ✅ **Success Indicators:**

1. **Database Status:**
   - Green dot indicator
   - Job count displayed
   - Source count displayed
   - No error messages

2. **Search Status:**
   - Status indicator (green/red)
   - Document count displayed
   - Index name shown
   - Last reindexed timestamp (if available)
   - No "Expecting value" errors

3. **Buttons:**
   - Initialize button works (if search disabled)
   - Reindex button works (if search enabled)
   - Loading states show correctly
   - Success/error toasts appear

4. **Quick Stats:**
   - Total Jobs number matches Database card
   - Active Sources number matches Database card
   - Indexed Documents number matches Search card

### ❌ **Problem Indicators:**

1. **Red Alert Icons:**
   - Database: Check `SUPABASE_DB_URL`
   - Search: Check `MEILISEARCH_URL` and `MEILISEARCH_KEY`

2. **"Expecting value" Error:**
   - Backend returning empty response
   - Check backend logs in Render
   - Verify endpoint is accessible

3. **401/403 Errors:**
   - Admin session expired
   - Re-login required
   - Check `COOKIE_SECRET` is set

4. **Network Errors:**
   - CORS issues
   - Backend not reachable
   - Check `NEXT_PUBLIC_API_URL` in Vercel

---

## 🐛 **IF SOMETHING IS BROKEN**

### Issue: Search Status Still Shows Error

**Quick Fix:**
1. Check Render logs for `[search_status]` entries
2. Verify Meilisearch environment variables:
   - `MEILISEARCH_URL` or `MEILI_HOST`
   - `MEILISEARCH_KEY` or `MEILI_MASTER_KEY`
3. Test Meilisearch directly:
   ```bash
   curl https://your-meilisearch-url/health
   ```

### Issue: Database Status Shows Disconnected

**Quick Fix:**
1. Check `SUPABASE_DB_URL` in Render
2. Use connection pooler URL (recommended)
3. Format: `postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

### Issue: Buttons Don't Work

**Quick Fix:**
1. Check you're logged in (cookie exists)
2. Check browser console for 401/403 errors
3. Verify `ADMIN_PASSWORD` and `COOKIE_SECRET` are set
4. Try logging out and back in

---

## 📊 **EXPECTED RESULTS**

### Database Status Response:
```json
{
  "ok": true,
  "row_counts": {
    "jobs": 1234,
    "sources": 56
  }
}
```

### Search Status Response (Enabled):
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

### Search Status Response (Disabled):
```json
{
  "enabled": false,
  "error": "Meilisearch not configured"
}
```

---

## ✅ **TESTING CHECKLIST**

- [ ] Backend endpoints return valid JSON
- [ ] Database status shows correct counts
- [ ] Search status shows correct document count
- [ ] No "Expecting value" errors in console
- [ ] Initialize button works
- [ ] Reindex button works
- [ ] Quick Stats match individual cards
- [ ] System Health Score calculates correctly
- [ ] Recent Activity shows events
- [ ] All status indicators show correct colors

---

## 🎯 **QUICK VERIFICATION COMMANDS**

### Test from Terminal (if you have curl):

```bash
# Database Status
curl https://aidjobs-backend.onrender.com/api/db/status | jq

# Search Status
curl https://aidjobs-backend.onrender.com/api/search/status | jq

# Admin Login (replace PASSWORD)
curl -X POST https://aidjobs-backend.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"PASSWORD"}' \
  -c cookies.txt -v

# Initialize Index (after login)
curl -X POST https://aidjobs-backend.onrender.com/admin/search/init \
  -b cookies.txt | jq
```

---

## 📝 **REPORT ISSUES**

If you find any issues, note:
1. **What you were doing** (e.g., "Clicked Reindex button")
2. **What happened** (e.g., "Got error toast")
3. **Browser console errors** (copy/paste)
4. **Network tab** (check failed requests)
5. **Backend logs** (from Render dashboard)

---

## 🎉 **SUCCESS CRITERIA**

You'll know everything is working when:
- ✅ Dashboard loads without errors
- ✅ All status cards show data
- ✅ Buttons work and show feedback
- ✅ No console errors
- ✅ Numbers match between cards
- ✅ System Health Score is calculated

**Ready to test? Start with Step 1!**

