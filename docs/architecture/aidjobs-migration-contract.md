# AidJobs Architecture Reset & Migration Contract

**Status:** Authoritative migration contract  
**Repository:** https://github.com/AidJobs/AidJobs  
**Purpose:** Controlled consolidation of the existing AidJobs repository into one secure, testable, production-trustworthy architecture.

This file is the single text of the contract. It replaces earlier drafts. Do not keep a second copy of these rules in an appendix that can disagree with the body.

---

## Execution protocol

This document is not permission to modify application code.

```text
READ THIS DOCUMENT
        ↓
PREFLIGHT AUDIT — READ ONLY
        ↓
REPORT FINDINGS
        ↓
STOP
        ↓
USER: APPROVE PREFLIGHT
        ↓
DETAILED IMPLEMENTATION PLAN FOR ONE GATE
        ↓
STOP
        ↓
USER: APPROVE PLAN
        ↓
IMPLEMENT THAT GATE
        ↓
VERIFY
        ↓
REPORT
        ↓
STOP
        ↓
USER APPROVAL
        ↓
NEXT GATE
```

During preflight:

- Do not modify any file other than this contract when the user has explicitly asked for the contract itself to be written.
- Do not install dependencies if that can change lockfiles.
- Do not run formatters, auto-fix linters, generators, migrations, seeds, deploys, or git commands that rewrite the worktree.
- Read-only commands are permitted.
- If it is unclear whether a command can change state, do not run it.

Do not implement this document as one task. Do not start the next gate until the previous gate’s verification has been reported and approved.

The current repository is the source of truth for current behaviour. Previous audits are historical evidence. Before implementing a historical finding, classify it as:

- STILL TRUE
- PARTIALLY FIXED
- FIXED
- NO LONGER APPLIES
- INCORRECT / COULD NOT VERIFY
- NEW FINDING

If the repository materially contradicts this document, stop and report the contradiction.

Repository facts and production facts are different. Label each production claim `VERIFIED` or `NOT VERIFIED`. Do not treat `env.example`, README text, or this contract as proof of the live Render, Vercel, Supabase, or Meilisearch configuration.

---

## 1. Purpose

Make the existing AidJobs product coherent, secure, maintainable, testable, and operationally reliable.

This is not a greenfield rewrite. Preserve working extraction behaviour. Do not build a second architecture beside the first. Consolidate the system that already runs.

---

## 2. Product scope

AidJobs V1 is an admin-curated job discovery platform for charities, NGOs, INGOs, development organisations, funding agencies, and related organisations.

Users do not submit career sources. Admins control organisations and the career sources that are monitored. The public product helps people find jobs and sends them to the employer’s application URL. AidJobs is not the employer’s application system.

Out of scope for this migration: payments, CV processing, rewards, user accounts, recommendation systems, new public search features, enrichment expansion, and taxonomy-management features.

---

## 3. Target flow

```text
Admin
  ↓
Organisation
  ↓
Career Source
  ↓
CrawlRun
  ↓
Fetch
  ↓
Extract
  ↓
Normalise
  ↓
Validate
  ↓
Canonical identity match and write
  ↓
Upsert
  ↓
Lifecycle observation
  ↓
Postgres commit
  ↓
Search projection
  ↓
Public search
  ↓
Employer application URL
```

There is one production path through these stages.

PostgreSQL is authoritative for organisations, sources, crawl runs, jobs, lifecycle, moderation, and provenance. Meilisearch is a derived index. If Meilisearch is emptied, it must be rebuildable from Postgres. Search-index state is not authoritative.

A normal job write must eventually produce a search projection. A full reindex is recovery, not the ordinary way a crawled job becomes searchable. The crawl request must not wait on Meilisearch.

While a projection is pending, a healthy Meilisearch must not be the only view of committed changes. SQL search remains available during that lag and when Meilisearch is down. Gate 7 states the acceptance tests for this rule.

---

## 4. One pipeline, one orchestrator, one writer

Do not create `crawler_v3`, `new_pipeline`, another orchestrator, another auth module, another job table, `jobs_side`, or any shadow catalogue used for comparison.

Manual admin crawls and the scheduler both use `CrawlerOrchestrator` in `apps/backend/orchestrator.py`. That behaviour is the baseline to consolidate.

These must not remain production orchestration paths once their replacements are proven and their callers are gone:

