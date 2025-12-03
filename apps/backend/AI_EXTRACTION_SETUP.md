# AI-Powered Extraction Setup

## Overview

The new AI-powered extraction system uses LLM (Large Language Model) to extract job data from HTML. This is **much more reliable** than rule-based extraction because:

1. **Understands context** - AI can identify job listings even when HTML structure is unclear
2. **Handles different sites** - Works across different site structures automatically
3. **Extracts clean data** - Removes contamination (e.g., "Apply by" from titles)
4. **Less brittle** - No hardcoded rules that break when sites change

## Setup

### 1. Get OpenRouter API Key

1. Go to https://openrouter.ai/
2. Sign up/login
3. Get your API key from dashboard
4. Add credits (gpt-4o-mini is very cheap: ~$0.15 per 1M tokens)

### 2. Set Environment Variable

Add to your `.env` file or environment:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

Or set in your deployment platform (Vercel, etc.)

### 3. How It Works

The system automatically:
1. **Tries AI extraction first** (if API key is set)
2. **Falls back to rule-based** if AI fails or is unavailable
3. **No code changes needed** - just set the API key

## Cost Estimate

Using `gpt-4o-mini` (default, cost-effective model):
- **Per job extraction**: ~500-1000 tokens
- **Cost**: ~$0.000075 - $0.00015 per job
- **100 jobs**: ~$0.0075 - $0.015 (less than 2 cents!)
- **1000 jobs/day**: ~$0.75 - $1.50/day = ~$22-45/month

**Very affordable!** And much more reliable than spending hours fixing rule-based extraction.

## Benefits

✅ **Works immediately** - No need to write site-specific code  
✅ **Handles changes** - Adapts when sites update their HTML  
✅ **Clean data** - AI understands to remove metadata from titles  
✅ **Multiple sites** - Same code works for UNDP, MSF, BRAC, etc.  
✅ **Cost-effective** - Less than $50/month for 1000 jobs/day  

## Testing

Once you set the API key, the crawler will automatically use AI extraction. You'll see logs like:

```
AI extractor initialized
Attempting AI extraction for UNDP...
AI found 50 potential job containers
AI extracted 45 jobs
```

If AI extraction fails, it automatically falls back to rule-based extraction.

## Troubleshooting

**No API key set?**
- System automatically uses rule-based extraction (current behavior)

**AI extraction returning no jobs?**
- Check API key is correct
- Check you have credits in OpenRouter account
- System will fallback to rule-based automatically

**Cost concerns?**
- Using `gpt-4o-mini` is very cheap
- Can limit to specific sources if needed
- Can disable AI per-source if needed

