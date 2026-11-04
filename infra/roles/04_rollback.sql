-- Removes aidjobs_app and aidjobs_readonly (security plan, stage 6). Run as postgres.
--
-- Use only once nothing connects as these roles: Render's SUPABASE_DB_URL back on postgres
-- and deployed, no check running with the read-only login. A role with open sessions cannot
-- be dropped; this file then fails and changes nothing (one transaction).
--
-- Safe to run again. It revokes what 02_grants.sql granted and drops the two roles; their
-- settings and passwords go with them. Nothing else in the database changes.

BEGIN;

DO $$
DECLARE
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['aidjobs_app', 'aidjobs_readonly'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = name) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', name);
      EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', name);
      EXECUTE format('DROP ROLE %I', name);
    END IF;
  END LOOP;
END
$$;

COMMIT;
