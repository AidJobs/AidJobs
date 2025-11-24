# Meilisearch Setup on Render - Enterprise Grade

This guide shows you how to set up Meilisearch as a self-hosted service on Render for enterprise-grade reliability.

## Option 1: Render Web Service (Recommended)

### Step 1: Create a New Web Service on Render

1. Go to your Render dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repository (or create a new one)

### Step 2: Configure the Service

**Build Command:**
```bash
# No build needed - we'll use Docker
echo "Using Docker image"
```

**Start Command:**
```bash
docker run -d \
  --name meilisearch \
  -p 10000:7700 \
  -e MEILI_MASTER_KEY=${MEILISEARCH_KEY} \
  -v meili_data:/meili_data \
  getmeili/meilisearch:v1.11 \
  ./meili_data
```

**OR use Render's Docker support:**

Create a `Dockerfile` in your repo root:

```dockerfile
FROM getmeili/meilisearch:v1.11

# Meilisearch runs on port 7700 by default
EXPOSE 7700

# Use persistent volume for data
VOLUME ["/meili_data"]

# Start Meilisearch
CMD ["./meili_data"]
```

Then in Render:
- **Build Command:** `docker build -t meilisearch .`
- **Start Command:** `docker run -p 10000:7700 -e MEILI_MASTER_KEY=$MEILISEARCH_KEY meilisearch`

### Step 3: Environment Variables

Set these in Render dashboard:

- **MEILISEARCH_KEY**: Generate with `openssl rand -hex 32` (keep this secret!)
- **PORT**: Set to `7700` (or use Render's auto-assigned port)

### Step 4: Persistent Disk

1. In Render dashboard, go to your Meilisearch service
2. Click "Disks" → "Mount Disk"
3. Create a new disk (e.g., `meili_data`) with at least 1GB
4. Mount it at `/meili_data`

### Step 5: Health Check

Set health check URL in Render:
- **Health Check Path:** `/health`
- **Health Check Interval:** 10 seconds

### Step 6: Update Backend Environment Variables

In your **backend service** on Render, set:

```
MEILISEARCH_URL=https://your-meilisearch-service.onrender.com
MEILISEARCH_KEY=<same-key-as-meilisearch-service>
MEILI_JOBS_INDEX=jobs_index
AIDJOBS_ENABLE_SEARCH=true
```

**Important:** Use the **public URL** of your Meilisearch service (Render provides this automatically).

## Option 2: Render Background Worker (Alternative)

If you prefer a background worker instead of a web service:

1. Create a new "Background Worker" on Render
2. Use the same Docker setup as above
3. Note: Background workers don't get public URLs, so you'll need to use internal networking or expose via a web service

## Option 3: Separate Render Account/Project

For maximum isolation:

1. Create a separate Render project just for Meilisearch
2. Use the same setup as Option 1
3. This ensures Meilisearch restarts don't affect your backend

## Verification

After setup, verify Meilisearch is running:

```bash
# Check health
curl https://your-meilisearch-service.onrender.com/health

# Should return: {"status":"available"}
```

Then check from your backend:

```bash
# From your backend service logs or via API
curl https://your-backend.onrender.com/api/admin/diagnostics/meili-openrouter
```

## Troubleshooting

### Issue: "Connection refused" or "Timeout"

**Solutions:**
1. Check that Meilisearch service is running (green status in Render)
2. Verify `MEILISEARCH_URL` in backend points to the correct Meilisearch service URL
3. Check Render logs for Meilisearch service errors
4. Ensure health check is passing

### Issue: "Index not found"

**Solution:**
1. Initialize the index: `POST /api/admin/search/init`
2. Reindex jobs: `POST /api/admin/search/reindex`

### Issue: Data lost after restart

**Solution:**
1. Ensure persistent disk is mounted at `/meili_data`
2. Verify disk is attached in Render dashboard
3. Check disk usage (should grow as jobs are indexed)

### Issue: Slow search performance

**Solutions:**
1. Upgrade to a higher-tier Render plan (more CPU/RAM)
2. Optimize index settings (already configured in code)
3. Consider using Meilisearch Cloud for better performance

## Monitoring

### Health Checks

The backend automatically checks Meilisearch health every 60 seconds and attempts reconnection if needed.

### Logs

Monitor Meilisearch logs in Render:
- Look for errors or warnings
- Check disk usage
- Monitor memory/CPU usage

### Alerts

Set up Render alerts for:
- Service downtime
- High memory usage
- Disk space warnings

## Backup Strategy

### Manual Backup

```bash
# Export Meilisearch data (run from Meilisearch service)
curl -X GET "https://your-meilisearch.onrender.com/dumps" \
  -H "Authorization: Bearer ${MEILISEARCH_KEY}"
```

### Automated Backup

1. Use Render's scheduled jobs to run backups daily
2. Store backups in S3 or another cloud storage
3. Test restore process regularly

## Security

1. **Never commit `MEILISEARCH_KEY` to Git** - use Render environment variables only
2. **Use HTTPS** - Render provides this automatically
3. **Restrict access** - Meilisearch should only be accessible by your backend
4. **Rotate keys** - Change `MEILISEARCH_KEY` periodically

## Cost Optimization

- Start with Render's free tier (spins down after inactivity)
- Upgrade to paid tier for always-on service
- Monitor usage and adjust plan as needed
- Consider Meilisearch Cloud for production (better SLA)

## Next Steps

1. Deploy Meilisearch service on Render
2. Update backend environment variables
3. Initialize and reindex: `POST /api/admin/search/init` then `POST /api/admin/search/reindex`
4. Verify search is working: Check `/api/search/status`
5. Monitor logs and performance

## Support

If you encounter issues:
1. Check Render service logs
2. Check backend logs for Meilisearch connection errors
3. Use diagnostic endpoint: `/api/admin/diagnostics/meili-openrouter`
4. Review Meilisearch documentation: https://www.meilisearch.com/docs

