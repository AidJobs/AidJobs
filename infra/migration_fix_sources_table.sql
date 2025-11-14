-- Migration: Add missing columns to sources table
-- Run this in your Supabase SQL editor or via psql
-- This is idempotent - safe to run multiple times

-- Add org_type column (used in admin sources - INSERT/UPDATE/SELECT)
ALTER TABLE sources 
    ADD COLUMN IF NOT EXISTS org_type TEXT;

-- Add notes column (used in find_earn.py when creating sources from submissions)
ALTER TABLE sources 
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- Verify all required columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'sources'
ORDER BY ordinal_position;

-- Expected columns in sources table (based on code analysis):
-- ✓ id (UUID, PRIMARY KEY)
-- ✓ org_name (TEXT)
-- ✓ careers_url (TEXT, NOT NULL, UNIQUE)
-- ✓ source_type (TEXT, DEFAULT 'html')
-- ✓ org_type (TEXT) - ADDED BY THIS MIGRATION
-- ✓ status (TEXT, DEFAULT 'active')
-- ✓ crawl_frequency_days (INT, DEFAULT 3)
-- ✓ next_run_at (TIMESTAMPTZ)
-- ✓ last_crawled_at (TIMESTAMPTZ)
-- ✓ last_crawl_status (TEXT)
-- ✓ last_crawl_message (TEXT)
-- ✓ consecutive_failures (INT, DEFAULT 0)
-- ✓ consecutive_nochange (INT, DEFAULT 0)
-- ✓ parser_hint (TEXT)
-- ✓ time_window (TEXT)
-- ✓ notes (TEXT) - ADDED BY THIS MIGRATION
-- ✓ created_at (TIMESTAMPTZ, DEFAULT NOW())
-- ✓ updated_at (TIMESTAMPTZ, DEFAULT NOW())

