-- W-06 and W-36 (growth plan, step 4.6, pull request 1): each crawl run records whether its
-- listing was read completely and whether it counts as evidence of absence (contract §5 and §6),
-- so that evidence is read from the run itself, never from extraction_logs (B4 record).
-- Run as postgres in Supabase's SQL editor, after a manual backup (ledger W-43) and a read-only
-- check that no crawl is running, then before the code that writes these columns is merged.
-- The application must not execute this file.
--
-- Additive only: nullable columns with no default, so no row is rewritten. Runs recorded before
-- this have none of them, and a run without active_at_start never counts.
-- observed, expired and returned stay empty until the later pull requests of step 4.6 fill them.
-- Only crawl_logs is altered, so only it is locked, briefly. jobs.expired_at, which step 4.6
-- uses later, already exists in production (read-only check, 10 November 2026, empty on every
-- row); it is recorded in infra/supabase.sql, not here, so jobs is not locked for nothing.
-- The roles' grants are per table (infra/roles/02_grants.sql), so they cover the new columns.
-- Undo, only before anything depends on them: w06_crawl_run_lifecycle_rollback.sql.

BEGIN;

-- Fail at once rather than queue behind a crawl's transaction and block every read of crawl_logs.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.crawl_logs
    ADD COLUMN IF NOT EXISTS active_at_start INTEGER,
    ADD COLUMN IF NOT EXISTS listing_complete BOOLEAN,
    ADD COLUMN IF NOT EXISTS listing_expected INTEGER,
    ADD COLUMN IF NOT EXISTS listing_stop TEXT,
    ADD COLUMN IF NOT EXISTS valid_count INTEGER,
    ADD COLUMN IF NOT EXISTS failed_saves INTEGER,
    ADD COLUMN IF NOT EXISTS unrecorded INTEGER,
    ADD COLUMN IF NOT EXISTS matched_active INTEGER,
    ADD COLUMN IF NOT EXISTS observed INTEGER,
    ADD COLUMN IF NOT EXISTS counted BOOLEAN,
    ADD COLUMN IF NOT EXISTS expired INTEGER,
    ADD COLUMN IF NOT EXISTS returned INTEGER;

COMMENT ON COLUMN public.crawl_logs.active_at_start IS
    'The source''s open jobs that were not hidden when the run started (W-06).';
COMMENT ON COLUMN public.crawl_logs.listing_complete IS
    'Whether the reader read the whole listing; empty when the reader reports no completeness (W-06).';
COMMENT ON COLUMN public.crawl_logs.listing_expected IS
    'The total the listing itself states, when it states one (W-06).';
COMMENT ON COLUMN public.crawl_logs.listing_stop IS
    'Why the reader stopped reading the listing (W-06).';
COMMENT ON COLUMN public.crawl_logs.valid_count IS
    'Listing rows admitted by the crawl (W-06).';
COMMENT ON COLUMN public.crawl_logs.failed_saves IS
    'Jobs whose save failed (W-06).';
COMMENT ON COLUMN public.crawl_logs.unrecorded IS
    'Admitted rows whose sighting was not recorded: an identity conflict, a row the writer refused, or one the save step dropped (W-06).';
COMMENT ON COLUMN public.crawl_logs.matched_active IS
    'Open jobs, not hidden at the start, that the crawl''s rows matched (W-06).';
COMMENT ON COLUMN public.crawl_logs.observed IS
    'Known jobs seen through a thin listing row (W-36).';
COMMENT ON COLUMN public.crawl_logs.counted IS
    'Whether the run counts as evidence of absence, under contract section 6 (W-06).';
COMMENT ON COLUMN public.crawl_logs.expired IS
    'Jobs this run expired by absence (W-06).';
COMMENT ON COLUMN public.crawl_logs.returned IS
    'Expired jobs this run saw again and made open (W-06).';

COMMIT;
