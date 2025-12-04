# Phase 2 Setup Guide for Windows

## Step 1: Get Your Database Connection String

1. Go to **Supabase Dashboard** → **Project Settings** → **Database**
2. Under **Connection string**, select **Connection pooling**
3. Choose **Transaction** mode
4. Copy the connection string (looks like: `postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres`)

## Step 2: Set Environment Variable (Choose One Method)

### Method A: PowerShell (Current Session Only)

```powershell
# Set for current PowerShell session
$env:SUPABASE_DB_URL = "postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres"
```

### Method B: Windows Environment Variables (Permanent)

1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Click **Advanced** tab → **Environment Variables**
3. Under **User variables**, click **New**
4. Variable name: `SUPABASE_DB_URL`
5. Variable value: Your connection string
6. Click **OK** on all dialogs
7. **Restart your terminal/IDE** for changes to take effect

### Method C: Create/Update .env File (Recommended for Development)

Create or update `.env` file in project root:

```env
SUPABASE_DB_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres
```

Then load it in PowerShell:
```powershell
# Load .env file (if you have a script to do this)
# Or use python-dotenv in your script
```

## Step 3: Apply Migration

### Option A: Using Python Script

```powershell
# Make sure SUPABASE_DB_URL is set (see Step 2)
python apps/backend/scripts/apply_phase2_migration.py
```

### Option B: Using Supabase Dashboard (Easiest)

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Open `infra/migrations/phase2_observability.sql` in your editor
4. Copy the entire contents
5. Paste into Supabase SQL Editor
6. Click **Run**

### Option C: Using psql (If Installed)

```powershell
# If you have PostgreSQL client installed
$env:PGPASSWORD = "your-password"
psql -h aws-0-region.pooler.supabase.com -p 6543 -U postgres.xxx -d postgres -f infra/migrations/phase2_observability.sql
```

## Step 4: Verify Migration

Go to **Supabase Dashboard** → **Table Editor** and check for these tables:
- `raw_pages`
- `extraction_logs`
- `failed_inserts`

Or run this SQL in **SQL Editor**:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('raw_pages', 'extraction_logs', 'failed_inserts')
ORDER BY table_name;
```

## Step 5: Test the System

### 5.1 Run a Crawl

Use the admin UI or API to trigger a crawl for any source.

### 5.2 Check Logs in Supabase

Go to **Supabase Dashboard** → **Table Editor** → **extraction_logs** to see recent logs.

### 5.3 Test API Endpoints

If your backend is running, test the observability endpoints:

```powershell
# Get coverage stats (replace with your admin session cookie)
curl.exe -X GET "http://localhost:8000/api/admin/observability/coverage?hours=24" `
  -H "Cookie: aidjobs_admin_session=..."
```

## Troubleshooting

### "SUPABASE_DB_URL not set" Error

- Make sure you set the environment variable (see Step 2)
- **Restart your terminal/IDE** after setting environment variables
- Verify with: `echo $env:SUPABASE_DB_URL` (PowerShell)

### Migration Fails

- Check your connection string is correct
- Verify you have database permissions
- Try using Supabase Dashboard SQL Editor instead

### Can't Connect to Database

- Check your connection string format
- Verify network access to Supabase
- Check if your IP is allowed in Supabase settings

## Quick Start (Supabase Dashboard Method)

**Fastest way to apply migration:**

1. Open `infra/migrations/phase2_observability.sql`
2. Copy all contents
3. Go to Supabase Dashboard → SQL Editor
4. Paste and click **Run**
5. Done! ✅

This method doesn't require environment variables or command line tools.

