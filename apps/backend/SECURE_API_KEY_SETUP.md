# Secure API Key Setup Guide

## Where to Add OpenRouter API Key

### ✅ Option 1: Backend `.env` File (Recommended for Local Development)

1. **Create or edit** `apps/backend/.env`:
   ```bash
   # Navigate to backend directory
   cd apps/backend
   
   # Create .env file (if it doesn't exist)
   touch .env
   ```

2. **Add your API key**:
   ```bash
   OPENROUTER_API_KEY=sk-or-v1-your-actual-api-key-here
   ```

3. **Verify it's gitignored**:
   - Check `.gitignore` includes `apps/backend/.env` ✅ (already done)
   - **NEVER commit this file to git**

### ✅ Option 2: Environment Variables (Production/Deployment)

#### For Vercel (Frontend/Backend):
1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Add:
   - **Name**: `OPENROUTER_API_KEY`
   - **Value**: `sk-or-v1-your-actual-api-key-here`
   - **Environment**: Production, Preview, Development (select all)
4. Redeploy

#### For Railway/Render/Other Platforms:
1. Go to your project settings
2. Find "Environment Variables" or "Secrets"
3. Add:
   - **Key**: `OPENROUTER_API_KEY`
   - **Value**: `sk-or-v1-your-actual-api-key-here`
4. Restart your application

### ✅ Option 3: System Environment Variables (Local)

**Windows (PowerShell):**
```powershell
# Set for current session
$env:OPENROUTER_API_KEY="sk-or-v1-your-actual-api-key-here"

# Set permanently (User-level)
[System.Environment]::SetEnvironmentVariable('OPENROUTER_API_KEY', 'sk-or-v1-your-actual-api-key-here', 'User')
```

**Linux/Mac:**
```bash
# Add to ~/.bashrc or ~/.zshrc
export OPENROUTER_API_KEY="sk-or-v1-your-actual-api-key-here"

# Reload
source ~/.bashrc  # or source ~/.zshrc
```

## Security Checklist

✅ **DO:**
- Use `.env` file (gitignored)
- Use environment variables in deployment platforms
- Keep API key secret
- Rotate key if exposed

❌ **DON'T:**
- Commit `.env` to git
- Hardcode in source code
- Share in chat/screenshots
- Commit to public repositories

## Verification

After setting the key, test it:

```python
# In Python (backend)
import os
api_key = os.getenv('OPENROUTER_API_KEY')
if api_key:
    print("✅ API key found (first 10 chars):", api_key[:10] + "...")
else:
    print("❌ API key not found")
```

## Current Status

- ✅ `.gitignore` already includes `apps/backend/.env`
- ✅ Backend code reads from `os.getenv('OPENROUTER_API_KEY')`
- ✅ System automatically falls back to rule-based if key not found

## Next Steps

1. Get API key from https://openrouter.ai/
2. Add to `apps/backend/.env` (local) or environment variables (production)
3. Restart backend server
4. Test a crawl - you'll see "AI extractor initialized" in logs

