# Step-by-Step Migration Guide

## Step 1: Get Your Database Connection String

### Option A: If using Supabase

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **Database**
4. Scroll to **Connection string**
5. Select **Connection pooling** tab
6. Choose **Transaction** mode
7. Copy the connection string (looks like: `postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`)

### Option B: If using Render PostgreSQL

1. Go to https://dashboard.render.com
2. Select your PostgreSQL database service
3. Go to **Info** tab
4. Copy the **Internal Database URL** (looks like: `postgresql://user:password@hostname:5432/database`)

## Step 2: Set Environment Variable (Temporary)

**On Windows PowerShell:**
```powershell
$env:SUPABASE_DB_URL = "your-connection-string-here"
```

**On Windows Command Prompt:**
```cmd
set SUPABASE_DB_URL=your-connection-string-here
```

**Or create a `.env` file in the project root:**
```
SUPABASE_DB_URL=your-connection-string-here
```

## Step 3: Run the Migration Script

```bash
python apps/backend/scripts/apply_migration.py
```

The script will:
1. ✅ Connect to database
2. ✅ Create `job_deletion_audit` table
3. ✅ Create indexes
4. ✅ Add soft delete columns to `jobs` table
5. ✅ Create index for soft-deleted jobs
6. ✅ Create `get_deletion_impact()` function
7. ✅ Verify everything was created correctly

## Step 4: Verify Migration

After running, you should see:
```
✅ Migration completed successfully!
```

## Alternative: Manual SQL Execution

If you prefer to run SQL manually:

1. Open your database SQL editor (Supabase SQL Editor or Render PostgreSQL)
2. Copy the contents of `infra/migrations/add_job_deletion_audit.sql`
3. Paste and execute

## Troubleshooting

### "SUPABASE_DB_URL not set"
- Make sure you set the environment variable (see Step 2)
- Or add it to your `.env` file

### "Connection failed"
- Verify the connection string is correct
- Check if password needs URL encoding (special characters)
- Ensure database is accessible from your IP

### "Permission denied"
- Make sure you're using a connection string with admin privileges
- For Supabase: Use the service role key connection string
- For Render: Use the Internal Database URL

