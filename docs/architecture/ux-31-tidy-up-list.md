# UX-31 repository tidy-up: list for approval

Prepared 25 October 2026 from `main` at `b27449a`, read-only (git, GitHub, and a code search). **Nothing on this list is deleted, moved, or changed until the user approves it.** Each group has a recommendation and, where there is a real choice, a decision for the user. Git history keeps every deleted file and every deleted branch's commits that `main` contains; a tag keeps the rest.

Never touched by this tidy-up: `apps/backend/scripts/diagnose_enrichment_bias.py` and `tests/test_link_heuristics.py` (modified, unstaged, protected), the tag `ux-demo-approved-2026-10-21`, and anything under `apps/` that runs.

## A. Branches

GitHub has 58 branches besides `main`, and the local copy has the same names (no local-only branch). There is one tag, `ux-demo-approved-2026-10-21`.

### A1. Already in `main` — delete on GitHub and locally (53)

Recommendation: delete all 53. Each is either an ancestor of `main` or (one case) merged by its pull request with the commits squashed.

| Branch | Last commit | In `main` | Pull request |
| --- | --- | --- | --- |
| `fix/robust-extractor-20250105-173044` | 2025-12-05 | yes | — |
| `fix/robust-followup-20250105-180000` | 2025-12-06 | yes | — |
| `fix/integrate-storage-proper-20250105-190000` | 2025-12-06 | yes | — |
| `fix/shadow-rollout-domains-20250105-200000` | 2025-12-06 | yes | — |
| `fix/insertion-diagnosis-20250105-210000` | 2025-12-06 | yes | — |
| `fix/logging-diagnose-inserts-20250105-220000` | 2025-12-06 | yes | — |
| `fix/sql-debug-insert-20250105-230000` | 2025-12-06 | yes | — |
| `fix/sql-insert-field-value-sync-20250105-231000` | 2025-12-06 | yes | — |
| `fix/crawl-logging-duration-20250105-232000` | 2025-12-06 | yes | — |
| `fix/remove-debug-add-monitoring-20250105-233000` | 2025-12-06 | yes | — |
| `fix/re-crawl-full-pagination-20250105-234000` | 2025-12-06 | yes | — |
| `fix/re-crawl-full-pagination-run-20250106-120000` | 2025-12-06 | yes | — |
| `fix/global-extraction-improvements-shadow-test-20250106-130000` | 2025-12-06 | yes | — |
| `fix/mailto-filter-failed-inserts-replay-20250106-150000` | 2025-12-06 | yes | — |
| `codex/secure-admin-routes` | 2026-10-01 | via PR (squashed) | #2 merged |
| `cleanup/fix-mailto-sql-20251206` | 2026-10-06 | yes | #3 merged |
| `fix/admin-session-cookie` | 2026-10-11 | yes | #6 merged |
| `crawler-hardening-ci` | 2026-10-14 | yes | #7 merged |
| `crawler-detail-reader-ci` | 2026-10-16 | yes | #8 merged |
| `crawler-reader-deadline` | 2026-10-17 | yes | #9 merged |
| `docs-crawler-plan-c4-status` | 2026-10-18 | yes | #10 merged |
| `unicef-reader-fallback` | 2026-10-18 | yes | #11 merged |
| `docs-progress-ledger` | 2026-10-18 | yes | #12 merged |
| `unicef-listing-pages` | 2026-10-19 | yes | #13 merged |
| `unicef-listing-pacing` | 2026-10-19 | yes | #14 merged |
| `geocoder-backoff` | 2026-10-19 | yes | #15 merged |
| `docs-ledger-crawler-shape` | 2026-10-19 | yes | #16 merged |
| `iso-deadline-fix` | 2026-10-19 | yes | #17 merged |
| `docs-ux-track` | 2026-10-20 | yes | #18 merged |
| `docs/public-ux-direction` | 2026-10-20 | yes | #20 merged |
| `docs/ux-demo-first` | 2026-10-20 | yes | #21 merged |
| `docs/ux-demo-decisions` | 2026-10-21 | yes | #23 merged |
| `docs/ux-08-assessment` | 2026-10-21 | yes | #24 merged |
| `docs/hosting-decisions` | 2026-10-21 | yes | #25 merged |
| `ux-09/design-foundation` | 2026-10-21 | yes | #26 merged |
| `docs/ux-09-done` | 2026-10-23 | yes | #27 merged |
| `ux-10/live-site` | 2026-10-23 | yes | #28 merged |
| `docs/ux-10-done` | 2026-10-23 | yes | #29 merged |
| `docs/netlify-removed` | 2026-10-23 | yes | #30 merged |
| `security/remove-leaked-secrets` | 2026-10-24 | yes | #31 merged |
| `docs/w30-data-api-closed` | 2026-10-24 | yes | #32 merged |
| `docs/status-review-2026-10-24` | 2026-10-24 | yes | #33 merged |
| `security/w22-production-mode` | 2026-10-24 | yes | #34 merged |
| `ux-04/data-quality-listing` | 2026-10-24 | yes | #35 merged |
| `docs/ux-04-done` | 2026-10-24 | yes | #36 merged |
| `ux-05/admin-labels-and-states` | 2026-10-24 | yes | #37 merged |
| `docs/ux-05-done` | 2026-10-24 | yes | #38 merged |
| `ux-06/admin-delete-safety` | 2026-10-25 | yes | #39 merged |
| `docs/ux-06-done` | 2026-10-25 | yes | #40 merged |
| `fix/admin-session-startup` | 2026-10-25 | yes | #41 merged |
| `docs/session-fix-done` | 2026-10-25 | yes | #42 merged |
| `ux-07/admin-dates` | 2026-10-25 | yes | #43 merged |
| `docs/ux-07-done` | 2026-10-25 | yes | #44 merged |


