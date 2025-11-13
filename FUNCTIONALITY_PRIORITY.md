# Functionality Priority - Missing UI Features

## 🎯 **RECOMMENDATION: Start with Sources Page**

**Why Sources First:**
- Most backend features are implemented
- Missing UI features are critical for usability
- Presets UI will make adding API sources much easier
- Test/Simulate results need better display

---

## 📋 **SOURCES PAGE - Missing UI Features (Backend Ready)**

### **Priority 1: Presets UI** ⚠️ **HIGH PRIORITY**
**Backend:** ✅ Ready (`GET /admin/presets/sources`)
**Frontend:** ❌ Missing
**Impact:** Makes adding API sources 10x easier

**What to add:**
- "Use Preset" button in Add Source modal
- Preset dropdown/selector
- Pre-fill form with preset data
- Available presets: ReliefWeb Jobs, JSONPlaceholder

**Estimated Time:** 1-2 hours

---

### **Priority 2: Test Results Display** ⚠️ **MEDIUM PRIORITY**
**Backend:** ✅ Returns detailed data (count, first_ids, headers_sanitized, message)
**Frontend:** ❌ Only shows toast

**What backend returns:**
```json
{
  "ok": true,
  "status": 200,
  "host": "api.example.com",
  "count": 123,
  "first_ids": ["id1", "id2", ...],
  "headers_sanitized": {...},
  "message": "Successfully fetched 123 jobs"
}
```

**What to add:**
- Results modal/drawer
- Display: status code, host, job count, first 5 job IDs
- Show sanitized headers
- Copy-to-clipboard for results
- Error details with suggestions

**Estimated Time:** 1-2 hours

---

### **Priority 3: Simulate Results Display** ⚠️ **MEDIUM PRIORITY**
**Backend:** ✅ Returns detailed data (count, sample jobs)
**Frontend:** ❌ Only shows toast, logs to console

**What backend returns:**
```json
{
  "ok": true,
  "count": 123,
  "sample": [
    { "id": "...", "title": "...", ... },
    { "id": "...", "title": "...", ... },
    { "id": "...", "title": "...", ... }
  ]
}
```

**What to add:**
- Results modal/drawer
- Display job count
- Show first 3 sample jobs in formatted view
- Show field mappings
- Copy-to-clipboard for sample data
- Error details with categories

**Estimated Time:** 1-2 hours

---

### **Priority 4: Export/Import UI** ⚠️ **MEDIUM PRIORITY**
**Backend:** ✅ Ready (`GET /admin/sources/{id}/export`, `POST /admin/sources/import`)
**Frontend:** ❌ Missing

**What to add:**
- Export button in table row (download JSON)
- Import button in header (upload JSON file)
- File upload input
- Validation feedback
- Success/error messages

**Estimated Time:** 1-2 hours

---

### **Priority 5: Consecutive Failures Display** ⚠️ **MEDIUM PRIORITY**
**Backend:** ✅ Field exists in database
**Frontend:** ❌ Not displayed

**What to add:**
- Add column to table: "Failures"
- Show consecutive_failures count
- Show consecutive_nochange count
- Warning indicator when failures >= 5
- Auto-pause status indicator

**Estimated Time:** 30 minutes

---

## 📊 **OTHER MENU ITEMS - Quick Check**

### **Crawler Page** (`/admin/crawl`)
**Status:** Need to check what's missing
**Next:** Check after Sources

### **Find & Earn Page** (`/admin/find-earn`)
**Status:** Need to check what's missing
**Next:** Check after Sources

### **Taxonomy Page** (`/admin/taxonomy`)
**Status:** Need to check what's missing
**Next:** Check after Sources

### **Setup Page** (`/admin/setup`)
**Status:** Need to check what's missing
**Next:** Check after Sources

---

## 🎯 **RECOMMENDED ORDER**

### **Step 1: Sources Page - Presets UI** (1-2 hours)
**Why First:** Makes adding API sources much easier
**Impact:** High - Users can quickly add common API sources

### **Step 2: Sources Page - Test Results Display** (1-2 hours)
**Why Second:** Better debugging experience
**Impact:** Medium - Users can see detailed test results

### **Step 3: Sources Page - Simulate Results Display** (1-2 hours)
**Why Third:** Better debugging experience
**Impact:** Medium - Users can see sample jobs before adding source

### **Step 4: Sources Page - Export/Import UI** (1-2 hours)
**Why Fourth:** Backup and sharing functionality
**Impact:** Medium - Users can backup/share configurations

### **Step 5: Sources Page - Consecutive Failures Display** (30 min)
**Why Fifth:** Monitoring functionality
**Impact:** Medium - Users can monitor source health

### **Step 6: Check Other Menu Items**
**After Sources is complete, check:**
- Crawler page
- Find & Earn page
- Taxonomy page
- Setup page

---

## ✅ **WHAT'S ALREADY WORKING IN SOURCES**

- ✅ List sources (pagination, filtering, search)
- ✅ Create source
- ✅ Update source
- ✅ Delete source
- ✅ Toggle status (pause/resume)
- ✅ Test source (backend works, UI shows toast)
- ✅ Simulate extract (backend works, UI shows toast)
- ✅ Run now (triggers crawl)
- ✅ API source support (JSON v1 schema)

---

## 🚀 **START HERE: Presets UI**

**This is the most impactful missing feature.**

**What it does:**
- Lets users select a preset (e.g., "ReliefWeb Jobs")
- Pre-fills the form with preset configuration
- Makes adding API sources much easier

**Implementation:**
1. Add "Use Preset" button in Add Source modal
2. Fetch presets from `/api/admin/presets/sources`
3. Show preset selector/dropdown
4. Pre-fill form when preset selected
5. Keep existing manual form as fallback

**Time:** 1-2 hours
**Priority:** HIGH

---

## 📝 **SUMMARY**

**Recommendation:** Start with **Sources Page - Presets UI**

**Reasons:**
1. Backend is ready
2. High impact (makes API sources easy to add)
3. Quick to implement (1-2 hours)
4. One feature at a time (as requested)

**After Presets:**
- Test Results Display
- Simulate Results Display
- Export/Import UI
- Consecutive Failures Display

**Then move to other menu items** (Crawler, Find & Earn, etc.)

---

**Ready to implement Presets UI for Sources page?**

