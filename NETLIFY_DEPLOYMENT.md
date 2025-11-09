# Netlify Deployment Guide

## Pre-Deployment Checklist

Before deploying to Netlify, ensure:

1. **Environment Variables** are set in Netlify Dashboard:
   - `NEXT_PUBLIC_API_URL` - Your backend API URL (e.g., `https://aidjobs-backend.onrender.com`)
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
   - `NEXT_PUBLIC_MEILI_HOST` - Your Meilisearch host URL
   - `NEXT_PUBLIC_AIDJOBS_ENV` - Environment (e.g., `dev` or `production`)

2. **Node Version**: Netlify will use Node 20 (specified in `.nvmrc` and `netlify.toml`)

3. **Build Command**: The build runs from repo root and uses npm workspaces

## Build Process

The build process follows these steps:

1. `npm ci` - Clean install from `package-lock.json` (from repo root)
2. `npm run --workspace=apps/frontend build` - Build the Next.js frontend
3. Netlify Next.js plugin processes the build output
4. Site is deployed

## Common Issues and Solutions

### Issue 1: "Cannot find module" errors

**Cause**: Dependencies not properly installed or workspace resolution failing

**Solution**: 
- Ensure `package-lock.json` is committed to git
- Verify npm workspaces are configured correctly in root `package.json`
- Check that all dependencies are listed in `apps/frontend/package.json`

### Issue 2: "Build command failed" with workspace errors

**Cause**: npm workspace command not working correctly

**Solution**:
- Verify you're using npm 7+ (workspaces require npm 7+)
- Check that `package-lock.json` is up to date
- Try regenerating lockfile: `rm package-lock.json && npm install`

### Issue 3: "Next.js plugin not found" or plugin errors

**Cause**: Plugin not installed or configured incorrectly

**Solution**:
- The plugin is auto-installed by Netlify, but ensure `netlify.toml` has the plugin configuration
- Check Netlify build logs for plugin installation errors

### Issue 4: Environment variables not available

**Cause**: Variables not set in Netlify dashboard or not prefixed with `NEXT_PUBLIC_`

**Solution**:
- Set all required environment variables in Netlify: Site settings → Environment variables
- Ensure client-side variables are prefixed with `NEXT_PUBLIC_`
- Redeploy after adding variables

### Issue 5: TypeScript errors during build

**Cause**: Type errors in the codebase

**Solution**:
- Run `npx tsc --project apps/frontend/tsconfig.json --noEmit` locally
- Fix all TypeScript errors before deploying
- Ensure `tsconfig.json` excludes test files

### Issue 6: ESLint errors blocking build

**Cause**: ESLint configured to fail on errors

**Solution**:
- ESLint warnings are non-blocking, but errors will fail the build
- Run `npm run --workspace=apps/frontend lint` locally
- Fix all ESLint errors (warnings are OK)

### Issue 7: Build succeeds but site shows errors

**Cause**: Runtime errors or missing environment variables

**Solution**:
- Check browser console for errors
- Verify all `NEXT_PUBLIC_*` environment variables are set
- Check Netlify function logs for API route errors
- Verify backend API is accessible from Netlify

## Testing Locally Before Deployment

Run these commands to test the build process locally:

```bash
# 1. Clean install (simulates Netlify)
npm ci

# 2. Run pre-deployment checks
npm run pre-deploy

# 3. Build the frontend
npm run --workspace=apps/frontend build

# 4. Test the build output
cd apps/frontend
npm start
```

## Netlify Configuration

The `netlify.toml` file is configured for:

- **Base directory**: Repo root (for workspace support)
- **Build command**: `npm ci && npm run --workspace=apps/frontend build`
- **Publish directory**: `apps/frontend/.next` (Next.js build output)
- **Node version**: 20 (specified in build environment)
- **Next.js plugin**: Auto-installed and configured for SSR/API routes

## Troubleshooting Steps

1. **Check Build Logs**: Look for the first error in Netlify build logs
2. **Run Pre-Deploy Script**: `npm run pre-deploy` to catch common issues
3. **Test Locally**: Ensure build works locally before deploying
4. **Verify Environment Variables**: Check Netlify dashboard for all required variables
5. **Check Dependencies**: Ensure `package-lock.json` is up to date and committed
6. **Clear Build Cache**: In Netlify, try "Clear cache and deploy site"

## Support

If issues persist:

1. Check Netlify build logs for specific error messages
2. Run the pre-deployment check script: `node scripts/pre-deploy-check.js`
3. Verify all files are committed to git
4. Ensure `package-lock.json` is not in `.gitignore`
5. Check that Node version matches (20.x)

## Quick Fixes

### Regenerate package-lock.json
```bash
rm package-lock.json
npm install
git add package-lock.json
git commit -m "chore: regenerate package-lock.json"
```

### Clear Netlify build cache
In Netlify dashboard: Site settings → Build & deploy → Clear cache

### Force rebuild
In Netlify dashboard: Deploys → Trigger deploy → Clear cache and deploy site
