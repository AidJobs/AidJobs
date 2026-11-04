-- AidJobs database roles (security plan, stage 6). Run as postgres, in the Supabase SQL editor.
-- No passwords here: each role's password is set separately from a SCRAM verifier
-- (scripts/set-db-role-password.ps1), so the plain password never reaches the database or
-- the editor's history. Until then neither role can sign in.
--
-- Safe to run again: an existing role is brought back to these attributes and settings.
-- Supabase's postgres is not a superuser, and PostgreSQL 16 and later refuse SUPERUSER or
-- NOSUPERUSER in ALTER ROLE from a non-superuser, so NOSUPERUSER appears only in CREATE ROLE.
--
-- aidjobs_app: the backend's login. Reads and writes only the tables in 02_grants.sql; no
-- schema changes. BYPASSRLS, as postgres has today: Row-Level Security here closes the Data
-- API, and the grants are this role's boundary.
--
-- aidjobs_readonly: the checks' login. SELECT only, read-only by default, short time limits.
-- BYPASSRLS too: every public table has Row-Level Security on, so without it each SELECT
-- would silently return no rows; the alternative, a policy per table, is 34 more objects to
-- keep in step. It has no write grant, and no grant on the personal-data tables.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidjobs_app') THEN
    CREATE ROLE aidjobs_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION BYPASSRLS CONNECTION LIMIT 15;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidjobs_readonly') THEN
    CREATE ROLE aidjobs_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION BYPASSRLS CONNECTION LIMIT 2;
  END IF;
END
$$;

ALTER ROLE aidjobs_app WITH LOGIN NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS
  CONNECTION LIMIT 15;
ALTER ROLE aidjobs_app SET statement_timeout = '60s';
ALTER ROLE aidjobs_app SET idle_in_transaction_session_timeout = '5min';

ALTER ROLE aidjobs_readonly WITH LOGIN NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
  BYPASSRLS CONNECTION LIMIT 2;
ALTER ROLE aidjobs_readonly SET default_transaction_read_only = on;
ALTER ROLE aidjobs_readonly SET statement_timeout = '15s';
ALTER ROLE aidjobs_readonly SET idle_in_transaction_session_timeout = '30s';

COMMIT;
