# AidJobs — Security hardening plan

**Status:** approved in principle by the user on 26 October 2026, including the order below. This is approval of the direction only. Each stage needs its own defined scope, reviewable changes, tests, and the user's explicit approval at every step (plan, implement, merge). Nothing here approves a database change, a credential change, a production setting change, or a crawl.

**Priority:** set by the user on 26 October 2026. This plan runs before UX-11. The employer survey (ledger W-31) follows the security stages as stage 8, placed there by the user the same day; UX-11 resumes as stage 9, with a plan for the user's approval. **Updated 30 October 2026** (`growth-and-seo-plan.md`, section 7): stage 3A (dependency security, added 30 October 2026), then the rest of stage 3, stages 4, 5, and 7, and the stage 6 plan run as approved; stage 8, the survey, is widened; after it, work follows the growth plan's step 4 (the crawler foundation), and UX-11 comes later, in its step 7.

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
| 2 | Crawl-lock recovery | Done, 28 October 2026: PR A ([PR #55](https://github.com/AidJobs/AidJobs/pull/55)) and PR B ([PR #60](https://github.com/AidJobs/AidJobs/pull/60), merged as `f4059f0`), deployed and live-checked (live record below) |
| 3 | Backend error handling and logging | Design approved 28 October 2026 (below). Phase 1 done: [PR #63](https://github.com/AidJobs/AidJobs/pull/63), merged as `2de9d53`, deployed and live-checked (live record below). Phase 2 plan approved 29 October 2026. Its PR 1 (sources and presets) is done: [PR #65](https://github.com/AidJobs/AidJobs/pull/65), merged as `f8bedf9`, deployed and live-checked. PRs 2 to 5 and phase 3 each need their own approval |
| 3A | Dependency security | Added 30 October 2026 and approved by the user the same day; runs before stage 3, phase 2, PR 2 (section below). Part 1 (backend pins) done: [PR #69](https://github.com/AidJobs/AidJobs/pull/69), merged as `6b657c4`, deployed and live-checked, with three manual crawls on the new version (live record below). Part 1b (test tools) done: [PR #71](https://github.com/AidJobs/AidJobs/pull/71), merged as `720fa4c`, deployed and live-checked, and Render's build cache cleared (live record below). FastAPI upgrade done: [PR #73](https://github.com/AidJobs/AidJobs/pull/73), reviewed head `7377e10`, merged as `385c5f8`, deployed, every production check passed, Render's `setuptools` version Not verified (records below). Part 2 (Next.js 16 and React 19) done: [PR #75](https://github.com/AidJobs/AidJobs/pull/75), merged as `f9b635f`, live-checked; Dependabot closed its 60 runtime alerts (records below). Part 3 (continuous checks), split on 1 November 2026 into three steps: step 1, the audit gate, done: [PR #80](https://github.com/AidJobs/AidJobs/pull/80), merged as `4d404ae`, live-checked (records below); step 2, the development tools, built in [PR #81](https://github.com/AidJobs/AidJobs/pull/81), not merged, with three advisories formally accepted (record below); step 3, a backend lockfile and Render's build tools |
| 4 | Frontend proxy error handling | After stage 3 |
| 5 | Tooling guard against printing secrets | Proposal first |
| 6 | Least-privilege database roles | Plan only, after stages 3 and 4 are reviewed |
| 7 | Two design decisions: readiness check, public database status | Each its own decision |
| 8 | Employer survey (ledger W-31) | After stages 0 to 7; read-only; each step for the user's approval. Widened on 30 October 2026 (`growth-and-seo-plan.md`, decision 4 and section 7, step 3) |
| 9 | After this plan: the growth plan's step 4, the crawler foundation | Changed 30 October 2026; UX-11 moves to the growth plan's step 7 |

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

**Until this is merged and verified:** after every merge, the post-merge check includes a read-only query for sources holding a lock with no live crawl behind it. A finding is reported to the user, never cleared. Merged and verified on 28 October 2026. The query stays in each post-merge check: since PR B, recovery handles such locks itself, and the query shows whether it has.

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
- Live on Render, 27 October 2026: during an ICRC crawl the user ran from the admin at 16:25 IST (by then with PR #56 too), the health checks kept their 5-second rhythm, longest gap 6 seconds over 63 checks, against 70 seconds of silence on 26 October; no failed instance (ledger W-32). One crawl of one source, not a proof for UNDP-sized listings.
- Follow-ups, tracked in the ledger rather than as GitHub issues (decided by the user, 27 October 2026): `core/ai_normalizer.py`'s `normalize_deadline` still calls `dateparser` with every locale, synchronously, inside an async function (lines 163–174; W-13, closed by PR #58, which removes the AI normaliser from the crawl path); two-digit years read as the 2100s (W-12) and the cut at any capital "T" (W-32) are fixed in [PR #56](https://github.com/AidJobs/AidJobs/pull/56), merged as `c86984e` and live-checked, together with ICRC's missing deadlines.

**PR B, crawl-lock recovery: design decided by the user on 27 October 2026; implementation approved the same day and built in [PR #60](https://github.com/AidJobs/AidJobs/pull/60), merged as `f4059f0` on 28 October 2026 and live-checked (records after part H).** The design replaces requirement 1 above: the user chose no heartbeat. Safety comes from run ownership checked under row locks, not from the expiry time; the expiry only decides how soon a dead crawl is recovered. The full specification follows, written on 27 October 2026 against the code on `main` after PR #58 (`51c6299`), for an independent review before the user decides on implementation.

#### PR B specification

Revised the same day after an independent read-only review of the first version against the code. Each change it caused is marked "(review)".

**A. What the design rests on.**

- **Verified (Render documentation, read 27 October 2026).**
  - A deploy is zero-downtime: the new instance takes traffic, Render sends `SIGTERM` to the old instance about 60 seconds later, and `SIGKILL` if it has not exited within the shutdown delay (default 30 seconds). So two schedulers can run at once for at least 60 seconds on every deploy.
  - The free plan spins an instance down after 15 minutes without inbound traffic, and "might restart a Free web service at any time" (review).
  - Not verified: which signal a spin-down sends, and Render's start command and shutdown settings for this service. The start command is not in the repository.
- **Verified (Supabase documentation, read 27 October 2026).** The shared pooler in session mode, which production uses (port 5432), supports everything a direct connection does. Row locks taken inside a transaction behave as in plain PostgreSQL. Not verified: the session pool's size limit.
- **Verified (production, read-only).**
  - PostgreSQL 17.6. No check constraint on `crawl_logs.status` or `sources.last_crawl_status`. `crawl_logs.id` is a `uuid` generated by the database.
  - Crawl durations up to 27 October 2026, before PR #58 removed about 17 seconds of failed AI calls per crawl: UNICEF's longest was 393.6 seconds (19 October); ICRC about 141 seconds; Oxfam at most 104 seconds.
- **Verified (Render log).** Saving 118 and 119 UNICEF jobs took about one second each, on 25 and 26 October; ICRC's 13 jobs took under a second on 27 October. The log has one-second resolution.
- **Repository: the event loop.**
  - Every orchestrator database step and every `save_jobs` call runs synchronously inside the web server's event loop.
  - `CrawlerOrchestrator._get_db_conn` retries with `time.sleep`: 2 addresses × 3 attempts, a 10-second connect timeout each, plus 2- and 4-second sleeps, about 72 seconds at worst.
  - Other writes during a crawl are also synchronous, and some have no connect timeout (review):
    - `log_admission_rejections` opens one connection per rejected job;
    - the `raw_pages` insert;
    - the extraction logger.
- **Repository: one crawler instance shared by every crawl (review).** One `SimpleCrawler` serves every HTML crawl. `crawl_source` keeps `self._listing_report` and `self._current_source_id` on that shared instance, and reads the report after the save.
- **Repository: shutdown today.** Uvicorn handles `SIGTERM` in this order (review; read in the installed uvicorn 0.54, same structure in production's pinned 0.32.0):
  1. stops accepting connections;
  2. waits for open requests to finish, with no limit unless a graceful-shutdown timeout is set;
  3. runs the lifespan shutdown, where `stop_scheduler` only sets `running = False`;
  4. cancels the loop's remaining tasks.

  A cancelled crawl's `finally` releases its lock but leaves its run `running`; the interruption tests of 26 October reproduced this. An admin `POST /api/admin/crawl/run_due` in progress holds step 2 open until all its crawls end.
- **Repository: source updates and counters.**
  - `finish_run` writes failure and no-change counters calculated from the source row read when the crawl was selected, minutes earlier. It also writes the source's `status` from that row.
  - The admin "Run" route does not read `status`, so `finish_run` falls back to `active`. A manual crawl of a paused source un-pauses it, and a crawl of a source soft-deleted during the crawl un-deletes it (review).
  - `compute_next_run` opens a second connection, through `SourceHealthScorer`, with no timeout (review).
- **Repository: `POST /api/admin/crawl/fix-undp-urls`.** It refers to names that do not exist (`cursor`, `normalized_jobs`, `size`; Ruff F821 on `main`), so it fails before it reaches `save_jobs`. It also bypasses the locks.
- **Repository: who writes what.**
  - `crawl_locks` and `crawl_logs`: only the orchestrator (`begin_run`, `finish_run`, `release_lock`), plus permanent source deletion (`app/sources.py`). Permanent deletion removes the source's runs, then its lock, then the source, in one transaction.
  - Jobs: crawls write only through `persist_candidate`, inside the three crawlers' `save_jobs`. Admin pages also write jobs: the source soft delete, `delete-jobs-by-org`, and the job-management routes (review).
  - Inserting a job takes a key-share lock on its source row, through the foreign key. Updating a job does not, because its `source_id` never changes (review).
- **Repository: the lock and its run are not linked.** `crawl_locks` has no run id. The acquire step writes `locked_at = NOW()` and `ran_at = NOW()` in one transaction. `NOW()` is the transaction's start time, so the two timestamps are equal, and that equality identifies the run that owns a lock (review). Both columns are `TIMESTAMPTZ` in `infra/supabase.sql`; production's types are to be confirmed by the schema query (F).
- **Repository and not verified: issue #5.**
  - In the HTML crawler, a database error on one job is caught and the loop continues. It is not verified that this aborts the transaction so that the final commit silently rolls the whole batch back while the crawl reports `ok`. The first PostgreSQL test will show it.
  - The RSS and API crawlers have no per-job catch: their whole save rolls back and reports `failed` (review).
- **Versions (Repository).** CI uses Python 3.11.9, and `requirements.txt` pins `uvicorn[standard]==0.32.0`. The versions Render runs are not verified. The local environment runs Python 3.14 and uvicorn 0.54; uvicorn's shutdown order above was read in 0.54 and in 0.32.0's published source.
- **Repository: admission-rejection logging** runs before `save_jobs`, on its own connections, outside the save transaction.

**B. Settings.** Read from the environment, with defaults. No Render change is needed.
- `CRAWL_TIME_LIMIT_MINUTES`: 15.
- `CRAWL_LOCK_TTL_MINUTES`: 25. It must be longer than the time limit plus 6 minutes (finishing plus one 5-minute recovery interval); the code refuses a value that is not. This holds only because both clocks start when the lock is taken (C1).

**C. Design.**

1. **One clock (review).** A run's lock age and its time limit both start when the lock is taken.
   - **Scheduled crawls** (the scheduler and `run_due`) take one of the 3 concurrency slots first, and only then the lock. A crawl queued behind others therefore holds no lock while it waits.
     - The orchestrator keeps the set of source ids queued in this process and does not queue a source twice (review).
     - When its slot comes, the acquire re-reads the source in the same transaction. It goes ahead only if the source is still `active` and still due; otherwise it rolls back and skips, with nothing written (review). A manual run, a pause, or a deletion during the wait is therefore respected.
   - **The admin "Run" route** keeps the contract: it takes the lock at once and returns the run's id. A manual run does not require the source to be due, and may run a paused source; it never changes that status (C4).
     - Its time limit runs from that moment.
     - If its slot frees with less than 5 minutes of its limit left, or not at all, the run ends `interrupted` ("no free crawl slot") without crawling. It writes nothing to the source: no counter, no last status, no next-run time. So it does not feed the second-interruption rule in C5 (review).
   - **`POST /api/admin/crawl/run_due`** queues the due crawls as tracked tasks and returns at once. Its response keeps `data.queued`, the number of sources queued, which the admin Crawls page reads (review). It no longer holds a request open while the crawls run, and so no longer delays shutdown.
2. **Ownership token.** The token is the run's `crawl_logs.id`.
   - It is passed explicitly, from `execute_run` to `crawl_source(source, run_token)` and on to all three crawlers' `save_jobs(..., run_token)`. It is never stored on the shared crawler instance.
   - The token is mandatory: `save_jobs` without a token, or with one that does not identify a running run of the same source, writes nothing and raises `OwnershipLost`.
   - Each crawler's broad `except` in `crawl_source` turns that error into `failed`. That is harmless, because the finish of a run it no longer owns writes nothing (review).
3. **Database steps.** Each locks rows in one order: the run rows (R), then the lock row (L), then the source row (S), then job rows (J). The source row is locked with `FOR NO KEY UPDATE`, which does not block the key-share locks that job inserts take through the foreign key (review).
   - **Timeouts (review).** Every step sets `SET LOCAL statement_timeout = '30s'` and `idle_in_transaction_session_timeout = '60s'`, so a stuck database cannot hold these locks indefinitely. The lock timeout depends on the step:
     - takeover and recovery use `lock_timeout = '5s'`, and hitting it means "skip, try again later", with nothing written or counted;
     - the finish uses `lock_timeout = '30s'`, and runs only after the run's own save has ended (C7, C8). A lock wait also counts toward the 30-second statement limit, so either error leads to the finish's single retry;
     - the acquire and the save set no lock timeout of their own, and are bounded by the 30-second statement limit.
   - **Connect timeout (review).** Every crawl connection, for the save, the run steps and the crawl-time logs, uses a 10-second connect timeout.
   - **Acquire.**
     - `INSERT INTO crawl_locks … ON CONFLICT DO NOTHING RETURNING`, then `INSERT INTO crawl_logs (… 'running' …) RETURNING id`, then commit. This keeps Gate 5's statement order.
     - Both inserts use `NOW()` in the same transaction; never `clock_timestamp()` or a time from Python. A takeover and the acquire that follows it are separate transactions (review).
     - The new run row cannot be contended, because no other transaction knows it exists, so taking L before R here cannot deadlock.
     - On a conflict with a live lock (younger than the lifetime), roll back and return the live run's id, found as the running row whose `ran_at` equals the lock's `locked_at`. This keeps the contract's "a duplicate request returns the open run".
   - **Take over**, only after a conflict with an expired lock.
     - Lock every running row of the source, ordered by id.
     - Lock the lock row only if it is still older than the lifetime; otherwise roll back and return the live run's id as above.
     - Mark the owning run `fail` ("lock expired, cause unknown") and any other running row `interrupted`. Delete the lock, count one failure on the source for the owning run only (C4), and commit. Then acquire again.
     - Rows marked `interrupted` here, or by recovery, write no source field and no counter (review).
     - A lock with no owning run, as left before PR B, is taken over the same way, with only the lock to remove.
   - **Save.**
     - The first statement is `SELECT 1 FROM crawl_logs WHERE id = %(token)s AND source_id = %(source)s AND status = 'running' FOR SHARE`. If no row comes back, roll back and refuse.
     - Then the job writes, each under its own savepoint (C6), and commit.
     - A takeover's `FOR UPDATE` waits until a save in progress commits; every save after the takeover is refused.
   - **Finish.**
     - `UPDATE crawl_logs SET … WHERE id = %(token)s AND status = 'running' RETURNING id`. If no row comes back, roll back and change nothing: no counter, no lock, no source field.
     - Otherwise delete the lock, update the source (C4), and commit. This replaces today's separate lock release in `finally`; a crawl cannot release a newer run's lock.
     - If the finish itself fails, it is retried once. If that fails too, the lock stays until the lifetime passes and recovery counts the run once (review).
   - **Recover.** At scheduler start, then on its own 5-minute timer, separate from the scheduler rounds so a long round does not delay it (review). Each source is handled in its own transaction:
     - an expired lock is handled like a takeover, without starting a crawl;
     - a running row that does not own a lock and is older than 2 minutes is marked `interrupted`. That covers rows left by an earlier version, and a row orphaned while a newer run holds the lock (review).
     - A lock younger than the lifetime is never touched, including the old instance's live crawl during a deploy overlap.
4. **Source updates.**
   - The health score that `compute_next_run` needs is calculated before the locked transaction (review).
   - Inside the transaction, the source row is read fresh under its row lock. The new counters, the next run time and the pause are calculated from that fresh row.
   - Status changes only from `active` to `paused`, at the five-failure threshold. Any other status, such as `paused` or `deleted`, is left exactly as it is (review). This fixes the manual-run un-pause and the un-delete.
5. **Outcomes.**

   | Outcome | Run status | Source last status | Failure count | Next run |
   | --- | --- | --- | --- | --- |
   | Success | `ok` or `warn`, as today | the same | reset to 0 | as today |
   | Time limit reached | `fail`, "Timed out after N minutes" | `fail` | +1 | as today, with back-off |
   | Lock expired, owner died | `fail`, "lock expired, cause unknown" | `fail` | +1 | as today, with back-off |
   | Shutdown, cancelled cleanly | `interrupted` | `interrupted` | unchanged the first time; +1 if the source's last status was already `interrupted` (review) | unchanged the first time, so it runs again at the next check; with back-off when counted |
   | Manual run, no free slot in time (C1) | `interrupted`, "no free crawl slot" | nothing written | unchanged | unchanged |
   | Old crawl finishing late | nothing written | nothing written | unchanged | unchanged |
   | Every job failed to save (C6) | `fail` | `fail` | +1 | as today, with back-off |
   | Some jobs failed to save (C6) | `warn`, "N of M jobs failed to save" | `warn` | reset to 0, as for `warn` today | as today |

   Counting a second interruption in a row bounds the 26 October pattern, where a crawl that stalls the server causes a restart and runs again at once. With the existing back-off and the five-failure pause, it cannot repeat indefinitely.

   `fail` and `failed` keep counting as today. The admin shows `interrupted` as neutral text, because its pages colour only `ok`/`success` and `fail`/`error` (Repository; to be checked on a preview).
6. **Issue #5.**
   - In all three `save_jobs`, each job's writes run under `SAVEPOINT` / `RELEASE SAVEPOINT`. A database error, including a deadlock with an admin job write (review), rolls back to the savepoint, skips that job, removes its entry from the search-projection list, counts it as failed, and the batch continues.
   - `crawl_source` turns the failed count into the statuses in C5.
   - For RSS and API this changes an all-or-nothing save into a per-job save. Neither has a live source.
7. **Time limit.** `execute_run` wraps the crawl in `asyncio.timeout` (Python 3.11), not `wait_for`, which can swallow a cancellation (review). The deadline is the lock time plus the limit (C1). On timeout the run finishes as `fail` through the ownership-checked finish.
   - A save already running in a worker thread (C9) cannot be cancelled. It completes under its own ownership check. The orchestrator keeps that save's thread future and waits for it before running the finish, so the finish never queues behind its own save on the run row (review).
   - Code that blocks the event loop cannot be timed out. Render replaces such a process, and recovery handles it after the lifetime.
8. **Shutdown.**
   - The orchestrator keeps a reference to its scheduler task and to every running crawl's task: from the scheduler, `run_due`, and the admin "Run" route.
   - `stop_scheduler` stops new crawls, cancels the tracked tasks, and waits until a deadline 20 seconds after it starts. Each cancelled crawl first waits for a save it has in progress (C7), then records `interrupted` (C5) through a shielded, ownership-checked finish. Whatever is not finished by the deadline, including a finish still waiting on its 30-second lock timeout, is left to recovery.
   - With `run_due` no longer holding requests open (C1), uvicorn's wait for open requests is short. But the 20 seconds start only after it, and nothing guarantees they fit inside Render's 30. A graceful-shutdown timeout in Render's start command would bound it; that is a setting change for the user's approval, not part of PR B (review).
9. **Off the event loop.** Every orchestrator database step, and `save_jobs`, run in a worker thread (`asyncio.to_thread`), so a slow database or a larger save cannot block the health check.
   - The admission-rejection log, the `raw_pages` insert and the extraction logger run in the same worker thread, and their connections get a 10-second connect timeout (review).
   - **No per-crawl state on the shared crawler instance (review).** `_listing_jobs` returns the jobs and the listing report together, and the UNICEF reader returns its report rather than setting an attribute. `crawl_source` keeps both in local variables from then on. `_current_source_id`, used only for logging, becomes a local value too.
   - Each thread opens and closes its own connections. A crawl uses one at a time, plus one for the health score before finishing. Up to 3 crawls run at once per instance, and a deploy overlap doubles that briefly.
   - Scheduling the search projection moves back onto the event loop after the thread returns. In a thread it would only log "no running event loop"; it does nothing since Meilisearch was removed (W-30), but the path must stay correct.
10. **Removed:** `POST /api/admin/crawl/fix-undp-urls`, the only other caller of `save_jobs`. Decided by the user on 27 October 2026. The crawler plan said to leave it "unless a separate fix is approved"; this is that approval.
11. **Unchanged:**
    - extraction, admission, identity, `persist_candidate`, and deadline parsing;
    - the scheduler interval and the concurrency limit of 3.

**D. Contract and plan decisions this needs.** All were decided by the user on 27 October 2026 and are recorded with this specification:
- **A new status text, `interrupted`.** Contract §5 says to use the existing status text "unless a versioned migration is separately approved". No migration is needed, because neither status column has a check constraint (Verified).
- **`/fix-undp-urls` removed** (crawler plan, Gate 4 record).
- **Issue #5 reopened inside PR B** (crawler plan, "Parked decision").
- **The two Gate 5 behaviour changes:**
  - a held lock with no running run starts again once older than the lifetime;
  - when finishing fails, only the owner releases the lock.
- **"A duplicate request returns the open run" is kept unchanged.**

**E. Files.**
- `orchestrator.py`: C1, C3, C4, C7, C8 and C9; task tracking; recovery.
- `crawler_v2/simple_crawler.py`, `rss_crawler.py`, `api_crawler.py`: token, save check, savepoints, failed-save statuses, thread work, local listing report.
- `app/search_projection.py`: commit and scheduling split so a thread can commit.
- `app/crawler_admin.py`: `/fix-undp-urls` removed; `/run` reads `status`; `/run_due` returns at once.
- `contracts/admission.py`: the rejection log's connect timeout.
- `.github/workflows/ci.yml`: a `postgres:17` service; the new test file in the Ruff list only; and its own pytest step, separate from the existing command (F). That step sets `TEST_DATABASE_URL`, leaves `SUPABASE_DB_URL` and `DATABASE_URL` unset, and fails if any of its tests is skipped.
- Tests and documents as listed in F.
- No frontend change, unless the preview shows `interrupted` wrongly.

**F. Tests.**
- **The test database must never be production (review).**
  - The tests accept only a `TEST_DATABASE_URL` whose host is `localhost` or `127.0.0.1` and whose database name ends in `_test`. They refuse anything else before connecting.
  - They run in their own pytest process, in CI and locally, with `SUPABASE_DB_URL` and `DATABASE_URL` unset. The rest of the suite imports `main`, which loads `.env`, and `app/db_config.py` caches database settings at import, so sharing one process is not safe (review).
  - Inside that process, `psycopg2.connect` is wrapped to refuse any address that is not the test database, whatever code calls it.
  - Locally they skip without `TEST_DATABASE_URL`. In CI (`CI=true`), a missing variable is a failure, and the CI step fails if any test in the file is skipped.
- **The schema (review).**
  - A committed test schema, `apps/backend/tests/sql/crawl_schema.sql`, is written from one read-only production query, with the user's approval. It covers the columns, constraints, foreign keys, triggers and indexes of `sources`, `crawl_logs`, `crawl_locks` and `jobs`.
  - `infra/supabase.sql` cannot be used as it stands: it lacks columns the writer uses (`is_remote`, the geocoding and quality fields, `organisation_id`), and its policies refer to Supabase roles.
  - A test checks that every column `persist_candidate` writes exists in the schema.
- **New `tests/test_crawl_ownership.py`, against real PostgreSQL 17.** Concurrent steps run on separate connections and threads, with barriers that force each interleaving. Cases:
  - two acquisitions at once: one token, and the other returns the live run's id;
  - four or more due sources with 3 slots: no queued live run is taken over (review);
  - a manual run while the same source is queued, `run_due` together with a scheduler round, and a source paused while queued: no duplicate crawl, and no crawl of the paused source (review);
  - two HTML crawls at once, interleaved during the listing, geocoding and save awaits, keep their own listing reports (review);
  - the owning run's `ran_at` equals its lock's `locked_at` (review);
  - a timed-out run with a save in progress: the finish waits for the save, then records `fail` once (review);
  - a save racing a takeover: the save completes, and the stale worker's next save is refused;
  - a stale worker's save, finish and release all change nothing; the new owner's lock, run and source are untouched;
  - exactly one failure counted for each of: a timeout then recovery; a lock expiry then a late finish; two recoveries at once;
  - recovery leaves a live lock alone, including two orchestrators overlapping as in a deploy;
  - an orphaned running row beside a live run is marked `interrupted`, and the live run keeps its lock (review);
  - a slow but live crawl keeps its ownership up to the limit;
  - a shutdown cancellation records `interrupted`, unchanged the first time and counted the second time in a row;
  - a manual run with no free slot, or under 5 minutes left when it frees, ends `interrupted` and writes nothing to the source;
  - a hard kill is recovered after a shortened lifetime and counted once;
  - forced interleavings of takeover against finish, save against takeover, and save against an admin soft delete do not deadlock, or are handled per job (review);
  - job rows, `deleted_at` and expiry fields stay byte-identical on every failure path;
  - a save without a token, or with a foreign one, writes nothing;
  - issue #5: first today's behaviour, shown on `main`'s code; then the savepoint behaviour;
  - a manual run of a paused source stays paused, and a source soft-deleted mid-crawl stays deleted (review);
  - `run_due` returns at once, with `data.queued`;
  - the lifetime setting is refused when not longer than the limit plus 6 minutes.
- **Existing tests.**
  - `test_gate5_crawl_run.py`: the two approved behaviour changes (D), and the manual route's duplicate request still returning the open run.
  - `test_reliability_persist.py`, `test_link_admission.py` (its check of the order of admission and save) and `test_gate6_lifecycle.py`: updated for the token and the thread.
  - Everything else must pass unchanged.
- **Evidence before the pull request is opened:**
  - the new tests fail on `main`'s code where they test new behaviour;
  - the whole-crawl comparison on the saved pages shows identical saved job records;
  - the full CI list passes on Python 3.11, as in production;
  - an independent code review.

**G. Acceptance, rollout, and rollback.**
- **Before merge:** all of F green in CI against PostgreSQL 17, the crawler plan's Gate 5 record and the contract amendments in D recorded, and the review's findings resolved.
- **After merge, read-only only:**
  - CI on `main` and the Render deploy;
  - no health-check failure during the deploy overlap or the next scheduled crawls;
  - no orphaned lock, and no run left `running`;
  - the next crawl of each source ends with a normal status.
- **No crawl is triggered** unless the user chooses to run one.
- **Rollback:** reverting PR B is safe. There is no schema or data change, and runs marked `interrupted` stay as text.

**H. Open risks.**
- **A crawl blocked inside code that does not pause** still holds its lock until Render replaces the process and the lifetime passes. Recovery runs on its own 5-minute timer, so the delay is at most about 30 minutes: the 25-minute lifetime plus one interval (review).
- **Two deploys in a row** interrupting the same source, for example a code merge followed by its documentation merge, count a false failure and 12 hours of back-off (review). Accepted; the next normal crawl resets the count.
- **A manual run** can wait behind up to 3 running crawls, and behind queued ones once there are many sources. When too little time is left it ends `interrupted` and writes nothing to the source (C1).
- **The shutdown window** depends on uvicorn's wait for open requests (C8). Bounded since 28 October 2026, when the user added `--timeout-graceful-shutdown 5` to Render's start command (live record).
- **Not verified:** the free plan's spin-down signal and the session pool's size.
- **Issue #5's mechanism** is to be shown by the first test before the code changes. If it is wrong, C6 is re-planned. Shown on 27 October 2026; it is as described (implementation record).

#### PR B implementation record

Implementation approved by the user on 27 October 2026, together with the three decisions in D. Built on the branch `feat/crawl-ownership` from `main` at `bb9430c`, in [PR #60](https://github.com/AidJobs/AidJobs/pull/60). The code commits:
- `cfe981d`: the ownership token, the owner-only finish, takeover and recovery, slots and the queued set, the time limit, shutdown, work in worker threads, and the removal of `/fix-undp-urls` (C1–C5, C7–C11);
- `31d1b7a`: issue #5, one savepoint per job and the failed-save statuses (C6), as its own commit;
- `abf19d0`: the PostgreSQL tests and their CI step (F);
- `b8d85f6`: the fixes from the independent review (below).

Choices made while building, each within the specification:
- **Acquire.** It uses `INSERT … ON CONFLICT (source_id) DO NOTHING RETURNING`. On a conflict it reads the lock: a live lock returns the live run's id; an expired one is taken over and the acquire is tried again, three attempts at most.
- **Step timeouts.** They are set with `SET LOCAL` as the first statement of every run step, and of every save inside `confirm_running`. They are not connection options, which the Supabase pooler may not pass on.
- **`RunHandle`.** It runs a save in a worker thread and lets the finish wait for that save (C7). It lives in `crawler_v2/run_handle.py`, because Gate 3's test forbids the orchestrator importing `contracts`.
- **`contracts/admission.py` is unchanged** (E listed it). Its rejection log connects through `core/extraction_logger.py`, which now has the 10-second connect timeout.
- **Manual runs.** A manual run whose slot comes with less than 5 minutes of its limit left ends `interrupted` without crawling, including when the limit itself is shorter than that. A shutdown while it waits for a slot records the shutdown message, not "no free crawl slot".
- **CI.** The service is `postgres:17.6`, production's exact version. `crawler_v2/run_handle.py` joins the new test file in the Ruff list.

Evidence, 27 October 2026:
- **Production schema** (structure only, read-only enforced and confirmed, run with the user's approval):
  - `crawl_locks.locked_at` and `crawl_logs.ran_at` are both `timestamp with time zone`;
  - `crawl_logs.status` has no check constraint.
  - `tests/sql/crawl_schema.sql` is written from this query. Loaded into a local PostgreSQL 17.6, it matches production's four tables column for column and index for index (Verified).
- **Today's behaviour, on `main`'s code against the local test database** (Verified, local). Issue #5's mechanism is as H described. With one failing job among three, `save_jobs` reported 1 inserted and 2 failed, and no row was stored: the first error aborted the transaction, every later job failed with it, and the commit rolled the batch back. The same run showed five more faults on `main`:
  - a save with no run at all wrote a job;
  - a day-old lock with no running run never started again;
  - an old run's release deleted a newer run's lock;
  - a manual run turned a paused source `active`;
  - a late finish overwrote a failed run with `ok`.
- **The branch** (local, Python 3.14; CI checks Python 3.11 on the pull request):
  - after both reviews, the 47 PostgreSQL tests pass against PostgreSQL 17.6, four runs in a row;
  - the full CI list passes, 420 passed and 4 skipped, the same skips as before;
  - Ruff passes, and the changed modules have no new Pyflakes finding against `main`;
  - with only the ownership commit, the CI list also passes.
- **Whole-crawl comparison on the saved pages** (12 sources, network blocked), `main` against the branch, before and after the review fixes (Verified, local):
  - the jobs handed to the save are identical;
  - the job rows stored in PostgreSQL by the real save are identical, 171 rows of 94 fields;
  - statuses, messages and counts are identical.

**Independent review**, 28 October 2026, by a separate agent instructed to change nothing. Verdict: ready with minor fixes; no blocker or major finding. It confirmed the lock order has no cycle, exactly one failure is counted per lost run, recovery never touches a live lock (including old `main` instances during a deploy overlap), no slot leaks, cancellation is handled, and the CI step works. Fixed in `b8d85f6`, each with a test:
- A shutdown while a crawl is taking its lock left the lock and its running row for recovery, which would count a failure. The cancelled caller now closes the run it started as `interrupted`, writing nothing to the source.
- The raw-page step's connect had moved outside its error handling, so a failed connect would have failed the HTML crawl. It logs a warning again, as on `main`.
- The time-limit test passed even without the finish waiting for its save. It now checks that the finish starts only after the save has ended; with the wait removed in memory it fails, as does the new acquire test with its fix removed.
- The test guard: the file now skips before installing anything when no test database is set, and refuses `hostaddr`, `service`, several hosts, URL options, and `PGHOST`, `PGHOSTADDR` and `PGSERVICE`. Its description of the network block is narrowed to Python sockets.
- Recovery handles each source separately; the finish deletes only its own run's lock; "every job failed" counts only jobs that reached their write; a timed-out run records what it saved; the lock-expired message no longer begins "Interrupted:"; `dateparser` runs under a lock, because saves now run in up to three threads; a closed event loop cannot turn a committed save into a failed one; a run handle refuses an empty token.
- New tests also cover a shutdown while a scheduled run waits for a slot, a timeout whose finish fails twice (recovery counts once), and the real `run_due` route's response.

Accepted, not changed:
- The raw-page row, the extraction log and the rejection log are written in their own threads and are not ownership-checked. A stale run can still add log rows after it lost ownership, never job rows.
- A save with an empty list, or one whose every job is filtered before any write, returns without checking a foreign token; it writes nothing either way.
- A counted second interruption computes its next run without the health score.
- Issue #5's behaviour on `main` is shown by a one-off run, recorded above, not by a committed test.

**Unrequested edits during the review.** While the reviewer ran, duplicate versions of this PR's documentation edits appeared in the ledger and the crawler plan, written by none of the user, this session's agent, a hook, or another session; the reviewer was the only other agent running. The user confirmed they had not made them. They were removed before commit, and the code was checked unchanged. Later reviews run read-only.

**Final independent review of the whole diff**, 28 October 2026, requested by the user before deciding on the merge. It was run by a fresh agent in a separate clone with no remote, with its own test database, and a fingerprint of this repository was taken before and after (unchanged). Verdict: approve with minor changes; no blocker, no major finding, no code defect.
- **Stale runs:** a run that has lost ownership cannot write jobs, any `crawl_logs` row, any lock, or any source field. It can still add `raw_pages`, `extraction_logs` and rejection-log rows, and stored HTML, which only admin diagnostics read; scheduling, the health score and failure counting do not.
- **Lock order, counting and shutdown:** confirmed, as was the CI test-count difference. CI's 9 skips are the 4 opt-in saved-page deadline tests plus 5 tests that need the git-ignored `raw-html` pages, present only on the agent's machine: 415 + 9 = 420 + 4.
- **End-to-end comparison:** a new comparison runs the real scheduler path, orchestrator, crawler and save on the saved pages, `main` against the branch. It showed the same source rows, `crawl_logs` rows, stored jobs and no lock left, for all 12 sources. It covers successful crawls only.
- **In-memory mutations:** of 20, 13 were caught and 7 survived (the reviewer's summary said 14 and 6; its results file shows 13 and 7). Five of the survivors were real guards with no test of their own: the takeover's expiry re-check, the finish deleting only its own lock, counting only a lock that had an owning run, identifying the owner by `ran_at = locked_at`, and recovery continuing past one source's error. Tests for each were added, and each now fails with its guard removed in memory. The shutdown test now checks the outcome before Python's teardown; a test now runs the real scheduler and recovery loops through `start()` and `stop()`, and another the `/run` route's three responses. The other two survivors stay as they are: the shield around a finish, which matters only on a second cancellation, and a defensive re-check in orphan marking that guards no race the reviewer could find.
- **Nits not acted on:**
  - `interrupted` runs, including manual runs that found no slot, lower the health score, as `running` rows already did on `main`.
  - The `dateparser` lock can make the event loop wait for a parse running in a save thread: at most one parse, about 1–2 seconds only the first time in a cold process.
- **Before the merge:** recovery acts on production's leftovers on its first round, as designed (C3). The read-only check for leftover locks and running rows is run just before the merge, so the user sees what it would touch.

**Live record, 28 October 2026.**
- **Before the merge** (read-only, enforced and confirmed; 10:01 UTC and again at 11:49 UTC, just before merging): no crawl lock and no run marked `running`, so recovery's first round would change nothing. No crawl was due for about 28 hours.
- **Merged** with the user's approval at 17:21 IST as `f4059f0`, locked to the reviewed head `7289895`.
  - CI on `main` passed: backend 415 passed (9 skipped, as before), the 47 PostgreSQL ownership tests on Python 3.11.9 and PostgreSQL 17.6, frontend 133, and the secret scan.
  - Render: "Deploy live for f4059f0" at 17:23 IST through Auto-Deploy (Verified, Render events). The new instance started its scheduler at 17:23:04 ("No due sources found"). The old instance logged "Application shutdown complete" at 17:23:11. No error lines and no failed health check.
- **After the deploy** (read-only): no lock and no running run. Recovery's first round found nothing to act on; the health check and the database status answer.
- **First crawl under the new code:** ICRC, run by the user from the admin at 18:45:54 IST (Verified, database and Render log).
  - It ended `ok` in 127 seconds, against 141 on 27 October: 34 found, 0 inserted, 1 updated; 14 admitted jobs saved at 18:48:01.
  - Lock released, no run left `running`, source `ok` with 0 failures, next scheduled run 31 October.
  - No error line, and no failed health check or replaced instance in Render's events.
  - Not read: the individual health-check lines during the crawl, because Render's log viewer showed only its newest 50 lines. Health checks from 18:50 onwards were every 5 seconds, all `200`.
- **The free plan's sleep:** between the deploy and the crawl, the free plan put the backend to sleep. The admin visit woke a new instance, as expected on the free plan.
- **Render start command**, a separate decision (C8):
  - The agent read it without changing anything: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
  - uvicorn 0.32.0, the version `requirements.txt` pins, has `--timeout-graceful-shutdown` (read from its source).
  - The user changed it at 19:03 IST to `uvicorn main:app --host 0.0.0.0 --port $PORT --timeout-graceful-shutdown 5`.
  - Render redeployed `f4059f0` ("Start command updated"). The new instance logged that command at 19:03:25, and the old one "Application shutdown complete" at 19:03:48. Auto-Deploy is still "On Commit"; the health check answers.
  - Open web requests now get at most 5 seconds at shutdown, so the crawler's 20-second shutdown fits inside Render's 30.
- **Branch `feat/crawl-ownership`:** deleted on 28 October 2026 with the user's approval, after all its commits were confirmed in `main` (Verified, `git merge-base` and the PR timeline). The same day, with the user's approval, the 12 other branches of the merged PRs #49–#59 and #61 were deleted, among them `docs/ux-31-done` and `docs/security-plan`, after each was confirmed to have no commit outside `main`. Only `main` and `demo/ux-design` remain. Every merged PR keeps its diff and a "Restore branch" button. The deletion triggered no CI run and no deploy (Verified). The approved deletion command ran twice: the first run deleted the 12 branches in one push at 20:02:49 IST, by the `AidJobs` account (PR timelines), and the second found nothing to delete and changed nothing (Verified). The deleted branch's commits are in `main` through the merge commit:
  - `cfe981dc6f7a5c97f997733038363b4cf91c69f5`
  - `31d1b7a4e70f4a8822527373d27e89a2cb809d9b`
  - `abf19d06cbb6c76488e12355b08c8a055f06b1af`
  - `b8d85f64372e0f695d2851c159cc718fdd27ba07`
  - `212bfe386943deb4fc7e494f968ed1332e45d65a`
  - `72898958230a8862fae27adf2816bd90f4a7acf9`
- **Still to watch** (read-only, no crawl triggered): the scheduled crawls, ICRC on 31 October at 03:59 UTC, Oxfam on 31 October at 13:21 UTC, and UNICEF on 1 November at 05:36 UTC.

### Stage 3. Backend error handling and logging

Design first, for the user's approval, then implementation. The design gives:

- The shared error contract: fixed, safe messages; appropriate HTTP status codes; a request ID on every response that matches the server log line; consistent handling of expected and unexpected failures.
- The verified and classified inventory of unsafe patterns (above), false positives named.
- A redaction filter on the logging system for connection strings, password parameters, bearer tokens, and key shapes, applied to every logger.
- A regression test that fails if exception text is put into a response again.
- How [PR #50](https://github.com/AidJobs/AidJobs/pull/50) fits. PR #50 gives generic messages on the four public endpoints and masks the database-status log line. Merged with the user's approval on 27 October 2026 as `614f12e`, after its branch was brought up to date with `main` (`7cd16ba`, CI green); deployed and live-checked (ledger, "Last verified"). If its pattern needs replacing, the design proposes the replacement.

#### Stage 3 design

**Approved by the user on 28 October 2026.** Implementation is not approved: each phase comes to the user as its own proposal.

How it was written: from a read-only investigation of `main` at `71939ce`, then reviewed by a separate read-only agent working in an isolated clone with fake values only. The review's verdict on the first draft was "request changes". Every finding was checked against the code and folded in. One of the reviewer's claims was corrected: the Google geocoding key is latent, not reachable.

**0. Scope**

- **Goal:** internal errors, database details, credentials and implementation details never reach an API response or a log line, while operators keep what they need to diagnose a failure.
- **In scope:** the backend: its responses, its logging, and the error text it stores in the database and returns on admin pages.
- **Out of scope:**
  - Next.js proxies (stage 4);
  - tooling against printing secrets (stage 5);
  - database roles (stage 6);
  - readiness check and the public database status (stage 7);
  - removing dead modules;
  - any rewrite.

**A. Verified findings**

Method: an `ast` scan of every backend module for exception text reaching a response, an assignment returned later, or a log call; a text search; and classification by hand by reachability. The reviewer re-derived it independently, which produced the corrections below.

**Public routes.** There are 12, matching the stage 1 allowlist.
- **One real leak, with a different cause from the first draft:** `GET /api/search/facets`.
  - Where: `app/db_config.py:124` reads `parsed.port` outside any `try`. If `SUPABASE_DB_URL`'s password contains an unencoded `/`, `?` or `#`, that line raises `Port could not be cast to integer value as '<start of the password>'`.
  - How it reaches the response: `search.py:942` calls `get_connection_params()` outside the `try`, and `get_facets` (`search.py:1082`) puts `str(e)` into the public response.
  - Reviewer's demonstration, with fake values: the response contained the fake password's first segment.
  - Ordinary connection failures never reach line 1082. `_get_database_facets` catches them and `print`s them (`search.py:1022`).
  - Exposure: only while the URL is malformed, for example during a password rotation like 26 October's. It needs no credentials.
- **The same configuration error also reaches:**
  - `/api/search/query` and `/api/jobs/{id}`: the global middleware returns a generic 500 but logs the text (`main.py:103`);
  - `db_config.py:116`, which logs it.
- **`/api/healthz`'s `except` cannot run** (false positive).
- **Checked safe:**
  - the four PR #50 endpoints;
  - capabilities;
  - login, logout and session: no password is echoed or logged;
  - 422 responses: FastAPI echoes only what the caller sent;
  - 429 responses: slowapi's fixed message.
- **Nit:** the login returns a fixed "COOKIE_SECRET not configured" message, which reveals configuration state.

**Admin routes (session-protected, mounted in production): about 64 places.**
- **`app/crawler_admin.py`, 21:** 20 `HTTPException(500, detail=f"...{str(e)}")`, and `errors.append(...)` in `/backfill-quality-scores`. Also, link-validation results (`core/link_validator.py:160`, `'Validation error: {error_msg}'` for any exception) are returned directly by `/validate` and `/validate-job` (`crawler_admin.py:1122`, `:1218`).
- **`app/job_management.py`, 18:** 6 `HTTPException`s (including the two in `/delete-bulk`), 2 returned diagnose dictionaries, and 10 entries inside `GET /diagnose/{job_id}`.
- **`app/sources.py`:**
  - 9 `detail=str(e)` sites (145, 179, 219, 346, 452, 533, 611, 867, 963);
  - `/test` and `/simulate_extract` return fetch and parse error text;
  - two places catch their own 4xx and re-wrap it (903, 689).
  - Safe: `_policy_head` (631) returns only our own fixed fetch messages.
- **`app/search.py` via the `main.py` admin routes, 3;** `app/presets.py`, 2; `main.py` admin search init, 1.
- **Internal-key routes:** `app/pipeline_api.py`, 2.

**Not reachable in production: 10.**
- `app/data_quality_logs.py` 3: it imports the missing `app.db`, and `main.py:179` skips the router.
- `app/shortlist.py` 2: unmounted.
- `enrichment*` 3: no callers.
- `pipeline/db_insert.py` 3 and `pre_upsert_validator` 1: the extractor is never built with storage.

**Stored, then returned by admin routes.**
- **Crawl failure messages:** `str(e)[:500]` in the three crawlers and `orchestrator.py:447` and `817`, stored in `crawl_logs.message` and `sources.last_crawl_message`.
- **Failed-insert errors:** `simple_crawler.py:1600`, stored in `failed_inserts.error` and returned by `GET /api/admin/observability/failed-inserts`.
- **Link-validation errors:** stored in `link_validations`.

**Logging**
- About 276 log calls in about 50 application files carry exception text, about 61 with tracebacks.
- **What can carry secret material** (reviewer's demonstration with psycopg2 2.9 and libpq, fake values):
  - DSN-parse errors quote the password or part of it:
    - `invalid dsn: invalid percent-encoded token: "<password>"`;
    - `invalid dsn: missing "=" after "<password>"`;
    - `invalid integer value "<fragment>" for connection option "port"`;
    - and Python's `Port could not be cast to integer value as '<fragment>'`.
  - Connection-refused errors name the host and port only.
  - Paths that log these: `db_config.py:116`; `main.py:63` (scheduler start-up); `main.py:103` (middleware); every connection helper.
- **Latent, not live: the Google geocoding key** goes in a URL query parameter (`core/geocoder.py:173`). httpx logs every request URL at INFO, and its errors quote the URL. The only caller passes `use_google=False` and Google is never a fallback (verified), so no request carries it today.
- **`search.py:1022` uses `print`,** which bypasses logging.
- **Log calls that happen at import time,** before `logging.basicConfig` (`main.py:29`), go through Python's `lastResort`, unformatted.
- **uvicorn:** `uvicorn` and `uvicorn.access` have their own handlers and don't propagate; **`uvicorn.error` has none** and propagates to `uvicorn`. This was read in the installed uvicorn 0.54; production pins 0.32.0, to be checked in CI.
- **Redaction that already exists:**
  - PR #50's `_redacted()` (`search.py`), with markers `<redacted-url>` and `<redacted>`, asserted by `test_production_mode.py:175`;
  - `simple_crawler.py:106` `_TOKEN_LIKE`;
  - `_logged_headers` (an allow-list);
  - `core/secrets.mask_secrets`.
- **Checked safe:**
  - no credential in an incoming query string (session as cookie or header, internal key as header, password in the body), so uvicorn's access log is safe;
  - no code logs request bodies, headers or a DSN directly;
  - `db_config.py:51` masks the password.

**Frontend**
- **Status codes:** 401 (to login, in about 40 places) and 404 (job inspector) are relied on.
- **Proxies:** they keep `errorData.detail || errorData.error` as a string.
- **Error-text checks:** `admin/sources/page.tsx:1954` checks a stored crawl message for `relation "robots_cache" does not exist`. Redaction does not touch that wording, so nothing breaks, but the frontend does read some error text.
- **Existing ID:** `search_query` already returns its own `request_id` (a fresh uuid4, `search.py:433`, `:538`).

**B. Error-response contract**

1. **Request ID.**
   - What it is: pure ASGI middleware, added last so it wraps everything, including CORS preflight and 429 responses.
   - How it works:
     - it generates a random ID per request and never trusts an inbound one;
     - it keeps the ID in a context variable;
     - it returns it as `X-Request-ID` on every response, with `expose_headers` so browser code can read it;
     - `search_query`'s existing `request_id` reuses the same ID.
   - **Background work:** a task started inside a request, such as the manual crawl from `/run`, inherits the context. Crawl tasks set their own logging context to the crawl run's ID, so a 2-minute crawl is not filed under the click's request. `asyncio.to_thread` carries the context into threads; `run_in_executor` does not (only dead code uses it).
2. **Unexpected failures (5xx).** One exception class, `InternalError(message, cause)`, with its own registered handler. The body is `{"detail": "<fixed message> (ref <short id>)", "request_id": "<id>"}`, with the same status code as today.
   - `detail` stays a string, so every proxy and page keeps working and shows the reference today, before stage 4.
   - The handler logs the cause through the safe path (C).
   - Routes with their own shapes, such as the public status, parse, autocomplete and facets, keep their keys, with a fixed string and `request_id`.
   - The global middleware's generic 500 gains `request_id`.
3. **Expected failures (4xx)** keep their status codes and wording: 400, 401, 403, 404, 409, 429. Our own messages are allowed; third-party exception text is not. FastAPI's 422 detail is the stated exception: it echoes only the caller's own input.
   - `InternalError` is never used for a 4xx, and the conversions let an `HTTPException` pass through unchanged. This fixes `sources.py` 689 and 903.
4. **Admin diagnostic tools keep useful detail, in our own words.** `/test`, `/simulate_extract` and link validation exist to say why an external URL failed, and the UI shows that message (`page.tsx:1675`). They map failures to categories and messages we write: DNS failure, connection refused, timeout, HTTP <status>, TLS error, invalid JSON at line and column. Never a raw exception string, and never a generic "failed".
5. **Operators:** the admin sees the message and the reference. The full, redacted detail is in Render's log under the request ID.

**C. Logging: prevention first, redaction as the safety net**

1. **Prevention, all in Phase 1 because it carries the live risks:**
   - `db_config.get_connection_params()` never raises with text. It catches the port and parse error, logs only the exception type and "SUPABASE_DB_URL could not be parsed", and returns `None`, which every caller already handles as "not configured".
   - The scheduler start-up log (`main.py:63`) and the middleware (`main.py:103`) log through the safe path.
   - `search.py:1022`'s `print` becomes a logger call.
   - The `httpx` logger is set to WARNING, so request URLs are no longer logged at INFO.
   - The connection helpers' messages and the crawl and stored messages follow in Phase 3.
2. **Redaction of the final string, never the record.** A wrapper around each handler's formatter redacts the formatted output, which covers argument substitution, `logger.exception`, tracebacks and stack text.
   - Rewriting `record.msg` or `args` is ruled out: it crashes uvicorn's `AccessFormatter` (demonstrated by the reviewer).
   - It is installed at the very top of `main.py`, before the app imports, together with `basicConfig`, so import-time logging is covered. Python's `lastResort` handler is covered too.
   - It wraps the handlers of the root, `uvicorn` and `uvicorn.access` loggers.
   - The rules:
     - **Exact values:**
       - Which: the values of secret environment variables, read once after `load_dotenv`. That means the database URLs and the password inside them, in decoded and URL-encoded forms, plus the admin password, session secrets, the internal API key, and any `*_KEY`, `*_SECRET`, `*_TOKEN` or `*_PASSWORD` variable.
       - Which not: values shorter than 12 characters, empty values, and boolean-like values, to avoid wiping ordinary words.
       - Safety: the values are never logged. Their names may be.
     - **Patterns:**
       - user information in URLs;
       - `password=` and `pwd=`;
       - `Bearer` tokens;
       - URL query parameters `key`, `api_key`, `apikey`, `token`, `access_token`, `secret`, `password`, `sig` and `signature`;
       - the DSN-error shapes above (`invalid dsn: …`, `invalid integer value "…" for connection option`, `Port could not be cast to integer value as '…'`);
       - common key shapes.
   - **Markers:** PR #50's `<redacted-url>` and `<redacted>` are kept, so its test stays unchanged, and its helper moves into the shared module.
3. **Stored messages:** redacted **before** truncation (today `str(e)[:500]` truncates first). Applies to crawl messages, `failed_inserts.error` and link-validation errors (Phase 3).
4. **Not redacted:** host names in normal operation logs. They're infrastructure detail in Render's private log; masking them would be a separate decision.

**D. Tests**

1. **Static guard.** A committed test, based on the scan's method, fails if production-reachable code puts exception text into a response. The scan's taint-following also covers assignments returned later. It starts with an allowlist of the reviewed findings that the phases convert; the allowlist shrinks to zero. The unreachable modules are named explicitly, so mounting one fails the test until it is converted.
2. **Runtime leak tests.** Each runs in a fresh process built as production builds it, with fake values only and no network.
   - **Facets and the configuration error:** `SUPABASE_DB_URL` gets a malformed fake password, the actual cause. The test must fail on `main`'s code, and that failure is shown in the PR.
   - **Database failures:**
     - make `psycopg2.connect` raise with fake DSN-shaped text;
     - expect each public endpoint's documented outcome: 200 with degraded results for search query and the single job, the fixed `error` for facets and status;
     - and a parametrised walk over every admin route with a test session, expecting the fixed message.
   - **Every response:**
     - no fake password, fragment, host or URL in the body or headers;
     - `request_id` in the body (where present) equal to `X-Request-ID`;
     - the wrapped handler's actual output carries the ID with the secrets redacted.
3. **Redaction unit tests:**
   - each rule;
   - the demonstrated psycopg2 strings, with fake values;
   - tracebacks, `%` arguments, `logger.exception`;
   - uvicorn's access formatter;
   - import-time logging;
   - the minimum-length rule;
   - and that no secret value appears in the redactor's own output.
4. **Fixtures that look like keys are assembled at runtime,** as PR #50 does, so the gitleaks job doesn't flag them.
5. **The new test files are added to `ci.yml`'s explicit Ruff and pytest lists.** The existing tests stay unchanged and green: the public-surface allowlist, `test_production_mode.py`, the stage 2 PostgreSQL tests, and the full CI list. The behaviour of the pinned versions (uvicorn 0.32, FastAPI 0.115, Python 3.11) is checked in CI, not only locally.

**E. How PR #50 fits**

- **Kept:** its fixed public messages and its markers.
- **Moved:** its `_redacted()` helper becomes part of the shared redactor.
- **Added:** facets and the configuration error are covered.
- **Not duplicated:** nothing PR #50 protects is changed.

**F. Compatibility and the stage 4 boundary**

- Status codes and response keys stay the same, and `detail` stays a string.
- Admin pages will show "Failed to … (ref 3f9a…)" instead of the driver's text. The diagnostic tools show categories in our own words.
- Stage 4 keeps the proxies' own text and Node's error messages, and forwarding of `X-Request-ID`. Stage 3's fixed messages also remove backend text from what the proxies write to Vercel's log.

**G. Phases**

**Phase 1: the live risks and the foundations.** One pull request.
- Deliverables:
  - the `db_config` fix and the facets fixed message;
  - prevention for `main.py:63` and `:103`, `search.py:1022` and the `httpx` logger level;
  - the redacting formatter, installed first;
  - the request-ID middleware and `InternalError` handler;
  - `request_id` on public errors;
  - PR #50's helper moved;
  - tests D2 (public part and configuration error), D3 and D4, and the static guard D1 with its starting allowlist.
- **Proof the tests work:** before the fix, the facets test is shown failing on `main`'s code.

**Phase 2: admin responses.** One pull request per group:
- `crawler_admin.py`, including link validation;
- `sources.py` and `presets.py`, including the diagnostic categories;
- `job_management.py` (since 30 October 2026, also removing the duplicate inclusion of its router);
- the admin parts of `main.py` and `search.py`;
- `pipeline_api.py`;
- added 30 October 2026: one small extra pull request for the constant-time key comparison, the guard before body parsing on admin routes, and the removal of `app/shortlist.py` (stage 3A, "Assigned the same day").

Each converts its findings, shrinks the allowlist, and extends the admin-route walk.

**Phase 3: stored messages and the remaining log paths.**
- What changes:
  - crawl messages, `failed_inserts.error` and link-validation errors are redacted before truncation;
  - the connection helpers log through the safe path;
  - the allowlist is empty.
- Proof nothing else changed: the offline whole-crawl and end-to-end comparisons on the saved pages (never production crawls) show identical saved jobs, statuses and messages, apart from redaction.

**For every phase:**
- CI, including the stage 2 PostgreSQL tests;
- an independent review;
- a read-only live check after merge, which provokes no failure in production. A normal request and a 404 such as `GET /api/jobs/<random UUID>` show `X-Request-ID`, and Render's log shows the same ID.

**H. Acceptance criteria**

- **Phase 1:**
  - the facets and configuration-error tests fail on `main`'s code and pass after;
  - no response from a public route contains the fake secret material;
  - every response has `X-Request-ID`;
  - redaction is proven on every handler (root, `uvicorn`, `uvicorn.access`) and for import-time logging;
  - `httpx` no longer logs request URLs;
  - the public-surface and PR #50 tests are unchanged and green.
- **Phase 2:** the allowlist holds no admin route; the admin-route walk passes; the 401 and 404 behaviour is unchanged; the diagnostic tools still name the cause category.
- **Phase 3:**
  - the allowlist is empty;
  - stored messages are redacted before truncation, which a test proves;
  - the offline comparisons are identical apart from redaction.
- **In every phase:** the protected files are untouched, and no production data, setting or crawl is touched.

**I. Remaining assumptions and risks**

1. **uvicorn 0.32 and FastAPI 0.115 logging and handler behaviour.** Read in newer local versions. CI checks the pinned ones.
2. **Searching Render's log by request ID.** Expected to work through the log viewer's text search; checked on the first live request after Phase 1.
3. **Redaction cannot catch a secret in an unforeseen format.** That's why prevention comes first and known secrets are matched exactly.
4. **Whether production sets `GOOGLE_GEOCODING_API_KEY`.** Not verified, and not needed: no code path sends it today, and Phase 1 removes the logging route.
5. **Cost:** negligible. One context variable, and one string pass per log line.

#### Stage 3, phase 1: implementation record

Implementation approved by the user on 28 October 2026, including the 503 for a malformed database URL. Built on the branch `security/stage3-phase1` from `main` at `432b62b`.

Decisions made while building, each within the approved design or noted against it:
- **Request IDs for existing bodies are only in the header** (a deviation from B2). PR #50's tests and the W-22 test compare whole bodies: the generic 500 and the public status, parse and autocomplete answers. So those bodies stay byte-identical and their request ID is only in `X-Request-ID`. The `request_id` body field is used only by `InternalError` responses, which phase 2 uses for admin routes.
- **A malformed `SUPABASE_DB_URL` is treated as "not configured".** The status changes happen only in that case; with an unset, or well-formed but unreachable, URL nothing changes (Verified by the reviewer over all 34 GET routes):
  - `/api/search/query` 500 → 200 with empty results;
  - `/api/jobs/{id}` 500 → 404;
  - `/api/admin/sources`, `/api/admin/sources/{id}` and `/api/admin/organisations` 500 → 503 "Database not configured" (approved).
  
  `/api/db/status` keeps PR #50's "Database unavailable". The public and admin list statuses are pinned by `test_public_error_leaks.py`. The diagnostic is in the logs only: a warning at startup and an error on every request that needs the database, both "SUPABASE_DB_URL could not be parsed (ValueError)".
- **Tracebacks are now logged in every environment** through `log_failure`, redacted on output. Before, the middleware logged them only in development.
- **Redaction's URL patterns are bounded:** the scheme to 32 characters, and the user-and-password runs to 256. Unbounded, they were quadratic inside every log call:
  - 16 KB of dotted text took 9 seconds;
  - 64 KB of repeated `x://` took 20 seconds.
  
  PR #50's original pattern had the scheme flaw on one log line. A timing test covers four shapes at 64 KB; each takes under 0.4 seconds locally.
- **Crawl tasks log under `run-<id>`,** set in `execute_run`, which always runs in its own task.

Evidence, 28 October 2026 (local, Python 3.14; CI checks Python 3.11 with the pinned versions):
- **On `main`'s code, with a fake malformed database URL:**
  - the public facets response quoted the password fragment (`Port could not be cast to integer value as '<fragment>'`), and 8 or 9 log lines did too, depending on the environment;
  - search and the single job answered 500.
- **The new tests on `main`'s code:**
  - both leak tests fail on the leak itself ("responses quoting the database password: `['/api/search/facets']`");
  - the request-ID test fails on the missing header;
  - the static guard flags `search.py::get_facets`.
- **On the branch:**
  - 456 passed in the CI list, with the same 4 skips as before;
  - 47 PostgreSQL tests passed;
  - Ruff is clean, and the edited files have no new Pyflakes finding;
  - the offline end-to-end crawl comparison against `main` is identical for all 12 sources.
- **Real uvicorn on 127.0.0.1, with fake settings:**
  - every response carries `X-Request-ID`, and access-log lines carry the same ID;
  - a malformed URL is logged as "could not be parsed (ValueError)";
  - the fake fragment appears nowhere.
- **Independent review** (separate agent, isolated clone, fake values; verdict: approve with changes).
  - **First pass:** 27 of 33 mutations caught, run on copies. The 6 survivors were three redaction rules, the import order, and raw logging in the middleware and in `db_config`.
  - **Fixed:**
    - the quadratic patterns;
    - leak tests that failed on `main` only for the missing header;
    - a URL-credential test that passed for the wrong reason, and untested rules;
    - no proof of the import-time order;
    - prevention tested only through the safety net (now tested on the logged message itself, including through `main.py`'s middleware);
    - a static guard that missed helper functions (it now flags the old facets leak);
    - the malformed-URL database status message.
  - **Re-review of the fixes:** 11 of 12 mutations caught, plus a remaining quadratic shape (`x://` repeated). Both were then fixed. All 6 first-pass survivors now fail their tests.
  - **Pre-merge verification, 29 October 2026:** the admin 503 had no test. One was added for `/api/admin/sources` and `/api/admin/organisations`, and it fails on `main`'s code on the leaked fragment.
- **Accepted, not changed:**
  - harmless false positives in logs only (`?key=` in job URLs, long `sk-` slugs);
  - Python's own `--- Logging error ---` dump, `warnings`, and thread excepthooks bypass the formatters;
  - responses from Starlette's and uvicorn's own last-resort error paths carry no `X-Request-ID`;
  - with a malformed URL, facets answer with empty results rather than `enabled: false`.

#### Stage 3, phase 1: live record

Merge approved by the user on 29 October 2026 (India time), at the reviewed head `e582aea`. Every check below was read-only; no error was provoked in production.

- **Before the merge:**
  - PR head exactly `e582aea`; all 8 checks green. GitHub marks no check as "required" on this repository, so all 8 were treated as required. Mergeable and clean.
  - Read-only database check (session read-only, `transaction_read_only` on): no crawl lock held, no run marked running. Next scheduled crawl: ICRC on 31 October at 03:59 UTC.
  - The live backend sent no `X-Request-ID`, the baseline for proving the new code went live.
- **Merge:** `gh pr merge 63 --merge --match-head-commit e582aea…`, merged as `2de9d53` at 21:11 UTC on 28 October 2026. The branch `security/stage3-phase1` is kept, as the user asked.
- **CI on `main` (`2de9d53`):** passed. Python 3.11.9: 451 passed and 9 skipped; PostgreSQL 17.6 crawl-ownership tests: 47 passed; frontend: 133 tests passed.
- **Deployments:**
  - Render: "Deploy live for 2de9d53", started by Auto-Deploy. The new code answered by 21:13 UTC (read from Render's events and from the `X-Request-ID` header, which only the new code sends).
  - Vercel: production deployment for `2de9d53` completed at 21:11:46 UTC; the public site answers 200.
- **Checks on the live backend, 21:13 UTC:**

  | Request | Status | Result |
  | --- | --- | --- |
  | `GET /api/healthz` | 200 | `X-Request-ID` present (32 hex characters) |
  | `GET /api/jobs/<random UUID>` | 404 | "Job not found", `X-Request-ID` present |
  | `GET /api/db/status` | 200 | `ok: true`; 405 jobs, 282 active, 3 sources |
  | `GET /api/search/query?q=officer` | 200 | 20 of 38 results, from the database; the body's `request_id` equals the header |
  | `GET /api/search/query` | 200 | 20 of 282 results, from the database |
  | `GET /api/admin/session`, no cookie | 200 | `{"authenticated": false}`, `X-Request-ID` present |

  Search comes from the database because Meilisearch was removed on 23 October (ledger). No response contained a credential pattern.
- **Render's log, searched by request ID** (the design's assumption I2, now confirmed):
  - the health check's ID: its access-log line;
  - the 404's ID: its access-log line and the existing `db_config` "Database connection params" line (host, port, database and user name; no password).
  
  Neither carries a credential pattern.
- **Credential search over the last hour of logs:** `postgresql://` appears on one line only: the start-up line, now `postgresql://<redacted>@<pooler host>:5432/postgres`. The redaction replaced the masked `user:***` part, so the user name is hidden there too. A wider search for the word "password" was not run, because it would have loaded any matching log text into the agent's context.
- **Admin sign-in and Sources page, 29 October 2026 (India time):**
  - The user signed in at 15:45:43 IST. Render's log shows the login request under one ID with three lines: "Login attempt", "Login successful" and the access line `POST /api/admin/login` 200. None contains a password or other credential pattern.
  - The agent opened Sources in the user's signed-in tab, with the read-only browser guard installed and tested first (a dummy POST was blocked). It went through the sidebar, used no control, and reloaded the tab afterwards to remove the guard. The guard blocked only the test POST and Vercel's page-view analytics ping.
  - The page's `GET /api/admin/sources?page=1&size=20&status=active` returned 200. Render's log has it at 15:51:43 IST under `a6cefde3…`, on two lines: the access line and the `db_config` connection-parameters line (no password). Neither carries a credential pattern.
  - The browser never received `X-Request-ID` for this call: the site's server-side proxy does not forward it yet (stage 4). The ID was found in Render's log by path and time.
- **Tidy-up after the merge, with the user's approval:**
  - the branch `docs/stage3-design` (PR #62) was deleted on 29 October 2026, after checking it had no commit outside `main`;
  - issue #5 was closed as completed (crawler plan, "Parked decision");
  - the agent's local review clones, worktree and review database were removed.

#### Stage 3, phase 2, PR 1: implementation record

Plan approved by the user on 29 October 2026 (India time), with PR 1 only authorised: the 13 functions in `app/sources.py` and `app/presets.py`, plus the two phase 1 follow-ups. PRs 2 to 5 stay separate and each needs its own approval. Built on the branch `security/stage3-phase2-sources` from `main` at `a8bf743`.

Files changed, as authorised: `app/sources.py`, `app/presets.py`, `app/db_config.py` (follow-ups only), the tests, and `ci.yml`'s test lists. No crawler, frontend or other module changed.

What changes:
- **Unexpected failures (500)** in the 11 data routes and both preset routes raise `InternalError`: `{"detail": "Failed to list sources (ref 3f9a12bc)", "request_id": "<id>"}`, with the same status. The cause is logged through `log_failure`, redacted, under the request ID.
- **Expected answers are unchanged:** the 400, 404, 409 and 503 answers keep their status and wording, with one approved exception. `import_source` no longer re-wraps its own 400, so a schema other than v1 now answers "API sources must use v1 schema (v=1)" instead of "Invalid parser_hint: 400: API sources must use v1 schema (v=1)". Its other parser failure no longer quotes the exception.
- **The source test and the extraction simulation** keep their response shapes (200, `ok: false`, `error`, and the simulation's `error_category`). The error text is chosen by the exception's type in `describe_failure`:
  - outbound-fetch errors repeat their fixed messages only if they are on a known list (`fetch_message`);
  - an HTTP error becomes "The source answered HTTP <status>";
  - invalid JSON becomes "Invalid JSON at line X, column Y";
  - a timeout, connection failure or redirect loop gets a fixed phrase;
  - anything else becomes "Unexpected error (ref <id>)".
  
  The crawler's fetch functions catch their own network errors and return nothing, so for the API test and the simulation a network failure arrives as "nothing came back". The categories are limited to what reaches `sources.py`.
- **The two phase 1 follow-ups:**
  - The malformed-URL log lines add: "Check the port, and percent-encode special characters in the password (/ as %2F)".
  - The admin routes answer 503 "Database settings could not be read" when `SUPABASE_DB_URL` is set but cannot be read, and keep 503 "Database not configured" when it is absent.
- **A password with an unencoded `/`, `?` or `#` is now unreadable** (found by the independent review). urllib could read the start of such a password as an empty or numeric port, so the URL looked valid. The rest of the password then reached two existing INFO lines as the "database" name. `db_config._parse_url` refuses an `@` in the path or fragment, or in the query when no `=` comes before it. A query value such as `application_name=a@b` stays readable.
- **The database name is no longer logged.** The start-up line and the connection-parameters line in `db_config.py` now carry scheme, user, host and port only. In a URL without `@`, a password's tail cannot be told apart from a database name, so no parsing rule could cover it. Supabase's database is always `postgres`, so operators lose nothing. Added with the user's approval after the reviews.
- **A failure in a route about one source logs the source ID** under the request ID (`_source_error`), so the log names the source again; the admin's message stays fixed text. Added with the user's approval after the reviews. The ID is logged with `%r`, so a path parameter carrying an encoded line break cannot forge a log line.
- **A user name containing `@` is unreadable too:** it means the `:` before the password is missing, and the password would be logged as the user.
- **The static guard** trusts two reviewed functions, `describe_failure` and `fetch_message`, but only as direct calls with the exception as their one argument. A test checks that each is defined once, in `app/sources.py`, and bound nowhere else. The allowlist loses the 13 converted functions and the reviewed `_policy_head`, which now uses `fetch_message`.
- **Known bug, not fixed here (ledger W-33):** the source test of a v1 API source calls `fetch_api` with a signature it does not have. It now fails safely with "Unexpected error (ref …)" and logs the `TypeError`.

Evidence, 29 October 2026 (local, Python 3.14; CI checks Python 3.11 with the pinned versions):
- **New tests:**
  - `test_admin_sources_errors.py`: a fresh-process walk of all 13 routes with a failing fake driver and preset list; references leading to the logged cause; the 503 wording for set-but-unreadable and absent URLs; categories by type; the URL shapes; the import 400.
  - `test_admin_sources_contract.py`: 401 without a session on all 13 routes; the existing 400, 404 and 409 answers; the success shapes.
  
  No test uses a network or a real database.
- **On `main`'s code:**
  - The security tests fail on the behaviour they target. The walk fails on "responses quoting the fake database password", on every route. The source test shows `SimpleAPICrawler.fetch_api() got an unexpected keyword argument …`. The simulation shows the raw text, and the import gives the re-wrapped 400.
  - The `describe_failure` unit tests fail because the function does not exist.
  - All 23 contract tests pass, on `main` and on the branch.
- **On the branch:**
  - CI list: 518 passed, with the same 4 skips as before. PostgreSQL ownership tests: 47 passed. Ruff is clean on CI's list.
  - The three changed modules have no new Ruff finding; `sources.py` drops from 22 to 16, `db_config.py` from 7 to 5.
  - Offline crawl comparison against `main` on the 12 saved sources: identical. No crawl-path module imports a changed file.
- **Independent review** (separate agent, isolated clone with no remote, fake values; the repository's fingerprint was unchanged afterwards):
  - **First pass:** approve with changes; 19 of 21 mutations caught. Fixed: the unencoded-separator URLs above; an untested log line on the source test's known-bug branch; a guard that trusted any call with a describer's name; `_policy_head` repeating fetch text without the list; a possibly empty reference; a reference test that could pass with nothing checked.
  - **Re-review of the fixes:** approve; 5 of 6 mutations caught. The survivor, the empty-reference fallback, now has a test. Two of its notes were fixed: `@` in a query value is accepted again, and the guard also fails on a describer name bound by assignment or import.
- **After the reviews, with the user's approval:** the two last notes were resolved rather than accepted. The database name is out of the logs, and single-source failures log the source ID. Each new test fails on its mutation: `main`'s logging, and a `_source_error` that does not log.
- **Third review round, of that delta:** approve; both mutations caught. It found two small issues, and both were fixed, each with a test that fails on its mutation:
  - a source ID could forge a log line; it is now logged with `%r`;
  - a URL missing the `:` before the password logged the password as the user.
  
  The same line-break weakness exists in older f-string log lines that print a source ID. The general fix, escaping line breaks in the redacting formatter, belongs to phase 3 (the remaining log paths).
- **Accepted, not changed:** bracketed IPv6 hosts are unreadable, as before; Supabase hosts are names.
- **Left for later, outside this PR:** W-33 and the richer source-test categories, which are one functional decision (ledger W-33); `X-Request-ID` reaching the browser through the proxies (stage 4).

#### Stage 3, phase 2, PR 1: live record

Merge approved by the user on 29 October 2026, at the reviewed head `1f8df7f`. Every check below was read-only; no error was provoked in production, and the Test and Simulate buttons were not used.

- **Before the merge:** head exactly `1f8df7f`; all 8 checks green; mergeable and clean; `main` still `a8bf743`. The read-only database check found no crawl lock and no run marked running. The next scheduled crawl is ICRC, on 31 October at 03:59 UTC.
- **Merge:** `gh pr merge 65 --merge --match-head-commit 1f8df7f…`, merged as `f8bedf9` at 16:41:55 UTC. The branch is kept.
- **CI on `main` (`f8bedf9`):** passed. Backend tests: 513 passed, 9 skipped. PostgreSQL tests: 47 passed. Frontend tests: 133 passed.
- **Deployments:**
  - Render: "Deploy live for f8bedf9" (Auto-Deploy). The new instance started at 16:43:26 UTC.
  - Vercel: the production deployment completed at 16:43:12 UTC, and the public site answers 200.
- **Checks on the live backend, 16:44 UTC, GET only, no session:**
  - health 200;
  - database status `ok: true` (405 jobs, 257 active, 3 sources);
  - search 200, from the database;
  - `/api/admin/session` gives `{"authenticated": false}`;
  - `/api/admin/sources`, `/organisations`, `/sources/<random id>`, `/sources/<random id>/export`, `/presets/sources` and `/presets/sources/ReliefWeb Jobs` all answer 401 "Authentication required".
  
  Every response carried its own 32-character `X-Request-ID`, and none contained a credential pattern. Render's log has the 401 lines under the same IDs.
- **Admin Sources page:**
  - Opened in the user's signed-in tab with the read-only browser guard installed and tested; a dummy POST was blocked.
  - Going to the Dashboard through the sidebar did a full page load, which removed the guard. Only the Dashboard's read requests ran, and no control was used. The guard was reinstalled and tested before Sources was opened through the sidebar.
  - The page listed the 3 sources. Its `GET /api/admin/sources?page=1&size=20&status=active` returned 200. Render's log has that request at 16:46:35 UTC under `3f066fa7…`, on two lines: the access line, and the connection-parameters line, which now carries host, port and user only. Neither line has a credential pattern.
  - The guard blocked only the test POST and Vercel's page-view ping. The tab was reloaded afterwards to remove it.
- **The database name is out of the start-up line, confirmed:** the old instance woke at 16:42:52 UTC and still logged `…:5432/postgres`. The new instance logs `…:5432`.

### Stage 3A. Dependency security

Added on 30 October 2026 after a read-only backlog sweep; placed by the user the same day before stage 3, phase 2, PR 2, because these are known, published vulnerabilities, while stage 3's remaining work removes raw error text. Each part needs its own plan and approval at every step.

**Findings, 30 October 2026 (Verified locally; nothing changed):**
- **Frontend.** The site runs Next.js 14.2.33 with React 18.3.1 (`npm ls`). `npm audit --omit=dev` reports 4 vulnerable packages in production dependencies: 1 critical (`next`) and 3 high (`postcss`, `nanoid`, `source-map-js`). The Next.js advisories include denial of service in Server Components and Server Actions, cache poisoning, cross-site scripting, server-side request forgery, request smuggling in rewrites, a middleware bypass, and remote code execution in the image optimiser and on Windows-hosted servers. Fixed versions exist only in Next.js 15.5.x or later; npm suggests 16.4.3, a major upgrade, which also means React 19. Some advisories apply only to self-hosted Next.js (for example Windows hosting or the self-hosted image optimiser); which apply to AidJobs on Vercel is Not verified.
- **Backend.** `pip-audit` on the versions pinned in `apps/backend/requirements.txt`, which Render installs at each deploy, reports known vulnerabilities with fixes in `requests` 2.32.3 (fixed in 2.32.4 and 2.33.0), `lxml` 5.3.0 (6.1.0, a major version), `python-dotenv` 1.0.0 (1.2.2), `brotli` 1.2.0 (1.2.1), `pdfminer.six` 20231228 (20251230), and `pytest` 8.3.0 (9.0.3; a test tool installed in production). The local environment differs from production (Python 3.14, newer FastAPI), so its own audit result (also `certifi`, `opentelemetry-api`) is not production evidence.
- **Unused or doubtful packages in production requirements** (Repository, import search outside tests and scripts): `scikit-learn`, `jsonpath-ng`, and `pytesseract` are imported nowhere; `meilisearch` (removed service, W-30), `playwright`, `pdfminer.six`, `pdf2image`, `prometheus-client`, and `statsd` are imported by modules whose use on the production path is to be checked.
- **No warning system.** Dependabot alerts are disabled for the repository (GitHub API, HTTP 403), and CI audits no dependencies. Updated the same afternoon: Dependabot alerts are on (the alerts API answers; 114 alerts when switched on; 5 fixed by part 1 (`brotli`, `lxml`, `python-dotenv`, and two for `requests`); 109 open: 61 in runtime dependencies, 52 of them Next.js, and 48 in development tools); the CI audit is still part 3.

**Parts, in order:**
1. **Backend pins.** Raise each vulnerable pin to a fixed version; move test-only packages (`pytest`, `pytest-asyncio`, `pytest-cov`) out of `requirements.txt` if Render does not need them (done in part 1b, into a test-only `requirements-test.txt`, not `requirements-dev.txt`, which holds the classifier-training tools); remove packages proven unused, each with its evidence. `lxml` 6 changes the HTML parser, so the offline whole-crawl comparison on the saved pages must show identical saved jobs, as in stage 3's method. CI, an independent review, and a read-only live check after merge (health, database status, search, admin sign-in with the guard), with the next scheduled crawl watched in Render's log. Two follow-up pull requests, each with its own plan: the test tools (`pytest` and its plugins, into a test-only requirements file, then upgraded), and a FastAPI upgrade, because FastAPI 0.115.0 pins `starlette` 0.38.6 (added 30 October 2026, implementation record below).
2. **Next.js upgrade.** An investigation first: which advisories apply on Vercel, the target version (the latest patched 15.5.x, or 16), what React 19 and the new major version change in this code (request APIs, caching, the cached server-rendered page of UX-10, the admin proxies), and the test plan: the frontend tests, the build, the UX plan's fidelity check against the demo tag on the preview, the admin pages with the read-only guard, and the launch-check phone flows. Then a plan for approval, then the upgrade in its own pull request. Stage 4 (the proxies) follows on the upgraded version.
3. **Continuous checks.** A CI job that runs `npm audit --omit=dev` and `pip-audit` on the pinned requirements and fails on high or critical findings, kept within the GitHub Actions minutes; and the user switches on Dependabot alerts (repository Settings, Code security; free). Dependabot alerts were switched on by the user on 30 October 2026. Amended by the user on 1 November 2026 (step 1 record below): the backend gate audits the installed set and fails on any finding, because `pip-audit` reports no severity; an audit that cannot run fails; the work is split into the gate (step 1), the development tools (step 2), and a backend lockfile with Render's build tools (step 3).

**Assigned the same day: the four stage 1 review findings that had no stage** (open risks, below):
- `verify_internal_api_key` compares with `!=`: a constant-time comparison (`hmac.compare_digest`), in a small extra pull request after stage 3, phase 2, PR 5;
- admin routes parse a request body before the authentication guard runs: the same extra pull request, which makes the guard run first for admin routes and caps body size;
- `app/job_management.py`'s router is included twice: in stage 3, phase 2, PR 3 (`job_management.py`);
- `app/shortlist.py` is unreferenced: removed in the same extra pull request, after confirming no route, import, or frontend call uses it.

#### Stage 3A, part 1: implementation record

Plan approved by the user on 30 October 2026; built the same day in [PR #69](https://github.com/AidJobs/AidJobs/pull/69). The test tools (`pytest`, `pytest-asyncio`, `pytest-cov`) follow in a separate pull request, as planned.

**Changes (`apps/backend/requirements.txt`):**
- `lxml` 5.3.0 to 6.1.3, `requests` 2.32.3 to 2.34.2, `python-dotenv` 1.0.0 to 1.2.4, `brotli` 1.2.0 to 1.2.1 (Dependabot rates its advisory critical).
- Removed, because the running app imports none of them (Repository, import search):
  - `pdfminer.six`, `pdf2image`, `pytesseract`: only `pipeline/pdf_extractor.py`, which nothing imports;
  - `statsd`: only `pipeline/monitoring.py`, which nothing imports;
  - `jsonpath-ng`: imported nowhere;
  - `scikit-learn`: only `tests/test_classifier_training.py` (which CI does not run) and two offline scripts, `scripts/build_classifier.py` and `scripts/retrain-classifier.py`; it stays in `requirements-dev.txt`, whose comment now says so.
  - Removing these also drops what they pulled in (`numpy`, `scipy`, `Pillow`, `joblib`, `threadpoolctl`, `ply`, `cryptography`, `cffi`, `pycparser`), none of which app code imports (independent review).
- Kept:
  - `playwright`: Render's Build Command is `pip install -r requirements.txt && python -m playwright install chromium` (Verified, read by the agent on the Settings page in the user's signed-in browser with a read-only guard, nothing clicked), so removing the package would fail every build. Every build downloads Chromium for `crawler/browser_crawler.py`, which nothing imports. Removing it is a later small step: the user changes the Build Command, then a pull request removes the package.
  - `meilisearch`: still imported by three app files; removed with the old search code (W-18, Gate 10).
  - `prometheus-client`: an optional import, with no known advisory.

**Why `lxml` needed proof.** The UNICEF reader, a live source, parses with `lxml` (`crawler/plugins/base.py`, `get_soup`); every other reader uses Python's `html.parser`. The upgrade does change the parser: the Linux wheels bundle libxml2 2.12.9 in `lxml` 5.3.0 and 2.14.6 in 6.1.3 (read from the wheels' version headers by the independent review), and libxml2 2.14 rewrote its HTML tokenizer to the HTML5 rules, including how character references such as `&amp;` and a bare `&` are read.

**Proof (Verified):**
- `tests/test_unicef_saved_excerpts.py` pins the reader's rows on job cards from saved UNICEF listing pages, verbatim with line endings normalised, inside a minimal wrapper (`tests/fixtures/unicef_listing/`). No email, phone number, or script is in the excerpts. 14 tests:
  - three saved pages (18 and 19 October 2026): six real cards and one repeated card each, plus the real "More Jobs" link;
  - every saved card whose title has an ampersand: 10 cards from four saved pages (6 December 2025, 18 and 19 October 2026), 7 with a bare `&` (for example "Gender& Education") and 3 with `&amp;`. Added after the independent review found that about one title in ten has one, and that none of the first fixtures did.
- Commit 1 (`12dc23c`, tests only): CI installed `lxml-5.3.0-cp311-cp311-manylinux_2_28_x86_64`, the build Render installs today, and the recorded rows matched.
- Commit 2 (`7b75cec`, the pins): CI installed `lxml` 6.1.3 and the same rows matched exactly.
- Commit `8ff6756` (temporary, the ampersand cards with `lxml` set back to 5.3.0): CI installed `lxml` 5.3.0 and the recorded rows matched (backend 527 passed, 9 skipped). Commit `d4a2e14` restores 6.1.3; CI on the head (`27004c9`, which has the same pins and tests) installed `lxml` 6.1.3 and the same rows matched (backend 527 passed, 9 skipped).
- CI on commit 2: backend 526 passed, 9 skipped; PostgreSQL 47 passed; frontend 133 passed.
- Locally (Windows, Python 3.14, the new `lxml`, `requests`, and `python-dotenv`): the CI test list, including the tests that read the saved pages, 531 passed, 4 skipped (before the ampersand test was added; the test file alone now gives 14 passed).
- `pip-audit` on the direct pins: only `pytest` remains (the next pull request). Packages they pull in are not all clean: `starlette` 0.38.6, pinned by FastAPI 0.115.0, has CVE-2024-47874 and CVE-2025-54121, both in multipart form parsing, which the app cannot reach because `python-multipart` is not installed and no route takes form data (independent review). Handled by a FastAPI upgrade, a later step of this stage. Corrected on 31 October 2026: seven advisories affect 0.38.6 (FastAPI upgrade record below).

**Deviation from the plan.** The plan included a local before-and-after run of the readers on all 30 saved pages. The "before" half could not run here: `lxml` 5.3.0 publishes no ready-built package for Python 3.14, compiling it needs build tools this machine does not have, and a Windows build uses a different libxml2 (2.11.9 here) from Render's Linux builds, so it would not be a faithful baseline. The Linux comparison in CI is the faithful one; it covers 28 real UNICEF cards, including every saved title with an ampersand, not every card on every saved page, nor how libxml2 2.14 reads the rest of a full page (head, scripts, comments). To close that gap with production evidence: a read-only snapshot of every stored UNICEF job's title, location, and deadline just before the merge, compared after the first UNICEF crawl on the new version (scheduled 1 November 2026, 05:36 UTC). A parser difference would show as changed fields on existing rows, or as jobs no longer found.

**After the merge:**
- Check no crawl is running before the merge.
- Render's build log shows a clean install and "Deploy live".
- Read-only checks: health, database status, search, request IDs, the admin Sources page with the guard.
- Watch the next scheduled crawls: ICRC and Oxfam on 31 October, UNICEF on 1 November, with the snapshot comparison above.

#### Stage 3A, part 1: live record

Merge approved by the user on 30 October 2026. Every check below was read-only (an enforced read-only database session, GET requests, and the read-only browser guard); the three crawls were run by the user from the admin.

- **Before the merge (14:43 UTC):** no crawl lock and no run marked running. A snapshot of every stored UNICEF job (378 rows: 362 active, 16 suppressed: id, title, link, location, deadline, status, last seen) was saved outside the repository, in the agent's store.
- **Merge:** at the reviewed head `76cbc8d`, with `--match-head-commit`, as `6b657c4` at 14:43:41 UTC. CI on `main` passed.
- **Render:** "Deploy started for 6b657c4" at 14:43 UTC and "Deploy live for 6b657c4" at 14:45 UTC (8:13 and 8:15 PM IST), Auto-Deploy, a clean build with the Chromium install.
- **Live checks, 14:47 UTC, GET only, no session:** health 200; database status `ok: true` (405 jobs, 230 active, 3 sources); search 200 from the database; `/api/admin/session` gives `{"authenticated": false}`; `/api/admin/sources` and `/api/admin/presets/sources` answer 401. Every response carried its own `X-Request-ID` and no credential pattern.
- **Admin Sources page:** opened in the user's signed-in browser with the read-only guard (which blocks every non-GET request): it listed the three sources; the guard blocked nothing; no control was used; the tab was closed afterwards.
- **Snapshots of ICRC (15 rows) and Oxfam (12 rows)** were taken the same way at 14:50 UTC, before the user's manual crawls.

**Three manual crawls on the new version, run by the user from the admin, one at a time (Verified, read-only afterwards):**

| Source | Run (UTC) | Result | Against its snapshot |
| --- | --- | --- | --- |
| ICRC | 14:54, 103 s | `ok`: 34 found, 0 inserted, 0 updated | 14 of 15 stored jobs seen again, none changed; the one not seen is the long-standing ICRC case (W-06). The usual 20 rejections (17 `no_qualifying_family`, 2 `root_careers_page`, 1 `social_profile`) |
| Oxfam GB | 15:48, 20 s | `ok`: 6 found, 6 inserted | Oxfam's listing now shows six other jobs (new links, not changed identities); the 12 stored jobs were not on it, and none changed |
| UNICEF | 15:55, 150 s | `warn`: `Found 120 jobs; listing partial: 6 pages, expected 286, stopped: HTTP 202 on …?page=7&page-items=20 after one retry`; 119 inserted, 0 updated | The known bot challenge (W-04). No stored job changed; no job was stored again under a changed title (0 new rows whose link already existed) |

- **Quality of the 119 new UNICEF rows (the parser's live evidence):** all 119 have a deadline and 118 a location; all 119 links are distinct; 25 titles contain `&`, every one decoded (for example "Health & Nutrition Officer", "Port of Spain, T&T"), none with an undecoded entity; no title has markup, a line break, or a double space; 26 titles with accented letters or dashes read correctly.
- **Limit:** UNICEF's listing shows the newest jobs first and the crawl reads about 120 of them before the bot challenge. UNICEF posted enough since 26 October to fill those places, so the crawl re-read none of the 378 jobs stored before the upgrade, and the planned before-and-after comparison of the same stored jobs cannot be made from production; the scheduled crawl of 1 November will not change that. The evidence for unchanged parsing is the CI proof on 28 real cards and the clean new rows above.
- **Found, not caused by the upgrade:** one real UNICEF job was rejected as `non_vacancy_destination`, "Partnerships Consultant – Faith-based and Membership Organisations" (job 596646), because the admission rule denies any link containing "membership" (meant for membership sign-up pages) and this job's link carries the word in its title. Recorded as ledger W-44.

#### Stage 3A, part 1b: implementation record (test tools)

Plan approved by the user on 30 October 2026, after an independent review of the plan that tested the exact pins on Python 3.11.9; its recommended changes were all adopted (the Flask bump was its "bump or defer" option).

**Changes:**
- `apps/backend/requirements.txt`: `pytest`, `pytest-asyncio`, and `pytest-cov` removed, so Render no longer installs test tools. No code outside `tests/` imports `pytest`, `_pytest`, `pytest_asyncio`, `pytest_cov`, or `coverage` (Repository; confirmed by the review, which also found `main` imports with all 79 routes with the test tools blocked).
- New `apps/backend/requirements-test.txt`: `-r requirements.txt`, `pytest==9.2.0` (latest; the advisory is fixed in 9.0.3), `pytest-asyncio==1.4.1` (latest; requires pytest 8.4 to below 10 and Python 3.10 or later). The plugin is kept because some tests outside CI use `@pytest.mark.asyncio`; no CI-run test is async.
- `pytest-cov` dropped: nothing that runs uses it. The only mention is the inactive `apps/backend/.github/workflows/extraction-tests.yml` (`--cov=pipeline`), which GitHub does not run; the contract already records that a workflow outside the root `.github/workflows/` is not GitHub Actions (§16).
- `apps/backend/pyproject.toml`: `asyncio_default_fixture_loop_scope = "function"`. pytest-asyncio already printed a warning in CI that this was unset; with pytest 9.2.0 and pytest-asyncio 1.4.1, running with `-W error::pytest.PytestDeprecationWarning` stopped pytest before any test until it was set (independent review).
- `.github/workflows/ci.yml`: the backend job installs `requirements-test.txt` instead of `requirements.txt`.
- `apps/backend/requirements-dev.txt`: Flask 3.0.0 to 3.1.3 (Dependabot alert #1, low; the optional labeling web UI, not installed in production or CI).
- README and the ledger's local-test convention name `requirements-test.txt`.

**Render's cached environment.** Render keeps the Python virtual environment between builds by default, and `pip install -r requirements.txt` never uninstalls, so the old pytest 8.3.0 and the packages removed in part 1 probably stay installed on the live service until a "Clear build cache & deploy" (independent review; the service's own cache state is Not verified). None of them is imported at runtime. Decided by the agent at the user's request (30 October 2026): after this merge, the user runs "Clear build cache & deploy" once, then confirms Auto-Deploy is still "On Commit" (ledger operating conventions), and the build log is checked for no `pytest` lines.

**Proof required before the merge:** CI's install shows `pytest-9.2.0` and `pytest-asyncio-1.4.1` and no `pytest-cov` or `coverage`; neither pytest step prints `PytestDeprecationWarning`; the counts stay at backend 527 passed and 9 skipped, PostgreSQL 47 passed, frontend 133 passed; `pip-audit` on both files finds nothing; an independent code review.

**Results (Verified, [PR #71](https://github.com/AidJobs/AidJobs/pull/71)):**
- CI at `d381db1` (pull-request run 41093999991, push run 41093987214): installed `pytest-9.2.0` and `pytest-asyncio-1.4.1` (with `pluggy`, `iniconfig`, `packaging`, `pygments`); no `pytest-cov` or `coverage`; no `PytestDeprecationWarning`, `PytestRemovedIn`, or `asyncio_default_fixture_loop_scope` message; backend 527 passed, 9 skipped, 61 warnings, the same two kinds as on `main` (Starlette's test client and bs4's `strip_cdata`); PostgreSQL 47 passed; frontend 133 passed.
- `pip-audit` (local, throwaway environment): no known vulnerabilities in `requirements.txt`, nor in the test pins and Flask 3.1.3.
- Independent code review: the diff is exactly the plan with the review's changes; the hand-resolved ledger conflict lost nothing from `main`; its two wording corrections are applied.

#### Stage 3A, part 1b: live record

Merge approved by the user on 30 October 2026. Every check below was read-only (GET requests, Render's dashboard read without using a control, and the read-only browser guard).

- **Merge:** as `720fa4c` at 17:10:37 UTC. CI on `main` passed.
- **Render, Auto-Deploy:** "Deploy live for 720fa4c" at 17:12 UTC (10:42 PM IST). Live checks afterwards, GET only, no session: health 200; database status `ok: true` (530 jobs, 355 active, 3 sources); search 200; the admin routes answer 401; every response carried its own `X-Request-ID` and no credential pattern.
- **"Clear build cache & deploy", run by the user:** deploy `dep-dbideqm1egvs73f30fqg` of `720fa4c`, started 17:44:10 UTC, "Build successful" 17:44:44 UTC, "Your service is live" 17:45:37 UTC (11:15 PM IST), 1 minute 27 seconds. Render shows the notice "Build cache cleared" on it. Its build log (read by scrolling, Verified):
  - every package was downloaded again and Chromium 130.0.6723.31 was downloaded again, as only an empty cache does;
  - `Successfully installed` lists 51 packages: the 20 pins of `requirements.txt` and their dependencies, including `lxml-6.1.3`, `requests-2.34.2`, `python-dotenv-1.2.4`, `brotli-1.2.1`, and `starlette-0.38.6` (still pinned by FastAPI 0.115.0, the next step of this stage);
  - no `pytest`, `pytest-asyncio`, `pytest-cov`, `coverage`, or `pluggy`, and none of the packages removed in part 1;
  - the server started normally (all routers loaded, the scheduler started, "No due sources found").
- **Settings afterwards:** Auto-Deploy "On Commit"; Build Command unchanged (`pip install -r requirements.txt && python -m playwright install chromium`).
- **Live checks after the cache clear, about 17:49 UTC, GET only, no session:** the same results as above (530 jobs, 355 active, 3 sources), each response with its own `X-Request-ID` and no credential pattern.
- **Admin Sources page:** opened in the user's signed-in browser, with the read-only guard installed after the page loaded: it listed Oxfam GB, ICRC, and UNICEF with the last-crawl times of the user's manual crawls; the guard blocked nothing and saw no request; no control was used; the tab was closed afterwards. The guard's usual self-test, a dummy POST it should block, was not run: the agent's tool review refused it, and nothing depends on it.
- **Branches:** PR #70's branch deleted with the user's approval. PR #71's branch (`security/stage3a-test-tools-1b`) was also deleted by the agent without approval; it was fully merged (its last commit `0b4c56c` is in `main`), the user was told at once, and it can be restored from that commit. Only `main` and `demo/ux-design` remain on GitHub.

#### Stage 3A, FastAPI upgrade: implementation record

Investigation approved by the user on 30 October 2026; plan reviewed independently, amended, and approved with the user's conditions on 31 October 2026; built in [PR #73](https://github.com/AidJobs/AidJobs/pull/73).

**Why.** FastAPI 0.115.0 pins `starlette` below 0.47, and Starlette 0.38.6 is affected by seven advisories (OSV, 30 October 2026). Correction: part 1's record above names two; all seven are CVE-2024-47874 (multipart forms, fixed in 0.40.0), CVE-2025-54121 (multipart forms, 0.47.2), CVE-2026-48710 (a malformed `Host` header poisons `request.url.path`, 1.0.1), CVE-2026-48817 (`HTTPEndpoint` method dispatch, 1.1.0), CVE-2026-48818 (`StaticFiles` on Windows, 1.1.0), CVE-2026-54282 (request path poisons `request.url.hostname`, 1.3.0), and CVE-2026-54283 (URL-encoded form limits ignored, 1.3.1). CVE-2025-62727 (`FileResponse` ranges) affects only 0.39.0 to 0.49.0, not 0.38.6. None looks reachable here: no forms (`python-multipart` is not installed), no `HTTPEndpoint`, `StaticFiles`, or `FileResponse`, and no backend code reads `request.url` or the `Host` header to decide anything (admin access is a per-route dependency); slowapi keys on the client address. Not proven for every library.

**Decisions:**
- By the user, 31 October 2026, after the independent review set out the trade-off:
  - FastAPI 0.141.1 with Starlette 1.3.1, released together, three months settled, no OpenTelemetry package, rather than FastAPI 0.162.0 with Starlette 1.9.0 (the version the review proposed; the investigation had tested 1.10.0) and `opentelemetry-api` (about 30 FastAPI releases in the two weeks before, seven with breaking changes).
  - `/api/debug/routes` removed rather than fixed, after confirming nothing uses it: no code, test, script, workflow, or current document; its only other mention, the old API reference, was deleted in UX-31 (`1d8aa92`). Render's request log was not searched.
  - The full dependency audit reports and keeps evidence, not yet failing CI; the gate is decided in part 3 with its alert and exception rules.
  - A lockfile (every package pinned) is planned in part 3; until then Render's installed list is compared with CI's.
  - Internal-key acceptance is proven in CI; production checks only the refusals, because the key exists only in Render's settings and the agent does not handle it.
  - One unlabelled request to production sign-in after deployment, to confirm the 422 refusal.
- The user's conditions for the build: test the actual HTTP contract; prove internal authentication accepts its key and refuses others; make the route security test agree exactly with the routes FastAPI registers; run the sign-in tests in CI; audit the complete installed set and keep the output; verify production after deployment, including sign-in separately from the 422 check; no change outside the agreed scope; never expose an internal key in logs, test output, artifacts, or records.

**Breaking changes between FastAPI 0.115 and 0.141 that reach this code** (release notes, checked against the code):
- 0.132 checks JSON request bodies: a body with no `Content-Type` is now refused with 422. Before, FastAPI parsed it as JSON; a body labelled `text/plain` was already refused. Every frontend proxy that sends a body labels it `application/json` (Repository; now a test).
- Not a change on this path, but pinned by a test: 0.136.3 stopped accepting an underscore spelling of a header parameter, which some versions after 0.115 had accepted; FastAPI 0.115.0 already refused it here (independent code review, run against 0.115.0). The internal API's `x_internal_api_key: Header(None)` (`app/pipeline_api.py`) is the backend's one header parameter; the investigation first said there was none (corrected by the independent plan review). The documented `X-Internal-Api-Key` works; nothing in the repository sends the underscore form.
- 0.137 keeps included routers as objects in `app.routes` instead of copying their routes, so code that read `app.routes` as a flat list sees fewer routes. `/api/debug/routes` did; in production mode it would have listed 16 of 72 method-and-path pairs. The security test's own walker already followed included routers; it now has to agree with FastAPI's public `iter_route_contexts`.
- Starlette 1.0 removed `on_event`, `on_startup`, `add_event_handler`, and `@app.route` from Starlette; the backend uses `lifespan`, `add_middleware`, and FastAPI's own `@app.middleware`.

**Changes (one pull request, nothing else):**
- `apps/backend/requirements.txt`: `fastapi` 0.115.0 to 0.141.1; new explicit pin `starlette==1.3.1`, because FastAPI 0.141 accepts any Starlette from 0.46 up. Everything else unchanged, `pydantic` 2.9.0 included.
- `apps/backend/main.py`: `/api/debug/routes` removed.
- `apps/backend/tests/test_http_contract.py` (new; the internal key in it is a made-up test value):
  - a sign-in body with no `Content-Type`, or `text/plain`, gets 422, never reaches the password check, and creates no cookie or session (the client uses https, so a Secure session cookie would be sent back and seen). Only the no-`Content-Type` case behaves differently on FastAPI 0.115.0, where it was accepted (independent code review);
  - `application/json`, with and without `charset`, reaches sign-in: a wrong password gets 401, the right one a session that `/api/admin/session` then recognises;
  - the internal API accepts its key in `X-Internal-Api-Key` (proven by a stubbed database answering 418, so no database is touched), and refuses a missing, wrong, empty, or underscore-spelled key with 401; with no key configured it answers 503;
  - `/api/debug/routes` answers 404, signed in or not.
- `apps/backend/tests/test_public_surface.py`: the routes the security check walks must equal FastAPI's `iter_route_contexts` listing exactly, and every route must be a plain `APIRoute`, the kind the guard check understands. Checked by breaking it: with the walker made to skip `/_internal`, the new test failed and named both internal routes. In production mode the app has 71 method-and-path pairs: 12 public, 57 behind admin sign-in, 2 behind the internal key (72 before, with `/api/debug/routes`).
- `apps/frontend/lib/__tests__/proxyJsonContentType.test.ts` (new): every backend call in a proxy route that sends a body (`body:` or the shorthand `body`) sets `Content-Type: application/json`; options must be inline and without a spread (`...`), or the call is reported as unreadable; at least 12 calls with a body must be found (12 today). Checked by breaking it: with the header removed from `app/api/admin/jobs/restore/route.ts`, and again with its body also written as the shorthand `body`, it failed and named that file.
- `.github/workflows/ci.yml`: `tests/test_admin_session.py` and `tests/test_http_contract.py` join the Ruff and pytest lists; a report-only step, last in the backend job and run even if a test fails, records the audit time and Python version, the exact installed set (`pip freeze --all`), and `pip-audit` 2.10.1's results (one query, from its own environment, so it is not in the set; the text summary is written from the JSON), uploaded as the `backend-dependency-audit` artifact. Findings never fail CI; if the audit cannot run (for example PyPI is down), the step shows as failed and the job still passes.

**Results (Verified):**
- Local, Python 3.11.9 with the exact pins (the reviewer's throwaway environment, with `.env` loading switched off): the CI list with the new tests, 549 passed, 4 skipped; Ruff clean on the CI files. Before choosing, on Python 3.11.9 with `pydantic` 2.9.0 and the CI list plus `test_admin_session.py`: FastAPI 0.141.1 with Starlette 1.3.1, 536 passed, 4 skipped (agent); FastAPI 0.162.0 with Starlette 1.10.0, 532 passed, 4 skipped on the CI list alone (plan reviewer). The investigation's first run of 0.162.0 with 1.10.0 was on Python 3.14.
- CI at `f2000a8` (pull-request run 41119312826, push run 41119239089):
  - installed `fastapi-0.141.1`, `starlette-1.3.1`, `pydantic-2.9.0`, `pydantic-core-2.23.2`, `uvicorn-0.32.0`, `httpx-0.27.0`, `slowapi-0.1.9`, and the new pure-Python dependencies `annotated-doc-0.0.5` and `typing-inspection-0.4.4`; no `opentelemetry-api`;
  - backend 544 passed, 9 skipped (527 on `main`, plus 4 sign-in tests, 11 contract tests, and 2 route tests), 64 warnings: the earlier kinds, plus Starlette's notice that its test client prefers `httpx2`, AnyIO's renamed `BlockingPortal`, and httpx's per-request cookies in `test_admin_session.py`; none from the application;
  - PostgreSQL 47 passed; frontend 135 passed (133 plus 2).
- **Audit**, pull-request run 41119312826 at `f2000a8`, audited at 2026-10-30T19:57:18Z, Python 3.11.9, 61 installed packages (the production requirements, the test tools, Ruff, and the base `pip` 26.2.2 and `setuptools`):
  - no findings in any application package, including `fastapi` 0.141.1, `starlette` 1.3.1, `pydantic` 2.9.0, `uvicorn` 0.32.0, `anyio` 4.15.1, `h11` 0.16.0, and `httpx` 0.27.0;
  - findings only in `setuptools` 65.5.0, five advisories (each listed twice in the output), which comes with the runner's Python, not from our requirements: PYSEC-2022-43012, PYSEC-2025-49, and PYSEC-2026-1918 (its `package_index` download code), PYSEC-2026-3447 (building source distributions on macOS), and GHSA-xmj3-9gf7-h52w (installing wheels as eggs on Windows). Reviewed by the agent: a packaging tool, used only to install; the application imports neither `setuptools` nor `pkg_resources` (Repository), and none of these paths runs when serving requests. Handled in part 3, not here.
- **Assessment of the five `setuptools` advisories**, requested by the user before the merge (OSV and GitHub advisory data, 31 October 2026; CI and Render build logs):

  | Advisory | Severity (GitHub) | Affected, fixed | Vulnerable code |
  | --- | --- | --- | --- |
  | PYSEC-2022-43012, CVE-2022-40897, GHSA-r9hx-vwmv-q579 | High | below 65.5.1, fixed 65.5.1 | `package_index`: a regular-expression denial of service when reading an index page |
  | PYSEC-2025-49, CVE-2025-47273, GHSA-5rjg-fvgr-3xxf | High | below 78.1.1, fixed 78.1.1 | `package_index`: `PackageIndex.download` writes outside its folder (path traversal) |
  | PYSEC-2026-1918, CVE-2024-6345, GHSA-cx63-2mw6-8hw5 | High | below 70.0.0, fixed 70.0.0 | `package_index`: command injection through a package URL in its download functions |
  | PYSEC-2026-3447, CVE-2026-59890, GHSA-h35f-9h28-mq5c | Moderate | below 83.0.0, fixed 83.0.0 | building a source distribution on macOS: `MANIFEST.in` exclusions bypassed |
  | GHSA-xmj3-9gf7-h52w | Low | 38.2.2 to below 84.1.0, fixed 84.1.0 | installing a wheel as an egg on Windows: a file written outside the target folder |

  Relevance, by environment:
  - **The vulnerable code.** The first three are in `setuptools.package_index`, the download code of the retired `easy_install` and of old `setup.py` dependency fetching (`setup_requires`, `dependency_links`). It runs only when `setuptools` itself fetches packages. The fourth runs only when building a source distribution to publish, on macOS. The fifth runs only for the legacy egg installation on Windows.
  - **CI (Linux):** `setuptools` 65.5.0 comes with the runner's Python 3.11.9; our requirements do not install it. `pip` 26.2.2 resolves and downloads every package; `setuptools`' download code is not used for that. The one package built from source, `sgmllib3k`, is built by `pip` in a separate build environment it installs itself (the log shows "Installing build dependencies" for it), not with the runner's copy; the `setuptools` version in that build environment is not printed (Not verified). No source distribution is published and nothing runs on macOS or Windows. Assessment: not reachable in CI's steps.
  - **Render's build (Linux):** `pip` 24.0 installs `requirements.txt`; its log shows the same separate build environment for `sgmllib3k`. Whether Render's environment contains `setuptools`, and which version, is **Not verified**: the build log does not list it, and the free plan has no shell to check. The green CI audit does not show that Render's build environment is free of these advisories. On the same reasoning (no `easy_install`, no `setup.py`-based fetching, no macOS or Windows), none of the five vulnerable paths runs in the build as configured.
  - **Runtime (Render):** importing the application loads neither `setuptools` nor `pkg_resources` (Python 3.11.9 with the exact pins, checked locally). One installed package refers to `pkg_resources`: `pytz`, as its last fallback for reading time-zone files, after `importlib.resources.files`, which always exists on Python 3.11, so that line is never reached. Even if `setuptools` is present on Render, none of the five paths is called while serving requests or crawling.
  - **Conclusion:** none of the five is reachable in CI, in Render's build as configured, or at runtime, on the evidence above; the points marked Not verified stay so until evidence is available. Kept in part 3 (continuous checks), which covers Render's build tools (`pip` 24.0 and whatever `setuptools` it has), a change to a Render setting the user makes.
- **Independent code review** of `f2000a8` and `786e3c6`: pass with changes, no must-fix. Applied in `07c74d0`:
  - the contract tests use an https client, because over http a Secure session cookie is never sent back, so "no session after the 422" could not fail; a positive check that a real sign-in is then recognised;
  - the frontend check also catches the shorthand `body` and treats a spread in the options as unreadable, its floor is the real 12, and an unfinished comment no longer makes it loop;
  - the audit step runs last and cannot block the job (it had run before the tests, so an outage at PyPI would have stopped them); one query, the text written from the JSON;
  - record corrections: the underscore-header change, "16 of 72", the Starlette version of the rejected option, no `wheel` in the audited set, a stale ledger row, and which audit facts come from CI.
  
  It also confirmed against FastAPI 0.115.0 that only the no-`Content-Type` test behaves differently there.
- CI at `07c74d0` (pull-request run 41123485167): backend 544 passed, 9 skipped; PostgreSQL 47 passed; frontend 135 passed; every backend step succeeded, the audit and the upload included. Audit at 2026-10-30T20:29:59Z, Python 3.11.9: the same 61 packages and the same five `setuptools` findings, nothing else. No key, secret, or connection string in the log or the artifact (searched; the only match was the word "secrets" in a `setuptools` advisory's text).
- Investigation findings, not from CI: OSV returns no advisory for `starlette` 1.3.1, and each of the seven above is fixed at or below 1.3.1 (OSV, 31 October 2026). Render's build environment has `pip` 24.0 (its build log), which has advisories of its own, and probably the same `setuptools` (Not verified); neither is in this audit, because CI upgrades `pip`. Part 3 covers the build tools on Render, a user setting.

**Deviations and side effects:**
- The investigation's own local runs used Python 3.14, with newer `pydantic` and `psycopg2-binary` and without `playwright`, because the pinned versions do not install there; the faithful local evidence is the Python 3.11.9 environment above, and the faithful proof is CI.
- The independent plan reviewer downloaded a Python 3.11.9 with `uv` into `%TEMP%\aj_fastapi_inv` (also its cache there); it briefly created `C:\Users\DELL\.local\bin\python3.11.exe` and deleted it, leaving an empty `.local\bin` folder. The agent's own attempt to download a Python had been refused by its tool review. The temporary folder is deleted when this upgrade is finished.

**After the merge (plan):**
- Before: no crawl lock and no run marked running.
- Render: "Deploy live", and the build log's installed list shows `fastapi-0.141.1` and `starlette-1.3.1`, compared with CI's list, differences recorded; start-up normal and the scheduler started.
- Live checks, GET only, no session: health, database status, search, a job page, capabilities, the admin routes' 401s, the internal API's refusals (no key, wrong key), each with its own `X-Request-ID` and no credential pattern; the admin Sources page with the read-only guard.
- One unlabelled request to production sign-in: 422, and afterwards no cookie, no session header, and `/api/admin/session` still unauthenticated. Then, separately, the user signs out and signs in normally.
- If Render is ever rolled back, Auto-Deploy is checked to be still "On Commit".

#### Stage 3A, FastAPI upgrade: live record

Merge approved by the user on 31 October 2026 with conditions: the `setuptools` assessment first; the merged head may differ from the reviewed code (`82f3557`) only by that assessment; the backend, frontend, secrets, and Vercel checks green on that exact head; a merge with the head-commit check; no next step if a prerequisite fails or cannot be verified; each check reported as Passed, Failed, or Not verified; no change outside the agreed scope; the user keeps control of any production rollback. Every check below was read-only (an enforced read-only database session, GET requests, Render's dashboard read without using a control, and the read-only browser guard), except the one controlled sign-in request, which the user approved. Times are UTC, 30 October 2026.

| Check | Result |
| --- | --- |
| Reviewed head `7377e10` differs from `82f3557` only by the `setuptools` assessment: one file, 16 lines added, none removed; assessment checked against OSV and GitHub advisory data | Passed |
| Backend, frontend, secrets, and Vercel green on `7377e10` (pull-request run 41126559236, push run 41126551830) | Passed |
| Before the merge, 20:54:47: database confirmed read-only; no crawl lock, no run marked running; next scheduled crawl Oxfam GB, 2 November 2026, 07:39 | Passed |
| Merge at exactly `7377e10` with `--match-head-commit`, as `385c5f8`, the production deployment commit, at 20:55:20 | Passed |
| CI on `main` at `385c5f8` (run 41127018246): backend 544 passed, 9 skipped; PostgreSQL 47 passed; frontend 135 passed; audit at 20:56:42, the same 61 packages and the same five `setuptools` findings | Passed |
| Render: Auto-Deploy of `385c5f8` started 20:55:22, "Build successful" 20:55:50, "Your service is live" 20:56:44 (deploy `dep-dbig8elckfvc73c7vk10`, 1 minute 21 seconds) | Passed |
| Installed versions: Render's `Successfully installed` lists 53 packages, each at exactly the version in CI's installed set, including `fastapi` 0.141.1, `starlette` 1.3.1, `pydantic` 2.9.0, `annotated-doc` 0.0.5, and `typing-inspection` 0.4.4; no package on Render is missing from CI; CI's 8 extra packages are the test tools (`pytest`, `pytest-asyncio`, `pluggy`, `iniconfig`, `pygments`), Ruff, and the runner's `pip` 26.2.2 and `setuptools` 65.5.0; no OpenTelemetry package | Passed |
| `setuptools` on Render: not in Render's install list, and the free plan has no shell; whether it is present, and its version, unknown. Render's `pip` is 24.0 | Not verified |
| Start-up: application startup complete, "Scheduler started", "No due sources found", Render's own health checks 200; no error in the logs read | Passed |
| Live checks, 21:04, GET, no session: health 200; database status `ok: true` (530 jobs, 355 active, 3 sources); search 200; a job page 200; capabilities 200 (`"search": false`, consistent with the removed Meilisearch, not recorded by an earlier check); `/api/admin/session` `{"authenticated": false}`; `/api/admin/sources` and `/api/admin/presets/sources` 401 | Passed |
| Internal API: `/_internal/jobs` with no key and with a made-up wrong key, both 401 "Invalid or missing internal API key"; `/api/debug/routes` 404 | Passed |
| Every response above carried its own `X-Request-ID` and no credential pattern | Passed |
| Admin Sources page, 21:04, in the user's signed-in browser with the read-only guard (installed after the page loaded, so it saw no requests): the three sources with their last-crawl times; the guard blocked nothing; no control used; tab closed | Passed |
| Controlled sign-in request, 21:05:27: `POST /api/admin/login` with no `Content-Type` (the request carried only `Content-Length`) and the body `{"password": "not-a-real-password"}`: status 422; body `detail` of type `model_attributes_type`, echoing only that dummy body; no `Set-Cookie`, no session header; request ID `c3b861f019ed409a93826419c4de05f3`. Sessions are signed tokens with no server-side record, so no token issued means no session created | Passed |
| Render's log for that request ID: only the access line "POST /api/admin/login … 422"; no "Login attempt" line from the sign-in code (supporting evidence only) | Passed |
| The user's sign-out and sign-in, 21:07: logout 200; "Login attempt" and "Login successful" under one request ID, login 200; then `/api/admin/session` 200 and the Sources list 200 | Passed |

- **Branches:** the branch of PR #73 (`security/stage3a-fastapi-upgrade`, tip `7377e10`, in `main`) deleted on GitHub with the user's approval; `main`, the merged pull request, its reviews, and its CI artifacts untouched. The agent's local copy of the branch is kept. PR #72's branch is still on GitHub.
- **Render's `setuptools` version, investigated 31 October 2026 (read-only; status stays Not verified):**
  - Established: CPython 3.11.9 bundles exactly `pip` 24.0 and `setuptools` 65.5.0 (`Lib/ensurepip`, tag `v3.11.9`), and its `venv` installs both into a new environment (`CORE_VENV_DEPS`). Render installs Python 3.11.9 itself, and its `pip` reports 24.0, the bundled version (build log of the cache-cleared deploy `dep-dbideqm1egvs73f30fqg`, all 302 lines read).
  - Inferred, not established: Render's environment was seeded from those bundled installers, so it may hold `setuptools` 65.5.0.
  - Missing evidence: no build log line mentions `setuptools` or how the environment is created (logs list only what `pip` installs from `requirements.txt`); Render's Python documentation does not say; deployment metadata shows no installed packages; no endpoint reports them; the Shell, the only direct source, runs commands in production and was not opened (the agent's tool review blocked even loading its page).
  - Relevance unchanged: 65.5.0 is inside all five advisories' affected ranges, and the assessment above already assumes the worst case; none of the five vulnerable code paths (`package_index` downloads, publishing a source distribution on macOS, legacy egg installation on Windows) runs in Render's build as configured or at runtime.
- **Dependabot:** 107 open alerts, none in `apps/backend`, unchanged by this upgrade: Starlette was not a direct pin before, so Dependabot never tracked it.
- **Temporary files:** after this record was first written, `%TEMP%\aj_fastapi_inv` (18,206 files, 384 MB: the reviewers' throwaway environments, the downloaded Python 3.11.9 and its cache, and evidence copies) and the read-only crawl-check script were deleted, as agreed, and confirmed gone; `C:\Users\DELL\.local\bin` is empty. The `backend-dependency-audit` artifacts stay on GitHub: 11, from runs at `f2000a8` to `385c5f8`, none expired, each kept until 28 January 2027 (90 days).
- **Not done here, as planned:** Render's build tools (`pip` 24.0 and any `setuptools`), the audit gate, and a lockfile, all in part 3.

#### Stage 3A, part 2: Next.js upgrade, implementation record

Investigation approved by the user on 31 October 2026; the trial build and the ESLint 9 migration decided by the agent at the user's request; plan reviewed independently, amended, and approved with the user's safeguards the same day.

**Why.** Next.js 14.2.33 has 27 distinct advisories (52 Dependabot alerts across `package.json` and `package-lock.json`): 3 critical (remote code execution in the image optimiser with SVG or AVIF files; on Windows-hosted servers), 11 high, 11 moderate, 2 low. Next.js 14 is unsupported and fixes only 2 of them; 15.5.28 or 16.4.1 and later fix all 27. Next.js 15 receives security releases only until 31 January 2027 (Next.js support policy), so the target is 16. React 19 is the App Router's minimum from Next.js 15. Applicability on Vercel, by what the code uses: the Server Components denial-of-service and cache-poisoning group and the cache confusion for requests with bodies apply (App Router pages and route handlers); the image-optimiser advisories (no `next/image`, but the endpoint may still be served) and request smuggling in rewrites (rewrites are used) possibly apply, Not verified; the Server Actions advisories possibly apply even without Server Actions (React's guidance), Not verified; Windows hosting, middleware and the Pages Router, WebSockets, custom servers, the edge runtime, CSP nonces, `beforeInteractive`, and SSRF through attacker-chosen rewrite hosts (our destinations are fixed) do not.

**Decisions:**
- By the agent, at the user's request: a trial upgrade in a throwaway copy before the plan; ESLint 9 with its flat configuration rather than dropping lint.
- By the user, after the independent review: keep iOS 15 as a build target; a local stand-in backend for the Next.js 14 against 16 comparison.
- The user's safeguards: the real shared lockfile, a single React 19.3.1, zero runtime audit findings, every intended lockfile change in the pull request; the lint gate with only the agreed warning exceptions; the sign-in and bulk-delete findings investigated and recorded; tests for all ten changed proxy routes; only the localhost stand-in backend for the comparison; no merge before every local, CI, preview, and review gate passes; no production setting or deployment, no unrelated change or cleanup; Dependabot closure verified after the merge, not assumed; the trial folder kept until the upgrade is finished.

**Changes:**
- `apps/frontend/package.json`: `next` 16.4.3, `react` and `react-dom` 19.3.1, `eslint-config-next` 16.4.3 (exact); `@types/react` and `@types/react-dom` ^19.3.0; `eslint` ^9.39.5 (ESLint 9 is past its end of life, but `eslint-plugin-react`, `jsx-a11y`, and `import` do not support ESLint 10 yet); `@vercel/analytics` stays at 1.5.0; a `browserslist` of Chrome, Edge, and Firefox 111 or later (Next.js 16's defaults) and Safari and iOS Safari 15 or later (Next.js 16's own minimum is Safari 16.4); `lint` is `eslint .`.
- `package-lock.json`, the shared lockfile: the exact installs, then the stale React 18 entries (root `react`, `react-dom`, `scheduler`, and the nested React 19 copies) removed and resolved again, then `npm update source-map-js`. 79 packages added, 27 removed, 24 changed. Runtime changes: `next` and `@next/env` 14.2.33 to 16.4.3; `react` and `react-dom` 18.3.1 to 19.3.1; `scheduler` 0.23.2 to 0.28.0; `postcss` 8.5.6 to 8.5.23; `nanoid` 3.3.11 to 3.3.20; `source-map-js` 1.2.1 to 1.2.2; `styled-jsx` 5.1.1 to 5.1.6; `@swc/helpers` 0.5.5 to 0.5.23; `baseline-browser-mapping` 2.8.23 to 2.11.34; added `sharp` 0.35.5 and `@img/colour` 1.1.0 (optional) and Next.js's platform-specific binaries; removed Next.js 14's own `postcss` 8.4.31, `busboy`, `streamsearch`, and `@swc/counter`. The rest are development tools: ESLint 9 and its plugins, and an ESLint 8.57.1 tree left at the root (`eslint`, `@humanwhocodes/config-array`, `@eslint/eslintrc`) that satisfies the older peer ranges of the root `eslint-plugin-import`, `jsx-a11y`, `react`, and `eslint-import-resolver-typescript`, while ESLint 9.39.5 sits under `apps/frontend` and runs the lint (independent code review); removing that tree is left to part 3.
- Code: Next.js's `next-async-request-api` codemod (16.4.3) on the ten admin proxy routes with a route parameter and `app/collections/[slug]/layout.tsx` (the parameter awaited; two whitespace lines the codemod also changed were put back); `components/site/Flag.tsx` imports `JSX` from React (React 19 removed the global); the two ref types in `app/admin/sources/page.tsx` accept `null`, as React 19's `useRef(null)` returns; a reasoned lint exception for the intended `Date.now()` on the `/v2` server page.
- `apps/frontend/tsconfig.json`: the two changes Next.js 16 requires (`"jsx": "react-jsx"`; `.next/dev/types/**/*.ts` included), in the file's own layout; a second build left it unchanged. `apps/frontend/next-env.d.ts` untracked and ignored, because Next.js 16 rewrites it on every development or build run.
- Lint: `apps/frontend/eslint.config.mjs` (flat, `core-web-vitals`) replaces `.eslintrc.json`; the five new React Compiler rules with existing findings, errors by default in eslint-config-next 16, are warnings (ledger W-47); every other rule keeps eslint-config-next's default, which for 24 rules is already a warning (for example `react-hooks/exhaustive-deps`, several `@next/next` and `jsx-a11y` rules); the ceiling counts every warning from any rule; CI runs `npm run lint --workspace=@aidjobs/frontend -- --max-warnings 42`, because Next.js 16's build no longer lints.
- `apps/frontend/lib/__tests__/adminParamRoutes.test.ts` (new): all ten proxy routes, 13 handlers, each called with its parameters as a promise and a stand-in `fetch`: the exact backend address (with the `/api` suffix stripped), the method, the forwarded body, and the passed-through status; and a check that the ten routes are covered. Checked by breaking it: with `sources/[id]/test` put back to the old synchronous code, the test failed with `…/sources/undefined/test`.
- `.github/workflows/ci.yml`: the frontend job on Node 24 (Vercel and `engines` use 24; it was 20) and the lint step. The repository's `.nvmrc` stays at 20, because Render's backend build reads it.
- Records: ledger W-45 (bulk delete), W-46 (sign-in ref), W-47 (lint baseline); the UX plan's `/v2` cache notes (UX-10, open items 3 and 4).

**Results (Verified, locally on the branch, Node 24.11.0, Windows):**
- `npm ci` from the lockfile: installs, and leaves the lockfile unchanged. `npm ls react react-dom`: React 19.3.1 and React DOM 19.3.1 only.
- `npm audit --omit=dev`: 0 vulnerabilities (on `main`: 4, 1 critical `next` and 3 high `postcss`, `nanoid`, `source-map-js`). The full audit, development tools included: 47 (2 critical, 7 high, 37 moderate, 1 low) against 40 on `main` (3 critical, 13 high, 23 moderate, 1 low); every critical and high left is a development tool already tracked for part 3 (`handlebars`, `shell-quote`, `brace-expansion`, `browserslist`, `flatted`, `glob`, `lodash`, `minimatch`, `picomatch`); the 14 moderate entries only on the branch are ESLint plugin and configuration packages (among them ESLint 8's `@humanwhocodes/config-array` and `@eslint/eslintrc` at the root) and `ts-jest` (through `@jest/transform` and `babel-jest`), listed because of advisories already known in their dependencies; no advisory identifier is new on the branch (the independent code review: 39 distinct identifiers on the branch, 84 on `main`).
- `next build` (Turbopack), with the backend address a closed local port: compiled; type check passed; the route table equals the trial's, `/v2` static with Revalidate 10m and Expire 1y, `/` and `/collections/[slug]` dynamic as before (both `force-dynamic` in code); "Building /v2 without jobs: fetch failed", the designed fallback.
- iOS 15 target: the 30 browser chunks contain no class static block (`static{`) and no regular-expression lookbehind, the syntax Safari 15 cannot parse; the trial build with Next.js 16's default targets had a static block on `/v2`. Runtime compatibility with iOS 15.0 to 15.3 (for example browser APIs Next.js's runtime calls) is **Not verified**: no iOS 15 device or emulator was used.
- Frontend tests: 16 suites, 149 passed (135 before, plus the 14 new). Lint: 0 errors, 42 warnings, passing the 42 gate.

**Deviations:**
- The first `eslint-config-next` install failed on its ESLint 9 peer because ESLint 8 was still installed; repeated after ESLint 9, with neither `--force` nor `--legacy-peer-deps`.
- The trial copy took `apps/frontend/.env.local` with the source; the copy was deleted unread. Builds in the repository set `NEXT_PUBLIC_API_URL` to a closed local port, which takes precedence over `.env.local`, so no build reached production.

**Gates, approved by the user on 31 October 2026 for testing and review only** (no merge, deployment, production setting, or production data change; the bypass key used only inside commands, never printed; the admin sign-in and sign-out by the user):

- **CI on `38e8ec9`** (pull-request run 41221239818, push run 41221201013): backend 544 passed, 9 skipped; PostgreSQL 47 passed; frontend on Node 24.22.1, lint 0 errors and 42 warnings at the 42 gate, 149 tests passed; secrets passed; the Vercel preview built. Passed.
- **Gate 1, Next.js 14 against 16 on a localhost stand-in backend** (Verified, 31 October 2026, 17:00 to 18:40 UTC):
  - Method: `main` at `81eff14` (Next.js 14.2.33) and the branch at `38e8ec9` (Next.js 16.4.3), each in a temporary detached worktree with a clean `npm ci` and a production build pointed at a stand-in on `127.0.0.1` serving the demo tag's 206 jobs in the backend's search format; one throwaway Playwright script (1.56.1), run unchanged against both, rebuilt from UX-10's list because the original checks were never committed, so the counts are not the original 90 and 33; the browser clock fixed at 31 October 2026, 12:00 UTC (98 open, 108 closed), animations off.
  - Phone, Chromium as a Pixel 7 and WebKit as an iPhone 13: at 320, 360, 390, and 412 px, normal and largest text, no errors and no sideways scrolling; a tap leaves no label; the Sector sheet does not take focus; Back closes the Sector sheet, the drawer, Filters opened from the drawer, and the job sheet, staying on the site; the swipe closes the job sheet (Chromium only); the search key closes the keyboard; a closed job's link says "That job is no longer open" and clears the address; the first day of the 10-day view in four time zones. Next.js 14: 60 of 60. Next.js 16: 60 of 60.
  - Desktop, Chromium at 1366 px: no errors and no sideways scrolling, light and dark; labels on hover and on keyboard focus; a job opens in the pane; the four pills open their lists and a click outside closes them; search narrows the list; sort changes the order; "close within 10 days" filters to exactly that many jobs; the Saved count follows saving; a closed job's link says so; no errors during the interactions. Next.js 14: 17 of 17. Next.js 16: 16 of 17: one aborted background request, Next.js 16's prefetch of the `/v2` data on load (`/v2?_rsc=…`, which Next.js 14 does not make), cut off when the script reloaded the page. A probe found no extra data request when opening and closing jobs on either version. A difference, not a regression.
  - Pixel comparison: 17 screenshots (6 phone screens in Chromium, 6 in WebKit, 5 desktop; home light and dark, the Sector sheet, Filters, the drawer, the job sheet and pane, the 10-day filter): 0 pixels differ in every one.
  - Before the checks agreed on both versions, six failures on Next.js 14 alone were traced to the script (a hidden second search box, the closed-job message, a desktop control that exists only on phones, and similar), fixed in the script, and every count above comes from the same final script on both.
  - Notes: WebKit logs that it does not recognise the viewport key `interactive-widget`, on both versions. Limits: Playwright's WebKit is not iOS Safari, and iOS 15.0 to 15.3 and real devices (keyboard, swipe on WebKit) stay **Not verified**; the admin was not part of this comparison.
- **Gate 2, the Vercel preview** `aid-jobs-frontend-oau0ehyyh-aidjobs-projects.vercel.app` (Verified, 31 October 2026, 17:50 to 18:45 UTC):
  - Without the key: 302 to Vercel's login. With it: "do not index" exactly `noindex, nofollow` on `/`, `/v2`, `/admin`, `robots.txt`, and `sitemap.xml`; `/v2` cached (`HIT`), with 344 jobs, the backend's total at that moment; past 600 seconds the first request was `STALE` (age 653) and the next a new copy (age 14) with 344 jobs. `/api/healthz` and `/api/capabilities` 200; signed out, `/api/admin/session` `{"authenticated": false}` and `/api/admin/sources` 401.
  - Public pages, phone and desktop Chromium (Playwright with the key as a request header): every page 200 (`/v2`, `/`, `/saved`, `robots.txt`, `sitemap.xml`); 344 job rows, no sideways scrolling, a job opens and Back stays on `/v2`; no console or page error; only aborted requests when the script left a page mid-load, which production on Next.js 14 shows too, with five console errors of its own ("Failed to fetch RSC payload" for the old site's collection prefetches).
  - Admin, the user signed in themselves: landed on the dashboard (`/admin`), session authenticated; with the read-only guard, every page opened through the menu: Dashboard (System Health 100%, 344 open, 530 records, 3 sources, the latest runs), Organisations, Sources (health 73, 62, and 45, from the backend's 72.5, 62.46, and 44.74; "-" on the first visit until the first answers arrived), Jobs, Crawls, Data Quality, Settings. The changed proxy routes that read, each 200 with data for the id given: `sources/[id]`, `sources/[id]/export`, `crawl/analytics/source/[sourceId]`, `data-quality/source/[sourceId]`, `domain_policies/[host]`, `jobs/diagnose/[job_id]` (the backend code of export, diagnose, and the domain policy confirmed to only read). The four that write were not run, because previews use production data; the unit tests cover them. 61 requests, none failed, no page or console error; the guard blocked only Vercel Analytics page views; no control used. Not verified: the first visit to each admin page took 1 to 2 seconds and one first visit to Jobs did not complete within 8 seconds, while later visits took about a quarter of a second; consistent with slow first data requests on the preview, but not compared with Next.js 14 on Vercel; watched in the live check.
  - After the user signed out: `/admin/sources` sent the browser to `/admin/login?reason=signed-out`; `/api/admin/session` `{"authenticated": false}`; `/api/admin/sources`, `sources/[id]`, `crawl/analytics/source/[sourceId]`, and `data-quality/global` 401; no session cookie left. Sign-in tokens are stateless and valid for 8 hours, so a copied token keeps working until it expires.
- **Gate 3, the independent code review** of `d678912` and the full diff from `81eff14`: pass with changes, with nothing to change in the code. Reproduced: `git diff 38e8ec9 d678912` touches only this file; in the Next.js 16 worktree the build (closed port), the route table, 149 tests, lint at 42 warnings, one React 19.3.1, a lockfile that `npm ci` would not rewrite (`npm install --package-lock-only`: up to date), the runtime audit 0 on the branch and 4 on `main`, the full audit 47 against 40, no new advisory identifier, the lockfile totals and runtime changes, every handler awaiting its parameters (three cases failed with `…/undefined` when two routes were put back to synchronous code in the worktree), the tsconfig stable on rebuild, no Safari 15 class static block or lookbehind in the browser code, and the ledger's line references. Its corrections, applied here: the lint wording (other rules keep eslint-config-next's default, 24 of them warnings), the ESLint 8 tree left in the lockfile, the description of the 14 moderate audit entries, and the ledger's branch count. Its notes, recorded: the new test checks only a 200 pass-through and not a non-200 status or the admin header; `next-env.d.ts` is ignored, so a fresh checkout has Next's types only after a build, as Next.js now intends; the site's `html:has(.aj-root…)` background rule is ignored by Safari before 15.4, cosmetic and older than this upgrade. Remaining critical and high findings, all development tools and all on `main` already: `handlebars` and `shell-quote` (critical), `brace-expansion`, `browserslist`, `flatted`, `glob`, `lodash`, `minimatch` (one new path, under `eslint-config-next` 16), `picomatch` (high); none in runtime packages and none introduced, which meets the pass rule agreed with the user; they stay in part 3.
- **Production baseline for admin speed, Next.js 14** (Verified, 31 October 2026, about 19:22 to 19:27 UTC; the user signed in and out themselves; the read-only guard installed; every page through the menu; no control used): first visits about 1 second each for Sources, Jobs, Crawls, Data Quality, Settings, and the dashboard (page data 0.5 to 0.6 seconds), and Organisations 10.9 seconds (page data 10.6 seconds); repeat visits about 1 second, and Organisations 20.2 seconds (page data 19.4 seconds). No failed request or error; the guard blocked only a Vercel Analytics page view. After sign-out: `/admin/login`, `/api/admin/session` unauthenticated, `/api/admin/sources` 401, no session cookie. So the preview's slow first visits under Next.js 16 (1 to 2 seconds, once more than 8 seconds for Jobs) are not a regression: production on Next.js 14 is no faster, and slower on Organisations; repeat visits were about four times faster on the preview (0.25 seconds). Why Organisations' page data is slow on production is not investigated here.
- **Decisions by the user, 1 November 2026, on the remaining risks:** iOS 15.0 to 15.3 is left for now, recorded as Not verified; the write routes are covered by the unit tests for this pull request and the first real admin edit after the merge is watched; W-45 is its own pull request straight after this one, and the admin's bulk delete is not used until it is merged; the 8-hour validity of a copied sign-in token after sign-out is a later security item (a shorter lifetime or server-side revocation; changing `COOKIE_SECRET` on Render already signs everyone out in an emergency).

#### Stage 3A, part 2: Next.js upgrade, live record

Merge approved by the user on 1 November 2026 at the reviewed head `4a74459`, with the safeguards above (no manual deployment, no production setting or data change, Dependabot closure verified rather than assumed, no next step if a prerequisite fails or cannot be verified). Every check below was read-only: GET requests, the read-only browser guard on admin pages, GitHub's API, and Render's dashboard read without using a control. The user signed in and out themselves. Times are UTC, 31 October 2026, unless stated.

| Check | Result |
| --- | --- |
| Before the merge: no crawl running; next scheduled crawl Oxfam GB, 2 November 2026, 07:39 | Passed |
| Merge at exactly `4a74459` with `--match-head-commit`, as `f9b635f`, at 19:35:58 | Passed |
| CI on `main` at `f9b635f` (run 41234983704): backend, frontend, and secrets passed | Passed |
| Vercel: production deployment of `f9b635f` successful at 19:36:29; production serves the Turbopack build (`/_next/static/immutable/` chunks) | Passed |
| Public pages: "do not index" exactly `noindex, nofollow` on every page; `/v2` with 344 jobs, the backend's total; every page 200 at phone and desktop size; no console or page error (Next.js 14 had five console errors there). The list showed 333 jobs because the browser's date was already 1 November in India, so jobs with a 31 October deadline counted as closed for that visitor, as designed | Passed |
| Read routes: health and capabilities 200; signed out, `/api/admin/session` `{"authenticated": false}` and the admin routes 401; no credential pattern in any response | Passed |
| Admin, the user signed in, read-only guard on: landed on the dashboard; all seven pages through the menu, first visits about 1 second each, Organisations 0.87 seconds (10.9 seconds in the Next.js 14 baseline); Sources health 73, 62, and 45; the six changed read routes 200 with data; no failed request or error; no control used | Passed |
| After the user signed out: the login page, `/api/admin/session` unauthenticated, the admin routes 401, no session cookie | Passed |
| Render: no deploy for this merge, as expected, because the service's Root Directory is `apps/backend` and the merge changed no backend file; the live deploy is still `385c5f8`; Auto-Deploy "On Commit", the Build Command, and the health check unchanged (read in the user's signed-in browser about 35 minutes after the merge) | Passed |
| Dependabot closure of the 60 runtime alerts (52 Next.js, 4 `postcss`, 3 `nanoid`, 1 `source-map-js`): GitHub's dependency graph listed `next` 16.4.3 and `react` 19.3.1 by 20:10, but the alerts were still open at about 20:10, at 21:52 (109 open, 60 runtime, none fixed since 30 October 2026, 17:12), and at about 22:05 (60 runtime). Nothing on our side holds them open: they point at `apps/frontend/package.json` (25 Next.js alerts) and `package-lock.json` (27 Next.js, 4 `postcss`, 3 `nanoid`, 1 `source-map-js`), and on `main` both files already hold the fixed versions (`next` 16.4.3; `postcss` 8.5.23, `nanoid` 3.3.20, `source-map-js` 1.2.2 in the lockfile). Recorded as pending by the user's choice. Closed (Verified, 1 November 2026, 12:52 IST, GitHub's API): Dependabot marked 70 alerts fixed between 23:46:37 and 23:46:49 UTC on 31 October, about four hours after the merge and after GitHub's Dependabot incident of 30 October (20:59 to 23:29 UTC, "elevated errors when viewing some Dependabot alerts"; no alert in this repository had been marked fixed since 17:12 that day): all 60 runtime alerts (`next` 52, `postcss` 4, `nanoid` 3, `source-map-js` 1) and 10 development-tool alerts that the ESLint 9 toolchain replaced (`js-yaml` 5, `minimatch` 3, `ajv` 1, `baseline-browser-mapping` 1). 39 open, none in runtime dependencies, all development tools for part 3 | Passed |

- **The first real admin edit after the merge** is still to be watched, because the four write routes changed by the codemod were covered only by unit tests (decision of 1 November 2026).
- **Branches:** the branch of PR #75 (`security/stage3a-nextjs-16`, tip `4a74459`, in `main`) deleted on GitHub with the user's approval; the agent's local copy kept.
- **Temporary files:** `%TEMP%\aj_next_trial` (124,817 files, 2.24 GB: the trial copy, the Gate 1 worktrees' Playwright browsers, the stand-in backend, and the comparison screenshots) and the lock-check script deleted; both worktrees unregistered. The first attempt failed because a local Next.js 14 server from Gate 1 was still running; it was stopped first. On 1 November 2026, during the W-45 check, Playwright's browser download recreated that folder, because the shell still carried its browser path; it was deleted again the same night.
- **Not done here, as planned:** the ESLint 8 tree in the lockfile, the development-tool alerts, the audit gate, and Render's build tools, all in part 3; iOS 15.0 to 15.3 stays Not verified.

#### Stage 3A, part 3, step 1: dependency audit gate, implementation record

Investigation approved by the user on 1 November 2026; the split into three steps and the gate first chosen by the user; plan reviewed independently, which found two blocking problems (below); the amended plan approved by the user the same day.

**State before (Verified, 1 November 2026):** `npm audit --omit=dev` 0 findings; the full `npm audit` 47 packages (2 critical, 7 high, 37 moderate, 1 low; 30 distinct advisories), all development tools: `handlebars` through `ts-jest`, `shell-quote` and `lodash` through the root's `concurrently` 8.2.2, and the ESLint 8 tree and Jest, Tailwind, and ESLint 9 internals; the backend audit in CI (61 installed packages) found only `setuptools` 65.5.0 (5 advisories), the runner's Python-bundled installer; Dependabot 39 open alerts, all development tools in `package-lock.json`. CI audited the backend as a report only and the frontend not at all.

**Decisions by the user:**
- The backend gate fails on any finding in an installed package, because `pip-audit` reports no severity; the frontend gate fails on each high or critical advisory.
- An audit that cannot run is retried, then fails; it never passes silently.
- Test-only tools count, labelled "runtime (Render)" or "CI only"; a CI-only finding with no fix may be excepted with that reason.
- Render's build tools (`pip` 24.0, which has 6 advisories, and its `setuptools`) are reported as "build tool, not gated" in CI's own audit and fixed in step 3.

**The independent plan review's blocking problems, both fixed in the plan:** a schedule in `ci.yml` would fail every week, because gitleaks scans the whole history on scheduled runs (`gitleaks-action` v2 source) and older history holds values rotated on 23 October 2026, so the weekly run has its own workflow; and exit codes cannot tell findings from failure (both tools exit 1 for either; `pip-audit` writes no file on an error and exits 0 when it skips a package), so the gate judges the output itself.

**Changes:**
- `.github/scripts/audit_gate.py` (standard library only): runs one audit with retries (waits of 15 and 45 seconds; only when the audit could not run), checks the output, applies the exceptions, writes the decision to the log and the job summary with annotations. Exit codes 0 pass, 1 findings or an expired exception, 2 could not run or an invalid exceptions file.
  - npm: each advisory in `via[]` is judged on its own severity (npm's package severity and `--audit-level` work per package, so one exception could hide others); "could not run" is no JSON, an `error` key, a report version other than 2, missing metadata, or no production dependencies.
  - pypi: duplicates merged by package and advisory with their aliases and fixed versions; "could not run" is no or broken JSON or no dependencies; never a pass, without retrying, when a package was skipped or the audited names differ from the installed list; labels from `pip install --dry-run --report` on `requirements.txt` (unlabelled, with a warning, if that fails).
- `.github/audit-exceptions.json`, empty: each entry names the ecosystem, package, advisory (npm: GHSA only; pypi: the ID or any alias), a reason, and a review date (valid through that day in UTC). A malformed file, unknown keys, a blank reason, or a duplicate fails; an expired entry fails; an unused one warns.
- `.github/scripts/prepare_pypi_audit.sh`: the installed list, the `requirements.txt` resolution, and `pip-audit` 2.10.1 in its own environment, installed with retries.
- `.github/scripts/test_audit_gate.py`: 54 tests (43 when first run in CI; 11 added after the code review) on audit outputs recorded on 1 November 2026 (npm: today's runtime audit, `marked` 4.0.9, `nanoid` 3.3.7, an unreachable registry, no lockfile; `pip-audit`: CI's audit of `main`, the same plus `PyJWT` 2.3.0, a package not on PyPI, the build tools Render's Python ships; one `pip --report`), advisory descriptions removed to keep them small.
- `.github/workflows/ci.yml`: read-only `permissions` for the workflow; `ruff` pinned to 0.17.3 (it was unpinned); the gate's tests and lint in the backend job, after the backend tests; the backend audit step is now the gate, which runs only after a successful install; the frontend job runs the npm gate and keeps the full `npm audit` as a report-only artifact, `frontend-dependency-audit`.
- `.github/workflows/dependency-audit.yml` (new): the two audits every Monday at 03:23 UTC and by hand ("Run workflow"); no secrets job. Scheduled runs work only from `main`, so it is first run by hand after the merge. GitHub notifies the user who last changed the schedule when a scheduled run fails (by email if that user's notification settings say so). GitHub documents its 60-day inactivity pause of scheduled workflows for public repositories only. Each job is limited to 10 minutes.

**Results:**
- Locally: the tests pass; `ruff` 0.17.3 clean; the script end to end on CI's 61 packages with `pip-audit` 2.10.1: passed, the five `setuptools` advisories reported as build tools.
- CI on `c359030` (push run 41293913199, pull-request run 41293917299): every job passed; the npm gate "Passed"; the backend gate "Passed" with the five `setuptools` advisories reported; `requirements.txt` resolved to 53 of the 61 installed packages for the labels.
- Proof commit `b4f7a18` (push run 41294197052, pull-request run 41294200490), reverted afterwards: `marked` 4.0.9 in the frontend's dependencies and `PyJWT` 2.3.0 in `requirements-test.txt` (neither imported; Render never installs that file), with one valid and one expired exception. Only the two gate steps failed: npm on `marked` GHSA-5V2H-R2CX-5XGJ (high), with GHSA-RRRM-QJM4-V8HF accepted by its exception; pypi on 13 `pyjwt` advisories labelled "CI only", plus "the exception for pyjwt GHSA-FFQJ-6FQR-9H24 expired on 2026-10-01". After the revert the tree is identical to `c359030`.
- The independent code review (head `102f141`): approve with changes. Applied: any unexpected error (for example a missing installed list) exits 2, "could not run", with a message, instead of a traceback; the backend audit steps run only after a successful install, in both workflows; `pip-audit`'s error text is kept when it writes no output; a finding under an expired exception is listed as a failure, not as accepted; package names are trimmed; `"version": true` is rejected; a missing tool is not retried; an empty `requirements.txt` resolution gives no labels; annotations are escaped; the gate's tests run after the backend tests; the wording here.
- Cost: unchanged in the four runs measured (each job rounds up to the minute; the backend job, 99 to 113 seconds, is close to the 2-minute boundary); the weekly workflow about 2 billed minutes a week, of 2,000 a month.

**Limits, recorded:**
- A failing gate is a red check, not a blocked merge: branch protection and rulesets need GitHub Pro for a private repository (API: 403). The rule "no merge without green CI" enforces it.
- CI resolves the backend's indirect packages fresh at each run, while Render keeps what its last build resolved; until step 3's lockfile, a green gate does not prove Render's installed set.
- Render's build tools are not gated (step 3).
- The development-tool findings remain (step 2); Dependabot keeps alerting on them.

#### Stage 3A, part 3, step 1: live record

Merge approved by the user on 1 November 2026 at `ad4aabb`, with the follow-ups. Times UTC.

- Merged at exactly `ad4aabb` with `--match-head-commit`, as `4d404ae`, at 10:13:34.
- CI on `main` at `4d404ae` passed, both gates included.
- The weekly workflow, started by hand from `main` (`workflow_dispatch`, run 41296692210): both jobs passed, "Dependency audit: npm" and "Dependency audit: pypi" each "Passed", both evidence artifacts uploaded. This was a manual run; the first scheduled run is Monday 2 November 2026, 03:23 UTC, checked separately.
- Vercel's production deployment of `4d404ae` successful; no site code changed; Render did not deploy.
- The branch (tip `ad4aabb`, in `main`) and `%TEMP%\aj_gate` (2,836 files) deleted, with the user's approval.

#### Stage 3A, part 3, step 2: development tools, implementation record

Investigation approved by the user on 1 November 2026; after the user asked how significant the remaining advisories were, the user approved fixing everything that has a proper fix and formally accepting the rest, with no forced versions ("no hotfixes or fixes that are not enterprise grade"), and asked for thoroughness. Plan reviewed independently, sound with changes, nothing blocking; its changes applied.

**State before (Verified):** full `npm audit` 47 vulnerable packages, 30 distinct advisories (3 critical, 16 high, 9 moderate, 2 low), all development tools; runtime audit 0; Dependabot 39 open alerts, all development tools.

**Changes (`package.json`, `apps/frontend/package.json`, `package-lock.json`):**
- `ts-jest` ^29.4.14 to ^29.4.15, which needs `handlebars` 4.7.10, past the critical advisory (up to 4.7.9). No behaviour change for this configuration (the review compared the code: only its migration command and full type-checking mode changed; ours uses `isolatedModules`).
- `concurrently` ^8.2.2 to ^10.0.6 at the root, for `npm run dev` (documented in the README): `shell-quote` 1.12.0 and no `lodash`. Its breaking changes (Node 22 or later, ESM only, automatic prefix colours, `--name-separator` removed) do not affect the `dev` script; the project uses Node 24.
- Targeted in-range updates, rather than `npm audit fix`, which changes about ten times more of the lockfile (45 added, 71 removed, 31 changed, including packages with no advisory): `npm update brace-expansion browserslist flatted glob minimatch picomatch postcss-selector-parser`, then `npm update sucrase` (added after the code review: `sucrase` 3.35.1, within Tailwind 3's `^3.35.0`, uses `tinyglobby` instead of `glob`, which removes the build-tool path to `glob` 10). Lockfile: 12 entries added, 9 removed, 21 changed. Resolved: `handlebars` 4.7.10, `shell-quote` 1.12.0, `brace-expansion` 1.1.21 and 2.1.7, `browserslist` 4.29.5, `caniuse-lite` 1.0.30001820, `flatted` 3.4.4, `glob` 10.5.0, `minimatch` 9.0.9, `picomatch` 2.3.2 and 4.0.7, `postcss-selector-parser` 6.1.5, `sucrase` 3.35.1; `lodash`, `date-fns`, `spawn-command`, and `@babel/runtime` removed with `concurrently` 8. Every added or changed entry resolves from registry.npmjs.org with an integrity hash.
- The only non-development lockfile entry changed is `caniuse-lite` (1.0.30001753 to 1.0.30001820), the browser data Next.js reads at build time; it is required by `browserslist` 4.29.5, which fixes two high advisories.
- Not changed, deliberately: the ESLint 8.57.1 copy at the root of `node_modules`, which satisfies the `eslint` peer of `eslint-plugin-import` and `eslint-import-resolver-typescript` (so that plugin runs on ESLint 8 while the lint itself runs ESLint 9.39.5). It brings `minimatch` 3 (with `@humanwhocodes/config-array` and `@eslint/eslintrc` 2.1.4), covered by the acceptance of #116 below. `npm audit fix` would remove it as a side effect; it is a separate, deliberate change. npm now marks ESLint 9.39.5 and 8.57.1 as no longer supported; ESLint 10 is not an option yet, because the import, jsx-a11y, and react plugins (latest versions) accept ESLint only up to 9.

**Results (Verified, 1 November 2026, Node 24.11.0, npm 11.6.1):**
- Audits on the branch: runtime 0; full 39 packages (40 before the `sucrase` update), 3 advisories (2 moderate, 1 low), 0 critical, 0 high.
- The independent code review re-ran the commands from `main` in a clean copy and got a byte-identical lockfile; for the `sucrase` update it verified `npm ci` (lockfile unchanged), 169 tests, 37 lint warnings, and a byte-identical build (38 of 38 browser files, 533 of 533 server and app files). CI on `c190e43` (push run 41320882418, pull-request run 41320887912): lint 37 warnings, 169 tests, the audit gate "Passed", the report artifact 40 packages and the same 3 advisories; the Vercel preview built.
- In two isolated worktrees, `main` (`4d404ae`) and the branch (`597258f`), each without `.env.local`, after a clean `npm ci` that left the lockfile unchanged: lint 0 errors and 37 warnings in both, the same findings by file, line, and rule; 169 tests passed in both; `next build` (Turbopack, `NEXT_PUBLIC_API_URL` a closed local port) succeeded in both; the 65-line route table identical.
- Build output compared file by file: all 38 browser files identical; of 947 server files, 881 identical, 63 different only by the build ID, and 3 (`preview-props.json` and the server-reference manifest, twice) only by the keys Next.js generates for every build. `main`'s build printed "browsers data (caniuse-lite) is 13 months old"; the branch's did not.
- iOS 15: no class static block and no regular-expression lookbehind in the 30 browser JavaScript files.
- `concurrently` 10.0.6, run as `npm run dev` runs it (two commands, each `cd … && …`): both ran, output prefixed, exit 0; with one command failing, exit 1.
- The trial folder `%TEMP%\aj_step2`, both worktrees, and the comparison files deleted.

**Risk acceptance: the three remaining advisories (decided by the user, 1 November 2026; review by 1 February 2027):**

| Advisory | Package and where | Why it cannot be fixed now |
| --- | --- | --- |
| GHSA-gcqx-w48m-w2h4, low (prototype poisoning in `mergeObject()`) | `deepmerge` 4.3.1, used only by `jest-config` to merge Jest's settings | No fixed release exists: 4.3.1, from March 2023, is the latest, and the advisory covers "through 4.3.1" |
| GHSA-3g3m-2fjr-6pw4, moderate (an aborted search keeps reading directories) | `glob` 13.0.6 in Jest 30; also `glob` 10.5.0 in `test-exclude` 7.0.2 (Jest's coverage, through `babel-plugin-istanbul`) | Fixed in 14.0.2, but Jest 30.5.2, the latest, requires `glob` ^13.0.6; `test-exclude` 7.0.2 requires ^10.4.1, and `babel-plugin-istanbul` 8.0.0, the latest, requires `test-exclude` ^7.0.1 (`test-exclude` 8 needs `glob` 13, also affected) |
| GHSA-g3hv-75wg-m249, moderate (denial of service through pattern amplification) | `minimatch` 10.2.6 in `glob` 13, `test-exclude` 7.0.2, and `@typescript-eslint/typescript-estree` 8.72.1; 9.0.9 in `glob` 10; 3.1.5 in ESLint 9 and the `@eslint/config-array` and `@eslint/eslintrc` versions it uses, and in the import, jsx-a11y, and react ESLint plugins; 3 in the ESLint 8.57.1 copy (`eslint`, `@humanwhocodes/config-array`, `@eslint/eslintrc` 2.1.4) | Fixed in 11.0.1, but every one of these requires an earlier major: the latest ESLint, 10.14.0, still requires ^10.2.6, the latest `@eslint/config-array` ^10.2.4, the latest `@eslint/eslintrc` ^3.1.5, the import, jsx-a11y, and react plugins (latest) ^3.1.2, typescript-eslint 8.72.1 ^10.2.2 |

- **Why the risk is accepted:** none is in the live site or the backend; the lockfile lists every vulnerable copy as development only, and the runtime audit is 0. They are installed in CI, in Vercel's build environment, and on developers' machines, and run in CI and locally (tests and lint); the Vercel build does not load the vulnerable `glob`. Each needs attacker-controlled input (the objects merged, a cancelled search, a crafted pattern), and here that input is our own configuration in a private repository, where only we run CI, so a change to it is already a change to the code. The worst case is a slow or stuck build or test run; no data access or code execution. Forcing versions the parents do not support (npm `overrides`) would risk the test and lint tools that protect the code, and is not done.
- **No entry in `.github/audit-exceptions.json` is needed:** the gate fails only on runtime high and critical findings.
- **Triggers to act before the review date:**
  - `minimatch`: ESLint, `@eslint/config-array`, `@eslint/eslintrc`, the import, jsx-a11y, or react ESLint plugins, typescript-eslint, or `glob` releasing a version that allows `minimatch` 11.0.1 or later;
  - `glob`: Jest, `babel-plugin-istanbul`, or `test-exclude` allowing `glob` 14.0.2 or later;
  - `deepmerge`: a fixed release, or Jest replacing it;
  - any of the three re-rated high or critical, or a public exploit;
  - any of them appearing in a non-development lockfile entry (the live site or the backend).
- **Scope:** this acceptance covers only these three advisories in these packages; a new advisory against them is judged on its own.
- **Monitoring:** the agent raises the check at the first working session of each month, and the user decides. The check reads the latest weekly "Dependency audit" run's report artifact (the full `npm audit`) and the Dependabot alerts, dismissed ones included (a dismissed alert does not reopen if its advisory is re-rated), and compares them with the triggers. Each check's date and result are added to the ledger's monthly-check row. Dependabot's automatic security pull requests are off, and there is no `dependabot.yml`.
- **When a trigger fires:** the agent reports it, reopens the alert (`state=open`), and proposes a plan, investigated and approved like any other step.
- **At the review date, 1 February 2027:** the user renews the acceptance with fresh evidence, or it ends and the alerts are reopened.
- **Dependabot:** after the merge, once the other 36 alerts show as fixed, the three alerts for these advisories (#114 `deepmerge`, #115 `glob`, #116 `minimatch`) are dismissed as "risk is tolerable" with a comment of at most 280 characters pointing here; reversible.

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

Widened on 30 October 2026 (`growth-and-seo-plan.md`, decision 4): it also covers domestic nonprofit and charity employers in the US, UK, Australia, Canada, and Europe, found and ranked by size through the public charity registers (the IRS Business Master File, the UK Charity Commission register, Australia's ACNC register, Canada's list of registered charities, and European registers and networks). Each record gains two columns: which keyword families the employer serves, and which fields and reuse terms its recruitment system exposes. Requests to employers' own sites stay at one or two, spaced, per organisation; search-engine results are used first.

## Open risks after stage 1 (26 October 2026)

- Closed on 27 October 2026 by PR #50: the public endpoints (`/api/db/status`, `/api/search/status`, `/api/search/parse`, `/api/search/autocomplete`) no longer return raw error text.
- Stage 3, verified on 28 October 2026 (design above):
  - one public leak: `/api/search/facets` returns database-URL parsing errors that can quote part of the password;
  - database connection-string errors can quote the password into Render's log;
  - about 64 admin-side places return raw error text;
  - no log redaction.
- Frontend proxies pass error text through (stage 4).
- `/api/db/status` is public and lists every source's internal ID and job count (stage 7).
- The backend and diagnostic checks connect as `postgres` (stage 6); the rule against printing secrets is not enforced by tooling (stage 5).
- Closed on 28 October 2026 by PR B ([PR #60](https://github.com/AidJobs/AidJobs/pull/60)): crawl locks now expire and are recovered, and a run writes only while it owns its source. The known stall is reduced by PR A (#55) but not removed: about 1–2 seconds when a process is cold.
- Found in the stage 1 reviews, not yet assigned: `verify_internal_api_key` compares keys with `!=` rather than a constant-time comparison; an unauthenticated caller can make the server parse a request body on admin routes before the guard runs; `app/job_management.py`'s router is included twice; `app/shortlist.py` remains in the repository, unreferenced. Assigned on 30 October 2026 (stage 3A, "Assigned the same day").
- Found on 30 October 2026: known vulnerabilities in the frontend's and backend's dependencies, and no dependency alerts or audit (stage 3A). Dependabot alerts on since the same day; the backend's direct pins fixed by parts 1 and 1b; the CI audit is still part 3, and Next.js is part 2.

## Safeguards for every stage

- Do not modify, stage, reset, clean, or discard `apps/backend/scripts/diagnose_enrichment_bias.py` or `tests/test_link_heuristics.py`.
- No crawl, no database write outside an approved step, no tag change, no branch deletion, no manual deploy, no production setting change without the user's explicit approval.
- Never print a secret or a connection string. Checks report set or not set, lengths, or matches only.
- Delete a branch only with the user's approval, and only after confirming it has no commit outside `main`. (`docs/ux-31-done` was checked and deleted that way on 28 October 2026.)

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
