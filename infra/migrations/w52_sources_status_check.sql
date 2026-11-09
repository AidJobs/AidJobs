-- W-52: a source's status is one of the four the code uses, and never empty.
--
-- Run by the user in Supabase's SQL editor as postgres, after a backup (security plan, stage 6,
-- "Schema changes"; W-43), at a time no crawl is running. One transaction: it either completes
-- or changes nothing. Safe to run again. Undo: w52_sources_status_check_rollback.sql.
--
-- It stops, changing nothing, when:
--   - a source's status is outside the four values, or empty (the query at the end lists them);
--   - a constraint of the same name exists with another definition;
--   - it waits more than 5 seconds for the table (a crawl is writing): run it again later.
--
-- Production, read-only, 9 November 2026: 3 sources, all 'active'; no rule on sources.status
-- besides the primary key; default 'pending_validation'; empty (NULL) allowed. The default is
-- kept: a row added without a status is then one no scheduler crawls.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
    outside integer;
    existing text;
BEGIN
    SELECT count(*) INTO outside FROM public.sources
    WHERE status IS NULL OR status NOT IN ('active', 'paused', 'deleted', 'pending_validation');
    IF outside > 0 THEN
        RAISE EXCEPTION 'W-52: % source(s) have a status outside active, paused, deleted and pending_validation, or none; nothing was changed', outside;
    END IF;

    SELECT replace(pg_get_constraintdef(oid), ' NOT VALID', '') INTO existing
    FROM pg_constraint
    WHERE conrelid = 'public.sources'::regclass AND conname = 'sources_status_allowed';
    IF existing IS NULL THEN
        ALTER TABLE public.sources ADD CONSTRAINT sources_status_allowed
            CHECK (status IN ('active', 'paused', 'deleted', 'pending_validation')) NOT VALID;
    ELSIF existing <> 'CHECK ((status = ANY (ARRAY[''active''::text, ''paused''::text, ''deleted''::text, ''pending_validation''::text])))' THEN
        RAISE EXCEPTION 'W-52: sources_status_allowed exists with another definition (%); nothing was changed', existing;
    END IF;
END $$;

ALTER TABLE public.sources VALIDATE CONSTRAINT sources_status_allowed;
-- The check alone lets NULL through: NULL IN (...) is not false.
ALTER TABLE public.sources ALTER COLUMN status SET NOT NULL;

COMMIT;

-- Afterwards, expect one row, convalidated true, and is_nullable NO:
--   SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.sources'::regclass AND conname = 'sources_status_allowed';
--   SELECT is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'sources' AND column_name = 'status';
-- Rows that stop it:
--   SELECT id, status FROM public.sources
--   WHERE status IS NULL OR status NOT IN ('active', 'paused', 'deleted', 'pending_validation');
