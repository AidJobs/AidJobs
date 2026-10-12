# AidJobs — Crawler completion plan

**Status:** Recorded execution plan. B1 is committed locally as `faf00d1` and is not pushed or deployed. C1 decoding is committed locally as `cd6d63c` and is not pushed or deployed. C2 labels are recorded. The B3 identity preflight is recorded as a repository reading, and the keys stored on production rows are not verified. The narrowed C3 contract is recorded below. Admission code is unchanged. Cross-site coverage is not established. This record is not permission to implement C3, fetch, or write to the jobs database.
**Contract:** `docs/architecture/aidjobs-migration-contract.md`
**Recorded:** 10 October 2026, after Gate 11 (`9d5666b`) and the reliability fix (`28b9efc` on Render). B1 verification recorded the same day. B1 commit status updated the same day. B2 contract audit recorded 11 October 2026. Offline coverage map recorded 12 October 2026. Coverage evaluation plan and labelling rules recorded the same day. Coverage evaluation results recorded 12 October 2026. C1–C5 coverage implementation contract recorded 12 October 2026. C1 decoding committed locally the same day as `cd6d63c`. C2 labels recorded the same day, and the blanket structured-field rule was withdrawn. The B3 repository identity preflight and the narrowed C3 contract were recorded the same day.

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

Admission thresholds stay as they are. Do not retune admission from this map. The coverage evaluation plan is recorded below. It does not authorise a fetch.

#### Career-site coverage evaluation

Approved 12 October 2026 as a plan. No site has been fetched for this evaluation. Admission thresholds, extraction order, and admission predicates stay as they are. B3 remains the next contract gate and is not part of this evaluation.

The measurement is the current generic HTML path only: `extract_jobs_from_html` on one saved listing response, then one `admit_batch` call with class `html`. Do not call `crawl_source`, a source plugin, detail-page enrichment, the AI extractor, or `save_jobs`. UNICEF, UNDP, UNESCO, Amnesty, and Save the Children stay out. ReliefWeb’s API preset is not this sample. RSS and API admission stay out.

Two counts stay separate, each with its denominator. Unknown items stay out of both.

- Genuine vacancies missed / confirmed genuine vacancies assessed. A confirmed vacancy needs visible evidence of one open role. A miss is a confirmed role that the listing batch does not admit. Split the numerator into roles with no candidate and roles rejected by admission.
- Irrelevant pages admitted / irrelevant pages assessed. Irrelevant means a landing page, search page, pagination page, news or profile page, tender, membership page, or application instructions. It counts as admitted only when that same listing batch admits it.

One saved listing is one admission batch. Do not merge pages to create a repeated family. A vacancy page can confirm one role and is not a second admission batch. A JavaScript shell with no vacancy links is an extraction miss. The current extractor returns JSON-LD postings before link extraction; roles hidden by that return are extraction misses. An ordinary HTML link with a title, employer, location, or deadline remains a miss when its numeric or UUID family does not repeat.

Labelling rules, recorded 12 October 2026. These rules govern the counts. They do not change admission.

- `family_key` collapses numeric segments and hyphenated UUIDs in the path only. A query parameter such as `job_id=` does not create `{id}`. Repeating `jobdescription.aspx?job_id=` in one batch cannot satisfy the numeric-family rule. That parameter is also outside the search-or-pagination pattern (`q=`, `page=`, `search=`, `filter=`).
- Ground truth follows the link destination. A visible role whose href is a membership, profile, tender, or event page is that kind of page. The role is unknown unless the same saved page also contains a job destination for it.
- A rejected irrelevant link stays in the rejection list with `admitted` and `rejection_reason`. It enters the irrelevant-admitted numerator only when the listing batch admits it.
- The denominator is the saved listing body. Roles on later pages, behind “view all”, or beyond a truncated 5 MiB body are out of scope. A listing row with one visible role and a job destination can be confirmed from that listing. At most three later vacancy fetches check individual rows. A row that cannot be confirmed stays unknown.
- Browser-rendered titles are not the saved response. If the raw body has no vacancy links, the list is an extraction miss.
- Report organisation career pages and job boards separately. Do not average the seven sites. The organisation pages are Médecins Sans Frontières, the Global Partnership for Education, ICRC, the International Rescue Committee, and Oxfam GB. The boards are ReliefWeb and DevNetJobsIndia.
- An exact `/careers` or `/jobs` apply URL rejected as `root_careers_page` is a rejection of that URL. Child links on the page are judged on their own. An empty vacancy denominator is reported as none observed.

