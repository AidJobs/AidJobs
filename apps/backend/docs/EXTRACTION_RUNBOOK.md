# Extraction Pipeline Runbook (Tasks 1-8)

## Overview

This runbook covers the core extraction pipeline (tasks 1-8) for shadow mode deployment and snapshot inspection.

## Shadow Mode

### Enable Shadow Mode

Set environment variables:
```bash
export EXTRACTION_SHADOW_MODE=true
export EXTRACTION_ENABLE_SNAPSHOTS=true
```

The pipeline will:
- Write extraction results to snapshots only
- Not modify production tables
- Save HTML and metadata for auditing

### Inspect Snapshots

Snapshots are saved to:
```
snapshots/{domain}/{sha256(url)}.html
snapshots/{domain}/{sha256(url)}.meta.json
```

**View a snapshot:**
```bash
# Find snapshot for a URL
python -c "
from pipeline.snapshot import SnapshotManager
sm = SnapshotManager()
result = sm.retrieve_snapshot('https://example.com/job/123')
print(json.dumps(result, indent=2))
"
```

**Check extraction metadata:**
```bash
cat snapshots/example.com/*.meta.json | jq '.field_metadata'
```

**Find low-confidence extractions:**
```bash
grep -r '"confidence": 0\.[0-4]' snapshots/*/*.meta.json
```

**Find manual review flags:**
```bash
grep -r '"manual_review": true' snapshots/*/*.meta.json
```

## Validation

### Manual Review Flags

The pipeline automatically flags extractions for manual review when:
- Title is missing or empty
- Deadline format is invalid
- Deadline is before posted date
- Location is generic (N/A, TBD, Multiple, etc.)

Check validation issues:
```bash
grep -r '"validation_issues"' snapshots/*/*.meta.json
```

### Confidence Thresholds

- **jsonld**: 0.90 (structured data)
- **meta**: 0.80 (meta tags)
- **dom**: 0.70 (DOM selectors)
- **heuristic**: 0.60 (label patterns)
- **regex**: 0.50 (pattern matching)
- **ai**: 0.40 (LLM fallback)

## Testing

### Run Unit Tests
```bash
pytest tests/test_pipeline_extractor.py -v
```

### Run Integration Tests
```bash
pytest tests/test_pipeline_integration.py -v
```

### Generate Initial Report
```bash
python scripts/generate_initial_report_focused.py
```

This processes test fixtures and generates `report/initial-run.json`.

## Troubleshooting

### Low Success Rates

1. Check classifier accuracy:
   ```python
   from pipeline.classifier import JobPageClassifier
   classifier = JobPageClassifier()
   # Test on sample pages
   ```

2. Review JSON-LD extraction:
   - Check if sites use Schema.org JobPosting
   - Verify JSON-LD structure

3. Check heuristics:
   - Verify label patterns match site structure
   - Review date parsing

### Missing Fields

1. Check extraction sources in metadata:
   ```bash
   cat snapshots/example.com/*.meta.json | jq '.field_metadata.title'
   ```

2. Review raw snippets:
   ```bash
   cat snapshots/example.com/*.meta.json | jq '.extraction_result.fields.title.raw_snippet'
   ```

### Schema Validation

Validate all results match strict schema:
```bash
python scripts/validate_extraction_schema.py
```

## Next Steps

After shadow mode validation:
1. Review top problematic URLs
2. Adjust heuristics/selectors as needed
3. Retrain classifier with labeled data
4. Enable production mode (remove shadow_mode flag)

## Safety

- **Shadow mode**: All writes go to snapshots only
- **No production changes**: Database tables not modified
- **AI limits**: Cached responses, max 200 calls in dry run
- **Rollback**: Simply disable shadow mode
