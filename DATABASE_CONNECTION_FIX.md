# Database Connection Fix - IPv6 Network Unreachable

## Problem

The orchestrator is trying to connect to Supabase via IPv6, but the network is unreachable:
```
connection to server at "db.yijlbzlzfahubwukulkv.supabase.co" (2406:da18:243:7410:1764:8b97:a00b:20b0), port 5432 failed: Network is unreachable
```

## Root Cause

1. Supabase database hostname resolves to both IPv4 and IPv6 addresses
2. psycopg2 is trying IPv6 first (2406:da18:...)
3. Render's network doesn't support IPv6 or it's blocked
4. Connection fails because IPv6 is unreachable

## Solutions

### Solution 1: Use Supabase Connection Pooler (Recommended)

Supabase provides a connection pooler that works better with serverless environments and handles IPv4/IPv6 automatically.

**Steps:**
1. Go to Supabase Dashboard → Your Project → Settings → Database
2. Find the "Connection Pooling" section
3. Copy the "Connection string" (uses port 6543, not 5432)
4. Update `SUPABASE_DB_URL` in Render with the pooler URL

**Pooler URL Format:**
```
postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Benefits:**
- Handles IPv4/IPv6 automatically
- Better for serverless/container environments
- Connection pooling (more efficient)
- Works reliably with Render

### Solution 2: Force IPv4 Resolution (Implemented)

The code now tries to resolve the hostname to IPv4 first before connecting.

**How it works:**
1. Resolves hostname to IPv4 address using `socket.getaddrinfo()` with `AF_INET`
2. Replaces hostname with IPv4 address in connection URL
3. Falls back to original URL if IPv4 resolution fails
4. Retries with exponential backoff

**Limitations:**
- IPv4 address might change (Supabase uses load balancers)
- Still requires IPv4 connectivity from Render
- May not work if Supabase only provides IPv6

### Solution 3: Use Direct IPv4 Address (Not Recommended)

If you know the IPv4 address, you can use it directly in the connection string.

**Steps:**
1. Resolve hostname to IPv4: `nslookup db.[PROJECT_ID].supabase.co`
2. Update `SUPABASE_DB_URL` with IPv4 address instead of hostname
3. **Warning:** IPv4 addresses can change, so this is not recommended

### Solution 4: Disable Orchestrator (Temporary)

If database connection is not critical for now, you can disable the orchestrator.

**Steps:**
1. In Render, add environment variable: `AIDJOBS_DISABLE_SCHEDULER=true`
2. Restart backend service
3. Orchestrator will not start, avoiding connection errors

## Recommended Action

**Use Supabase Connection Pooler (Solution 1)**

1. Get pooler URL from Supabase Dashboard
2. Update `SUPABASE_DB_URL` in Render
3. Restart backend service
4. Verify connection works

## Testing

After applying the fix, test the connection:

```bash
# Test database status
curl https://aidjobs-backend.onrender.com/api/db/status

# Check backend logs for connection messages
# Should see: "[orchestrator] Successfully connected to database"
```

## Environment Variables

Make sure these are set in Render:

- `SUPABASE_DB_URL` - PostgreSQL connection string (use pooler URL)
- `SUPABASE_URL` - Supabase REST API URL (HTTPS)
- `SUPABASE_SERVICE_KEY` - Supabase service role key

## Troubleshooting

### Error: "Network is unreachable"
- **Cause:** IPv6 connection attempted but network doesn't support it
- **Fix:** Use Supabase connection pooler URL (port 6543)
- **Alternative:** Ensure IPv4 connectivity from Render

### Error: "Connection refused"
- **Cause:** Database server is not running or not accessible
- **Fix:** Check Supabase database status
- **Check:** Verify connection URL and credentials

### Error: "IPv4 resolution failed"
- **Cause:** Hostname doesn't resolve to IPv4
- **Fix:** Use connection pooler URL or direct IPv4 address
- **Check:** Verify DNS resolution

### Error: "Too many connection errors"
- **Cause:** Database is not accessible or credentials are wrong
- **Fix:** Check `SUPABASE_DB_URL` format and credentials
- **Check:** Verify database is running in Supabase

## Code Changes

The orchestrator now:
1. Resolves hostname to IPv4 before connecting
2. Retries connections with exponential backoff
3. Provides better error messages
4. Handles IPv6 unreachable errors gracefully

## Next Steps

1. **Get Supabase Connection Pooler URL**
   - Go to Supabase Dashboard → Settings → Database → Connection Pooling
   - Copy the connection string (port 6543)

2. **Update Render Environment Variable**
   - Go to Render Dashboard → Your Backend Service → Environment
   - Update `SUPABASE_DB_URL` with pooler URL
   - Save and restart service

3. **Verify Connection**
   - Check backend logs for connection success
   - Test database status endpoint
   - Verify orchestrator is running without errors

## References

- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Supabase IPv6 Support](https://supabase.com/docs/guides/database/connecting-to-postgres#ipv6)
- [Render Network Configuration](https://render.com/docs/networking)

