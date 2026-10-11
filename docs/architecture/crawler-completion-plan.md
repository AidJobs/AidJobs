# AidJobs — Crawler completion plan

**Status:** Recorded execution plan. B1 is committed locally as `faf00d1` and is not pushed or deployed. The B2 contract audit and the offline coverage map are recorded below. Cross-site coverage is not established. A live career-site sample is not approved. This is not permission to start B3 or to change admission.
**Contract:** `docs/architecture/aidjobs-migration-contract.md`
**Recorded:** 10 October 2026, after Gate 11 (`9d5666b`) and the reliability fix (`28b9efc` on Render). B1 verification recorded the same day. B1 commit status updated the same day. B2 contract audit recorded 11 October 2026. Offline coverage map recorded 12 October 2026.

This is the crawler-specific hardening roadmap. It is not the entire architecture reset. Follow it until the completion criteria are marked. Do not start a gate until its preflight is approved. Do not start the next crawler gate until the current gate’s verification is recorded.

The Meilisearch investigation is Track A. It is independent of every crawler gate in Track B. It does not gate, block, or replace the next crawler implementation gate.

## How to use this plan

Track B runs in order, one gate at a time:

1. Read-only preflight.
2. Approval.
3. Implementation plan.
4. Approval.
5. Code, tests, and a verification record.

Track A may run at the same time. A Track A finding is not permission to change crawler code. A Track B gate is not permission to reindex or repair Meilisearch.

If the repository contradicts this plan, stop and propose the smallest amendment. Do not improvise architecture.

## Principles

1. One production crawler path and one writer. HTML, RSS, and API use the same admission and persistence contract.
2. PostgreSQL is authoritative. Meilisearch is derived.
3. Preserve existing extraction order, identity rules, source-specific plugins, and AI extraction behaviour.
4. An incomplete or untrusted crawl must not expire or delete jobs.
5. Reject junk before persistence. A job-like URL is not enough.
6. Every server-side fetch follows one outbound-request policy, or it does not run.
7. Characterise current behaviour with tests before moving or replacing a stage.
8. If an audit finds the current code already meets the rule, record that and stop. Do not rebuild a finished gate.

## Closed crawler work

These stay closed.

- Gate 11, commit `9d5666b`: one `admit_batch`, called by HTML, RSS, and API before `save_jobs`. `persist_candidate` remains the only writer and rejects a dict without `admitted=True`. The authoritative Gate 11 record is `docs/architecture/gate-11-unified-admission.md`.
- Reliability fix, commit `28b9efc`, confirmed on Render: `finish_run` counts both `fail` and `failed`. RSS and API `save_jobs` roll back and re-raise. `ok` and `warn` still clear the failure counter. `crawl_logs.found` on the success path remains the pre-admission extraction count. A healthy crawl that writes nothing stays successful.
- Gate 7 already shows that a projection failure does not undo a PostgreSQL commit (`test_projection_failure_does_not_raise_or_write_jobs`). That test was not new work in `28b9efc`.

Parked decision, not an open implementation: HTML can still return `ok` when every per-row save failed, because `finish_run` does not read `counts.failed`. Issue #5 stays open for that case only. Do not reopen it inside the next gate.

## Track A — Meilisearch investigation

Independent of every crawler gate below.

Purpose: explain why `add_documents` returned an empty body after the UNICEF crawl, so the ten committed jobs were not projected.

Allowed: read code, read existing logs, and read-only checks of whether those documents are absent.

Forbidden until a separate repair is approved: production crawl, reindex, projection code change, and any change to admission, persistence, or fetch.

Exit: a written boundary. Either the request never reached Meilisearch, Meilisearch rejected it, or the client failed while parsing an empty success body. Name the smallest repair and stop. Do not implement it in this track.

This track does not have to finish before Track B1 starts.

## Track B — crawler gates

### B1. Outbound fetch policy

Committed locally on 10 October 2026 as `faf00d1` and verified against the approved plan. The verification record below is part of this plan. Unverified items stay unverified until a later check records them. They do not by themselves expand B1. The B2 contract audit is recorded below and does not approve an admission change.

