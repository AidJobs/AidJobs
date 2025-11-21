# How to View Enriched Jobs on Frontend

## ✅ What's Already Set Up

1. **Frontend Display**: The `HomeClient.tsx` component is already configured to display:
   - Match scores (green badge)
   - Top reasons (blue badges)
   - Impact domain badges (purple)
   - Functional role badges (indigo)
   - Experience level badge (teal)

2. **Backend Search**: Updated to return enrichment fields from database

3. **Re-ranking**: Integrated to compute match scores and top reasons

## 🚀 Quick Test Steps

### Step 1: Start Your Backend Server

```powershell
cd apps/backend
$env:SUPABASE_DB_URL="postgresql://postgres.yijlbzlzfahubwukulkv:ghXps3My5KPZCNn2@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
python -m uvicorn main:app --reload
```

### Step 2: Start Your Frontend Server

```powershell
cd apps/frontend
npm run dev
```

### Step 3: View on Frontend

1. Open your browser to `http://localhost:3000`
2. You should see the **TrinitySearchBar** at the top
3. The search results will show:
   - **Match Score** (green badge) - e.g., "Match: 85%"
   - **Top Reasons** (blue badges) - e.g., "Matches Impact: WASH", "Role: Program"
   - **Impact Domain** badges (purple) - e.g., "Water, Sanitation & Hygiene (WASH)"
   - **Functional Role** badges (indigo) - e.g., "Program & Field Implementation"
   - **Experience Level** badge (teal) - e.g., "Officer / Associate"

## 🧪 Test the Trinity Search

### Test 1: Natural Language Query
1. Type in the search bar: **"WASH officer Kenya mid-level"**
2. Press Enter or click search
3. The query parser will extract:
   - Impact Domain: WASH
   - Functional Role: Program & Field Implementation
   - Experience Level: Officer / Associate
   - Location: Kenya
4. Results will show match scores and reasons

### Test 2: Autocomplete
1. Start typing: **"wash"**
2. You should see autocomplete suggestions appear
3. Click a suggestion to auto-fill filters
4. Results update automatically

### Test 3: View Enriched Jobs
1. Scroll through the job results
2. Each enriched job should show:
   - Match score (if you searched with filters)
   - Top reasons for matching
   - Impact domain badges
   - Functional role badges
   - Experience level badge

## 📊 What You'll See

### For Enriched Jobs:
```
Job Title: WASH Program Officer
Organization: UNDP

Match: 85%                    ← Green badge

Matches Impact: WASH          ← Blue badges (top reasons)
Role: Program & Field Implementation

Water, Sanitation & Hygiene (WASH)  ← Purple badge (impact domain)
Program & Field Implementation      ← Indigo badge (functional role)
Officer / Associate                 ← Teal badge (experience level)

Location: Kenya | Mid-level | Deadline: ...
```

### For Non-Enriched Jobs:
- No match score
- No enrichment badges
- Only basic job info (title, org, location)

## 🔍 Verify Enrichment Status

To check which jobs are enriched, you can:

1. **Via Database Query**:
   ```sql
   SELECT COUNT(*) FROM jobs WHERE enriched_at IS NOT NULL;
   ```

2. **Via Frontend**: Look for jobs with enrichment badges

3. **Via API**: 
   ```bash
   GET /api/search/query?q=&page=1&size=20
   ```
   Check response items for `impact_domain`, `functional_role`, etc.

## 🐛 Troubleshooting

### No enrichment badges showing?
1. Check if jobs are actually enriched:
   ```sql
   SELECT id, title, enriched_at FROM jobs WHERE status = 'active' LIMIT 5;
   ```

2. Check backend logs for errors

3. Verify database search is returning enrichment fields:
   - Check browser Network tab → `/api/search/query` response
   - Look for `impact_domain`, `functional_role` in job objects

### Match scores not showing?
- Match scores only appear when you search with filters
- Try a natural language query like "WASH officer Kenya"
- Or use the TrinitySearchBar which parses queries automatically

### Autocomplete not working?
- Check browser console for errors
- Verify `/api/search/autocomplete` endpoint is accessible
- Check that OpenRouter API key is configured

## 📝 Next Steps

1. **Enrich All Jobs**: Run the full enrichment for all 287 jobs
2. **Reindex Meilisearch** (if configured): To enable fast search with enrichment filters
3. **Test Search**: Try various natural language queries
4. **Verify Display**: Check that all enrichment fields show correctly

---

**Current Status**: 
- ✅ 10 jobs enriched (test batch)
- ✅ Frontend display code ready
- ✅ Backend search returns enrichment fields
- ⏳ Need to enrich remaining 277 jobs for full coverage

