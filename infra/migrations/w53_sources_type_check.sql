-- W-53: a source's type is one of the contract's three (contracts/models.py, SOURCE_TYPES), and
-- never empty.
--
-- Run by the user in Supabase's SQL editor as postgres, after a backup (security plan, stage 6,
-- "Schema changes"; W-43), at a time no crawl is running. One transaction: it either completes
-- or changes nothing. Safe to run again. Undo: w53_sources_type_check_rollback.sql. Independent
-- of w52_sources_status_check.sql; the two may run in either order.
--
-- It stops, changing nothing, when:
--   - a source's type is outside html, rss and api, or empty (the query at the end lists them);
--   - a constraint of the same name exists with another definition;
--   - it waits more than 5 seconds for the table (a crawl is writing): run it again later.
-- If it stops with an error, run ROLLBACK; before anything else in the same editor session.
--
-- Production, read-only, 9 November 2026: 3 sources, all 'html'; sources.source_type is text,
-- with no rule besides the primary key, default 'html', and empty (NULL) allowed. The default is
-- kept. 'json', which some crawler code still reads as 'api', is not a contract type and is in
-- no row.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
    outside integer;
    existing text;
BEGIN
    SELECT count(*) INTO outside FROM public.sources
    WHERE source_type IS NULL OR source_type NOT IN ('html', 'rss', 'api');
    IF outside > 0 THEN
        RAISE EXCEPTION 'W-53: % source(s) have a type outside html, rss and api, or none; nothing was changed', outside;
    END IF;

    SELECT pg_get_constraintdef(oid) INTO existing
    FROM pg_constraint
    WHERE conrelid = 'public.sources'::regclass AND conname = 'sources_type_allowed';
    IF existing IS NULL THEN
        ALTER TABLE public.sources ADD CONSTRAINT sources_type_allowed
            CHECK (source_type IN ('html', 'rss', 'api'));
    ELSIF existing <> 'CHECK ((source_type = ANY (ARRAY[''html''::text, ''rss''::text, ''api''::text])))' THEN
        RAISE EXCEPTION 'W-53: sources_type_allowed exists with another definition (%); nothing was changed', existing;
    END IF;
END $$;

-- The check alone lets NULL through: NULL IN (...) is not false.
ALTER TABLE public.sources ALTER COLUMN source_type SET NOT NULL;

COMMIT;

-- Afterwards, expect one row, convalidated true, and is_nullable NO:
--   SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.sources'::regclass AND conname = 'sources_type_allowed';
--   SELECT is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'sources' AND column_name = 'source_type';
-- Rows that stop it:
--   SELECT id, source_type FROM public.sources
--   WHERE source_type IS NULL OR source_type NOT IN ('html', 'rss', 'api');
