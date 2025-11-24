# Enrichment Dashboard Guide

## Overview

The Enrichment Quality Dashboard monitors the AI-powered job enrichment pipeline, which adds metadata like impact domains, functional roles, and experience levels to jobs.

## Understanding the Dashboard

### Quality Score (Top Card)
- **Overall Quality**: 0-100% score based on:
  - Average confidence (40 points)
  - Low confidence percentage (30 points)
  - Bias indicators (30 points)
- **Color Coding**:
  - 🟢 Green (≥80%): Excellent quality
  - 🟡 Amber (50-79%): Good quality
  - 🔴 Coral (<50%): Needs attention

### Summary Cards

1. **Total Enriched**: Number of jobs with enrichment data
2. **Avg Confidence**: Average AI confidence score (0-1)
   - **Red Exclamation Mark**: Appears when average confidence < 0.70
   - **Tooltip**: "Low confidence (<0.70). Consider reviewing enrichments."
   - **Green Dot**: Appears when average confidence ≥ 0.70
   - **Tooltip**: "Good confidence (≥0.70)"
3. **Low Confidence**: Count of jobs with confidence < 0.50
   - **Red Exclamation Mark**: Appears when ≥20% of jobs have low confidence
   - **Tooltip**: "High percentage of low confidence jobs (≥20%). Review recommended."
   - **Green Dot**: Appears when <20% have low confidence
   - **Tooltip**: "Low confidence jobs < 20% (Good)"
4. **Review Queue**: Jobs flagged for human review
   - **Green Dot**: No pending reviews
   - **Yellow Dot**: Jobs awaiting review

### Bias Indicators

- **WASH + Public Health**: Percentage of jobs in these domains
  - **Red Exclamation Mark**: >40% (potential bias)
  - **Tooltip**: "Potential bias: WASH + Public Health > 40%"
  - **Green Dot**: ≤40% (balanced)
  - **Tooltip**: "Balanced distribution (<40%)"
- **Max Experience Level**: Highest percentage for any single experience level
  - **Red Exclamation Mark**: >50% (potential bias)
  - **Tooltip**: "Potential bias: One experience level > 50%"
  - **Green Dot**: ≤50% (balanced)
  - **Tooltip**: "Balanced distribution (<50%)"

## How to Initialize Enrichment

### Automatic Enrichment (Recommended)

1. **Check for Unenriched Jobs**:
   - The dashboard automatically shows an "Enrich X Jobs" button if there are unenriched jobs
   - The button appears in the top-right corner next to the refresh button

2. **Trigger Batch Enrichment**:
   - Click the **"Enrich X Jobs"** button (where X is the number of unenriched jobs, up to 50)
   - The system will:
     - Fetch up to 50 unenriched jobs
     - Enrich them in batches
     - Update the dashboard automatically

3. **Monitor Progress**:
   - The button shows "Enriching..." while processing
   - A success toast appears when complete
   - The dashboard refreshes automatically after 2 seconds

### Manual Enrichment (API)

You can also trigger enrichment via API:

#### Single Job Enrichment
```bash
POST /admin/jobs/enrich
{
  "job_id": "your-job-id"
}
```

#### Batch Enrichment
```bash
POST /admin/jobs/enrich/batch
{
  "job_ids": ["job-id-1", "job-id-2", "job-id-3", ...]
}
```

**Note**: Maximum 100 jobs per batch request.

### Get Unenriched Jobs

```bash
# Get count
GET /admin/enrichment/unenriched-count

# Get list of job IDs (limit: 1-100)
GET /admin/enrichment/unenriched-jobs?limit=50
```

## Status Indicators Explained

### Red Exclamation Mark (AlertCircle)
- **Meaning**: Warning or issue detected
- **Appears on**:
  - Avg Confidence card when < 0.70
  - Low Confidence card when ≥20% of jobs have low confidence
  - Bias indicators when thresholds are exceeded
- **Action**: Review enrichments or investigate bias

### Green Dot
- **Meaning**: Status is good/healthy
- **Appears on**:
  - Avg Confidence card when ≥ 0.70
  - Low Confidence card when <20% have low confidence
  - Bias indicators when distribution is balanced
  - Review Queue when no pending reviews

### Yellow Dot
- **Meaning**: Attention needed but not critical
- **Appears on**:
  - Review Queue when jobs are pending review

## Best Practices

1. **Regular Monitoring**: Check the dashboard weekly to monitor quality trends
2. **Review Low Confidence Jobs**: Jobs with confidence < 0.50 are automatically flagged for review
3. **Watch for Bias**: If WASH+Health > 40% or one experience level > 50%, investigate
4. **Batch Enrichment**: Enrich in batches of 50 jobs to avoid overwhelming the AI service
5. **Refresh After Enrichment**: Always refresh the dashboard after running enrichment to see updated metrics

## Troubleshooting

### All Metrics Show Zero
- **Cause**: No jobs have been enriched yet
- **Solution**: Click "Enrich X Jobs" button to start enrichment

### Red Exclamation Marks Everywhere
- **Cause**: Low confidence or bias detected
- **Solution**: 
  - Review jobs in the Review Queue
  - Check if job descriptions are too short or unclear
  - Consider adjusting confidence thresholds

### Enrichment Button Not Appearing
- **Cause**: All jobs are already enriched OR no active jobs exist
- **Solution**: Check if you have active jobs in the database

### Enrichment Fails
- **Cause**: OpenRouter API key not configured or rate limits exceeded
- **Solution**: 
  - Check `OPENROUTER_API_KEY` environment variable
  - Wait a few minutes and retry
  - Check backend logs for detailed error messages

## API Endpoints Reference

- `GET /admin/enrichment/quality-dashboard` - Get quality metrics
- `GET /admin/enrichment/review-queue` - Get jobs pending review
- `GET /admin/enrichment/unenriched-count` - Get count of unenriched jobs
- `GET /admin/enrichment/unenriched-jobs?limit=N` - Get list of unenriched job IDs
- `POST /admin/jobs/enrich` - Enrich a single job
- `POST /admin/jobs/enrich/batch` - Enrich multiple jobs

All endpoints require admin authentication.

