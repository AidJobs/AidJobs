# AidJobs — Crawler completion plan

**Status:** Recorded execution plan. Not permission to start the next gate.
**Contract:** `docs/architecture/aidjobs-migration-contract.md`
**Recorded:** 10 October 2026, after Gate 11 (`9d5666b`) and the reliability fix (`28b9efc` on Render).

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

This is the next crawler implementation gate.

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

### B2. Extraction and admission audit

Read-only unless a preflight proves a specific defect.

Confirm JSON-LD, metadata, DOM heuristics, regex fallback, RSS, API, and the existing source plugins still run in their current order. Do not reorder AI extraction. Keep the current UNDP, UNESCO, and UNICEF rules.

Check representative sources with fixtures. Separate genuine vacancies from landing pages, search pages, pagination, and unrelated content. Do not raise a rejection threshold unless a fixture shows junk passing and a genuine vacancy of the same shape still passes.

Do not run production crawls in this audit.

Exit: a record of what was checked, what passed, and any defect. A defect gets its own approved fix. The audit itself does not retune admission.

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
- The two unrelated local files: `apps/backend/scripts/diagnose_enrichment_bias.py` and `tests/test_link_heuristics.py`.
