# AidJobs - Project Documentation

## Overview
AidJobs is an AI-powered job search platform designed specifically for NGOs and INGOs. This is a clean scaffolding setup ready for environment configuration and feature implementation.

## Known Issues

### Frontend Admin Pages (CORS/Mixed Content)
**Affected Pages:** `/admin/find-earn`, `/admin/setup`

**Issue:** When viewing the app via the Replit preview (HTTPS), the frontend cannot fetch from `http://localhost:8000` due to browser mixed-content policy.

**Solution:** Set the `NEXT_PUBLIC_API_URL` secret to the backend's public HTTPS URL or use the format `https://<replit-domain>:8000`.

**Workaround:** Backend APIs are fully functional and can be tested via curl or direct API calls. Example:
```bash
curl http://localhost:8000/admin/setup/status
curl http://localhost:8000/admin/find-earn/list
```

## Architecture
- **Monorepo Structure**: Clean separation of concerns with apps, packages, infrastructure, and tests
- **Frontend**: Next.js 14+ with TypeScript, App Router, Tailwind CSS (port 5000)
- **Backend**: FastAPI with Python 3.11 (port 8000)
- **Database**: Supabase (PostgreSQL) - not yet connected
- **Search**: Meilisearch - not yet connected
- **AI**: OpenRouter - not yet connected

## Current State
✅ **Completed**:
- Monorepo scaffolding with proper directory structure
- Next.js frontend with App Router and Tailwind CSS
- FastAPI backend with capability service
- Health check endpoint (`/api/healthz`) showing system status
- Capabilities endpoint (`/api/capabilities`) reporting enabled modules
- Admin config endpoint (`/admin/config/env`) showing environment variable presence
- Search endpoints with graceful degradation (`/api/search/query`, `/api/search/facets`)
- **Smart Search UI** with debounced input, inline filters, results list, and inspector drawer
- Keyboard shortcuts: `/` to focus search, `Enter` to open inspector, `Esc` to close inspector
- Accessibility with visible focus states and keyboard navigation
- Frontend capabilities integration with search status banner
- **Perceived performance improvements**:
  - 5-card skeleton loading state for results list (250ms debounce)
  - Inspector drawer skeleton while fetching job details
  - AbortController cancels in-flight requests on parameter changes
  - Contextual empty state with quick action buttons (Clear filters, Remove country/level, Try remote, Clear mission tags)
  - Fallback banner with 2-second retry delay
- **Accessibility polish**:
  - Result rows: role="button" with descriptive aria-labels ("title at org, location")
  - Inspector drawer: Full ARIA modal semantics (aria-modal, aria-labelledby, aria-describedby)
  - Shortlist toggles: aria-pressed state on all star/bookmark buttons
  - Keyboard navigation: Enter/Space opens Inspector, Esc closes, focus restoration
  - Saved page: aria-labels on job buttons, aria-pressed on remove buttons
- **Dev-only analytics tracking**:
  - In-memory tracking of last 100 search queries (query, filters, source, total_results, latency_ms, page, size)
  - Lightweight console logging: "[analytics] search: q=X filters=Y source=Z total=N latency=Nms"
  - Reindex logging: "[analytics] reindex complete: indexed=N skipped=N duration=Nms"
  - /admin/metrics endpoint returns: last_20_queries, avg_latency_ms, meili_hit_rate, db_fallback_rate, source_breakdown
  - Only enabled when AIDJOBS_ENV=dev, zero overhead in production
- **Design Tokens & Theme System**:
  - CSS variables-based design tokens (packages/ui/tokens/tailwind-theme.css)
  - Light and dark theme support with jade green primary color
  - Tailwind CSS wired to consume CSS variables via hsl()
  - SSR-safe theme switching with localStorage persistence and prefers-color-scheme detection
  - ThemeProvider, useTheme hook, and ThemeToggle component (Sun/Moon icon button)
  - shadcn/ui-compatible color system with full token palette (background, foreground, muted, surface, accent, primary, warning, danger, border, input, ring)
  - BorderRadius tokens (lg/md/sm) calculated from --radius variable