One change, not two. Wire the existing `contracts/fetch.py` policy into the HTML, RSS, and API fetchers, and include all of the following in that same gate:

- Block loopback, private, reserved, and link-local addresses, cloud metadata endpoints, and prohibited internal hostnames.
- Check the address that is actually connected, including DNS resolution.
- Revalidate every redirect destination.
- Fail closed when an address was not evaluated.
- Enforce connection and read timeouts.
- Enforce a response-size limit before an unbounded body is loaded.
- Keep permitted protocols explicit.
- Bound retries and concurrency so a failure cannot multiply load.

The browser path fails closed when it cannot enforce this policy. Do not install or expand Playwright in this gate. Render already crawls without it.

Confirm the public Find & Earn arbitrary-URL fetch is still gone. That is a check, not a new feature.

Preflight before any edit. Do not change admission, persistence, extraction, identity, lifecycle, or Meilisearch in this gate.

Exit: the three live fetchers call the policy, a blocked address never connects, a redirect to a blocked address fails, oversized and timed-out responses fail closed, and tests cover those cases.

#### B1 verification record

Recorded 10 October 2026 from a read-only review, then updated the same day after the local commit. No production crawl, reindex, or data change was run. The implementation is local commit `faf00d1`, message `fix: enforce outbound fetch security policy`. It is not pushed or deployed. The verification documentation commit `9ba9eee` remains unchanged.

Changed files, and only these, belong to B1:

- `.github/workflows/ci.yml`
- `apps/backend/app/sources.py`
- `apps/backend/contracts/fetch.py`
- `apps/backend/contracts/outbound.py` (new)
- `apps/backend/crawler_v2/api_crawler.py`
- `apps/backend/crawler_v2/rss_crawler.py`
- `apps/backend/crawler_v2/simple_crawler.py`
- `apps/backend/tests/test_outbound_fetch.py` (new)

Verified from the implementation and from `apps/backend` test output `41 passed, 7 warnings in 66.07s` for `tests/test_outbound_fetch.py`, `tests/test_gate3_contracts.py`, and `tests/test_gate1_safety.py`:

- The TCP connection target and the TLS hostname are demonstrated separately. The test records a connect to the pinned address `8.8.8.8` and `start_tls` `server_hostname` `jobs.example`.
- A prohibited DNS answer, an empty answer list, a resolver error, and a blocked hostname do not connect.
- Each hop uses its own pool. Success, a two-hop redirect, the redirect limit, a private redirect, a chunked size failure, a connect timeout, and an unexpected exception close the pool. Redirect-limit and chunked size-failure cases also record stream close.
- The initial request is not a redirect. Exactly 20 redirects are followed. A further redirect is not connected.
- A HEAD redirect stays HEAD.
- `Authorization` is sent on the first host and omitted after a cross-host redirect. The same cross-host test also omits `Cookie` and `Proxy-Authorization`. The initial request still carries all three caller-supplied headers.
- The body is counted from streamed chunks. A declared `Content-Length` does not replace that count. Tests use small `max_bytes` overrides. The implementation cap is `MAX_RESPONSE_BYTES` = 5 MiB.
- A connect timeout becomes a fetch failure and closes the pool.
- A read timeout while consuming the response body becomes a fetch failure, closes the response and the per-hop pool, and does not pass a document to parsing. RSS does not call its feed parser, the API does not call `json.loads`, and HTML returns `0, ""`.
- `fetch_html` does not call `BrowserCrawler`. The browser argument is ignored.
- RSS, API, and admin HEAD go through the shared fetch. Find & Earn public arbitrary-URL fetch remains absent.
- CI ruff and pytest lists include `tests/test_outbound_fetch.py`. `contracts/` was already in the ruff list, so `fetch.py` and `outbound.py` are linted with it.
- `POST /api/admin/sources/{source_id}/test` is registered to `test_source` in the FastAPI route table. `test_source` retains `Depends(admin_required)`. Both HEAD branches call `_policy_head`. `_policy_head` is not itself a route.

