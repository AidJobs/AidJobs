# Migration Checklist

## Required Migrations for Current Code

The code uses these database features, so these migrations **must** be applied:

### ✅ Phase 2: Observability (Required)
**File:** `infra/migrations/phase2_observability.sql`

**Creates:**
- `raw_pages` table - Stores fetched HTML
- `extraction_logs` table - Logs extraction attempts
- `failed_inserts` table - Tracks failed insertions

**To apply:**
```bash
cd apps/backend
python scripts/apply_phase2_migration.py
```

Or manually run the SQL in Supabase Dashboard.

---

### ✅ Phase 4: Geocoding (Required)
**File:** `infra/migrations/phase4_geocoding.sql`

**Adds to `jobs` table:**
- `latitude` NUMERIC(10, 7)
- `longitude` NUMERIC(10, 7)
- `geocoded_at` TIMESTAMPTZ
- `geocoding_source` TEXT
- `is_remote` BOOLEAN

**To apply:**
```bash
cd apps/backend
python scripts/apply_phase4_migration.py
```

Or manually run the SQL in Supabase Dashboard.

---

### ✅ Phase 4: Quality Scoring (Required)
**File:** `infra/migrations/phase4_quality_scoring.sql`

**Adds to `jobs` table:**
- `quality_score` NUMERIC(3, 2)
- `quality_grade` TEXT
- `quality_factors` JSONB
- `quality_issues` TEXT[]
- `needs_review` BOOLEAN
- `quality_scored_at` TIMESTAMPTZ

**To apply:**
```bash
cd apps/backend
python scripts/apply_phase4_migration.py
```

Or manually run the SQL in Supabase Dashboard.

---

### ⚠️ Operation Index (Recommended)
**File:** `infra/migrations/add_operation_index.sql`

**Adds index:**
- `idx_failed_inserts_operation` on `failed_inserts(operation)`

**To apply:**
Run the SQL manually in Supabase Dashboard (no script provided).

---

### ⚠️ Country/City Columns (May be missing)
**Status:** The code uses `country`, `country_iso`, and `city` columns, but these are **NOT** in any migration file.

**Check if they exist:**
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name IN ('country', 'country_iso', 'city');
```

**If missing, add them:**
```sql
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS country_iso TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT;
```

---

## Quick Check

To verify all migrations are applied, run this SQL in Supabase:

```sql
-- Check Phase 2 tables
SELECT 'raw_pages' as table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'raw_pages') as exists
UNION ALL
SELECT 'extraction_logs', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'extraction_logs')
UNION ALL
SELECT 'failed_inserts', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'failed_inserts');

-- Check Phase 4 geocoding columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name IN ('latitude', 'longitude', 'geocoded_at', 'geocoding_source', 'is_remote');

-- Check Phase 4 quality columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name IN ('quality_score', 'quality_grade', 'quality_factors', 'quality_issues', 'needs_review', 'quality_scored_at');

-- Check country/city columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name IN ('country', 'country_iso', 'city');
```

---

## If Migrations Are Missing

If any migrations are missing, the INSERT statements will fail with errors like:
- `column "latitude" does not exist`
- `column "quality_score" does not exist`
- `relation "failed_inserts" does not exist`

**Solution:** Apply the missing migrations using the scripts above or run the SQL manually in Supabase Dashboard.



