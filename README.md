# AidJobs

A job site for NGO, humanitarian, and development work. A crawler reads organisations' career pages; the public site lists the open jobs.

**Start here:** `AGENTS.md`, then `docs/architecture/progress-ledger.md` (what is done, what is open, how the project is run). The rules are in `docs/architecture/aidjobs-migration-contract.md` and `docs/architecture/crawler-completion-plan.md`.

## Layout

```
apps/frontend/   Next.js 16 (App Router, TypeScript, Tailwind): the public site and the admin
apps/backend/    FastAPI (Python 3.11.9): the API, the crawler, and the scheduler
infra/           database schema (supabase.sql), seed data, migrations, and the database roles (roles/)
docs/            architecture records and plans
scripts/         pre-deploy checks, the settings checker, and the scripts that read the secret vault
```

## Services

- Frontend: Vercel. Backend: Render. Database: Supabase PostgreSQL.
- Search runs on the database; Meilisearch is not used.
- AI extraction (OpenRouter) is optional; crawls run without it.

## Local development

1. Copy `.env.sample` to `apps/backend/.env` and `apps/frontend/.env.local` and fill in the values. It lists names only. The database setting points at the local database below, never at production.
2. `npm install`, then the backend's Python packages:
   - On Linux with Python 3.11.9, as Render and CI do: in a fresh virtual environment (the script upgrades `pip` and `setuptools` in whichever `python` is on the path), from `apps/backend`, `bash scripts/render_build.sh`, then, for the tests, `python -m pip install --require-hashes --build-constraint build-tools.txt -r requirements-test.txt`.
   - On Windows, with Python 3.11 in a virtual environment: `pip install -r apps/backend/requirements-test.in`, the direct pins without the lock. The lock files are for Linux and Python 3.11.9 only (some locked packages, such as `uvloop`, do not install on Windows), and several pins do not install on Python 3.14, so CI is the faithful test.
3. `npm run dev` starts the frontend on port 5000 and the backend on port 8000.

Other scripts: `npm run lint`, `npm run test`, `npm run build`, `npm run pre-deploy`.

## Local database

Local work and tests use PostgreSQL 17 on this machine (security plan, stage 6). Production is reached only through the read-only login, and only for checks.

1. Install PostgreSQL 17 with the official Windows installer (postgresql.org, "Download", Windows), as a service on port 5432. The password it asks for belongs to the local `postgres` user only. Its tools are in `C:\Program Files\PostgreSQL\17\bin`.
2. Create the databases: `createdb -U postgres aidjobs_dev` and `createdb -U postgres aidjobs_test`.
3. Copy production's structure (no rows) through the read-only login, from a PowerShell prompt at the repository's root:
   `& .\scripts\with-readonly-db.ps1 -Libpq -- pg_dump --schema-only --schema=public --no-owner --no-privileges --exclude-table=public.users --exclude-table=public.payments --exclude-table=public.find_earn_submissions --exclude-table=public.findearn_submissions --file=$env:TEMP\aidjobs-schema.sql`,
   then `psql -U postgres -d aidjobs_dev -f $env:TEMP\aidjobs-schema.sql`. The four personal-data tables are outside the read-only login's reach; their structure is in `infra/supabase.sql`. Without the vault, `infra/supabase.sql` and then `infra/migrations/` in order give an older approximation.
4. Point `SUPABASE_DB_URL` in `apps/backend/.env` at `aidjobs_dev` on `localhost`.
5. Tests: from `apps/backend`, the CI lists (progress ledger, operating conventions). The crawl-ownership tests need `TEST_DATABASE_URL` set to `aidjobs_test` on `localhost` in that shell, and `SUPABASE_DB_URL` not set there.

## Secrets on this machine

Production secrets live on Render (the backend's) and Vercel (the frontend's). Two stay on this machine, in Microsoft's free SecretStore vault for PowerShell, read by scripts only while a command runs: the read-only database login (`AIDJOBS_READONLY_DB_URL`) and the Vercel preview bypass key (`VERCEL_AUTOMATION_BYPASS_SECRET`). Once stage 6 is done, no env file holds a production secret.

Once, in PowerShell:

```powershell
Install-Module Microsoft.PowerShell.SecretManagement, Microsoft.PowerShell.SecretStore -Scope CurrentUser
Register-SecretVault -Name AidJobsLocal -ModuleName Microsoft.PowerShell.SecretStore -DefaultVault
Set-SecretStoreConfiguration -Scope CurrentUser -Authentication None -Interaction None -Confirm:$false
```

With `-Authentication None` the vault is encrypted for your Windows account and opens without a password, so scripts and the agent's checks can read it; anyone signed in as you can too, which is why only the read-only login and the preview key go there.

- The read-only login: `& .\scripts\set-db-role-password.ps1 -Role aidjobs_readonly` (security plan, stage 6, step 3). It stores the connection string and puts the statement for Supabase's SQL editor on the clipboard; nothing secret is shown.
- The preview key: `Set-Secret -Name VERCEL_AUTOMATION_BYPASS_SECRET` (it asks for the value without showing it), then remove it from your environment: `[Environment]::SetEnvironmentVariable('VERCEL_AUTOMATION_BYPASS_SECRET', $null, 'User')`.
- To use them, from a PowerShell prompt: `& .\scripts\with-readonly-db.ps1 -- <command>` and `& .\scripts\with-secret.ps1 -Name VERCEL_AUTOMATION_BYPASS_SECRET -- <command>`. The read-only check: `& .\scripts\with-readonly-db.ps1 -- apps\backend\.venv311\Scripts\python.exe apps\backend\scripts\db_readonly_check.py`.
- To see what is stored, by name only: `Get-SecretInfo | Select-Object Name`.

## Backend dependencies

`apps/backend/requirements.in` lists the direct dependencies; `requirements.txt` is the full lock Render installs, every package at an exact version with its hashes. `requirements-test.in`, `build-tools.in`, `lock-tools.in`, and `audit-tools.in` are locked the same way. To add or change a package: edit the `.in` file, run `bash scripts/lock.sh` from `apps/backend` with uv 0.13.6 on the path (`python -m pip install --require-hashes -r lock-tools.txt`), and commit the `.in` and `.txt` files together. A version published after the cut-off date in `lock.sh` needs the date moved first, in its own pull request: moving it re-resolves every package, and the diff shows each move. CI fails when the lock files differ from what the script produces, and rehearses Render's build (`scripts/render_build.sh`, Render's Build Command) in a fresh environment.