- **Client-side Shortlist System** with localStorage persistence:
  - Star/bookmark toggle on job rows and inspector
  - "Saved" panel in header showing shortlisted jobs (up to 5, with count badge)
  - Toast notifications for add/remove actions with 3-second auto-dismiss
  - localStorage key: `aidjobs.shortlist`
  - Utility functions: `addToShortlist()`, `removeFromShortlist()`, `isInShortlist()`, `getShortlist()`
- **Job Inspector Drawer** with full job details and keyboard navigation
- **"Closing soon" badges** for jobs with deadline < 7 days
- **Backend job fetch endpoint** (`GET /api/jobs/:id`) for single job retrieval
- **Database schema** (infra/supabase.sql) with full-text search, indexes, and RLS policies
- **Seed data** (infra/seed.sql) with 3 sample organizations and 12 sample jobs
- **Database migration script** (apps/backend/scripts/apply_sql.py) for idempotent schema application
- **Curated Collection Pages** with preset filters and SEO:
  - UN Jobs (org_type=un)
  - Remote Jobs (work_modality=remote)
  - Consultancies (career_type=consultancy)
  - Fellowships (career_type=fellowship)
  - Surge & Emergency (surge_required=true)
  - Collapsible left sidebar navigation (CollectionsNav)
  - Clean URLs (/collections/un-jobs, /collections/remote, etc.)
  - Preset filters combine with user query params for refinement
  - Next.js 14 App Router with generateStaticParams for SEO
  - Centralized metadata in lib/collections.ts
- Environment template with all 24 required variables
- Development workflow running both frontend and backend concurrently
- Pytest test suite for capabilities and search endpoints
- Jest test suite for collections metadata and presets

🔨 **Not Yet Implemented**:
- Database connection to live Supabase instance
- Meilisearch integration
- AI/LLM features via OpenRouter
- Payment processing (PayPal/Razorpay)
- CV upload functionality
- Backend shortlist persistence (currently client-side only)
- Authentication
- Find & Earn features

## Environment Variables
See `env.example` for the complete list of 25 environment variables. The application gracefully handles missing variables without crashing.

