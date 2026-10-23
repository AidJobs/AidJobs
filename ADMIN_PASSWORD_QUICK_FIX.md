# Admin Password Quick Fix

## 🎯 The Issue
- Environment variable name is wrong: `admin_password` (lowercase) → should be `ADMIN_PASSWORD` (uppercase)
- Missing `COOKIE_SECRET` for session cookies

## ⚡ Quick Fix (5 Minutes)

### 1. Generate COOKIE_SECRET

Run this command:
```bash
cd apps/backend
python scripts/generate_cookie_secret.py
```

**Or use this pre-generated secret:**
```
<generate a new value; never commit it>
```

### 2. Update Render Environment Variables

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Select your backend service**
3. **Click "Environment" tab**
4. **Fix ADMIN_PASSWORD**:
   - If `admin_password` (lowercase) exists: **Delete it**
   - Add new variable: `ADMIN_PASSWORD` (uppercase)
   - Value: Your password (exact same, no extra spaces)
5. **Add COOKIE_SECRET**:
   - Name: `COOKIE_SECRET`
   - Value: `<generate a new value; never commit it>`
6. **Save** - Render will auto-restart
7. **Wait** for deployment (1-2 minutes)

### 3. Test Login

1. Go to: `https://your-frontend.vercel.app/admin/login`
2. Enter your password
3. Should work! ✅

## ✅ Verification

After fixing, you should be able to:
- [ ] Login at `/admin/login`
- [ ] Access `/admin` dashboard
- [ ] Access `/admin/sources`
- [ ] Create API sources
- [ ] Test/Simulate API sources

## 🐛 Still Not Working?

1. **Check variable names** are correct (case-sensitive):
   - ✅ `ADMIN_PASSWORD` (uppercase)
   - ✅ `COOKIE_SECRET` (uppercase)
   - ❌ `admin_password` (lowercase) - should be deleted

2. **Check password value** has no extra spaces

3. **Check backend restarted** in Render (check logs)

4. **Check CORS** - Make sure your frontend domain is in backend CORS config

## 📋 Environment Variables Summary

### Render (Backend):
```bash
ADMIN_PASSWORD=<generate a new value; never commit it>
COOKIE_SECRET=<generate a new value; never commit it>
```

### Vercel (Frontend):
```bash
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

## 🚀 Next Steps

After fixing:
1. ✅ Test admin login
2. ✅ Test creating API sources
3. ✅ Test Phase 1 features
4. ✅ Continue with Phase 2

## 📚 Detailed Guides

- `FIX_ADMIN_PASSWORD_STEP_BY_STEP.md` - Detailed step-by-step guide
- `ADMIN_PASSWORD_FIX.md` - Comprehensive fix guide
- `ENVIRONMENT_VARIABLES_CHECKLIST.md` - All environment variables
- `RENDER_ENV_VARS_SETUP.md` - Render setup guide

