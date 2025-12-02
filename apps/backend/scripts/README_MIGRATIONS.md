# Database Migrations

This directory contains database migration scripts for the AidJobs application.

## Security Best Practices

⚠️ **NEVER commit database URLs or credentials to git!**

- All `.env` files are gitignored
- Migration scripts only accept database URLs from environment variables
- Never pass database URLs as command-line arguments

## Running Migrations

### Option 1: Using Environment Variable (Recommended)

1. Set the environment variable:
   ```bash
   export SUPABASE_DB_URL='postgresql://user:password@host:port/database'
   ```

2. Run the migration:
   ```bash
   cd apps/backend
   python scripts/migrate_data_quality.py
   ```

### Option 2: Using .env File

1. Copy the example file:
   ```bash
   cp apps/backend/.env.example apps/backend/.env
   ```

2. Edit `.env` and add your database URL:
   ```
   SUPABASE_DB_URL=postgresql://user:password@host:port/database
   ```

3. Load environment variables and run:
   ```bash
   cd apps/backend
   # On Linux/Mac:
   export $(cat .env | xargs)
   python scripts/migrate_data_quality.py
   
   # On Windows PowerShell:
   Get-Content .env | ForEach-Object { $line = $_; if ($line -match '^([^#][^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
   python scripts/migrate_data_quality.py
   ```

### Option 3: Using python-dotenv (If Installed)

If you have `python-dotenv` installed, you can use:

```python
from dotenv import load_dotenv
load_dotenv()
```

The migration scripts will automatically load `.env` files if `python-dotenv` is available.

## Available Migrations

### Data Quality Migration

**File:** `migrate_data_quality.py`

**Purpose:** Adds data quality columns to the `jobs` table:
- `data_quality_score` (INTEGER) - Quality score 0-100
- `data_quality_issues` (JSONB) - Array of quality issues and warnings
- Index for efficient quality filtering

**Status:** ✅ Completed

**To run:**
```bash
python scripts/migrate_data_quality.py
```

## Verifying Migrations

After running a migration, you can verify it was successful by checking the database:

```sql
-- Check if columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name LIKE 'data_quality%';

-- Check if index exists
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'jobs' 
AND indexname LIKE '%quality%';
```

## Troubleshooting

### "No database URL found"

Make sure you've set `SUPABASE_DB_URL` or `DATABASE_URL` environment variable, or created a `.env` file.

### Connection Errors

- Verify the database URL is correct
- Check network connectivity
- Ensure the database server is running
- Verify credentials are correct

### Migration Already Applied

All migrations use `IF NOT EXISTS` clauses, so running them multiple times is safe. They will skip already-applied changes.

