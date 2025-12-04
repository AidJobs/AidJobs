# Phase 4: Advanced Features - Implementation Summary

## Status: ✅ COMPLETED

## Overview

Phase 4 adds three major features to improve data quality and enable location-based functionality:

1. **Location Geocoding** - Convert location strings to coordinates
2. **Data Quality Scoring** - Score jobs on completeness and flag issues
3. **Golden Fixtures & Unit Tests** - Test framework for extraction logic

---

## 1. Location Geocoding

### Implementation

**File**: `apps/backend/core/geocoder.py`

- **Nominatim** (free, OpenStreetMap) as primary geocoder
- **Google Geocoding API** as optional fallback (requires API key)
- **Remote detection** - Automatically detects "Remote", "Work from Home", etc.
- **Rate limiting** - Respects Nominatim's 1 request/second limit
- **Caching** - In-memory cache to reduce API calls

### Database Changes

**Migration**: `infra/migrations/phase4_geocoding.sql`

Added columns to `jobs` table:
- `latitude` (NUMERIC) - Decimal degrees
- `longitude` (NUMERIC) - Decimal degrees
- `geocoded_at` (TIMESTAMPTZ) - When geocoded
- `geocoding_source` (TEXT) - 'nominatim', 'google', or 'heuristic'
- `is_remote` (BOOLEAN) - True for remote jobs

### Integration

- Integrated into `SimpleCrawler.crawl_source()` after AI normalization
- Only geocodes jobs with location but no coordinates
- Updates `country`, `country_iso`, and `city` if geocoding provides better data
- Stores geocoding results in database

### Usage

```python
from core.geocoder import get_geocoder

geocoder = get_geocoder()
result = await geocoder.geocode("Lagos, Nigeria")
# Returns: {'latitude': 6.5244, 'longitude': 3.3792, 'country': 'Nigeria', ...}
```

---

## 2. Data Quality Scoring

### Implementation

**File**: `apps/backend/core/data_quality.py`

- **Field-based scoring** - Each field has a weight
- **Completeness check** - Required vs optional fields
- **Validity checks** - URL format, date format, etc.
- **Issue detection** - Flags data quality problems
- **Grade assignment** - high, medium, low, very_low

### Scoring Factors

| Field | Weight | Description |
|-------|--------|-------------|
| title | 20% | Required, must be >= 5 chars |
| apply_url | 20% | Required, must be valid URL |
| location | 15% | Optional but important |
| deadline | 15% | Optional but important |
| description | 10% | Optional, should be >= 50 chars |
| org_name | 10% | Optional but important |
| geocoding | 5% | Bonus if location is geocoded |
| country | 5% | Bonus if country is present |

### Quality Grades

- **high** (≥0.85) - Complete, valid data
- **medium** (≥0.70) - Mostly complete, minor issues
- **low** (≥0.50) - Missing important fields
- **very_low** (<0.50) - Severely incomplete

### Database Changes

**Migration**: `infra/migrations/phase4_quality_scoring.sql`

Added columns to `jobs` table:
- `quality_score` (NUMERIC) - 0.0 to 1.0
- `quality_grade` (TEXT) - 'high', 'medium', 'low', 'very_low'
- `quality_factors` (JSONB) - Individual field scores
- `quality_issues` (TEXT[]) - List of issues found
- `needs_review` (BOOLEAN) - True if manual review needed
- `quality_scored_at` (TIMESTAMPTZ) - When scored

### Integration

- Integrated into `SimpleCrawler.crawl_source()` after geocoding
- Scores every job during extraction
- Stores scores in database
- Flags low-quality jobs for review

### Usage

```python
from core.data_quality import get_quality_scorer

scorer = get_quality_scorer()
result = scorer.score_job(job)
# Returns: {'score': 0.85, 'grade': 'high', 'factors': {...}, ...}
```

---

## 3. Golden Fixtures & Unit Tests

### Implementation

**Files**:
- `apps/backend/tests/test_extraction.py` - Test framework
- `apps/backend/tests/fixtures/` - HTML samples directory
- `apps/backend/tests/fixtures/expected/` - Expected results (JSON)

### Structure

```
tests/
├── __init__.py
├── test_extraction.py
└── fixtures/
    ├── README.md
    ├── success/
    │   ├── unicef_2024_success.html
    │   └── undp_2024_success.html
    ├── failure/
    │   ├── amnesty_2024_failure.html
    │   └── brac_2024_failure.html
    └── expected/
        ├── unicef_2024_success.json
        └── undp_2024_success.json
```

### Test Framework

- Loads HTML fixtures
- Runs extraction
- Compares with expected results
- Reports matches/mismatches
- Supports regression testing

### Usage

```python
from tests.test_extraction import TestExtraction

tester = TestExtraction()
result = await tester.test_extraction('unicef_2024_success')
```

---

## Migration Instructions

### Step 1: Apply Database Migrations

```bash
# Apply geocoding migration
python apps/backend/scripts/apply_phase4_migration.py

# Or manually run SQL:
psql $DATABASE_URL -f infra/migrations/phase4_geocoding.sql
psql $DATABASE_URL -f infra/migrations/phase4_quality_scoring.sql
```

### Step 2: Optional - Configure Google Geocoding

If you want to use Google Geocoding API (more accurate):

```bash
# Add to Render environment variables
GOOGLE_GEOCODING_API_KEY=your_api_key_here
```

### Step 3: Test

Run a crawl to see geocoding and quality scoring in action:

```bash
# Trigger a crawl via API
curl -X POST http://localhost:8000/api/admin/crawler/trigger/{source_id}
```

---

## Benefits

1. **Location-based search** - Can now search jobs by proximity
2. **Data quality visibility** - Know which jobs need review
3. **Regression prevention** - Unit tests catch extraction breakages
4. **Better data** - Geocoding enriches location data automatically

---

## Next Steps

- **Phase 5**: Production Hardening
  - Health monitoring
  - Circuit breakers
  - Caching strategy
  - Performance optimization

---

## Files Changed

### New Files
- `apps/backend/core/geocoder.py`
- `apps/backend/core/data_quality.py`
- `apps/backend/tests/test_extraction.py`
- `apps/backend/tests/fixtures/README.md`
- `infra/migrations/phase4_geocoding.sql`
- `infra/migrations/phase4_quality_scoring.sql`
- `apps/backend/scripts/apply_phase4_migration.py`

### Modified Files
- `apps/backend/crawler_v2/simple_crawler.py` - Integrated geocoding and quality scoring

---

## Notes

- Geocoding is rate-limited (1 req/sec for Nominatim)
- Quality scoring runs automatically on every crawl
- Golden fixtures need to be populated with real HTML samples
- Unit tests are framework-ready but need fixtures to be useful

