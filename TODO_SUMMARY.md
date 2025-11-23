# TODO List - Next Items

## 🔄 Pending Tasks

### High Priority

1. **Test UNDP Extraction** (ID: 4)
   - **Status**: ⏳ PENDING
   - **Task**: Test extraction to verify each job has unique apply_url
   - **Action**: Run UNDP crawl and verify:
     - Each job has unique apply_url
     - No duplicate URLs
     - "Apply Now" buttons link correctly
   - **Endpoint**: `POST /admin/crawl/run`

2. **Re-enrich Sample Jobs** (ID: validate-2, todo-1763924369165-mlxmdh0t2)
   - **Status**: ⏳ PENDING
   - **Task**: Re-enrich diverse sample (20 jobs) with new pipeline to verify bias fixes
   - **Action**: 
     - Get 20 diverse job IDs
     - Run batch enrichment
     - Compare before/after distributions
   - **Endpoint**: `POST /admin/jobs/enrich/batch`

3. **Verify Review Queue** (ID: validate-3, todo-1763924369165-y8gww0cc7)
   - **Status**: ⏳ PENDING
   - **Task**: Verify low-confidence enrichments are properly flagged for review
   - **Action**: Check review queue to ensure:
     - Jobs with confidence < 0.65 are flagged
     - Jobs with confidence < 0.70 for experience_level are flagged
     - Short/empty descriptions are flagged
   - **Endpoint**: `GET /admin/enrichment/review-queue`

### Medium Priority

4. **Quality Dashboard Check** (ID: validate-4)
   - **Status**: ⏳ PENDING
   - **Task**: Check quality dashboard metrics and review queue
   - **Action**: Verify:
     - Balanced distribution (no bias)
     - Average confidence > 0.70
     - Low confidence rate < 20%
   - **Endpoint**: `GET /admin/enrichment/quality-dashboard`

5. **Analyze Distribution** (ID: todo-1763924369165-yp0939kl5)
   - **Status**: 🔄 IN PROGRESS
   - **Task**: Run database queries to analyze current distribution of experience_level and impact_domain
   - **Action**: Use diagnostic script or quality dashboard API
   - **Script**: `apps/backend/scripts/diagnose_enrichment_bias.py`

6. **Analyze AI Responses** (ID: todo-1763924369165-d768jj9jj)
   - **Status**: ⏳ PENDING
   - **Task**: Analyze AI responses to identify if they follow example pattern from prompt
   - **Action**: Review AI service responses for bias patterns
   - **Note**: This is more of an analysis task

### Lower Priority

7. **UNDP Extraction Test** (ID: validate-5)
   - **Status**: ⏳ PENDING
   - **Task**: Test UNDP extraction to verify unique apply_url per job
   - **Action**: Same as #1 above (duplicate)

## 🎯 Recommended Order

### Step 1: Check Current State
- Run quality dashboard check (Task #4)
- Analyze current distribution (Task #5)

### Step 2: Test the Fixes
- Re-enrich sample jobs (Task #2)
- Verify review queue (Task #3)

### Step 3: Test UNDP Extraction
- Run UNDP crawl (Task #1)
- Verify unique URLs and frontend links

### Step 4: Ongoing Analysis
- Analyze AI responses (Task #6)
- Monitor production metrics

## 📝 Quick Actions

### To Start Validation:
```bash
# 1. Login
curl -X POST https://aidjobs-backend.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "<ADMIN_PASSWORD>"}'

# 2. Check Quality Dashboard
curl -X GET https://aidjobs-backend.onrender.com/admin/enrichment/quality-dashboard \
  -H "Cookie: session=<session_cookie>"

# 3. Check Review Queue
curl -X GET "https://aidjobs-backend.onrender.com/admin/enrichment/review-queue?limit=20" \
  -H "Cookie: session=<session_cookie>"
```

### To Re-enrich Jobs:
```bash
# Get job IDs first, then:
curl -X POST https://aidjobs-backend.onrender.com/admin/jobs/enrich/batch \
  -H "Cookie: session=<session_cookie>" \
  -H "Content-Type: application/json" \
  -d '{"job_ids": ["id1", "id2", ..., "id20"]}'
```

### To Test UNDP:
```bash
# Find UNDP source ID, then:
curl -X POST https://aidjobs-backend.onrender.com/admin/crawl/run \
  -H "Cookie: session=<session_cookie>" \
  -H "Content-Type: application/json" \
  -d '{"source_id": "<undp_source_id>"}'
```

## ✅ Completed Tasks

- ✓ Database migration
- ✓ Code fixes (bias removal, confidence thresholds)
- ✓ Enterprise features (QA, audit trail, monitoring)
- ✓ Validation documentation
- ✓ UNDP extraction code fixes

## 📌 Notes

- All admin endpoints require authentication
- Use session cookies from login endpoint
- Most validations require jobs to be enriched first
- See `NEXT_STEPS.md` for detailed instructions

