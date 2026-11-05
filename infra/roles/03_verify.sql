-- Read-only check of aidjobs_app and aidjobs_readonly (security plan, stage 6): one result
-- (the Supabase SQL editor shows only the last one), to compare with 01 and 02. It reads the
-- catalogue only and changes nothing.
--
--   role      attributes, settings, and memberships of each role
--   schema    USAGE and CREATE on public, CREATE and TEMPORARY on the database
--   table     the privileges each role holds on each public table, as letters:
--             r SELECT, a INSERT, w UPDATE, d DELETE, D TRUNCATE, x REFERENCES, t TRIGGER
--   function  public functions either role may execute that are not executable by PUBLIC
--   default   default privileges that name either role (expected: none)

WITH roles AS (
  SELECT oid, rolname FROM pg_roles WHERE rolname IN ('aidjobs_app', 'aidjobs_readonly')
),
tables AS (
  SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
),
privileges AS (
  SELECT t.relname, r.rolname,
    concat(
      CASE WHEN has_table_privilege(r.oid, t.oid, 'SELECT') THEN 'r' END,
      CASE WHEN has_table_privilege(r.oid, t.oid, 'INSERT') THEN 'a' END,
      CASE WHEN has_table_privilege(r.oid, t.oid, 'UPDATE') THEN 'w' END,
      CASE WHEN has_table_privilege(r.oid, t.oid, 'DELETE') THEN 'd' END,
      CASE WHEN has_table_privilege(r.oid, t.oid, 'TRUNCATE') THEN 'D' END,
      CASE WHEN has_table_privilege(r.oid, t.oid, 'REFERENCES') THEN 'x' END,
      CASE WHEN has_table_privilege(r.oid, t.oid, 'TRIGGER') THEN 't' END
    ) AS letters
  FROM tables t CROSS JOIN roles r
)
SELECT 'role' AS kind, r.rolname AS subject,
  format('login=%s super=%s inherit=%s createrole=%s createdb=%s replication=%s bypassrls=%s '
         'connlimit=%s valid_until=%s settings=%s member_of=%s',
    a.rolcanlogin, a.rolsuper, a.rolinherit, a.rolcreaterole, a.rolcreatedb, a.rolreplication,
    a.rolbypassrls, a.rolconnlimit, coalesce(a.rolvaliduntil::text, 'none'),
    coalesce(array_to_string(a.rolconfig, ','), 'none'),
    coalesce((SELECT string_agg(g.rolname, ',' ORDER BY g.rolname) FROM pg_auth_members m
              JOIN pg_roles g ON g.oid = m.roleid WHERE m.member = a.oid), 'none')) AS detail
FROM roles r JOIN pg_roles a ON a.oid = r.oid
UNION ALL
SELECT 'schema', r.rolname,
  format('public usage=%s create=%s, database create=%s temporary=%s',
    has_schema_privilege(r.oid, 'public', 'USAGE'), has_schema_privilege(r.oid, 'public', 'CREATE'),
    has_database_privilege(r.oid, current_database(), 'CREATE'),
    has_database_privilege(r.oid, current_database(), 'TEMPORARY'))
FROM roles r
UNION ALL
SELECT 'table', p.relname,
  string_agg(p.rolname || '=' || CASE WHEN p.letters = '' THEN '-' ELSE p.letters END, ' '
             ORDER BY p.rolname)
FROM privileges p GROUP BY p.relname
UNION ALL
SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
  string_agg(r.rolname, ' ' ORDER BY r.rolname)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN roles r
WHERE n.nspname = 'public' AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
  AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) e
                  WHERE e.grantee = 0 AND e.privilege_type = 'EXECUTE')
GROUP BY p.oid, p.proname
UNION ALL
SELECT 'default', pg_get_userbyid(d.defaclrole) || ' ' || coalesce(n.nspname, '(all)') || ' '
  || d.defaclobjtype::text, d.defaclacl::text
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) e JOIN roles r ON r.oid = e.grantee)
ORDER BY 1, 2;
