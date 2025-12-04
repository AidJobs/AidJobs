# Render Setup Instructions - Step by Step

## ✅ Local Setup Complete!

Playwright is now installed on your computer. Now let's set it up on Render (your production server).

---

## Part 2: Render Setup (Production Server)

### Step 1: Log into Render Dashboard

1. Open your web browser
2. Go to: **https://dashboard.render.com**
3. Log in with your Render account

### Step 2: Find Your Backend Service

1. You should see a list of your services
2. Click on your **backend service** (the one running your Python/FastAPI app)
   - It might be named something like "aidjobs-backend" or "backend"

### Step 3: Go to Settings

1. Look at the top menu or left sidebar
2. Click on **"Settings"** tab
3. Scroll down until you see **"Build Command"** section

### Step 4: Update Build Command

**What you're looking for:**
- A text box labeled **"Build Command"**
- It probably currently says something like:
  ```
  pip install -r apps/backend/requirements.txt
  ```
  OR
  ```
  pip install -r requirements.txt
  ```

**What to change it to:**

**Option A** (if your current command is `pip install -r apps/backend/requirements.txt`):
```
pip install -r apps/backend/requirements.txt && playwright install chromium
```

**Option B** (if your current command is `pip install -r requirements.txt`):
```
pip install -r requirements.txt && playwright install chromium
```

**How to do it:**
1. Click inside the "Build Command" text box
2. Add ` && playwright install chromium` at the end
3. Make sure there's a space before `&&`

**Example:**
- **Before**: `pip install -r apps/backend/requirements.txt`
- **After**: `pip install -r apps/backend/requirements.txt && playwright install chromium`

### Step 5: Save Changes

1. Scroll down and click the **"Save Changes"** button (usually at the bottom)
2. Render will automatically start a new deployment

### Step 6: Wait for Deployment

1. You'll see a deployment starting
2. **First time will take 5-10 minutes** (it's downloading the browser)
3. You can watch the progress in the "Logs" tab

### Step 7: Check if It Worked

1. Go to the **"Logs"** tab
2. Look for these messages:
   - ✅ "Installing playwright browsers..."
   - ✅ "Chromium downloaded successfully"
   - ✅ "Deployment successful"

If you see any errors, see the troubleshooting section below.

---

## Troubleshooting

### Problem: Build Command Not Found
- **Solution**: Make sure you're in the "Settings" tab, not "Environment" or "Logs"

### Problem: Build Fails with "playwright: command not found"
- **Solution**: Make sure your build command includes `pip install playwright` first:
  ```
  pip install -r apps/backend/requirements.txt && playwright install chromium
  ```
  The `requirements.txt` already has `playwright==1.48.0`, so `pip install` will install it.

### Problem: Build Takes Too Long
- **Solution**: This is normal! First deployment with Playwright takes 5-10 minutes because it downloads ~300MB of browser files. Subsequent deployments are faster.

### Problem: Out of Memory Error
- **Solution**: Your Render instance might need more memory. Consider upgrading to a plan with at least 512MB RAM.

### Problem: Can't Find Settings Tab
- **Solution**: 
  1. Make sure you clicked on your backend service (not frontend)
  2. Look for tabs: "Overview", "Logs", "Settings", "Environment"
  3. Click "Settings"

---

## What This Does

- **Local**: ✅ Already done! You can now test browser rendering on your computer
- **Render**: Once set up, your production server can render JavaScript-heavy sites like:
  - Amnesty International
  - Save the Children
  - Other sites that require JavaScript

---

## Quick Reference

**Current Build Command** (what you'll see):
```
pip install -r apps/backend/requirements.txt
```

**New Build Command** (what to change it to):
```
pip install -r apps/backend/requirements.txt && playwright install chromium
```

**Important**: Just add ` && playwright install chromium` at the end!

---

## Need Help?

If you get stuck:
1. Take a screenshot of the error
2. Check the Render logs tab for specific error messages
3. Make sure you added the command correctly (with spaces around `&&`)

