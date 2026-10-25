# UX-31 repository tidy-up: list for approval

Prepared 25 October 2026 from `main` at `b27449a`, read-only (git, GitHub, and a code search). **Nothing on this list is deleted, moved, or changed until the user approves it.** Each group has a recommendation and, where there is a real choice, a decision for the user. Git history keeps every deleted file and every deleted branch's commits that `main` contains; a tag keeps the rest.

Never touched by this tidy-up: `apps/backend/scripts/diagnose_enrichment_bias.py` and `tests/test_link_heuristics.py` (modified, unstaged, protected), the tag `ux-demo-approved-2026-10-21`, and anything under `apps/` that runs.

## Progress

- **Approved** by the user on 25 October 2026 with these decisions: `AidJobsGit-ux` — save the uncommitted change as a patch outside both repositories, verify it (contents and `git apply --check`), inspect ignored files other than `node_modules` and stop for the user if any exist, then remove the folder and branch; the 73 guides deleted, not archived; the template and README edits in the same pull request as the deletions; stages separated by approvals; records updated only after each stage is verified. PR #45 (this list) merged as `0cfebe6`.
- **Stage 1 done (B, C, D): 26 October 2026.** PR #46, merged as `d50f2ee` with the user's approval after a pre-merge scope check (106 files: 104 deletions, 2 edits, the six proxies the only frontend files, the protected files absent). CI passed; Vercel production deployed `d50f2ee`; the user confirmed Render live on `d50f2ee`. Verified live: none of the 73 guides or the 31 other removed items remains in `main` (the root keeps `AGENTS.md`, `README.md`, and the new `.env.sample`); `GET /api/admin/config-check` and `GET /api/admin/data-quality/stats` on the live site answer 404; `/v2` and the admin login answer 200; with the user signed in and the read-only guard (which also recorded failed requests), the dashboard, Organisations, Sources, Jobs, Crawls, Data Quality, and Settings all loaded and no request failed. External callers of the removed proxies cannot be ruled out (no access to Vercel request logs); the backend routes behind them did not exist.
- **Still to do, each with its own approval:** the `AidJobsGit-ux` patch and removal (A2); the branches (A1, A2); the user's Render change (F).
- **26 October 2026, verified:** the `AidJobsGit-ux` change was saved as a patch outside the repository (SHA-256 checked; `git apply --check` onto `af72047` passes) and the folder removed with the user's approval; the branch `ux/public-layout` was kept. The four annotated archive tags were created, pushed one by one, and verified on GitHub (git and the GitHub API). The full commit ID of every branch proposed for deletion is recorded in section G. **No branch has been deleted.**

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

## G. Branch record before deletion (26 October 2026)

Recorded before any branch is deleted, so every branch can be recreated exactly. Each full commit ID was read from GitHub (`git ls-remote`) on 26 October 2026 and checked: the 55 merged branches are ancestors of `main` (`git merge-base --is-ancestor`), and each archived branch's tip equals its tag. **This record does not approve any deletion**; branch deletion needs the user's separate approval.

