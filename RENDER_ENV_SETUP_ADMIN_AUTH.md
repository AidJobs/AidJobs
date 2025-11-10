# Render Environment Setup - Admin Authentication

## Quick Setup Guide

### Step 1: Generate COOKIE_SECRET

Run this command locally:
```bash
cd apps/backend
python scripts/generate_cookie_secret.py
```

Or generate manually:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Copy the generated secret (it will be a long hex string like `a1b2c3d4e5f6...`)

### Step 2: Set Environment Variables in Render

Go to Render Dashboard → Your Backend Service → Environment → Add Environment Variable

**Required Variables**:

1. **COOKIE_SECRET** (REQUIRED)
   - Name: `COOKIE_SECRET`
   - Value: Paste the generated secret from Step 1
   - Example: `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456`

2. **AIDJOBS_ENV** (OPTIONAL - for dev mode)
   - Name: `AIDJOBS_ENV`
   - Value: `dev` (for dev mode bypass) or `production` (for production)
   - If set to `dev`: Allows login without password if `ADMIN_PASSWORD` is not set
   - If not set: Defaults to production mode

3. **ADMIN_PASSWORD** (OPTIONAL in dev mode, REQUIRED in production)
   - Name: `ADMIN_PASSWORD`
   - Value: Your admin password (no spaces, case-sensitive)
   - If `AIDJOBS_ENV=dev` and this is not set: Any password works
   - If `AIDJOBS_ENV=dev` and this is set: Requires correct password
   - If production mode: This is REQUIRED

### Step 3: Restart Backend

**IMPORTANT**: After adding/changing environment variables, you MUST restart your backend service in Render.

1. Go to Render Dashboard → Your Backend Service
2. Click "Manual Deploy" → "Clear build cache & deploy"
3. Or click "Restart" if available

### Step 4: Test Configuration

1. **Test Diagnostic Endpoint**:
   ```
   GET https://aidjobs-backend.onrender.com/api/admin/config-check
   ```
   
   Expected response:
   ```json
   {
     "admin_password_set": true/false,
     "admin_password_length": 0,
     "cookie_secret_set": true,
     "cookie_secret_length": 64,
     "aidjobs_env": "dev",
     "is_dev_mode": true,
     "admin_configured": true,
     "status": "ok",
     "recommendations": []
   }
   ```

2. **Test Login**:
   - Go to `https://www.aidjobs.app/admin/login`
   - Enter password (any password if `AIDJOBS_ENV=dev` and `ADMIN_PASSWORD` not set)
   - Should redirect to `/admin` on success

### Step 5: Check Backend Logs

After attempting login, check Render logs for:
- `[admin_login] Login attempt from ...`
- `[admin_login] Login successful` or `[admin_login] Invalid password attempt`

## Troubleshooting

### Issue: "COOKIE_SECRET not configured"

**Solution**:
1. Verify `COOKIE_SECRET` is set in Render (exact name, no typos)
2. Verify value is a long random string (64+ characters)
3. Restart backend after adding

### Issue: "Admin not configured"

**Solution**:
1. Set `AIDJOBS_ENV=dev` in Render, OR
2. Set `ADMIN_PASSWORD` in Render

### Issue: "Invalid password"

**Solution**:
1. If `AIDJOBS_ENV=dev` and `ADMIN_PASSWORD` not set: Any password should work
2. If `ADMIN_PASSWORD` is set: Enter the exact password (no spaces, case-sensitive)
3. Check backend logs for error details
4. Verify backend was restarted after changes

### Issue: Login works but can't access admin pages

**Solution**:
1. Check browser cookies (Dev Tools → Application → Cookies)
2. Verify cookie `aidjobs_admin_session` is set
3. Check if cookie is httpOnly and has correct domain
4. Test session endpoint: `GET /api/admin/session`

## Environment Variable Checklist

- [ ] `COOKIE_SECRET` is set (64+ character random hex string)
- [ ] `AIDJOBS_ENV` is set to `dev` (for testing) or `production` (for production)
- [ ] `ADMIN_PASSWORD` is set (optional in dev mode, required in production)
- [ ] Backend service was restarted after changes
- [ ] Diagnostic endpoint shows all checks passing
- [ ] Login works through frontend
- [ ] Can access admin pages after login

## Security Recommendations

1. **Production**: Set `AIDJOBS_ENV=production` (or don't set it)
2. **Production**: Set a strong `ADMIN_PASSWORD` (16+ characters, mix of letters, numbers, symbols)
3. **Production**: Use a strong `COOKIE_SECRET` (64+ characters)
4. **Never commit**: Environment variables to git
5. **Rotate**: Change `COOKIE_SECRET` and `ADMIN_PASSWORD` periodically

## Quick Test

After setup, test with:

```bash
# Test diagnostic endpoint
curl https://aidjobs-backend.onrender.com/api/admin/config-check

# Test login (replace YOUR_PASSWORD with your password)
curl -X POST https://aidjobs-backend.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "YOUR_PASSWORD"}'
```

Expected response for login:
- `200 OK` with `{"authenticated": true}` = Success
- `401 Unauthorized` with `{"detail": "Invalid credentials"}` = Wrong password
- `503 Service Unavailable` with `{"detail": "Admin not configured"}` = Missing ADMIN_PASSWORD
- `500 Internal Server Error` with `{"detail": "COOKIE_SECRET not configured"}` = Missing COOKIE_SECRET

