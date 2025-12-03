# Where to Add OpenRouter API Key for Deployment

## Answer: **Render (Backend) Only** ✅

The OpenRouter API key is **only needed in Render** (where your backend runs), **NOT in Vercel** (where your frontend runs).

## Why?

- **Backend (Render)**: The AI extraction code runs here (Python/FastAPI)
- **Frontend (Vercel)**: Just makes API calls to backend - doesn't need the key

## Setup Instructions

### ✅ Render (Backend) - REQUIRED

1. Go to your Render dashboard
2. Select your **backend service** (Python/FastAPI)
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `OPENROUTER_API_KEY`
   - **Value**: `sk-or-v1-your-actual-api-key-here`
6. Click **Save Changes**
7. **Redeploy** your service (or it will auto-redeploy)

### ❌ Vercel (Frontend) - NOT NEEDED

- **Don't add it here** - the frontend doesn't use it
- The frontend just calls your backend API
- The backend handles all AI extraction

## Architecture Flow

```
User clicks "Crawl" in Frontend (Vercel)
    ↓
Frontend calls: POST /api/admin/crawl-v2/run
    ↓
Backend (Render) receives request
    ↓
Backend uses OPENROUTER_API_KEY (from Render env vars)
    ↓
Backend calls OpenRouter API for AI extraction
    ↓
Backend saves jobs to database
    ↓
Frontend shows results
```

## Verification

After adding the key in Render:

1. Check backend logs in Render dashboard
2. Look for: `"AI extractor initialized"` ✅
3. If you see: `"OPENROUTER_API_KEY not set - AI extraction disabled"` ❌
   - Key not set correctly
   - Check spelling: `OPENROUTER_API_KEY` (all caps, underscores)
   - Make sure you redeployed after adding

## Quick Checklist

- [ ] Get API key from https://openrouter.ai/
- [ ] Add to Render backend environment variables
- [ ] Redeploy backend service
- [ ] Check logs for "AI extractor initialized"
- [ ] Test a crawl - should use AI extraction

## Cost Note

- API key is free to get
- You only pay for usage (tokens)
- ~$0.75-1.50/day for 1000 jobs
- Very affordable!