The sample has seven listing URLs. Two were already in `infra/seed.sql`. Five were supplied for this plan and are not repository records. Every URL is unconfirmed until its approved response is saved. Seed job rows under the first two sources are fixture URLs and are not ground truth. Copies of pages seen while choosing these targets are not the evaluation dataset.

| Site | Listing URL | Why it is included | Unconfirmed |
| --- | --- | --- | --- |
| Médecins Sans Frontières | `https://www.msf.org/careers` | Sample HTML source in `infra/seed.sql` | Whether the live page lists vacancies, and the URL shape |
| Global Partnership for Education | `https://www.globalpartnership.org/careers` | Sample HTML source in `infra/seed.sql`, status `pending_validation` | Same |
| ICRC | `https://careers.icrc.org/go/Global-Opportunities/8821501/` | User-supplied field-opportunities page. The supplied copy shows a search form, a “Loading...” list, and SAP session cookies | Whether the raw response contains vacancy links or only a script shell. The numeric segment is on the listing URL |
| International Rescue Committee | `https://careers.rescue.org/en/index.html` | User-supplied careers landing page. The supplied copy leads to search entry points and employee stories | Whether any individual vacancy link is in the raw HTML |
| ReliefWeb | `https://reliefweb.int/jobs` | User-supplied HTML jobs list, included as an aggregator. The supplied copy shows search, pagination, vacancies, and a tender | Vacancy URL shape. Do not fetch the RSS or API links on that page |
| Oxfam GB | `https://jobs.oxfam.org.uk/jobs/home/` | User-supplied careers home. The supplied copy shows search, category counts, and a short job list | Whether category and search links are individual vacancies, and the vacancy URL shape |
| DevNetJobsIndia | `https://www.devnetjobsindia.org/` | User-supplied job board. The supplied copy mixes job links, jobseeker profiles, membership links, tenders, and events. Some job links use `jobdescription.aspx?job_id=` | Whether the raw response contains those links. Under the current `family_key`, that query shape is not a numeric family. Profile, membership, tender, and event links are candidates for the irrelevant count |

The two fetch approvals were given and executed once. The procedure was:

1. Approve the exact listing URLs. These seven are the proposed set. Fetch each once through the local outbound fetch policy, with the existing timeout and 5 MiB cap. Do not use a browser. Save the response, final URL, status, content type, redirect chain, and fetch time outside the jobs database. Do not commit response bodies.
2. From each saved listing, propose at most three vacancy URLs visible in that response. Fetch those only after a second approval, and use them for ground truth only.

Do not refetch a page to fill a gap. Label it unknown. This measures the local tree, not the deployed backend. Do not write to the jobs database.

The per-site table records the listing extraction result, confirmed vacancies, the number admitted, both counts with denominators, extraction misses, each rejection with `admitted` and `rejection_reason`, and unknown cases with the reason. The evaluation is complete when all seven sites have that table, or when a shortfall is recorded because an approved response could not be saved. Completion is not a coverage percentage and does not retune admission.

#### Coverage evaluation results

Recorded 12 October 2026 from the local tree. Listing responses were fetched once at 19:31–19:32 UTC on 11 October 2026. Six vacancy pages were fetched once after that, the same day. Each request used the local outbound policy, the 30-second timeout, and the 5 MiB cap. No request redirected. Response bodies stay in gitignored `raw-html/career-coverage/` and were not committed. Nothing was written to the jobs database. This does not describe the deployed backend.

Each listing was passed to `extract_jobs_from_html` as the crawler would see it: the transfer bytes decoded as UTF-8, without content-encoding decompression. One `admit_batch` call with class `html` followed. Vacancy pages were ground truth only and were not added to those batches. Admission thresholds, extraction order, and admission predicates were not changed.

