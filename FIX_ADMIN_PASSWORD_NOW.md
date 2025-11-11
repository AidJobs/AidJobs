# Fix Admin Password - Quick Guide

## The Problem
You can't login to admin because:
1. Environment variable name is wrong: `admin_password` (lowercase) instead of `ADMIN_PASSWORD` (uppercase)
2. Missing `COOKIE_SECRET` for session cookies

## Quick Fix (5 Minutes)

### Step 1: Generate COOKIE_SECRET

Run this command locally to generate a random secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Or use this pre-generated secret (copy the line below):
```
COOKIE_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### Step 2: Update Render Environment Variables

1. **Go to Render Dashboard**
   - Navigate to: https://dashboard.render.com
   - Select your backend service

2. **Go to Environment Tab**
   - Click "Environment" in the left sidebar
   - You'll see all environment variables

3. **Check Current Variables**
   - Look for `admin_password` (lowercase) - ❌ This is wrong
   - Look for `ADMIN_PASSWORD` (uppercase) - ✅ This is correct
   - Look for `COOKIE_SECRET` - ❌ Probably missing

4. **Fix ADMIN_PASSWORD**
   - **If `admin_password` exists:**
     - Note the value (your password)
     - Delete `admin_password`
     - Add new variable: `ADMIN_PASSWORD` (uppercase)
     - Set value to your password (exact same value, no extra spaces)
   
   - **If `ADMIN_PASSWORD` doesn't exist:**
     - Add new variable: `ADMIN_PASSWORD`
     - Set value to your password
     - Make sure it's exactly correct (no trailing spaces)

5. **Add COOKIE_SECRET**
   - Click "Add Environment Variable"
   - Name: `COOKIE_SECRET`
   - Value: (paste the generated secret from Step 1)
   - Example: `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456`

6. **Save Changes**
   - Click "Save Changes" or similar button
   - Render will automatically restart the service

### Step 3: Wait for Deployment

1. Wait for Render to restart your service (usually 1-2 minutes)
2. Check the "Logs" tab to see when deployment completes
3. Look for "Service is live" or similar message

### Step 4: Test Login

1. Go to your admin login page: `https://your-frontend.vercel.app/admin/login`
2. Enter your password (the one you set in `ADMIN_PASSWORD`)
3. Click "Login"
4. Should redirect to `/admin` dashboard

## Verification Checklist

- [ ] `ADMIN_PASSWORD` is set in Render (uppercase)
- [ ] `COOKIE_SECRET` is set in Render (32+ characters)
- [ ] Backend service restarted in Render
- [ ] Can login at `/admin/login`
- [ ] Can access `/admin` dashboard
- [ ] Can access `/admin/sources`
- [ ] Session persists (can refresh page without logging in again)

## Troubleshooting

### Still getting "Invalid password"?
1. **Check password value**: Make sure `ADMIN_PASSWORD` value is exactly correct (no extra spaces)
2. **Check variable name**: Must be `ADMIN_PASSWORD` (uppercase), not `admin_password`
3. **Check deployment**: Make sure backend service restarted after adding env vars
4. **Check logs**: Look at Render logs for any errors

### Getting "Admin not configured"?
- `ADMIN_PASSWORD` is not set or is empty
- Make sure `ADMIN_PASSWORD` is set in Render

### Getting "Server configuration error"?
- `COOKIE_SECRET` is missing
- Add `COOKIE_SECRET` to Render environment variables

### Session not persisting?
- Check that `COOKIE_SECRET` is set
- Check browser cookies (should see `aidjobs_admin_session` cookie)
- Check that backend and frontend are on same domain (or CORS is configured)

## Environment Variables Summary

### Required in Render (Backend):
```bash
ADMIN_PASSWORD=your-password-here
COOKIE_SECRET=your-random-secret-here
```

### Required in Vercel (Frontend):
```bash
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

## Quick Copy-Paste

### Generate COOKIE_SECRET:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Test Login (after fixing):
1. Go to: `https://your-frontend.vercel.app/admin/login`
2. Enter password
3. Click "Login"
4. Should work!

## Still Having Issues?

1. **Check Render logs** for errors
2. **Verify environment variables** are set correctly
3. **Check that backend service is running**
4. **Verify frontend can reach backend API**
5. **Check browser console** for errors
6. **Check network tab** for API responses

## Next Steps After Fixing

1. ✅ Test admin login
2. ✅ Test creating API sources
3. ✅ Test Phase 1 features
4. ✅ Continue with Phase 2 implementation
5. ✅ Improve admin UI (after Phase 2)

