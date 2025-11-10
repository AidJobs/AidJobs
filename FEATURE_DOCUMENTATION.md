# AidJobs - Comprehensive Feature Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [User Journeys](#user-journeys)
4. [Feature List with Functions](#feature-list-with-functions)
5. [Completion Status](#completion-status)
6. [What Needs to Be Done](#what-needs-to-be-done)

---

## Overview

**AidJobs** is a job search platform specifically designed for humanitarian, development, and NGO sector jobs. It aggregates job listings from multiple sources, normalizes them into a consistent format, and provides powerful search and filtering capabilities.

### Key Technologies
- **Frontend**: Next.js 14 (App Router), TypeScript, React, Tailwind CSS
- **Backend**: FastAPI (Python), PostgreSQL (Supabase), Meilisearch
- **Deployment**: Vercel (Frontend), Render (Backend)
- **Monorepo**: npm workspaces

---

## Architecture

### System Components

1. **Frontend Application** (`apps/frontend`)
   - Next.js App Router with Server/Client Components
   - Search interface with filters
   - Admin panel for content management
   - Collections (curated job views)

2. **Backend API** (`apps/backend`)
   - FastAPI REST API
   - Search service (Meilisearch + PostgreSQL fallback)
   - Crawler orchestrator (autonomous job fetching)
   - Normalization engine
   - Admin authentication

3. **Database** (Supabase PostgreSQL)
   - Jobs table
   - Sources table
   - Taxonomy lookup tables
   - Crawl logs and locks

4. **Search Engine** (Meilisearch)
   - Full-text search
   - Faceted filtering
   - Relevance ranking

---

## User Journeys

### 1. Job Seeker Journey

#### **Journey A: Basic Search**
1. User lands on homepage (`/`)
2. Sees search bar and filter panels (Country, Level, International, Mission Tags)
3. Types search query (e.g., "health coordinator")
4. System performs debounced search (250ms delay)
5. Results appear with:
   - Job title, organization, location
   - Level, deadline, mission tags
   - Relevance reasons (if applicable)
6. User clicks a job card
7. Job inspector modal opens with full details
8. User can:
   - Click "Apply" to visit external application page
   - Save job to shortlist (client-side localStorage)
   - Close modal and continue browsing

#### **Journey B: Filtered Search**
1. User selects filters:
   - Country: "Kenya"
   - Level: "Senior"
   - International eligible: ✓
   - Mission Tags: "Health", "Emergency"
2. URL updates with query parameters
3. Search executes with combined filters
4. Facets update to show counts per filter option
5. Results show only matching jobs
6. User can clear individual filters or "Clear all"

#### **Journey C: Collection Browse**
1. User clicks on "UN Jobs" in sidebar
2. Navigates to `/collections/un-jobs`
3. Page loads with preset filter: `org_type=un`
4. User can add additional filters via URL params
5. Results show only UN agency jobs
6. Same search/filter/save functionality as main page

#### **Journey D: Saved Jobs**
1. User clicks "Saved" button (shows count badge)
2. Saved jobs panel slides in from right
3. Lists all saved job IDs (from localStorage)
4. User clicks a saved job
5. Job inspector opens
6. User can remove from saved list
7. User can navigate to `/saved` page for full view

### 2. Admin Journey

#### **Journey A: Login & Dashboard**
1. Admin navigates to `/admin/login`
2. Enters password (stored in `ADMIN_PASSWORD` env var)
3. Session cookie set
4. Redirected to `/admin` dashboard
5. Dashboard shows:
   - Database status (job count, source count)
   - Search engine status (index stats, document count)
   - Quick links to other admin pages

#### **Journey B: Source Management**
1. Admin navigates to `/admin/sources`
2. Sees list of all sources (paginated, filterable)
3. Can:
   - **Create**: Add new source (URL, type, org info)
   - **Edit**: Update source details
   - **Test**: Check if URL is reachable
   - **Simulate**: Preview extracted jobs (first 3)
   - **Delete**: Soft delete (status='deleted')
4. New sources auto-queue for immediate crawl

#### **Journey C: Crawler Management**
1. Admin navigates to `/admin/crawl`
2. Sees real-time status:
   - Running crawls
   - Due sources count
   - In-flight crawls
   - Available slots
   - Locked sources
3. Left panel: Source list with status badges
4. Right panel: Selected source details + logs
5. Can:
   - **Run Due Sources**: Trigger all due crawls
   - **Run Now**: Manually trigger specific source
   - **View Logs**: See crawl history with counts
   - **Domain Policy**: Configure crawl limits per domain

#### **Journey D: Find & Earn Moderation**
1. Admin navigates to `/admin/find-earn`
2. Sees list of user-submitted career page URLs
3. Each submission shows:
   - URL, source type, detected job count
   - Status (pending/approved/rejected)
   - Submission timestamp
4. Can:
   - **Approve**: Creates source, marks submission approved
   - **Reject**: Marks rejected with notes
5. Approved submissions become active sources

#### **Journey E: Normalization Review**
1. Admin navigates to `/admin/normalize`
2. Sees normalization report:
   - Total jobs, sources
   - Country normalization stats (normalized vs unknown)
   - Level normalization stats
   - Mission tags normalization stats
   - Top unknown values
3. Can preview normalization for specific jobs
4. Can trigger reindex to apply normalization

#### **Journey F: Taxonomy Management**
1. Admin navigates to `/admin/taxonomy`
2. Sees lookup table status:
   - Countries, Levels, Tags, etc.
   - Count of entries per table
3. Can view/edit taxonomy entries (if implemented)

---

## Feature List with Functions

### 1. Search & Discovery

#### **1.1 Main Search Interface**
**File**: `apps/frontend/app/HomeClient.tsx`

**Functions**:
- `performSearch(page, append)` - Executes search query with filters
  - **Status**: ✅ Complete
  - **Details**: Handles pagination, debouncing, abort controllers
  - **Parameters**: `page` (number), `append` (boolean)
  - **Returns**: Updates `results`, `total`, `page` state

- `fetchFacets()` - Gets filter facet counts
  - **Status**: ✅ Complete
  - **Details**: Caches facets for 30 seconds, fetches from `/api/search/facets`
  - **Returns**: Updates `facets` state with country/level/tags counts

- `handleSearchChange(value)` - Handles search input changes
  - **Status**: ✅ Complete
  - **Details**: Debounces input (250ms), resets to page 1
  - **Parameters**: `value` (string)

- `handleFilterChange()` - Applies filter changes
  - **Status**: ✅ Complete
  - **Details**: Updates URL params, triggers search
  - **Returns**: Calls `updateURLParams()` and `performSearch()`

- `updateURLParams()` - Syncs filters to URL
  - **Status**: ✅ Complete
  - **Details**: Builds query string from filter state, updates router
  - **Returns**: Updates browser URL without page reload

- `toggleMissionTag(tag)` - Toggles mission tag filter
  - **Status**: ✅ Complete
  - **Details**: Adds/removes tag from `missionTags` array
  - **Parameters**: `tag` (string)

- `clearFilters()` - Resets all filters
  - **Status**: ✅ Complete
  - **Details**: Clears country, level, international, tags, query, sort
  - **Returns**: Resets all filter state to defaults

- `handleLoadMore()` - Loads next page
  - **Status**: ✅ Complete
  - **Details**: Appends next page of results
  - **Returns**: Calls `performSearch(page + 1, true)`

**Backend Endpoint**: `GET /api/search/query`
**File**: `apps/backend/app/search.py`

**Functions**:
- `search_query()` - Main search endpoint
  - **Status**: ✅ Complete
  - **Details**: Accepts query, filters, pagination, sort
  - **Returns**: `{status, data: {items, total, page, size, source}, error, request_id}`
  - **Fallback**: Meilisearch → Database → Empty results

- `_search_meilisearch()` - Meilisearch search
  - **Status**: ✅ Complete
  - **Details**: Builds filter string, applies sort, computes relevance reasons
  - **Returns**: `{items, total, page, size}` or `None` on error

- `_search_database()` - PostgreSQL fallback search
  - **Status**: ✅ Complete
  - **Details**: Uses ILIKE for text search, array operators for filters
  - **Returns**: `{items, total, page, size}`

- `_normalize_filters()` - Normalizes user inputs
  - **Status**: ✅ Complete
  - **Details**: Converts country names to ISO codes, normalizes levels/tags
  - **Returns**: `dict` with normalized filter values

- `_compute_reasons()` - Computes relevance reasons
  - **Status**: ✅ Complete
  - **Details**: Matches filters to job attributes, returns max 3 reasons
  - **Returns**: `list[str]` (e.g., ["Mission: Health", "Level: Senior"])

#### **1.2 Facets API**
**Backend Endpoint**: `GET /api/search/facets`
**File**: `apps/backend/app/search.py`

**Functions**:
- `get_facets()` - Returns facet counts
  - **Status**: ✅ Complete
  - **Details**: Tries Meilisearch first, falls back to database
  - **Returns**: `{enabled, facets: {country, level_norm, mission_tags, international_eligible}}`

- `_get_database_facets()` - Database facet calculation
  - **Status**: ✅ Complete
  - **Details**: Uses GROUP BY queries, limits to top 50 countries, top 10 tags
  - **Returns**: `dict` with facet counts

#### **1.3 Job Detail View**
**Backend Endpoint**: `GET /api/jobs/{job_id}`
**File**: `apps/backend/app/search.py`

**Functions**:
- `get_job_by_id(job_id)` - Fetches single job
  - **Status**: ✅ Complete
  - **Details**: Prefers database, falls back to Meilisearch
  - **Returns**: `{status, data: job, source}` or `None` (404)

**Frontend Component**: `apps/frontend/components/JobInspector.tsx`
- **Status**: ✅ Complete
- **Details**: Modal overlay with full job details, apply button, save toggle

#### **1.4 Collections**
**File**: `apps/frontend/app/collections/[slug]/page.tsx`

**Functions**:
- `getCollection(slug)` - Gets collection preset
  - **Status**: ✅ Complete
  - **Details**: Returns preset filters from `lib/collections.ts`
  - **Returns**: `CollectionPreset | null`

**Available Collections**:
- `un-jobs` - UN agencies (`org_type=un`)
- `remote` - Remote jobs (`work_modality=remote`)
- `consultancies` - Consultancies (`career_type=consultancy`)
- `fellowships` - Fellowships (`career_type=fellowship`)
- `surge` - Emergency roles (`surge_required=true`)

**Status**: ✅ Complete

---

### 2. Saved Jobs (Shortlist)

#### **2.1 Client-Side Shortlist**
**File**: `apps/frontend/lib/shortlist.ts`

**Functions**:
- `getShortlist()` - Gets saved job IDs
  - **Status**: ✅ Complete
  - **Details**: Reads from localStorage
  - **Returns**: `string[]` of job IDs

- `toggleShortlist(jobId)` - Toggles save status
  - **Status**: ✅ Complete
  - **Details**: Adds/removes from localStorage array
  - **Returns**: `boolean` (true if now saved)

- `isInShortlist(jobId)` - Checks if saved
  - **Status**: ✅ Complete
  - **Returns**: `boolean`

- `removeFromShortlist(jobId)` - Removes from saved
  - **Status**: ✅ Complete
  - **Details**: Removes from localStorage array

**Frontend Pages**:
- `/saved` - Full saved jobs page
  - **Status**: ✅ Complete
  - **Details**: Fetches full job details for saved IDs, displays list

**Backend Endpoint**: `POST /api/shortlist/{job_id}`
**File**: `apps/backend/app/shortlist.py`

**Functions**:
- `toggle_shortlist(job_id, user_id)` - Server-side toggle
  - **Status**: ⚠️ Partial (requires auth)
  - **Details**: Currently requires `user_id`, returns 401 without auth
  - **Note**: Frontend uses client-side localStorage instead

**Status**: ✅ Client-side complete, ⚠️ Server-side pending auth

---

### 3. Content Management (Admin)

#### **3.1 Admin Authentication**
**File**: `apps/backend/app/admin_auth_routes.py`

**Functions**:
- `admin_login()` - Login endpoint
  - **Status**: ✅ Complete
  - **Details**: Validates password, sets session cookie
  - **Returns**: `{authenticated: true}`

- `admin_logout()` - Logout endpoint
  - **Status**: ✅ Complete
  - **Details**: Clears session cookie

- `admin_session()` - Session check
  - **Status**: ✅ Complete
  - **Returns**: `{authenticated: boolean}`

**Frontend**: `/admin/login` page
- **Status**: ✅ Complete

#### **3.2 Source Management**
**Backend Endpoint**: `GET /admin/sources`
**File**: `apps/backend/app/sources.py`

**Functions**:
- `list_sources()` - Lists sources with pagination
  - **Status**: ✅ Complete
  - **Details**: Supports status filter, search query
  - **Returns**: `{status, data: {items, total, page, size}}`

- `create_source()` - Creates new source
  - **Status**: ✅ Complete
  - **Details**: Auto-queues for crawl (`next_run_at=now()`)
  - **Returns**: Created source object

- `update_source()` - Updates source
  - **Status**: ✅ Complete
  - **Details**: Partial update, validates URL uniqueness
  - **Returns**: Updated source object

- `delete_source()` - Soft deletes source
  - **Status**: ✅ Complete
  - **Details**: Sets `status='deleted'`
  - **Returns**: `{status, data: {id}}`

- `test_source()` - Tests URL connectivity
  - **Status**: ✅ Complete
  - **Details**: HEAD request, returns status/size/headers
  - **Returns**: `{ok, status, size, etag, last_modified, host}`

- `simulate_extract()` - Preview job extraction
  - **Status**: ✅ Complete
  - **Details**: Runs crawler without DB writes, returns first 3 jobs
  - **Returns**: `{ok, count, sample: [jobs]}`

**Frontend**: `/admin/sources` page
- **Status**: ✅ Complete
- **Details**: Full CRUD interface with modals

#### **3.3 Crawler Management**
**Backend Endpoint**: `GET /admin/crawl/status`
**File**: `apps/backend/app/crawl.py`

**Functions**:
- `get_crawl_status()` - Gets orchestrator status
  - **Status**: ✅ Complete
  - **Details**: Returns running, due_count, in_flight, locks, pool availability
  - **Returns**: `{running, due_count, in_flight, locks, pool}`

- `run_crawl()` - Triggers crawl for source
  - **Status**: ✅ Complete
  - **Details**: Queues source for immediate crawl
  - **Returns**: `{queued: 1}`

- `run_due_sources()` - Triggers all due sources
  - **Status**: ✅ Complete
  - **Details**: Queues all sources with `next_run_at <= now()`
  - **Returns**: `{queued: number}`

- `get_crawl_logs()` - Gets crawl history
  - **Status**: ✅ Complete
  - **Details**: Paginated logs with optional source filter
  - **Returns**: `{items, total, page, size}`

**Frontend**: `/admin/crawl` page
- **Status**: ✅ Complete
- **Details**: Real-time status dashboard, source list, logs table

#### **3.4 Crawler Orchestrator**
**File**: `apps/backend/orchestrator.py`

**Functions**:
- `CrawlerOrchestrator` - Main orchestrator class
  - **Status**: ✅ Complete
  - **Details**: Manages autonomous crawling with adaptive scheduling

- `compute_next_run()` - Calculates next crawl time
  - **Status**: ✅ Complete
  - **Details**: Adaptive scheduling based on activity/failures
  - **Rules**:
    - High activity (10+ changes) → decrease frequency
    - No changes (3+ runs) → increase frequency
    - Failures → exponential backoff
    - Jitter ±15%

- `crawl_source()` - Crawls single source
  - **Status**: ✅ Complete
  - **Details**: Fetches based on type (HTML/RSS/API), normalizes, upserts
  - **Returns**: `{status, message, counts, duration_ms}`

- `update_source_after_crawl()` - Updates source record
  - **Status**: ✅ Complete
  - **Details**: Updates counters, computes next run, writes log
  - **Circuit Breaker**: Auto-pauses after 5 consecutive failures

- `scheduler_loop()` - Background scheduler
  - **Status**: ✅ Complete
  - **Details**: Runs every 5 minutes, processes due sources
  - **Concurrency**: Max 3 concurrent crawls (semaphore)

**Status**: ✅ Complete

#### **3.5 Find & Earn**
**Backend Endpoint**: `POST /api/find-earn/submit`
**File**: `apps/backend/app/find_earn.py`

**Functions**:
- `submit_url()` - Public submission endpoint
  - **Status**: ✅ Complete
  - **Details**: Validates URL, checks duplicates, detects jobs, creates submission
  - **Rate Limited**: Yes (RATE_LIMIT_SUBMIT)
  - **Returns**: `{status, data, message}`

- `list_submissions()` - Admin list endpoint
  - **Status**: ✅ Complete
  - **Details**: Paginated list with status filter
  - **Returns**: `{status, data: {items, total, page, size}}`

- `approve_submission()` - Approves submission
  - **Status**: ✅ Complete
  - **Details**: Creates source, marks submission approved
  - **Returns**: `{status, message, source_id}`

- `reject_submission()` - Rejects submission
  - **Status**: ✅ Complete
  - **Details**: Marks rejected with notes
  - **Returns**: `{status, message}`

**Frontend**: `/admin/find-earn` page
- **Status**: ✅ Complete

**Public Modal**: `SubmitCareerPageModal` component
- **Status**: ✅ Complete
- **Location**: Accessible from sidebar "Submit a careers page"

#### **3.6 Normalization & Taxonomy**
**Backend Endpoint**: `GET /admin/normalize/report`
**File**: `apps/backend/main.py`

**Functions**:
- `admin_normalize_report()` - Normalization statistics
  - **Status**: ✅ Complete
  - **Details**: Shows normalized vs unknown counts for all fields
  - **Returns**: `{ok, totals, country, level_norm, international_eligible, mission_tags, mapping_tables}`

- `admin_normalize_preview()` - Preview normalization
  - **Status**: ✅ Complete
  - **Details**: Shows raw vs normalized data for sample jobs
  - **Returns**: `{total, previews: [{job_id, raw, normalized, dropped_fields, validation}]}`

**Frontend**: `/admin/normalize` page
- **Status**: ✅ Complete

**Backend Endpoint**: `GET /admin/taxonomy`
**File**: `apps/backend/app/admin.py`

**Functions**:
- `get_taxonomy_status()` - Taxonomy table status
  - **Status**: ✅ Complete
  - **Details**: Returns counts for all lookup tables
  - **Returns**: `{status, data: {table_name: count}}`

**Frontend**: `/admin/taxonomy` page
- **Status**: ✅ Complete

---

### 4. Search Engine Management

#### **4.1 Meilisearch Integration**
**File**: `apps/backend/app/search.py`

**Functions**:
- `_init_meilisearch()` - Initializes Meilisearch
  - **Status**: ✅ Complete
  - **Details**: Creates index if missing, configures searchable/filterable/sortable attributes
  - **Never Crashes**: Returns gracefully on error

- `get_search_status()` - Gets index status
  - **Status**: ✅ Complete
  - **Returns**: `{enabled, index: {name, stats}, error}`

- `get_search_settings()` - Gets index settings
  - **Status**: ✅ Complete
  - **Returns**: `{enabled, index, settings}`

- `reindex_jobs()` - Reindexes all jobs
  - **Status**: ✅ Complete
  - **Details**: Fetches from database, normalizes, batches uploads (500 per batch)
  - **Returns**: `{indexed, skipped, duration_ms, error}`

**Backend Endpoints**:
- `POST /admin/search/init` - Initialize index
  - **Status**: ✅ Complete

- `GET /admin/search/reindex` - Reindex jobs
  - **Status**: ✅ Complete

- `GET /admin/search/status` - Get status
  - **Status**: ✅ Complete

- `GET /admin/search/settings` - Get settings
  - **Status**: ✅ Complete

---

### 5. Data Normalization

#### **5.1 Normalization Engine**
**File**: `apps/backend/core/normalize.py`

**Functions**:
- `to_iso_country(country)` - Converts country to ISO code
  - **Status**: ✅ Complete
  - **Details**: Handles names, ISO-2 codes, common variations

- `norm_level(level)` - Normalizes job level
  - **Status**: ✅ Complete
  - **Details**: Maps to: Intern, Junior, Mid, Senior, Lead

- `norm_tags(tags)` - Normalizes mission tags
  - **Status**: ✅ Complete
  - **Details**: Maps to canonical tag names from taxonomy

- `norm_modality(modality)` - Normalizes work modality
  - **Status**: ✅ Complete
  - **Details**: Maps to: remote, hybrid, on-site

- `norm_benefits(benefits)` - Normalizes benefits
  - **Status**: ✅ Complete

- `norm_policy(policy_flags)` - Normalizes policy flags
  - **Status**: ✅ Complete

- `norm_donors(donor_context)` - Normalizes donor context
  - **Status**: ✅ Complete

**File**: `apps/backend/app/normalizer.py`

**Functions**:
- `normalize_job_data(job)` - Main normalization function
  - **Status**: ✅ Complete
  - **Details**: Applies all normalization functions, returns normalized dict

---

### 6. Crawler Modules

#### **6.1 HTML Crawler**
**File**: `apps/backend/crawler/html_fetch.py`

**Functions**:
- `fetch_html(url)` - Fetches HTML page
  - **Status**: ✅ Complete
  - **Details**: Respects robots.txt, handles 304 Not Modified, ETags
  - **Returns**: `(status, headers, html, size)`

- `extract_jobs(html, url, parser_hint)` - Extracts jobs from HTML
  - **Status**: ✅ Complete
  - **Details**: Uses BeautifulSoup, supports parser hints
  - **Returns**: `list[dict]` of raw jobs

- `normalize_job(job, org_name)` - Normalizes extracted job
  - **Status**: ✅ Complete
  - **Details**: Applies normalization, validates required fields
  - **Returns**: Normalized job dict

- `upsert_jobs(jobs, source_id)` - Upserts jobs to database
  - **Status**: ✅ Complete
  - **Details**: Uses canonical_hash for deduplication
  - **Returns**: `{found, inserted, updated, skipped}`

#### **6.2 RSS Crawler**
**File**: `apps/backend/crawler/rss_fetch.py`

**Functions**:
- `fetch_feed(url)` - Fetches RSS feed
  - **Status**: ✅ Complete
  - **Details**: Parses RSS/Atom feeds, filters by time window
  - **Returns**: `list[dict]` of raw jobs

- `normalize_job(job, org_name)` - Normalizes RSS job
  - **Status**: ✅ Complete

#### **6.3 API Crawler**
**File**: `apps/backend/crawler/api_fetch.py`

**Functions**:
- `fetch_api(url, parser_hint)` - Fetches from API
  - **Status**: ✅ Complete
  - **Details**: Supports JSON APIs, uses parser_hint for structure
  - **Returns**: `list[dict]` of raw jobs

---

### 7. Domain Policies & Robots.txt

#### **7.1 Domain Policies**
**File**: `apps/backend/app/crawler_admin.py`

**Functions**:
- `get_domain_policy(host)` - Gets domain policy
  - **Status**: ✅ Complete
  - **Details**: Returns policy or defaults
  - **Returns**: `{max_concurrency, min_request_interval_ms, max_pages, max_kb_per_page, allow_js}`

- `update_domain_policy(host)` - Updates domain policy
  - **Status**: ✅ Complete
  - **Details**: Persists to database
  - **Returns**: Updated policy

**Frontend**: Domain Policy Editor modal in `/admin/crawl`
- **Status**: ✅ Complete

#### **7.2 Robots.txt**
**File**: `apps/backend/core/robots.py`

**Functions**:
- `check_robots_allowed(url, user_agent)` - Checks robots.txt
  - **Status**: ✅ Complete
  - **Details**: Fetches and parses robots.txt, respects Disallow rules
  - **Returns**: `boolean`

---

### 8. Analytics & Monitoring

#### **8.1 Search Analytics**
**File**: `apps/backend/app/analytics.py`

**Functions**:
- `track_search()` - Tracks search queries
  - **Status**: ✅ Complete (dev-only)
  - **Details**: In-memory deque, last 100 searches
  - **Tracks**: query, filters, source, total_results, latency_ms

- `get_metrics()` - Gets analytics metrics
  - **Status**: ✅ Complete (dev-only)
  - **Returns**: `{status, data: {last_20_queries, avg_latency_ms, meili_hit_rate, ...}}`

**Backend Endpoint**: `GET /admin/metrics`
- **Status**: ✅ Complete (dev-only)

---

### 9. Health & Capabilities

#### **9.1 Health Check**
**Backend Endpoint**: `GET /api/healthz`
**File**: `apps/backend/app/config.py`

**Functions**:
- `Capabilities.get_status()` - System health
  - **Status**: ✅ Complete
  - **Returns**: `{status: "green"|"amber"|"red", components: {db, search, ai, payments}}`

#### **9.2 Capabilities**
**Backend Endpoint**: `GET /api/capabilities`
**File**: `apps/backend/app/config.py`

**Functions**:
- `Capabilities.get_capabilities()` - Feature flags
  - **Status**: ✅ Complete
  - **Returns**: `{search, cv, payments, findearn}`

---

## Completion Status

### ✅ Fully Complete Features

1. **Search & Discovery**
   - ✅ Main search interface with filters
   - ✅ Faceted filtering (country, level, tags, international)
   - ✅ Pagination and load more
   - ✅ Sort options (relevance, newest, closing soon)
   - ✅ Collections (UN Jobs, Remote, Consultancies, etc.)
   - ✅ Job detail view (modal inspector)
   - ✅ URL state management (shareable search URLs)

2. **Saved Jobs**
   - ✅ Client-side shortlist (localStorage)
   - ✅ Save/unsave toggle
   - ✅ Saved jobs panel
   - ✅ Saved jobs page (`/saved`)

3. **Admin Panel**
   - ✅ Authentication (password-based)
   - ✅ Source management (CRUD)
   - ✅ Crawler management (status, logs, triggers)
   - ✅ Find & Earn moderation
   - ✅ Normalization reports
   - ✅ Taxonomy status
   - ✅ Search engine management (init, reindex, status)

4. **Crawler System**
   - ✅ HTML crawler with robots.txt support
   - ✅ RSS crawler
   - ✅ API crawler
   - ✅ Autonomous orchestrator with adaptive scheduling
   - ✅ Domain policies
   - ✅ Crawl logs and locks

5. **Data Normalization**
   - ✅ Country normalization (to ISO codes)
   - ✅ Level normalization
   - ✅ Mission tags normalization
   - ✅ Work modality normalization
   - ✅ Benefits, policy flags, donor context normalization

6. **Search Engine**
   - ✅ Meilisearch integration
   - ✅ Database fallback
   - ✅ Facet calculation
   - ✅ Relevance reasons

7. **Infrastructure**
   - ✅ Database schema (Supabase PostgreSQL)
   - ✅ Rate limiting
   - ✅ CORS configuration
   - ✅ Error masking (production vs dev)
   - ✅ Health checks
   - ✅ Capabilities API

### ⚠️ Partially Complete Features

1. **Server-Side Shortlist**
   - ⚠️ Backend API exists but requires authentication
   - ✅ Frontend uses client-side localStorage instead
   - **Needs**: User authentication system

2. **Taxonomy Management**
   - ✅ Status viewing complete
   - ❌ Edit/create/delete taxonomy entries not implemented
   - **Needs**: CRUD interface for taxonomy tables

### ❌ Not Implemented Features

1. **User Authentication**
   - ❌ No user accounts
   - ❌ No sign up/login
   - ❌ No password reset
   - **Impact**: Server-side shortlist requires this

2. **AI/LLM Features**
   - ❌ No AI model registry
   - ❌ No AI-powered job matching
   - ❌ No AI job descriptions
   - **Note**: Infrastructure exists but disabled

3. **CV Upload**
   - ❌ No CV upload functionality
   - ❌ No CV parsing
   - ❌ No CV-based matching
   - **Note**: Feature flag exists but not implemented

4. **Payment Processing**
   - ❌ No PayPal integration
   - ❌ No Razorpay integration
   - ❌ No payment flows
   - **Note**: Feature flag exists but not implemented

5. **Email Notifications**
   - ❌ No email alerts for saved jobs
   - ❌ No job alerts
   - ❌ No weekly digests

6. **Advanced Search**
   - ❌ No salary range filter
   - ❌ No date posted filter
   - ❌ No organization filter (multi-select)
   - ❌ No saved searches

7. **Analytics Dashboard**
   - ⚠️ Search analytics exist (dev-only, in-memory)
   - ❌ No persistent analytics
   - ❌ No user behavior tracking
   - ❌ No admin analytics dashboard

8. **Job Application Tracking**
   - ❌ No application status tracking
   - ❌ No application history
   - ❌ No reminders

---

## What Needs to Be Done

### High Priority

1. **Fix Meilisearch Index Initialization**
   - **Issue**: Index not initialized in production
   - **Action**: Run `/admin/search/init` then `/admin/search/reindex`
   - **Status**: ⚠️ Blocking search functionality

2. **Add Netlify Domain to CORS**
   - **Issue**: Frontend can't call backend API
   - **Action**: Add Netlify domain to `allow_origins` in `main.py`
   - **File**: `apps/backend/main.py` line 125-128

3. **Database Connection**
   - **Issue**: Database may not be connected
   - **Action**: Verify `SUPABASE_DB_URL` or `DATABASE_URL` env var
   - **Status**: ⚠️ Required for all data operations

### Medium Priority

4. **User Authentication System**
   - **Why**: Enables server-side shortlist, personalized features
   - **Options**: 
     - Supabase Auth (recommended - already using Supabase)
     - NextAuth.js
     - Custom JWT system
   - **Tasks**:
     - Add sign up/login pages
     - Implement session management
     - Update shortlist API to use user_id from session
     - Migrate localStorage shortlist to server

5. **Taxonomy CRUD Interface**
   - **Why**: Admins need to manage lookup tables
   - **Tasks**:
     - Create admin UI for countries table
     - Create admin UI for levels table
     - Create admin UI for tags table
     - Add validation for canonical values

6. **Persistent Analytics**
   - **Why**: Track search patterns, improve relevance
   - **Tasks**:
     - Create analytics table in database
     - Store search queries persistently
     - Build admin analytics dashboard
     - Add user behavior tracking (with privacy compliance)

7. **Email Notifications**
   - **Why**: Engage users, increase return visits
   - **Tasks**:
     - Choose email service (SendGrid, Resend, etc.)
     - Create email templates
     - Implement job alert system
     - Add weekly digest feature

### Low Priority

8. **Advanced Search Filters**
   - **Why**: Better user experience
   - **Tasks**:
     - Add salary range filter
     - Add date posted filter
     - Add multi-select organization filter
     - Add saved searches feature

9. **AI Features** (if desired)
   - **Why**: Competitive differentiation
   - **Tasks**:
     - Set up OpenRouter integration
     - Implement AI model registry
     - Build job matching algorithm
     - Add AI-generated job summaries

10. **CV Upload & Matching**
    - **Why**: Enhanced user value
    - **Tasks**:
      - Add file upload endpoint
      - Implement CV parsing (PDF/DOCX)
      - Build matching algorithm
      - Create CV-based job recommendations

11. **Payment Processing** (if monetizing)
    - **Why**: Revenue generation
    - **Tasks**:
      - Integrate PayPal SDK
      - Integrate Razorpay SDK
      - Build payment flows
      - Add subscription management

12. **Application Tracking**
    - **Why**: User engagement
    - **Tasks**:
      - Create applications table
      - Build application status tracking
      - Add reminders/notifications
      - Create application history view

---

## Summary

### What's Working ✅
- Complete search and filtering system
- Admin panel for content management
- Autonomous crawler with adaptive scheduling
- Data normalization engine
- Meilisearch integration (needs initialization)
- Client-side saved jobs
- Collections (curated job views)
- Find & Earn submission system

### What Needs Attention ⚠️
- Meilisearch index initialization
- CORS configuration for production
- Database connection verification
- Server-side shortlist (requires auth)

### What's Missing ❌
- User authentication
- Taxonomy CRUD interface
- Persistent analytics
- Email notifications
- Advanced search filters
- AI features (infrastructure exists)
- CV upload
- Payment processing

---

**Last Updated**: Based on codebase analysis as of current date
**Documentation Version**: 1.0

