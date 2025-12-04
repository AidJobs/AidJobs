# Answers to Your Questions

## 1. Better AI Model Alternatives

**Short Answer**: Yes, **Claude 3 Haiku** (`anthropic/claude-3-haiku`) is recommended.

**Why:**
- Better JSON reliability (more consistent structured output)
- Better instruction following
- Slightly faster (~0.5-1s vs 1-2s)
- Only ~50% more expensive, but much more reliable

**Cost Impact:**
- Current (gpt-4o-mini): ~$0.01-0.10 per source crawl
- With Claude Haiku: ~$0.015-0.15 per source crawl
- **Worth it** for the reliability improvement

**How to Change:**
```bash
# Set environment variable
export OPENROUTER_MODEL=anthropic/claude-3-haiku
```

Or update default in `apps/backend/core/ai_normalizer.py`:
```python
self.model = model or os.getenv('OPENROUTER_MODEL', 'anthropic/claude-3-haiku')
```

**See**: `AI_MODEL_RECOMMENDATIONS.md` for full comparison

---

## 2. UI Changes Needed for New Features

**Short Answer**: Yes, we should add an **Observability Dashboard** to the admin UI.

### What We've Added (Backend):
- ✅ Coverage monitoring endpoints
- ✅ Extraction statistics endpoints
- ✅ Failed inserts tracking
- ✅ Raw HTML storage

### What's Missing (Frontend):
- ❌ **Observability Dashboard** - Visualize coverage stats, extraction logs, failed inserts
- ❌ **Coverage Charts** - Show mismatch percentages, health status
- ❌ **Failed Inserts Viewer** - Table of failed jobs with error details
- ❌ **Extraction Logs Viewer** - Timeline of extraction attempts

### Recommended UI Pages:

1. **`/admin/observability`** (New Page)
   - Coverage statistics dashboard
   - Per-source coverage table
   - Health status indicators
   - Mismatch alerts

2. **`/admin/observability/failed-inserts`** (New Page)
   - Table of failed inserts
   - Filter by source, date, error type
   - Resolve/unresolve actions
   - Export functionality

3. **`/admin/observability/logs`** (New Page)
   - Extraction logs timeline
   - Filter by source, status, date
   - View raw HTML links
   - Download logs

### Integration Points:
- Add to admin navigation (`apps/frontend/app/admin/layout.tsx`)
- Create new pages in `apps/frontend/app/admin/observability/`
- Use existing API endpoints we created

**Priority**: Medium (nice to have, but not critical for functionality)

---

## 3. Master Plan Update

**Short Answer**: Yes, we should update the master plan. We've completed significant work that's not reflected.

### Where We Stand:

#### ✅ **COMPLETED** (Not in Original Plan):
- **Phase 1 (Enterprise Quick Wins)**: ✅ DONE
  - JSON-LD priority extraction
  - Enhanced field extraction
  - Dateparser integration
  - Failed insert logging

- **Phase 2 (Observability)**: ✅ DONE
  - Raw HTML storage
  - Extraction logging
  - Coverage monitoring
  - Failed inserts tracking

- **Phase 3 (AI Normalization)**: ✅ DONE
  - AI normalizer module
  - Integration into pipeline
  - Cost control mechanisms

#### 📋 **ORIGINAL PLAN STATUS**:
Looking at `AIDJOBS_CONSOLIDATED_MASTER_PLAN.md`:

- **Pre-Phase 0**: Partially done (some fixes, but not all)
- **Phase 1**: In progress (we've done more than planned)
- **Phase 2**: Not started (different from our Phase 2)
- **Phase 3**: Not started (different from our Phase 3)
- **Phase 4**: Not started

### Recommendation:

**Create a new "Enterprise-Grade Implementation" section** in the master plan that:
1. Documents our 3 completed phases
2. Maps them to original plan goals
3. Shows what's next (Phase 4, 5)
4. Provides clear roadmap forward

**Action Items:**
1. Update `AIDJOBS_CONSOLIDATED_MASTER_PLAN.md` with:
   - New "Enterprise Implementation" section
   - Status of all phases
   - Clear next steps
2. Align remaining work with original plan
3. Create unified roadmap

---

## Summary

1. **AI Model**: Switch to Claude 3 Haiku for better reliability
2. **UI Changes**: Add observability dashboard (3 new pages recommended)
3. **Master Plan**: Update with our progress and create unified roadmap

**Next**: Proceed with Phase 4 after updating master plan?

