# AI Model Default Recommendation

## Current Default

**Code**: `apps/backend/core/ai_normalizer.py` line 36
```python
self.model = model or os.getenv('OPENROUTER_MODEL', 'openai/gpt-4o-mini')
```

**Current Default**: `'openai/gpt-4o-mini'`

## Best Practice: Both (Default + Environment Override)

### Current Pattern (Already Good!)
```python
self.model = model or os.getenv('OPENROUTER_MODEL', 'openai/gpt-4o-mini')
```

This pattern provides:
1. **Function parameter** (highest priority) - for testing
2. **Environment variable** (medium priority) - for Render/production
3. **Hardcoded default** (lowest priority) - for local development

### Why This is Best

✅ **Default in Code**:
- Works out of the box (no config needed for local dev)
- Clear what the default is (visible in code)
- Good for new developers

✅ **Environment Variable Override**:
- Easy to change in Render without code deploy
- Can test different models quickly
- Production flexibility
- No code changes needed

✅ **Both Together**:
- Best of both worlds
- Flexible for all scenarios
- Follows 12-factor app principles

## Recommendation

**Update the default to Claude 3 Haiku, keep environment variable override:**

```python
self.model = model or os.getenv('OPENROUTER_MODEL', 'anthropic/claude-3-haiku')
```

### Benefits:
1. **Better default** - New installs get better model
2. **Still flexible** - Can override via Render env vars
3. **No breaking change** - Existing Render configs still work
4. **Best practice** - Follows standard pattern

### Usage Scenarios:

**Local Development:**
- Uses default (Claude 3 Haiku) - no config needed

**Render Production:**
- Can set `OPENROUTER_MODEL` in Render dashboard
- Or rely on code default (Claude 3 Haiku)
- Easy to change without redeploy

**Testing Different Models:**
- Set `OPENROUTER_MODEL` in environment
- Or pass as parameter in code
- Maximum flexibility

## Action Plan

1. **Update default in code** to Claude 3 Haiku
2. **Keep environment variable** support (already there)
3. **Update env.example** to show Claude as recommended
4. **Document** that Render can override if needed

This gives you:
- ✅ Better default (Claude 3 Haiku)
- ✅ Render flexibility (can override)
- ✅ Local dev convenience (works out of box)
- ✅ No breaking changes

