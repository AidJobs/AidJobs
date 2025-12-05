# Urgent Fix: INSERT Error - Missing Columns

## Problem
The error `INSERT has more target columns than expressions` occurs because the code tries to INSERT `country`, `country_iso`, and `city` columns that **don't exist** in your database.

## Root Cause
The Phase 4 geocoding migration (`phase4_geocoding.sql`) added `latitude`, `longitude`, `geocoded_at`, `geocoding_source`, and `is_remote`, but **forgot** to include `country`, `country_iso`, and `city` columns.

However, the code in `simple_crawler.py` tries to INSERT these columns (lines 1354-1364), causing the SQL error.

## Solution

### Step 1: Apply the Missing Columns Migration

**Option A: Using the Script (Recommended)**
```bash
cd apps/backend
python scripts/apply_country_city_migration.py
```

**Option B: Manual SQL in Supabase Dashboard**
Run this SQL in your Supabase SQL Editor:
```sql
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS country_iso TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_country_iso ON jobs(country_iso) WHERE country_iso IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city) WHERE city IS NOT NULL;
```

### Step 2: Verify Migration Applied

Run this SQL to verify:
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name IN ('country', 'country_iso', 'city')
ORDER BY column_name;
```

You should see 3 rows: `city`, `country`, `country_iso`.

### Step 3: Test the Crawler

After applying the migration, try running a crawl again. The INSERT error should be resolved.

## Files Created

1. **Migration File:** `infra/migrations/add_country_city_columns.sql`
2. **Migration Script:** `apps/backend/scripts/apply_country_city_migration.py`

## Why This Happened

The original `infra/supabase.sql` file includes `country`, `country_iso`, and `city` columns (lines 298-300), but when we created the Phase 4 migration, we only included the new geocoding columns (`latitude`, `longitude`, etc.) and forgot that the code also uses these existing columns.

## Next Steps

After fixing this:
1. ✅ Test a crawl (UNDP, UNICEF, etc.)
2. ✅ Verify jobs are inserting correctly
3. ✅ Check that geocoding data is being saved properly



