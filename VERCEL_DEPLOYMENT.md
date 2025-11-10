# Vercel Deployment Guide

## Quick Start

### 1. Connect GitHub Repository to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `apps/frontend`
   - **Build Command**: `npm run build` (or leave default)
   - **Output Directory**: `.next` (or leave default)
   - **Install Command**: `npm ci` (or leave default)

### 2. Set Environment Variables

In Vercel Dashboard → Settings → Environment Variables, add:

**Required:**
- `NEXT_PUBLIC_API_URL` - Your backend API URL (e.g., `https://your-backend.onrender.com`)

**Optional:**
- `NEXT_PUBLIC_AIDJOBS_ENV` - Set to `production` (default) or `dev`

Set these for:
- **Production** environment
- **Preview** environment (for PR deployments)
- **Development** environment (optional, for local testing)

### 3. Deploy

Vercel will automatically:
- Detect Next.js
- Build your application
- Deploy to production
- Create preview deployments for each PR

## Configuration

### Monorepo Setup

Vercel automatically detects Next.js in monorepos. If you need explicit configuration, create `vercel.json` in the root:

```json
{
  "buildCommand": "cd apps/frontend && npm ci && npm run build",
  "outputDirectory": "apps/frontend/.next",
  "installCommand": "npm ci",
  "framework": "nextjs",
  "rootDirectory": "apps/frontend"
}
```

**Note**: Vercel can auto-detect Next.js, so `vercel.json` is optional.

### Node.js Version

The frontend `package.json` specifies Node.js 20.x:
```json
{
  "engines": {
    "node": "20.x"
  }
}
```

Vercel will automatically use Node.js 20 for builds.

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://aidjobs-api.onrender.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_AIDJOBS_ENV` | Environment mode | `production` |

## Backend CORS Configuration

After deploying to Vercel, update your backend CORS to allow Vercel domains:

```python
allow_origins=[
    "http://localhost:5000",
    "https://*.vercel.app",  # Allows all Vercel deployments
]
```

The wildcard `*.vercel.app` covers:
- Production: `your-app.vercel.app`
- Preview: `your-app-git-branch-username.vercel.app`

## Custom Domain

If you have a custom domain:

1. In Vercel Dashboard → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed
4. Update backend CORS to include your custom domain

## Troubleshooting

### Build Fails

1. **Check build logs** in Vercel Dashboard
2. **Verify Node.js version** - Should be 20.x (specified in `package.json`)
3. **Check environment variables** - Ensure `NEXT_PUBLIC_API_URL` is set
4. **Verify root directory** - Should be `apps/frontend`

### API Calls Fail

1. **Check CORS** - Ensure backend allows `*.vercel.app`
2. **Verify `NEXT_PUBLIC_API_URL`** - Must be the full backend URL
3. **Check backend logs** - Verify requests are reaching the backend

### Preview Deployments Not Working

- Preview deployments are created automatically for each PR
- They use the same environment variables as Production (unless configured separately)
- Check that `NEXT_PUBLIC_API_URL` is set for Preview environment

## Advantages of Vercel

- ✅ Native Next.js support (optimized builds)
- ✅ Automatic preview deployments for PRs
- ✅ Edge functions support
- ✅ Built-in analytics
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Zero-config deployments

## Migration from Netlify

If migrating from Netlify:
- ✅ No `netlify.toml` needed
- ✅ No build plugins required
- ✅ Automatic Next.js optimization
- ✅ Better performance out of the box

## Support

For issues:
1. Check Vercel build logs
2. Verify environment variables
3. Check backend CORS configuration
4. Review Next.js documentation: https://nextjs.org/docs

