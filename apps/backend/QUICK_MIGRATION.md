# Quick Migration Guide

## Option 1: Run SQL Directly in Supabase (Fastest - Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Paste and run this SQL:

```sql
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS country_iso TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_country_iso ON jobs(country_iso) WHERE country_iso IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city) WHERE city IS NOT NULL;
```

✅ Done! This is the fastest and most reliable method.

---

## Option 2: Run Script with URL as Argument

```powershell
cd apps/backend
python scripts/apply_country_city_migration.py "postgresql://postgres.yijlbzlzfahubwukulkv:ghXps3My5KPZCNn2@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

---

## Option 3: Create .env.local (For Future Use)

Create `apps/backend/.env.local` (this file is gitignored):

```
SUPABASE_DB_URL=postgresql://postgres.yijlbzlzfahubwukulkv:ghXps3My5KPZCNn2@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

Then the script will automatically use it.

**Note:** `.env.local` is already in `.gitignore`, so it won't be committed.

---

## Verify Migration

After running, verify with this SQL in Supabase:

```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name IN ('country', 'country_iso', 'city')
ORDER BY column_name;
```

You should see 3 rows: `city`, `country`, `country_iso`.

