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
- Frontend capabilities integration with search status banner
- Environment template with all 24 required variables
- Development workflow running both frontend and backend concurrently
- Pytest test suite for capabilities and search endpoints

🔨 **Not Yet Implemented**:
- Database schema and connections
- Meilisearch integration
- AI/LLM features via OpenRouter
- Payment processing (PayPal/Razorpay)
- CV upload functionality
- Job listing pages
- Authentication
- Find & Earn features

## Environment Variables
See `env.example` for the complete list of 24 environment variables. The application gracefully handles missing variables without crashing.

### Feature Flags
- `AIDJOBS_ENABLE_SEARCH` - Enable/disable Meilisearch
- `AIDJOBS_ENABLE_CV` - Enable/disable CV upload
- `AIDJOBS_ENABLE_FINDEARN` - Enable/disable Find & Earn
- `AIDJOBS_ENABLE_PAYMENTS` - Enable/disable payment processing

## Development Scripts
- `npm run dev` - Start both frontend and backend servers
- `npm run lint` - Lint frontend (ESLint) and backend (Ruff)
- `npm run test` - Run tests (stubs currently in place)

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
- **Meilisearch disabled, DB enabled**: Supabase SQL fallback (ILIKE on title/org_name/description)
- **Both disabled**: Returns empty results with `fallback: true`
- Always enforces `jobs.status='active'` filter
- Never returns 500 on missing environment variables

**Timeouts**: Meilisearch 2000ms, Database 1500ms

### GET /api/search/facets
Returns facet counts for search filters.

**Response when enabled**:
```json
{
  "enabled": true,
  "facets": {
    "country": {},
    "level_norm": {},
    "mission_tags": {},
    "international_eligible": {}
  }
}
```

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

## Notes
- No hardcoded secrets or API keys
- Missing environment variables do not crash the application
- Cross-origin warnings in development are expected (Next.js framework notice)
- Frontend proxies API requests to backend via Next.js rewrites
