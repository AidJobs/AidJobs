# Playwright Setup Instructions

## Overview

Playwright is used for browser rendering of JavaScript-heavy job sites (Amnesty, Save the Children, etc.).

## Installation

### Local Development

1. **Install Python package** (already in requirements.txt):
   ```bash
   cd apps/backend
   pip install -r requirements.txt
   ```

2. **Install browser binaries**:
   ```bash
   playwright install chromium
   ```

### Production (Render)

#### Option 1: Add Build Command in Render Dashboard

In your Render service settings, add this as the **Build Command**:

```bash
pip install -r apps/backend/requirements.txt && playwright install chromium
```

Or if your build command already exists, append:
```bash
&& playwright install chromium
```

#### Option 2: Create build.sh Script

Create `apps/backend/build.sh`:

```bash
#!/bin/bash
set -e

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo "Installing Playwright browsers..."
playwright install chromium

echo "Build complete!"
```

Then set Render's Build Command to:
```bash
bash apps/backend/build.sh
```

#### Option 3: Add to Existing Build Process

If you have a build script, add this line:
```bash
playwright install chromium
```

## Verification

To verify Playwright is installed correctly:

```python
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        print("Playwright is working!")
        await browser.close()
```

## Important Notes

1. **Browser binaries are large** (~300MB) - this will increase deployment time
2. **Render build time** - First deployment with Playwright may take 5-10 minutes
3. **Optional feature** - If Playwright isn't installed, the system gracefully falls back to HTTP fetching
4. **Memory usage** - Browser rendering uses more memory, ensure your Render instance has sufficient resources

## Troubleshooting

### "playwright: command not found"
- Make sure `pip install playwright` completed successfully
- Check that Playwright is in your requirements.txt

### "Browser not found"
- Run `playwright install chromium` after installing the Python package
- On Render, ensure the build command includes browser installation

### Build fails on Render
- Check Render logs for specific error
- Ensure build command includes both pip install and playwright install
- Verify Render instance has enough disk space (~500MB for browsers)

## Alternative: Skip Browser Rendering

If you don't want to use browser rendering:

1. Remove `playwright==1.48.0` from requirements.txt
2. The system will automatically fall back to HTTP fetching
3. Amnesty and Save the Children plugins will still work, but may extract fewer jobs