Organisation career pages:

| Site | Confirmed roles | Missed | Irrelevant admitted | Result |
| --- | --- | --- | --- | --- |
| Médecins Sans Frontières | 0 | 0/0 | 0/0 | HTTP 404, brotli body. No role could be labelled. Unknown. |
| Global Partnership for Education | 0 | 0/0 | 0/0 | HTTP 200, gzip body. The crawler text is not HTML. Unknown. |
| ICRC | 12 | 12/12 | 0/19 | All 12 were extracted and rejected with `no_qualifying_family`. Two other candidates were `root_careers_page`. |
| International Rescue Committee | 0 | 0/0 | 0/0 | HTTP 200, gzip body. The crawler text is not HTML. Unknown. |
| Oxfam GB | 6 | 6/6 | 0/12 | All 6 were extracted and rejected with `no_qualifying_family`. |

Three of the twelve ICRC roles and three of the six Oxfam roles were checked on their own saved pages. Each of those six pages shows the one expected role. The other confirmed rows come from a visible title and a job destination on the saved listing. ICRC also had 11 unlabelled listing links, and none were admitted.

Job boards:

| Site | Confirmed roles | Missed | Irrelevant admitted | Result |
| --- | --- | --- | --- | --- |
| ReliefWeb | 0 | 0/0 | 0/0 | HTTP 202 challenge page with no job links. Roles outside that body are unknown. |
| DevNetJobsIndia | 0 | 0/0 | 0/0 | HTTP 200, brotli body. The crawler text is not HTML. Unknown. |

No irrelevant page was admitted. These listing batches did not produce a repeated numeric family, a repeated UUID family, or a qualifying JSON-LD `job_posting`. On ICRC and Oxfam, each vacancy URL is its own family, so a title, location, or deadline does not admit it. That is the current ordinary-HTML rule.

The gzip and brotli responses are a measurement gap. They do not support a coverage claim for those four sites. Do not average the seven sites. The implementation contract for decoding and for the family-rule amendment is C1–C5 below. B3 stays a read-only identity audit and runs before C3. B3 does not answer coverage.

### Coverage implementation contract, C1–C5

Recorded 12 October 2026. C1 decoding is committed locally as `cd6d63c`. C2 labels, the B3 repository identity reading, and the narrowed C3 contract are recorded below. No C3 code is permitted until that implementation is separately approved. No fetch, database write, push, or deploy is part of this record.

C1–C5 sit after this evaluation and before any B3 code change. Track A stays independent. ReliefWeb HTML stays a challenge. Production crawls stay forbidden while B1 is undeployed. `canonical_hash`, plugins, AI order, Issue #4, and Issue #5 stay untouched. `apps/backend/scripts/diagnose_enrichment_bias.py` and `tests/test_link_heuristics.py` stay out of every commit.

| Order | Gate | Allowed work |
| --- | --- | --- |
| 1 | C1 preflight, approval, then decode | Response decoding only |
| 2 | C2 | Offline scoring and labels. Recorded. No admission change |
| 3 | B3 read-only audit | Repository identity facts recorded. Production keys are not verified. No identity code |
| 4 | C3 | Narrowed admission contract recorded. Implementation waits for its own approval |
| 5 | C4 | Thin-row confirmation inside the one admission batch |
| 6 | C5 | Six-site table, then stop |
| 7 | B4, then B5 | Unchanged |

#### C1. Decode the response

In `apps/backend/contracts/outbound.py`, decompress after the transfer is read and before `FetchResult` is returned. `gzip` and `deflate` use the standard library. `br` needs a brotli dependency, because the crawler already requests it and DevNetJobsIndia responded with it. Count decoded bytes while decoding. Stop at the same 5 MiB ceiling as the transfer cap. A body that exceeds that ceiling, or that claims an encoding and does not decode, raises `FetchError`. The extractor never sees compressed bytes or a partial page.

Tests are compressed fixtures in `apps/backend/tests/test_outbound_fetch.py`. No live network. This is a new gate, not a reopening of B1.

#### C2. Label the saved pages

