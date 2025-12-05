# Extraction Pipeline Runbook

## Overview

This document describes the operational procedures for the robust extraction pipeline, including shadow mode deployment, monitoring, and rollback procedures.

## Architecture

The extraction pipeline implements a multi-stage extraction strategy:

1. **Job Page Classifier** - Determines if page is a job listing
2. **JSON-LD Extraction** - Extracts structured data (Schema.org JobPosting)
3. **Meta/OpenGraph Tags** - Extracts from HTML meta tags
4. **DOM Selectors** - Site-specific extraction using CSS selectors
5. **Label Heuristics** - Pattern matching for labeled fields
6. **Regex Fallback** - Date/location pattern matching
7. **AI Fallback** - LLM extraction as last resort

## Shadow Mode Deployment

### Phase 1: Shadow Mode (48 hours)

**Goal**: Run new extractor in parallel with old extractor, writing to side tables.

1. **Enable Shadow Mode**
   ```bash
   export EXTRACTION_SHADOW_MODE=true
   export EXTRACTION_SHADOW_TABLE=extraction_results_shadow
   ```

2. **Monitor Metrics**
   - Field success rates (should be ≥ 85%)
   - Per-domain success rates (should be ≥ 70% for non-empty domains)
   - Low-confidence rate (should be < 15%)
   - AI call count (should stay within limits)

3. **Compare Results**
   ```bash
   python scripts/compare_extractors.py --days 7 --output comparison_report.json
   ```

4. **Review Top Failures**
   ```bash
   python scripts/gather-failures.py --days 7
   ```

### Phase 2: Validation

After 48 hours, validate:

- ✅ Overall field success rate ≥ 85%
- ✅ Per-domain success rate ≥ 70% (for domains with >10 pages)
- ✅ Low-confidence rate < 15%
- ✅ No increase in false positives (non-job pages classified as jobs)
- ✅ No regression in critical fields (title, employer, location)

### Phase 3: Feature Flag Flip

Only flip the feature flag if all validation criteria are met:

```bash
export EXTRACTION_USE_NEW_PIPELINE=true
```

## Monitoring

### Key Metrics

1. **Field Success Rates**
   - Track per-field extraction success
   - Alert if any field drops below 80%

2. **Confidence Distribution**
   - Monitor confidence scores
   - Flag jobs with confidence < 0.5 for manual review

3. **AI Call Count**
   - Track AI extraction usage
   - Alert if approaching limit (2000 calls/day)

4. **Playwright Failures**
   - Monitor browser rendering failures
   - Alert if failure rate > 10%

5. **Per-Domain Performance**
   - Track success rates per domain
   - Flag domains with < 70% success

### Prometheus Metrics

- `extraction_total{field, source, status}` - Total extractions
- `extraction_confidence{field, source}` - Confidence scores
- `extraction_duration_seconds` - Extraction time
- `extraction_low_confidence` - Low confidence count
- `extraction_ai_calls` - AI call count
- `extraction_playwright_failures` - Browser failures

### StatsD Metrics

- `extraction.{field}.{source}.{status}` - Counter
- `extraction.{field}.{source}.confidence` - Gauge
- `extraction.low_confidence` - Counter
- `extraction.ai.{status}` - Counter
- `extraction.playwright.failure` - Counter

## Rollback Procedure

If metrics drop below thresholds:

1. **Immediate Rollback**
   ```bash
   export EXTRACTION_USE_NEW_PIPELINE=false
   ```

2. **Investigate Issues**
   ```bash
   python scripts/gather-failures.py --days 1
   python scripts/analyze_failures.py --input failures_*.csv
   ```

3. **Fix Issues**
   - Review top 20 problematic URLs
   - Update heuristics/selectors
   - Retrain classifier if needed

4. **Re-deploy**
   - Fix issues
   - Re-run shadow mode
   - Re-validate metrics

## Privacy & ToS Compliance

### Data Handling

- **HTML Snapshots**: Stored locally, not in public repos
- **PII Redaction**: Automatically redact emails, phone numbers from logs
- **Retention**: Snapshots retained for 90 days, then deleted

### robots.txt Compliance

- **Default**: Respect robots.txt
- **Override**: Use `config/domains.yaml` for exceptions
- **Audit**: Log all robots.txt violations

### Rate Limiting

- **Per-Domain**: Max 2 concurrent requests per domain
- **Global**: Max 10 concurrent requests total
- **Backoff**: Exponential backoff on 429 responses

## Troubleshooting

### Low Success Rates

1. Check classifier accuracy
2. Review JSON-LD extraction
3. Verify heuristics patterns
4. Check for site structure changes

### High AI Usage

1. Review why AI fallback is triggered
2. Improve heuristics to reduce AI dependency
3. Check cache hit rate

### Playwright Failures

1. Check network connectivity
2. Verify selectors in `config/domains.yaml`
3. Review timeout settings
4. Check for anti-bot measures

## Support Contacts

- **Pipeline Issues**: Backend team
- **Monitoring Alerts**: On-call engineer
- **Data Quality**: Data team

## Appendix

### Configuration Files

- `config/domains.yaml` - Domain-specific overrides
- `.env` - Environment variables

### Scripts

- `scripts/gather-failures.py` - Export failures to CSV
- `scripts/retrain-classifier.py` - Retrain ML classifier
- `scripts/compare_extractors.py` - Compare old vs new
- `scripts/check_extraction_accuracy.py` - Validate accuracy

### Database Tables

- `extraction_results_shadow` - Shadow mode results
- `failed_inserts` - Failed extractions
- `extraction_logs` - Extraction attempts

