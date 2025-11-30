# Quick Guide: View Enriched Jobs on Frontend

## Current Status
- ✅ **18 jobs enriched** (out of 287 total)
- ✅ Frontend code ready to display enrichment
- ✅ Backend search returns enrichment fields

## How to View Enriched Jobs

### Option 1: Via Your Deployed Site
1. Go to your deployed frontend URL (e.g., `https://aidjobs.app`)
2. The homepage should show the **TrinitySearchBar**
3. Scroll through job results - enriched jobs will show:
   - **Match Score** (green badge)
   - **Top Reasons** (blue badges)
   - **Impact Domain** badges (purple)
   - **Functional Role** badges (indigo)
   - **Experience Level** badge (teal)

### Option 2: Local Development

1. **Start Backend**:
   ```powershell
   cd apps/backend
   $env:SUPABASE_DB_URL="postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
   $env:OPENROUTER_API_KEY="your-api-key-here"
   python -m uvicorn main:app --reload
   ```

2. **Start Frontend** (in another terminal):
   ```powershell
   cd apps/frontend
   npm run dev
   ```

3. **Open Browser**: `http://localhost:3000`

4. **Look for Enriched Jobs**:
   - Jobs with enrichment will show badges
   - Try searching to see match scores

## What You'll See

### Enriched Job Example:
```
┌─────────────────────────────────────────┐
│ WASH Program Officer                    │
│ UNDP                                     │
│                                          │
│ Match: 85%                               │ ← Green badge
│                                          │
│ Matches Impact: WASH                     │ ← Blue badges
│ Role: Program & Field Implementation     │
│                                          │
│ Water, Sanitation & Hygiene (WASH)      │ ← Purple badge
│ Program & Field Implementation          │ ← Indigo badge
│ Officer / Associate                      │ ← Teal badge
│                                          │
│ Kenya | Mid-level | Deadline: ...       │
└─────────────────────────────────────────┘
```

### Non-Enriched Job:
```
┌─────────────────────────────────────────┐
│ Job Title                               │
│ Organization                            │
│                                          │
│ Location | Level | Deadline: ...       │
│ (No enrichment badges)                  │
└─────────────────────────────────────────┘
```

## Test Trinity Search Features

### 1. Natural Language Search
- Type: **"WASH officer Kenya mid-level"**
- Press Enter
- See parsed filters and match scores

### 2. Autocomplete
- Type: **"wash"**
- See suggestions appear
- Click to auto-fill

### 3. Filter Chips
- After searching, see active filter chips
- Click X to remove filters

## Verify It's Working

1. **Check Browser Console** (F12):
   - Look for any errors
   - Check Network tab → `/api/search/query` response
   - Verify job objects have `impact_domain`, `functional_role`, etc.

2. **Check Job Results**:
   - Scroll through jobs
   - Look for purple/indigo/teal badges
   - These indicate enriched jobs

3. **Test Search**:
   - Try a natural language query
   - Check if match scores appear
   - Verify top reasons show

## If You Don't See Enrichment

1. **Check if jobs are enriched**:
   ```powershell
   python apps\backend\scripts\check_enrichment_status.py
   ```

2. **Check backend logs** for errors

3. **Verify API response**:
   - Open browser DevTools → Network tab
   - Search for jobs
   - Check `/api/search/query` response
   - Look for `impact_domain`, `functional_role` in job objects

4. **Clear browser cache** and refresh

## Next: Enrich All Jobs

To see enrichment on all jobs, run:
```powershell
python apps\backend\scripts\enrich_all_jobs.py --yes
```

This will enrich all 287 jobs (takes ~10-15 minutes).