Decompress the bodies already in `raw-html/career-coverage/`. Do not fetch. Run the current extractor and the current `admit_batch`. For every candidate record the title, apply URL, location, deadline, employment type, `admitted`, and `rejection_reason`.

Each of the seven extra ICRC candidates receives one recorded label: genuine, junk, or unknown. Unknown stays unknown. It is not treated as junk and not treated as a vacancy. C2 is complete when all seven labels are recorded. C3 does not start while any of the seven is unlabelled.

An unknown URL must not be newly admitted. If the C3 family rule or the structured-field rule would admit an unknown URL, C3 stops. The rule is narrowed, or that URL is later labelled genuine or junk.

Copy the decisive URL shapes into small fixtures under `apps/backend/tests/` as part of the C3 implementation, after that implementation is approved. This documentation record does not add those fixtures. The full saved pages stay investigation material. They do not become a test dependency.

#### C2 labels

Recorded 12 October 2026 from the saved bodies. Decoding used each row’s saved `content-encoding` and the C1 decoder. No fetch, admission edit, fixture, database write, or commit of response bodies.

The seven extra ICRC candidates are the extracted rows left after removing the 12 confirmed `/job/` role URLs and the two `root_careers_page` locale rows. All seven are junk. The label is ground truth. It does not replace the admission result. Each was rejected with `no_qualifying_family`, and location, deadline, and employment type were blank.

| Title | Apply URL | Label |
| --- | --- | --- |
| Open Jobs | `https://careers.icrc.org/go/All-Jobs/3807301/` | junk |
| How to Apply | `https://careers.icrc.org/content/application/?locale=en_GB` | junk |
| Opportunities and Benefits | `https://careers.icrc.org/content/opportunities-benefits/?locale=en_GB` | junk |
| local opportunities page | `https://careers.icrc.org/go/LOCAL-OPPORTUNITIES/9002901/` | junk |
| Our job categories | `https://careers.icrc.org/content/job-categories/?locale=en_GB` | junk |
| Before you apply | `https://careers.icrc.org/content/Prepare-Your-Application/?locale=en_GB` | junk |
| Our recruitment process | `https://careers.icrc.org/content/Our-Recruitment-Process/?locale=en_GB` | junk |

The evidence is the saved link text and destination path. Open Jobs and the local-opportunities URL are list pages. The other five are information pages. None is one role. None is unknown.

Eleven listing links stay a separate unlabelled set. They were not extracted as candidates: a `javascript:void(0)` control, a medical-standards PDF, five social profiles, the career newsletter, and three Google policy links. The bare `https://careers.icrc.org/` link is the locale root already counted in the two `root_careers_page` rows, not a twelfth unknown link.

The same pass left these findings in place. A later C3 result does not close them.

- The 12 confirmed ICRC roles and the 6 confirmed Oxfam roles were extracted and rejected with `no_qualifying_family`. On every one of those 18 listing rows, location, deadline, and employment type were blank. Place and date on the Oxfam cards are inside the title string, not in those fields.
- DevNetJobsIndia produced 150 candidates, all rejected with `no_qualifying_family`. Sixty-four `jobdescription.aspx?job_id=` rows and 46 `valuemembership.aspx` rows both have location and deadline. Thirty `myProfile.aspx` rows do not. Ten further rows are post, payment, advertising, event, and list controls.
- Global Partnership for Education decoded to HTML. The extractor returned no candidates. The page contains 11 role-titled links to other employers. That is an extraction miss.
- The International Rescue Committee decoded to a careers landing page. The extractor returned one candidate, “Jobs in Syria”, with no evidence fields. Search and Workday entry links were not candidates.
- Médecins Sans Frontières `/careers` remains the saved HTTP 404. `https://www.msf.org/jobs` has not been fetched.
- ReliefWeb remains the saved HTTP 202 challenge page.

C2 is complete for the seven labels. C3 does not start from the blanket rule below.

#### C3. Amend admission

Recorded 12 October 2026 from the reviewed B3 repository reading. This is the contract. It is not permission to change code. Implementation waits for its own approval. Fixtures are part of that implementation.

