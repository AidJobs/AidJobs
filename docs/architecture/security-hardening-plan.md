# AidJobs — Security hardening plan

**Status:** approved in principle by the user on 26 October 2026, including the order below. This is approval of the direction only. Each stage needs its own defined scope, reviewable changes, tests, and the user's explicit approval at every step (plan, implement, merge). Nothing here approves a database change, a credential change, a production setting change, or a crawl.

**Priority:** set by the user on 26 October 2026. This plan runs before UX-11. The employer survey (ledger W-31) follows the security stages as stage 8, placed there by the user the same day; UX-11 resumes as stage 9, with a plan for the user's approval.

Every claim is marked as in the ledger: **Verified** (checked against git, GitHub, CI, the code, or a read-only production request), **Repository** (true of the code, not checked in production), or **Not verified**.

## Why this plan exists

On 26 October 2026, during the UX-31 follow-up, three things showed that point fixes were not enough:

- The agent printed the database connection string, password included, into the chat (incident record below). The rule "never print a secret" was a written convention only.
- The public `GET /api/db/status` returned the database driver's raw error to anyone during the password rotation: the database host, IP address, port, and Supabase's error text (Verified). The same pattern exists across the backend.
- A crawl cut off by a backend restart left its source locked with nothing to release the lock (UNDP, below). Every merge to `main` restarts the backend.

## Findings, 26 October 2026 (read-only)

- **Public routes on `main` (Verified, from the registered routes and production requests):** 18 routes need no credentials. 12 are intended: health, capabilities, database status, search status, search query, facets, autocomplete, parse, single job, admin login, logout, and session. 6 are not:
  - `GET /api/shortlist` and `POST /api/shortlist/{job_id}` take `user_id` from the request, so any caller could read or change any user's saved jobs; the backend connects as `postgres`, which bypasses Row-Level Security. Live on the backend's own address (a GET without `user_id` answered 200); Vercel does not forward it. The contract defers the server shortlist.
  - `/docs`, `/docs/oauth2-redirect`, `/redoc`, and `/openapi.json` are served in production; the schema listed 68 paths, 54 of them admin, with their parameters.
- **Protected routes (Verified, test environment):** 66 behind the admin session and 2 behind the internal API key. Three of the admin routes (`app/data_quality_logs.py`) mount only in tests; in production their import fails.
- **Raw error text in responses (Repository, a pattern search):** about 66 places in application code put exception text into a response (`str(e)` or `{e}` in `detail`, `error`, or `message`): `crawler_admin.py` 21, `job_management.py` 16, `sources.py` 15, `data_quality_logs.py` 3, `presets.py`, `search.py`, `main.py`, `shortlist.py`, `pipeline_api.py` 2 each, others 1 each. The counts must be verified and classified (public, admin, internal; real leak or false positive) before conversion.
- **Logging (Repository):** one `logging.basicConfig` in `main.py`, with no redaction; any `logger.error(f"... {e}")` writes raw text to Render's log.
- **Frontend proxies (Repository):** 33 Next.js route files under `apps/frontend/app/api/` pass the backend's error text through or return the Node error message; 4 are public (`db/status`, `search/status`, `search/parse`, `search/autocomplete`).
- **Health (Repository):** `/api/healthz` does not check the database, and `/api/db/status` answers HTTP 200 with `ok: false` when the database is down. Render's health-check path has not been checked.
- **Crawl locks (Repository and Verified):** a crawl takes a row in `crawl_locks` and releases it only when it finishes; nothing expires a lock, and only permanently deleting a source removes one. While a lock is held, the scheduler skips the source as "already locked". A restart or Render's sleep during a crawl therefore stops that source from being crawled again, silently.
- **Database role (Repository):** the backend, and the agent's read-only investigations through the local `.env`, connect as `postgres`.

## Order of work

