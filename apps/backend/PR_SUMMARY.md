# PR Summary: Core Extraction Pipeline (Tasks 1-8)

## Branch
`fix/robust-extractor-20250105-173044`

## Overview

This PR implements the core extraction pipeline (tasks 1-8) with a multi-stage fallback strategy, strict schema compliance, and shadow mode support.

## Changes

### Core Pipeline Components

1. **Extractor** (`pipeline/extractor.py`)
   - 7-stage extraction chain: classifier → JSON-LD → meta → DOM → heuristics → regex → AI
   - Strict schema compliance
   - Per-field confidence scoring
   - Validation with manual_review flags

2. **Classifier** (`pipeline/classifier.py`)
   - Rule-based job page classification
   - ML-ready architecture
   - 20 seed examples (10 job, 10 non-job)

3. **JSON-LD Extractor** (`pipeline/jsonld.py`)
   - Schema.org JobPosting parsing
   - Handles arrays, nested objects, @graph
   - Maps validThrough → deadline, jobLocation → location

4. **Heuristic Extractor** (`pipeline/heuristics.py`)
   - Label-based extraction (Location:, Deadline:, etc.)
   - Date parsing with dateutil support
   - Multiple regex patterns

5. **AI Fallback** (`pipeline/ai_fallback.py`)
   - Deterministic prompts with few-shot examples
   - Caching to limit API calls
   - Only used when previous steps fail

6. **Snapshot Manager** (`pipeline/snapshot.py`)
   - Saves HTML and metadata to `snapshots/{domain}/{hash}.html`
   - Includes per-field confidence and sources
   - Manual review flags in metadata

7. **Browser Crawler Enhancement**
   - Network idle waiting
   - Error screenshots
   - Final DOM capture

8. **RSS/API Integration**
   - Updated to use unified pipeline
   - Maintains backward compatibility

### Tests

- Unit tests for JSON-LD, heuristics, classifier
- Integration tests with saved HTML fixtures
- Schema validation tests

### Configuration

- Domain overrides (`config/domains.yaml`)
- Shadow mode support
- AI call limits (200 in dry run)

## Schema Compliance

All extraction results match strict schema:
```json
{
  "url": "string",
  "canonical_id": "string",
  "extracted_at": "ISO-8601",
  "pipeline_version": "string",
  "fields": {
    "title": {"value": "...", "source": "...", "confidence": 0.9, "raw_snippet": "..."},
    ...
  },
  "is_job": true,
  "classifier_score": 0.85,
  "dedupe_hash": "string"
}
```

## Safety

- ✅ Shadow mode (snapshots only, no DB writes)
- ✅ AI call limits (200 max in dry run)
- ✅ Caching enabled
- ✅ Validation flags for manual review

## Testing

Run tests:
```bash
pytest tests/test_pipeline_extractor.py tests/test_pipeline_integration.py -v
```

Generate report:
```bash
python scripts/generate_initial_report_focused.py
```

## Next Steps

1. Run shadow mode for validation
2. Review snapshots and metadata
3. Adjust heuristics based on results
4. Retrain classifier with more labeled data

## Files Changed

- 9 new pipeline components
- 2 test files (unit + integration)
- 20 classifier seed examples
- 2 sample job fixtures
- Enhanced browser crawler
- Updated RSS/API crawlers
- Configuration and scripts
