# AidJobs — Progress ledger

**Start here.** This file records what is done, what is open, and what to do next. It is a tracker, not a rulebook. The rules live in two documents, and this ledger does not override them:

- `docs/architecture/aidjobs-migration-contract.md` — the architecture contract.
- `docs/architecture/crawler-completion-plan.md` — the crawler gates (B1–B5, C1–C5) and their records.

**Last verified:** 18 October 2026. `main` is `4947d44` (merge of PR #11). Render runs `4947d44`; the user confirmed that deploy the same day.

Every claim below is marked **Verified** (checked against git, GitHub, CI, or a production query the user ran), **Repository** (true of the code, not checked in production), or **Not verified**.

## How to resume

1. Read this file, then the "Open work" list. Take the lowest-numbered item that is not blocked.
2. Check the current state before acting: `git status -sb`, `git log -1 origin/main`, and `gh pr list --state open`. If `main` has moved past `4947d44`, find out why before trusting this file.
3. Follow the operating conventions below.
4. When an item is finished, update this file in the same pull request as the work, or in the next docs pull request.

### Operating conventions

These describe how the work is run. The architecture rules are in the contract.

- Every step needs the user's explicit approval: investigate, plan, implement, merge. "Approve" covers the step it answers and nothing more.
- Work happens on a branch, through a pull request into `main`. Do not push `main` directly.
- **Merging to `main` deploys the backend.** Render redeploys automatically when `main` changes. Merge only with explicit approval.
- After a merge: confirm `origin/main`, CI on `main`, and the Render deploy. Then fast-forward local `main`.
- Do not crawl production, write to the jobs database, or reindex search unless the user asks for that step.
- Commit only the files the step names. Never stage `apps/backend/scripts/diagnose_enrichment_bias.py` or `tests/test_link_heuristics.py`. Both carry unrelated Pyright-ignore comments and stay modified and unstaged.
- The local shell is PowerShell on Windows. Use `@" "@` here-strings for commit messages, not bash heredocs. `gh --jq` filters with spaces break in PowerShell; pipe JSON to `ConvertFrom-Json` instead.
- Local tests run from `apps/backend` with `.venv\Scripts\python.exe` (Python 3.14). CI uses Python 3.11.9. Run the exact CI Ruff and pytest lists from `.github/workflows/ci.yml`. `dateparser` and `lxml` must be installed locally, or local results differ from CI.
- Saved career pages live in gitignored `raw-html/`. Tests that read them skip on CI. Never commit them.

## Current state

### Production

| Item | State | Evidence |
| --- | --- | --- |
| Backend | Render, auto-deploys from `main`, running `4947d44` | Verified by the user, 18 October 2026 |
| Frontend | Vercel; Netlify builds pull-request previews | Verified from pull-request checks |
| Live sources | Two: UNICEF and ICRC | Verified from production queries |
| Public search | Served by the PostgreSQL text search (`ILIKE` on title, organisation, and description). Meilisearch does not work | Verified by the user: new jobs are found by search |
| AI extraction | `OPENROUTER_API_KEY` is set, but the account has no credits. Every crawl tries AI, the call fails, and the rule-based path runs | User report; the fallback behaviour is Repository |

### Live sources

| Source | Listing URL | Latest crawl | Result |
| --- | --- | --- | --- |
| UNICEF | `https://jobs.unicef.org/en-us/listing/` | 18 October 2026, 09:30 UTC | 20 found, 20 inserted. All 20 have a location and a deadline (20–31 October). No rejections. No duplicate links. Verified |
| ICRC | `https://careers.icrc.org/go/Global-Opportunities/8821501/` | 17 October 2026, 18:40 UTC | 34 found, 14 saved, 20 correctly rejected, no `thin_vacancy`. One deadline corrected to `2026-11-06` by the normal update. Verified |

The UNICEF crawl at 09:21 UTC on 18 October failed with `HTTP 0`, meaning no response was received. The next crawl succeeded. The cause is in the Render log (`Error fetching https://jobs.unicef.org`), which was not read. Not verified.

### Search

- `SearchService.search_query` in `apps/backend/app/search.py` queries Meilisearch when it is configured, and always queries PostgreSQL. When Meilisearch returns nothing usable, the PostgreSQL result is served. That is why users find jobs. Repository, with the user's confirmation that search works.
- The PostgreSQL query is a plain `ILIKE` match. The schema already has a full-text column and index (`search_tsv`, GIN, with a trigger) and the `pg_trgm` extension in `infra/supabase.sql`. Search does not use them. Repository.
- The contract (§3 and §13) already requires SQL search to keep working when Meilisearch is down. No document records a decision to replace Meilisearch. The plan defers the search-architecture decision until after the crawler plan.

## Done

| What | Where | Date | Evidence |
| --- | --- | --- | --- |
| Admin access required in every environment | PR #2, `8d3bd7e` | 30 Sep 2026 | Merged |
| Architecture reset, Gates 0–10 | PR #3, `71f3a06` | 6 Oct 2026 | Merged |
| Scheduler health query wildcards escaped | `5208b20` | 7 Oct 2026 | On `main` and deployed. The older to-do "deploy 5208b20" is closed |
| Gate 11, one admission controller | `9d5666b` | 8 Oct 2026 | On `main`. Record: `gate-11-unified-admission.md` |
| Failed persistence counted; RSS/API save failures re-raised | `28b9efc` | 10 Oct 2026 | On `main`, confirmed on Render |
| Admin session cookie kept after login | PR #6, `04bc12d` | 11 Oct 2026 | Merged |
| Cached session check no longer bounces admin to login | `cae79f7` | 14 Oct 2026 | On `main` |
| B1 fetch policy, C1 response decoding, C3 admission, C4 reader (not yet used) | PR #7, `0475b28` | 14 Oct 2026 | Merged, CI green, deployed |
| Generic detail regex replaced by the detail-page reader | PR #8, `818e569` | 17 Oct 2026 | Merged, deployed, verified live on ICRC |
| Reader deadlines parsed day-first | PR #9, `6c453c8` | 17 Oct 2026 | Merged, deployed, verified live (`2026-11-06`) |
| Plan updated with C4 status and open findings | PR #10, `31ee357` | 18 Oct 2026 | Merged |
| UNICEF job-card reader used when AI produces nothing | PR #11, `4947d44` | 18 Oct 2026 | Merged, deployed, verified live (20 jobs) |
| Superseded scheduler draft closed | PR #1 | 18 Oct 2026 | Closed with a comment |

PR #7 introduced a regression: from 15 October, every UNICEF job was rejected as `thin_vacancy`, and three crawls (15, 17, 18 October) saved nothing. PR #11 fixed it. The C3 analysis had not been checked against the live UNICEF source.

## Gate status

| Gate | Status | What is left |
| --- | --- | --- |
| Track A, Meilisearch investigation | Not started | The whole investigation. Independent of the crawler gates |
| B1, outbound fetch policy | Done and deployed | Check the policy on the deployed backend (part of B5) |
| B2, extraction and admission audit | Recorded | None |
| B3, identity and upsert audit | Recorded from the repository | Production keys are not verified. No identity change is planned |
| B4, failure and lifecycle audit | Not started | Read-only audit. Production evidence is now available (see W-05) |
| B5, completion record | Not started | After B4 |
| C1, decode responses | Done and deployed | None |
| C2, labels | Recorded | None |
| C3, admission amendment | Done and deployed | None. Its UNICEF regression was fixed by PR #11 |
| C4, reader | Done and deployed (PR #8, #9) | None |
| C4, confirmation fetch | Re-scoped, not built | Only listings above 50 candidates, plus `detail_unconfirmed` logging (W-09) |
| C5, six sites | ICRC met | Oxfam, DevNetJobsIndia, Global Partnership for Education, International Rescue Committee, Médecins Sans Frontières (W-07, W-08) |

## Completion criteria

From the crawler plan. The crawler plan is complete only when every line is met.

| Criterion | Status |
| --- | --- |
| Every live fetch path uses the outbound policy, including redirects and DNS, and fails closed | Repository and deployed. Not verified on the deployed backend |
| Timeouts and response-size limits are enforced | Repository. Not verified on the deployed backend |
| Genuine vacancies admitted, obvious junk rejected | Verified live for ICRC and UNICEF. Not established for other sites |
| HTML, RSS, and API use the same admission and persistence contract | Repository (Gate 11) |
| Identity unchanged, one writer, suppression survives recrawl | Repository (B3). Live: no duplicate links after the UNICEF and ICRC crawls |
| Failed or partial crawls cannot expire or delete jobs | Repository. Live: the failed UNICEF crawl on 18 October changed no jobs |
| Adapter persistence failures counted; RSS/API save failures not swallowed | Repository (`28b9efc`). The HTML all-rows-fail case is parked (Issue #5) |
| A search-projection failure does not undo a PostgreSQL commit | Repository (Gate 7 test) |
| Relevant tests pass, and the fetch policy is checked on the deployed backend | Tests pass (CI on `4947d44`). The deployed check is not done |

## Open work

Each item needs its own approval. Agreed order on 18 October 2026: W-01, then the documentation pull request (W-03), then W-04, W-05, W-06, and W-07. W-02 is an inspection only: no job is hidden or retired until the W-06 rule is agreed and validated.

### Now

**W-01. Revoke the leaked OpenRouter key.** User action.
GitHub has one open secret-scanning alert: an OpenRouter API key committed to this repository on 21 November 2025. Anyone with read access to the repository history can use it. Revoke the key in the OpenRouter dashboard, create a new key only if AI is wanted (see W-14), store it only in Render, and close the alert in GitHub under *Security → Secret scanning*. Deleting the line from the file does not remove the key from git history; revoking it does.

**W-02. Inspect the stale UNICEF rows from 6 December 2025.** Read-only. Do not hide them yet.
Sixteen active UNICEF rows created on 6 December 2025 have no deadline, so search shows them indefinitely. Age alone is not proof they are closed. Inspect the records first. Nothing is hidden or retired until the W-06 rule is agreed and validated.

What the admin controls do (Repository, from the code):
- **Soft Delete** on the Jobs page (`POST /api/admin/jobs/delete-bulk`, soft option) sets `deleted_at`, `deleted_by`, and `deletion_reason`. It is reversible.
- **Restore** on the Jobs page (`POST /api/admin/jobs/restore`) clears `deleted_at`, `deleted_by`, and `deletion_reason`.
- **Hard Delete** on the Jobs page, and "delete jobs by source" on the Sources page with the hard option, remove rows permanently. Never use them. Hard deletion also cascades to shortlists.
- A soft-deleted job disappears from public search. The PostgreSQL query requires `deleted_at IS NULL`, and Meilisearch results are re-checked against PostgreSQL. Restore brings it back.

The menu rows hidden on 8 October used the soft action and have stayed hidden.

**W-03. Record PR #11 in the crawler plan.** Docs only. Done in the same pull request as this ledger.

### Crawler plan, in order

**W-04. Read every page of the UNICEF listing.**
The UNICEF listing shows 20 jobs per page, and the crawler reads only the first page. First find how UNICEF's pages link to each other: an offline look at the saved page, then one approved request. Then propose code. Reading all pages also refreshes the 8 and 12 October rows, which will gain a location and deadline through the normal update. The contract treats a crawl that missed pages as partial (§5), so this must land before any expiry rule.

**W-05. B4 failure and lifecycle audit.** Read-only.
Mark each B4 rule verified or defective. Production evidence already collected:
- The failed UNICEF crawl (`HTTP 0`, 18 October) changed no jobs (Verified). Per the code it added one to `consecutive_failures`; the stored value was not read (Repository).
- "NC" in the admin is `consecutive_nochange`: crawls in a row that inserted and updated nothing. Three or more makes the scheduler crawl less often. The broken UNICEF crawls raised it to 3; the 09:30 crawl reset it.
- Rows hidden on 8 October have stayed hidden.

**W-06. Expiry policy decision.** Decision, after W-04.
Closed jobs with no deadline never leave search. The contract (§6) forbids expiring a job because a crawl did not return it until a written trust policy and a consecutive-missing threshold are approved as their own decision, separate from any implementation pull request. Draft that policy for approval: what counts as a complete, trustworthy crawl, and how many such crawls a job may be missing before it expires. This solves stale rows for every source.

**W-07. Oxfam GB as a live source.** C5.
Listing `https://jobs.oxfam.org.uk/jobs/home/`. Its three saved job pages gave all three fields offline. Add it, crawl once, and check it the way ICRC was checked.

**W-08. The rest of C5.**
- DevNetJobsIndia: about 150 candidates, above the 50-job detail limit. Needs W-09 or listing-level fields.
- Global Partnership for Education: its links are not extracted.
- International Rescue Committee: the saved page is a landing page, not a job list.
- Médecins Sans Frontières: `/careers` returned 404. `https://www.msf.org/jobs` needs one approved fetch.
- ReliefWeb HTML stays out: it returns a challenge page.

**W-09. C4 confirmation fetch.** Only for listings above 50 candidates that are not UNDP or UNICEF, plus `detail_unconfirmed` logging. The rules are in the plan.

**W-10. B5 completion record**, including a check of the fetch policy on the deployed backend.

### Robustness

**W-11. Repair the plugin registry.** `crawler/plugins/unesco.py` does not compile (`IndentationError`, line 161). The registry catches only `ImportError`, so building it always fails. The UNDP plugin also fails to import (`core.data_quality` has no `data_quality_validator`). Today this only affects the AI-off path. PR #11 avoids it by importing the UNICEF reader directly. Repository, confirmed on `main` and on PR #11.

**W-12. Two-digit years.** `_parse_deadline` uses `dateparser` with `PREFER_DATES_FROM: future`, so `03-Dec-25` becomes `2125-12-03`. This predates PR #8.

**W-13. The AI normaliser reads numeric dates month-first.** `normalize_deadline` calls `dateparser` without `DATE_ORDER`. The detail reader, the general listing reader, and the UNICEF reader all store `YYYY-MM-DD` before it runs, so this is now rare.

**W-14. Decide the OpenRouter setup.** With no credits, every crawl spends time on a failed AI call. Either add credits or remove the key. Removing the key sends every HTML source down the plugin path, which needs W-11 first and changes the verified ICRC path. Do W-01 regardless.

**W-15. Issue #5, parked.** HTML can report `ok` when every row failed to save. "Failed persistence can still advance next_run_at."

**W-16. Issue #4, parked.** Test-suite cleanup, including the JSON-LD circular import that stops `tests/test_pipeline_extractor.py` and `tests/test_pipeline_integration.py` from being collected.

### Search

**W-17. Clearing a search shows no jobs.** Record only; not scheduled.
After a search, clearing the search box shows no jobs until the filters are also cleared. A likely cause, not verified: the clear button in `apps/frontend/components/TrinitySearchBar.tsx` calls `onSearch(parsedFilters, '')` with the filters from before the reset, because the state update has not applied yet. `HomeClient.tsx` then rebuilds the query from those old filters.

**W-18. Track A and the search-architecture decision.** After the crawler plan.
Track A explains why Meilisearch fails. The decision afterwards is whether to repair Meilisearch or to use PostgreSQL full-text search with the existing `search_tsv` index. Either option must keep PostgreSQL authoritative and pass the two Gate 7 tests in the contract (§13).

### Scaling to hundreds of sites

**W-19. Platform readers.** Proposal, not approved. Stays a proposal until each platform is verified against the real source systems.
Many organisations publish jobs through the same few recruitment systems. One reader per system can cover many sites, where one reader per site cannot scale. Evidence so far: the UNICEF listing links to "Powered by PageUp" (observed). ICRC's `/go/…` and `/job/…/{id}` paths and SAP session cookies point to SAP SuccessFactors (likely, not verified). The plan for this would:

1. finish the six-site gate first;
2. survey the sources to be added and group them by recruitment system;
3. build and test one reader per system, the way the UNICEF reader was built;
4. check every new source offline before adding it: one approved fetch, then extraction, admission, and a report.

The plan's "After this plan" section lists the later work: extracting stages from `SimpleCrawler`, consolidating normalisation, the Organisation model, removing legacy paths, and the Discovery Fabric (Scout, Mapper, Frontier, Source Profiles, Drift Detection).

**W-20. ICRC's other lists.** User decision.
The Global Opportunities source does not cover ICRC's HQ, Local, or Graduates and Students lists. Each would be its own source.

### Known and deliberately left alone

- UNICEF job `596188` has two rows, because UNICEF renamed it and the link changed. Fixing it would mean an identity redesign, which the contract rules out.
- The two Pyright files stay modified and unstaged.

## Decisions waiting on the user

| Decision | Item |
| --- | --- |
| Revoke the leaked OpenRouter key, and whether to keep AI at all | W-01, W-14 |
| Whether to hide the December 2025 UNICEF rows, after inspection and the W-06 rule | W-02 |
| Approve one request to find UNICEF's page links | W-04 |
| The expiry trust policy and missing-crawl threshold | W-06 |
| Add Oxfam GB as a source | W-07 |
| Add ICRC's other lists | W-20 |
| Whether to plan platform readers | W-19 |

## Terms used in this project

- **`thin_vacancy`**: a link that looks like a job but carries no location, deadline, or contract type. Rejected.
- **`no_qualifying_family`**: an ordinary page link with nothing that marks it as a vacancy. Rejected.
- **`root_careers_page`**, **`social_profile`**, **`vendor_badge`**: a careers home page, a social media link, or a "powered by" badge. Rejected.
- **NC**: `consecutive_nochange` in the admin, the number of crawls in a row that saved nothing.
- **`HTTP 0`**: the crawler received no response at all, for example a timeout, connection error, or a request blocked by the fetch policy.
- **Suppressed, or hidden**: `deleted_at` is set by an admin. A recrawl never clears it.
- **Expired**: a lifecycle state the contract allows only after the W-06 policy is approved. Not used today.
