# AidJobs

A job site for NGO, humanitarian, and development work. A crawler reads organisations' career pages; the public site lists the open jobs.

**Start here:** `AGENTS.md`, then `docs/architecture/progress-ledger.md` (what is done, what is open, how the project is run). The rules are in `docs/architecture/aidjobs-migration-contract.md` and `docs/architecture/crawler-completion-plan.md`.

## Layout

```
apps/frontend/   Next.js 16 (App Router, TypeScript, Tailwind): the public site and the admin
apps/backend/    FastAPI (Python 3.11.9): the API, the crawler, and the scheduler
infra/           database schema (supabase.sql), seed data, and migrations
docs/            architecture records and plans
scripts/         pre-deploy checks
```

## Services

- Frontend: Vercel. Backend: Render. Database: Supabase PostgreSQL.
- Search runs on the database; Meilisearch is not used.
- AI extraction (OpenRouter) is optional; crawls run without it.

## Local development

1. Copy `.env.sample` to `apps/backend/.env` and `apps/frontend/.env.local` and fill in the values. It lists names only.
2. `npm install`, then the backend's Python packages:
   - On Linux with Python 3.11.9, as Render and CI do: from `apps/backend`, `bash scripts/render_build.sh` (`AIDJOBS_SKIP_BROWSER_DOWNLOAD=1` skips the browser download), then, for the tests, `python -m pip install --require-hashes --build-constraint build-tools.txt -r requirements-test.txt`.
   - On Windows or another Python: `pip install -r apps/backend/requirements-test.in`, the direct pins without the lock. The lock files are for Linux and Python 3.11.9 only (some locked packages, such as `uvloop`, do not install on Windows), so CI is the faithful test.
3. `npm run dev` starts the frontend on port 5000 and the backend on port 8000.

Other scripts: `npm run lint`, `npm run test`, `npm run build`, `npm run pre-deploy`.

## Backend dependencies

`apps/backend/requirements.in` lists the direct dependencies; `requirements.txt` is the full lock Render installs, every package at an exact version with its hashes. `requirements-test.in`, `build-tools.in`, `lock-tools.in`, and `audit-tools.in` are locked the same way. To add or change a package: edit the `.in` file, move the cut-off date in `apps/backend/scripts/lock.sh` if the new version is newer, run `bash scripts/lock.sh` from `apps/backend` with uv 0.13.6 on the path (`python -m pip install --require-hashes -r lock-tools.txt`), and commit the `.in` and `.txt` files together. CI fails when the lock files differ from what the script produces, and rehearses Render's build (`scripts/render_build.sh`, Render's Build Command) in a fresh environment.
