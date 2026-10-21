# AidJobs — Progress ledger

**Start here.** This file records what is done, what is open, and what to do next. It is a tracker, not a rulebook. The rules live in two documents, and this ledger does not override them:

- `docs/architecture/aidjobs-migration-contract.md` — the architecture contract.
- `docs/architecture/crawler-completion-plan.md` — the crawler gates (B1–B5, C1–C5) and their records.

User-experience work has two documents: `docs/architecture/ux-build-plan.md`, the authoritative step-by-step plan with status (revised 21 October 2026), and `docs/architecture/public-ux-direction.md` (W-28), the design: proposed, with the design demo's look approved on 21 October 2026. The approved demo is kept at the git tag `ux-demo-approved-2026-10-21`.

**Last verified:** 21 October 2026. `main` is `3d688ec` (merge of PR #21). Merging to `main` publishes the frontend on Vercel and redeploys the backend on Render (Verified from GitHub deployments for the frontend; the user for the backend).

Every claim below is marked **Verified** (checked against git, GitHub, CI, or a production query the user ran), **Repository** (true of the code, not checked in production), or **Not verified**.

## How to resume

1. **Current priority, set by the user on 20 October 2026: user experience.** Open `docs/architecture/ux-build-plan.md`, read its "Revision of 21 October 2026", and take the first step in its order table that is not Done and whose dependencies are met, following the working method at the top of that file. Crawler items (the "Open work" list below) resume in their order after Stage C of that plan, or when the user changes the priority. Without a UX priority, read the "Open work" list and take the lowest-numbered item that is not blocked.
2. Check the current state before acting: `git status -sb`, `git log -1 origin/main`, and `gh pr list --state open`. If `main` has moved past the commit named under "Last verified", find out why before trusting this file.
3. Follow the operating conventions below.
4. When an item is finished, update this file in the same pull request as the work, or in the next docs pull request. For a UX step, also update its status line in `ux-build-plan.md`; a UX step is Done only after its live check.

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
| Backend | Render, auto-deploys from `main`. Last confirmed deploy `9d6fd99` (PR #14); `7b13a9e` (PR #17) not yet confirmed | Verified by the user and the Render log, 19 October 2026 |
| Frontend | Vercel; Netlify builds pull-request previews | Verified from pull-request checks |
| Live sources | Three: UNICEF, ICRC, and Oxfam GB (added 19 October 2026, W-07) | Verified from production queries |
| Public search | Served by the PostgreSQL text search (`ILIKE` on title, organisation, and description). Meilisearch does not work. The search log shows `source=database total=203` | Verified by the user and the Render log |
| AI extraction | `OPENROUTER_API_KEY` is still set in Render, but every OpenRouter key was revoked on 18 October 2026. Every crawl tries AI, gets `401 User not found` within about a second, and continues without AI. The AI normaliser fails the same way | Verified from the Render log, 19 October 2026 |
| Geocoding | `nominatim.openstreetmap.org` answered every lookup with `HTTP 429` on 19 October, including the first lookup of the 19:24 UTC crawl. PR #15 pauses Nominatim for an hour after a refusal, verified live (W-21). Production lookups still get no coordinates (W-27) | Verified from the Render log |
| `AIDJOBS_ENV` | `dev` in production; startup reads `dev-only admin routes enabled` (W-22) | Verified from the Render log |
| Extraction rollout variables | `EXTRACTION_USE_NEW_EXTRACTOR=True`, `EXTRACTION_ROLLOUT_PERCENT=100`, `EXTRACTION_SHADOW_MODE=true`, `EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org`. Dormant: no current source matches (W-23) | Verified by the user from Render's Environment page |

### Live sources

| Source | Listing URL | Latest crawl | Result |
| --- | --- | --- | --- |
| UNICEF | `https://jobs.unicef.org/en-us/listing/` | 19 October 2026, 09:58 UTC | `warn`: 120 of 209 jobs, 6 pages, stopped by an AWS WAF challenge on page 7 after one retry. Earlier the same day 120 were saved (99 inserted, 20 updated), every row with a location and a deadline, no rejections, no duplicate links. Verified |
| ICRC | `https://careers.icrc.org/go/Global-Opportunities/8821501/` | 17 October 2026, 18:40 UTC | 34 found, 14 saved, 20 correctly rejected, no `thin_vacancy`. One deadline corrected to `2026-11-06` by the normal update. Verified |
| Oxfam GB | `https://jobs.oxfam.org.uk/jobs/home/` | 19 October 2026, 19:24 UTC | `ok`: 5 found, 0 inserted, 5 updated, no duplicate links; all five link to `/jobs/vacancy/…/description/`. Four locations from the job pages; one (Nepal) has none. Deadlines correct after the W-25 fix. Titles carry glued place and date (W-24). Verified |

Two UNICEF crawls failed on page 1 with `HTTP 0`, meaning no response: 18 October at 09:21 UTC (cause not read) and 19 October at 08:51 UTC, where the Render log reads `Error fetching https://jobs.unicef.org/en-us/listing/: timeout` (Verified). Each next crawl succeeded. No job changed.

### Search

- `SearchService.search_query` in `apps/backend/app/search.py` queries Meilisearch when it is configured, and always queries PostgreSQL. When Meilisearch returns nothing usable, the PostgreSQL result is served. That is why users find jobs. Repository, with the user's confirmation that search works.
- The PostgreSQL query is a plain `ILIKE` match. The schema already has a full-text column and index (`search_tsv`, GIN, with a trigger) and the `pg_trgm` extension in `infra/supabase.sql`. Search does not use them. Repository.
- The contract (§3 and §13) already requires SQL search to keep working when Meilisearch is down. No document records a decision to replace Meilisearch. The plan defers the search-architecture decision until after the crawler plan.

### How the crawler is built today

Recorded 19 October 2026 from the repository and the Render log.

There is one crawler. The scheduler and the admin Crawl button both enter `CrawlerOrchestrator` in `apps/backend/orchestrator.py`. Each source type has one crawler (HTML, RSS, API), and all three use the one `admit_batch` and the one writer, `persist_candidate`. That matches the contract.

Inside the HTML crawler, a listing page is read by the first of these that produces jobs (`SimpleCrawler._listing_jobs` and `crawl_source`, `crawler_v2/simple_crawler.py`):

1. The pipeline extractor, only when `core/rollout_config.py` selects the source. Dormant: see W-23.
2. AI extraction. Fails on every crawl while the OpenRouter key is revoked (W-14).
3. The UNICEF reader, then paging through "More Jobs". UNICEF only, chosen by the `unicef.org` host (PRs #11, #13, #14).
4. With AI off only: the plugin registry (UNDP, UNESCO, Amnesty, Save the Children, generic). It cannot be built while `unesco.py` does not compile (W-11).
5. The general rule-based reader. Every other source, including ICRC.

Job pages, for a listing of 1–50 candidates or any UNDP listing (`enrich_job_from_detail_page`): UNICEF is skipped, UNDP has its own rules, and every other site uses the detail-page reader (PRs #8, #9).

The organisation-specific exceptions (UNICEF and UNDP, chosen by web address) are the part that does not scale. The direction is platform readers chosen by what the page shows, not by organisation (W-19).

Rule, agreed 19 October 2026: do not edit a source's URL to work around one site's behaviour. Knowledge such as a platform's page size or paging belongs once in that platform's reader, and sources keep their normal listing URLs. The earlier suggestion to change the UNICEF source URL to `?page-items=50` was withdrawn for this reason.

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
| Leaked OpenRouter key revoked (W-01) | User action | 18 Oct 2026 | GitHub alert resolved as revoked; Render log shows `401 User not found` |
| Progress ledger, `AGENTS.md`, UNICEF fix recorded | PR #12, `15d6e4e` | 18 Oct 2026 | Merged |
| UNICEF "More Jobs" paging and completeness reporting | PR #13, `d7da048` | 18 Oct 2026 | Merged, deployed; live crawl read 6 pages, 120 jobs, reported partial |
| UNICEF page pacing, one retry, safe refusal diagnostics | PR #14, `9d6fd99` | 19 Oct 2026 | Merged, deployed; identified an AWS WAF challenge at the seventh request |
| Nominatim pause after refusal; failed lookups not repeated | PR #15, `bcdadd3` | 19 Oct 2026 | Merged, CI green; verified live in the 19:24 UTC Oxfam crawl log |
| Ledger: how the crawler is built today, dormant settings recorded | PR #16, `8fe99a8` | 19 Oct 2026 | Merged |
| ISO deadlines kept as written (W-25) | PR #17, `7b13a9e` | 19 Oct 2026 | Merged, CI green; verified live: the next Oxfam crawl corrected all five deadlines |

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
| C5, six sites | ICRC met; Oxfam met apart from glued titles (W-24) | DevNetJobsIndia, Global Partnership for Education, International Rescue Committee, Médecins Sans Frontières (W-08). UNICEF is live but partial (W-04) |

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
| Relevant tests pass, and the fetch policy is checked on the deployed backend | Tests pass (CI on `7b13a9e`). The deployed check is not done |

## Open work

Each item needs its own approval. Agreed order on 18 October 2026: W-01, then the documentation pull request (W-03), then W-04, W-05, W-06, and W-07. W-02 is an inspection only: no job is hidden or retired until the W-06 rule is agreed and validated.

Status on 20 October 2026: W-01, W-03, W-21, and W-25 are done. Oxfam is live (W-07) and the W-25 fix is verified on it. Next: the Clinch platform-reader plan that finishes W-04 (plan first, then approval). Then W-05 and W-06.

Priority changed on 20 October 2026, by the user: user experience first, then back to the crawler. The read-only review (W-26) is done. The steps are in `ux-build-plan.md`. By the user's order, the first is UX-00, a clickable design demo on a branch that is never merged; then UX-01, PR #19, which fixes two live public bugs and is not merged. The direction (W-28) waits for approval at UX-08. The crawler items keep their order and resume after Stage C of the UX plan; scheduled crawls continue meanwhile. UNICEF still shows about 120 of 209 jobs (W-04); a better interface does not change coverage.

Status on 21 October 2026: the design demo (UX-00) is approved by the user and kept at the tag `ux-demo-approved-2026-10-21`; its decisions are in `public-ux-direction.md`. The UX plan is revised: the demo is not merged; the new public site is built beside the current one and switched in one step (UX-29); public fixes to the current site are dropped, so PR #19 is closed without merging; admin fixes UX-04 to UX-07 run alongside the launch decisions (UX-08); the admin redesign follows the public launch. The domain `aidjobs.app` has expired (W-29). Whether W-06 moves ahead of the other crawler items is a UX-08 decision.

### Now

**W-01. Revoke the leaked OpenRouter key.** Done 18 October 2026. The user deleted every OpenRouter key and closed the GitHub alert; GitHub shows it resolved as revoked, with no open secret-scanning alerts (Verified). Whether the activity log showed unrecognised use was not reported. Render may still hold the old, now invalid, key; AI calls fail into the same fallback as before. A new key is a W-14 decision.
Background: an OpenRouter API key was committed to this repository on 21 November 2025. The repository is public, so anyone on the internet could read it in the git history. Deleting the line from a file does not remove a key from git history; revoking it does. Any future key goes only into Render's environment, never into a file.

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

**W-04. Read every page of the UNICEF listing.** In progress. Pagination merged as PR #13 (`d7da048`) and the pacing change as PR #14 (`9d6fd99`). Next: the Clinch platform-reader plan (see the end of this item). The source URL is not edited.
The UNICEF listing shows 20 jobs per page, and the crawler read only the first page. Evidence, 18 October 2026:
- The saved December 2025 page has a "More Jobs 160" link to `/en-us/listing/?page=2&page-items=20`. The number is the jobs remaining after that page.
- One approved request for page 2 (18:33 UTC) returned HTTP 200 with the same job cards: 20 distinct jobs, all with a location and a deadline, all admitted. Its link reads "More Jobs 177" and points to `page=3`, so the live listing held about 217 jobs in about 11 pages. Page 2 also links to a job-alert signup, `/en-us/Listing/?page=2&page-items=20&subscribe=true`, which must not be followed.
- One approved request for the RSS feed over HTTPS, `https://careers.pageuppeople.com/671/cw/en/rss`, failed to connect. Plain HTTP was not tried. RSS was not adopted.

The change: after page 1, the crawler follows the "More Jobs" link only when it stays on the listing host and path and asks for a later page. It fetches each page through `fetch_html`, one second apart, reads job cards, keeps the first row per link, and stops on no link, a non-200 page, a page with no new jobs, or 30 pages. All pages form one admission batch. A failed later page keeps the jobs already read.

Completeness is reported on the crawl itself. The expected total is read from the live first page (its jobs plus its "More Jobs" count). Only a walk that ran out of "More Jobs" links is complete: the crawl status stays `ok` and the message reads, for example, `Found 217 jobs; listing complete: 11 pages, expected 217`. A failed page, the 30-page cap, or a page with no new jobs is partial: the status is `warn`, which still resets the failure count, and the message names the pages read, the expected total, and the stop reason. The same facts are written to `extraction_logs` as `listing_pages`, `listing_expected`, `listing_complete`, and `listing_stop`, so W-06 can tell a trustworthy crawl from a partial one. Other sources keep today's message. With AI off, UNICEF takes the same path instead of the broken registry, so removing the OpenRouter key would not stop UNICEF ingestion.

First live crawl after PR #13, 19 October 2026 at 06:23 UTC (Verified): status `warn`, `Found 120 jobs; listing partial: 6 pages, expected 199, stopped: HTTP 202 on …?page=7&page-items=20`. 99 inserted, 20 updated, no rejections at all, no duplicate links (only the known `596188`). One 12 October row and 19 rows from 18 October were updated; every updated and inserted row has a location and a deadline. `extraction_logs` recorded `listing_pages` 6, `listing_expected` 199, `listing_complete` false, and the stop reason. About 79 jobs on pages 7 onward were not read. The 202 body was not saved. ReliefWeb's saved 202 was an AWS WAF challenge, so a bot challenge after six requests one second apart is likely but not verified.

Pacing change, a bounded experiment: listing pages are requested 5 seconds apart. A 202, 429, or 503 is retried once after 30 seconds, and at most one retry is allowed in a whole crawl. If the retry fails, the walk stops and the crawl is partial. Later pages use one request each through `fetch_url` with the same headers as `fetch_html`; the 403 user-agent switch in `fetch_html` is not applied to them. A non-200 later page logs its status, only the allowlisted response headers (`content-type`, `content-length`, `server`, `retry-after`, `cache-control`, `x-amzn-waf-action`, `x-amzn-requestid`, `cf-ray`, `cf-mitigated`, `x-cache`, `via`), and the first 300 characters of the body with whitespace collapsed and token-like strings redacted. Cookies and authorization are never logged.

Results after PR #14, 19 October 2026 (Verified):
- 08:51 UTC: page 1 timed out after 30 seconds (`Error fetching https://jobs.unicef.org/en-us/listing/: timeout`). No job changed.
- 09:58 UTC: `Found 120 jobs; listing partial: 6 pages, expected 209, stopped: HTTP 202 on …?page=7&page-items=20 after one retry`. Both page-7 responses were `server: CloudFront`, `x-amzn-waf-action: challenge`, with an AWS WAF JavaScript challenge naming `clinchtalent.com` and `career-pages.com`. The UNICEF listing is hosted by Clinch; PageUp handles applications. Pacing did not help: the challenge starts at the seventh request from one address with 1-second and with 5-second gaps. The challenge must not be solved or bypassed.
- Two approved test requests from a local address with no prior requests that day, 10:21 UTC: page 7 requested first returned HTTP 200 with 20 admitted jobs and "More Jobs 69", so page 7 itself is not blocked. Page 1 with `page-items=50` returned HTTP 200 with 50 jobs, all with a location and a deadline, all admitted, and "More Jobs 159"; its link keeps `page-items=50`. Both agree with 209 jobs.

Withdrawn 19 October 2026: changing the UNICEF source URL to `?page-items=50` in the admin. Per-site URL edits do not scale (see "How the crawler is built today"). Do not make that edit.

Next step, plan first: turn the UNICEF reader into a Clinch platform reader. It is chosen by the Clinch page structure (`div.list-view--item` cards with one `a.job-link`) instead of the `unicef.org` host, and it requests `page-items=50` itself, so the whole 209-job listing is 5 requests, below the seventh request where the challenge starts. The source keeps `https://jobs.unicef.org/en-us/listing/`. The plan must cover detection, the page-size request, the existing paging and completeness rules, ICRC and other sources unchanged, and tests. No code until the plan is approved. Then one manual crawl, after a quiet period. If it is complete, check: found close to the expected total, October rows still listed updated, no `thin_vacancy`, no duplicate links, and ICRC unchanged. If it is still partial, stop; a multi-crawl approach needs its own approval. The contract treats a crawl that missed pages as partial (§5), so this lands before any expiry rule.

**W-05. B4 failure and lifecycle audit.** Read-only.
Mark each B4 rule verified or defective. Production evidence already collected:
- The failed UNICEF crawl (`HTTP 0`, 18 October) changed no jobs (Verified). Per the code it added one to `consecutive_failures`; the stored value was not read (Repository).
- "NC" in the admin is `consecutive_nochange`: crawls in a row that inserted and updated nothing. Three or more makes the scheduler crawl less often. The broken UNICEF crawls raised it to 3; the 09:30 crawl reset it.
- Rows hidden on 8 October have stayed hidden.
- The Render log of 19 October ends with `Shutting down … Scheduler stopping` without a deploy of ours. If the service sleeps when idle, scheduled crawls do not run while it sleeps. The cause was not checked (Not verified).

**W-06. Expiry policy decision.** Decision, after W-04.
Closed jobs with no deadline never leave search. The contract (§6) forbids expiring a job because a crawl did not return it until a written trust policy and a consecutive-missing threshold are approved as their own decision, separate from any implementation pull request. Draft that policy for approval: what counts as a complete, trustworthy crawl, and how many such crawls a job may be missing before it expires. This solves stale rows for every source.

Agreed rule (18 October 2026): absence from a listing counts as evidence only after a crawl whose `extraction_logs.extracted_fields.listing_complete` is true. The crawl status (`ok`, `warn`, `failed`) and the failure counter must not be used for that decision: `warn` resets the failure counter but marks a partial listing. Sources without a paged-listing report need their own completeness rule before they can expire anything. Today no code expires, hides, or changes a job's status after a crawl (Repository).

**W-07. Oxfam GB as a live source.** C5.
Listing `https://jobs.oxfam.org.uk/jobs/home/`. Its three saved job pages gave all three fields offline. Approved on 19 October 2026: add it as an HTML source and check one crawl the way ICRC was checked. Creating a source sets its next run to now (`POST /api/admin/sources`), so the scheduler crawls it within about five minutes; that automatic crawl is the single test, and Crawl is not pressed. Check: crawl status and counts, saved titles, locations, and deadlines, rejection reasons, links to real vacancies, and no duplicates.

Result, 19 October 2026 at 10:08 UTC (Verified): `ok`, 5 found, 5 inserted, no rejections, no duplicates, every link an individual vacancy. Locations came from the job pages' structured data, for example `Renk County, Uppernile State, South Sudan`; the Nepal role has no location on its page and was admitted on its deadline. Two defects: every deadline was stored wrong (W-25), and titles carry the card's place and date run together (W-24). The 19:24 UTC crawl after the W-25 fix corrected all five deadlines by update (Verified). Oxfam meets the C5 check apart from the glued titles, which stay open as W-24.

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

**W-14. Decide the OpenRouter setup.** Every OpenRouter key was revoked on 18 October 2026 (W-01), so every crawl spends time on a failed AI call. Either create a new key with credits, stored only in Render, or remove `OPENROUTER_API_KEY` from Render. Removing it sends every HTML source except UNICEF down the plugin path, which needs W-11 first and changes the verified ICRC path. Once W-04 is merged, UNICEF takes its own reader with AI off.

**W-15. Issue #5, parked.** HTML can report `ok` when every row failed to save. "Failed persistence can still advance next_run_at."

**W-16. Issue #4, parked.** Test-suite cleanup, including the JSON-LD circular import that stops `tests/test_pipeline_extractor.py` and `tests/test_pipeline_integration.py` from being collected.

**W-21. Geocoding refused by Nominatim.** Done. Fix merged as PR #15 (`bcdadd3`), 19 October 2026. Verified in the Render log of the 19:24 UTC Oxfam crawl, from the lines the user pasted: the first lookup, `London, London, United Kingdom`, returned `HTTP 429 Too many requests`, then `Nominatim refused geocoding (HTTP 429); pausing Nominatim lookups for 3600s`, and no further Nominatim request in that crawl. This closes the repeated-request failure only. Geocoding itself still does not work in production (W-27).
The 19 October UNICEF crawl spent about 4.5 minutes on location lookups, and every one returned `HTTP 429 Too many requests` from `nominatim.openstreetmap.org` (Verified from the Render log). The geocoder treated a 429 like any failure and remembered only successes, so it asked about the same country many times. Nominatim's usage policy expects clients to stop when refused; continued requests risk a lasting ban. The fix: a 429 or 403 pauses Nominatim lookups for an hour, or longer if `Retry-After` says so; a lookup that was attempted and failed is not repeated for an hour. Jobs are still saved without coordinates. The geocoder calls the network through `httpx` directly, not through `fetch_url`; the host is fixed, so the risk is low, but it is a gap against contract §9 (Repository).

**W-27. Production geocoding is ineffective.** Record; not scheduled. Added 20 October 2026.
Nominatim answered the first lookup of the 19:24 UTC Oxfam crawl with `HTTP 429`, after a whole day of 429s on 19 October (W-21), so production lookups currently get no coordinates (Verified from the Render log). The geocoder already sends `User-Agent: AidJobs/1.0 (contact@aidjobs.app)` (Repository). A possible cause is that Render's shared outgoing addresses are rate-limited or blocked by Nominatim; that is a hypothesis, not verified.
User impact: job locations are still saved and shown as text from the job pages. Coordinates are missing. In the frontend they only drive the "Mapped" badge in the job panel (`JobInspector.tsx`, used on the home, saved, and collection pages) and the "geocoded" flag of the data-quality badge; no map or distance search was found in the frontend (Repository).
Options for later evaluation, none approved: a geocoding provider used with an API key, built-in resolution of country names without a network call, or accepting missing coordinates.

**W-25. ISO deadlines misread as day-first.** Done. Fix merged as PR #17 (`7b13a9e`), 19 October 2026. One manual Oxfam crawl, authorised by the user, at 19:24 UTC on 19 October (Verified): `ok`, 5 found, 0 inserted, 5 updated, 0 skipped, no duplicate links. All five deadlines now match the dates shown on the listing: `2026-11-13`, `2026-10-29`, `2026-10-28`, `2026-10-31`, `2026-10-28`. The Nepal job, previously stored as 2013 and so treated as closed, now has a future deadline and should show in search again (not checked in the site).
PR #9 sends every deadline the detail-page reader fills through `_parse_deadline`, which calls `dateparser` with `DATE_ORDER: DMY`. For an ISO date that reads the parts in the wrong order: `2026-10-29` became `2029-10-26` and `2026-11-13` became `2013-11-26` (Verified on the five Oxfam rows and reproduced locally). The Oxfam job with a 2013 deadline is hidden from search as closed; the other four would stay visible after closing. ICRC (`06/11/2026`) and UNICEF (its own parser) were not affected; the save step already keeps ISO dates. The PR #9 review missed this because its tests used only `06/11/2026`. The fix returns a valid `YYYY-MM-DD` date, or the date part of an ISO datetime as written, before `dateparser` runs, and rejects an impossible one such as `2026-02-30`. No manual database edit: the next normal Oxfam crawl after the deploy should correct the five deadlines through the update path, and that must be verified with a query.

**W-24. Oxfam titles carry the listing card's place and date.** Record; not scheduled.
Saved titles read, for example, `Finance OfficerSouth Sudan - Renk29 October 2026` (Verified). The listing reader takes the whole card text as the title. The title is part of job identity, so cleaning it would create new rows for existing jobs. Handle with an Oxfam platform reader (W-19) or a decision on title changes, not as a quick edit.

**W-23. Dormant extraction rollout settings.** Record; not scheduled.
Render sets `EXTRACTION_USE_NEW_EXTRACTOR=True`, `EXTRACTION_ROLLOUT_PERCENT=100`, `EXTRACTION_SHADOW_MODE=true`, and `EXTRACTION_DOMAIN_ALLOWLIST=unicef.org,undp.org,unesco.org` (Verified by the user, 19 October 2026). `core/rollout_config.py` compares the source host with the list exactly after removing `www.`, so `jobs.unicef.org`, `careers.icrc.org`, `jobs.undp.org`, and `careers.unesco.org` do not match, and the pipeline extractor never runs for current sources. The UNICEF crawl log shows no "Using NEW pipeline extractor" line. A source whose host is exactly one of the three, such as `https://www.unicef.org/careers`, would go through it; it carries the Issue #4 import problem and falls back to the normal reader on failure. `EXTRACTION_SHADOW_MODE` is read by `pipeline/db_insert.py`, but the crawler passes `enable_storage=False` to the pipeline extractor, and `tests/test_gate4_persist.py` and `tests/test_gate10_legacy.py` check that no `jobs_side` write is possible (Repository). Cleanup, as its own decision: set `EXTRACTION_USE_NEW_EXTRACTOR=false` or remove these variables in Render, then remove the dormant code once confirmed unused.

**W-22. Production runs with `AIDJOBS_ENV=dev`.** Record; not scheduled.
The Render startup log reads `AIDJOBS_ENV=dev (dev-only admin routes enabled)` (Verified, 19 October 2026). The two named login bypasses were removed in PR #2, so admin login is still required. Which development-only routes are enabled, and whether Render should use a production value, need their own review.

### Search

**W-17. Clearing a search shows no jobs.** Record only; not scheduled.
After a search, clearing the search box shows no jobs until the filters are also cleared. A likely cause, not verified: the clear button in `apps/frontend/components/TrinitySearchBar.tsx` calls `onSearch(parsedFilters, '')` with the filters from before the reset, because the state update has not applied yet. `HomeClient.tsx` then rebuilds the query from those old filters.

**W-18. Track A and the search-architecture decision.** After the crawler plan.
Track A explains why Meilisearch fails. Evidence, 19 October 2026: at startup and on reconnection the backend logs `Failed to create index: Expecting value: line 1 column 1 (char 0)`, so the configured Meilisearch address answers with an empty or non-JSON body. That points to configuration or hosting rather than code (Verified log line; cause not verified). The decision afterwards is whether to repair Meilisearch or to use PostgreSQL full-text search with the existing `search_tsv` index. Either option must keep PostgreSQL authoritative and pass the two Gate 7 tests in the contract (§13).

### User experience

**W-26. User-experience review.** Done 20 October 2026, read-only, on `www.aidjobs.app` at `2a2e02f`, at 1366px and 390px, public pages and, after the user logged in, admin pages. No production data changed: admin pages were read with a browser guard that blocked every non-read request.
No planning document covered the user experience. The contract (§2) puts new public search features out of scope for the migration, and Gate 2 asks only that the frontend test command really runs. So the public site and the admin have never been reviewed against a written standard. The repository-root `DASHBOARD_FUNCTIONALITY_CHECK.md` calls the admin "complete and polished"; it is not part of the contract or this ledger and is not evidence.

What exists (Repository): the public home and search page (`apps/frontend/app/page.tsx`, `HomeClient.tsx`, `TrinitySearchBar.tsx`), collections (`app/collections/[slug]`), saved jobs (`app/saved`, `SavedJobsPanel.tsx`), and the admin pages (dashboard, sources, a source's detail page, crawl, jobs, organisations, data quality, setup, login).

Crawler defects that users see today, tracked in their own items:
- Wrong or missing deadlines decide whether a job is shown: W-25, W-12, W-13.
- Closed jobs with no deadline stay in search indefinitely: W-02, W-06.
- Titles with place and date glued on: W-24.
- UNICEF shows about 120 of about 209 jobs: W-04.
- Clearing a search shows no jobs: W-17.
- Search is a plain `ILIKE` match, not ranked full-text search: W-18.

Public findings (Verified in the browser unless marked):
- At 1366px the page was 1919px wide: every save button and Sort sat off-screen. Cause: the results column in `HomeClient.tsx` could not shrink. Fixed in PR #19, verified on its preview, not merged.
- The Saved page showed an empty card: it stored the `/api/jobs/{id}` envelope as the job. Fixed in PR #19, verified on its preview. The sidebar count stays stale after removing a job until reload; not fixed.
- On a phone the menu opens over about two-thirds of the screen and the first job is about 1,300px down.
- Clearing a search shows no jobs (W-17). Confirmed cause: the cleared search sends the filters Trinity inferred, joined into the text, for example `Water, Sanitation & Hygiene (WASH) Program & Field Implementation Officer / Associate (2–5 yrs) WASH officer`. The address keeps `?q=`.
- UN Jobs, Remote Jobs, Consultancies, and Fellowships return 0 jobs and show "Loading jobs..." forever, because organisation type, work modality, and career type are never filled; Surge & Emergency shows all 206 because its filter is ignored. Level reads "No data".
- The page background computes to yellow `rgb(255, 255, 0)` and headings to brown; visible on the admin login. The UX plan records this as U3.
- First load took about 20 seconds per request, reloads about 0.6 seconds; likely the backend waking on Render (Not verified).
- The job panel has no description, shows country as a code, and shows "International eligible: No" for every job (likely unfilled, Not verified). "Apply Now" opens the employer's page correctly.
- Every visitor sees "Running on backup search (temporarily)".
- Smaller: deadlines in US format, the search clear button has no accessible name, country counts do not follow the search, one search sends four requests, the admin login greets new visitors with "Your session was not accepted".
- The HTML sent to crawlers contains no jobs, the title is only "AidJobs", there is no structured data, and `robots.txt`, `sitemap.xml`, and the favicon return 404 (Verified with direct requests).

Admin findings (Verified in the browser unless marked):
- Delete Jobs and Delete Source are 32px icons styled like Run crawl, stacked under Edit. The code has a confirmation with an impact summary (Repository; not opened).
- Job totals disagree without labels: 234 on the dashboard, 218 on Jobs and Data Quality, 206 public.
- Data Quality flags all 218 jobs as listing pages: the check in `app/data_quality.py` matches `/jobs`, `/careers`, and `/list` anywhere in the link, including host names such as `jobs.unicef.org`, and takes up to 25 points off the score (Repository).
- The dashboard reports no recent activity while Crawls lists crawls; Settings reports AI as configured with a revoked key and Meilisearch as not configured; the Search card says "Check console for details".
- The Sources table stacks nine icon actions, about 337px per row.
- "Cleanup expired jobs" does nothing: the backend returns `disabled` (Repository).
- Source detail shows raw timestamps; every source has an empty organisation type, likely why UN Jobs is empty (Not verified).
- At 390px the sidebar leaves 134px for content.

Fixes are separate steps. Every finding above has a step in `ux-build-plan.md` (UX-01 to UX-07 for fixes on the current site; the rest in the redesign stages). The direction for both is W-28; new public search features need the scope change it records (§2). On 21 October 2026 the public fixes (UX-01 to UX-03 and the public parts of UX-07) were dropped, because the switch to the new site (UX-29) deletes that code; PR #19 is closed without merging.

**W-28. Public site and admin direction.** Proposed, not approved. Added 20 October 2026.
`docs/architecture/public-ux-direction.md`: phone-first public site with one search bar on real data, dense list with days left, a job sheet now and job pages later, saving without accounts, removal of collections, Trinity, and empty filters, the search-engine and AI-search foundation, the admin pages, and the crawler data the design needs. It records the product reason that rule 15 requires and the scope changes to §2. Decisions taken: the user provides the logo; accent colour ink; signature tint sage; no header and a collapsible side menu on the public site and the admin; a design demo first (UX-00); fix two live bugs (PR #19). Visual reference: three dashboard designs the user supplied (Crewix, Crextio, BizLink), adapted. The admin menu proposal was revised to keep the contract's admin V1 navigation. It replaces most of the paused branch `ux/public-layout`, which is kept for reference and not merged. On 21 October 2026 the user approved the design demo's look and behaviour; they are recorded in the direction under "Approved in the design demo". The direction as a whole and the §2 scope changes are still decided at UX-08.

**W-29. The domain `aidjobs.app` has expired.** Record. Added 21 October 2026.
The user reported on 20 October 2026 that the domain was not renewed; `www.aidjobs.app` does not resolve. Production still deploys to Vercel on each merge. Until a domain is connected, live checks use the Vercel production address, and the new site tells search engines not to index it. Registrars release expired names after their grace and redemption periods, so renewing late may cost more or fail. Decision at UX-08.

### Scaling to hundreds of sites

**W-19. Platform readers.** Proposal, not approved. Stays a proposal until each platform is verified against the real source systems.
Many organisations publish jobs through the same few recruitment systems. One reader per system can cover many sites, where one reader per site cannot scale. Evidence so far: the UNICEF listing is hosted by Clinch (`clinchtalent.com`, `career-pages.com`, from its AWS WAF challenge page) and links to "Powered by PageUp" for applications (observed). Offline, a saved December 2025 UNDP listing links to Oracle Cloud (`estm.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/…/job/{id}`); the general reader admits 94 rows whose location is the table heading "Job Title", so UNDP must not be added until it has a working reader. A saved UNESCO listing uses SuccessFactors-style `/go/…` paths like ICRC; its 25 job links are rejected as `thin_vacancy` because the listing has 52 candidates, above the 50-job detail limit (W-09). ICRC's `/go/…` and `/job/…/{id}` paths and SAP session cookies point to SAP SuccessFactors (likely, not verified). The plan for this would:

Platform readers are chosen by what the page shows, for example Clinch job cards, SuccessFactors `/go/…/job/{id}` links, Oracle `CandidateExperience` links, or Workday `myworkdayjobs.com`, never by organisation name or by editing source URLs. Sites on no known platform use the general reader. The first is Clinch (UNICEF), which also finishes W-04; SuccessFactors (ICRC, UNESCO) and Oracle (UNDP) follow. As platform readers replace them, the UNICEF and UNDP address checks and the dormant routes (W-11, W-23) are removed, each once it is confirmed unused.

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
| Whether to set up AI again with a new key, or remove the setting from Render | W-14 |
| Whether to hide the December 2025 UNICEF rows, after inspection and the W-06 rule | W-02 |
| Approve the Clinch platform-reader plan, then its implementation | W-04, W-19 |
| The expiry trust policy and missing-crawl threshold | W-06 |
| Add ICRC's other lists | W-20 |
| Whether to switch off or remove the dormant extraction rollout settings in Render | W-23 |
| Whether Render should run with a production `AIDJOBS_ENV` | W-22 |
| Which platform readers follow Clinch (SuccessFactors, Oracle) | W-19 |
| How to get coordinates in production, or whether to go without | W-27 |
| Close PR #19 without merging | UX-01 (dropped) |
| Approve the public site and admin direction, and the scope changes to §2, including Sector with SDGs, multi-choice and title-fact filters, and the Recommended order | UX-08, W-28 |
| Renew `aidjobs.app` or choose another domain | UX-08, W-29 |
| Filter on the server or in the browser, after measurements | UX-08 |
| Where title facts are read: stored at save time, or read when a job is returned | UX-08, UX-22 |
| Whether W-06 moves ahead of the other crawler items, before launch | UX-08, W-06 |
| Which branches and worktrees to delete | UX-31 |
| Provide the logo; set a launch date | UX-08 |
| How to stop the slow first load on Render (hosting), after an assessment | UX-08 |
| Which AI crawlers may read the site, after an assessment | UX-08 |
| Agree the revised admin menu, which keeps the contract's admin V1 navigation | UX-19 |
| Facts read from titles, which is enrichment expansion under §2 (brought forward to UX-08) | UX-22 |

## Terms used in this project

- **`thin_vacancy`**: a link that looks like a job but carries no location, deadline, or contract type. Rejected.
- **`no_qualifying_family`**: an ordinary page link with nothing that marks it as a vacancy. Rejected.
- **`root_careers_page`**, **`social_profile`**, **`vendor_badge`**: a careers home page, a social media link, or a "powered by" badge. Rejected.
- **NC**: `consecutive_nochange` in the admin, the number of crawls in a row that saved nothing.
- **`HTTP 0`**: the crawler received no response at all, for example a timeout, connection error, or a request blocked by the fetch policy.
- **Suppressed, or hidden**: `deleted_at` is set by an admin. A recrawl never clears it.
- **Expired**: a lifecycle state the contract allows only after the W-06 policy is approved. Not used today.