- `crawler_v2/orchestrator.py` (`SimpleOrchestrator`)
- `apps/backend/app/crawl.py`

There is one job writer. HTML, RSS, API, browser extraction, and AI extraction all pass validated jobs through the same identity match and the same upsert. `SimpleRSSCrawler` and `SimpleAPICrawler` do not keep private insert/update rules after that consolidation.

The production orchestrator must stop invoking any `jobs_side` writer as soon as the shared upsert is on the production path. Deleting the unused shadow code waits until the legacy-removal gate, after callers are gone.

Nothing in this contract authorises a second crawler pipeline, a new `crawl_runs` table when `crawl_logs` can be extended, a second Render worker without a demonstrated need, a new canonical identity algorithm, an identity backfill, a historical normalisation rewrite, an `ARCHIVED` state, a second authentication system, or a second catalogue.

---

## 5. Domain model

### Organisation

A first-class Organisation is the parent of a Source. Do not treat the `sources` table itself as the organisation model.

Minimum conceptual fields: `id`, `name`, `slug`, `type`, `website_url`, `status`, `created_at`, `updated_at`.

`type` may preserve existing labels such as UN, INGO, NGO, academic, private, and other. Do not build a taxonomy product in this migration.

Today the repository stores `sources.org_name` and `jobs.org_name` as text. Keep that text until an organisation backfill has been verified. Do not guess that similar names are the same organisation. Do not drop `org_name` in the same change that adds `organisation_id`.

For new writes, `job.organisation_id` is derived from `source.organisation_id`. The job must not independently choose an unrelated organisation.

### Source

Preserve and extend `sources`. A source is one monitored career URL for one organisation: HTML, RSS, API, or another structured feed. Browser rendering is a fetch strategy, not a separate source type.

Conceptual configuration: organisation, URL, source type, enabled state, schedule, health, failure counters, last crawl, next crawl, and existing source-specific configuration such as `parser_hint`.

Keep operational fields that already exist and are used, including schedule (`next_run_at` or the equivalent already stored), failure counters, crawl locks, and crawl frequency. Do not invent columns because this document names a concept. The physical schema follows the verified production schema when that schema is known, and the repository schema until then, with the difference labelled.

### CrawlRun

Do not create a second `crawl_runs` table beside `crawl_logs`. Extend `crawl_logs` so it can represent a CrawlRun.

A CrawlRun records, as the existing table and later migrations allow: source, start, completion, status, discovered count, valid count, inserted count, updated count, unchanged count, rejected count, failure information, duration, and whether the result was trustworthy for lifecycle use.

An expired count is recorded only after a missing-job expiry policy has been separately approved. Do not add an archived count. This reset does not have an archive state.

Statuses must be distinguishable as running, succeeded, failed, and partial. Use the existing status text unless a versioned migration is separately approved. HTTP 200 is not a trustworthy catalogue.

A partial crawl, including a crawl that did not process every page, must not be treated as a complete catalogue.

### Job

Preserve the existing `jobs` table and its rows. Do not rebuild it, truncate it, regenerate keys, or recreate the catalogue.

Conceptual fields that matter: organisation via its source, source, title, description, location, application URL, deadline, lifecycle, moderation, `first_seen_at` / `last_seen_at`, the existing canonical key, and timestamps. Keep additional columns that current reads and writes actually use. Do not carry every historical column into the conceptual model merely because it exists.

---

## 6. Lifecycle and moderation are separate

Lifecycle and administrative moderation are different facts.

Lifecycle for this reset:

- `ACTIVE`
- `EXPIRED`, only under a rule approved later in a separate written decision

Do not add `ARCHIVED`. Nothing in the current product defines that transition.

Moderation is orthogonal and uses the existing suppression mechanism (`deleted_at` and related columns):

- not suppressed
- suppressed

An active job may be suppressed. An expired job may be suppressed. A suppressed job is not “expired.” An expired job is not automatically suppressed.

### Missing jobs

Do not expire a job because a crawl did not return it.

A transition from `ACTIVE` to `EXPIRED` because a crawl did not see the job requires both:

1. a written trust policy and a consecutive-missing threshold, and
2. explicit user approval of that policy as a decision separate from the implementation pull request.

Until that approval exists, no gate may move an active job to expired, deleted, or hidden because it was absent from a crawl. Stale active rows are the required behaviour.

