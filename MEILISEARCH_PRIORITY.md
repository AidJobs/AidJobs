# Meilisearch Priority Order

## Priority 1: Configure Meilisearch (BLOCKER)

**Why First**: Without configuration, Meilisearch is disabled and all other steps are blocked.

**What to Do**:
1. Get a Meilisearch instance:
   - **Option A (Recommended)**: Meilisearch Cloud (free tier available)
     - Sign up at https://www.meilisearch.com/cloud
     - Create a project
     - Get your instance URL and master key
   - **Option B**: Self-hosted
     - Deploy on Railway, Render, or your own server
     - Or run locally with Docker

2. Set environment variables in your backend:
   ```bash
   MEILISEARCH_URL=https://your-instance.meilisearch.com
   MEILISEARCH_KEY=your-master-key-here
   ```
   
   **Where to set**:
   - Vercel: Project Settings → Environment Variables
   - Local: `.env` file in `apps/backend/`
   - Other hosting: Provider's environment variable settings

3. Restart backend to initialize Meilisearch client

**Verification**:
```bash
GET /api/search/status
```
Should return `"enabled": true`

---

## Priority 2: Reindex Jobs with Enrichment Fields

**Why Second**: Once Meilisearch is configured, we need to populate it with jobs including enrichment data.

**What to Do**:
1. **First, enrich more jobs** (if needed):
   - Currently only 18/287 jobs are enriched
   - Run: `python apps/backend/scripts/enrich_all_jobs.py --yes`
   - This takes ~10-15 minutes

2. **Then reindex**:
   - **Via Admin Dashboard**: Go to `/admin` → Click "Reindex" button
   - **Via API**: `POST /admin/search/reindex`
   - **Via Script**: `python apps/backend/scripts/reindex_with_enrichment.py`

**What Happens**:
- All active jobs (with enrichment fields) are indexed into Meilisearch
- Enrichment fields become searchable/filterable
- Search performance improves significantly

**Verification**:
```bash
GET /api/search/status
```
Should show `"document_count": 287` (or however many active jobs you have)

---

## Priority 3: Verify Enrichment Filters Work

**Why Third**: Need to test that enrichment-based search actually works.

**What to Do**:
1. Test search with enrichment filters:
   ```bash
   GET /api/search/query?impact_domain=Water,Sanitation%20%26%20Hygiene%20(WASH)
   GET /api/search/query?functional_role=Program%20%26%20Field%20Implementation
   GET /api/search/query?experience_level=Officer%20/%20Associate
   GET /api/search/query?sdgs=6,13
   ```

2. Test from frontend:
   - Use TrinitySearchBar
   - Try natural language queries
   - Verify results show enrichment badges
   - Check match scores appear

3. Verify performance:
   - Compare search speed (Meilisearch vs database)
   - Check relevance of results

---

## Recommended Order

### If You DON'T Have Meilisearch Yet:
1. ✅ **Get Meilisearch instance** (Cloud or self-hosted)
2. ✅ **Configure environment variables**
3. ✅ **Restart backend and verify** (`/api/search/status`)
4. ✅ **Enrich all jobs** (if not done yet)
5. ✅ **Reindex jobs**
6. ✅ **Test enrichment filters**

### If You ALREADY Have Meilisearch:
1. ✅ **Set environment variables** (if not set)
2. ✅ **Restart backend and verify**
3. ✅ **Enrich all jobs** (if not done yet)
4. ✅ **Reindex jobs**
5. ✅ **Test enrichment filters**

---

## Time Estimate

- **Configuration**: 5-10 minutes (if you have instance) or 15-30 minutes (if setting up new)
- **Enrichment**: 10-15 minutes (for 269 remaining jobs)
- **Reindexing**: 1-2 minutes (for 287 jobs)
- **Testing**: 5-10 minutes

**Total**: ~20-40 minutes depending on whether you need to set up Meilisearch

---

## Quick Start (If You Have Meilisearch URL/Key)

```bash
# 1. Set environment variables (in Vercel or .env)
MEILISEARCH_URL=https://your-instance.meilisearch.com
MEILISEARCH_KEY=your-key

# 2. Restart backend

# 3. Verify
curl https://your-backend.com/api/search/status

# 4. Enrich jobs (if needed)
python apps/backend/scripts/enrich_all_jobs.py --yes

# 5. Reindex
curl -X POST https://your-backend.com/admin/search/reindex

# 6. Test
curl "https://your-backend.com/api/search/query?impact_domain=WASH"
```

---

## Decision Point

**Do you already have a Meilisearch instance?**
- **Yes** → Start with Priority 1 (just set env vars)
- **No** → Need to set one up first (Meilisearch Cloud recommended)

Let me know and I can guide you through the specific steps!