`destination_rejection` stays unchanged. Search, pagination, an exact careers or jobs root, and social links still fail first. The blanket rule stays withdrawn: a title plus a location, deadline, or employment type does not admit ordinary HTML when the destination is not a recognised vacancy. On the decoded DevNetJobsIndia listing that rule would admit 64 job-description rows and 46 membership rows.

Classification uses the destination path and URL structure, not the extracted title. One URL is enough. A repeated family is not required to recognise a vacancy shape.

1. Deny non-vacancy destinations before reading location, deadline, or employment type. Membership, profile, account, payment, advertising, and event-submission paths are rejected. The 46 `valuemembership.aspx` rows stay rejected even with a plausible title and populated fields. `myProfile.aspx` stays rejected. The seven junk ICRC destinations stay rejected: `/go/All-Jobs/…` and `/go/LOCAL-OPPORTUNITIES/…` are list pages, and the five `/content/…` URLs are information pages. `all-jobs` is not the token `jobs`.
2. Recognise a vacancy destination on one URL. A path segment in the existing vacancy tokens, followed by a numeric id, is one shape. For classification only, the slug between that token and the first numeric id collapses: `/job/pashto-interpreter/1425552433` is `job/{id}`, and `/jobs/vacancy/finance-manager-int11888/25150/description` is `jobs/vacancy/{id}/{rest}`. Trailing segments, including `description`, stay one `{rest}`. A numeric `job_id` query is the other shape, and only on a job-detail path. The observed eligible path is `jobdescription.aspx`. A path is not eligible merely because it was not denied. `job_id` does not override a non-vacancy path. A missing, empty, or non-numeric `job_id` does not qualify. No other query parameter creates a vacancy.
3. Read evidence second. A recognised vacancy destination with a title and a non-blank location, deadline, or employment type may be admitted. That is the positive case for the 64 `jobdescription.aspx?job_id=` rows. A place or date glued into the title string does not fill those fields.
4. A recognised vacancy destination with a title and blank location, deadline, and employment type is rejected with `thin_vacancy`. C3 does not fetch it and does not admit it. The 12 confirmed ICRC roles and the 6 confirmed Oxfam roles are this case. Admitting them is a later cascade result only if C4 supplies qualifying evidence. The six saved vacancy pages are the offline check for the six rows that were fetched. The other 12 confirmed rows have no saved detail page.
5. Keep identity untouched. Do not change `canonical_hash`, URL normalisation, either match key, the reference field, upsert behaviour, or the writer. Do not hash the collapsed family key. Do not pass `job_id` as the reference. The full apply URL remains the identity input. An unknown URL is not newly admitted.
6. Keep one admission batch. C3 does not add a detail fetch. C4, after its own approval, is the only confirmation fetch. It runs before that single `admit_batch`. An inconclusive confirmation is `detail_unconfirmed` and is not saved.

The implementation tests cover the positive case, `thin_vacancy` for the 18 confirmed listing rows, the seven junk ICRC candidates, the 46 membership rows with populated fields, profile and the other non-vacancy destinations, and a missing, empty, and non-numeric `job_id`.

The Global Partnership for Education extraction miss, the International Rescue Committee landing link, the Médecins Sans Frontières `/careers` 404, and the ReliefWeb challenge stay explicit findings. A passing C3 does not close them.

#### C4. Confirm a thin row

This is the only allowed detail-page fetch beyond behaviour already in `crawl_source`, and only after C4’s own approval. It preserves the one-batch contract.

In `crawl_source`, after listing extraction and before the single `admit_batch`:

- Do not fetch a row that C3 would already admit. Fetch a row C3 rejected as `thin_vacancy`. Do not fetch a junk, membership, profile, or other non-vacancy rejection.
- Fetch each such row once, through the existing outbound client. The cap is 50 detail fetches for that one listing.
- HTTP 200 is not evidence. A description paragraph is not evidence. The detail page must produce a title plus a non-blank location, deadline, or employment type, or a JSON-LD `JobPosting` with one of those fields.
- A row that gains that evidence joins the same candidate list. The single `admit_batch` then decides it.
- A failed or inconclusive row is removed from that list and logged with the existing extraction logger as `detail_unconfirmed`. It is not passed to `save_jobs` and not written by any other path. There is no quarantine job table.
- Keep the UNICEF skip and the UNDP detail behaviour.