Since the list in A was written on 25 October: three branches were created and merged during this tidy-up (`docs/ux-31-list`, `ux-31/remove-obsolete-files`, `docs/ux-31-stage1-done`), and `codex/secure-admin-routes` moved from A1 to the archived group, so 55 branches are in `main` (A1 said 53) and 4 are archived. `main` and `demo/ux-design` (PR #22, open; its tip `acb1fcf` is the commit of the tag `ux-demo-approved-2026-10-21`) are kept and are not listed here.

### G1. Archived branches (4), preserved by annotated tags

Tags created, pushed individually, and verified on GitHub (git and the GitHub API) on 26 October 2026. `codex/secure-admin-routes` was squash-merged by PR #2 into `main` as `8d3bd7e`: `main` has its final content (the 3 files it changed are identical), but not its five original commits (`2b4ab5f`, `5437845`, `b2f5f7c`, `cee6145`, `2808f91`); the tag keeps them.

| Branch | Full commit ID (GitHub tip, 26 Oct 2026) | Classification | Archive tag | Pull request |
| --- | --- | --- | --- | --- |
| `codex/fix-scheduler-like-query` | `14cad29e4f49ee1b725f05b26a258d009e03de2a` | archived | `archive/codex-fix-scheduler-like-query` | #1 closed |
| `codex/secure-admin-routes` | `2808f9160189b7ff29e132a2f91ce8e556d33417` | archived | `archive/codex-secure-admin-routes` | #2 merged |
| `ux/public-layout` | `af72047db20afaa5843b5a45511db0a202f21428` | archived | `archive/ux-public-layout` | — |
| `fix/public-stopgap` | `2b387ca60f971d8f2bc24aa28d6031d030ed47fd` | archived | `archive/fix-public-stopgap` | #19 closed |


### G2. Branches whose commits are in `main` (55)

41 were merged through a pull request; the 14 from December 2025 had none and were merged into `main` directly.

| Branch | Full commit ID (GitHub tip, 26 Oct 2026) | Classification | Archive tag | Pull request |
| --- | --- | --- | --- | --- |
| `fix/robust-extractor-20250105-173044` | `bbdac2bc72aeb1f248228caf471177637cad98d3` | in `main` | — | — |
| `fix/crawl-logging-duration-20250105-232000` | `ea99bb5115c6ae0d661caa19e113e413b1583a74` | in `main` | — | — |
| `fix/global-extraction-improvements-shadow-test-20250106-130000` | `a07b024f382d240684682d8bc42c9c185a9ae51b` | in `main` | — | — |
| `fix/insertion-diagnosis-20250105-210000` | `c72fa4062a2bfbaebcb23ba9a5c7e0c6845cca7f` | in `main` | — | — |
| `fix/integrate-storage-proper-20250105-190000` | `bba82d989a877788402651eb96439fd436e52d4d` | in `main` | — | — |
| `fix/logging-diagnose-inserts-20250105-220000` | `b6904f317b93c9add3a0523680e9f8f947f00436` | in `main` | — | — |
| `fix/mailto-filter-failed-inserts-replay-20250106-150000` | `5a20f8b2a89db27eda20a3049a9e4a3efb7539ac` | in `main` | — | — |
| `fix/re-crawl-full-pagination-20250105-234000` | `7cc1c28e7d505107e9ee10c57abcd2c42c980851` | in `main` | — | — |
| `fix/re-crawl-full-pagination-run-20250106-120000` | `1d01f91f1b0138613e6cffcfe3c7a5fcc2e69473` | in `main` | — | — |
| `fix/remove-debug-add-monitoring-20250105-233000` | `8fbfe9308d9c7209f916f0ab5efebdfd9107b68d` | in `main` | — | — |
| `fix/robust-followup-20250105-180000` | `844dbcb22552ebdcbc5ce034f1467e1a859d9ae4` | in `main` | — | — |
| `fix/shadow-rollout-domains-20250105-200000` | `7d3b9dff52ee35f8921cc67b51e02761cb0591b1` | in `main` | — | — |
| `fix/sql-debug-insert-20250105-230000` | `fc57c02c68083ba9ea5c4e31f4352c6403045785` | in `main` | — | — |
| `fix/sql-insert-field-value-sync-20250105-231000` | `da47aad681d0dd85129e7bab4e6ad2f69b4a0f7a` | in `main` | — | — |
| `cleanup/fix-mailto-sql-20251206` | `853bb111aa3eadca23e671dfe95c5bb26809b726` | in `main` | — | #3 merged |
| `fix/admin-session-cookie` | `71888a7c9b21fc472781567afcaf9d65b3555104` | in `main` | — | #6 merged |
| `crawler-hardening-ci` | `37761f752f8bab4d3c9762aeb1110e441c1ea06a` | in `main` | — | #7 merged |
| `crawler-detail-reader-ci` | `487b92b0380faddf2592266f3d129a5a9c2ee728` | in `main` | — | #8 merged |
| `crawler-reader-deadline` | `ac27d6e4431dcd7e4b0c97c5cd15d831f730cba1` | in `main` | — | #9 merged |
| `docs-crawler-plan-c4-status` | `997466cd22edcb1577914eaa9b1b442f66613788` | in `main` | — | #10 merged |
| `docs-progress-ledger` | `d0bb7d5054fc4cca30c3f0cc6fc9a4554c4a800d` | in `main` | — | #12 merged |
| `unicef-reader-fallback` | `cbc6bf33e9ec9cf0a6efedea0c38beef64097b1b` | in `main` | — | #11 merged |
| `docs-ledger-crawler-shape` | `52db6422fba318ad1545cae7988d0b4f5d01eb5c` | in `main` | — | #16 merged |
| `geocoder-backoff` | `a84253e6e7649e28b5e9c7cbd8f2df6dde931d41` | in `main` | — | #15 merged |
| `iso-deadline-fix` | `9ed92ec56697b8cdabc86e75b15395689d671b99` | in `main` | — | #17 merged |
| `unicef-listing-pacing` | `3be4d394e7e19ddb85413c5def74d37aa55da0d6` | in `main` | — | #14 merged |
| `unicef-listing-pages` | `21b8fa4517fe368848bd7a498ec8b47d02fe2cd6` | in `main` | — | #13 merged |
| `docs/public-ux-direction` | `edda7666cfb003ae59cdc9c735940d65efe98fc3` | in `main` | — | #20 merged |
| `docs/ux-demo-first` | `e18564f5466a18e755428e472662a1daf8acebf2` | in `main` | — | #21 merged |
| `docs-ux-track` | `d5b475227515e690c1866aaec504de1d4b5b37fc` | in `main` | — | #18 merged |
| `docs/hosting-decisions` | `a8c2cd9768be51833093574edf221712943aedb4` | in `main` | — | #25 merged |
| `docs/ux-08-assessment` | `3fa0fd7a08f7e5c1b122fa05abb840d48c931e47` | in `main` | — | #24 merged |
| `docs/ux-demo-decisions` | `fba896421f0d127857797864a9a728658b62c582` | in `main` | — | #23 merged |
| `ux-09/design-foundation` | `3b6048b680325faf4c801f5f30a7bc9efb2fa6eb` | in `main` | — | #26 merged |
| `docs/netlify-removed` | `c17a71b673c80aa6f46ab4c6e6d0d09b6b69e40f` | in `main` | — | #30 merged |
| `docs/ux-09-done` | `f39d82cb0515878cc8f4a37d559b5edb93ce162c` | in `main` | — | #27 merged |
| `docs/ux-10-done` | `d038f4e43c05cab15658d6d65012609e812f7de7` | in `main` | — | #29 merged |
| `ux-10/live-site` | `05e4fdf268094be58504c75b90a3a8cf4fbffe07` | in `main` | — | #28 merged |
| `docs/status-review-2026-10-24` | `2c31b09bd35460e3ad22a79054ec417e365729e8` | in `main` | — | #33 merged |
| `docs/ux-04-done` | `4dc8715989f4fd352c20beb01a441ae5f6e6f604` | in `main` | — | #36 merged |
| `docs/ux-05-done` | `e22cc96c3f332dd6cf1cc703066466daa7674a88` | in `main` | — | #38 merged |
| `docs/w30-data-api-closed` | `12d73464c3428877b94c148cef30bae296c7b35c` | in `main` | — | #32 merged |
| `security/remove-leaked-secrets` | `eb395b9882337fad63cb1425fd133eadd4ce7021` | in `main` | — | #31 merged |
| `security/w22-production-mode` | `c6471c7ef8d7041294ecf14e1f69b1ee970760e0` | in `main` | — | #34 merged |
| `ux-04/data-quality-listing` | `66af62aad10b33e365660f6f43289224789e7bc5` | in `main` | — | #35 merged |
| `ux-05/admin-labels-and-states` | `051bddabdaad3b41fca5c7700971825d68f4f068` | in `main` | — | #37 merged |
| `docs/session-fix-done` | `5d979558852700e03efc41bcbbf01ed2c6452876` | in `main` | — | #42 merged |
| `docs/ux-06-done` | `02ddd3878dfabfe7d13046b6d2a432945a7d0c78` | in `main` | — | #40 merged |
| `docs/ux-07-done` | `60edf4ba7b320548e93dc2bc1cb15a46c8e59f7e` | in `main` | — | #44 merged |
| `docs/ux-31-list` | `0317d5b05ae0f9d7f24422b1de4b158d89a5108f` | in `main` | — | #45 merged |
| `fix/admin-session-startup` | `96c1c31e61c34f28f52e3d1139177484b3113bc2` | in `main` | — | #41 merged |
| `ux-06/admin-delete-safety` | `e3f987540f4ac3a99be1a95bfb836b49006d753a` | in `main` | — | #39 merged |
| `ux-07/admin-dates` | `84fbbde005e6003f1cde86f1b8140adfb053d746` | in `main` | — | #43 merged |
| `docs/ux-31-stage1-done` | `8979f3d1a944037732545e5eeae30265353ac869` | in `main` | — | #47 merged |
| `ux-31/remove-obsolete-files` | `1d8aa928eb9e685cd6b1ce496998d6423ff5b108` | in `main` | — | #46 merged |


### G3. Recovery

- A branch in G2: `git push origin <full commit ID>:refs/heads/<branch>` recreates it exactly. For a branch with a merged pull request, the pull request page on GitHub also offers "Restore branch".
- A branch in G1: recreate it from its full commit ID in G1; the archive tag is the evidence that the ID is right. Use the ID, not the form `<tag>^{commit}`: typed unquoted into PowerShell, `^{commit}` is misread and points at the commit before (tested 26 October 2026).
  - `git push origin 14cad29e4f49ee1b725f05b26a258d009e03de2a:refs/heads/codex/fix-scheduler-like-query`
  - `git push origin 2808f9160189b7ff29e132a2f91ce8e556d33417:refs/heads/codex/secure-admin-routes`
  - `git push origin 2b387ca60f971d8f2bc24aa28d6031d030ed47fd:refs/heads/fix/public-stopgap`
  - `git push origin af72047db20afaa5843b5a45511db0a202f21428:refs/heads/ux/public-layout`
- The uncommitted `tailwind.config.js` change of `ux/public-layout` is also kept outside the repository, in `C:\Users\DELL\Documents\AidJobs App\aidjobs-patches\`, as `ux-public-layout-af72047-tailwind-config-uncommitted.patch` (SHA-256 `8BCED966FD765B3174F1D9E863D40B4E0DEAD65D8464F7BCF2AEF8E716B732E8`).
- A local copy: `git branch <branch> origin/<branch>` while the branch is on GitHub, or from the commit ID or tag above.
- Vercel previews: expected but not verified — deleting a branch should leave its existing deployments in place, and a recreated branch should get a new preview on its next push. How long Vercel keeps old deployments, and what happens to a deleted branch's preview alias, were not verified either.

## How it would be carried out, after approval

1. One pull request for B, C, and D (files only), with the test suites, CI, and a preview check of the admin and `/v2` with the read-only guard; merged only with the user's approval.
2. Branches (A) after that merge: create the three archive tags, then delete the approved branches on GitHub and locally; report the remaining branches.
3. The user's Render change (F), then a health check.
4. Record the outcome in the ledger and the UX plan.
