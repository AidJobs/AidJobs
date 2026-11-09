-- Undo of w53_sources_type_check.sql: sources.source_type takes any text again, and NULL.
-- Run by the user in Supabase's SQL editor as postgres. One transaction; safe to run again.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_type_allowed;
ALTER TABLE public.sources ALTER COLUMN source_type DROP NOT NULL;
COMMIT;
