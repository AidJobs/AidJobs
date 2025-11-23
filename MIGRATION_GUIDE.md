# Database Migration Guide

## Check Migration Status

To check if the enrichment tables have been migrated:

```bash
# Set your Supabase connection string
export SUPABASE_DB_URL="postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

# Check status
python apps/backend/scripts/check_migration_status.py
```

This will show:
- ✓ Which tables exist
- ✗ Which tables are missing
- Row counts for existing tables

## Apply Migration

### Option 1: Using the Migration Script (Recommended)

The script is **idempotent** - safe to run multiple times:

```bash
# Set your Supabase connection string
export SUPABASE_DB_URL="postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

# Apply schema (creates all tables including enrichment tables)
python apps/backend/scripts/apply_sql.py
```

This will:
- Create all missing tables (including the 4 new enrichment tables)
- Create all indexes
- Set up RLS policies
- Show a summary of what was created

### Option 2: Manual SQL Execution

1. Go to Supabase Dashboard → SQL Editor
2. Copy the entire contents of `infra/supabase.sql`
3. Paste and execute

The SQL uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times.

## New Tables Created

The migration adds these 4 new tables:

1. **`enrichment_reviews`** - Quality assurance review queue for low-confidence enrichments
2. **`enrichment_history`** - Audit trail of all enrichment changes
3. **`enrichment_feedback`** - Human corrections to learn from
4. **`enrichment_ground_truth`** - Manually labeled test set for accuracy validation

## Verify Migration

After running the migration, verify it worked:

```bash
python apps/backend/scripts/check_migration_status.py
```

You should see:
```
✓ enrichment_reviews              EXISTS (0 rows)
✓ enrichment_history              EXISTS (0 rows)
✓ enrichment_feedback             EXISTS (0 rows)
✓ enrichment_ground_truth         EXISTS (0 rows)
```

## Getting Your Connection String

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **Database**
4. Under **Connection string**, select:
   - **Connection pooling** (not Direct connection)
   - **Transaction** mode
5. Copy the connection string
6. Set it as `SUPABASE_DB_URL` environment variable

## Troubleshooting

### "psycopg2 not installed"
```bash
pip install psycopg2-binary
```

### "SUPABASE_DB_URL not set"
Make sure you've exported the environment variable or set it in your shell.

### "Connection failed"
- Verify the connection string is correct
- Make sure you're using the **pooler** connection (port 6543), not direct (port 5432)
- Check that your Supabase project is active

### "Permission denied"
Make sure you're using a connection string with sufficient privileges. The pooler connection should work for schema operations.

