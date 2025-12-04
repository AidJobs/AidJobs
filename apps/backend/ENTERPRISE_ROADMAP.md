# Enterprise-Grade Crawler Roadmap

## Overview
This document outlines the comprehensive plan to transform the AidJobs crawler into an enterprise-grade system with robust error handling, monitoring, and scalability.

## Phase 1: Quick Wins (✅ COMPLETED)
**Status:** Implemented and ready for testing

### Completed Improvements:
1. ✅ **JSON-LD Priority Extraction** - Try structured data FIRST before other strategies
2. ✅ **Enhanced JSON-LD Parsing** - Handle @graph, itemListElement, and other variations
3. ✅ **Comprehensive Field Extraction** - Extract location, deadline, salary, description, employment type
4. ✅ **Dateparser Integration** - Robust date parsing with locale support and fallbacks
5. ✅ **Failed Insert Logging** - Detailed error tracking for debugging

### Benefits:
- **Higher accuracy** - JSON-LD is the most reliable source
- **Better date parsing** - Handles international formats automatically
- **Improved debugging** - Know exactly why jobs fail to insert
- **More complete data** - Extract salary, description, and other fields

---

## Phase 2: Observability & Storage
**Status:** ✅ COMPLETED

### Database Schema
Create tables for comprehensive tracking:

```sql
-- 1. raw_pages: Store fetched HTML + metadata
CREATE TABLE raw_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  status INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  http_headers JSONB,
  storage_path TEXT, -- path in storage bucket
  content_length INTEGER,
  notes TEXT,
  source_id UUID REFERENCES sources(id)
);

-- 2. extraction_logs: Per-URL extraction status
CREATE TABLE extraction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT,
  raw_page_id UUID REFERENCES raw_pages(id),
  status TEXT, -- OK / PARTIAL / EMPTY / DB_FAIL
  reason TEXT,
  extracted_fields JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source_id UUID REFERENCES sources(id)
);

-- 3. failed_inserts: Track insertion failures
CREATE TABLE failed_inserts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT,
  error TEXT,
  payload JSONB,
  raw_page_id UUID REFERENCES raw_pages(id),
  attempt_at TIMESTAMPTZ DEFAULT NOW(),
  source_id UUID REFERENCES sources(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);
```

### HTML Storage
- **Option A:** Supabase Storage (recommended for cloud)
- **Option B:** Filesystem (for local development)
- Store raw HTML for every fetch attempt
- Enable re-extraction without re-fetching

### Extraction Logger
Create `apps/backend/core/extraction_logger.py`:
- Log every extraction attempt
- Track status (OK/PARTIAL/EMPTY/DB_FAIL)
- Store extracted fields for analysis
- Link to raw_pages for traceability

### Coverage Monitoring
- Compare discovered URLs vs inserted rows
- Flag sources with >5% mismatch
- Dashboard showing extraction success rates
- Alert on coverage drops

---

## Phase 3: AI-Assisted Normalization
**Status:** ✅ COMPLETED

### AI Normalizer Module
Create `apps/backend/core/ai_normalizer.py`:
- Normalize ambiguous dates (e.g., "31 Dec" → "2025-12-31")
- Interpret location strings ("Lagos / Remote" → structured format)
- Parse salary ranges and currencies
- Only use AI when heuristics fail (cost control)

### Integration Points
- After extraction, check confidence scores
- If low confidence, call AI normalizer
- Cache normalized results
- Fallback to raw values if AI fails

### Cost Optimization
- Batch normalization requests
- Cache common patterns
- Only normalize when necessary
- Use cheaper models for simple cases

---

## Phase 4: Advanced Features
**Status:** ✅ COMPLETED

### Location Geocoding
- Use Nominatim (free) or Google Geocoding API
- Convert location strings to lat/lon
- Store normalized location (country, city, coordinates)
- Enable location-based search

### Golden Fixtures & Unit Tests
- Create 20+ HTML samples (10 successes, 10 failures)
- Unit tests for each extractor
- Regression detection
- Automated testing on fixtures

### Data Quality Scoring
- Score each job on completeness
- Flag low-quality jobs for review
- Track quality trends over time
- Auto-flag suspicious patterns

---

## Phase 5: Production Hardening
**Status:** 📋 PLANNED

### Health Monitoring
- Real-time health dashboards
- Alert on extraction failures
- Track success rates per source
- Monitor API rate limits

### Circuit Breakers
- Auto-disable failing sources
- Exponential backoff on errors
- Manual override for critical sources
- Recovery detection

### Caching Strategy
- Cache rendered HTML (N hours)
- Cache extraction results
- Invalidate on source updates
- Reduce redundant processing

### Performance Optimization
- Parallel extraction where possible
- Batch database operations
- Optimize database queries
- Connection pooling

---

## Enterprise Success Metrics

### Accuracy
- **Target:** >90% precision/recall on ground truth test set
- **Current:** Baseline established, needs measurement

### Reliability
- **Target:** >99% uptime for crawler service
- **Current:** Needs monitoring infrastructure

### Coverage
- **Target:** <5% mismatch between discovered and inserted jobs
- **Current:** Needs coverage monitoring

### Performance
- **Target:** <30s per source crawl
- **Current:** Varies by source complexity

### Data Quality
- **Target:** >80% of jobs have complete fields (title, location, deadline)
- **Current:** Needs quality scoring system

---

## Implementation Priority

1. **Phase 1** ✅ - Quick wins (COMPLETED)
2. **Phase 2** ✅ - Observability (COMPLETED)
3. **Phase 3** ✅ - AI Normalization (COMPLETED)
4. **Phase 4** 🔄 - Advanced Features (NEXT - In Progress)
5. **Phase 5** 📋 - Production Hardening (PLANNED)

---

## Cost Considerations

### Current Costs
- OpenRouter API: ~$0.01-0.10 per source (AI extraction)
- Database: Included in Supabase plan
- Storage: ~$0.02/GB/month (Supabase Storage)

### Projected Costs (with all phases)
- AI Normalization: +$0.01-0.05 per source
- Geocoding: +$0.001-0.01 per job (if using Google)
- Storage: +$5-20/month (for raw HTML)

### Cost Optimization
- Cache aggressively
- Use AI only when needed
- Batch operations
- Monitor and alert on cost spikes

---

## Next Steps

1. **Test Phase 1** - Verify improvements work correctly
2. **Implement Phase 2** - Add observability infrastructure
3. **Create monitoring dashboard** - Visualize extraction metrics
4. **Set up alerts** - Notify on failures
5. **Iterate based on data** - Use logs to identify patterns

---

## Notes

- All phases are designed to be incremental
- Can deploy each phase independently
- Backward compatible with existing system
- No breaking changes to API