Gate 6 without that approval may add explicit lifecycle state fields, record CrawlRun observations, and identify jobs that were not rediscovered. It must not expire currently active jobs. “Implement trusted reconciliation” is not permission to invent a trust ratio, an empty-catalogue rule, or a consecutive-missing threshold inside the implementation pull request.

These results are never a complete trusted catalogue:

- HTTP, DNS, timeout, block, rate-limit, or browser failure
- parser failure
- an AI failure that makes extraction unreliable
- an internal exception before a trustworthy extract exists
- zero valid jobs, unless a source-specific empty-catalogue policy has been approved for that source
- a partial page set
- HTTP 200 alone

### Deadline

Remove the hard delete:

```sql
DELETE FROM jobs
WHERE deadline IS NOT NULL
AND deadline < CURRENT_DATE
```

Both call sites must stop in Gate 1:

- the daily call in `CrawlerOrchestrator.cleanup_expired_jobs`, invoked from the scheduler loop
- `POST /api/admin/crawl/cleanup_expired`

A past deadline is information. It is not permission to destroy the row. In Gate 1, do not change public search deadline filters. Stopping the delete keeps the row. Changing who can see it is a later product decision.

Hard delete also risks cascading into `shortlists` because of `ON DELETE CASCADE`. Leaving the row in place preserves that associated state.

### Administrative suppression

If an administrator suppresses a job:

- the suppressed state persists across crawls
- a recrawl must not clear `deleted_at`, clear deletion metadata, or set the job back to active
- restoration is an explicit admin action
- if the same canonical identity is seen again, the CrawlRun records that observation

The current writer that sets `deleted_at = NULL` and `status = 'active'` on hash match must be removed when upsert is consolidated. Do not do that by changing which key is stored.

---

## 7. Canonical identity

The live HTML writer has two existing algorithms behind `use_global_heuristics`:

- algorithm A: `md5` of lowercase `title|apply_url`
- algorithm B: a hash of the normalised URL plus reference, used when global heuristics are on

The repository cannot prove which algorithm wrote production rows, whether the deployed flag is on, or whether historical rows contain both forms. Gate 0 records all three as `NOT VERIFIED` unless a live check establishes them. Gate 0 does not choose a winner. No gate may select a canonical V1 algorithm from repository inspection alone.

Interim rules, until the production setting and the existing-row distribution have been verified and an explicit identity decision has been approved:

- One identity entry point may dispatch to the existing algorithms.
- The write path keeps today’s `use_global_heuristics` branch exactly and stores the key that branch already stores.
- The match path treats an existing row as the same job if either existing algorithm’s key hits.
- A hit does not replace the stored key with the other algorithm’s key.
- Do not delete either algorithm.
- Do not regenerate existing keys.
- Do not write `canonical_key_version`, and do not infer one, during this reset.
- Gate 4 does not choose an identity winner and does not perform an identity migration.

The eventual identity decision may be that one existing algorithm becomes version 1, or that both historical forms require their own migration. That decision is outside Gate 4. A redesigned identity algorithm is out of scope. If it ever happens, it is versioned, backfilled, checked for collisions and duplicates, and reversible. It is not part of this reset.

---

## 8. Upsert

One upsert receives a validated job and does not care whether extraction used JSON-LD, DOM heuristics, RSS, API, AI, or a browser.

Gate 3 fixes these outcomes as tests. Gate 3 names the validated field set used to tell unchanged from updated. Do not add a second content hash in Gate 1.

**Case A — unchanged, not suppressed.** Same identity, same validated fields, row is not administratively suppressed:

- the same `jobs` row is retained
- `last_seen_at` advances to the current crawl observation
- the CrawlRun records the result as unchanged
- no second row is created

**Case B — updated, not suppressed.** Same identity, validated fields differ, row is not administratively suppressed:

- the same `jobs` row is retained
- only permitted validated fields are updated
- `last_seen_at` advances
- the CrawlRun records the result as updated
- the stored canonical key and the moderation state are not permitted fields and do not change

**Case C — rediscovered, administratively suppressed.** Same identity, row is administratively suppressed:

- the same row remains suppressed
- moderation columns do not change
- the CrawlRun records that the suppressed job was seen again
- `last_seen_at` may advance as an observation
- the result is not “updated”
- the crawl must not restore or unsuppress the row

