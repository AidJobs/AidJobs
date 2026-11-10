-- Undo of w52_sources_status_check.sql: sources.status takes any text again, and NULL.
-- Run by the user in Supabase's SQL editor as postgres. One transaction; safe to run again.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_status_allowed;
ALTER TABLE public.sources ALTER COLUMN status DROP NOT NULL;
COMMIT;
