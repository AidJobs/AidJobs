# Quick Start: Deploy to Netlify

## ✅ What Was Fixed

1. **Fixed `netlify.toml`** - Corrected build configuration for monorepo
2. **Created Pre-Deployment Check Script** - Catches issues before deployment
3. **Verified All Dependencies** - Ensured all packages are properly configured
4. **Checked TypeScript & ESLint** - All checks passing
5. **Verified Environment Variables** - All have proper fallbacks
6. **Created Documentation** - Comprehensive deployment guides

## 🚀 Deployment Steps

### Step 1: Set Environment Variables in Netlify

Go to **Netlify Dashboard** → **Site settings** → **Environment variables** and add:

```
NEXT_PUBLIC_API_URL=https://aidjobs-backend.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://yijlbzlzfahubwukulkv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_MEILI_HOST=https://aidjobs-meili-dev.onrender.com
NEXT_PUBLIC_AIDJOBS_ENV=dev
```

### Step 2: Verify Pre-Deployment Checks

Run locally before deploying:
```bash
npm run pre-deploy
```

This will check:
- ✅ Node version
- ✅ Package files
- ✅ TypeScript compilation
- ✅ ESLint
- ✅ Configuration files

### Step 3: Commit and Push

```bash
git add .
git commit -m "fix: configure Netlify deployment for monorepo"
git push origin main
```

### Step 4: Monitor Deployment

1. Go to Netlify Dashboard
2. Watch the build logs
3. If it fails, check the error message
4. Run `npm run pre-deploy` locally to catch issues

## 🔍 If Deployment Fails

### Check Build Logs
Look for the first error in Netlify build logs. Common issues:

1. **"Cannot find module"** → Dependencies not installed
   - Solution: Ensure `package-lock.json` is committed

2. **"Build command failed"** → Workspace command failing
   - Solution: Verify npm version is 7+ (Netlify uses Node 20)

3. **"Environment variable not found"** → Missing env vars
   - Solution: Set all `NEXT_PUBLIC_*` variables in Netlify

4. **"TypeScript errors"** → Type errors in code
   - Solution: Run `npx tsc --project apps/frontend/tsconfig.json --noEmit`

### Run Pre-Deployment Checks
```bash
npm run pre-deploy
```

This will catch most issues before deployment.

## 📋 Pre-Deployment Checklist

Before deploying, ensure:

- [ ] All environment variables set in Netlify
- [ ] `package-lock.json` is committed
- [ ] Pre-deployment checks pass: `npm run pre-deploy`
- [ ] TypeScript compiles: `npx tsc --project apps/frontend/tsconfig.json --noEmit`
- [ ] ESLint passes: `npm run --workspace=apps/frontend lint`
- [ ] Local build works: `npm ci && npm run --workspace=apps/frontend build`

## 📚 Documentation

- **`NETLIFY_DEPLOYMENT.md`** - Comprehensive deployment guide
- **`DEPLOYMENT_FIXES.md`** - Detailed list of fixes applied
- **`scripts/pre-deploy-check.js`** - Pre-deployment check script

## 🆘 Troubleshooting

### Issue: Different errors on each deployment

**Solution:** The pre-deployment check script now catches issues before deployment. Run it before each deploy.

### Issue: Build succeeds but site shows errors

**Solution:** 
1. Check browser console for errors
2. Verify environment variables are set in Netlify
3. Check Netlify function logs for API route errors
4. Verify backend API is accessible

### Issue: "Plugin not found" errors

**Solution:** The Next.js plugin is auto-installed by Netlify. If errors occur, check build logs for plugin installation issues.

## ✅ What's Been Verified

- ✅ TypeScript compilation - No errors
- ✅ ESLint - Only warnings (non-blocking)
- ✅ All dependencies - Properly configured
- ✅ Environment variables - All have fallbacks
- ✅ Netlify configuration - Correctly set up
- ✅ Pre-deployment checks - All passing

## 🎯 Next Steps

1. **Set environment variables in Netlify**
2. **Run pre-deployment checks:** `npm run pre-deploy`
3. **Commit and push changes**
4. **Monitor Netlify build logs**
5. **Verify site works after deployment**

## 📞 Support

If issues persist:
1. Check Netlify build logs for specific error
2. Run `npm run pre-deploy` to catch issues locally
3. Verify all environment variables are set
4. Check that `package-lock.json` is committed
5. Ensure Node version matches (20.x)

---

**Ready to deploy!** Follow the steps above and monitor the build logs. The pre-deployment check script will catch most issues before deployment.

