-- Undo w06_crawl_run_lifecycle.sql, only before anything depends on its columns: first deploy
-- code that no longer writes them. Run as postgres in Supabase's SQL editor.
-- jobs.expired_at is not dropped: it existed in production before that migration.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.crawl_logs
    DROP COLUMN IF EXISTS active_at_start,
    DROP COLUMN IF EXISTS listing_complete,
    DROP COLUMN IF EXISTS listing_expected,
    DROP COLUMN IF EXISTS listing_stop,
    DROP COLUMN IF EXISTS valid_count,
    DROP COLUMN IF EXISTS failed_saves,
    DROP COLUMN IF EXISTS matched_active,
    DROP COLUMN IF EXISTS observed,
    DROP COLUMN IF EXISTS counted,
    DROP COLUMN IF EXISTS expired,
    DROP COLUMN IF EXISTS returned;

COMMIT;
