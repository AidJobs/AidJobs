# Quick Start: Phase 2 Migration

## Fastest Method (Supabase Dashboard)

1. **Open the migration file:**
   - File: `infra/migrations/phase2_observability.sql`

2. **Copy the entire contents** (Ctrl+A, Ctrl+C)

3. **Go to Supabase Dashboard:**
   - Navigate to: **SQL Editor** → **New Query**

4. **Paste and Run:**
   - Paste the SQL (Ctrl+V)
   - Click **Run** button
   - Wait for "Success" message

5. **Verify:**
   - Go to **Table Editor**
   - You should see 3 new tables:
     - `raw_pages`
     - `extraction_logs`
     - `failed_inserts`

## That's It! ✅

The migration is idempotent (safe to run multiple times), so if you see "already exists" errors, that's fine.

## Next: Test It

1. **Run a crawl** (via admin UI or API)
2. **Check the logs:**
   - Go to Supabase → Table Editor → `extraction_logs`
   - You should see new entries after each crawl

3. **Test API endpoints** (if backend is running):
   - `/api/admin/observability/coverage`
   - `/api/admin/observability/failed-inserts`

## Need Help?

See `PHASE2_SETUP_WINDOWS.md` for detailed instructions.