**Case D — new.** No existing row for either existing identity key:

- insert one row
- the CrawlRun records the result as created

Repeated crawls of the same identity must not create a second row. “Unchanged” still advances `last_seen_at`. Skipping the write is not allowed.

---

## 9. Fetch

Fetch is a stage. Source adapters do not each invent a network policy.

```text
Source URL
  ↓
Fetch policy
  ↓
HTTP, browser, RSS, or API
  ↓
Fetched content
```

Every server-side outbound navigation uses the same policy, including admin source tests, HTML crawls, RSS, API calls, link validation, and browser fallback.

The public Find & Earn arbitrary-URL fetch is removed in Gate 1. It is not retained as a public fetcher behind extra checks. If an authenticated admin source-test remains, it uses this same policy.

The policy rejects non-http(s) URLs and these destinations, including after DNS resolution and on every redirect:

- `127.0.0.0/8`
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `169.254.0.0/16`, including cloud metadata addresses
- IPv6 loopback and IPv6 link-local
- other private, reserved, and link-local ranges
- internal hostnames where the environment can name them

Invariant, not a prescribed socket API: the address actually connected to or navigated to must be an address the policy has already evaluated and permitted. A pre-check that approves one resolution and then lets the client resolve the hostname again does not comply. Every redirect destination is evaluated under the same policy. If a browser fetch cannot show every destination it will open, that fetch fails closed.

Do not weaken the admin cookie by setting `SameSite=None`.

Enforce a timeout, a redirect limit, and a maximum response size before the body is fully buffered. Use the existing `max_kb_per_page` idea as the size cap. Preserve useful retries. Do not turn a failed source into an unbounded retry loop. Keep the existing source pause behaviour at repeated failures, centralised rather than copied.

HTTP and browser rendering are fetch strategies. HTML, RSS, and API are source and extract differences. Do not add a source type only because a page needs Playwright.

---

## 10. Extract, normalise, validate

Extract produces candidate jobs and does not write SQL. Preserve proven behaviour where tests show it is useful:

- JSON-LD and other structured data
- DOM and link heuristics
- organisation-specific plugins that already help, including UNDP, UNESCO, UNICEF, Amnesty, and Save the Children
- RSS and API extraction
- browser-rendered extraction
- the current AI order

Do not change whether AI is primary or fallback while splitting the crawler. Characterise the current order first. The crawler must still run when OpenRouter is unavailable. Do not enable AI for a source merely because `OPENROUTER_API_KEY` is present if that source’s current path does not use it. Do not remove AI because a cleaner architecture would prefer rules only.

There is one normalisation contract for new crawler writes. It may clean title, whitespace, location representation, employment type, remote, experience level, URLs, and dates. It must not invent facts.

The search reindex path reads existing stored columns and builds the search projection from them. Reindex does not reinterpret historical rows, does not generate a new canonical identity, and does not rewrite database rows to make them conform to the new normaliser.

Validation runs before the authoritative write and applies to every source type. Move the current emergency guards here after tests characterise them. Reject at least:

- `mailto:` application URLs
- search and pagination URLs
- root career pages when they are not a job posting
- placeholder application URLs, including `https://placeholder.missing-url/...`
- missing identity required for the frozen key algorithms
- candidates below the current quality threshold where that threshold is shown to block bad rows

A rejection is recorded on the CrawlRun as a rejection or validation failure. Do not insert a side catalogue, a quarantine table of jobs, or a promotable shadow row. A rejected record must not later be promoted by a second writer.

---

## 11. How to change `SimpleCrawler`

Do not rewrite `crawler_v2/simple_crawler.py` in one change. Do not run a second writer for comparison.

For each stage:

1. Capture small, deterministic HTML, RSS, or API excerpts under the test tree. The large scraped pages under `raw-html/` may stay as investigative material. They are not the long-term fixture oracle. Do not make line-ending noise or full employer pages a dependency of the extraction suite.
2. Record current outputs.
3. Extract the stage.
4. Call the extracted stage from the existing production path.
5. Confirm the same outcomes.
6. Only then delete the duplicated copy.

The first slice of Gate 4 makes the HTML path call shared validate, identity, and upsert stages, leaves both identity algorithms in place, and stops the production path from writing `jobs_side`. Before Gate 4 is complete, RSS and API writes use that same validation, identity, and upsert path. Shadow-mode writing is not an alternative catalogue. Legacy shadow code may remain on disk, uncalled, until Gate 10.

