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
- Live on Render, 27 October 2026: during an ICRC crawl the user ran from the admin at 16:25 IST (by then with PR #56 too), the health checks kept their 5-second rhythm, longest gap 6 seconds over 63 checks, against 70 seconds of silence on 26 October; no failed instance (ledger W-32). One crawl of one source, not a proof for UNDP-sized listings.
- Follow-ups, tracked in the ledger rather than as GitHub issues (decided by the user, 27 October 2026): `core/ai_normalizer.py`'s `normalize_deadline` still calls `dateparser` with every locale, synchronously, inside an async function (lines 163–174; W-13, closed by PR #58, which removes the AI normaliser from the crawl path); two-digit years read as the 2100s (W-12) and the cut at any capital "T" (W-32) are fixed in [PR #56](https://github.com/AidJobs/AidJobs/pull/56), merged as `c86984e` and live-checked, together with ICRC's missing deadlines.

**PR B, crawl-lock recovery: design decided by the user on 27 October 2026; implementation not yet approved.** The design replaces requirement 1 above: the user chose no heartbeat. Safety comes from run ownership checked under row locks, not from the expiry time; the expiry only decides how soon a dead crawl is recovered. The full specification follows, written on 27 October 2026 against the code on `main` after PR #58 (`51c6299`), for an independent review before the user decides on implementation.

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
  - Inserting or updating a job takes a key-share lock on its source row, through the foreign key (review).
- **Repository: the lock and its run are not linked.** `crawl_locks` has no run id. The acquire step writes `locked_at = NOW()` and `ran_at = NOW()` in one transaction, so the two timestamps are equal. That equality identifies the run that owns a lock (review).
- **Repository and not verified: issue #5.**
  - In the HTML crawler, a database error on one job is caught and the loop continues. It is not verified that this aborts the transaction so that the final commit silently rolls the whole batch back while the crawl reports `ok`. The first PostgreSQL test will show it.
  - The RSS and API crawlers have no per-job catch: their whole save rolls back and reports `failed` (review).
- **Versions.** Production runs Python 3.11.9 and uvicorn 0.32.0, which CI uses. The local environment runs Python 3.14 and uvicorn 0.54.

**B. Settings.** Read from the environment, with defaults. No Render change is needed.
- `CRAWL_TIME_LIMIT_MINUTES`: 15.
- `CRAWL_LOCK_TTL_MINUTES`: 25. It must be longer than the time limit plus 6 minutes (finishing plus one scheduler interval); the code refuses a value that is not. This holds only because both clocks start when the lock is taken (C1).

**C. Design.**

1. **One clock (review).** A run's lock age and its time limit both start when the lock is taken.
   - **Scheduled crawls** (the scheduler and `run_due`) take one of the 3 concurrency slots first, and only then the lock. A crawl queued behind others therefore holds no lock while it waits.
   - **The admin "Run" route** keeps the contract: it takes the lock at once and returns the run's id. Its time limit runs from that moment. If no slot frees before the limit, the run ends as `interrupted` ("no free crawl slot"), is not counted, and keeps its next-run time.
   - **`POST /api/admin/crawl/run_due`** starts the due crawls as tracked tasks and returns at once, with the number started. It no longer holds a request open while the crawls run, and so no longer delays shutdown.
2. **Ownership token.** The token is the run's `crawl_logs.id`.
   - It is passed explicitly, from `execute_run` to `crawl_source(source, run_token)` and on to all three crawlers' `save_jobs(..., run_token)`. It is never stored on the shared crawler instance.
   - The token is mandatory: `save_jobs` without a token, or with one that does not identify a running run of the same source, writes nothing and raises `OwnershipLost`.
   - Each crawler's broad `except` in `crawl_source` turns that error into `failed`. That is harmless, because the finish of a run it no longer owns writes nothing (review).
3. **Database steps.** Each locks rows in one order: the run rows (R), then the lock row (L), then the source row (S), then job rows (J). The source row is locked with `FOR NO KEY UPDATE`, which does not block the key-share locks that job writes take through the foreign key (review). Each step sets `SET LOCAL lock_timeout = '5s'`, `statement_timeout = '30s'` and `idle_in_transaction_session_timeout = '60s'`, so a stuck database cannot hold these locks indefinitely (review).
   - **Acquire.**
     - `INSERT INTO crawl_locks … ON CONFLICT DO NOTHING RETURNING`, then `INSERT INTO crawl_logs (… 'running' …) RETURNING id`, then commit. This keeps Gate 5's statement order.
     - The new run row cannot be contended, because no other transaction knows it exists, so taking L before R here cannot deadlock.
     - On a conflict with a live lock (younger than the lifetime), roll back and return the live run's id, found as the running row whose `ran_at` equals the lock's `locked_at`. This keeps the contract's "a duplicate request returns the open run".
   - **Take over**, only after a conflict with an expired lock.
     - Lock every running row of the source, ordered by id.
     - Lock the lock row only if it is still older than the lifetime; otherwise roll back and return the live run's id as above.
     - Mark the owning run `fail` ("lock expired, cause unknown") and any other running row `interrupted`. Delete the lock, count one failure on the source (C4), and commit. Then acquire again.
     - A lock with no owning run, as left before PR B, is taken over the same way, with only the lock to remove.
   - **Save.**
     - The first statement is `SELECT 1 FROM crawl_logs WHERE id = %(token)s AND source_id = %(source)s AND status = 'running' FOR SHARE`. If no row comes back, roll back and refuse.
     - Then the job writes, each under its own savepoint (C6), and commit.
     - A takeover's `FOR UPDATE` waits until a save in progress commits; every save after the takeover is refused.
   - **Finish.**
     - `UPDATE crawl_logs SET … WHERE id = %(token)s AND status = 'running' RETURNING id`. If no row comes back, roll back and change nothing: no counter, no lock, no source field.
     - Otherwise delete the lock, update the source (C4), and commit. This replaces today's separate lock release in `finally`; a crawl cannot release a newer run's lock.
     - If the finish itself fails, it is retried once. If that fails too, the lock stays until the lifetime passes and recovery counts the run once (review).
   - **Recover.** At scheduler start, and before every scheduler round, each source in its own transaction:
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
   | Shutdown, cancelled cleanly; or no free slot before the limit (manual run) | `interrupted` | `interrupted` | unchanged the first time; +1 if the source's last status was already `interrupted` (review) | unchanged the first time, so it runs again at the next check; with back-off when counted |
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
   - A save already running in a worker thread (C9) cannot be cancelled. It completes under its own ownership check, and the finish waits for it on the run row.
   - Code that blocks the event loop cannot be timed out. Render replaces such a process, and recovery handles it after the lifetime.
8. **Shutdown.**
   - The orchestrator keeps a reference to its scheduler task and to every running crawl's task: from the scheduler, `run_due`, and the admin "Run" route.
   - `stop_scheduler` stops new crawls, cancels the tracked tasks, and waits until a deadline 20 seconds after it starts. Each cancelled crawl records `interrupted` (C5) through a shielded, ownership-checked finish. Whatever is not finished by the deadline is left to recovery.
   - With `run_due` no longer holding requests open (C1), uvicorn's wait for open requests is short. But the 20 seconds start only after it, and nothing guarantees they fit inside Render's 30. A graceful-shutdown timeout in Render's start command would bound it; that is a setting change for the user's approval, not part of PR B (review).
9. **Off the event loop.** Every orchestrator database step, and `save_jobs`, run in a worker thread (`asyncio.to_thread`), so a slow database or a larger save cannot block the health check.
   - The admission-rejection log, the `raw_pages` insert and the extraction logger run in the same worker thread, and their connections get a 10-second connect timeout (review).
   - `crawl_source` copies the listing report into a local variable before the save. No per-crawl state is read from the shared instance after an `await` (review).
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
- `.github/workflows/ci.yml`: a `postgres:17` service, `TEST_DATABASE_URL`, the new test file in the Ruff and pytest lists, and a step that fails if any of its tests is skipped.
- Tests and documents as listed in F.
- No frontend change, unless the preview shows `interrupted` wrongly.

**F. Tests.**
- **The test database must never be production (review).**
  - The tests accept only a `TEST_DATABASE_URL` whose host is `localhost` or `127.0.0.1` and whose database name ends in `_test`. They refuse anything else before connecting.
  - They never read `SUPABASE_DB_URL` or `DATABASE_URL`: the test fixture removes both from the environment, and no test imports a module that loads `.env`.
  - Locally they skip without `TEST_DATABASE_URL`. In CI (`CI=true`), a missing variable is a failure, and the CI step fails if any test in the file is skipped.
- **The schema (review).**
  - A committed test schema, `apps/backend/tests/sql/crawl_schema.sql`, is written from one read-only production query, with the user's approval. It covers the columns, constraints, foreign keys, triggers and indexes of `sources`, `crawl_logs`, `crawl_locks` and `jobs`.
  - `infra/supabase.sql` cannot be used as it stands: it lacks columns the writer uses (`is_remote`, the geocoding and quality fields, `organisation_id`), and its policies refer to Supabase roles.
  - A test checks that every column `persist_candidate` writes exists in the schema.
- **New `tests/test_crawl_ownership.py`, against real PostgreSQL 17.** Concurrent steps run on separate connections and threads, with barriers that force each interleaving. Cases:
  - two acquisitions at once: one token, and the other returns the live run's id;
  - four or more due sources with 3 slots: no queued live run is taken over (review);
  - two HTML crawls at once keep their own listing reports (review);
  - a save racing a takeover: the save completes, and the stale worker's next save is refused;
  - a stale worker's save, finish and release all change nothing; the new owner's lock, run and source are untouched;
  - exactly one failure counted for each of: a timeout then recovery; a lock expiry then a late finish; two recoveries at once;
  - recovery leaves a live lock alone, including two orchestrators overlapping as in a deploy;
  - an orphaned running row beside a live run is marked `interrupted`, and the live run keeps its lock (review);
  - a slow but live crawl keeps its ownership up to the limit;
  - a shutdown cancellation records `interrupted`, unchanged the first time and counted the second time in a row;
  - a manual run with no free slot before its limit ends `interrupted`;
  - a hard kill is recovered after a shortened lifetime and counted once;
  - forced interleavings of takeover against finish, save against takeover, and save against an admin soft delete do not deadlock, or are handled per job (review);
  - job rows, `deleted_at` and expiry fields stay byte-identical on every failure path;
  - a save without a token, or with a foreign one, writes nothing;
  - issue #5: first today's behaviour, shown on `main`'s code; then the savepoint behaviour;
  - a manual run of a paused source stays paused, and a source soft-deleted mid-crawl stays deleted (review);
  - `run_due` returns at once;
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
- **A crawl blocked inside code that does not pause** still holds its lock until Render replaces the process and the lifetime passes. Recovery runs only between scheduler rounds, and a round waits for its crawls, so the delay can reach about 45 minutes: a 25-minute lifetime, plus a 15-minute round, plus a 5-minute interval (review).
- **The shutdown window** depends on uvicorn's wait for open requests (C8).
- **Not verified:** the free plan's spin-down signal and the session pool's size.
- **Issue #5's mechanism** is to be shown by the first test before the code changes. If it is wrong, C6 is re-planned.

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
