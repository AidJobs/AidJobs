# AI Model Change Plan

## Recommendation: Change Model FIRST, Then Phase 4

### Why Change Model First?

1. **Quick Change** (5 minutes)
   - Just update environment variable or default
   - No code changes needed
   - Can revert easily if needed

2. **Immediate Benefits**
   - Better normalization reliability starting now
   - All future crawls benefit immediately
   - Better data quality for Phase 4 work

3. **Low Risk**
   - Easy to test
   - Can revert if issues
   - Doesn't break anything

4. **Phase 4 Benefits**
   - Phase 4 includes location geocoding and quality scoring
   - Better AI normalization = better input for Phase 4 features
   - More reliable data = better test fixtures

### Implementation Steps

#### Option A: Environment Variable (Recommended)
```bash
# In .env or Render/Vercel environment
OPENROUTER_MODEL=anthropic/claude-3-haiku
```

**Pros:**
- No code changes
- Easy to test different models
- Can change without redeploy

#### Option B: Update Default in Code
```python
# apps/backend/core/ai_normalizer.py
self.model = model or os.getenv('OPENROUTER_MODEL', 'anthropic/claude-3-haiku')
```

**Pros:**
- Default is better model
- Still allows override via env var

### Testing Plan

1. **Change Model** (5 min)
   - Set environment variable
   - Or update code default

2. **Test Normalization** (10 min)
   - Run a crawl on a test source
   - Check logs for "AI normalized X field(s)"
   - Verify normalized fields in database

3. **Monitor** (ongoing)
   - Check normalization success rate
   - Monitor API costs
   - Verify no errors

4. **Revert if Needed** (1 min)
   - Change env var back
   - Or revert code change

### Time Estimate

- **Change**: 5 minutes
- **Test**: 10 minutes
- **Total**: ~15 minutes

### Then Proceed to Phase 4

After model change is verified:
- Proceed with Phase 4 (Advanced Features)
- Better model will improve Phase 4 work
- More reliable normalization = better test data

---

## Decision: Change Model First ✅

**Action**: Update model to Claude 3 Haiku, test, then proceed with Phase 4.

