# Why Scripts Hang and How to Fix

## The Problem

Scripts hang when:
1. **Database connection timeout** - Network issues or firewall blocking
2. **No immediate feedback** - Script appears frozen
3. **Long connection attempts** - Default psycopg2 timeout is too long
4. **Missing error handling** - Errors aren't caught early

## Solutions

### ✅ Solution 1: Use SQL Directly (Most Reliable)

**Why it works:**
- No network connection issues
- Immediate feedback
- Works 100% of the time
- Can see results instantly

**How:**
1. Go to Supabase Dashboard → SQL Editor
2. Paste and run the SQL
3. Done in 2 seconds

### ✅ Solution 2: Use the Fast Script

I've created `apply_country_city_migration_fast.py` with:
- ✅ 10-second connection timeout (instead of default 30+ seconds)
- ✅ Immediate progress messages
- ✅ Better error handling
- ✅ Clear troubleshooting tips

**Run it:**
```powershell
python scripts/apply_country_city_migration_fast.py "your-db-url"
```

### ✅ Solution 3: Check Your Network

If scripts keep hanging:
1. **Check Supabase IP allowlist** - Settings → Database → Connection Pooling
2. **Check firewall** - Windows Firewall might be blocking
3. **Try from different network** - Test if it's network-specific
4. **Use Supabase Dashboard** - Always works, no network issues

## Best Practice

**For migrations:** Always use Supabase SQL Editor (Option 1)
- Fastest
- Most reliable  
- No network issues
- Can verify immediately

**For scripts:** Use the fast version with timeouts
- Good for automation
- Has progress indicators
- Fails fast with clear errors

## Current Migration

For the `country`, `country_iso`, `city` columns migration:

**Recommended:** Run this SQL in Supabase Dashboard:

```sql
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS country_iso TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_country_iso ON jobs(country_iso) WHERE country_iso IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city) WHERE city IS NOT NULL;
```

This takes 2 seconds and always works.

