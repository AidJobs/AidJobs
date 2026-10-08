# Gate 11 — Unified admission controller

**Status:** Approved implementation plan. Not implemented.
**Contract:** `docs/architecture/aidjobs-migration-contract.md`

Do not start implementation until explicitly instructed. Execute the plan one step at a time. Stop after each step and wait for approval. If the repository contradicts this plan, stop and propose the smallest amendment. Do not improvise architecture.

## Invariant

```text
ONE crawling system
    │
    ├── HTML adapter → admit_batch(jobs, "html")
    │
    ├── RSS adapter  → admit_batch(jobs, "rss")
    │
    └── API adapter  → admit_batch(jobs, "api")
                           │
                           ▼
                    persist_candidate
```

There is one admission function, three existing adapter call sites, and one existing writer.

`CrawlerOrchestrator.crawl_source` only dispatches to the existing adapters and receives their final result (`status`, `message`, `counts`, `duration_ms`). It does not have the candidate list. Moving admission into the orchestrator would split extraction from persistence and is out of scope.

The three adapters are transport and extraction paths, not three crawling systems. `SimpleCrawler.crawl_source` still contains unused RSS and API branches that return “not implemented.” The live RSS and API paths are `SimpleRSSCrawler` and `SimpleAPICrawler`.

## 1. Current architecture

`CrawlerOrchestrator.crawl_source` dispatches `rss` to `SimpleRSSCrawler`, `api` or `json` to `SimpleAPICrawler`, and everything else to `SimpleCrawler`. Each adapter builds a list of dicts and calls its own `save_jobs`. All three call `persist_candidate`. No other production caller does.

On the HTML path, `SimpleCrawler.crawl_source` fills that list from one of: the rollout extractor, `AIJobExtractor.extract_jobs_from_html` when it returns anything, a plugin when AI is off and the plugin returns jobs, or `extract_jobs_from_html`. Inside `extract_jobs_from_html`, JSON-LD via `_parse_job_posting` returns first. Otherwise tables, divs, links, structured data, or the generic fallback run. Both returns from `_extract_from_links` call `restrict_to_repeated_detail_templates`, which keeps every numeric template seen at least twice and, when none repeats, returns the original list. AI, JSON-LD, tables, divs, generic fallback, plugins, RSS, and API never call it.

`save_jobs` builds a fresh dict and calls `persist_candidate`. That function runs `rejection_reason` (URL denies plus the 0.25 quality floor), then `both_keys` and `upsert`. A suppressed match returns `seen_again` and does not clear `deleted_at`. HTML `save_jobs` logs non-writes through `ExtractionLogger.log_failed_insert`. RSS and API do not.

## 2. Files and functions

| File | Change |
|---|---|
| `apps/backend/contracts/admission.py` | New module. `admit_batch(jobs, record_class)` is the only family decision. |
| `apps/backend/contracts/validate.py` | Split the URL checks out of `rejection_reason` into `destination_rejection`. `rejection_reason` calls that, then the quality floor. No new deny rules inside `destination_rejection`. |
| `apps/backend/contracts/persist.py` | Require the in-memory stamp. Do not write it. Do not count families. |
| `apps/backend/crawler_v2/simple_crawler.py` | Stop calling `restrict_to_repeated_detail_templates`. Set `record_class = "job_posting"` inside `_parse_job_posting`. Call `admit_batch` once before `save_jobs`. Copy the stamp in `save_jobs`. |
| `apps/backend/crawler_v2/rss_crawler.py` | Call `admit_batch(..., "rss")` before `save_jobs`. Copy the stamp. |
| `apps/backend/crawler_v2/api_crawler.py` | Same as RSS. |
| `apps/backend/tests/test_link_admission.py` | Point the three existing tests at `admit_batch`. Replace the permissive test. Add the truth-table cases. |
| `apps/backend/tests/test_gate4_persist.py`, `apps/backend/tests/test_gate6_lifecycle.py`, `apps/backend/tests/test_gate7_search.py` | Stamp the dicts those tests already pass to `persist_candidate`. Add one missing-stamp test. |

`detail_path_template` moves into `contracts/admission.py` and grows a UUID collapse. `restrict_to_repeated_detail_templates` is deleted so the permissive fallback cannot remain on the link path.

## 3. Controller placement

One call, after the list is finished and before `save_jobs`:

- `SimpleCrawler.crawl_source`, after enrichment, geocoding, and quality scoring, before `save_jobs`. The batch class is `html`. A job that already carries `record_class="job_posting"` keeps that class.
- `SimpleRSSCrawler.crawl_source`, after `extract_jobs_from_feed`, before `save_jobs`. Batch class `rss`. Deadline qualifies. `location_raw` alone does not.
- `SimpleAPICrawler.crawl_source`, after `extract_jobs_from_json`, before `save_jobs`. Batch class `api`. Deadline or `location_raw` qualifies.

The rollout extractor, AI, plugins, tables, divs, links, and generic fallback all end in that same HTML list, so they do not get their own call. The controller does not fetch. `extracted_by` may be stored for logs and is never read by the rule.

