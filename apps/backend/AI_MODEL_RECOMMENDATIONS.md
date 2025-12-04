# AI Model Recommendations for Normalization

## Current Model: `openai/gpt-4o-mini`

**Cost**: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
**Performance**: Good for structured data extraction
**Speed**: Fast (~1-2s per request)

## Recommended Alternatives

### 1. **Claude 3 Haiku** (Anthropic) ⭐ RECOMMENDED
**Model**: `anthropic/claude-3-haiku`
**Cost**: ~$0.25 per 1M input tokens, ~$1.25 per 1M output tokens
**Performance**: Excellent for structured JSON output, very reliable
**Speed**: Very fast (~0.5-1s per request)
**Why**: Better at following JSON format instructions, more consistent output

**Pros:**
- More reliable JSON parsing
- Better instruction following
- Slightly faster
- Good cost/performance ratio

**Cons:**
- Slightly more expensive than gpt-4o-mini
- Still very affordable

### 2. **Mistral Small** (Mistral AI)
**Model**: `mistralai/mistral-small`
**Cost**: ~$0.20 per 1M input tokens, ~$0.60 per 1M output tokens
**Performance**: Good for structured tasks
**Speed**: Fast (~1-2s per request)
**Why**: Open-source model, good balance

**Pros:**
- Open-source (more transparent)
- Good performance
- Competitive pricing

**Cons:**
- May need more prompt engineering
- Less consistent than Claude/GPT

### 3. **GPT-3.5 Turbo** (OpenAI)
**Model**: `openai/gpt-3.5-turbo`
**Cost**: ~$0.50 per 1M input tokens, ~$1.50 per 1M output tokens
**Performance**: Good but less capable than gpt-4o-mini
**Speed**: Very fast (~0.5-1s per request)
**Why**: Cheaper option, but less capable

**Pros:**
- Very fast
- Lower cost per token

**Cons:**
- Less capable than gpt-4o-mini
- May struggle with complex normalization
- Not recommended for this use case

### 4. **Llama 3.1 8B** (Meta)
**Model**: `meta-llama/llama-3.1-8b-instruct`
**Cost**: ~$0.10 per 1M input tokens, ~$0.10 per 1M output tokens
**Performance**: Good for simple tasks, may struggle with complex parsing
**Speed**: Fast (~1-2s per request)
**Why**: Very cheap, open-source

**Pros:**
- Very cheap
- Open-source
- Good for simple tasks

**Cons:**
- Less capable for complex normalization
- May need more retries
- Less reliable JSON output

## Recommendation

### For Production: **Claude 3 Haiku** (`anthropic/claude-3-haiku`)

**Why:**
1. **Better JSON reliability** - More consistent structured output
2. **Better instruction following** - Follows format requirements better
3. **Faster** - Slightly faster response times
4. **Cost-effective** - Only slightly more expensive, but worth it for reliability

**Cost Impact:**
- Current (gpt-4o-mini): ~$0.01-0.10 per source crawl
- With Claude Haiku: ~$0.015-0.15 per source crawl
- **Difference**: ~50% more expensive, but much more reliable

### For Cost Optimization: **Mistral Small** (`mistralai/mistral-small`)

**Why:**
1. **Open-source** - More transparent
2. **Good performance** - Handles structured tasks well
3. **Competitive pricing** - Similar to gpt-4o-mini

**Cost Impact:**
- Similar to gpt-4o-mini
- May need slight prompt adjustments

## Implementation

### Change Model in Code

**File**: `apps/backend/core/ai_normalizer.py`

```python
# Current
self.model = model or os.getenv('OPENROUTER_MODEL', 'openai/gpt-4o-mini')

# Recommended
self.model = model or os.getenv('OPENROUTER_MODEL', 'anthropic/claude-3-haiku')
```

### Change via Environment Variable

```bash
# In .env or environment
OPENROUTER_MODEL=anthropic/claude-3-haiku
```

### Test Different Models

You can test different models by changing `OPENROUTER_MODEL` and running a crawl:

```bash
# Test Claude Haiku
export OPENROUTER_MODEL=anthropic/claude-3-haiku
python -m pytest tests/test_normalizer.py

# Test Mistral Small
export OPENROUTER_MODEL=mistralai/mistral-small
python -m pytest tests/test_normalizer.py
```

## Cost Comparison (Per 1000 Normalizations)

| Model | Input Cost | Output Cost | Total (est) | Reliability |
|-------|-----------|-------------|-------------|-------------|
| gpt-4o-mini | $0.15 | $0.60 | ~$0.75 | Good |
| claude-3-haiku | $0.25 | $1.25 | ~$1.50 | Excellent |
| mistral-small | $0.20 | $0.60 | ~$0.80 | Good |
| gpt-3.5-turbo | $0.50 | $1.50 | ~$2.00 | Fair |
| llama-3.1-8b | $0.10 | $0.10 | ~$0.20 | Fair |

**Note**: Costs are per 1M tokens. Actual costs depend on prompt size and response length.

## Final Recommendation

**Use Claude 3 Haiku** for production. The slightly higher cost is worth it for:
- Better reliability (fewer failed normalizations)
- More consistent JSON output
- Better instruction following
- Faster response times

The cost difference is minimal (~$0.05 per 1000 normalizations), but the reliability improvement is significant.