The corrected targeted run, from `apps/backend`, was `43 passed, 7 warnings in 68.25s` for `tests/test_outbound_fetch.py`, `tests/test_gate3_contracts.py`, and `tests/test_gate1_safety.py`. Ruff passed on `tests/test_outbound_fetch.py` and `contracts`.

Explicitly unverified. Do not treat these as demonstrated:

- The GitHub Actions job was not executed. Only the local pytest command above was run.
- No live TLS handshake was performed. The test records the hostname passed to `start_tls`. It does not show a certificate check against a real server.
- The streaming cap is tested with small limits. A 5 MiB body was not sent.
- The first size-limit case does not itself assert that the response and pool were closed. Cleanup for a size failure is asserted on the separate chunked case.

Deployed behaviour remains unchecked until B5, or until a separate deploy check is recorded.

#### Files that must stay outside B1

These two working-tree files were already modified before B1. After `faf00d1` they remain modified and unstaged. Their remaining diff is only Pyright ignore comments. Do not stage, commit, revert, or fold them into a B1 change.

- `apps/backend/scripts/diagnose_enrichment_bias.py`: `# pyright: ignore[reportMissingModuleSource]` on the `psycopg2` and `RealDictCursor` imports.
- `tests/test_link_heuristics.py`: `# pyright: ignore[reportMissingImports]` on `pytest` and `core.extraction_heuristics`; `# pyright: ignore[reportMissingModuleSource]` on `bs4`; `# pyright: ignore[reportUndefinedVariable]` on `extract_contact_info`.

### B2. Extraction and admission audit

Read-only unless a preflight proves a specific defect.

Confirm JSON-LD, metadata, DOM heuristics, regex fallback, RSS, API, and the existing source plugins still run in their current order. Do not reorder AI extraction. Keep the current UNDP, UNESCO, and UNICEF rules.

Check representative sources with fixtures. Separate genuine vacancies from landing pages, search pages, pagination, and unrelated content. Do not raise a rejection threshold unless a fixture shows junk passing and a genuine vacancy of the same shape still passes.

Do not run production crawls in this audit.

Exit: a record of what was checked, what passed, and any defect. A defect gets its own approved fix. The audit itself does not retune admission.

#### B2 verification record

Recorded 11 October 2026 from a read-only preflight of the local tree through `e383627`, including unpushed `faf00d1`. No production crawl, live source request, reindex, or data change was run. The deployed backend was not checked.

The local extraction and admission implementation follows the current contract. From `apps/backend`, `tests/test_link_admission.py` passed: `17 passed in 0.14s`. HTML, RSS, and API each call `admit_batch` once, before `save_jobs`. No new B2 code defect was found. The pipeline extractor import failure is the parked Issue #4 circular import. RSS and API catch it and use their simple fallbacks. It does not open an admission or extraction-order change.

This audit does not show that the generic crawler supports most independent organisation career pages. An ordinary HTML link is admitted only when its URL family repeats: two or more numeric IDs under a vacancy-like path, or two or more UUID paths. A title, employer, location, or deadline does not admit that link. JSON-LD candidates marked `job_posting` can qualify on one structured field. RSS needs a deadline. An API candidate needs a deadline or a location. Existing fixtures do not cover a representative range of independent listing pages.

Admission thresholds stay as they are. Do not retune admission from this record.

B3, identity and upsert, remains the next contract gate. B3 does not answer coverage.

#### Generic coverage map

Recorded 12 October 2026 from the local code and offline tests. No live career site was fetched. Detail-page enrichment was not run, because it fetches a URL. Source-specific plugins are not generic coverage. The pipeline fixture tests were not collected because of the parked Issue #4 circular import.

The generic HTML path accepts three shapes through `admit_batch`:

- A repeated numeric URL family: at least two IDs under one path that contains `job`, `jobs`, `vacancy`, `vacancies`, `position`, `positions`, `requisition`, `requisitions`, `opening`, or `openings`. One matching URL is rejected.
- A repeated hyphenated UUID family. No vacancy word is required. A 32-character hex string is not a UUID.
- A JSON-LD candidate marked `job_posting` with a title, an apply URL, and one of `location_raw`, `deadline`, or `employment_type`. `employer` is not an admission field.