---

## 12. Crawl execution

`POST /api/admin/crawl/run` must not block on the full crawl, Playwright, a large download, or AI extraction.

```text
POST /api/admin/crawl/run
  ↓
create or reuse a CrawlRun
  ↓
return that CrawlRun id
  ↓
the existing process executes the same orchestrator path the scheduler uses
```

`crawl_logs` remains the CrawlRun store. If a CrawlRun for that source is already queued or running, return that CrawlRun. Do not enqueue a second run because of a double click or a retried request. The existing per-source lock may enforce this.

Do not add a second Render service unless this process is shown to be insufficient. If a separate worker is actually required, document the process, queue, deployment, concurrency, recovery, visibility, and cost, and stop for approval before creating it.

Keep crawl locks, the concurrency cap, and the per-pass source cap.

A failed or partial CrawlRun updates source health and failure counters as today’s useful backoff does. It does not expire jobs.

---

## 13. Search projection

After one upsert exists, Postgres writes drive a derived projection. An outbox, if needed, is rows in Postgres, not another job store and not a new broker. Do not introduce an outbox until the single job writer exists. Conceptual fields: `job_id`, operation (`create`, `update`, `remove`), timestamps, attempts, and error.

Projection failure does not roll back the job row. The job remains readable through SQL. Stale Meilisearch state must be visible operationally.

SQL fallback when the Meilisearch client errors is required and is not sufficient. Gate 7 must handle a healthy Meilisearch that has not yet applied a committed Postgres change. The implementation plan chooses and tests one explicit policy, for example pending rows included through a defined SQL path, or the previous index kept until a rebuilt index is swapped in. The acceptance tests are:

- A job committed to Postgres but not yet projected to Meilisearch must be discoverable through the defined public-search path without requiring a manual reindex.
- A job removed from the eligible Postgres result set must not remain publicly discoverable solely because its Meilisearch document is stale.

A monitoring metric alone does not pass Gate 7.

Rebuild reads eligible Postgres rows, replaces the derived index, and removes documents that are no longer eligible. Rebuild is `POST`, admin-only, and not a step of ordinary crawling. Do not empty the live index in front of traffic if a swap or equivalent non-empty handoff is available. Mutating `GET /admin/search/reindex` is removed in Gate 1.

The public search UI, including `HomeClient`, stays unless a later product change says otherwise.

---

## 14. Authentication and admin API

One admin authentication implementation: `apps/backend/security/admin_auth.py`. HMAC session, httpOnly cookie, `Secure` outside local development, `SameSite=Lax`, explicit expiry, constant-time signature comparison, required secret. Do not set `SameSite=None`.

Do not create a third auth framework. After every caller has moved, delete `apps/backend/app/auth.py`.

`app/auth.py` is in scope because `AIDJOBS_ENV=dev` makes every request an admin, and because it signs the same cookie name with a different scheme than login uses. Gate 1 moves `apps/backend/app/data_quality_logs.py` off `app/auth.py` so one session mechanism interprets that cookie.

Also in Gate 1, by name, inside `security/admin_auth.py`:

- `AIDJOBS_ENV=dev` and an empty `ADMIN_PASSWORD` must not accept any password
- `X-Dev-Bypass: 1` must not authenticate a request

These are separate from `app/auth.py`. If a development bypass remains, it is an explicit opt-in that cannot be reached when the process is configured as production, and it is not the default. `env.example` currently sets `AIDJOBS_ENV=dev`. That is not evidence about Render, and it is not evidence that the bypasses are safe. The live values of `AIDJOBS_ENV`, `COOKIE_SECRET` or `SESSION_SECRET`, and `ADMIN_PASSWORD` are `NOT VERIFIED` until someone checks them.

CSRF control: the admin cookie is set for the Next origin; browser admin calls go through Next `/api/admin/*` proxies; mutations are `POST`, `PATCH`, or `DELETE`; GET does not mutate. Do not add a CSRF-token framework unless a later verified topology shows this control is insufficient.

UI pages may live under `/admin/...`. Backend admin APIs live under `/api/admin/*`. Do not add new backend APIs under `/admin/*`.

