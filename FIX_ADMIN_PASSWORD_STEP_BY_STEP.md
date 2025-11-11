# Fix Admin Password - Step by Step Guide

## 🔴 The Problem
You can't login to admin because:
1. Environment variable name is **wrong**: `admin_password` (lowercase) instead of `ADMIN_PASSWORD` (uppercase)
2. Missing `COOKIE_SECRET` for session cookies

## ✅ The Solution (5 Minutes)

### Step 1: Generate COOKIE_SECRET

**Option A: Use the script**
```bash
cd apps/backend
python scripts/generate_cookie_secret.py
```

**Option B: Generate manually**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**Option C: Use this pre-generated secret**
```
4ead798b950082fc46a4c83bb5328f56c01b740921c30f2869de5fc68ba607f3
```

### Step 2: Go to Render Dashboard

1. Open: https://dashboard.render.com
2. Sign in to your account
3. Find your **backend service** (the one running FastAPI)
4. Click on it to open the service page

### Step 3: Open Environment Variables

1. Click **"Environment"** in the left sidebar
2. You'll see a list of all environment variables
3. Look for:
   - `admin_password` (lowercase) - ❌ **This is wrong**
   - `ADMIN_PASSWORD` (uppercase) - ✅ **This is correct**
   - `COOKIE_SECRET` - ❌ **Probably missing**

### Step 4: Fix ADMIN_PASSWORD

**If `admin_password` (lowercase) exists:**
1. **Note the value** (your password - copy it somewhere safe)
2. **Delete `admin_password`** (click the delete/trash icon)
3. **Click "Add Environment Variable"**
4. **Name**: `ADMIN_PASSWORD` (uppercase, exactly as shown)
5. **Value**: Paste your password (the one from step 1)
6. **Make sure** there are no extra spaces before or after the password
7. **Click "Save"**

**If `ADMIN_PASSWORD` (uppercase) already exists:**
1. **Check the value** - make sure it's exactly your password (no extra spaces)
2. **If it's wrong**, edit it and set the correct password
3. **Click "Save"**

**If neither exists:**
1. **Click "Add Environment Variable"**
2. **Name**: `ADMIN_PASSWORD` (uppercase)
3. **Value**: Your admin password
4. **Click "Save"**

### Step 5: Add COOKIE_SECRET

1. **Click "Add Environment Variable"**
2. **Name**: `COOKIE_SECRET` (exactly as shown)
3. **Value**: Paste the generated secret from Step 1
   - Example: `4ead798b950082fc46a4c83bb5328f56c01b740921c30f2869de5fc68ba607f3`
4. **Click "Save"**

### Step 6: Verify Variables

You should now have:
- ✅ `ADMIN_PASSWORD` = (your password)
- ✅ `COOKIE_SECRET` = (the generated secret)
- ❌ `admin_password` = (should be deleted if it existed)

### Step 7: Restart Backend Service

1. Render will **automatically restart** after saving environment variables
2. **OR** manually click "Restart" button
3. **Wait** for deployment to complete (usually 1-2 minutes)
4. **Check "Logs"** tab to see when it's ready
5. Look for "Service is live" or similar message

### Step 8: Test Login

1. **Go to**: `https://your-frontend.vercel.app/admin/login`
   - Replace `your-frontend.vercel.app` with your actual Vercel domain
2. **Enter your password** (the one you set in `ADMIN_PASSWORD`)
3. **Click "Login"**
4. **Should redirect** to `/admin` dashboard
5. **Success!** ✅

## 🔍 Verification Checklist

After fixing, verify:
- [ ] `ADMIN_PASSWORD` is set in Render (uppercase)
- [ ] `COOKIE_SECRET` is set in Render (64 characters)
- [ ] `admin_password` (lowercase) is deleted (if it existed)
- [ ] Backend service restarted in Render
- [ ] Can login at `/admin/login`
- [ ] Can access `/admin` dashboard
- [ ] Can access `/admin/sources`
- [ ] Session persists (can refresh page without logging in again)

## 🐛 Troubleshooting

### Still getting "Invalid password"?

1. **Check password value**:
   - Make sure `ADMIN_PASSWORD` value is exactly correct
   - No extra spaces before or after
   - Copy-paste to avoid typos
   - Check for hidden characters

2. **Check variable name**:
   - Must be exactly `ADMIN_PASSWORD` (uppercase)
   - Not `admin_password` (lowercase)
   - Case-sensitive!

3. **Check deployment**:
   - Make sure backend service restarted
   - Check Render logs for errors
   - Wait for deployment to complete

4. **Check logs**:
   - Go to Render → Your service → Logs
   - Look for authentication errors
   - Look for "Admin not configured" messages

### Getting "Admin not configured"?

- `ADMIN_PASSWORD` is not set or is empty
- Make sure `ADMIN_PASSWORD` is set in Render
- Check that the value is not empty (no spaces only)

### Getting "Server configuration error"?

- `COOKIE_SECRET` is missing
- Add `COOKIE_SECRET` to Render environment variables
- Make sure it's at least 32 characters long

### Session not persisting?

- Check that `COOKIE_SECRET` is set
- Check browser cookies (DevTools → Application → Cookies)
- Should see `aidjobs_admin_session` cookie
- Check that backend and frontend are on same domain (or CORS is configured)

### CORS Issues?

- Check backend CORS configuration in `apps/backend/main.py`
- Make sure your frontend domain is in `allow_origins` list
- Check browser console for CORS errors

## 📋 Quick Reference

### Required Environment Variables (Render)

```bash
# Admin Authentication
ADMIN_PASSWORD=your-password-here

# Session Management
COOKIE_SECRET=4ead798b950082fc46a4c83bb5328f56c01b740921c30f2869de5fc68ba607f3
```

### Generated COOKIE_SECRET

You can use this pre-generated secret:
```
4ead798b950082fc46a4c83bb5328f56c01b740921c30f2869de5fc68ba607f3
```

Or generate a new one:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

## ✅ Success Indicators

After fixing, you should see:
1. ✅ Can login at `/admin/login`
2. ✅ Redirects to `/admin` after login
3. ✅ Can access `/admin/sources`
4. ✅ Can create/edit/delete sources
5. ✅ Session persists for 8 hours
6. ✅ Can logout and login again

## 🚀 Next Steps

After fixing the password:
1. ✅ Test admin login
2. ✅ Test creating API sources
3. ✅ Test Phase 1 features (Test/Simulate buttons)
4. ✅ Continue with Phase 2 implementation
5. ✅ Improve admin UI (after Phase 2)

## 📞 Still Having Issues?

If you're still having issues after following these steps:

1. **Check Render logs** for detailed error messages
2. **Verify environment variables** are set correctly (case-sensitive)
3. **Check that backend service is running** and healthy
4. **Verify frontend can reach backend API** (check `NEXT_PUBLIC_API_URL`)
5. **Check browser console** for JavaScript errors
6. **Check network tab** for API request/response errors

## 🔐 Security Notes

1. **Never commit passwords to git**
2. **Use strong passwords** (at least 16 characters)
3. **Use random secrets** for `COOKIE_SECRET` (at least 32 characters)
4. **Rotate secrets periodically** (every 3-6 months)
5. **Don't share secrets** in logs or error messages

## 📝 Summary

**The fix is simple:**
1. Rename `admin_password` → `ADMIN_PASSWORD` (uppercase)
2. Add `COOKIE_SECRET` with a random secret
3. Restart backend service
4. Test login

**That's it!** Should take about 5 minutes.

