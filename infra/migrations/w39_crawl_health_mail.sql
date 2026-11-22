-- W-39 pull request 3: one UTC-day claim for the daily crawl-health message so a
-- restart cannot send twice (including after a failed send). Run as postgres in
-- Supabase's SQL editor, after a manual backup (ledger W-43) and a read-only check
-- that no crawl is running, then before or with the merge of the code that writes
-- this table. The application must not execute this file.
--
-- Additive only: a new empty table. Grants match infra/roles/02_grants.sql (a new
-- table grants itself here; decided 5 November 2026). Row-Level Security on so the
-- Data API stays closed (aidjobs_app / aidjobs_readonly have BYPASSRLS).
-- Undo, only before anything depends on it: w39_crawl_health_mail_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.crawl_health_mail (
    attempted_on date PRIMARY KEY,
    attempted_at timestamp with time zone NOT NULL DEFAULT now(),
    delivery text NOT NULL,
    http_status integer,
    CONSTRAINT crawl_health_mail_delivery_allowed
        CHECK (delivery = ANY (ARRAY['pending'::text, 'sent'::text, 'log_only'::text, 'failed'::text]))
);

COMMENT ON TABLE public.crawl_health_mail IS
    'One row per UTC calendar day the crawl-health message was attempted (W-39).';
COMMENT ON COLUMN public.crawl_health_mail.attempted_on IS
    'UTC calendar day of the attempt; primary key so a day is claimed once.';
COMMENT ON COLUMN public.crawl_health_mail.delivery IS
    'pending while sending; sent | log_only | failed when finished.';
COMMENT ON COLUMN public.crawl_health_mail.http_status IS
    'Provider HTTP status only when Resend was called; never a body or key.';

ALTER TABLE public.crawl_health_mail ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.crawl_health_mail TO aidjobs_app;
GRANT SELECT ON TABLE public.crawl_health_mail TO aidjobs_readonly;

COMMIT;