Taxonomy and Normalize currently call `/admin/*` on the Next origin. `next.config.js` does not rewrite that prefix. Fixing those screens is part of admin consolidation, not a reason to keep a second API prefix.

Every admin mutation uses the one admin dependency: sources, crawls, jobs, reindex, data quality, and configuration. Dev-only routes must not be a second entrance.

The admin UI gets one authentication boundary. Do not copy session checks into every page. Pages under `/admin` that are operational must not render as if the user were authenticated until that boundary says so.

There is one administrative actor for now. Do not build a role system in this migration.

### Admin V1 navigation

Dashboard, Organisations, Sources, Jobs, Crawls, Data Quality. Settings and logout may remain.

Defer enrichment, the taxonomy editor, the normalize report, advanced analytics, and the server shortlist. Remove Find & Earn from the product path, payment and CV capability flags from the running product, and admin controls that run schema changes.

Source management should show organisation, URL, type, status, schedule, last crawl, next crawl, failure count, recent CrawlRuns, and health, split into pages rather than one multi-thousand-line screen. That split happens in the admin-consolidation gate, not during the security gate.

---

## 15. Database and deployment

Schema changes go through versioned migrations. The application must not `CREATE TABLE`, `ALTER TABLE`, or create indexes from a request.

In Gate 1, disable:

- `POST /api/admin/crawl/run-migration`, so it no longer executes runtime `ALTER TABLE`
- the `GET /api/admin/crawl/status` path that creates `crawl_locks` when the table is missing

Deleting the surrounding legacy UI can wait. The side effect cannot.

Do not assume `infra/supabase.sql` plus `infra/migrations/` matches production. Structural migrations wait until the production schema is verified. An empty-database bootstrap from the repo migration history is a later reproducibility goal. It does not authorise editing production to match the repo file.

Preserve unique `careers_url`, unique canonical identity, and the source/job relationship. Review `ON DELETE` behaviour before any cleanup. Lifecycle work must not cascade into shortlists or other associated rows.

`/api/healthz` is liveness: the process is up. It does not prove Postgres. Readiness, when added, checks required dependencies and must not be described as more than it checks.

Deployment inputs are the repository, environment variables, and migration history. Not manual SQL clicks, not startup DDL, not Replit stubs.

There is no `vercel.json` or `render.yaml` in the repository. Live Vercel, Render, Supabase, and Meilisearch configuration is `NOT VERIFIED`.

CORS must not list the literal origin `https://*.vercel.app` and expect wildcard behaviour. Use an explicit allowlist or a real origin regex. Do not combine credentialed CORS with `*`.

Remove the public exposure of `GET /admin/config/env` and `GET /api/admin/config-check`. If either capability is genuinely required, it must sit behind the single admin dependency and must not expose secret values, lengths, or equivalent configuration evidence.

---

## 16. Tests and CI

A test command that prints a message and exits 0 is not a suite. A workflow file outside `<repository>/.github/workflows/` is not GitHub Actions. The current frontend script exits 0 without running tests. The current workflow file is `apps/backend/.github/workflows/extraction-tests.yml`.

Gate 2 makes repository-root CI run real checks. The blocking bar is backend lint and the tests added in Gate 1, plus a frontend command that does not report success without executing its intended tests. Gate 2 does not require rebuilding the frontend test architecture, rewriting `HomeClient`, or creating a new frontend suite. Existing tests that are demonstrably unrelated to the current product may be documented as not part of the executed suite. They must not be hidden behind `exit 0`.

Required tests as the relevant gates land:

- valid, expired, and invalid admin sessions
- neither dev bypass authenticates a production-configured process
- public Find & Earn does not perform an outbound fetch
- SSRF policy, including redirect revalidation and fail-closed browser behaviour
- response size limit
- mailto, placeholder, search, and pagination URLs rejected
- both existing identity algorithms still match existing keys
- a hit does not rewrite the stored key
- upsert cases A, B, C, and D from section 8
- neither deadline delete call site remains
- failed, partial, zero-job, and untrusted crawls do not expire jobs
- a second crawl request returns the open CrawlRun
- the two Gate 7 public-search tests in section 13
- organisation backfill counts, when that gate runs

---

## 17. Gates

### Gate 0 — Preflight

No application modifications.

Record repository state: branch, commit, upstream, tracked divergence from `main`, modified files, untracked files.

Identity baseline, mandatory:

