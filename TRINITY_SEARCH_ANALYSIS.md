# Trinity Search System - Codebase Analysis & Implementation Plan

## Executive Summary

After analyzing your codebase, here's what **exists**, what's **missing**, and what I'll **build** for the Trinity Search system.

---

## 1. WHAT EXISTS

### Database Schema (`infra/supabase.sql`)
- ✅ `jobs` table with basic fields: `title`, `org_name`, `description_snippet`, `location_raw`, `country`, `level_norm`, `mission_tags`
- ✅ Taxonomy lookup tables: `missions`, `functional`, `tags`, `levels`
- ✅ `missions` table has `sdg_links` field (array of integers)
- ❌ **MISSING**: Enrichment fields on `jobs` table:
  - `impact_domain` (TEXT[])
  - `functional_role` (TEXT[])
  - `experience_level` (TEXT)
  - `sdgs` (INTEGER[])
  - `sdg_confidences` (JSONB)
  - `sdg_explanation` (TEXT)
  - `matched_keywords` (TEXT[])
  - `confidence_overall` (NUMERIC)
  - `low_confidence` (BOOLEAN)
  - `enriched_at` (TIMESTAMPTZ)
  - `enrichment_version` (INTEGER)

### Backend Search (`apps/backend/app/search.py`)
- ✅ `SearchService` class with Meilisearch integration
- ✅ Basic search with filters: `country`, `level_norm`, `mission_tags`, `international_eligible`
- ✅ Meilisearch index configured with searchable/filterable attributes
- ✅ Database fallback search
- ❌ **MISSING**: 
  - Query parser endpoint
  - Autocomplete/suggestion endpoint
  - Re-ranking logic with match_score
  - Enrichment pipeline

### Frontend Search (`apps/frontend/app/HomeClient.tsx`)
- ✅ Basic search bar with debounced input
- ✅ Filter UI (country, level, mission tags, international)
- ✅ Results display
- ❌ **MISSING**:
  - AI-like autocomplete chips
  - Query parser integration
  - Match score display
  - Top reasons display
  - Impact domain/functional role/experience level badges

### AI Infrastructure
- ✅ `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` env vars configured
- ✅ `Capabilities.is_ai_enabled()` checks for OpenRouter
- ❌ **MISSING**: 
  - AI service/client for calling OpenRouter
  - Enrichment worker/function
  - Query parsing AI integration

---

## 2. WHAT'S MISSING (To Build)

### A. Database Schema Updates
1. **Add enrichment columns to `jobs` table**
2. **Create enrichment tracking table** (optional, for audit trail)

### B. Backend Components

#### 1. **AI Service** (`apps/backend/app/ai_service.py`) - NEW
   - OpenRouter client wrapper
   - Structured prompt templates for:
     - Job enrichment (impact domain, functional role, experience level, SDGs)
     - Query parsing (extract filters from natural language)
     - Autocomplete suggestions
   - Error handling and retries
   - Token usage tracking

#### 2. **Enrichment Pipeline** (`apps/backend/app/enrichment.py`) - NEW
   - `enrich_job()` function:
     - Takes job (title, description, org, location, functional_role if available)
     - Calls AI service for classification
     - Applies hybrid rules:
       - Suppress SDGs for operational roles
       - Drop SDGs < 0.60 confidence
       - Max 2 SDGs
       - MEL threshold 0.85
     - Returns enriched data structure
   - `batch_enrich_jobs()` for processing multiple jobs
   - `update_job_enrichment()` to save to database

#### 3. **Query Parser** (`apps/backend/app/query_parser.py`) - NEW
   - `parse_query()` function:
     - Takes user search string
     - Uses AI to extract structured filters:
       - `impact_domain` (array)
       - `functional_role` (array)
       - `experience_level` (string)
       - `location` (string)
       - `is_remote` (boolean)
       - `free_text` (string)
     - Returns structured filter object

#### 4. **Autocomplete Service** (`apps/backend/app/autocomplete.py`) - NEW
   - `get_suggestions()` function:
     - Takes partial text
     - Returns suggested search chips using taxonomy
     - Uses AI for intelligent suggestions

