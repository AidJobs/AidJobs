# AidJobs — Security hardening plan

**Status:** approved in principle by the user on 26 October 2026, including the order below. This is approval of the direction only. Each stage needs its own defined scope, reviewable changes, tests, and the user's explicit approval at every step (plan, implement, merge). Nothing here approves a database change, a credential change, a production setting change, or a crawl.

**Priority:** set by the user on 26 October 2026. This plan runs before UX-11; UX-11 resumes as stage 8, with a plan for the user's approval.

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
| 0 | Supabase log review for the exposure window | The user; pending |
| 1 | Close the public surface | [PR #51](https://github.com/AidJobs/AidJobs/pull/51), `bd4264d`, CI green; awaiting the user's review |
| 2 | Crawl-lock recovery | After stage 1 is merged and verified |
| 3 | Backend error handling and logging | Design first, for approval |
| 4 | Frontend proxy error handling | After stage 3 |
| 5 | Tooling guard against printing secrets | Proposal first |
| 6 | Least-privilege database roles | Plan only, after stages 3 and 4 are reviewed |
| 7 | Two design decisions: readiness check, public database status | Each its own decision |
| 8 | Resume UX-11 | Plan first, for the user's approval |

The documentation is updated after each stage is merged and verified live. It records what was done; it is not a substitute for the control itself.

### Stage 0. Supabase log review

The user reviews Supabase's database logs for unfamiliar connections between about 14:15 and 14:45 IST on 26 October 2026 (08:45–09:15 UTC). Limits: an unfamiliar connection is not necessarily malicious, a familiar one is not proof of authorisation, the absence of entries does not prove the credential was unused, and the free plan keeps logs briefly. The agent does not access database settings or credentials for this stage, and no secret is pasted into the chat.

### Stage 1. Close the public surface

- Unmount the server shortlist router. `app/shortlist.py` and the `shortlists` table stay unchanged; a server shortlist returns only with authentication and the user identity taken from the session.
- Serve `/docs`, `/redoc`, and `/openapi.json` only when `AIDJOBS_ENV=dev`.
- A test of the real public surface: the routes a freshly built production app exposes without credentials must equal a reviewed list; every protected route must refuse a caller without credentials; the shortlist is absent; the docs follow `AIDJOBS_ENV`.
- **Done when:** merged with the user's approval; production answers 404 for the docs and the shortlist on the backend's own address; health, database status, search, `/v2`, and the admin login still work.

### Stage 2. Crawl-lock recovery

Plan, then implementation, as a separate crawler-reliability pull request. Required:

1. Locks that expire unless the running crawl keeps renewing them.
2. Recovery of runs abandoned by a restart: detect them, mark them, and release their locks safely.
3. Marking interrupted work during shutdown where possible, never as the only recovery.
4. A worker that has lost its lock (expired or taken over) must not go on acting as its owner.

Tests: interrupted crawls, restarts, expired locks, recovery, and concurrent workers. No existing lock is cleared by hand or automatically as part of preparing this.

**Until this is merged and verified:** after every merge, the post-merge check includes a read-only query for sources holding a lock with no live crawl behind it. A finding is reported to the user, never cleared.

### Stage 3. Backend error handling and logging

Design first, for the user's approval, then implementation. The design gives:

- The shared error contract: fixed, safe messages; appropriate HTTP status codes; a request ID on every response that matches the server log line; consistent handling of expected and unexpected failures.
- The verified and classified inventory of unsafe patterns (above), false positives named.
- A redaction filter on the logging system for connection strings, password parameters, bearer tokens, and key shapes, applied to every logger.
- A regression test that fails if exception text is put into a response again.
- How [PR #50](https://github.com/AidJobs/AidJobs/pull/50) fits. PR #50 (`f7645ef`, CI green, open, not merged) gives generic messages on the four public endpoints and masks the database-status log line. It is not merged or extended without the user's approval; if its pattern would need replacing straight away, the design proposes the replacement.

### Stage 4. Frontend proxy error handling

One shared proxy helper for the route files under `apps/frontend/app/api/`: the intended status codes and response shapes pass through; the backend's error text and Node's error messages do not. Tested.

### Stage 5. Tooling guard against printing secrets

A proposal for a Cursor project hook, or another enforceable guard, that blocks common direct attempts to print `.env` files or connection strings, with a safe way to check whether a setting is present (set or not set, never the value). Tested against blocked and permitted commands. It does not claim to prevent every possible disclosure.

### Stage 6. Least-privilege database roles

A plan, after stages 3 and 4 are reviewed. It inventories the tables the backend reads and writes, the functions and privileges it needs, the existing Row-Level Security policies, schema-migration needs, the admin operations that run schema changes, and the rollback and verification steps. It separates an application role from a read-only diagnostic role. No role, grant, credential, or Render setting changes until the user approves the plan; the user then makes the changes step by step.

### Stage 7. Two design decisions

- **Readiness:** keep Render's health check on liveness. First establish which path Render uses and what Render does when the check fails; do not point Render at a check that depends on the database without that analysis. A separate readiness check, if needed, may belong with UX-28 error monitoring.
- **Public database status:** `/api/db/status` lists every source's internal ID and job count. Inventory its callers first (the admin dashboard calls it), then propose the minimum public response and where the detail moves.

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
- UNDP's crawl started at 13:48 IST and was still "running / queued", with its lock held, at 14:22 IST. The backend restarted for the PR #49 deploy at about that time; that this cut the crawl off is an inference, not verified.
- Extraction path (Repository): the new-extractor allowlist compares the exact host after removing a leading `www.`, so `jobs.undp.org` does not match `undp.org`, and MSF is not listed (the allowlist values are as recorded in ledger W-23, not re-read on Render). On the HTML path the new extractor is called with shadow mode off, so the shadow-mode setting is not a dry run; jobs from either extractor pass the same admission check into the live `jobs` table. For jobs whose link contains `undp.org`, the crawler opens every job page for detail, without the 50-job cap.
- The user then deleted both sources permanently, to keep the focus on the planned work; the database counted 3 sources at 15:10 IST (Verified). The permanent delete also removes a source's crawl records and lock (Repository).
