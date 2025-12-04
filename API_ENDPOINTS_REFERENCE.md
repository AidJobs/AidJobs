# AidJobs API Endpoints Reference

**Base URL:** `https://www.aidjobs.app`

All endpoints require admin authentication unless otherwise noted. Admin endpoints require `admin_required` dependency.

---

## 🔐 Authentication Endpoints

**Prefix:** `/api/admin`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/admin/login` | Admin login | No |
| POST | `/api/admin/logout` | Admin logout | Yes |
| GET | `/api/admin/session` | Check session status | No |
| GET | `/api/admin/config-check` | Check admin configuration | No |

---

## 🏥 Health & Status Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/healthz` | Health check | No |
| GET | `/api/capabilities` | Get system capabilities | No |
| GET | `/api/search/status` | Meilisearch status | No |
| GET | `/api/db/status` | Database status | No |
| GET | `/api/debug/routes` | List all registered routes | Yes |

---

## 🔍 Search Endpoints

**Prefix:** `/api/search`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/search/query` | Search jobs | No |
| GET | `/api/search/facets` | Get search facets | No |
| POST | `/api/search/parse` | Parse search query | No |
| GET | `/api/search/autocomplete` | Autocomplete suggestions | No |

---

## 💼 Job Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/jobs/{job_id}` | Get job by ID | No |

---

## 📊 Admin - Search Management

**Prefix:** `/admin/search`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/admin/search/status` | Get search status (dev only) | Yes |
| GET | `/admin/search/settings` | Get Meilisearch settings (dev only) | Yes |
| POST | `/admin/search/init` | Initialize Meilisearch index | Yes |
| GET | `/admin/search/reindex` | Reindex jobs | Yes |
| POST | `/admin/search/reindex` | Reindex jobs | Yes |

---

## 📊 Admin - Database Management

**Prefix:** `/admin/db`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/admin/db/status` | Get database status (dev only) | Yes |

---

## 📊 Admin - Job Management

**Prefix:** `/api/admin/jobs`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/admin/jobs/search` | Search jobs (admin) | Yes |
| POST | `/api/admin/jobs/impact-analysis` | Analyze deletion impact | Yes |
| POST | `/api/admin/jobs/delete-bulk` | Bulk delete jobs | Yes |
| POST | `/api/admin/jobs/restore` | Restore deleted jobs | Yes |
| POST | `/api/admin/jobs/export` | Export jobs | Yes |
| GET | `/api/admin/jobs/diagnose/search-vs-db` | Diagnose search vs DB | Yes |
| GET | `/api/admin/jobs/diagnose/{job_id}` | Diagnose specific job | Yes |

---

## 📊 Admin - Job Enrichment

**Prefix:** `/admin/jobs`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/admin/jobs/enrich` | Enrich a single job | Yes |
| POST | `/admin/jobs/enrich/batch` | Batch enrich jobs | Yes |

---

## 📊 Admin - Enrichment Management

**Prefix:** `/admin/enrichment`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/admin/enrichment/review-queue` | Get review queue | Yes |
| POST | `/admin/enrichment/review/{review_id}` | Update review | Yes |
| GET | `/admin/enrichment/history/{job_id}` | Get enrichment history | Yes |
| GET | `/admin/enrichment/quality-dashboard` | Get quality dashboard | Yes |
| GET | `/admin/enrichment/unenriched-count` | Get unenriched count | Yes |
| GET | `/admin/enrichment/unenriched-jobs` | Get unenriched jobs | Yes |
| POST | `/admin/enrichment/feedback` | Submit feedback | Yes |
| GET | `/admin/enrichment/feedback/patterns` | Get feedback patterns | Yes |
| POST | `/admin/enrichment/ground-truth` | Add ground truth | Yes |
| POST | `/admin/enrichment/validate/{job_id}` | Validate enrichment | Yes |
| GET | `/admin/enrichment/consistency/{job_id}` | Check consistency | Yes |

---

## 📊 Admin - Normalization

**Prefix:** `/admin/normalize`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/admin/normalize/reindex` | Normalize and reindex (dev only) | Yes |
| GET | `/admin/normalize/report` | Get normalization report (dev only) | Yes |
| GET | `/admin/normalize/preview` | Preview normalization (dev only) | Yes |

