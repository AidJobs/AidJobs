# Render Build Fix - Status 127 Error

## Problem
Status 127 means "command not found" - the `playwright` command isn't available during build.

## Solution
Use `python -m playwright` instead of just `playwright`.

## Updated Build Command

**Change your Build Command in Render from:**
```
pip install -r requirements.txt && playwright install chromium
```

**To:**
```
pip install -r requirements.txt && python -m playwright install chromium
```

The `python -m playwright` ensures Python can find the playwright module even if it's not in PATH.

## Steps to Fix

1. Go to Render Dashboard → Your Backend Service → Settings
2. Find "Build Command"
3. Change it to:
   ```
   pip install -r requirements.txt && python -m playwright install chromium
   ```
4. Click "Save Changes"
5. Wait for new deployment

## Alternative: Use Full Path

If that doesn't work, try:
```
pip install -r requirements.txt && python3 -m playwright install chromium
```

Or if you're using a virtual environment:
```
pip install -r requirements.txt && .venv/bin/python -m playwright install chromium
```

