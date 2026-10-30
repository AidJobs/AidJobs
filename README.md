# AidJobs

A job site for NGO, humanitarian, and development work. A crawler reads organisations' career pages; the public site lists the open jobs.

**Start here:** `AGENTS.md`, then `docs/architecture/progress-ledger.md` (what is done, what is open, how the project is run). The rules are in `docs/architecture/aidjobs-migration-contract.md` and `docs/architecture/crawler-completion-plan.md`.

## Layout

```
apps/frontend/   Next.js 14 (App Router, TypeScript, Tailwind): the public site and the admin
apps/backend/    FastAPI (Python 3.11): the API, the crawler, and the scheduler
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
2. `npm install`, then `pip install -r apps/backend/requirements.txt` (to run the backend tests: `pip install -r apps/backend/requirements-test.txt`, which includes it).
3. `npm run dev` starts the frontend on port 5000 and the backend on port 8000.

Other scripts: `npm run lint`, `npm run test`, `npm run build`, `npm run pre-deploy`.
