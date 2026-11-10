-- W-37: captured fields (growth plan, section 4.4). Run as postgres in Supabase's SQL editor,
-- after a manual backup (ledger W-43) and a read-only check that no crawl is running, then
-- before the code that writes these columns is merged. The application must not execute this file.
--
-- Additive only: four nullable columns with no default, so no row is rewritten or touched.
-- salary_range_text already exists in production (read-only check, 8 November 2026) and is
-- listed so the repository records it; on production that line does nothing.
-- The roles' grants are per table (infra/roles/02_grants.sql), so they cover the new columns.
-- Undo, only before anything depends on them: w37_captured_fields_rollback.sql.

BEGIN;

-- Fail at once rather than queue behind a crawl's transaction and block every read of jobs.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS posted_on DATE,
    ADD COLUMN IF NOT EXISTS locations TEXT[],
    ADD COLUMN IF NOT EXISTS advert_language TEXT,
    ADD COLUMN IF NOT EXISTS salary_range_text TEXT;

COMMENT ON COLUMN public.jobs.description IS
    'Full description as plain text: cleaned, capped, email addresses and phone numbers removed (W-37).';
COMMENT ON COLUMN public.jobs.posted_on IS
    'The employer''s own posting date, when published (W-37).';
COMMENT ON COLUMN public.jobs.locations IS
    'Every location the employer publishes, as written (W-37).';
COMMENT ON COLUMN public.jobs.advert_language IS
    'The language the advert itself declares, for example en-GB (W-37).';
COMMENT ON COLUMN public.jobs.salary_range_text IS
    'Salary as the employer writes it (W-37).';

COMMIT;
