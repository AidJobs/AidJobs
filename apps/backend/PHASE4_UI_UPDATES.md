# Phase 4 UI Updates Needed

## Status: ✅ Migrations Applied

Both migrations have been successfully applied:
- ✅ Geocoding columns (latitude, longitude, geocoded_at, geocoding_source, is_remote)
- ✅ Quality scoring columns (quality_score, quality_grade, quality_factors, quality_issues, needs_review, quality_scored_at)

## Required Updates

### 1. Backend API Updates

#### A. Search API (`apps/backend/app/search.py`)
**Current**: Line 872-878 - SELECT query doesn't include Phase 4 fields
**Needed**: Add to SELECT:
- `quality_score`
- `quality_grade`
- `quality_issues`
- `needs_review`
- `latitude`
- `longitude`
- `is_remote`
- `geocoding_source`

#### B. Job Management API (`apps/backend/app/job_management.py`)
**Current**: Likely missing Phase 4 fields in SELECT queries
**Needed**: Ensure all job queries include:
- Quality scoring fields
- Geocoding fields

### 2. Frontend Updates

#### A. DataQualityBadge Component (`apps/frontend/components/DataQualityBadge.tsx`)
**Current**: Uses `score` prop (works with new `quality_score`)
**Status**: ✅ Already compatible (accepts `score` prop)

**Enhancement Needed**: 
- Add support for `quality_grade` prop
- Show grade badge (High/Medium/Low/Very Low)
- Display `needs_review` indicator

#### B. Jobs Admin Page (`apps/frontend/app/admin/jobs/page.tsx`)
**Current**: Uses `data_quality_score` (old field name)
**Needed**: 
- Update to use `quality_score` (new Phase 4 field)
- Add `quality_grade` display
- Add `needs_review` filter/indicator
- Show geocoding status (if geocoded, source)

#### C. JobInspector Component (`apps/frontend/components/JobInspector.tsx`)
**Current**: Missing Phase 4 fields in type definition
**Needed**:
- Add `quality_score`, `quality_grade`, `quality_issues` to Job type
- Add `latitude`, `longitude`, `is_remote` to Job type
- Display quality badge
- Show geocoding info (if available)
- Display "Needs Review" indicator

#### D. Data Quality Page (`apps/frontend/app/admin/data-quality/page.tsx`)
**Current**: Uses old `data_quality_score` field
**Needed**:
- Update to use `quality_score` (Phase 4)
- Add `quality_grade` distribution chart
- Show `needs_review` count
- Display geocoding coverage stats

### 3. Optional Enhancements

#### A. Location Map View
- Show jobs on map using latitude/longitude
- Filter by location radius
- Group by city/country

#### B. Quality Dashboard
- Quality score trends over time
- Grade distribution pie chart
- Top issues list
- Sources with most low-quality jobs

#### C. Geocoding Status
- Show geocoding coverage (% of jobs geocoded)
- List jobs that need geocoding
- Manual geocoding trigger button

## Priority

1. **HIGH**: Update backend APIs to return Phase 4 fields
2. **HIGH**: Update frontend to use `quality_score` instead of `data_quality_score`
3. **MEDIUM**: Add `quality_grade` and `needs_review` display
4. **LOW**: Add geocoding status display
5. **LOW**: Optional enhancements (map view, etc.)

## Notes

- The old `data_quality_score` field may still exist in the database
- Consider deprecating old field after migration period
- Quality score is 0.0-1.0 in database but UI shows 0-100 (multiply by 100)