---

## 🕷️ Crawler Management

**Prefix:** `/api/admin/crawl`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/admin/crawl/run` | Run crawl for a source | Yes |
| POST | `/api/admin/crawl/run_due` | Run all due sources | Yes |
| POST | `/api/admin/crawl/cleanup_expired` | Cleanup expired jobs | Yes |
| GET | `/api/admin/crawl/status` | Get crawler status | Yes |
| GET | `/api/admin/crawl/logs` | Get crawl logs | Yes |
| GET | `/api/admin/crawl/diagnostics/unesco` | UNESCO diagnostics | Yes |
| GET | `/api/admin/crawl/diagnostics/undp` | UNDP diagnostics | Yes |
| POST | `/api/admin/crawl/fix-undp-urls` | Fix UNDP URLs | Yes |
| POST | `/api/admin/crawl/delete-jobs-by-org` | Delete jobs by organization | Yes |
| GET | `/api/admin/crawl/analytics/overview` | Get crawl analytics overview | Yes |
| GET | `/api/admin/crawl/analytics/source/{source_id}` | Get source analytics | Yes |
| POST | `/api/admin/crawl/run-migration` | Run deletion migration | Yes |
| POST | `/api/admin/crawl/backfill-quality-scores` | Backfill quality scores | Yes |

---

## 🤖 Robots.txt Management

**Prefix:** `/api/admin/robots`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/admin/robots/{host}` | Get robots.txt for host | Yes |

---

## 🔒 Domain Policies

**Prefix:** `/api/admin/domain_policies`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/admin/domain_policies/{host}` | Get domain policy | Yes |
| POST | `/api/admin/domain_policies/{host}` | Upsert domain policy | Yes |

---

## 📈 Data Quality

**Prefix:** `/api/admin/data-quality`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/admin/data-quality/source/{source_id}` | Get source quality | Yes |
| GET | `/api/admin/data-quality/global` | Get global quality | Yes |
| GET | `/api/admin/data-quality/logs` | Get quality logs | Yes |
| GET | `/api/admin/data-quality/stats` | Get quality stats | Yes |
| GET | `/api/admin/data-quality/rejected` | Get rejected jobs | Yes |

---

## 🔗 Link Validation

**Prefix:** `/api/admin/link-validation`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/admin/link-validation/validate` | Validate links | Yes |
| GET | `/api/admin/link-validation/stats` | Get validation stats | Yes |
| POST | `/api/admin/link-validation/validate-job/{job_id}` | Validate job link | Yes |

---

## 🔍 Meilisearch Management

**Prefix:** `/api/admin/meilisearch`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/admin/meilisearch/sync` | Sync Meilisearch | Yes |

---

## 📊 Observability Endpoints

**Prefix:** `/api/admin/observability`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/admin/observability/test` | Test observability router | Yes |
| GET | `/api/admin/observability/coverage` | Get coverage statistics | Yes |
| GET | `/api/admin/observability/coverage/sources` | Get source coverage | Yes |
| GET | `/api/admin/observability/coverage/issues` | Get coverage issues | Yes |
| GET | `/api/admin/observability/extraction/stats` | Get extraction statistics | Yes |
| GET | `/api/admin/observability/failed-inserts` | Get failed inserts | Yes |
| GET | `/api/admin/observability/validation-errors` | Get validation errors | Yes |

**Query Parameters for validation-errors:**
- `source_id` (optional): Filter by source ID
- `limit` (optional, default: 50): Maximum number of results
- `unresolved_only` (optional, default: true): Only return unresolved failures

**Example:**
```
GET https://www.aidjobs.app/api/admin/observability/validation-errors?source_id=cf090bc4-552d-44ef-b133-ff0a73bbb0ea&limit=50
```

---

## 📝 Sources Management

**Prefix:** `/admin/sources`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/admin/sources` | List sources | Yes |
| POST | `/admin/sources` | Create source | Yes |
| PATCH | `/admin/sources/{source_id}` | Update source | Yes |
| DELETE | `/admin/sources/{source_id}` | Delete source | Yes |
| DELETE | `/admin/sources/{source_id}/permanent` | Permanently delete source | Yes |
| POST | `/admin/sources/{source_id}/test` | Test source | Yes |
| GET | `/admin/sources/{source_id}/export` | Export source | Yes |
| POST | `/admin/sources/import` | Import sources | Yes |
| POST | `/admin/sources/{source_id}/simulate_extract` | Simulate extraction | Yes |