## 4. Admission algorithm

`destination_rejection` is today’s `rejection_reason` without the quality floor: missing title, missing URL, `mailto:`, placeholder, query `q=` / `page=` / `search=` / `filter=`, career roots, social path classes, PageUp badge. Path `/page/` is not part of that function.

```text
admit_batch(jobs, batch_class):
    rejected = []
    pool = []
    for job in jobs:
        reason = destination_rejection(job)
        if reason is None and a full path segment is "page" or "pages":
            reason = "pagination_path"
        if reason is not None:
            rejected.append(job, reason)
        else:
            pool.append(job)

    templates = {}
    for job in pool:
        key = family_key(job.apply_url)
        templates[key].append(job)

    admitted = []
    for job in pool:
        klass = job.record_class or batch_class
        family = templates[family_key(job.apply_url)]
        repeated = len(family) >= 2 and family_key is not empty
        numeric = repeated and key contains "{id}" and a full segment is in
            {job, jobs, vacancy, vacancies, position, positions,
             requisition, requisitions, opening, openings}
        uuid = repeated and key contains "{uuid}"
        structured = klass == "job_posting" and any of
            location_raw, deadline, employment_type
            or klass == "rss" and deadline
            or klass == "api" and (deadline or location_raw)
        if numeric or uuid or structured:
            job.admitted = True
            admitted.append(job)
        else if klass == "html":
            rejected.append(job, "no_qualifying_family")
        else:
            rejected.append(job, "no_qualifying_structured_evidence")
    return admitted, rejected
```

`family_key` uses the current numeric collapse. A full segment that matches hyphenated `8-4-4-4-12` hex collapses to `{uuid}`. A 32-character hex blob without hyphens does not. `job-categories` is one segment and does not match `job`. `career`, `careers`, `detail`, and `view` are not tokens. Every template that qualifies is kept. Threshold `2` is the existing constant, moved next to `family_key`, not a setting.

HTML, AI, plugin, table, div, and generic candidates do not receive structured credit for `location_raw` or `deadline`. RSS `published_at`, `description`, `salary_raw`, and API `id` / `job_id` / `position_id` are not read. An API identifier may still be used to construct a URL. That construction is not admission evidence.

A `JobPosting` needs `record_class="job_posting"`, set only inside `_parse_job_posting`. Title and a surviving URL alone reject. `location_raw`, `deadline`, or `employment_type` qualifies, including a single item.

An RSS or API item with title and URL alone rejects, including a one-item batch. RSS `deadline` qualifies. RSS `location_raw` alone does not. API `deadline` or `location_raw` qualifies. Those are the fields the existing parsers already store for `closing_date`, `application_deadline`, `due_date`, `duty_station`, `city`, `country`, and `place`.

Rejected rows are logged with `ExtractionLogger.log_failed_insert`, which already stores `error` and a payload. The error string is the reason above. HTML already owns a logger. RSS and API call the same existing logger for these rejects. No new table.

## 5. Admission stamp

The mark is the in-memory key `admitted = True` on the extractor dict. Each `save_jobs` copies that key onto the dict it builds for `persist_candidate`. It is not in `VALIDATED_FIELDS` or `SUPPLEMENTARY_FIELDS`, so `_insert` and `_update` do not write it. No schema change, no database column, no new table.

`persist_candidate` returns `rejected` when the key is missing, then runs today’s `rejection_reason` and the existing identity and upsert path. It does not count families. Normalization stays inside `both_keys`.

The sequence stays:

```text
validation
→ normalization
→ identity / both_keys
→ upsert
```

Gate 11 does not add a normalization stage.

## 6. Behavior preserved

Query denies, social and badge denies, career roots, mailto, and placeholders stay in `destination_rejection`. The 0.25 floor stays in `rejection_reason` and is not an admission signal. `seen_again` still updates only `last_seen_at` and does not clear `deleted_at`. A qualifying rediscovery may reach the writer and remains suppressed. Enrichment, geocoding, quality scoring, Meilisearch projection, `finish_run`, and fetch behavior stay where they are.

`test_listing_without_a_repeated_detail_template_stays_permissive` encodes the fallback this gate removes. It is replaced, not kept green by preserving that fallback.

## 7. Tests

In `apps/backend/tests/test_link_admission.py`, call `admit_batch` with class `html` unless noted:

- Repeated `/en-us/job/{id}/` plus the UNICEF content and social URLs admits only the job URLs. This replaces `test_repeated_unicef_detail_template_drops_one_off_pages`.
- `/job/{id}` and `/vacancy/{id}` together both survive. This replaces `test_two_repeated_detail_templates_are_both_kept`.
- One `/job/{id}` plus slug pages admits nothing. This replaces the permissive test.
- Repeated `/careers/internships`, `/careers/unicef-job-categories`, and `/careers/professional-and-career-development` reject.
- One slug rejects.
- `/page/2` and `/page/3` reject as `pagination_path`. Same for `/pages/{id}`.
- `/news/2024/123` and `/news/2025/456` reject as `no_qualifying_family`.
- Repeated `/foo/123` rejects. Repeated `/careers/job-categories` rejects.
- Two hyphenated UUIDs under any prefix admit. One UUID rejects. Two 32-hex segments reject.
- The same URLs with `extracted_by` set to `ai` and `html` produce the same decision.
- Class `html` with `location_raw` and `deadline` on a slug rejects. An AI slug with those fields rejects. An AI repeated numeric vacancy family admits.
- Class `job_posting` with title and URL only rejects. Adding `location_raw`, or `deadline`, or `employment_type`, admits even as a single item.
- Class `rss` with title and URL only rejects. Adding `deadline` admits. Adding only `location_raw` rejects.
- Class `api` with title and URL only rejects. Adding `deadline` or `location_raw` admits.
- An API dict whose only extra key is an id, `job_id`, or `position_id` rejects.
- A plugin candidate follows the HTML rule unless it is a `job_posting`, `rss`, or `api` record. Qualifying evidence on the right record class admits. Provenance does not.

In `apps/backend/tests/test_gate4_persist.py`, stamp the existing helper used by direct `persist_candidate` calls. Keep `test_removed_html_prefilter_cases_are_rejected_without_sql`, including `quality_score` 0.24. Add a case with no stamp that rejects without SQL. Keep `test_suppressed_row_is_not_reactivated`: a stamped qualifying candidate still returns `seen_again`.

Stamp the direct `persist_candidate` calls in `apps/backend/tests/test_gate6_lifecycle.py` and `apps/backend/tests/test_gate7_search.py` the same way.

Do not add a second copy of the social, mailto, and root cases already in `test_gate3_contracts.py` and `test_gate4_persist.py`.

Existing suites that must stay green:

- `tests/test_gate1_safety.py`
- `tests/test_gate3_contracts.py`
- `tests/test_gate4_persist.py`
- `tests/test_gate5_crawl_run.py`
- `tests/test_gate6_lifecycle.py`
- `tests/test_gate7_search.py`
- `tests/test_gate8_organisations.py`
- `tests/test_gate9_admin.py`
- `tests/test_gate10_legacy.py`
- `tests/test_link_admission.py`

Do not weaken or remove existing safety tests to make Gate 11 pass.

### Truth table

| Candidate | Expected |
|---|---|
| Repeated `/en-us/job/596188/` family | ADMIT |
| Repeated `/page/2`, `/page/3` | REJECT |
| Repeated `/news/2025/123` family | REJECT |
| Repeated UUID family | ADMIT |
| Repeated `/careers/internships` | REJECT |
| `/careers/unicef-job-categories` | REJECT |
| One slug | REJECT |
| JobPosting title + URL only | REJECT |
| JobPosting + `jobLocation` / `location_raw` | ADMIT |
| RSS title + URL only | REJECT |
| RSS title + URL + parsed deadline | ADMIT |
| One RSS item, title + URL only | REJECT |
| AI repeated numeric vacancy family | ADMIT |
| AI slug only | REJECT |
| Qualifying plugin evidence on the correct record class | ADMIT |
| Qualifying candidate matching a suppressed row | Controller may admit; writer returns `seen_again`; `deleted_at` stays set |

A lone `/en-us/job/596188/` with no sibling rejects. The admit row assumes a repeated family.

## 8. Risks

The rollout extractor returns dicts without `record_class`. They follow the HTML rule. This gate does not teach that extractor to emit `job_posting`.

`save_jobs` builds a new dict. Forgetting to copy `admitted` makes every admitted row fail the backstop. The copy belongs in all three `save_jobs` methods.

JSON-LD structured admit depends on `_parse_job_posting` setting `record_class`. If that assignment is missed, a `JobPosting` with a location is judged as HTML and needs a repeated family.

Family keys must be computed after pagination removal. Counting first would let `/page/2` form a family and then fail the token check anyway, so the result is still a reject, but the reason would be wrong.

RSS `deadline` is a regex over description text. A post containing `Deadline: 01/02/2026` is admitted. That residual is accepted.

A stamped `/page/2` would pass `persist_candidate`, because path pagination is enforced in the batch, not in `rejection_reason`. Only `admit_batch` sets the stamp.

## 9. Rollback

Revert the implementation commit. There is no migration, no new column, and no index change. The previous permissive link fallback and the unstamped writer return together.

## 10. Out of scope

- Issue #5 (`finish_run` success when persistence saved nothing; `failed` versus `fail`)
- SSRF wiring of `contracts.fetch` into the fetchers
- Detail-page fetching, browser verification, or HTTP verification of candidates
- Browser expansion
- AI expansion
- DOM signatures or job-card inference
- Source Profile, Scout, Mapper, Frontier, or learned source grammar
- Meilisearch changes or reindex
- Orchestrator restructuring
- A second crawler, pipeline, writer, worker, or jobs table
- A new rejection table or admission column

## 11. Verdict

The repository can take this contract without an architectural restructuring. The controller is a batch step the three adapters already share in shape, and the stamp fits the dict `save_jobs` already rebuilds.

Implementation waits for an explicit instruction to begin, and then proceeds one step at a time.