- both existing identity algorithms in the production writer
- the role of `use_global_heuristics` in selecting the write-path branch
- the production value of `use_global_heuristics` is `NOT VERIFIED` unless the deployed environment or code path establishes it
- the distribution of existing production rows across the two key forms is `NOT VERIFIED` unless production data establishes it

Do not choose an identity algorithm. Do not add a key version.

Reconcile historical audit findings with current code. Report security, data integrity, crawler entrypoints, writers, search, admin routes, schema files, runtime DDL, CI, and production verification status.

Then stop. Wait for `APPROVE PREFLIGHT`.

### Gate 1 — Security and destructive behaviour

One gate, which may be several commits. It must not include later gates.

- Remove the public server-side Find & Earn arbitrary-URL fetch. Do not keep it as a public fetcher with SSRF checks added. An admin-only source test, if retained, uses the crawler outbound policy.
- Stop both deadline hard-delete call sites named in section 6. Do not change public search deadline filters in this gate.
- Stop using `app/auth.py`, including `data_quality_logs.py`.
- Disable both dev bypasses in `security/admin_auth.py`: empty-password acceptance when `AIDJOBS_ENV=dev`, and `X-Dev-Bypass: 1`.
- Remove the public exposure of `GET /admin/config/env` and `GET /api/admin/config-check`. If either capability is genuinely required, it must sit behind the single admin dependency and must not expose secret values, lengths, or equivalent configuration evidence.
- GET must not mutate state. Remove `GET /admin/search/reindex` as a mutating route. Admin mutations use `POST`, `PATCH`, or `DELETE`.
- Disable `POST /api/admin/crawl/run-migration` and the status-handler DDL that creates `crawl_locks`.
- Add tests that fail if those behaviours return.

Then stop.

### Gate 2 — CI that can fail

Repository-root CI runs the Gate 1 tests and backend lint. The frontend test command must not exit 0 without running its intended tests. Do not block this gate on a frontend rewrite.

Then stop.

### Gate 3 — Contracts, without a second writer

Define and test contracts for Organisation, Source, CrawlRun, Job, fetch, extract, normalise, validate, identity, and upsert.

Include upsert cases A through D from section 8. Name the validated field set. Do not add a second hash. Do not assign a canonical key version. Do not create another writer.

Then stop.

### Gate 4 — Single production pipeline

Extract stages from the current crawler using characterization tests on small fixtures.

Exit criteria:

- HTML production crawl calls shared validate, identity, and upsert.
- Both existing identity algorithms remain.
- Match accepts either existing key and does not overwrite the stored key.
- The production orchestrator does not write `jobs_side`.
- RSS and API use that same upsert before this gate is complete.
- Manual and scheduled crawls still enter `CrawlerOrchestrator`.
- Gate 4 does not choose an identity winner.

Then stop.

### Gate 5 — Asynchronous execution

Admin crawl returns a CrawlRun id. A duplicate request returns the open run. The scheduler uses the same execution path. Do not add a second worker service without the evidence and approval required in section 12.

Then stop.

### Gate 6 — Lifecycle machinery only, unless expiry is separately approved

If the trust policy and consecutive-missing threshold have not been approved as their own written decision, this gate expires nothing. Active jobs remain active.

It may add explicit lifecycle observations on CrawlRuns and keep moderation behaviour from section 6. It must not invent the expiry rule in the same pull request.

Then stop.

### Gate 7 — Search projection

Postgres commits drive create, update, and remove in Meilisearch. Both acceptance tests in section 13 pass. SQL fallback remains for client failure and for projection lag. Rebuild is an admin `POST` recovery. Crawl requests do not wait on Meilisearch.

Then stop.

### Gate 8 — Organisation

Inspect real organisation strings. Do not merge lookalikes without evidence. Create organisation rows, point sources at them, copy that organisation onto jobs from the source, write `organisation_id` beside existing `org_name`, verify counts, and keep `org_name`. Add foreign keys only after the mapping is verified. Do not do this before the production schema is `VERIFIED`. Do not drop `org_name` in that migration.

Then stop.

### Gate 9 — Admin consolidation

One `/api/admin/*` API, one auth dependency, Next proxies for admin operations, one admin UI guard, and the V1 navigation. Remove direct browser dependence on backend `/admin/*` APIs for core operations. Apply the CORS rule. Do not set `SameSite=None`.

