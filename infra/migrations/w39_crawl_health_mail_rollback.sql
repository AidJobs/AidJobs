-- Undo infra/migrations/w39_crawl_health_mail.sql. Only before anything depends on
-- the table. Run as postgres. Drops the table and its grants with it.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS public.crawl_health_mail;

COMMIT;
