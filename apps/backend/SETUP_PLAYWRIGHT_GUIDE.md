# Playwright Setup Guide - Step by Step

This guide will help you install Playwright for browser rendering on both your local machine and Render.

## Part 1: Local Setup (Your Computer)

### Step 1: Open Terminal/Command Prompt

- **Windows**: Press `Win + R`, type `cmd`, press Enter
- **Mac/Linux**: Open Terminal app

### Step 2: Navigate to Backend Folder

Type these commands one by one (press Enter after each):

```bash
cd "C:\Users\DELL\Documents\AidJobs App\AidJobsGit"
cd apps\backend
```

**Note**: If your folder path is different, adjust the first command to match your actual folder location.

### Step 3: Install Python Package

```bash
pip install playwright
```

Wait for it to finish (may take 1-2 minutes).

### Step 4: Install Browser Binaries

```bash
playwright install chromium
```

This will download Chromium browser (~300MB). Wait for it to finish (may take 3-5 minutes).

### Step 5: Verify Installation

Test if it works:

```bash
python -c "from playwright.async_api import async_playwright; print('Playwright installed successfully!')"
```

If you see "Playwright installed successfully!", you're done with local setup!

---

## Part 2: Render Setup (Production)

### Step 1: Log into Render

1. Go to https://dashboard.render.com
2. Log in to your account

### Step 2: Find Your Backend Service

1. Click on your backend service (the one running your Python/FastAPI app)
2. You should see the service dashboard

### Step 3: Go to Settings

1. Click on **"Settings"** tab (usually in the left sidebar or top menu)
2. Scroll down to find **"Build Command"** section

### Step 4: Update Build Command

**Current Build Command** (probably something like):
```
pip install -r apps/backend/requirements.txt
```

**New Build Command** (add `&& playwright install chromium` at the end):
```
pip install -r apps/backend/requirements.txt && playwright install chromium
```

**OR** if your build command is different, just add `&& playwright install chromium` at the end.

**Example**:
- If current is: `pip install -r requirements.txt`
- Change to: `pip install -r requirements.txt && playwright install chromium`

### Step 5: Save and Deploy

1. Click **"Save Changes"** button
2. Render will automatically start a new deployment
3. Wait for deployment to complete (first time may take 5-10 minutes because it downloads browsers)

### Step 6: Check Deployment Logs

1. Go to **"Logs"** tab in Render
2. Look for messages like:
   - "Installing playwright browsers..."
   - "Playwright installation complete"
   - If you see errors, check the troubleshooting section below

---

## Troubleshooting

### Local Setup Issues

**Problem**: `pip` command not found
- **Solution**: Use `pip3` instead of `pip`, or `python -m pip install playwright`

**Problem**: `playwright` command not found after installing
- **Solution**: Make sure you're in the correct folder (`apps/backend`) and try:
  ```bash
  python -m playwright install chromium
  ```

**Problem**: Installation is very slow
- **Solution**: This is normal - browser binaries are large (~300MB). Just wait.

### Render Setup Issues

**Problem**: Build fails with "playwright: command not found"
- **Solution**: Make sure the build command includes `pip install playwright` first:
  ```
  pip install -r apps/backend/requirements.txt && playwright install chromium
  ```

**Problem**: Build takes too long
- **Solution**: First deployment with Playwright takes 5-10 minutes. This is normal. Subsequent deployments are faster.

**Problem**: Out of memory errors
- **Solution**: Upgrade your Render instance to a plan with more memory (at least 512MB recommended)

---

## What This Does

- **Local**: Allows you to test browser rendering on your computer
- **Render**: Enables browser rendering in production for sites like Amnesty and Save the Children

## Optional: Test It Works

After setup, you can test by running a crawl for:
- Amnesty International: https://careers.amnesty.org/jobs/vacancy/find/results/
- Save the Children: https://recruiting.ultipro.com/SAV1002STCF/JobBoard/...

If Playwright is working, these sites should extract jobs. If not installed, they'll fall back to HTTP fetching (may extract fewer jobs).

---

## Need Help?

If you get stuck:
1. Check the error message carefully
2. Look at Render logs for specific errors
3. Make sure you're in the correct folder (apps/backend)
4. Try the troubleshooting steps above