---

## 📋 Presets

**Prefix:** `/admin/presets`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/admin/presets/sources` | Get source presets | Yes |
| GET | `/admin/presets/sources/{preset_name}` | Get specific preset | Yes |

---

## ⭐ Shortlist

**Prefix:** `/api/shortlist`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/shortlist/{job_id}` | Toggle shortlist | No |
| GET | `/api/shortlist` | Get shortlist | No |

---

## 💰 Find & Earn

**Prefix:** `/api/find-earn`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/find-earn/submit` | Submit URL | No |

**Prefix:** `/admin/find-earn`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/admin/find-earn/list` | List submissions | Yes |
| POST | `/admin/find-earn/approve/{submission_id}` | Approve submission | Yes |
| POST | `/admin/find-earn/reject/{submission_id}` | Reject submission | Yes |

---

## 🛠️ Admin - General

**Prefix:** `/admin`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/admin/dev/status` | Dev mode status (dev only) | Yes |
| GET | `/admin/diagnostics/meili-openrouter` | Diagnostics (dev only) | Yes |
| GET | `/admin/setup/status` | Setup status (dev only) | Yes |
| GET | `/admin/metrics` | Get metrics (dev only) | Yes |
| GET | `/admin/lookups/status` | Get lookups status (dev only) | Yes |
| GET | `/admin/lookups/{table}` | Get lookup items (dev only) | Yes |
| POST | `/admin/lookups/{table}` | Upsert lookup item (dev only) | Yes |
| GET | `/admin/synonyms` | Get synonyms (dev only) | Yes |
| POST | `/admin/synonyms` | Upsert synonym (dev only) | Yes |
| POST | `/admin/normalize/reindex` | Normalize and reindex (dev only) | Yes |
| POST | `/admin/database/migrate` | Apply database migration (dev only) | Yes |

---

## 🔧 Crawler V2 Routes

**Prefix:** `/api/admin/crawler-v2`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/admin/crawler-v2/run` | Run source crawl | Yes |
| POST | `/api/admin/crawler-v2/run-all` | Run all sources | Yes |
| GET | `/api/admin/crawler-v2/status` | Get crawler status | Yes |

---

## 📝 Legacy Crawl Routes

**Prefix:** `/admin/crawl`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/admin/crawl/run` | Run crawl (dev only) | Yes |
| GET | `/admin/crawl/logs` | Get crawl logs (dev only) | Yes |

---

## 🔑 Configuration

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/admin/config/env` | Get environment config | No |

---

## Notes

1. **Admin Authentication:** Most endpoints require admin authentication via `admin_required` dependency. You must be logged in via `/api/admin/login` first.

2. **Dev Mode:** Some endpoints are only available when `AIDJOBS_ENV=dev` is set.

3. **Rate Limiting:** Some endpoints have rate limiting applied (search, submit, login).

4. **Query Parameters:** Many GET endpoints accept query parameters for filtering, pagination, etc. Check individual endpoint documentation for details.

5. **Base URL:** All endpoints use `https://www.aidjobs.app` as the base URL in production.

---

## Example Usage

### Get Validation Errors
```bash
curl -X GET "https://www.aidjobs.app/api/admin/observability/validation-errors?source_id=cf090bc4-552d-44ef-b133-ff0a73bbb0ea&limit=50" \
  -H "Cookie: admin_session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json"
```

### Test Observability Router
```bash
curl -X GET "https://www.aidjobs.app/api/admin/observability/test" \
  -H "Cookie: admin_session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json"
```

### Run Source Crawl
```bash
curl -X POST "https://www.aidjobs.app/api/admin/crawl/run" \
  -H "Cookie: admin_session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"source_id": "cf090bc4-552d-44ef-b133-ff0a73bbb0ea"}'
```