#### 5. **Re-ranking Service** (`apps/backend/app/rerank.py`) - NEW
   - `compute_match_score()` function:
     - Takes job and parsed filters
     - Computes match_score (0-100)
     - Generates top_reasons (max 3)
   - `rerank_results()` to apply to Meilisearch results

#### 6. **API Endpoints** (Update `apps/backend/main.py`)
   - `POST /api/search/parse` - Query parser endpoint
   - `GET /api/search/autocomplete?q=...` - Autocomplete endpoint
   - `POST /api/admin/jobs/enrich` - Manual enrichment trigger (admin)
   - `POST /api/admin/jobs/enrich/batch` - Batch enrichment (admin)

#### 7. **Search Service Updates** (`apps/backend/app/search.py`)
   - Add enrichment fields to Meilisearch index (filterable/searchable)
   - Integrate query parser into `search_query()`
   - Integrate re-ranking into results

#### 8. **Enrichment Worker** (`apps/backend/app/enrichment_worker.py`) - NEW
   - Background worker to enrich jobs:
     - On job creation/update
     - Periodic batch processing
     - Admin-triggered re-enrichment

### C. Frontend Components

#### 1. **Query Parser Integration** (`apps/frontend/app/api/search/parse/route.ts`) - NEW
   - Next.js API route that proxies to backend

#### 2. **Autocomplete Integration** (`apps/frontend/app/api/search/autocomplete/route.ts`) - NEW
   - Next.js API route that proxies to backend

#### 3. **Search Bar Component** (`apps/frontend/components/TrinitySearchBar.tsx`) - NEW
   - AI-like search bar with:
     - Autocomplete chips while typing
     - Visual chip display
     - Submit handler that calls query parser

#### 4. **Results Display Updates** (`apps/frontend/app/HomeClient.tsx`)
   - Display `match_score` for each job
   - Display `top_reasons` badges
   - Display `impact_domain` badges
   - Display `functional_role` badges
   - Display `experience_level` badge

---

## 3. IMPLEMENTATION PLAN

### Phase 1: Database Schema
1. Update `infra/supabase.sql` with enrichment columns
2. Create migration script

### Phase 2: Backend Core Services
1. Create `ai_service.py` (OpenRouter client)
2. Create `enrichment.py` (enrichment logic)
3. Create `query_parser.py` (query parsing)
4. Create `autocomplete.py` (autocomplete)
5. Create `rerank.py` (re-ranking)

### Phase 3: Backend API Endpoints
1. Add query parser endpoint
2. Add autocomplete endpoint
3. Add enrichment endpoints (admin)
4. Update search endpoint to use query parser and re-ranking

### Phase 4: Frontend Integration
1. Create Next.js API proxy routes
2. Create TrinitySearchBar component
3. Update HomeClient to use new search bar
4. Update results display with enrichment fields

### Phase 5: Enrichment Worker
1. Create background worker
2. Integrate with orchestrator (optional)
3. Add admin UI for triggering enrichment

---

## 4. FILES TO CREATE

### Backend (Python)
1. `apps/backend/app/ai_service.py` - OpenRouter client and prompt templates
2. `apps/backend/app/enrichment.py` - Job enrichment logic
3. `apps/backend/app/query_parser.py` - Query parsing logic
4. `apps/backend/app/autocomplete.py` - Autocomplete logic
5. `apps/backend/app/rerank.py` - Re-ranking logic
6. `apps/backend/app/enrichment_worker.py` - Background worker

### Frontend (TypeScript/Next.js)
1. `apps/frontend/app/api/search/parse/route.ts` - Query parser proxy
2. `apps/frontend/app/api/search/autocomplete/route.ts` - Autocomplete proxy
3. `apps/frontend/components/TrinitySearchBar.tsx` - Search bar component

### Database
1. Migration script (or update `apps/backend/scripts/run_migration.py`)

---

## 5. FILES TO MODIFY