Then stop.

### Gate 10 — Legacy removal

Only after callers are gone and replacement tests have been run:

- `app/auth.py`
- `app/crawl.py` as a crawl runner
- `crawler_v2/orchestrator.py` as a second orchestrator
- `jobs_side` and the shadow writer
- duplicate normaliser entry points that are no longer called
- dead admin routes, Find & Earn product surface, runtime migration UI
- Replit stubs and unused packages, after confirming nothing imports them
- diagnostic JSON and scraped HTML that are not test fixtures, removed from the product tree without rewriting git history unless separately asked

Then stop.

---

## 18. Rules that override convenience

1. Never create a second writer to compare behaviour.
2. Never change existing job keys during this reset.
3. Never assign a canonical key version before the production setting and row distribution are verified and a separate identity decision is approved.
4. Never expire missing jobs unless the trust policy was approved separately from the implementation pull request.
5. Never treat HTTP 200 as a complete catalogue.
6. Never hard-delete jobs because a deadline passed.
7. Never let a recrawl clear administrative suppression.
8. Never introduce `jobs_side` or another shadow job store, including a quarantine catalogue.
9. Never introduce a second production authentication system.
10. Never treat `AIDJOBS_ENV=dev` or `X-Dev-Bypass` as production authentication.
11. Never run schema DDL from an application route.
12. Never make Meilisearch the source of truth.
13. Never require a manual reindex for an ordinary crawled job to be discoverable, or for a job that is no longer eligible in Postgres to remain publicly discoverable.
14. Never add a second orchestrator.
15. Never rewrite the public UI without a product reason.
16. Never remove extraction rules before characterization tests exist.
17. Never silently change AI order while splitting the crawler.
18. Never invent an employer application URL.
19. Never connect to, or navigate to, an address the SSRF policy has not evaluated. Fail closed when enforcement is impossible.
20. Never claim production verification from repository files alone.
21. Never start the next gate without an approved report for the current one.

---

## 19. Required reports

### Preflight

Include git state, architecture entrypoints, writers, auth modules, admin prefixes, lifecycle operations, historical-finding reconciliation, security, data integrity, crawler, search, admin, database, CI commands to run later, and `VERIFIED` / `NOT VERIFIED` for Vercel, Render, Supabase, and Meilisearch.

Include the identity baseline from Gate 0.

Then stop and wait for `APPROVE PREFLIGHT`.

### After each gate

```text
Phase:
Status:
Objective:
Files changed:
Files removed:
Database changes:
API changes:
Security changes:
Tests added/changed:
Verification commands:
Exact results:
Failures:
Known remaining risks:
Next phase:
```

Do not report a check as passed if it was not run. Then stop.

---

## 20. Definition of done

The reset is complete only when all of the following are true.

- One orchestrator and one job writer, including RSS and API.
- One identity handling policy that preserves the two existing historical algorithms until an approved identity decision is made. Stored keys are not rewritten. No canonical key version is assigned before that decision.
- One normalisation path for new writes, without a historical rewrite.
- One validation stage. Rejections stay on the CrawlRun.
- Lifecycle is `ACTIVE` or `EXPIRED`. Moderation is separate. `ARCHIVED` does not exist.
- Missing-job expiry is off unless its policy was explicitly approved as its own decision.
- Deadline hard delete is gone from both call sites. Search deadline filters were not silently changed in that same change.
- Admin suppression survives recrawl.
- Unchanged jobs advance `last_seen_at` and stay one row.
- Postgres is authoritative. Meilisearch is rebuildable. Both Gate 7 acceptance tests pass.
- One auth module. Both named dev bypasses are gone from production-configured processes. `app/auth.py` is gone.
- Public arbitrary URL fetch is gone. Remaining fetches follow section 9.
- No runtime DDL. No mutating GET. The two config endpoints are not public secret-evidence probes.
- Admin APIs are `/api/admin/*`. The admin cookie stays `SameSite=Lax`.
- CI runs the real suites from the repository root.
- Production services are labelled `VERIFIED` only where they were actually checked.

The goal is a trustworthy existing product:

one pipeline, one writer, one identity handling policy that preserves the two existing historical algorithms until an approved identity decision is made, one auth system, one admin API boundary, one database authority, one lifecycle model, and one search projection,

without discarding extraction behaviour the catalogue already depends on.
