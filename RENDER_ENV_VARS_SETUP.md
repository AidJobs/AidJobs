# Render Environment Variables Setup

## Quick Setup Guide

### Step 1: Generate COOKIE_SECRET

Run this command to generate a secure random secret:
```bash
cd apps/backend
python scripts/generate_cookie_secret.py
```

Or generate manually:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Step 2: Add to Render

1. Go to: https://dashboard.render.com
2. Select your backend service
3. Click "Environment" tab
4. Add/Update these variables:

#### Required Variables:

**1. ADMIN_PASSWORD**
- **Name**: `ADMIN_PASSWORD` (uppercase, exactly as shown)
- **Value**: Your admin password (exact password, no extra spaces)
- **Action**: 
  - If `admin_password` (lowercase) exists, delete it first
  - Add `ADMIN_PASSWORD` (uppercase) with the same password value

**2. COOKIE_SECRET**
- **Name**: `COOKIE_SECRET`
- **Value**: (paste the generated secret from Step 1)
- **Example**: `a8d71fe5f781b18752fa6050f87271601cc6432197c096d4bbdbe24abec8acc7`

### Step 3: Restart Service

1. After adding variables, Render will automatically restart
2. Or manually click "Restart" button
3. Wait for deployment to complete (1-2 minutes)

### Step 4: Test

1. Go to: `https://your-frontend.vercel.app/admin/login`
2. Enter your password
3. Should successfully login!

## Generated COOKIE_SECRET

Here's a pre-generated COOKIE_SECRET you can use:

```
COOKIE_SECRET=a8d71fe5f781b18752fa6050f87271601cc6432197c096d4bbdbe24abec8acc7
```

**Note**: This is a random secret. You can generate a new one if you prefer.

## Common Mistakes

### ❌ Wrong: `admin_password` (lowercase)
### ✅ Correct: `ADMIN_PASSWORD` (uppercase)

### ❌ Wrong: Password with trailing spaces
### ✅ Correct: Password without extra spaces

### ❌ Wrong: Forgetting to add COOKIE_SECRET
### ✅ Correct: Add both ADMIN_PASSWORD and COOKIE_SECRET

## Verification

After setting up, run the diagnostic script:
```bash
cd apps/backend
python scripts/check_admin_config.py
```

This will check if all required variables are set correctly.

## Troubleshooting

### Issue: "Invalid password"
**Solution**: 
- Check that `ADMIN_PASSWORD` is set (uppercase)
- Check that password value is exactly correct (no extra spaces)
- Restart backend service after adding variable

### Issue: "Admin not configured"
**Solution**: 
- `ADMIN_PASSWORD` is not set or is empty
- Make sure `ADMIN_PASSWORD` is set in Render

### Issue: "Server configuration error"
**Solution**: 
- `COOKIE_SECRET` is missing
- Add `COOKIE_SECRET` to Render environment variables

### Issue: Session not persisting
**Solution**: 
- Check that `COOKIE_SECRET` is set
- Check browser cookies (should see `aidjobs_admin_session` cookie)
- Check CORS configuration in backend

## Next Steps

After fixing the password:
1. ✅ Test admin login
2. ✅ Test creating API sources
3. ✅ Test Phase 1 features
4. ✅ Continue with Phase 2 implementation

