# Diagnosing Meilisearch & OpenRouter from Backend

Since the environment variables are set in Render, you need to check what the **running backend** actually sees.

## Quick Check

Call this endpoint to see what the backend sees:

```
GET /admin/diagnostics/meili-openrouter
```

This will show:
- Which environment variables are set (from the backend's perspective)
- Whether Meilisearch is configured and connected
- Whether OpenRouter is configured
- Any errors that occurred during initialization

## Other Status Endpoints

### 1. Setup Status
```
GET /admin/setup/status
```
Shows overall status of all services (Supabase, Meilisearch, Payments, AI)

### 2. Capabilities
```
GET /api/capabilities
```
Shows which features are enabled (search, AI, etc.)

### 3. Search Status
```
GET /api/search/status
```
Shows detailed Meilisearch status including document count

## Common Issues

### Meilisearch shows "configured: false"

**Possible causes:**
1. Environment variable names don't match
   - Should be: `MEILISEARCH_URL` + `MEILISEARCH_KEY` (new format)
   - OR: `MEILI_HOST` + `MEILI_MASTER_KEY` (legacy format)
   
2. Variables set but service not redeployed
   - Render requires a redeploy after setting env vars
   - Check Render logs to see if variables are loaded

3. Variables have typos or extra spaces
   - Check for trailing spaces in Render's env var editor
   - Make sure URLs include `http://` or `https://`

### Meilisearch shows "configured: true" but "connected: false"

**Possible causes:**
1. Meilisearch instance is not running
2. URL is incorrect (wrong host/port)
3. API key is invalid
4. Network/firewall blocking connection

**Solution:**
- Verify Meilisearch is accessible from Render
- Test the URL and key manually
- Check Meilisearch logs

### OpenRouter shows "configured: false"

**Possible causes:**
1. Variable name is wrong
   - Should be exactly: `OPENROUTER_API_KEY`
   - Not `OPEN_ROUTER_API_KEY` or `OPENROUTER_KEY`

2. API key is invalid or expired
   - Get a new key from https://openrouter.ai/keys

3. Service not redeployed after setting variable

### Services initialized but not working

If the diagnostic shows services are configured and connected, but features don't work:

1. **Meilisearch:**
   - Check if index is initialized: `POST /admin/search/init`
   - Check if jobs are indexed: `GET /api/search/status` (look at document count)
   - Reindex if needed: `POST /admin/search/reindex`

2. **OpenRouter:**
   - Test with a simple enrichment: `POST /admin/jobs/{job_id}/enrich`
   - Check backend logs for API errors
   - Verify API key has credits/quota

## Testing Steps

1. **Check what backend sees:**
   ```bash
   curl https://your-backend-url.com/admin/diagnostics/meili-openrouter
   ```

2. **If Meilisearch not configured:**
   - Verify env vars in Render dashboard
   - Check variable names match exactly
   - Redeploy service

3. **If Meilisearch configured but not connected:**
   - Test Meilisearch URL manually
   - Check Meilisearch is running
   - Verify API key

4. **If OpenRouter not configured:**
   - Verify `OPENROUTER_API_KEY` is set in Render
   - Get new key if needed
   - Redeploy service

5. **If both configured but not working:**
   - Initialize Meilisearch index
   - Reindex jobs
   - Test OpenRouter with enrichment endpoint

## Render-Specific Notes

- Environment variables are only available after redeploy
- Check Render's "Environment" tab to see all set variables
- Render logs will show if variables are loaded on startup
- Some variables might be set at service level vs. environment level

