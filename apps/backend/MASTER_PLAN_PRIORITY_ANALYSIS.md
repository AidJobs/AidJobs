# Master Plan Priority Analysis

## Critical & High Priority Items Pending

### 🔴 CRITICAL Priority

#### 1.1 Enhanced Location/Deadline Extraction
**Status**: In Progress | **Priority**: CRITICAL

**Pending Tasks:**
- [ ] Test UNESCO extraction with real data
- [ ] Test UNDP extraction with real data  
- [ ] Verify location/deadline accuracy
- [ ] Fix any remaining extraction issues

**Why Critical:** 
- Core functionality - users need accurate location/deadline data
- Phase 4 added geocoding, but extraction accuracy still needs verification
- Should be tested before moving to Phase 5

**Estimated Time:** 1-2 days

---

### 🟠 HIGH Priority

#### 1.2 Enhanced Data Quality Validation
**Status**: Partially Done | **Priority**: HIGH

**Pending Tasks:**
- [ ] Pre-upsert validation (duplicate URLs, missing fields)
- [ ] Post-upsert validation (unique apply_url per source)
- [ ] Data quality dashboard endpoint
- [ ] Automated cleanup job for invalid data

**Why High:**
- Prevents bad data from entering database
- Duplicate detection is critical for data integrity
- Quality dashboard needed to monitor Phase 4 quality scores

**Estimated Time:** 2-3 days

---

#### 1.3 Link Validation Service
**Status**: Started | **Priority**: HIGH

**Pending Tasks:**
- [ ] Complete link validation service
- [ ] Integrate into crawl pipeline
- [ ] Add admin validation endpoint
- [ ] Add validation status to job management UI
- [ ] Add broken link alerts

**Why High:**
- Broken apply URLs hurt user experience
- Should validate before saving jobs
- Can prevent wasted processing

**Estimated Time:** 2-3 days

---

#### 1.4 Enhanced Data Repair System
**Status**: Partially Done | **Priority**: HIGH

**Pending Tasks:**
- [ ] Enhance location repair (better extraction)
- [ ] Enhance deadline repair (better parsing)
- [ ] Add repair confidence scoring
- [ ] Add repair history tracking
- [ ] Add bulk repair operations

**Why High:**
- Helps fix existing bad data
- Bulk operations needed for efficiency
- Repair history provides audit trail

**Estimated Time:** 2-3 days

---

#### 1.7 Enhanced Error Handling
**Status**: Needs Work | **Priority**: HIGH

**Pending Tasks:**
- [ ] Add retry logic with exponential backoff
- [ ] Add circuit breaker pattern for failing sources
- [ ] Add graceful degradation (partial extraction)
- [ ] Add error classification (transient vs permanent)
- [ ] Add error reporting and alerting

**Why High:**
- Prevents cascading failures
- **OVERLAPS with Phase 5** (circuit breakers)
- Critical for production reliability

**Estimated Time:** 3-4 days

---

## 🎯 Recommended Priority Order

### Option A: Complete Critical Items First (Recommended)
**Rationale:** Fix core functionality before adding new features

1. **Week 1: Testing & Validation** (3-4 days)
   - Test UNESCO/UNDP extraction
   - Verify location/deadline accuracy
   - Fix extraction issues

2. **Week 2: Data Quality Validation** (2-3 days)
   - Pre-upsert validation (duplicates, missing fields)
   - Post-upsert validation
   - Quality dashboard endpoint

3. **Week 2-3: Link Validation** (2-3 days)
   - Complete link validation
   - Integrate into pipeline
   - Add admin UI

**Then proceed to Phase 5**

---

### Option B: Hybrid Approach
**Rationale:** Do critical testing first, then parallel track

1. **Immediate (1-2 days):**
   - Test UNESCO/UNDP extraction
   - Verify Phase 4 features work

2. **Parallel Track 1: Data Quality** (2-3 days)
   - Pre-upsert validation
   - Quality dashboard

3. **Parallel Track 2: Error Handling** (3-4 days)
   - Retry logic
   - Circuit breakers (Phase 5 overlap)

**Then proceed to rest of Phase 5**

---

### Option C: Phase 5 First, Then Critical Items
**Rationale:** Build infrastructure first, then fix issues

**Not Recommended** - Better to fix core issues before building on top

---

## 📊 Overlap Analysis

### Items That Overlap with Phase 5:
- **1.7 Enhanced Error Handling** → **Phase 5.2 Circuit Breakers**
  - **Decision:** Do as part of Phase 5 (more comprehensive)

- **1.8 Basic Monitoring Dashboard** → **Phase 5.1 Health Monitoring**
  - **Decision:** Do as part of Phase 5 (more comprehensive)

### Items Unique to Master Plan:
- **1.1 Testing** - Must do before Phase 5
- **1.2 Data Quality Validation** - Should do before Phase 5
- **1.3 Link Validation** - Should do before Phase 5
- **1.4 Data Repair** - Can do anytime (not blocking)

---

## ✅ Recommendation

**Do Option A: Complete Critical Items First**

**Week 1-2: Critical Fixes**
1. Test UNESCO/UNDP extraction (1-2 days)
2. Pre-upsert validation (duplicates, missing fields) (1-2 days)
3. Link validation integration (2 days)
4. Quality dashboard endpoint (1 day)

**Then Phase 5: Production Hardening**
- Health monitoring (includes monitoring dashboard)
- Circuit breakers (includes error handling)
- Caching
- Performance optimization

**Total Timeline:**
- Critical fixes: 1-2 weeks
- Phase 5: 6-8 weeks
- **Total: 7-10 weeks**

---

## 🚨 Must Do Before Phase 5

1. ✅ **Test Phase 4 features** (geocoding, quality scoring)
2. ✅ **Pre-upsert validation** (prevent bad data)
3. ✅ **Link validation** (prevent broken URLs)

These are foundational and should be done before building Phase 5 infrastructure.