### Database Configuration
- **SUPABASE_URL**: REST API endpoint (https://<project-ref>.supabase.co)
- **SUPABASE_ANON_KEY**: Anonymous key for client-side access
- **SUPABASE_SERVICE_KEY**: Service role key for server-side operations
- **DATABASE_URL**: PostgreSQL connection string (postgresql://user:password@host:port/database)
  - Used by the search fallback to query the jobs table directly
  - Used by the migration script to apply schema and seed data

### Feature Flags
- `AIDJOBS_ENABLE_SEARCH` - Enable/disable Meilisearch
- `AIDJOBS_ENABLE_CV` - Enable/disable CV upload
- `AIDJOBS_ENABLE_FINDEARN` - Enable/disable Find & Earn
- `AIDJOBS_ENABLE_PAYMENTS` - Enable/disable payment processing

## Development Scripts
- `npm run dev` - Start both frontend and backend servers
- `npm run lint` - Lint frontend (ESLint) and backend (Ruff)
- `npm run test` - Run tests (stubs currently in place)

## Database Setup

### Schema Application
Apply the database schema to your Supabase instance:

```bash
# Set environment variables first
export SUPABASE_URL="postgresql://user:password@host:port/database"
export SUPABASE_SERVICE_KEY="your-service-key"  # Optional if password in URL

# Apply schema only
python apps/backend/scripts/apply_sql.py

# Apply schema and seed data
python apps/backend/scripts/apply_sql.py --seed
```

The script is idempotent and safe to run multiple times.

## API Endpoints

### GET /api/healthz
Returns overall system health status with component flags:
```json
{
  "status": "amber",
  "components": {
    "db": false,
    "search": false,
    "ai": false,
    "payments": false
  }
}
```

### GET /api/capabilities
Reports which feature modules are enabled based on environment variables and feature flags:
```json
{
  "search": false,
  "cv": false,
  "payments": false,
  "findearn": true
}
```

### GET /admin/config/env
Returns presence map of environment variable names (never values):
```json
{
  "SUPABASE_URL": false,
  "MEILI_HOST": false,
  ...
}
```

### GET /admin/metrics
**Dev-only endpoint** - Returns search analytics metrics when `AIDJOBS_ENV=dev`. Tracks last 100 searches in-memory (deque) with comprehensive statistics.

**Response**:
```json
{
  "status": "ok",
  "data": {
    "enabled": true,
    "last_20_queries": [
      {
        "timestamp": "2025-11-04T14:18:29.817332",
        "query": "health",
        "filters": {
          "country": "Kenya",
          "level_norm": "senior",
          "international_eligible": null,
          "mission_tags": null,
          "work_modality": null,
          ...
        },
        "source": "meilisearch",
        "total_results": 0,
        "latency_ms": 273.45,
        "page": 1,
        "size": 20
      }
    ],
    "avg_latency_ms": 318.25,
    "meili_hit_rate": 100.0,
    "db_fallback_rate": 0.0,
    "total_tracked": 3,
    "source_breakdown": {
      "meilisearch": 3,
      "database": 0,
      "fallback": 0
    }
  },
  "error": null
}
```

**Behavior**:
- Only accessible when `AIDJOBS_ENV=dev` (returns 403 in other environments)
- Tracks query parameters, filters, source (meilisearch/database/fallback), total results, latency, page, size
- In-memory storage (deque with max 100 queries)
- Calculates aggregate metrics: avg latency, hit rates, source breakdown
- Console logging: `[analytics] search: q=X filters=Y source=Z total=N latency=Nms`
- Reindex logging: `[analytics] reindex complete: indexed=N skipped=N duration=Nms`

### GET /api/search/query
Search endpoint with graceful degradation across Meilisearch, Supabase SQL, and fallback mode.

**Query Parameters**:
- `q` (string, optional): Search query text
- `page` (integer, default=1): Page number (clamped to ≥1)
- `size` (integer, default=20): Page size (clamped to 1-100)
- `country` (string, optional): Filter by country code
- `level_norm` (string, optional): Filter by job level (entry, mid, senior)
- `international_eligible` (boolean, optional): Filter by international eligibility
- `mission_tags[]` (array, optional): Filter by mission tags

**Response**:
```json
{
  "status": "ok",
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "size": 20,
    "fallback": true
  },
  "error": null,
  "request_id": "uuid"
}
```

**Degradation Behavior**:
- **Meilisearch enabled**: Full search with facets from `jobs_index`
- **Meilisearch disabled, DB enabled**: Supabase SQL fallback (ILIKE on title/org_name/description) with database-computed facets
- **Both disabled**: Returns empty results with `fallback: true`
- Always enforces `jobs.status='active'` filter
- Never returns 500 on missing environment variables
- Database connections are properly closed on all code paths (including errors)

**Timeouts**: Meilisearch 2000ms, Database 1500ms

### GET /api/search/facets
Returns facet counts for search filters.

**Response when enabled (Meilisearch or Database)**:
```json
{
  "enabled": true,
  "facets": {
    "country": {"KE": 5, "UG": 3, "TZ": 2},
    "level_norm": {"mid": 6, "senior": 4, "entry": 2},
    "mission_tags": {"health": 8, "education": 5, "development": 4},
    "international_eligible": {"true": 7, "false": 5}
  }
}
```

**Database Facets Behavior** (when Meilisearch is disabled but DATABASE_URL is set):
- Uses GROUP BY queries for `country`, `level_norm`, and `international_eligible`
- Uses UNNEST for `mission_tags` array to count individual tags
- Limits: 50 buckets for country/level, 10 for mission_tags
- Only counts jobs with `status='active'`
- Response shape matches Meilisearch format for compatibility

**Response when disabled**:
```json
{
  "enabled": false
}
```

## Health Check System
The capability service in the backend monitors:
- **db**: Supabase connection availability
- **search**: Meilisearch availability (requires AIDJOBS_ENABLE_SEARCH=true + config)
- **ai**: OpenRouter API availability
- **payments**: Payment provider configuration (requires AIDJOBS_ENABLE_PAYMENTS=true + config)
- **cv**: CV upload capability (requires AIDJOBS_ENABLE_CV=true + config)
- **findearn**: Find & Earn feature (enabled by default via AIDJOBS_ENABLE_FINDEARN)

Status levels:
- **green**: All components enabled and configured
- **amber**: Partial configuration (current state with no env vars)
- **red**: System failure (not used in current implementation)

All endpoints return HTTP 200 even when integrations are missing keys - the application never crashes on missing environment variables.

## Next Steps
1. Configure environment variables in `.env` file
2. Set up Supabase database schema (`infra/supabase.sql`)
3. Configure Meilisearch for job search
4. Implement job listing and search features
5. Add AI-powered job matching via OpenRouter
6. Implement CV upload with processing
7. Add payment integration for premium features

## Project Structure
```
/
├── apps/
│   ├── frontend/        # Next.js application
│   └── backend/         # FastAPI application
├── packages/
│   ├── ui/             # Shared UI components
│   └── lib/            # Shared utilities
├── infra/              # Database schemas and seeds
├── tests/              # Test suites
├── scripts/            # Utility scripts
└── env.example         # Environment template
```

## Smart Search UI Features

### Search Input
- Command-style input with placeholder "Search roles, orgs, or skills…"
- 250ms debounce to reduce API calls
- Keyboard shortcut: Press `/` to focus search input from anywhere

### Quick Filters
- **Country**: Dropdown with pre-populated options (Kenya, Uganda, Tanzania, Ethiopia, South Africa)
- **Level**: Dropdown for job level (Entry, Mid, Senior)
- **International**: Toggle checkbox for international-eligible positions
- **Mission Tags**: Multi-select chips (health, education, environment, human-rights, development)
- All filters trigger immediate search on change

### Results Header
- **Total count**: Shows "X roles" at the top of results
- **Sort dropdown**: Sort by:
  - Relevance (default)
  - Newest (last_seen_at desc)
  - Closing soon (deadline asc)
- Sort option persists in URL params for sharing

### Results List
- Compact row-cards displaying:
  - Job title with "Closing soon" badge (if deadline < 7 days)
  - Organization name
  - Location/Country
  - Job level (entry, mid, senior)
  - Deadline (if present)
  - Star/bookmark button for shortlisting with aria-pressed state
- **Accessibility**: role="button" with descriptive aria-labels ("title at org, location")
- Click or press Enter/Space on any result to open inspector drawer
- **Improved empty state**:
  - Helpful tips when no results found with filters applied
  - Suggestions to broaden mission/country, remove level filter, or try "remote"
  - "Clear all filters" button to reset search

### Inspector Drawer
- **Resilient data loading**: Automatically fetches full job details from `/api/jobs/:id` if normalized fields are missing
- **Loading states**: Shows animated skeleton while fetching additional details
- **Error handling**: Displays graceful "This role is no longer available" message for 404s with auto-close after 3 seconds
- **Full job details panel**:
  - Title and organization
  - Star/bookmark toggle for shortlisting with aria-pressed state
  - Location and job level
  - Career type, work modality, organization type (fetched on demand)
  - Mission tags, benefits, policy flags (fetched on demand)
  - International eligibility status
  - Application deadline
  - "Apply Now" button (links to apply_url)
- **Accessibility features**:
  - Full ARIA modal semantics (aria-modal, aria-labelledby, aria-describedby)
  - Focus trap inside drawer (Tab cycles through focusable elements)
  - `Esc` key to close
  - Restores focus to previously focused result row on close
  - Keyboard accessible with visible focus states
  - aria-pressed on shortlist toggle button
- Click backdrop or X button to close

### Shortlist System
- **Client-side persistence**: Jobs saved to `localStorage` under key `aidjobs.shortlist`
- **Dedicated /saved route**: Full-page view for managing saved jobs
  - Fetches complete job details via `/api/jobs/:id` for each saved ID
  - Loading skeleton states while fetching job data
  - Empty state with "Go to search" CTA when no saved jobs
  - Remove jobs with star button (updates badge count in real-time)
  - Scroll position persistence when opening/closing Inspector
  - Focus restoration returns to clicked job card after Inspector closes
- **Navigation badge**: "Saved (N)" in sidebar navigation
  - Real-time count updates via localStorage events and polling
  - Badge highlights when on /saved route
  - Badge disappears when count reaches zero
- **Star toggles**: Available on job rows, inspector drawer, and /saved page with aria-pressed state
- **Toast notifications**: Success/info messages for add/remove actions
- **SSR-safe**: Gracefully handles server-side rendering without crashes
- **Accessibility**: Full ARIA semantics with descriptive labels and pressed states
- **Future enhancement**: Backend persistence with user accounts

### Pagination
- "Load more" button appends additional results
- Maintains scroll position when loading more
- Shows total count of jobs found

### Fallback Banner
- Displays at top when search falls back to database mode (`source === 'db'`)
- Shows message: "Running on backup search (temporarily)"
- Includes "Try again" button that retries search after 2 seconds
- Non-blocking, minimal amber design

### Performance Optimizations
- **Debounce**: 250ms delay on typing to reduce API calls
- **Request cancellation**: AbortController cancels in-flight requests when params change
- **Facet caching**: 30-second cache for facet counts to reduce backend load
- **Skeleton loading states**:
  - 5-card pulse animation for results list during initial load
  - Skeleton for Inspector drawer while fetching job details
  - Smooth transitions between loading and content states
- **Contextual empty state**: Quick action buttons based on active filters
  - "Clear all filters" - shown when any filters are active
  - "Remove country" - shown when country filter is applied
  - "Remove level" - shown when level filter is applied
  - "Try remote" - shown when no mission tags and search doesn't include "remote"
  - "Clear mission tags" - shown when mission tags are active

## Curated Collections

### Overview
Curated collections provide pre-filtered views of jobs with preset filters, SEO metadata, and clean URLs. Each collection combines its preset filters with any additional user-selected filters via query params.

### Available Collections
1. **UN Jobs** (`/collections/un-jobs`) - United Nations agencies and programs
   - Preset: `org_type=un`
   - Description: Opportunities with United Nations agencies and programs

2. **Remote Jobs** (`/collections/remote`) - Fully remote positions
   - Preset: `work_modality=remote`
   - Description: Fully remote opportunities from anywhere

3. **Consultancies** (`/collections/consultancies`) - Short-term consulting roles
   - Preset: `career_type=consultancy`
   - Description: Short-term consulting and advisory roles

4. **Fellowships** (`/collections/fellowships`) - Fellowship programs
   - Preset: `career_type=fellowship`
   - Description: Fellowship and professional development programs

5. **Surge & Emergency** (`/collections/surge`) - Rapid deployment roles
   - Preset: `surge_required=true`
   - Description: Surge capacity and emergency response positions

### Architecture
- **Metadata**: Centralized in `apps/frontend/lib/collections.ts` with `getCollection()`, `getAllCollectionSlugs()` helpers
- **Dynamic Route**: `/collections/[slug]/page.tsx` applies preset filters and combines with query params
- **SEO**: `layout.tsx` uses `generateMetadata()` and `generateStaticParams()` for pre-rendering
- **Navigation**: `CollectionsNav` component provides collapsible left sidebar with all collections
- **Integration**: Sidebar integrated into both home page and collection pages for consistent navigation
- **Testing**: Jest tests verify slug resolution, metadata completeness, and filter presets

### Filter Combination
Collection pages combine preset filters with user-selected filters:
```
/collections/un-jobs?country=KE&level_norm=senior
→ Searches for: org_type=un AND country=KE AND level_norm=senior
```

## Design System

### Design Tokens
The platform uses a CSS variables-based design token system for consistent theming across light and dark modes.

**Token Structure** (`packages/ui/tokens/tailwind-theme.css`):
- **Color Palette**: bg, fg, muted, surface, accent, primary, warning, danger, border, input, ring
- **Primary Color**: Jade green (#1C8E79) for NGO/INGO sector alignment
- **Light Theme**: Near-white backgrounds, deep neutral text, soft mint green accents
- **Dark Theme**: Deep gray backgrounds, light gray text, darker accent tones
- **Format**: HSL space-separated values (e.g., `--bg: 255 255 254`)

**Tailwind Integration** (`apps/frontend/tailwind.config.js`):
- Colors wired to CSS variables: `background: 'hsl(var(--bg))'`
- BorderRadius tokens: lg/md/sm calculated from `--radius` (16px base)
- Content paths include packages/ui for shared components

### Theme Switching

**Components** (all in `packages/ui/`):
- `useTheme` hook: SSR-safe theme management with localStorage persistence
- `ThemeProvider`: Context-based theme state distribution
- `ThemeToggle`: Icon-only button (Sun/Moon) for theme switching

**Features**:
- Respects `prefers-color-scheme` as default
- Persists user preference in localStorage (`aidjobs-theme`)
- Applies `.dark` class to `<html>` element
- SSR-safe mounting to prevent hydration mismatches
- Accessible with proper ARIA labels and focus ring

**Usage**:
```tsx
import { ThemeProvider, ThemeToggle, useThemeContext } from '@aidjobs/ui';

// In app layout
<ThemeProvider>
  {children}
</ThemeProvider>

// In navigation
<ThemeToggle />

// In components
const { theme, setTheme, toggleTheme } = useThemeContext();
```

### shadcn/ui Compatibility
The design token system follows shadcn/ui conventions for seamless integration of future UI components:
- All color tokens match shadcn/ui naming (background, foreground, muted, primary, accent, etc.)
- Dependencies: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`
- Ready for Button, Card, Dialog, and other shadcn/ui primitives

## Database Schema

The database schema (`infra/supabase.sql`) includes the following tables:

### Core Tables
- **sources**: Job board URLs to crawl (org_name, careers_url, crawl_frequency_days, status)
- **jobs**: Parsed job postings with full-text search (title, org_name, location, country, level_norm, mission_tags, deadline, apply_url, search_tsv)
- **users**: User accounts (email, is_pro, created_at)
- **shortlists**: Saved jobs per user (user_id, job_id)

### Features
- **findearn_submissions**: User-submitted job board URLs (url, domain, status, jobs_found)
- **rewards**: Pro membership rewards (user_id, kind, days)
- **payments**: Payment transactions (user_id, provider, amount_cents, status)

### Key Features
- **Full-text search**: PostgreSQL tsvector on jobs table with weighted search (title > org_name > description > mission_tags)
- **Indexes**: GIN on search_tsv, BTREE on status/deadline, country, level_norm, international_eligible
- **Triggers**: Automatic maintenance of search_tsv on insert/update
- **RLS Policies**:
  - Jobs: Public read access for active jobs
  - Shortlists: Owner-only access (user_id-based)
  - Sources, Rewards, Payments: Admin-only (service role)

### Sample Data
The seed file (`infra/seed.sql`) includes:
- 3 sample organizations (UNDP, MSF, GPE)
- 12 sample jobs with varied countries, levels, mission tags, and deadlines

## Notes
- No hardcoded secrets or API keys
- Missing environment variables do not crash the application
- Cross-origin warnings in development are expected (Next.js framework notice)
- Frontend proxies API requests to backend via Next.js rewrites
- Search UI gracefully handles empty results (no demo data)
- All interactive elements are keyboard-accessible with visible focus states
- Database schema is idempotent and safe to apply multiple times