The six vacancy pages already saved are the offline reader check. Any new detail URL needs its own fetch approval.

#### C5. Exit on the six sites

| Site | Done when |
| --- | --- |
| ICRC | 12 confirmed roles admitted, irrelevant links rejected |
| Oxfam GB | 6 confirmed roles admitted, category and search links rejected |
| DevNetJobsIndia | Decoded listing: each extracted row is admitted, rejected, or `detail_unconfirmed` |
| Global Partnership for Education | Same |
| International Rescue Committee | Same |
| Médecins Sans Frontières | One separately approved fetch of `https://www.msf.org/jobs`, then the same cascade. `/careers` remains the 404 already fetched |

A hold is not a saved job. A decoded page with no vacancy links is unsupported. ReliefWeb HTML stays out. Then stop. Later career links use this cascade and do not imply another rule change. B4 and B5 follow.

### B3. Identity and upsert audit

Read-only unless a preflight proves a specific defect. Do not change `canonical_hash` or assign a canonical key version.

#### B3 repository preflight

Recorded 12 October 2026 from the local tree. No production database was read. This is not proof of the keys stored on production rows, and it does not choose which algorithm wrote them.

The writer still has two keys. The match looks up both. A hit does not replace the stored key, and `canonical_hash` stays in the fields a match must not change. When `EXTRACTION_GLOBAL_HEURISTICS` is left at its default `true`, a new row stores algorithm B, an MD5 of the lowercased title, the normalised URL, and the reference. These HTML candidates do not set a reference. Algorithm A is an MD5 of the lowercased title and the apply URL as given. Normalisation lowercases the host, drops the fragment and a trailing slash, and drops only `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `fbclid`, `gclid`, `_ga`, `ref`, and `source`. `job_id`, `locale`, and `pagestamp` stay. The normalised URL is then lowercased.

Under algorithm B, with the same title, a trailing slash, a listed tracking parameter, and `Job_Id` versus `job_id` are the same identity. A `locale` or `pagestamp` parameter, a different parameter order, `www` versus a bare host, a different numeric `job_id`, an empty, missing, or non-numeric `job_id`, and a different title are not. `jobdescription.aspx?job_id=304752` is not the same identity as `valuemembership.aspx` or `myProfile.aspx`. Two ICRC `/job/{slug}/{id}` URLs with different ids are not the same identity. Algorithm A does not treat a trailing slash or a tracking parameter as the same URL. A row stored with algorithm A of the un-normalised URL would not match the normalised form.

The hash uses the full apply URL. C3’s collapsed family key is not an identity input. Distinct slugs and distinct `job_id` values stay distinct rows. C3 must not hash that family key and must not pass `job_id` as the reference.

A repeat of the same key follows the existing upsert. No match creates a row. A field change updates the row and leaves `canonical_hash` and `deleted_at` unchanged. No field change is unchanged and still advances `last_seen_at`. A suppressed row is `seen_again` and stays suppressed. Two different rows hit by the two keys write nothing. `/fix-undp-urls` still reaches `save_jobs` without `admit_batch`. The missing stamp makes `persist_candidate` reject that candidate before SQL. Leave that route unless a separate fix is approved.

Exit: these repository facts. No identity redesign. Production deduplication remains unverified.

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
- Genuine vacancies are admitted and obvious junk is rejected. Until the narrowed C3 contract is verified, that means the current Gate 11 rules. The withdrawn blanket structured-field rule is not that amendment. After the narrowed contract is verified, the completion line means that contract.
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
- Playwright or broader AI extraction. Detail-page fetching stays limited to the behaviour already in `crawl_source` until C4 is separately approved. C4 is the only added detail fetch, and it stays inside the one `admit_batch`.
- Issue #4 test-suite cleanup, except where a crawler gate needs a test it directly owns.
- The two unrelated local files recorded under B1: `apps/backend/scripts/diagnose_enrichment_bias.py` and `tests/test_link_heuristics.py`. Leave their Pyright-ignore diffs untouched and out of every crawler commit.
