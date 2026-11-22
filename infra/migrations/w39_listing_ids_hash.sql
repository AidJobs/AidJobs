-- W-39 pull request 2: store each complete crawl's listing URL fingerprint so the next
-- complete crawl can skip detail enrichment when the id set is unchanged (early-stop).
-- Run as postgres in Supabase's SQL editor, after a manual backup (ledger W-43) and a
-- read-only check that no crawl is running, then before or with the merge of the code
-- that writes these columns. The application must not execute this file.
--
-- Additive only: nullable columns, no default, so no row is rewritten. Older runs stay
-- empty; no backfill. Only crawl_logs is altered. Grants are per table
-- (infra/roles/02_grants.sql), so they cover the new columns.
-- Undo, only before anything depends on them: w39_listing_ids_hash_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.crawl_logs
    ADD COLUMN IF NOT EXISTS listing_ids_hash TEXT,
    ADD COLUMN IF NOT EXISTS listing_id_count INTEGER;

COMMENT ON COLUMN public.crawl_logs.listing_ids_hash IS
    'SHA-256 of sorted unique normalised apply URLs when the listing was complete (W-39).';
COMMENT ON COLUMN public.crawl_logs.listing_id_count IS
    'Number of distinct normalised apply URLs in listing_ids_hash (W-39).';

COMMIT;
