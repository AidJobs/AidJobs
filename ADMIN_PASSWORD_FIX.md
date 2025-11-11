# Admin Password Fix Guide

## Issue
Admin login fails with "Invalid password" even though password matches `admin_password` in Render.

## Root Cause
1. **Environment variable name mismatch**: Code expects `ADMIN_PASSWORD` (uppercase), but you have `admin_password` (lowercase)
2. **Missing COOKIE_SECRET**: Session cookies require `COOKIE_SECRET` or `SESSION_SECRET` environment variable

## Quick Fix Steps

### Step 1: Check Current Environment Variables in Render
1. Go to your Render dashboard
2. Navigate to your backend service
3. Go to "Environment" tab
4. Check for:
   - `admin_password` (lowercase) - ❌ Wrong name
   - `ADMIN_PASSWORD` (uppercase) - ✅ Correct name
   - `COOKIE_SECRET` or `SESSION_SECRET` - ❌ Might be missing

### Step 2: Update Environment Variables in Render

**Option A: Rename existing variable**
1. Delete `admin_password` (if it exists)
2. Add `ADMIN_PASSWORD` with the same value
3. Make sure there are no extra spaces or newlines in the value

**Option B: Add new variable (if admin_password doesn't exist)**
1. Add `ADMIN_PASSWORD` with your password
2. Make sure password is exactly as you expect (no trailing spaces)

### Step 3: Add COOKIE_SECRET

1. Generate a random secret (run locally):
   ```bash
   # Windows PowerShell
   python -c "import secrets; print(secrets.token_hex(32))"
   
   # Linux/Mac
   openssl rand -hex 32
   ```

2. Add to Render environment variables:
   - **Name**: `COOKIE_SECRET`
   - **Value**: (the random string you generated, e.g., `a1b2c3d4e5f6...`)
   - **Example**: `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456`

### Step 4: Restart Backend Service

1. In Render dashboard, click "Manual Deploy" → "Deploy latest commit"
2. Or click "Restart" button
3. Wait for deployment to complete (usually 1-2 minutes)

### Step 5: Test Login

1. Go to `https://your-frontend.vercel.app/admin/login`
2. Enter your password
3. Should successfully login and redirect to `/admin`

## Environment Variables Required

### Backend (Render)
```bash
# Required for admin authentication
ADMIN_PASSWORD=your-password-here

# Required for session cookies (choose one)
COOKIE_SECRET=your-random-secret-here
# OR
SESSION_SECRET=your-random-secret-here
```

### Frontend (Vercel)
```bash
# Required for API calls
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

## Troubleshooting

### Still getting "Invalid password"?
1. **Check password value**: 
   - Make sure `ADMIN_PASSWORD` value is exactly correct (no extra spaces)
   - Copy-paste the password to avoid typos
   - Check for hidden characters

2. **Check case sensitivity**: 
   - Environment variable names are case-sensitive
   - Must be exactly `ADMIN_PASSWORD` (uppercase)

3. **Check deployment**: 
   - Make sure backend service restarted after adding env var
   - Check Render logs for any errors
   - Wait for deployment to complete

4. **Check logs**: 
   - Look at Render logs for authentication errors
   - Check for "Admin not configured" messages
   - Check for "Server configuration error" messages

### Getting "Admin not configured"?
- This means `ADMIN_PASSWORD` is not set or is empty
- Make sure `ADMIN_PASSWORD` is set in Render environment variables
- Check that the value is not empty (no spaces only)

### Getting "Server configuration error"?
- This means `COOKIE_SECRET` or `SESSION_SECRET` is missing
- Add one of these environment variables with a random secret
- Make sure the secret is at least 32 characters long

### Session not persisting?
- Check that `COOKIE_SECRET` or `SESSION_SECRET` is set
- Check browser cookies (should see `aidjobs_admin_session` cookie)
- Check that backend and frontend are on same domain (or CORS is configured)
- Check that cookies are not being blocked by browser

### CORS Issues?
- Make sure backend CORS is configured for your frontend domain
- Check `apps/backend/main.py` for CORS settings
- Frontend domain should be in `allow_origins` list

## Verification Checklist

After fixing, you should be able to:
- [ ] Login at `/admin/login` → should succeed
- [ ] Access `/admin` dashboard → should work
- [ ] Access `/admin/sources` → should work
- [ ] Create API source → should work
- [ ] Test/Simulate API source → should work
- [ ] Session persists for 8 hours → should work
- [ ] Can logout and login again → should work

## Security Notes

1. **Never commit passwords to git**
2. **Use strong passwords** (at least 16 characters)
3. **Use random secrets** for `COOKIE_SECRET` (at least 32 characters)
4. **Rotate secrets** periodically (every 3-6 months)
5. **Use environment variables** for all secrets (never hardcode)
6. **Don't share secrets** in logs or error messages

## Quick Fix Checklist

- [ ] Rename `admin_password` → `ADMIN_PASSWORD` in Render (uppercase)
- [ ] Verify password value is correct (no extra spaces)
- [ ] Generate random secret for `COOKIE_SECRET`
- [ ] Add `COOKIE_SECRET` to Render environment variables
- [ ] Restart backend service in Render
- [ ] Wait for deployment to complete
- [ ] Test login at `/admin/login`
- [ ] Verify session persists
- [ ] Verify can access admin pages

## Still Having Issues?

1. **Check Render logs** for errors:
   - Go to Render dashboard → Your service → Logs
   - Look for authentication errors
   - Look for configuration errors

2. **Verify environment variables** are set correctly:
   - Go to Render dashboard → Your service → Environment
   - Check that `ADMIN_PASSWORD` is set (uppercase)
   - Check that `COOKIE_SECRET` is set
   - Verify values are correct (no extra spaces)

3. **Check that backend service is running**:
   - Go to Render dashboard → Your service → Metrics
   - Check that service is running and healthy

4. **Verify frontend can reach backend API**:
   - Check `NEXT_PUBLIC_API_URL` in Vercel
   - Test API endpoint: `https://your-backend.onrender.com/api/healthz`
   - Should return 200 OK

5. **Check browser console** for errors:
   - Open browser DevTools → Console
   - Look for JavaScript errors
   - Look for network errors

6. **Check network tab** for API responses:
   - Open browser DevTools → Network
   - Try to login
   - Check `/api/admin/login` request/response
   - Should return 200 OK with `{"authenticated": true}`

## Test Script

You can test the admin authentication with this curl command:

```bash
# Test login (replace with your actual backend URL and password)
curl -X POST https://your-backend.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your-password"}' \
  -c cookies.txt \
  -v

# Should return: {"authenticated": true}
# And set cookie: aidjobs_admin_session=...

# Test session (use cookie from previous request)
curl -X GET https://your-backend.onrender.com/api/admin/session \
  -b cookies.txt \
  -v

# Should return: {"authenticated": true}
```

## Next Steps

After fixing the password issue:
1. ✅ Test admin login
2. ✅ Test creating API sources
3. ✅ Test Phase 1 features
4. ✅ Continue with Phase 2 implementation
5. ✅ Improve admin UI (after Phase 2)

