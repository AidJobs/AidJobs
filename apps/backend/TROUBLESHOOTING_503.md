# Troubleshooting HTTP 503 - Backend Not Responding

## What HTTP 503 Means

**503 Service Unavailable** = The backend service is not running or not accessible.

## Quick Diagnosis Steps

### 1. Check Backend Service Status (Render)

1. Go to your **Render dashboard**
2. Find your **backend service** (Python/FastAPI)
3. Check the **Status**:
   - ✅ **Live** = Service is running (check logs for errors)
   - ❌ **Stopped** = Service is down (click "Manual Deploy" to restart)
   - ⚠️ **Building** = Service is deploying (wait for completion)

### 2. Check Backend Logs (Render)

1. In Render dashboard, click on your backend service
2. Go to **Logs** tab
3. Look for errors:
   - **Database connection errors** → Check `DATABASE_URL` or `SUPABASE_DB_URL`
   - **Import errors** → Missing dependencies
   - **Port binding errors** → Port conflict
   - **Environment variable errors** → Missing required vars

### 3. Check Environment Variables (Render)

Common issues:
- ❌ `DATABASE_URL` or `SUPABASE_DB_URL` not set → Backend can't start
- ❌ `ADMIN_SECRET_KEY` not set → Auth won't work
- ⚠️ `OPENROUTER_API_KEY` not set → AI extraction disabled (but backend should still start)

**Fix:**
1. Go to **Environment** tab in Render
2. Verify all required variables are set
3. **Redeploy** after adding/changing variables

### 4. Check Frontend Backend URL (Vercel)

The frontend needs to know where your backend is:

1. Go to **Vercel dashboard**
2. Your project → **Settings** → **Environment Variables**
3. Check `NEXT_PUBLIC_API_URL`:
   - Should be your Render backend URL (e.g., `https://your-backend.onrender.com`)
   - **NOT** `http://localhost:8000` (that's only for local dev)

**If missing:**
- Add `NEXT_PUBLIC_API_URL` = `https://your-backend.onrender.com`
- **Redeploy** frontend

## Common Issues & Fixes

### Issue 1: Backend Service Stopped

**Symptoms:**
- Status shows "Stopped" in Render
- 503 errors in frontend

**Fix:**
1. In Render dashboard, click **Manual Deploy**
2. Or click **Restart** if available
3. Wait for deployment to complete

### Issue 2: Database Connection Failed

**Symptoms:**
- Logs show: `psycopg2.OperationalError` or `connection refused`
- Backend crashes on startup

**Fix:**
1. Check `DATABASE_URL` or `SUPABASE_DB_URL` in Render environment variables
2. Verify database is accessible (not paused/stopped)
3. Test connection: `psql $DATABASE_URL` (if you have access)
4. **Redeploy** backend after fixing

### Issue 3: Missing Dependencies

**Symptoms:**
- Logs show: `ModuleNotFoundError: No module named 'X'`
- Backend fails to start

**Fix:**
1. Check `requirements.txt` includes all dependencies
2. Verify `pip install -r requirements.txt` runs successfully
3. **Redeploy** backend

### Issue 4: Wrong Backend URL in Frontend

**Symptoms:**
- Frontend shows 503 but backend is running
- Network tab shows requests to wrong URL

**Fix:**
1. Check `NEXT_PUBLIC_API_URL` in Vercel
2. Should match your Render backend URL exactly
3. **Redeploy** frontend after fixing

### Issue 5: Port Binding Error

**Symptoms:**
- Logs show: `Address already in use` or port errors
- Backend fails to start

**Fix:**
1. Render automatically sets `PORT` environment variable
2. Backend should use: `port = int(os.getenv('PORT', 8000))`
3. Check `main.py` uses `PORT` env var correctly

## Step-by-Step Recovery

### If Backend is Down:

1. **Check Render Dashboard**
   - Is service stopped? → Click "Manual Deploy"
   - Is it building? → Wait for completion

2. **Check Logs**
   - Look for error messages
   - Common: Database connection, missing env vars, import errors

3. **Fix Issues**
   - Add missing environment variables
   - Fix database connection
   - Fix code errors

4. **Redeploy**
   - Click "Manual Deploy" in Render
   - Wait for deployment (2-5 minutes)

5. **Verify**
   - Check logs for "Application startup complete"
   - Test backend URL directly: `https://your-backend.onrender.com/health` (if you have a health endpoint)

### If Frontend Can't Reach Backend:

1. **Check `NEXT_PUBLIC_API_URL` in Vercel**
   - Should be your Render backend URL
   - Example: `https://aidjobs-backend.onrender.com`

2. **Redeploy Frontend**
   - After changing env vars, redeploy frontend

3. **Test Backend Directly**
   - Open: `https://your-backend.onrender.com/admin/sources` (should require auth)
   - If it works, backend is fine → frontend config issue
   - If 503, backend is down → fix backend first

## Quick Health Check

Test if backend is responding:

```bash
# Replace with your actual backend URL
curl https://your-backend.onrender.com/admin/sources

# Should return:
# - 401 (unauthorized) = Backend is running ✅
# - 503 = Backend is down ❌
# - Connection refused = Backend is down ❌
```

## Prevention

1. **Monitor Render Dashboard** - Check service status regularly
2. **Set up Alerts** - Render can email you if service goes down
3. **Health Endpoint** - Add `/health` endpoint to backend for monitoring
4. **Database Monitoring** - Ensure database doesn't pause/stop

## Still Not Working?

1. **Check Render Status Page** - https://status.render.com
2. **Check Database Status** - Supabase dashboard if using Supabase
3. **Review Recent Changes** - Did you change code/env vars recently?
4. **Check Resource Limits** - Free tier has limits (may need to upgrade)


