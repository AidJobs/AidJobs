# Fix: Sources Page Still Showing Old Design

## ✅ **Code is Correct**
The file `apps/frontend/app/admin/sources/page.tsx` has the Apple design system classes:
- ✅ `text-title` (line 526)
- ✅ `text-caption` (line 527)
- ✅ `bg-[#F5F5F7]` (line 530)
- ✅ Icon-only buttons (lines 530-550)

## 🔧 **Fix Steps (Choose Your Scenario):**

### **Scenario A: Viewing on Vercel (Production) - https://www.aidjobs.app/admin/sources**

1. **Check Vercel Deployment:**
   - Go to Vercel Dashboard
   - Check if latest commit `73027a5` is deployed
   - Wait for deployment to complete (green checkmark)

2. **Force Browser Refresh:**
   - Open DevTools (F12)
   - Right-click the refresh button
   - Select "Empty Cache and Hard Reload"
   - OR: `Ctrl + Shift + Delete` → Clear cached images and files → Last hour

3. **Try Incognito Window:**
   - Open new incognito/private window
   - Navigate to `https://www.aidjobs.app/admin/sources`

### **Scenario B: Running Locally (http://localhost:5000/admin/sources)**

1. **Stop Dev Server:**
   - Press `Ctrl + C` in the terminal where `npm run dev` is running

2. **Clear All Caches:**
   ```powershell
   cd apps/frontend
   Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
   ```

3. **Restart Dev Server:**
   ```powershell
   npm run dev
   ```

4. **Hard Refresh Browser:**
   - Press `Ctrl + Shift + R`
   - OR: Open DevTools (F12) → Right-click refresh → "Empty Cache and Hard Reload"

### **Scenario C: Still Not Working**

**Verify the changes are actually in the file:**

1. Open `apps/frontend/app/admin/sources/page.tsx`
2. Go to line 526
3. Should see: `className="text-title font-semibold text-[#1D1D1F] mb-1"`
4. Should NOT see: `className="text-3xl font-bold text-gray-900"`

**Check Browser DevTools:**

1. Open DevTools (F12)
2. Go to Elements/Inspector tab
3. Find the `<h1>` element with "Sources"
4. Check the `class` attribute:
   - ✅ Should be: `text-title font-semibold text-[#1D1D1F]`
   - ❌ If it's: `text-3xl font-bold text-gray-900` → Browser cache issue

**Check Network Tab:**

1. Open DevTools (F12)
2. Go to Network tab
3. Check "Disable cache" checkbox
4. Refresh page (F5)
5. Look for `page.tsx` or `_app.js` in the network list
6. Check if it's loading from cache (Status: 304) or fresh (Status: 200)

## 🎯 **What You Should See After Fix:**

### **Before (Old):**
- Large blue "Add Source" button
- `text-3xl` heading
- Gray borders (`border-gray-200`)
- Large text buttons in table

### **After (New - Apple Design):**
- ✅ Small icon-only buttons (8x8) with tooltips
- ✅ Compact `text-title` heading (28px)
- ✅ Apple colors: `#1D1D1F`, `#86868B`, `#F5F5F7`
- ✅ Compact spacing (`p-4`)
- ✅ Status dots instead of badges

## 🚨 **If Still Not Working:**

1. **Check if you're on the right page:**
   - URL should be: `/admin/sources`
   - Not: `/admin` or `/admin/dashboard`

2. **Check browser console for errors:**
   - Open DevTools (F12) → Console tab
   - Look for red errors

3. **Verify Tailwind is working:**
   - In DevTools, check if `text-title` class exists
   - If not, Tailwind might not be rebuilding

4. **Try a different browser:**
   - Chrome → Edge
   - Edge → Chrome
   - Or use incognito mode

## 📝 **Quick Test:**

Run this in browser console (F12 → Console):
```javascript
document.querySelector('h1').className
```

Should return something like: `"text-title font-semibold text-[#1D1D1F] mb-1"`

If it returns old classes, the browser is definitely caching the old version.


