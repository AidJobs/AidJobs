# Sources Page - Status Check

## ✅ **FUNCTIONALITY STATUS**

### **Is it Functional?**
**YES** - All features are implemented and should work:

1. ✅ **Presets UI** - Implemented
   - Preset selector appears in Add Source modal
   - Fetches presets from backend
   - Pre-fills form when selected

2. ✅ **Test Results Modal** - Implemented
   - Shows detailed test results
   - Displays all backend data

3. ✅ **Simulate Results Modal** - Implemented
   - Shows sample jobs
   - Displays all backend data

4. ✅ **Export/Import** - Implemented
   - Export button in table
   - Import button in header
   - File upload works

5. ✅ **Consecutive Failures** - Implemented
   - Column added to table
   - Backend query updated

---

## 📋 **HOW TO ADD RELIEFWEB (OR SIMILAR API)**

### **Step-by-Step Guide:**

1. **Click "Add Source" button** (top right)

2. **In the modal, look for "Use Preset (Optional)" section** at the top

3. **Select "ReliefWeb Jobs - ReliefWeb Jobs API - UN and humanitarian organization jobs"** from dropdown

4. **Form will auto-fill with:**
   - Organization Name: "ReliefWeb"
   - Source Type: "api" (automatically set)
   - Organization Type: "UN"
   - Crawl Frequency: 1 day
   - Parser Hint: Full JSON v1 schema (pre-filled)

5. **Enter the Careers URL:**
   - For ReliefWeb, you can use: `https://api.reliefweb.int/v1/jobs`
   - Or leave it as the base URL from the schema

6. **Review the pre-filled JSON schema** in the Parser Hint textarea
   - It includes all the mapping, pagination, transforms, etc.
   - You can modify if needed

7. **Click "Create Source"**

8. **The source will be created and queued for immediate crawl**

### **What the Preset Includes:**
- ✅ Complete API configuration
- ✅ Field mappings (title, description, org_name, location, etc.)
- ✅ Pagination setup (offset-based, 1000 per page)
- ✅ Incremental fetching (since parameter)
- ✅ Data transforms (join, first, etc.)
- ✅ Throttling configuration
- ✅ Retry configuration

### **Available Presets:**
1. **ReliefWeb Jobs** - UN and humanitarian organization jobs
2. **JSONPlaceholder (Test)** - Public test API for development

---

## 🎨 **DESIGN SYSTEM STATUS**

### **Does it Follow Dashboard Design System?**
**NO** ❌ - The Sources page does NOT follow the Apple design system used in the dashboard.

### **Current Design (Sources Page):**
- ❌ `text-3xl font-bold text-gray-900` (old typography)
- ❌ `bg-blue-600` (blue buttons - not Apple style)
- ❌ `border-gray-200` (old borders)
- ❌ `p-8` (large padding - not compact)
- ❌ `text-gray-600` (old colors)
- ❌ Large text buttons in table
- ❌ Standard table styling

### **Dashboard Design (Apple Style):**
- ✅ `text-title` (28px, Apple typography scale)
- ✅ `text-caption` (13px, Apple typography scale)
- ✅ `text-[#1D1D1F]` (Apple dark gray)
- ✅ `text-[#86868B]` (Apple medium gray)
- ✅ `bg-[#F5F5F7]` (Apple light gray)
- ✅ `border-[#D2D2D7]` (Apple border color)
- ✅ `p-4` (compact spacing)
- ✅ Icon-only buttons with tooltips
- ✅ Subtle shadows
- ✅ Monochromatic color scheme

### **Design Inconsistencies:**

| Element | Sources Page | Dashboard | Match? |
|---------|--------------|-----------|--------|
| **Page Title** | `text-3xl font-bold` | `text-title font-semibold` | ❌ |
| **Subtitle** | `text-gray-600` | `text-caption text-[#86868B]` | ❌ |
| **Primary Button** | `bg-blue-600` | Icon-only, `bg-[#F5F5F7]` | ❌ |
| **Padding** | `p-8` | `p-4` | ❌ |
| **Borders** | `border-gray-200` | `border-[#D2D2D7]` | ❌ |
| **Table Actions** | Large text buttons | Icon-only with tooltips | ❌ |
| **Status Badges** | Green/Red/Yellow | Apple colors | ❌ |
| **Modal Design** | Standard | Apple style | ❌ |

---

## 🔧 **WHAT NEEDS TO BE UPDATED**

To match the dashboard design system, the Sources page needs:

1. **Typography Updates:**
   - Change `text-3xl font-bold` → `text-title font-semibold`
   - Change `text-gray-600` → `text-caption text-[#86868B]`

2. **Color Updates:**
   - Change `bg-blue-600` → Apple primary colors or icon-only buttons
   - Change `border-gray-200` → `border-[#D2D2D7]`
   - Change `text-gray-900` → `text-[#1D1D1F]`
   - Change `text-gray-600` → `text-[#86868B]`

3. **Spacing Updates:**
   - Change `p-8` → `p-4`
   - Change `mb-6` → `mb-4`
   - Compact spacing throughout

4. **Button Updates:**
   - Convert action buttons to icon-only with tooltips
   - Use `bg-[#F5F5F7]` hover states
   - Match dashboard button style

5. **Table Updates:**
   - Apple-style table design
   - Better row hover effects
   - Compact row height

6. **Modal Updates:**
   - Apple-style modal design
   - Subtle shadows
   - Apple typography

7. **Status Indicators:**
   - Use Apple color system
   - Status dots instead of badges (optional)

---

## ✅ **SUMMARY**

### **Functionality:**
✅ **FULLY FUNCTIONAL** - All features work

### **How to Add ReliefWeb:**
1. Click "Add Source"
2. Select "ReliefWeb Jobs" from preset dropdown
3. Enter Careers URL
4. Click "Create Source"

### **Design System:**
❌ **NOT MATCHING** - Uses old design, not Apple design system

### **Recommendation:**
The page is **functionally complete** but needs **design system migration** to match the dashboard. Should I update it to use the Apple design system?

