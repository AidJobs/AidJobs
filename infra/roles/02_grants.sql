-- What aidjobs_app and aidjobs_readonly may do (security plan, stage 6). Run as postgres, after
-- 01_create_roles.sql. Exact and safe to run again: in one transaction, every table privilege
-- the two roles hold is revoked and the list below granted, so a privilege removed here is
-- removed in the database too, and no query ever sees the roles without their grants.
--
-- The list is the backend's own SQL, read on 5 November 2026 (app/, core/, crawler_v2/,
-- pipeline/, contracts/, main.py, orchestrator.py); tests/test_db_roles.py fails when the code
-- uses a table or a statement this file does not grant, or when this file grants more.
-- A new table gets its grants in the migration that creates it (decided 5 November 2026).
--
-- One table, or one list of tables, per GRANT statement; the tests read this file.
-- A SELECT ... FOR UPDATE or FOR SHARE needs UPDATE: crawl_locks has it for the takeover.
-- No sequences: every key in public is a UUID. No functions: the backend calls none, and the
-- jobs_tsv_update trigger runs without an EXECUTE grant. Never TRUNCATE, REFERENCES or TRIGGER.

BEGIN;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM aidjobs_app, aidjobs_readonly;

GRANT USAGE ON SCHEMA public TO aidjobs_app, aidjobs_readonly;

-- The backend: the crawl, the admin, and the public routes.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jobs TO aidjobs_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sources TO aidjobs_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crawl_logs TO aidjobs_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crawl_locks TO aidjobs_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.domain_policies TO aidjobs_app;
GRANT SELECT ON TABLE public.robots_cache TO aidjobs_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.link_validations TO aidjobs_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.enrichment_feedback TO aidjobs_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.enrichment_ground_truth TO aidjobs_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.enrichment_reviews TO aidjobs_app;
GRANT SELECT, INSERT ON TABLE public.enrichment_history TO aidjobs_app;
GRANT SELECT, INSERT ON TABLE public.extraction_logs TO aidjobs_app;
GRANT SELECT, INSERT ON TABLE public.failed_inserts TO aidjobs_app;
GRANT SELECT, INSERT ON TABLE public.raw_pages TO aidjobs_app;
GRANT SELECT ON TABLE public.jobs_side TO aidjobs_app;
GRANT SELECT ON TABLE public.shortlists TO aidjobs_app;
GRANT SELECT ON TABLE public.benefits TO aidjobs_app;
GRANT SELECT ON TABLE public.countries TO aidjobs_app;
GRANT SELECT ON TABLE public.donors TO aidjobs_app;
GRANT SELECT ON TABLE public.levels TO aidjobs_app;
GRANT SELECT ON TABLE public.missions TO aidjobs_app;
GRANT SELECT ON TABLE public.policy_flags TO aidjobs_app;
GRANT SELECT ON TABLE public.synonyms TO aidjobs_app;
GRANT SELECT ON TABLE public.tags TO aidjobs_app;
GRANT SELECT ON TABLE public.work_modalities TO aidjobs_app;

-- The checks: every public table except the personal-data ones (users, payments,
-- find_earn_submissions, findearn_submissions).
GRANT SELECT ON TABLE
  public.benefits,
  public.clusters,
  public.contracts,
  public.countries,
  public.crawl_locks,
  public.crawl_logs,
  public.crisis_types,
  public.domain_policies,
  public.donors,
  public.enrichment_feedback,
  public.enrichment_ground_truth,
  public.enrichment_history,
  public.enrichment_reviews,
  public.extraction_logs,
  public.failed_inserts,
  public.functional,
  public.job_deletion_audit,
  public.jobs,
  public.jobs_side,
  public.levels,
  public.link_validations,
  public.missions,
  public.org_types,
  public.policy_flags,
  public.raw_pages,
  public.response_phases,
  public.rewards,
  public.robots_cache,
  public.shortlists,
  public.sources,
  public.synonyms,
  public.tags,
  public.takedowns,
  public.work_modalities
TO aidjobs_readonly;

COMMIT;