| # | Stage | State |
| --- | --- | --- |
| 0 | Supabase log review for the exposure window | Done, 26 October 2026: no unexplained activity found, with limits (below) |
| 1 | Close the public surface | Done, 26 October 2026: [PR #51](https://github.com/AidJobs/AidJobs/pull/51), merged as `c207066`, verified in production (below) |
| 2 | Crawl-lock recovery | Next: investigation plan for the user's approval; new evidence below |
| 3 | Backend error handling and logging | Design first, for approval |
| 4 | Frontend proxy error handling | After stage 3 |
| 5 | Tooling guard against printing secrets | Proposal first |
| 6 | Least-privilege database roles | Plan only, after stages 3 and 4 are reviewed |
| 7 | Two design decisions: readiness check, public database status | Each its own decision |
| 8 | Employer survey (ledger W-31) | After stages 0 to 7; read-only; each step for the user's approval |
| 9 | Resume UX-11 | Plan first, for the user's approval |

The documentation is updated after each stage is merged and verified live. It records what was done; it is not a substitute for the control itself.

### Stage 0. Supabase log review

The user reviews Supabase's database logs for unfamiliar connections between about 14:15 and 14:45 IST on 26 October 2026 (08:45–09:15 UTC). Limits: an unfamiliar connection is not necessarily malicious, a familiar one is not proof of authorisation, the absence of entries does not prove the credential was unused, and the free plan keeps logs briefly. The agent does not access database settings or credentials for this stage, and no secret is pasted into the chat.

**Outcome, 26 October 2026.** Three sources were reviewed. The agent read them only; nothing in Supabase, Render, or the database was changed.

1. **Postgres and dashboard logs** (exported by the user, 63 entries, 25 October 22:27 to 26 October 18:38 IST): in the window, only routine checkpoints, the scheduler's refused retries of the locked UNDP crawl (`duplicate key value violates unique constraint "crawl_locks_pkey"` at 14:18, 14:23, 14:28, and 14:33), and dashboard calls at 14:37 to 14:40 that match the user's password reset (Verified). These logs record no connections or logins; known connections that afternoon do not appear in them.
2. **Pooler (Supavisor) logs**, read by the agent in the Supabase dashboard at the user's request, 268 entries between 14:15 and 14:45 IST (Verified):
   - Successful logins until 14:36:05; then 13 "password authentication failed for user postgres" between 14:38:27 and 14:39:39; the circuit breaker opened at 14:38:39 for `74.220.52.251`, inside Render's published outbound ranges for this service (`74.220.52.0/24`, `74.220.60.0/24`, read from the Render dashboard), that is, the old Render instance still using the old password; logins succeeded again from 14:41.
   - Successful logins between the exposure (about 14:18) and the reset match known activity by time and pattern: the scheduler's retries (14:18:26, 14:23:26, 14:28:26, 14:33:26, matching the Postgres log to the second), the agent's two read-only checks (14:20:44, 14:22:12, matching the database's own clock), and bursts consistent with the backend serving page and admin requests (14:20:27 to 14:20:39, 14:24:57 to 14:25:55, 14:34:36 to 14:36:05, the last while the user deleted the two sources).
   - **Limit:** the connecting address of each successful login could not be read (the dashboard's detail panel did not open in the agent's browser), so these logins are matched by timing and pattern, not each proven to come from Render or the user's machine.
3. **A read-only check of the database itself** (read-only enforced and confirmed): 15 roles, all standard Supabase roles and `postgres`; no privilege for `anon` or `authenticated` on any public table and Row-Level Security on all 38; only the expected functions, triggers (`jobs_tsv_trigger` and Supabase's own), 6 standard event triggers, and 7 standard extensions (no `pg_cron`, `pg_net`, or `dblink`); no Auth users, sessions, storage objects, vault secrets, app users, payments, or shortlists; 371 jobs, 274 open, 3 sources, as known; no row in any public table created or updated between 14:15 and 14:45; `pg_stat_statements` (cumulative since October 2025, no timestamps) shows no statement from an unknown role and no unusual statement type (statements mentioning a password were counted, 3, never printed). Data a reader could have taken: job and source records, which are mostly public, and 2 "Find & Earn" submissions (contents not read).

**Conclusion:** no sign that the exposed password was misused and no sign that anything was changed or planted. This is strong evidence, not proof: a timing match is not an address match, and reading data leaves no trace in these logs. Any later suspicious finding is handled at once, ahead of the stage order.

### Stage 1. Close the public surface

- Unmount the server shortlist router. `app/shortlist.py` and the `shortlists` table stay unchanged; a server shortlist returns only with authentication and the user identity taken from the session.
- Serve `/docs`, `/redoc`, and `/openapi.json` only when `AIDJOBS_ENV=dev`.
- A test of the real public surface: the routes a freshly built production app exposes without credentials must equal a reviewed list; every protected route must refuse a caller without credentials; the shortlist is absent; the docs follow `AIDJOBS_ENV`.
- **Done when:** merged with the user's approval; production answers 404 for the docs and the shortlist on the backend's own address; health, database status, search, `/v2`, and the admin login still work.

**Done, 26 October 2026.**

- Before merge: Render's Health Check Path is `/api/healthz` (Verified, Render dashboard), so turning off the docs could not fail a deploy. Reviews: the author's review (the internal-key comparison was not exercised in CI; a brittle route count) and an independent review by a separate read-only agent (routes without methods, HEAD-only and low-priority routes escaped the route walker; the refusal checks were not isolated from a local `.env`; name-based guard matching; an order-dependent guard choice; a weak invalid-session check). All were fixed in `a174364`. The automatic Codex review on GitHub examined only the first commit, `bd4264d`, not `a174364`.
- The test (`tests/test_public_surface.py`) runs every check in a fresh process built as production builds it, with `.env` loading off and an unreachable database address. Deliberate-failure checks in temporary worktrees: against `main` it named exactly the two shortlist routes and four doc routes as unreviewed; with four planted routes (a mounted sub-app, a websocket route, a HEAD-only route, a route guarded by an impostor named `admin_required`) it named all four.
- Merged with the user's approval, locked to `a174364`, as `c20706654581ea58d65477d89e1bab56861a6e4d` (22:33 IST). CI passed on `main`; Vercel production deployed `c207066`; Render: "Deploy live for c207066" at 22:34 IST via Auto-Deploy (Verified, Render events; no setting touched).
- Production, read-only (Verified): `/docs`, `/docs/oauth2-redirect`, `/redoc`, `/openapi.json`, `GET /api/shortlist`, and `POST /api/shortlist/{job_id}` answer 404 on the backend's own address; `/api/healthz` answers 200 directly (44 s, the backend waking) and through Vercel; the database status is ok (404 jobs, 307 open, 3 sources); search, `/v2`, and the admin login answer 200; the admin session check answers normally and a protected admin route answers 401 without a session.
- Crawl locks after the deploy (read-only): none held, no run marked running. UNICEF's crawl that started at 22:20 IST had finished (82 s, `warn`, the known W-04 listing limit) before the deploy.

### Stage 2. Crawl-lock recovery

Plan, then implementation, as a separate crawler-reliability pull request. Required:

1. Locks that expire unless the running crawl keeps renewing them.
2. Recovery of runs abandoned by a restart: detect them, mark them, and release their locks safely.
3. Marking interrupted work during shutdown where possible, never as the only recovery.
4. A worker that has lost its lock (expired or taken over) must not go on acting as its owner.

Tests: interrupted crawls, restarts, expired locks, recovery, and concurrent workers. No existing lock is cleared by hand or automatically as part of preparing this.

**Until this is merged and verified:** after every merge, the post-merge check includes a read-only query for sources holding a lock with no live crawl behind it. A finding is reported to the user, never cleared.

**Evidence gathered on 26 October 2026, after this stage was written.** The plan for this stage starts by establishing the actual failure mechanism; none of the hypotheses below is proven.

- Verified: after the UNDP crawl started at 13:48:17 IST, the scheduler retried it every 5 minutes from 13:49:48 and each attempt was refused by the held lock (Postgres log, above).
- Verified (Render events): the deploy of `efb8cd4` went live at 13:46 IST; at 13:49 an instance failed "HTTP health check failed (timed out after 5 seconds)", and the service then reported "recovered".
- Repository: the scheduler runs as a task inside the web server's own event loop (one process, `asyncio.create_task`). Fetching is asynchronous, but database calls (`psycopg2`), saving jobs, and the orchestrator's connection retries (with `time.sleep`) are synchronous, and listing pages are parsed with BeautifulSoup's pure-Python `html.parser`, re-parsed by up to five extraction strategies; for jobs whose link contains `undp.org` every job page is opened and parsed.
- Hypotheses to test, possibly one chain: a crawl step blocks the event loop for more than 5 seconds, so Render's health check times out and the instance is replaced; the replacement ends the crawl mid-run and leaves its lock held.

**Cause established, 26–27 October 2026.** The chain above is confirmed.

- Render's log shows about 70 seconds with no output during the UNDP crawl, then the restart (Verified). Offline, on saved UNDP pages and with the network blocked, the stall was reproduced and profiled: the listing's deadline pattern captured the table heading ("Agency", "Location") once per job, and `_parse_deadline` passed each to `dateparser` with no language list, so `dateparser` tried every locale it knows, synchronously, on the event loop.
- Interruption tests (the real orchestrator against a simulated database, network and real database blocked): a hard kill leaves the lock and a `running` run forever, and later attempts report "Open crawl run" as an ordinary result; a graceful stop releases the lock but leaves the `running` run.
- Production, read-only (Verified): PostgreSQL 17.6; neither `crawl_logs.status` nor `sources.last_crawl_status` has a check constraint; the run ID is a database-generated `uuid`. Also found, out of scope: `sources.careers_url` has no unique constraint in production, which the contract expects.
- Writers (Repository): only `contracts/persist.py`'s `persist_candidate` writes jobs, called by the three crawlers' `save_jobs`. The only other caller of `save_jobs` is `POST /api/admin/crawl/fix-undp-urls`; it cannot write jobs (its candidates are never admitted) but fetches a page and runs extraction outside the locks.

**PR A, the date-parsing fix (A1): done, 27 October 2026.** [PR #55](https://github.com/AidJobs/AidJobs/pull/55), approved by the user.

- `_parse_deadline` returns no deadline for text without a digit (headings, "today", a bare month), without calling `dateparser`, and gives `dateparser` a list of nine languages: the six UN official languages plus Portuguese, German, and Italian. A month name in any other language is no longer read; the user accepted this trade-off. `PyYAML==6.0.3` is declared explicitly; `tests/test_deadline_parsing.py` is in CI.
- Independent review by a separate read-only agent: approve with minor changes. The test gaps it found (a stub that raised inside `_parse_deadline`'s own error handler proved nothing; no test that the language list is passed; no test of an unlisted language) and two inaccurate comments were fixed in `4c2bbd7`, tests and comments only, with the code checked identical to `ad5c28d`. With the old behaviour restored in memory, 13 tests fail; with only the language list removed, 2 fail.
- Measured locally, not on Render: on the saved UNDP pages the worst event-loop stall fell from 23–34 seconds to 1.0–2.0 seconds in a fresh process, 0.4–1.4 seconds once warm (reviewer's measurements). The one-second target is not met when a process is cold; A2 (parsing off the event loop) or parsing each deadline once needs the user's decision.
- Merged as `47c9d1e` with the user's approval, locked to `4c2bbd7`. CI passed on `main`; Vercel production deployed it; Render: "Deploy live for 47c9d1e" at 11:55 IST via Auto-Deploy (Verified, Render events); the old instance stopped its scheduler and shut down cleanly, and the new one has answered every health check since. Read-only afterwards: health and capabilities answer 200, `/docs` and `/api/shortlist` 404; no crawl lock held and no run marked running.
- Follow-ups, tracked in the ledger rather than as GitHub issues (decided by the user, 27 October 2026): `core/ai_normalizer.py`'s `normalize_deadline` still calls `dateparser` with every locale, synchronously, inside an async function (lines 163–174; W-13, open); two-digit years read as the 2100s (W-12) and the cut at any capital "T" (W-32) are fixed in [PR #56](https://github.com/AidJobs/AidJobs/pull/56), open, together with ICRC's missing deadlines.

**PR B, crawl-lock recovery: design decided by the user on 27 October 2026; implementation not yet approved.** This replaces requirement 1 above: the user chose no heartbeat. Safety comes from run ownership checked under row locks, not from the expiry time; the expiry only decides how soon a dead crawl is recovered.

- **Timing:** each crawl's owner ends its own run at `CRAWL_TIME_LIMIT`, 15 minutes (2.3 times the longest observed crawl, 6.6 minutes); `LOCK_TTL` is 25 minutes; both configurable. After a hard kill, recovery takes at most about 30 minutes. `asyncio.wait_for` cannot stop code that blocks the event loop; that case is handled by Render replacing the process and recovery afterwards.
- **Ownership:** the run's `crawl_logs.id` is the token. A run token is mandatory in all three `save_jobs`: without a valid owned run, nothing is written. `POST /api/admin/crawl/fix-undp-urls` is removed.
- **Transactions,** each locking rows in one order (run, then lock, then source, then jobs): acquire (insert the lock, then the run; Gate 5's statement order kept); takeover, only after a conflict and only for a lock older than `LOCK_TTL`; every save first confirms its run is still running (`FOR SHARE`), so a takeover waits for a save in progress and every later save is refused; finish updates only its own running run, otherwise changes nothing; recovery at scheduler start and on every scheduler run.
- **Outcomes:** success stays `ok` or `warn`; the owner's time limit, and an expired lock with the cause unknown, are `fail`, each counted once toward the existing five-failure pause; a confirmed graceful shutdown is the new status `interrupted`, not counted, shown as neutral text; an old worker finishing late writes nothing.
- **Gate 5 changes,** approved, with the crawler plan's record to be updated: a held lock with no running run starts again once older than `LOCK_TTL`; when finishing fails, only the owner releases the lock, through an ownership-checked retry.
- **Tests, required before PR B is complete:** a PostgreSQL 17 service in CI, and tests on real concurrent transactions: concurrent acquisition, a save racing a takeover, a stale worker after takeover, exactly-once failure counting, recovery leaving live runs alone, graceful shutdown, hard kill, no deadlock, jobs unchanged on every failure path, and a writer without a token refused.

### Stage 3. Backend error handling and logging

Design first, for the user's approval, then implementation. The design gives:

- The shared error contract: fixed, safe messages; appropriate HTTP status codes; a request ID on every response that matches the server log line; consistent handling of expected and unexpected failures.
- The verified and classified inventory of unsafe patterns (above), false positives named.
- A redaction filter on the logging system for connection strings, password parameters, bearer tokens, and key shapes, applied to every logger.
- A regression test that fails if exception text is put into a response again.
- How [PR #50](https://github.com/AidJobs/AidJobs/pull/50) fits. PR #50 gives generic messages on the four public endpoints and masks the database-status log line. Merged with the user's approval on 27 October 2026 as `614f12e`, after its branch was brought up to date with `main` (`7cd16ba`, CI green); deployed and live-checked (ledger, "Last verified"). If its pattern needs replacing, the design proposes the replacement.

### Stage 4. Frontend proxy error handling

One shared proxy helper for the route files under `apps/frontend/app/api/`: the intended status codes and response shapes pass through; the backend's error text and Node's error messages do not. Tested.

### Stage 5. Tooling guard against printing secrets

A proposal for a Cursor project hook, or another enforceable guard, that blocks common direct attempts to print `.env` files or connection strings, with a safe way to check whether a setting is present (set or not set, never the value). Tested against blocked and permitted commands. It does not claim to prevent every possible disclosure.

### Stage 6. Least-privilege database roles

A plan, after stages 3 and 4 are reviewed. It inventories the tables the backend reads and writes, the functions and privileges it needs, the existing Row-Level Security policies, schema-migration needs, the admin operations that run schema changes, and the rollback and verification steps. It separates an application role from a read-only diagnostic role. No role, grant, credential, or Render setting changes until the user approves the plan; the user then makes the changes step by step.

### Stage 7. Two design decisions

- **Readiness:** keep Render's health check on liveness. First establish which path Render uses (established 26 October 2026: `/api/healthz`, which does not check the database; Render replaced an instance whose check timed out after 5 seconds, stage 2) and what Render does when the check fails; do not point Render at a check that depends on the database without that analysis. A separate readiness check, if needed, may belong with UX-28 error monitoring.
- **Public database status:** `/api/db/status` lists every source's internal ID and job count. Inventory its callers first (the admin dashboard calls it), then propose the minimum public response and where the detail moves.

### Stage 8. Employer survey

Not a security stage. Placed here by the user on 26 October 2026 so that it follows the security work and comes before UX-11. The scope, sources, and rules are in the ledger, W-31. It is read-only: no source is added, nothing is crawled, and no database is touched. The ReliefWeb `appname` it needs is kept like a setting, never in a tracked file, and contact details from the organisation lists are not stored.

## Open risks after stage 1 (26 October 2026)

- Closed on 27 October 2026 by PR #50: the public endpoints (`/api/db/status`, `/api/search/status`, `/api/search/parse`, `/api/search/autocomplete`) no longer return raw error text.
- About 60 admin-side raw-error responses, and no log redaction (stage 3); frontend proxies pass error text through (stage 4).
- `/api/db/status` is public and lists every source's internal ID and job count (stage 7).
- The backend and diagnostic checks connect as `postgres` (stage 6); the rule against printing secrets is not enforced by tooling (stage 5).
- Crawl locks never expire (stage 2, PR B). The known stall is reduced by PR A (#55) but not removed: about 1–2 seconds when a process is cold.
- Found in the stage 1 reviews, not yet assigned: `verify_internal_api_key` compares keys with `!=` rather than a constant-time comparison; an unauthenticated caller can make the server parse a request body on admin routes before the guard runs; `app/job_management.py`'s router is included twice; `app/shortlist.py` remains in the repository, unreferenced.

## Safeguards for every stage

- Do not modify, stage, reset, clean, or discard `apps/backend/scripts/diagnose_enrichment_bias.py` or `tests/test_link_heuristics.py`.
- No crawl, no database write outside an approved step, no tag change, no branch deletion, no manual deploy, no production setting change without the user's explicit approval.
- Never print a secret or a connection string. Checks report set or not set, lengths, or matches only.
- Keep `docs/ux-31-done` until the user approves its deletion; it is checked for unique work after the next docs merge.

## Incident record, 26 October 2026

### Database password printed in the chat

- About 14:18 IST, while checking that `SUPABASE_DB_URL` existed in `apps/backend/.env`, the agent ran a command that printed the whole line, password included, into its tool output (Verified). It was not written to any file or to git. It reached this conversation, which is held in Cursor's chat history and sent to the AI service.
- Rotated by the user the same afternoon, step by step: a new database password in Supabase; `SUPABASE_DB_URL` updated on Render, which redeployed the backend; the local `apps/backend/.env` updated.
- Checked by the agent afterwards (Verified): the old password refused ("password authentication failed"), about 14:39 IST; while Render switched over, Supabase briefly refused new connections ("too many authentication failures, new connections are temporarily blocked"), then the backend's database status was ok from 14:41 IST; the local `.env` connected once, read-only, at 15:08 IST; the site's health check, `/v2`, and the admin login answered; search returned 274 jobs from the database; the database held 371 jobs, 274 open, from 3 sources; `apps/backend/.env` is ignored by git and not tracked.
- Open: the Supabase log review (stage 0); the guard that would have prevented this (stage 5); least-privilege roles, so that a credential used for diagnostics would be read-only (stage 6).

### MSF and UNDP sources, added and removed

- The user added two sources in the admin on 26 October 2026 (Verified, read-only query): MSF (`https://www.msf.org/jobs`, 13:40 IST) and UNDP (`https://jobs.undp.org/cj_view_jobs.cfm`, 13:47 IST), both active, HTML, every 3 days. A source created in the admin is due at once, and the scheduler checks every 5 minutes while the backend is awake (Repository).
- MSF was crawled at 13:41 IST: "Found 1 jobs", none saved. Why the one candidate was not saved was not checked.
- UNDP's crawl started at 13:48 IST and was still "running / queued", with its lock held, at 14:22 IST. The backend restarted for the PR #49 deploy at about that time; that this cut the crawl off is an inference, not verified. Found later the same day: the Postgres log shows the scheduler's refused retries every 5 minutes from 13:49:48 until 14:33 (Verified), and Render's events show the deploy live at 13:46 IST and an instance replaced after a 5-second health-check timeout at 13:49 (Verified). That makes an interrupted crawl more likely; what stalled the health check is not established (stage 2).
- Extraction path (Repository): the new-extractor allowlist compares the exact host after removing a leading `www.`, so `jobs.undp.org` does not match `undp.org`, and MSF is not listed (the allowlist values are as recorded in ledger W-23, not re-read on Render). On the HTML path the new extractor is called with shadow mode off, so the shadow-mode setting is not a dry run; jobs from either extractor pass the same admission check into the live `jobs` table. For jobs whose link contains `undp.org`, the crawler opens every job page for detail, without the 50-job cap.
- The user then deleted both sources permanently, to keep the focus on the planned work; the database counted 3 sources at 15:10 IST (Verified). The permanent delete also removes a source's crawl records and lock (Repository).