### A2. Not in `main` — decide each (4)

| Branch | What it holds | Recommendation |
| --- | --- | --- |
| `demo/ux-design` | The approved design demo (PR #22, open, 15 commits). Its final state is also the tag `ux-demo-approved-2026-10-21`. | **Keep** until Stage B is done, as the UX plan says. Leave PR #22 open. |
| `codex/fix-scheduler-like-query` | 1 commit, `14cad29` "escape SQL LIKE patterns in source health query" (PR #1, closed). The same fix reached `main` separately as `5208b20` (ledger, Done table). | Tag it `archive/codex-fix-scheduler-like-query`, then delete the branch. |
| `fix/public-stopgap` | 1 commit, `2b387ca` "keep job actions on screen and show saved jobs" (PR #19, closed on the user's decision of 21 October 2026: public fixes to the old site are dropped). | Tag it `archive/fix-public-stopgap`, then delete the branch. |
| `ux/public-layout` | 3 commits from 15 October 2026 (`34a64cc` responsive public layout, `6b63e5b` simpler home search, `af72047` "record the paused UX checkpoint"), no pull request; superseded by the new site at `/v2`. It is checked out in a second working folder, `AidJobsGit-ux`, which has **one uncommitted change** to `apps/frontend/tailwind.config.js`. | Tag the branch `archive/ux-public-layout`. **Decision for the user:** the uncommitted change in `AidJobsGit-ux` — (a) save it as a patch file outside the repository, then remove the folder and delete the branch (recommended), or (b) leave the folder and branch as they are. |

## B. Old guides in the repository root (73 files)

Recommendation: **delete** all 73. They describe setups that no longer exist (Meilisearch, Netlify, Replit, old admin password fixes); several held the secrets removed in W-30; none is linked from the code. Three are named as examples in the ledger and UX plan; those mentions stay as history. `README.md` and `AGENTS.md` stay.

**Decision for the user:** delete (recommended; git history keeps them) or move them into the existing `archive/` folder.

| Guide | Last change |
| --- | --- |
| `ADMIN_AUTH_FIX_SUMMARY.md` | 2025-11-11 |
| `ADMIN_DASHBOARD_STATUS.md` | 2025-11-14 |
| `ADMIN_FIX_SUMMARY.md` | 2026-10-24 |
| `ADMIN_PASSWORD_FIX.md` | 2026-10-24 |
| `ADMIN_PASSWORD_QUICK_FIX.md` | 2026-10-24 |
| `AI_EXTRACTION_IMPROVEMENTS.md` | 2025-12-04 |
| `AIDJOBS_CONSOLIDATED_MASTER_PLAN.md` | 2025-12-04 |
| `API_ENDPOINTS_REFERENCE.md` | 2025-12-05 |
| `API_SOURCE_TESTING_GUIDE.md` | 2025-11-11 |
| `APPLE_DESIGN_SYSTEM.md` | 2025-11-13 |
| `BUGS_FOUND.md` | 2025-11-14 |
| `COLOR_SYSTEM_REFERENCE.md` | 2025-11-14 |
| `CRAWLER_ENDPOINTS_VERIFICATION.md` | 2025-11-17 |
| `DASHBOARD_FUNCTIONALITY_CHECK.md` | 2025-11-14 |
| `DASHBOARD_INCOMPLETE_FEATURES.md` | 2025-11-14 |
| `DATABASE_CONNECTION_FIX.md` | 2025-11-30 |
| `DEBUG_DASHBOARD_FUNCTIONALITY.md` | 2025-11-14 |
| `DEPLOYMENT_INSTRUCTIONS.md` | 2025-11-30 |
| `DIAGNOSE_FROM_BACKEND.md` | 2025-11-23 |
| `END_TO_END_VERIFICATION.md` | 2025-11-14 |
| `ENRICHMENT_GUIDE.md` | 2025-11-24 |
| `ENRICHMENT_PIPELINE_FIXES.md` | 2025-11-24 |
| `ENTERPRISE_CATEGORIZATION_IMPLEMENTATION.md` | 2025-11-30 |
| `ENTERPRISE_SCALABILITY_PLAN.md` | 2025-11-30 |
| `ENV_VARS_QUICK_REFERENCE.md` | 2025-12-06 |
| `ENVIRONMENT_VARIABLES_CHECKLIST.md` | 2026-10-24 |
| `FEATURE_DOCUMENTATION.md` | 2025-11-10 |
| `FIX_ADMIN_PASSWORD_NOW.md` | 2026-10-24 |
| `FIX_ADMIN_PASSWORD_STEP_BY_STEP.md` | 2026-10-24 |
| `FIX_SOURCES_PAGE_CACHE.md` | 2025-11-14 |
| `FIXES_SUMMARY.md` | 2025-11-30 |
| `FUNCTIONALITY_PRIORITY.md` | 2025-11-14 |
| `HOW_TO_CHECK_QUALITY_DASHBOARD.md` | 2025-11-24 |
| `HOW_TO_CHECK_UNDP_CRAWL.md` | 2025-11-24 |
| `MEILISEARCH_OPENROUTER_SETUP.md` | 2025-11-23 |
| `MEILISEARCH_PRIORITY.md` | 2025-11-24 |
| `MEILISEARCH_SETUP_RENDER.md` | 2025-11-24 |
| `MEILISEARCH_STATUS.md` | 2025-11-24 |
| `MEILISEARCH_TROUBLESHOOTING.md` | 2025-11-24 |
| `MIGRATION_CHECKLIST.md` | 2025-12-05 |
| `MIGRATION_GUIDE.md` | 2025-11-24 |
| `MIGRATION_STEP_BY_STEP.md` | 2025-11-30 |
| `NEXT_STEPS.md` | 2025-11-24 |
| `NEXT_STEPS_GUIDE.md` | 2025-11-30 |
| `OPENROUTER_CONFIG.md` | 2025-11-23 |
| `PHASE_1_TEST_RESULTS.md` | 2025-11-11 |
| `PHASE_2_IMPLEMENTATION_SUMMARY.md` | 2025-11-11 |
| `PHASE_2_PLAN.md` | 2025-11-11 |
| `PHASE_2_TEST_RESULTS.md` | 2025-11-11 |
| `QUICK_FRONTEND_TEST.md` | 2025-11-30 |
| `QUICK_TEST.md` | 2025-11-14 |
| `RENDER_ENV_SETUP_ADMIN_AUTH.md` | 2026-10-24 |
| `RENDER_ENV_VARS_SETUP.md` | 2026-10-24 |
| `SEEING_CHANGES_GUIDE.md` | 2025-11-14 |
| `SOURCES_PAGE_ANALYSIS.md` | 2025-11-14 |
| `SOURCES_PAGE_STATUS.md` | 2025-11-14 |
| `SOURCES_TABLE_COMPLETE_CHECK.md` | 2025-11-14 |
| `TEST_ALL_THREE_GUIDE.md` | 2025-11-11 |
| `TEST_DASHBOARD_NOW.md` | 2025-11-14 |
| `TEST_RESULTS.md` | 2025-11-12 |
| `TEST_STEPS.md` | 2025-11-12 |
| `TEST_UNESCO.md` | 2025-11-30 |
| `TESTING_SUMMARY.md` | 2025-11-12 |
| `TODO_SUMMARY.md` | 2025-11-24 |
| `TRINITY_SEARCH_ANALYSIS.md` | 2025-11-21 |
| `TRINITY_SEARCH_IMPLEMENTATION.md` | 2025-11-21 |
| `UNDP_NEXT_STEPS.md` | 2025-11-24 |
| `VALIDATION_PLAN.md` | 2025-11-24 |
| `VALIDATION_REPORT.md` | 2025-11-24 |
| `VERCEL_DEPLOYMENT.md` | 2025-11-10 |
| `VERCEL_DEPLOYMENT_FIX.md` | 2025-11-14 |
| `VERIFY_MEILISEARCH.md` | 2026-10-24 |
| `VIEW_ENRICHED_JOBS_GUIDE.md` | 2025-11-30 |


## C. Other leftovers in the repository root

| Item | What it is | Recommendation |
| --- | --- | --- |
| `main.py` | A Replit stub ("Hello from repl-nix-workspace"). The backend's tests read `apps/backend/main.py`, not this file. | Delete |
| `pyproject.toml` | Replit project file named `repl-nix-workspace`, no dependencies. The backend uses `apps/backend/requirements.txt`. | Delete |
| `Dockerfile.meilisearch`, `docker-compose.meilisearch.yml` | Meilisearch hosting; the server was deleted on 23 October 2026 (W-30). | Delete |
| `check_quality_dashboard.ps1`, `test_api_sources.json` | One-off scripts and test data from November 2025; nothing refers to them. | Delete |
| `attached_assets/` (14 files) | Prompts pasted into Replit in November 2025. | Delete |
| `archive/` (3 files) | Old deployment guides, including Netlify. | Delete, unless the user chooses to move the guides of B here |
| `report/integration-audit.json` | A one-off audit output from December 2025. | Delete |
| `env.example` and `.env.sample` | Two out-of-date templates: both still list Meilisearch and the Supabase keys removed in W-30; `.env.sample` lists `BACKEND_CORS_ORIGINS`, which the backend no longer reads (open item 18). The pre-deploy scripts in `scripts/` read `.env.sample`. | Keep one, `.env.sample`, rewritten with the variable names the code reads today (names only, no values); delete `env.example`. |
| `README.md` | Describes Meilisearch, shadcn/ui, and `env.example`. | Correct it in a few lines and point to `AGENTS.md` and `docs/architecture/`. |

Not touched: `infra/`, `scripts/`, `tests/` (holds a protected file), `packages/` (see E), `.github/`, `docs/`. The empty local folders `validators/` and `schema/` are not in git; nothing to delete there.

## D. Dead frontend proxies (open item 23)

Six route files under `apps/frontend/app/api/admin/` forward to backend routes that do not exist, and no page calls them since UX-06: `crawl/delete-jobs-by-source`, `crawl/deletion-impact/[sourceId]`, `config-check`, `crawl-v2/run`, `data-quality/logs`, `data-quality/stats`. Recommendation: delete them, with a test run and the preview check to show nothing else used them.

## E. Not in this tidy-up (recorded, separate decisions)

- `apps/backend/` holds 66 old summary documents (`*.md`) and `apps/frontend/` one; the same kind of clutter as B. Recommendation: a follow-up list after this one, so this change stays reviewable.
- `packages/ui` and `packages/lib` are npm workspaces that the frontend does not import. Removing them changes `package.json` and the lock file, so it belongs with a dependency review, not here.

## F. Done by the user, not in the repository

- Render: delete the environment variable `BACKEND_CORS_ORIGINS` (open item 18). The agent cannot change Render settings. Afterwards the backend is checked as healthy.

## How it would be carried out, after approval

1. One pull request for B, C, and D (files only), with the test suites, CI, and a preview check of the admin and `/v2` with the read-only guard; merged only with the user's approval.
2. Branches (A) after that merge: create the three archive tags, then delete the approved branches on GitHub and locally; report the remaining branches.
3. The user's Render change (F), then a health check.
4. Record the outcome in the ledger and the UX plan.
