# Enterprise-Grade Enrichment Pipeline Validation Plan

## Overview
This document outlines the comprehensive validation plan for the enrichment pipeline fixes and enterprise-grade features.

## ✅ Completed

### 1. Database Migration
- ✓ Migration endpoint created and tested
- ✓ All 4 enrichment tables created in Supabase:
  - `enrichment_reviews` (0 rows)
  - `enrichment_history` (0 rows)
  - `enrichment_feedback` (0 rows)
  - `enrichment_ground_truth` (0 rows)

### 2. Code Fixes
- ✓ Removed prompt example bias
- ✓ Added confidence thresholds (impact_domain: 0.65, experience_level: 0.70)
- ✓ Improved empty description handling
- ✓ Added response validation
- ✓ Enhanced logging

### 3. Enterprise Features
- ✓ Quality assurance review queue
- ✓ Audit trail (enrichment history)
- ✓ Quality monitoring dashboard
- ✓ Retry & circuit breaker
- ✓ Input preprocessing
- ✓ Feedback collection
- ✓ Ground truth validation
- ✓ Consistency validation

## 🔄 Validation Steps

### Step 1: Baseline Analysis
**Purpose**: Establish current state before fixes

**Action**: Run diagnostic script (requires SUPABASE_DB_URL locally):
```bash
python apps/backend/scripts/diagnose_enrichment_bias.py
```

**Or via API** (requires admin auth):
```bash
# Get quality dashboard
GET /admin/enrichment/quality-dashboard

# Check current distribution
# - Experience level distribution
# - Impact domain distribution
# - Confidence scores
# - Review queue status
```

**Expected Output**:
- Current distribution of experience_level and impact_domain
- Identify any existing bias patterns
- Baseline confidence scores

### Step 2: Re-enrich Sample Jobs
**Purpose**: Test fixes with diverse job types

**Action**: Re-enrich 20 diverse jobs:
```bash
POST /admin/jobs/enrich/batch
Body: {
  "job_ids": ["id1", "id2", ..., "id20"]
}
```

**Selection Criteria**:
- Mix of job types: Finance, Health, Education, WASH, etc.
- Mix of levels: Entry, Mid, Senior, Director
- Mix of description lengths: Short, Medium, Long
- Some with empty/minimal descriptions

**Success Criteria**:
- ✓ No over-labeling as WASH/Public Health
- ✓ No over-labeling as Officer/Associate
- ✓ Balanced distribution across domains
- ✓ Appropriate confidence scores

### Step 3: Verify Review Queue
**Purpose**: Ensure low-confidence enrichments are flagged

**Action**: Check review queue:
```bash
GET /admin/enrichment/review-queue?limit=20
```

**Success Criteria**:
- ✓ Jobs with confidence < 0.65 for impact_domain are flagged
- ✓ Jobs with confidence < 0.70 for experience_level are flagged
- ✓ Jobs with short/empty descriptions are flagged
- ✓ Review queue contains appropriate jobs

### Step 4: Quality Dashboard Validation
**Purpose**: Monitor overall quality metrics

**Action**: Check quality dashboard:
```bash
GET /admin/enrichment/quality-dashboard
```

**Success Criteria**:
- ✓ Experience level distribution is balanced (<50% in any single category)
- ✓ Impact domain distribution is balanced (<40% WASH+Public Health combined)
- ✓ Average confidence > 0.70
- ✓ Low confidence count is reasonable (<20% of total)

### Step 5: Test UNDP Extraction
**Purpose**: Verify unique apply_url per job

**Action**: Run UNDP crawl:
```bash
POST /admin/crawl/run
Body: {
  "source_id": "<undp_source_id>"
}
```

**Success Criteria**:
- ✓ Each job has unique apply_url
- ✓ No duplicate URLs
- ✓ "Apply Now" buttons link to correct job detail pages
- ✓ Logs show proper link extraction

### Step 6: Audit Trail Verification
**Purpose**: Ensure all changes are tracked

**Action**: Check enrichment history for a job:
```bash
GET /admin/enrichment/history/{job_id}
```

**Success Criteria**:
- ✓ All enrichment changes are recorded
- ✓ Before/after snapshots are stored
- ✓ Change reasons are logged
- ✓ Timestamps are accurate

## 📊 Success Metrics

### Distribution Balance
- **Experience Level**: No single level > 50% of total
- **Impact Domain**: WASH + Public Health < 40% combined
- **Functional Role**: Balanced distribution

### Quality Metrics
- **Average Confidence**: > 0.70
- **Low Confidence Rate**: < 20%
- **Review Queue Size**: Reasonable (not all jobs flagged)

### Accuracy
- **Unique URLs**: 100% of jobs have unique apply_url
- **Correct Linking**: All "Apply Now" buttons work correctly
- **Audit Trail**: 100% of changes tracked

## 🚀 Next Steps

1. **Run Baseline Analysis**
   - Execute diagnostic script or call quality dashboard API
   - Document current state

2. **Re-enrich Sample Jobs**
   - Select 20 diverse jobs
   - Run batch enrichment
   - Compare before/after distributions

3. **Monitor Review Queue**
   - Check flagged jobs
   - Verify flagging criteria are working
   - Review a few jobs manually

4. **Test UNDP Extraction**
   - Run UNDP crawl
   - Verify unique URLs
   - Test "Apply Now" buttons in frontend

5. **Document Results**
   - Create validation report
   - Document any issues found
   - Set up ongoing monitoring

## 📝 Validation Checklist

- [ ] Baseline analysis completed
- [ ] Sample jobs re-enriched
- [ ] Distribution verified (no bias)
- [ ] Review queue checked
- [ ] Quality dashboard reviewed
- [ ] UNDP extraction tested
- [ ] Audit trail verified
- [ ] Results documented

## 🔧 Tools Available

### Scripts
- `apps/backend/scripts/diagnose_enrichment_bias.py` - Local diagnostic (needs SUPABASE_DB_URL)
- `apps/backend/scripts/validate_enrichment_pipeline.py` - API-based validation (needs requests module)

### API Endpoints
- `GET /admin/enrichment/quality-dashboard` - Quality metrics
- `GET /admin/enrichment/review-queue` - Review queue
- `GET /admin/enrichment/history/{job_id}` - Audit trail
- `POST /admin/jobs/enrich/batch` - Batch enrichment
- `POST /admin/enrichment/feedback` - Submit feedback
- `POST /admin/enrichment/ground-truth` - Add ground truth

## 📌 Notes

- All admin endpoints require authentication (`admin_required`)
- Endpoints are available at `/admin/...` (not `/api/admin/...`)
- Quality dashboard and review queue require jobs to be enriched first
- Validation should be done after jobs have been enriched with the new pipeline

