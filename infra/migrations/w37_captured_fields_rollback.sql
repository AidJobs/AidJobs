-- Undo w37_captured_fields.sql. Run as postgres, only after the code that writes these columns
-- is reverted on Render, and after a backup: dropping a column deletes what it holds.
-- salary_range_text existed before W-37 and stays.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.jobs
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS posted_on,
    DROP COLUMN IF EXISTS locations,
    DROP COLUMN IF EXISTS advert_language;

COMMIT;
