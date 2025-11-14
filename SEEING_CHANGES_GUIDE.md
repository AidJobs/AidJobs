# How to See Changes on Sources Page

## ✅ **Changes Are Committed**

The code has been updated with Apple design system. The changes are in:
- `apps/frontend/app/admin/sources/page.tsx`

## 🔄 **To See the Changes:**

### **Option 1: If Running Dev Server Locally**

1. **Stop the dev server** (Ctrl+C)
2. **Restart it:**
   ```bash
   cd apps/frontend
   npm run dev
   ```
3. **Hard refresh browser:**
   - Windows/Linux: `Ctrl + Shift + R` or `Ctrl + F5`
   - Mac: `Cmd + Shift + R`
4. **Clear browser cache** if needed

### **Option 2: If Using Vercel (Production)**

1. **Changes are already pushed to GitHub**
2. **Vercel will auto-deploy** (if connected to GitHub)
3. **Wait for deployment to complete** (check Vercel dashboard)
4. **Hard refresh browser** after deployment

### **Option 3: Force Rebuild**

If changes still don't appear:

1. **Clear Next.js cache:**
   ```bash
   cd apps/frontend
   rm -rf .next
   npm run dev
   ```

2. **Or rebuild:**
   ```bash
   cd apps/frontend
   npm run build
   npm run start
   ```

## 🎨 **What Should You See:**

### **Before (Old Design):**
- Large blue "Add Source" button
- `text-3xl` large heading
- Gray borders and backgrounds
- Large text buttons in table

### **After (Apple Design):**
- ✅ Small icon-only buttons (8x8) with tooltips
- ✅ Compact `text-title` heading (28px)
- ✅ Apple colors: `#1D1D1F`, `#86868B`, `#F5F5F7`, `#D2D2D7`
- ✅ Compact spacing (`p-4` instead of `p-8`)
- ✅ Status dots instead of badges
- ✅ Apple-style modals

## 🔍 **Quick Check:**

Open browser DevTools (F12) and check:
1. **Elements tab** → Find the `<h1>` with "Sources"
2. **Should see:** `class="text-title font-semibold text-[#1D1D1F]"`
3. **Not:** `class="text-3xl font-bold text-gray-900"`

## 🚨 **If Still Not Seeing Changes:**

1. **Check if you're on the right page:** `/admin/sources`
2. **Check browser console** for errors
3. **Verify file was saved:** Check `apps/frontend/app/admin/sources/page.tsx` line 526
4. **Try incognito/private window** to bypass cache

## 📝 **Verification:**

The changes are confirmed in the code:
- ✅ Line 526: `text-title font-semibold text-[#1D1D1F]`
- ✅ Line 530: Icon-only buttons with `bg-[#F5F5F7]`
- ✅ Line 595: Table header with Apple colors
- ✅ All old colors replaced with Apple design system

**The code is correct. You just need to refresh/rebuild to see it.**

