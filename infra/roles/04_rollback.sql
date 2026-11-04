-- Removes aidjobs_app and aidjobs_readonly (security plan, stage 6). Run as postgres.
--
-- Use only once nothing connects as these roles: Render's SUPABASE_DB_URL back on postgres
-- and deployed, no check running with the read-only login. PostgreSQL would drop a role that
-- still has sessions (they then fail with "permission denied"), so this file refuses instead,
-- naming the role and its sessions, and changes nothing (one transaction). Wait, or end those
-- sessions in Supabase's Database, Connections page, then run it again.
--
-- Safe to run again. It revokes what 02_grants.sql granted and drops the two roles; their
-- settings and passwords go with them. Nothing else in the database changes. The roles own
-- no object (02_grants.sql only grants), so neither REASSIGN OWNED nor DROP OWNED is needed,
-- and Supabase's postgres, not a superuser, could not run them on these roles anyway.

BEGIN;

DO $$
DECLARE
  name text;
  sessions int;
BEGIN
  FOREACH name IN ARRAY ARRAY['aidjobs_app', 'aidjobs_readonly'] LOOP
    SELECT count(*) INTO sessions FROM pg_stat_activity WHERE usename = name;
    IF sessions > 0 THEN
      RAISE EXCEPTION 'refused: % has % open session(s); nothing was changed', name, sessions;
    END IF;
  END LOOP;
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
