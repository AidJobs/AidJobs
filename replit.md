# AidJobs - Project Documentation

## Overview
AidJobs is an AI-powered job search platform designed specifically for NGOs and INGOs. This is a clean scaffolding setup ready for environment configuration and feature implementation.

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
- Environment template with all 24 required variables
- Development workflow running both frontend and backend concurrently
- Pytest test suite for capabilities and search endpoints

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

### Results List
- Compact row-cards displaying:
  - Job title with "Closing soon" badge (if deadline < 7 days)
  - Organization name
  - Location/Country
  - Job level (entry, mid, senior)
  - Deadline (if present)
  - Star/bookmark button for shortlisting
- Click or press Enter/Space on any result to open inspector drawer
- Empty state message when no results or filters

### Inspector Drawer
- Right-side panel showing full job details:
  - Title and organization
  - Star/bookmark toggle for shortlisting
  - Location and job level
  - Mission tags (if present)
  - International eligibility status
  - Application deadline
  - "Apply Now" button (links to apply_url)
- Click backdrop, press `Esc`, or click X to close
- Keyboard accessible with visible focus states

### Shortlist System
- **Client-side persistence**: Jobs saved to `localStorage` under key `aidjobs.shortlist`
- **"Saved" panel**: Header chip showing count, click to view shortlisted jobs
- **Star toggles**: Available on both job rows and inspector drawer
- **Toast notifications**: Success/info messages for add/remove actions
- **SSR-safe**: Gracefully handles server-side rendering without crashes
- **Future enhancement**: Backend persistence with user accounts

### Pagination
- "Load more" button appends additional results
- Maintains scroll position when loading more
- Shows total count of jobs found

### Status Banner
- Displays at top when search is disabled or in fallback mode
- Non-blocking, minimal design
- Adaptive messaging based on capability state

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
