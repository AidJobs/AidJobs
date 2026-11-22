-- Undo w39_listing_ids_hash.sql before any code depends on the columns.
-- Run as postgres. Stops if a crawl holds crawl_logs.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.crawl_logs
    DROP COLUMN IF EXISTS listing_ids_hash,
    DROP COLUMN IF EXISTS listing_id_count;

COMMIT;
