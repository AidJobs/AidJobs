# Environment Variables Quick Reference

## Shadow Rollout Configuration

### Render (Backend) - Add These 5 Variables

Go to **Render Dashboard → Your Backend Service → Environment Tab** and add:

```bash
EXTRACTION_USE_NEW_EXTRACTOR=true
EXTRACTION_SHADOW_MODE=true
EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org
EXTRACTION_ROLLOUT_PERCENT=100
EXTRACTION_SMOKE_LIMIT=50
```

**Click "Save Changes"** - Render will automatically redeploy.

### Vercel (Frontend) - No Variables Needed

No environment variables need to be added to Vercel for shadow rollout. This is a backend-only feature.

---

## What Each Variable Does

| Variable | Value | Purpose |
|----------|-------|---------|
| `EXTRACTION_USE_NEW_EXTRACTOR` | `true` | Enable new pipeline extractor |
| `EXTRACTION_SHADOW_MODE` | `true` | Write to shadow table (`jobs_side`) instead of production |
| `EXTRACTION_DOMAIN_ALLOWLIST` | `unicef.org,undp.org,unesco.org` | Comma-separated list of domains to test |
| `EXTRACTION_ROLLOUT_PERCENT` | `100` | Percentage of URLs to use new extractor (0-100) |
| `EXTRACTION_SMOKE_LIMIT` | `50` | Max pages for smoke test |

---

## Example: Testing 3 Domains

**Render Environment Variables:**
```
EXTRACTION_USE_NEW_EXTRACTOR=true
EXTRACTION_SHADOW_MODE=true
EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org
EXTRACTION_ROLLOUT_PERCENT=100
EXTRACTION_SMOKE_LIMIT=50
```

**Vercel:** No changes needed

---

## After Adding Variables

1. **Wait for Render to redeploy** (usually 2-3 minutes)
2. **Run a crawl** from the admin UI for one of the allowed domains
3. **Check logs** for "Using NEW pipeline extractor" message
4. **Verify shadow table**: `SELECT * FROM jobs_side LIMIT 10;`

---

## Full Documentation

See `apps/backend/docs/SHADOW_ROLLOUT_ENV_VARS.md` for complete details.