RSS is separate: a deadline is required. An API candidate is separate: a deadline or `location_raw` is required. Identifiers alone do not qualify.

An ordinary HTML link with a title, employer, location, or deadline is rejected with `no_qualifying_family` when its numeric or UUID family does not repeat. That is the current rule. The tests demonstrate plausible URL shapes, not saved pages from independent organisations. Existing fixtures do not show whether those sites repeat a qualifying family or publish JSON-LD.

From `apps/backend`, `tests/test_link_admission.py` and `test_validate_rejections_are_recorded_on_the_crawl` passed: `18 passed in 0.36s`.

Admission thresholds stay as they are. Do not retune admission from this map. The next product step is a separate plan for a live sample of independent career sites, counting vacancies missed and irrelevant pages admitted. That sample needs its own approval before any fetch.

### B3. Identity and upsert audit

Read-only unless a preflight proves a specific defect.

Record which identity algorithm production uses. Do not change `canonical_hash` or assign a canonical key version.

Confirm a repeat crawl yields stable `created`, `updated`, and `unchanged` outcomes, and a suppressed row returns `seen_again` with `deleted_at` unchanged.

Confirm production crawls still have one upsert path. The known `/fix-undp-urls` call reaches `save_jobs` without `admit_batch`; the missing stamp makes `persist_candidate` reject it before SQL. Leave that route unless a separate fix is approved.

Exit: the identity and suppression facts, written down. No identity redesign.

### B4. Failure and lifecycle audit

Read-only unless a preflight proves a specific defect.

Confirm failed, empty, partial, and successful crawls against the rules already shipped:

- `fail` and `failed` increment `consecutive_failures`, reset `consecutive_nochange`, and pause at five.
- `ok` and `warn` clear failures. Zero inserts on a healthy crawl are success.
- Crawl locks, scheduler caps, and concurrency limits stay as they are.
- Missing-job expiry stays disabled.
- A deadline does not hard-delete a job.
- A recrawl does not clear administrative suppression.

Do not define a trustworthy-crawl policy or a consecutive-missing threshold here. Expiry stays off until that policy is approved on its own.

Exit: each rule marked verified or defective. The parked HTML all-row-fail case stays parked.

### B5. Completion record

After B1 is implemented and B2, B3, and B4 are recorded:

- Run the relevant backend tests and the CI suite.
- Verify the deployed fetch policy separately from repository tests.
- Write what is verified, what is unverified, and what remains parked.

The crawler is complete for this plan only when the completion criteria below are marked. B5 does not start new features.

## Completion criteria

- Every live fetch path uses the outbound policy, including redirects and DNS, and fails closed when it cannot.
- Timeouts and response-size limits are enforced on those paths.
- Genuine vacancies are admitted and obvious junk is rejected under the current Gate 11 rules.
- HTML, RSS, and API use the same admission and persistence contract.
- Job identity is unchanged, upserts stay on the one writer, and suppression survives recrawl.
- Failed or partial crawls cannot expire or delete jobs.
- Adapter persistence failures are counted, and RSS/API save failures are not swallowed.
- A search-projection failure does not undo a PostgreSQL commit.
- The relevant tests pass, and the fetch-policy behaviour is checked on the deployed backend.

## After this plan

Only then: extract remaining stages from `SimpleCrawler`, consolidate normalisation, complete the Organisation model, remove verified legacy paths, and make the separate search-architecture decision.

Discovery Fabric remains later: Scout, Mapper, Frontier, Source Profiles, and Drift Detection.

## Do not divert into

- A Meilisearch reindex or projection repair from inside a crawler gate.
- A second pass over the fetchers just for timeouts or size limits.
- More production crawls before B1 is deployed.
- Raising admission thresholds to make a fixture pass.
- An identity, canonical-key, or expiry redesign.
- A new normalisation stage.
- Playwright, broader AI extraction, or detail-page fetching.
- Issue #4 test-suite cleanup, except where a crawler gate needs a test it directly owns.
- The two unrelated local files recorded under B1: `apps/backend/scripts/diagnose_enrichment_bias.py` and `tests/test_link_heuristics.py`. Leave their Pyright-ignore diffs untouched and out of every crawler commit.