### Backend
1. `infra/supabase.sql` - Add enrichment columns
2. `apps/backend/app/search.py` - Add enrichment fields to Meilisearch, integrate query parser and re-ranking
3. `apps/backend/main.py` - Add new API endpoints
4. `apps/backend/orchestrator.py` - Optionally integrate enrichment worker

### Frontend
1. `apps/frontend/app/HomeClient.tsx` - Replace search bar, update results display
2. `apps/frontend/app/page.tsx` - No changes needed (uses HomeClient)

---

## 6. TECHNICAL DECISIONS

### AI Model
- Use OpenRouter with `OPENROUTER_MODEL` (default: `gpt-4o-mini`)
- Structured JSON responses for enrichment and query parsing
- Fallback to rule-based parsing if AI fails

### Enrichment Rules
- **Suppress SDGs for operational roles**: Check if `functional_role` contains "operations", "admin", "finance", "HR", "IT"
- **Drop SDGs < 0.60 confidence**: Filter out low-confidence SDGs
- **Max 2 SDGs**: Keep only top 2 by confidence
- **MEL threshold 0.85**: If role is "MEL" (Monitoring, Evaluation, Learning), require 0.85+ confidence for SDGs

### Query Parser
- Use AI to extract structured filters from natural language
- Fallback to keyword matching if AI unavailable
- Support examples:
  - "WASH program manager in Kenya" → `{impact_domain: ["wash"], functional_role: ["program"], location: "Kenya"}`
  - "remote mid-level health coordinator" → `{functional_role: ["health", "coordinator"], experience_level: "mid", is_remote: true}`

### Re-ranking
- Match score formula (0-100):
  - Impact domain match: +30 points
  - Functional role match: +30 points
  - Experience level match: +20 points
  - Location match: +10 points
  - Remote match: +10 points
- Top reasons: Generate up to 3 reasons based on matches

---

## 7. DEPENDENCIES

### Backend
- `httpx` (already in requirements.txt for HTTP calls)
- `openai` or direct HTTP to OpenRouter API

### Frontend
- No new dependencies (use existing React/Next.js)

---

## 8. ENVIRONMENT VARIABLES

Already configured:
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`

No new env vars needed.

---

## 9. TESTING STRATEGY

1. **Unit tests** for enrichment logic (rule application)
2. **Integration tests** for AI service (mock OpenRouter responses)
3. **E2E tests** for search flow (query parser → search → re-ranking)
4. **Manual testing** with real jobs and queries

---

## 10. ROLLOUT PLAN

1. **Phase 1**: Database migration (add columns, keep nullable)
2. **Phase 2**: Backend services (deploy, test with admin endpoints)
3. **Phase 3**: Enrich existing 287 jobs (batch job)
4. **Phase 4**: Frontend integration (deploy new search bar)
5. **Phase 5**: Monitor and iterate

---

## CONFIRMATION REQUIRED

Before I start building, please confirm:

1. ✅ **AI Model**: Use OpenRouter with `gpt-4o-mini` (or specify different model)?
2. ✅ **Enrichment Rules**: Confirm the hybrid rules (suppress SDGs for operational, drop < 0.60, max 2 SDGs, MEL threshold 0.85)?
3. ✅ **Taxonomy**: Do you have a predefined list of:
   - Impact domains (e.g., ["wash", "health", "education", "protection", ...])?
   - Functional roles (e.g., ["program", "coordinator", "manager", "officer", ...])?
   - Experience levels (e.g., ["entry", "mid", "senior", "lead"])?
4. ✅ **Enrichment Timing**: When should jobs be enriched?
   - On creation/update (automatic)?
   - Periodic batch (daily/hourly)?
   - Manual trigger only (admin)?
5. ✅ **Query Parser**: Should it support natural language queries like "WASH program manager in Kenya" or just structured filters?
6. ✅ **Autocomplete**: Should it suggest from your taxonomy (impact domains, functional roles, etc.) or use AI to generate suggestions?

**Once you confirm, I'll start building step-by-step!**

